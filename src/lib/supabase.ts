import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL     as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[Royal Success] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'Set these in .env (local) or Vercel → Project Settings → Environment Variables.',
  )
}

// Single Supabase client for the entire application.
//
// DO NOT add a custom global.fetch here. Supabase JS v2 uses navigator.locks
// to serialise token-refresh across browser tabs — only one tab calls
// /auth/v1/token at a time; others wait and read the result from localStorage.
// A custom fetch wrapper that replaces init.signal with its own AbortController
// silently drops the library's internal cancellation signal, breaking that
// coordination and causing competing tabs to consume each other's refresh tokens.
//
// Token-refresh timeouts are handled by the browser's own networking stack.
// Database-call timeouts are handled individually by withTimeout() in each hook.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession:     true,   // session lives in localStorage; shared across tabs
    autoRefreshToken:   true,   // Supabase refreshes the JWT automatically
    detectSessionInUrl: true,   // required for OAuth and magic-link flows
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
})
