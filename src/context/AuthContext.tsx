import { createContext, useEffect, useRef, useState, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'
import { ADMIN_EMAIL } from '../lib/constants'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  session:               Session | null
  profile:               Profile | null
  loading:               boolean
  isPasswordRecovery:    boolean
  clearPasswordRecovery: () => void
  signOut:               () => Promise<void>
  refreshProfile:        () => Promise<void>
  updateProfileState:    (partial: Partial<Profile>) => void
}

export const AuthContext = createContext<AuthContextValue>({
  session:               null,
  profile:               null,
  loading:               true,
  isPasswordRecovery:    false,
  clearPasswordRecovery: () => {},
  signOut:               async () => {},
  refreshProfile:        async () => {},
  updateProfileState:    () => {},
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function checkUrlForRecovery(): boolean {
  try {
    const hash   = window.location.hash.slice(1)
    const params = new URLSearchParams(hash)
    if (params.get('type') === 'recovery') return true
    return new URLSearchParams(window.location.search).get('type') === 'recovery'
  } catch {
    return false
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session,            setSession]            = useState<Session | null>(null)
  const [profile,            setProfile]            = useState<Profile | null>(null)
  const recoveryOnLoad = checkUrlForRecovery()
  const [loading,            setLoading]            = useState(!recoveryOnLoad)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(recoveryOnLoad)
  const initialised = useRef(false)

  // ── Profile fetch ────────────────────────────────────────────────────────
  // Separated from auth state: profile is app data, not auth data.
  async function fetchProfile(userId: string, email?: string | null) {
    const isAdmin = email?.toLowerCase() === ADMIN_EMAIL?.toLowerCase()

    if (isAdmin) {
      const { data: existing } = await supabase
        .from('profiles').select('*').eq('id', userId).maybeSingle()

      if (!existing) {
        await supabase.from('profiles').insert({
          id: userId, full_name: 'Admin', role: 'admin', status: 'active',
        })
        const { data: fresh } = await supabase
          .from('profiles').select('*').eq('id', userId).maybeSingle()
        setProfile(fresh ?? {
          id: userId, full_name: 'Admin', phone_number: null,
          role: 'admin'  as const, team_lead_id: null,
          status: 'active' as const, created_at: new Date().toISOString(),
        })
      } else {
        if (existing.role !== 'admin' || existing.status !== 'active') {
          await supabase.from('profiles')
            .update({ role: 'admin', status: 'active' }).eq('id', userId)
        }
        setProfile({ ...existing, role: 'admin' as const, status: 'active' as const })
      }
      return
    }

    // Non-admin: 5 s guard so a paused/slow DB doesn't freeze the loading screen.
    // The user is still authenticated even if profile fetch times out.
    try {
      const { data } = await Promise.race([
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('profile fetch timed out')), 5_000)
        ),
      ])
      setProfile(data ?? null)
    } catch {
      setProfile(null)
    }
  }

  async function refreshProfile() {
    if (!session) return
    await fetchProfile(session.user.id, session.user.email)
  }

  // ── Auth listener — exactly one, mounted once ────────────────────────────
  //
  // Architecture notes:
  //
  //  • There is ONE onAuthStateChange subscription for the entire application.
  //    It is created here and nowhere else.
  //
  //  • We do NOT call refreshSession(), getSession(), or any Supabase auth
  //    method manually. Supabase JS v2 with autoRefreshToken:true handles all
  //    token refresh internally using navigator.locks to serialise concurrent
  //    tab access. Adding manual refresh calls races against that mechanism and
  //    consumes refresh tokens out of turn, causing other tabs to receive HTTP
  //    400 (invalid grant) and emit SIGNED_OUT.
  //
  //  • We do NOT wipe localStorage automatically. signOut({scope:'local'})
  //    broadcasts a storage-event to every open tab, which all immediately
  //    emit SIGNED_OUT. One tab deciding its refresh was "too slow" should not
  //    eject every other tab.
  //
  //  • The initTimeout is a non-destructive safety valve: after 10 s it clears
  //    the loading spinner so the user sees the login page rather than a
  //    frozen spinner. It does NOT touch the session or localStorage — if
  //    Supabase is still refreshing in the background it will complete normally.
  useEffect(() => {
    const initTimeout = setTimeout(() => {
      if (!initialised.current) {
        initialised.current = true
        setLoading(false)
      }
    }, 10_000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, s) => {

        if (_event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecovery(true)
          setSession(s)
          if (!initialised.current) {
            initialised.current = true
            clearTimeout(initTimeout)
            setLoading(false)
          }
          return
        }

        setSession(s)

        try {
          if (s) {
            try { sessionStorage.setItem('rs-uid', s.user.id) } catch { /* ignore */ }
            await fetchProfile(s.user.id, s.user.email)
          } else {
            try { sessionStorage.removeItem('rs-uid') } catch { /* ignore */ }
            setProfile(null)
          }
        } catch {
          // fetchProfile failure is non-critical — user is still authenticated.
        } finally {
          if (!initialised.current) {
            initialised.current = true
            clearTimeout(initTimeout)
            setLoading(false)
          }
        }
      }
    )

    return () => {
      subscription.unsubscribe()
      clearTimeout(initTimeout)
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ───────────────────────────────────────────────────────────────

  function clearPasswordRecovery() {
    setIsPasswordRecovery(false)
    if (window.location.hash.includes('type=recovery')) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }

  async function signOut() {
    // supabase.auth.signOut() with default scope:'global' calls the server,
    // invalidates the refresh token, and clears localStorage. onAuthStateChange
    // fires SIGNED_OUT in this tab; other tabs detect the localStorage change
    // via the storage event and also emit SIGNED_OUT — all tabs cleanly exit.
    await supabase.auth.signOut()
    setProfile(null)
  }

  function updateProfileState(partial: Partial<Profile>) {
    setProfile((prev) => (prev ? { ...prev, ...partial } : prev))
  }

  return (
    <AuthContext.Provider value={{
      session, profile, loading, isPasswordRecovery,
      clearPasswordRecovery, signOut, refreshProfile, updateProfileState,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
