// Server-only helpers shared by the AI proxy server functions:
// retries with exponential backoff, 429 handling, and a simple rate limiter.

export class ProxyError extends Error {
  status: number
  constructor(message: string, status = 500) {
    super(message)
    this.status = status
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  { retries = 3, baseDelayMs = 400, timeoutMs = 30_000 } = {},
): Promise<Response> {
  let lastError: unknown = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { ...init, signal: controller.signal })
      clearTimeout(timer)

      // Retry on rate limit / transient upstream failures.
      if (res.status === 429 || res.status >= 500) {
        if (attempt === retries) return res
        const retryAfter = Number(res.headers.get('retry-after'))
        const delay = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : baseDelayMs * 2 ** attempt + Math.random() * 200
        await sleep(Math.min(delay, 8_000))
        continue
      }

      return res
    } catch (err) {
      clearTimeout(timer)
      lastError = err
      if (attempt === retries) break
      await sleep(baseDelayMs * 2 ** attempt + Math.random() * 200)
    }
  }

  throw new ProxyError(
    lastError instanceof Error ? `Upstream request failed: ${lastError.message}` : 'Upstream request failed',
    502,
  )
}

// Lightweight in-memory rate limiter (per isolate). Keeps one caller from
// hammering the paid upstream APIs.
const buckets = new Map<string, { count: number; resetAt: number }>()

export function enforceRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return
  }

  if (bucket.count >= limit) {
    const seconds = Math.ceil((bucket.resetAt - now) / 1000)
    throw new ProxyError(`Rate limit reached. Try again in ${seconds}s.`, 429)
  }

  bucket.count++
}

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new ProxyError(`${name} is not configured on the server.`, 500)
  return value
}
