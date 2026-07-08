// Lightweight in-memory rate limiter for client-side mutation throttling.
// Prevents accidental double-submits and rapid-fire API hammering.

interface BucketState {
  tokens:     number
  lastRefill: number
}

const buckets = new Map<string, BucketState>()

interface RateLimitOptions {
  key:            string   // unique identifier for the action
  maxTokens:      number   // max calls in the window
  refillEveryMs:  number   // window length in ms
}

export function checkRateLimit(opts: RateLimitOptions): boolean {
  const now    = Date.now()
  const bucket = buckets.get(opts.key) ?? { tokens: opts.maxTokens, lastRefill: now }

  // Refill proportionally to elapsed time
  const elapsed = now - bucket.lastRefill
  const refill  = (elapsed / opts.refillEveryMs) * opts.maxTokens
  const tokens  = Math.min(opts.maxTokens, bucket.tokens + refill)

  if (tokens < 1) {
    buckets.set(opts.key, { tokens, lastRefill: now })
    return false
  }

  buckets.set(opts.key, { tokens: tokens - 1, lastRefill: now })
  return true
}

// Convenience wrappers for common action types
export const RATE_LIMITS = {
  phoneAssign:   { maxTokens: 5,  refillEveryMs: 10_000 },  // 5 assigns per 10s
  phoneMutation: { maxTokens: 10, refillEveryMs: 10_000 },  // 10 mutations per 10s
  returnSubmit:  { maxTokens: 3,  refillEveryMs: 30_000 },  // 3 returns per 30s
  saleRecord:    { maxTokens: 5,  refillEveryMs: 10_000 },  // 5 sales per 10s
  notification:  { maxTokens: 20, refillEveryMs: 60_000 },  // 20 notifs per min
} as const
