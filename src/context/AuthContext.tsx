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
  profileLoading:        boolean
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
  profileLoading:        false,
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
  const [profileLoading,     setProfileLoading]     = useState(false)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(recoveryOnLoad)
  const initialised    = useRef(false)
  // profileLoaded tracks whether we have successfully fetched the profile at
  // least once. Used inside the onAuthStateChange closure (which captures a
  // stale `profile` state value) to decide whether to skip re-fetching.
  const profileLoaded  = useRef(false)

  // ── Profile fetch ────────────────────────────────────────────────────────
  // Returns profile data without touching state — lets the caller batch
  // setSession + setProfile + setProfileLoading into a single React render,
  // eliminating any intermediate render where session is set but profile is not.
  const PROFILE_TIMEOUT = 8_000

  async function loadProfile(userId: string, email?: string | null): Promise<Profile | null> {
    const emailIsAdmin = !!email && email.toLowerCase() === ADMIN_EMAIL?.toLowerCase()

    // Always fetch the DB profile first — it is the authoritative source for role.
    // The old design checked email first and took a completely different code path,
    // meaning a VITE_ADMIN_EMAIL mismatch (changed email, typo, env var lag) would
    // silently fall through and treat an admin account as a regular user.
    let existing: Profile | null = null
    let fetchFailed = false
    try {
      const { data } = await withTimeout(
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        PROFILE_TIMEOUT,
      )
      existing = data ?? null
    } catch {
      fetchFailed = true
    }

    // Admin = email matches VITE_ADMIN_EMAIL  OR  DB already has role='admin'.
    // Either signal is sufficient — no single point of failure.
    const isAdmin = emailIsAdmin || existing?.role === 'admin'

    if (!isAdmin) {
      return existing
    }

    // ── Admin path ────────────────────────────────────────────────────────────

    if (fetchFailed) {
      // DB unreachable — return a synthetic profile so the admin can still log in.
      return {
        id: userId, full_name: 'Admin', phone_number: null,
        role: 'admin' as const, team_lead_id: null,
        status: 'active' as const, created_at: new Date().toISOString(),
      }
    }

    if (!existing) {
      // No profile row yet (first login before trigger fires) — create it.
      try {
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
        return fresh ?? {
          id: userId, full_name: 'Admin', phone_number: null,
          role: 'admin' as const, team_lead_id: null,
          status: 'active' as const, created_at: new Date().toISOString(),
        }
      } catch {
        return {
          id: userId, full_name: 'Admin', phone_number: null,
          role: 'admin' as const, team_lead_id: null,
          status: 'active' as const, created_at: new Date().toISOString(),
        }
      }
    }

    // Profile exists — self-heal if role/status drifted (e.g. trigger reset it).
    if (existing.role !== 'admin' || existing.status !== 'active') {
      try {
        await withTimeout(
          supabase.from('profiles').update({ role: 'admin', status: 'active' }).eq('id', userId),
          PROFILE_TIMEOUT,
        )
      } catch { /* non-fatal — return correct values anyway */ }
    }

    return { ...existing, role: 'admin' as const, status: 'active' as const }
  }

  async function refreshProfile() {
    if (!session) return
    setProfileLoading(true)
    const data = await loadProfile(session.user.id, session.user.email)
    setProfile(data)
    setProfileLoading(false)
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
  //  • The initTimeout is a non-destructive safety valve: after 35 s it clears
  //    the loading spinner so the user sees the login page rather than a
  //    frozen spinner forever. It does NOT touch the session or localStorage.
  useEffect(() => {
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

        // ── Session-only update: no profile re-fetch needed ─────────────────────
        // TOKEN_REFRESHED: Supabase rotated the JWT in the background (happens
        //   when the tab regains focus with a near-expired token).
        // SIGNED_IN (re-fire): some Supabase versions emit SIGNED_IN alongside
        //   TOKEN_REFRESHED. If we already have a loaded profile for this user,
        //   treat both the same way — just swap in the new session tokens.
        // profileLoaded.current uses a ref because the closure captures a stale
        // copy of `profile` state; a ref is always current.
        if (s && profileLoaded.current && (
          _event === 'TOKEN_REFRESHED' ||
          _event === 'SIGNED_IN'
        )) {
          setSession(s)
          return
        }

        // ── Cold-start guard ────────────────────────────────────────────────────
        // Supabase fires INITIAL_SESSION immediately with whatever is in
        // localStorage — even an expired access token. Stay in loading state and
        // wait for TOKEN_REFRESHED or SIGNED_OUT rather than accepting a stale token.
        if (_event === 'INITIAL_SESSION' && s) {
          const nowSecs   = Math.floor(Date.now() / 1000)
          const expiresAt = s.expires_at ?? 0
          if (expiresAt <= nowSecs) {
            return
          }
        }

        try {
          if (s) {
            try { sessionStorage.setItem('rs-uid', s.user.id) } catch { /* ignore */ }
            // Mark profile as loading so App.tsx shows a spinner instead of
            // PendingPage during the async fetch — prevents the flash where
            // a stale/previous profile.status briefly triggers the wrong screen.
            setProfileLoading(true)
            const profileData = await loadProfile(s.user.id, s.user.email)
            // Batch all three updates — React 18 flushes them in one render,
            // so there is no intermediate state where session=set but profile=stale.
            setSession(s)
            setProfile(profileData)
            setProfileLoading(false)
            profileLoaded.current = true
          } else {
            try { sessionStorage.removeItem('rs-uid') } catch { /* ignore */ }
            clearRestrictedModeSession()
            profileLoaded.current = false
            setSession(s)
            setProfile(null)
          }
        } catch {
          setSession(s)
          setProfileLoading(false)
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

  // ── Realtime: own profile updates (e.g. admin approval) ──────────────────
  // When admin approves a pending agent, the profiles row changes in the DB.
  // onAuthStateChange never fires for this — only auth events trigger it.
  // This subscription catches the DB row change and updates profile state
  // directly so App.tsx re-routes the agent without any page reload.
  useEffect(() => {
    if (!session?.user.id) return

    const channel = supabase
      .channel(`profile-self-${session.user.id}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'profiles',
          filter: `id=eq.${session.user.id}`,
        },
        (payload) => {
          setProfile((prev) =>
            prev
              ? { ...prev, ...(payload.new as Partial<Profile>) }
              : (payload.new as Profile)
          )
        },
      )
      .subscribe()

    return () => { channel.unsubscribe(); supabase.removeChannel(channel) }
  }, [session?.user.id])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ───────────────────────────────────────────────────────────────

  function clearPasswordRecovery() {
    setIsPasswordRecovery(false)
    if (window.location.hash.includes('type=recovery')) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    clearRestrictedModeSession()
    setProfile(null)
  }

  function updateProfileState(partial: Partial<Profile>) {
    setProfile((prev) => (prev ? { ...prev, ...partial } : prev))
  }

  return (
    <AuthContext.Provider value={{
      session, profile, loading, profileLoading, isPasswordRecovery,
      clearPasswordRecovery, signOut, refreshProfile, updateProfileState,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
