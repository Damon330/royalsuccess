// Vercel Edge Function — /api/inventory
// Returns all phones, with Redis caching (60 s TTL).
// Validates the Supabase JWT from the Authorization header.

import { createClient } from '@supabase/supabase-js'
import { Redis } from '@upstash/redis'

export const config = { runtime: 'edge' }

const SUPABASE_URL      = process.env.VITE_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!
const REDIS_URL         = process.env.VITE_UPSTASH_REDIS_REST_URL!
const REDIS_TOKEN       = process.env.VITE_UPSTASH_REDIS_REST_TOKEN!

const CACHE_KEY = 'inventory:all'
const CACHE_TTL = 60

export default async function handler(req: Request): Promise<Response> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  // Verify JWT by calling Supabase auth endpoint
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 })
  }

  // Try cache first
  if (REDIS_URL && REDIS_TOKEN) {
    try {
      const redis  = new Redis({ url: REDIS_URL, token: REDIS_TOKEN })
      const cached = await redis.get(CACHE_KEY)
      if (cached) {
        return new Response(JSON.stringify(cached), {
          headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
        })
      }

      const { data, error } = await supabase.from('phones').select('*').order('created_at', { ascending: false })
      if (error) throw error
      await redis.set(CACHE_KEY, data, { ex: CACHE_TTL })
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
      })
    } catch (e) {
      console.error('[api/inventory] Redis error:', e)
    }
  }

  // Fallback — no cache
  const { data, error } = await supabase.from('phones').select('*').order('created_at', { ascending: false })
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
}
