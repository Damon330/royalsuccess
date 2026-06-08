import { Redis } from '@upstash/redis'

// Upstash REST Redis — credentials are safe to expose in the browser for
// this use case: the REST API is rate-limited per token and caching is
// non-sensitive. Set ALLOWED_ORIGINS in the Upstash console to your domain.

let _redis: Redis | null = null

function getRedis(): Redis | null {
  const url   = import.meta.env.VITE_UPSTASH_REDIS_REST_URL
  const token = import.meta.env.VITE_UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null   // cache is opt-in — gracefully disabled if not configured
  if (!_redis) _redis = new Redis({ url, token })
  return _redis
}

export async function getOrFetch<T>(
  key:        string,
  fetcher:    () => Promise<T>,
  ttlSeconds: number,
): Promise<T> {
  const redis = getRedis()
  if (!redis) return fetcher()
  try {
    const cached = await redis.get<T>(key)
    if (cached !== null && cached !== undefined) return cached
    const fresh = await fetcher()
    await redis.set(key, fresh, { ex: ttlSeconds })
    return fresh
  } catch (err) {
    console.warn('[cache] Redis error, falling back to DB:', err)
    return fetcher()
  }
}

export async function invalidateKeys(...keys: string[]): Promise<void> {
  const redis = getRedis()
  if (!redis || keys.length === 0) return
  try {
    await redis.del(...keys)
  } catch (err) {
    console.warn('[cache] Failed to invalidate keys:', err)
  }
}

// ── Cache key helpers ───────────────────────────────────────────────────────
export const CK = {
  inventoryAll:          () => 'inventory:all',
  agentsTeam:            (leadId: string) => `agents:team:${leadId}`,
  salesSummary:          (agentId: string, date: string) => `sales:summary:${agentId}:${date}`,
  activityFeedPage:      (userId: string, page: number) => `activity:feed:${userId}:page:${page}`,
  receipt:               (receiptId: string) => `receipt:${receiptId}`,
  notificationsUnread:   (userId: string) => `notifications:unread:${userId}`,
}
