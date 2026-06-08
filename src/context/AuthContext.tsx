import { createContext, useEffect, useRef, useState, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'
import { ADMIN_EMAIL } from '../lib/constants'

interface AuthContextValue {
  session:             Session | null
  profile:             Profile | null
  loading:             boolean
  isPasswordRecovery:  boolean
  clearPasswordRecovery: () => void
  signOut:             () => Promise<void>
  refreshProfile:      () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue>({
  session:               null,
  profile:               null,
  loading:               true,
  isPasswordRecovery:    false,
  clearPasswordRecovery: () => {},
  signOut:               async () => {},
  refreshProfile:        async () => {},
})

// Read the URL hash synchronously — before any async auth event fires.
// Supabase appends #access_token=...&type=recovery when the user clicks
// a password-reset link, so we can detect it instantly on page load.
function checkUrlForRecovery(): boolean {
  try {
    const hash = window.location.hash.slice(1)       // strip leading #
    const params = new URLSearchParams(hash)
    if (params.get('type') === 'recovery') return true
    // Supabase v2 PKCE flow may use query string instead of hash
    const query = new URLSearchParams(window.location.search)
    return query.get('type') === 'recovery'
  } catch {
    return false
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session,            setSession]            = useState<Session | null>(null)
  const [profile,            setProfile]            = useState<Profile | null>(null)
  const recoveryOnLoad = checkUrlForRecovery()
  // If the page loaded with a recovery URL, skip the loading spinner entirely —
  // we already know what to render.
  const [loading,            setLoading]            = useState(!recoveryOnLoad)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(recoveryOnLoad)
  const initialised = useRef(false)

  async function fetchProfile(userId: string, email?: string | null) {
    const isAdmin = email?.toLowerCase() === ADMIN_EMAIL?.toLowerCase()

    if (isAdmin) {
      // Admin never needs a DB round-trip — avoids hanging if project is paused
      setProfile({
        id: userId,
        full_name: 'Admin',
        phone_number: null,
        role: 'admin',
        team_lead_id: null,
        status: 'active',
        created_at: new Date().toISOString(),
      })
      // Upsert admin profile in background so the row exists for FK references
      supabase.from('profiles')
        .upsert({ id: userId, full_name: 'Admin', role: 'admin', status: 'active' }, { onConflict: 'id' })
        .then(() => {})
      return
    }

    // Non-admin: fetch with 5s timeout so loading never hangs
    const { data } = await Promise.race([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Profile fetch timed out')), 5000)
      ),
    ])
    setProfile(data ?? null)
  }

  async function refreshProfile() {
    if (!session) return
    await fetchProfile(session.user.id, session.user.email)
  }

  useEffect(() => {
    // Hard fallback — loading always clears after 5s even if auth hangs
    const timeout = setTimeout(() => setLoading(false), 5000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, s) => {
        if (_event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecovery(true)
          setSession(s)
          if (!initialised.current) { initialised.current = true; clearTimeout(timeout); setLoading(false) }
          return
        }
        setSession(s)
        try {
          if (s) {
            await fetchProfile(s.user.id, s.user.email)
          } else {
            setProfile(null)
          }
        } catch {
          // fetchProfile failed — loading still clears in finally
        } finally {
          if (!initialised.current) {
            initialised.current = true
            clearTimeout(timeout)
            setLoading(false)
          }
        }
      }
    )

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  function clearPasswordRecovery() {
    setIsPasswordRecovery(false)
    // Remove the recovery token from the URL so a page refresh doesn't
    // re-enter recovery mode after the password has been updated.
    if (window.location.hash.includes('type=recovery')) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, isPasswordRecovery, clearPasswordRecovery, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}
