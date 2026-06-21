import { createContext, useEffect, useRef, useState, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { withTimeout } from '../lib/withTimeout'
import type { Profile } from '../types'
import { ADMIN_EMAIL } from '../lib/constants'
import { clearRestrictedModeSession } from '../lib/adminModules'

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

    // 8 s ceiling on all profile fetches. The global 45 s Supabase fetch
    // timeout is the hard outer limit, but we want the loading screen to clear
    // quickly even when the DB is still waking up. On timeout we fall back to
    // a minimal profile so the user can reach the app; data hooks refetch later.
    const PROFILE_TIMEOUT = 8_000

    if (isAdmin) {
      try {
        const { data: existing } = await withTimeout(
          supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
          PROFILE_TIMEOUT,
        )
        if (!existing) {
          await withTimeout(
            supabase.from('profiles').insert({
              id: userId, full_name: 'Admin', role: 'admin', status: 'active',
            }),
            PROFILE_TIMEOUT,
          )
          const { data: fresh } = await withTimeout(
            supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
            PROFILE_TIMEOUT,
          )
          setProfile(fresh ?? {
            id: userId, full_name: 'Admin', phone_number: null,
            role: 'admin'  as const, team_lead_id: null,
            status: 'active' as const, created_at: new Date().toISOString(),
          })
        } else {
          if (existing.role !== 'admin' || existing.status !== 'active') {
            await withTimeout(
              supabase.from('profiles')
                .update({ role: 'admin', status: 'active' }).eq('id', userId),
              PROFILE_TIMEOUT,
            )
          }
          setProfile({ ...existing, role: 'admin' as const, status: 'active' as const })
        }
      } catch {
        // DB still waking up — render with a minimal admin profile.
        // The dashboard hooks will re-fetch once the DB responds.
        setProfile({
          id: userId, full_name: 'Admin', phone_number: null,
          role: 'admin' as const, team_lead_id: null,
          status: 'active' as const, created_at: new Date().toISOString(),
        })
      }
      return
    }

    // Non-admin: same 8 s guard.
    try {
      const { data } = await withTimeout(
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        PROFILE_TIMEOUT,
      )
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
    // 35 s — longer than Supabase free-tier GoTrue cold-start (typically 20–30 s).
    // If TOKEN_REFRESHED or SIGNED_OUT has not fired by then, we clear loading so
    // the user sees the login page rather than a frozen spinner forever.
    const initTimeout = setTimeout(() => {
      if (!initialised.current) {
        initialised.current = true
        setLoading(false)
      }
    }, 35_000)

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

        // ── Cold-start guard ────────────────────────────────────────────────────
        // Supabase fires INITIAL_SESSION immediately with whatever is in
        // localStorage — even an expired access token. If we accept that session
        // and show the dashboard, every DB call fails with 401 until the background
        // refresh completes (which can take 20–30 s on the free tier while GoTrue
        // wakes from sleep). Instead, stay in loading state and wait for either
        // TOKEN_REFRESHED (refresh succeeded) or SIGNED_OUT (refresh failed /
        // refresh token expired). The initTimeout above falls back to the login
        // page if neither fires within 35 s.
        if (_event === 'INITIAL_SESSION' && s) {
          const nowSecs   = Math.floor(Date.now() / 1000)
          const expiresAt = s.expires_at ?? 0
          if (expiresAt <= nowSecs) {
            return  // token is expired — stay loading, wait for refresh result
          }
        }

        setSession(s)

        try {
          if (s) {
            try { sessionStorage.setItem('rs-uid', s.user.id) } catch { /* ignore */ }
            await fetchProfile(s.user.id, s.user.email)
          } else {
            try { sessionStorage.removeItem('rs-uid') } catch { /* ignore */ }
            clearRestrictedModeSession()
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
    clearRestrictedModeSession()
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
