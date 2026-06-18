// Vercel Edge Function — /api/sales-summary
// Returns sales summary for a given agentId + date (YYYY-MM-DD).
// Cache TTL: 120 s.  Query params: agentId, date.

import { createClient } from '@supabase/supabase-js'
import { Redis } from '@upstash/redis'

export const config = { runtime: 'edge' }

const SUPABASE_URL      = process.env.VITE_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!
const REDIS_URL         = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN       = process.env.UPSTASH_REDIS_REST_TOKEN

const CACHE_TTL = 120

export default async function handler(req: Request): Promise<Response> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const url     = new URL(req.url)
  const agentId = url.searchParams.get('agentId')
  const date    = url.searchParams.get('date')    // YYYY-MM-DD

  if (!agentId || !date) {
    return new Response(JSON.stringify({ error: 'agentId and date are required' }), { status: 400 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 })
  }

  const cacheKey = `sales:summary:${agentId}:${date}`

  if (REDIS_URL && REDIS_TOKEN) {
    try {
      const redis  = new Redis({ url: REDIS_URL, token: REDIS_TOKEN })
      const cached = await redis.get(cacheKey)
      if (cached) {
        return new Response(JSON.stringify(cached), {
          headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
        })
      }

      const startOf = `${date}T00:00:00Z`
      const endOf   = `${date}T23:59:59Z`

      const { data, error } = await supabase
        .from('sales')
        .select('id, agreed_price, payment_method')
        .eq('sold_by', agentId)
        .gte('sold_at', startOf)
        .lte('sold_at', endOf)

      if (error) throw error

      const summary = {
        date,
        agentId,
        count:       data?.length ?? 0,
        totalAmount: data?.reduce((s, r) => s + (r.agreed_price ?? 0), 0) ?? 0,
        byMethod:    (data ?? []).reduce((acc: Record<string, number>, r) => {
          const m = r.payment_method ?? 'UNKNOWN'
          acc[m] = (acc[m] ?? 0) + (r.agreed_price ?? 0)
          return acc
        }, {}),
      }

      await redis.set(cacheKey, summary, { ex: CACHE_TTL })
      return new Response(JSON.stringify(summary), {
        headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
      })
    } catch (e) {
      console.error('[api/sales-summary] Redis error:', e)
    }
  }

  // Fallback
  const { data, error } = await supabase
    .from('sales')
    .select('id, agreed_price, payment_method')
    .eq('sold_by', agentId)
    .gte('sold_at', `${date}T00:00:00Z`)
    .lte('sold_at', `${date}T23:59:59Z`)

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  const summary = {
    date, agentId,
    count:       data?.length ?? 0,
    totalAmount: data?.reduce((s, r) => s + (r.agreed_price ?? 0), 0) ?? 0,
  }
  return new Response(JSON.stringify(summary), { headers: { 'Content-Type': 'application/json' } })
}
