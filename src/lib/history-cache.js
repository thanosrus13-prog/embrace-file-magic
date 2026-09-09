// Short-lived client-side cache for the signed-in user's transcript history so
// navigating back to the profile page does not refetch on every visit.

const TTL_MS = 30_000
const store = new Map()

export function getCachedHistory(userId) {
  const entry = store.get(userId)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    store.delete(userId)
    return null
  }
  return entry.value
}

export function setCachedHistory(userId, value) {
  store.set(userId, { value, expiresAt: Date.now() + TTL_MS })
}

export function clearCachedHistory(userId) {
  if (userId) store.delete(userId)
  else store.clear()
}
