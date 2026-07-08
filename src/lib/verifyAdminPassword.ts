import { supabaseUrl, supabaseAnonKey } from './supabase'
import { ADMIN_EMAIL } from './constants'

const TIMEOUT_MS = 5_000

// Verifies the admin password by calling the Supabase Auth REST API directly
// with a raw fetch — intentionally bypassing the Supabase JS client so that
// no onAuthStateChange event fires and the active session is never replaced.
export async function verifyAdminPassword(password: string): Promise<boolean> {
  const controller = new AbortController()
  const tid = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
      },
      body:   JSON.stringify({ email: ADMIN_EMAIL, password }),
      signal: controller.signal,
    })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(tid)
  }
}
