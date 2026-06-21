import { supabaseUrl, supabaseAnonKey } from './supabase'
import { ADMIN_EMAIL } from './constants'

// Verifies the admin password by calling the Supabase Auth REST API directly
// with a raw fetch — intentionally bypassing the Supabase JS client so that
// no onAuthStateChange event fires and the active session is never replaced.
export async function verifyAdminPassword(password: string): Promise<boolean> {
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({ email: ADMIN_EMAIL, password }),
    })
    return res.ok
  } catch {
    return false
  }
}
