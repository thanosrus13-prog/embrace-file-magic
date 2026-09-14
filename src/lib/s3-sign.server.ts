/**
 * Direct AWS S3 SigV4 presigning using only WebCrypto + fetch.
 *
 * This keeps S3 access portable: it works on Lovable, Vercel, AWS Amplify or any
 * other host, because it depends on plain AWS credentials rather than the
 * Lovable connector gateway.
 *
 * Required environment variables (server-only):
 *   AWS_ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY
 *   AWS_S3_BUCKET
 *   AWS_REGION            (optional, defaults to us-east-1)
 */

const enc = new TextEncoder()

export type AwsS3Config = {
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  region: string
}

/** Returns direct AWS credentials when all required env vars are present. */
export function getAwsS3Config(): AwsS3Config | null {
  const accessKeyId = process.env['AWS_ACCESS_KEY_ID']
  const secretAccessKey = process.env['AWS_SECRET_ACCESS_KEY']
  const bucket = process.env['AWS_S3_BUCKET']
  if (!accessKeyId || !secretAccessKey || !bucket) return null
  return {
    accessKeyId,
    secretAccessKey,
    bucket,
    region: process.env['AWS_REGION'] || 'us-east-1',
  }
}

function rfc3986(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  )
}

function encodeKeyPath(objectKey: string): string {
  return objectKey.split('/').map(rfc3986).join('/')
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data))
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(data: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(data)))
}

/**
 * Builds a presigned S3 URL for GET / PUT / DELETE.
 * The caller (browser or server) can then use the URL directly.
 */
export async function presignS3Url(opts: {
  config: AwsS3Config
  method: 'GET' | 'PUT' | 'DELETE' | 'HEAD'
  objectKey: string
  expiresIn?: number
}): Promise<string> {
  const { config, method, objectKey } = opts
  const expiresIn = Math.min(Math.max(opts.expiresIn ?? 900, 60), 604800)

  const host = `${config.bucket}.s3.${config.region}.amazonaws.com`
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const scope = `${dateStamp}/${config.region}/s3/aws4_request`

  const query: Array<[string, string]> = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${config.accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expiresIn)],
    ['X-Amz-SignedHeaders', 'host'],
  ]
  query.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const canonicalQuery = query.map(([k, v]) => `${rfc3986(k)}=${rfc3986(v)}`).join('&')

  const canonicalUri = `/${encodeKeyPath(objectKey)}`
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n')

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join('\n')

  const kDate = await hmac(enc.encode(`AWS4${config.secretAccessKey}`), dateStamp)
  const kRegion = await hmac(kDate, config.region)
  const kService = await hmac(kRegion, 's3')
  const kSigning = await hmac(kService, 'aws4_request')
  const signature = hex(await hmac(kSigning, stringToSign))

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`
}

/** Deletes an object directly from S3 using presigned credentials. */
export async function deleteS3ObjectDirect(
  config: AwsS3Config,
  objectKey: string,
): Promise<{ error: string | null }> {
  const url = await presignS3Url({ config, method: 'DELETE', objectKey, expiresIn: 60 })
  const res = await fetch(url, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => '')
    console.error('Direct S3 delete failed', res.status, body)
    return { error: `S3 delete failed [${res.status}]` }
  }
  return { error: null }
}
