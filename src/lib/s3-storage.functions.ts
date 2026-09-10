import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { z } from 'zod'

const GATEWAY_URL = 'https://connector-gateway.lovable.dev'
const S3_BUCKET_PREFIX = 'postscript-bucket-2026-094275177807-us-east-1-an'

/**
 * Returns a pre-signed S3 upload URL. The client PUTs the file directly to S3.
 * Files 0–25 MB are routed to S3; larger files go to Supabase Storage.
 */
export const getS3UploadUrl = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fileName: string; contentType: string }) => {
    return z.object({
      fileName: z.string().min(1).max(255),
      contentType: z.string().min(1).max(100),
    }).parse(input)
  })
  .handler(async ({ data, context }) => {
    const LOVABLE_API_KEY = process.env['LOVABLE_API_KEY']
    const AWS_S3_API_KEY = process.env['AWS_S3_API_KEY']
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured')
    if (!AWS_S3_API_KEY) throw new Error('AWS_S3_API_KEY is not configured')

    // Build a user-scoped object key.
    const ext = (data.fileName.split('.').pop() || 'dat').toLowerCase()
    const objectKey = `${context.userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    const res = await fetch(
      `${GATEWAY_URL}/api/v1/sign_storage_url?provider=aws_s3&mode=write`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'X-Connection-Api-Key': AWS_S3_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ object_path: objectKey }),
      },
    )

    if (!res.ok) {
      const errorBody = await res.text().catch(() => 'unknown')
      console.error('S3 sign upload failed', res.status, errorBody)
      return { uploadUrl: null, objectKey: null, error: `S3 sign failed [${res.status}]` }
    }

    const body = (await res.json()) as { url: string; expires_in: number; method: string }
    return { uploadUrl: body.url, objectKey, error: null }
  })

/**
 * Returns a pre-signed S3 download URL. Used so AssemblyAI can fetch the audio.
 */
export const getS3DownloadUrl = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { objectKey: string }) => {
    return z.object({
      objectKey: z.string().min(1).max(500),
    }).parse(input)
  })
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env['LOVABLE_API_KEY']
    const AWS_S3_API_KEY = process.env['AWS_S3_API_KEY']
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured')
    if (!AWS_S3_API_KEY) throw new Error('AWS_S3_API_KEY is not configured')

    const res = await fetch(
      `${GATEWAY_URL}/api/v1/sign_storage_url?provider=aws_s3&mode=read`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'X-Connection-Api-Key': AWS_S3_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ object_path: data.objectKey }),
      },
    )

    if (!res.ok) {
      const errorBody = await res.text().catch(() => 'unknown')
      console.error('S3 sign download failed', res.status, errorBody)
      return { downloadUrl: null, error: `S3 sign failed [${res.status}]` }
    }

    const body = (await res.json()) as { url: string; expires_in: number }
    return { downloadUrl: body.url, error: null }
  })

/**
 * Deletes an object from S3. Called server-side during transcription deletion.
 */
export const deleteS3Object = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { objectKey: string }) => {
    return z.object({
      objectKey: z.string().min(1).max(500),
    }).parse(input)
  })
  .handler(async ({ data, context }) => {
    // Only allow deleting objects under the caller's own prefix.
    if (!data.objectKey.startsWith(`${context.userId}/`)) {
      return { error: 'Forbidden: object does not belong to caller' }
    }

    const LOVABLE_API_KEY = process.env['LOVABLE_API_KEY']
    const AWS_S3_API_KEY = process.env['AWS_S3_API_KEY']
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured')
    if (!AWS_S3_API_KEY) throw new Error('AWS_S3_API_KEY is not configured')

    const res = await fetch(
      `${GATEWAY_URL}/aws_s3/${encodeURIComponent(data.objectKey)}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'X-Connection-Api-Key': AWS_S3_API_KEY,
        },
      },
    )

    if (!res.ok && res.status !== 404) {
      const errorBody = await res.text().catch(() => 'unknown')
      console.error('S3 delete failed', res.status, errorBody)
      return { error: `S3 delete failed [${res.status}]` }
    }

    return { error: null }
  })

export { S3_BUCKET_PREFIX }
