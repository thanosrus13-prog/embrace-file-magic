// Tiny in-memory TTL cache for read-heavy, user-scoped queries (profile history,
// transcript lists). Keeps repeated reads off the database without risking stale
// data for long: entries live for seconds and are invalidated on every write.
//
// Scoped to one server isolate; a cold isolate simply misses and reads the DB.

type Entry = { value: unknown; expiresAt: number }

const store = new Map<string, Entry>()

function sweep(now: number) {
  if (store.size < 2000) return
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key)
  }
}

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key)
  if (!entry) return undefined
  if (entry.expiresAt <= Date.now()) {
    store.delete(key)
    return undefined
  }
  return entry.value as T
}

export function cacheSet(key: string, value: unknown, ttlMs: number) {
  const now = Date.now()
  sweep(now)
  store.set(key, { value, expiresAt: now + ttlMs })
}

/** Invalidates every cached entry belonging to a user (called after writes). */
export function cacheInvalidatePrefix(prefix: string) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<{ value: T; hit: boolean }> {
  const existing = cacheGet<T>(key)
  if (existing !== undefined) return { value: existing, hit: true }
  const value = await load()
  cacheSet(key, value, ttlMs)
  return { value, hit: false }
}
