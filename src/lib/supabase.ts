import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  // Log clearly in production — do not throw here or the app shows a blank screen
  console.error('[Royal Success] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Set these in Vercel → Project Settings → Environment Variables.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
  global: {
    // Hard 12s timeout on every request so nothing hangs the app forever.
    // Chains with any signal the caller already set (e.g. Supabase Realtime internals).
    fetch: (url, opts = {}) => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(new Error('Request timed out after 12 s')), 12_000)

      // If the caller passed their own abort signal, forward its abort to ours
      const callerSignal = (opts as RequestInit).signal
      if (callerSignal && !callerSignal.aborted) {
        callerSignal.addEventListener('abort', () => controller.abort(callerSignal.reason), { once: true })
      }

      return fetch(url, { ...opts, signal: controller.signal })
        .finally(() => clearTimeout(timer))
    },
  },
})
