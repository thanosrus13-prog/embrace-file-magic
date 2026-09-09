// Per-user (and per-IP fallback) rate limiting for REST routes and server functions.
//
// Note: this is an in-memory fixed-window limiter scoped to a single server
// isolate. There is no shared/durable rate-limit primitive available, so limits
// are approximate under horizontal scaling — good enough to stop one client
// hammering the database or the paid upstream APIs, not a billing-grade quota.

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

// Periodic cheap eviction so the map cannot grow unbounded.
function sweep(now: number) {
  if (buckets.size < 5000) return
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export type RateLimitResult = {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
  retryAfterSeconds: number
}

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  sweep(now)

  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs
    buckets.set(key, { count: 1, resetAt })
    return { allowed: true, limit, remaining: limit - 1, resetAt, retryAfterSeconds: 0 }
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt: bucket.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    }
  }

  bucket.count++
  return {
    allowed: true,
    limit,
    remaining: limit - bucket.count,
    resetAt: bucket.resetAt,
    retryAfterSeconds: 0,
  }
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  }
}

/**
 * Applies a rate limit for an authenticated REST caller.
 * Returns a 429 Response when the caller is over budget, otherwise the headers
 * to merge into the successful response.
 */
export function enforceApiRateLimit(
  bucketName: string,
  identity: string,
  limit: number,
  windowMs: number,
): { response: Response } | { headers: Record<string, string> } {
  const result = checkRateLimit(`${bucketName}:${identity}`, limit, windowMs)
  const headers = rateLimitHeaders(result)

  if (!result.allowed) {
    return {
      response: Response.json(
        {
          error: 'Too many requests',
          retry_after_seconds: result.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { ...headers, 'Retry-After': String(result.retryAfterSeconds) },
        },
      ),
    }
  }

  return { headers }
}

/** Throwing variant for server functions. */
export function assertRateLimit(key: string, limit: number, windowMs: number) {
  const result = checkRateLimit(key, limit, windowMs)
  if (!result.allowed) {
    throw new Error(`Too many requests. Try again in ${result.retryAfterSeconds}s.`)
  }
}
