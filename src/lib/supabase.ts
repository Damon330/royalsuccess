import { createClient } from '@supabase/supabase-js'

export const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL     as string
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[Royal Success] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'Set these in .env (local) or Vercel → Project Settings → Environment Variables.',
  )
}

// ── Global fetch timeout ───────────────────────────────────────────────────────
// Supabase JS v2 uses navigator.locks to serialise token-refresh across tabs:
// only ONE tab calls /auth/v1/token at a time; others wait and read the result
// from localStorage. The critical requirement is that the internal AbortSignal
// Supabase passes via `init.signal` MUST NOT be replaced — that signal is how
// the library cancels waiting fetches when the lock is released.
//
// We use AbortSignal.any() to COMPOSE our timeout with Supabase's signal.
// Both are honoured: if Supabase aborts first, the fetch stops; if our
// 45 s timeout fires first, the fetch also stops. Neither replaces the other.
//
// AbortSignal.any() requires Chrome 116+ / Safari 17.4+ / Firefox 124+.
// For older browsers the fallback keeps only the original signal (no timeout),
// which is safe for navigator.locks and no worse than before.
//
// 45 s ceiling covers Supabase free-tier GoTrue cold-start (typically 20–30 s).
const GLOBAL_FETCH_TIMEOUT = 45_000

function timedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const tid = setTimeout(() => controller.abort(), GLOBAL_FETCH_TIMEOUT)

  let signal: AbortSignal
  if (!init?.signal) {
    signal = controller.signal
  } else if (typeof AbortSignal.any === 'function') {
    signal = AbortSignal.any([init.signal, controller.signal])
  } else {
    // Older browser: keep the original navigator.locks signal; skip timeout.
    signal = init.signal
  }

  return fetch(input, { ...init, signal }).finally(() => clearTimeout(tid))
}

// ── Supabase client (singleton) ────────────────────────────────────────────────
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession:     true,   // session stored in localStorage; shared across tabs
    autoRefreshToken:   true,   // Supabase handles all JWT refresh automatically
    detectSessionInUrl: true,   // required for OAuth and magic-link redirect flows
  },
  global: {
    fetch: timedFetch,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
})
