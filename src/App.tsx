import { lazy, Suspense, useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import Spinner from './components/shared/Spinner'
import { ADMIN_EMAIL } from './lib/constants'

// Code-split every layout so agents never download admin/teamlead bundles
const AdminLayout    = lazy(() => import('./pages/AdminLayout'))
const TeamLeadLayout = lazy(() => import('./pages/TeamLeadLayout'))
const AgentLayout    = lazy(() => import('./pages/AgentLayout'))
const PendingPage    = lazy(() => import('./pages/PendingPage'))

// ── Loading screen during auth init ───────────────────────────────────────────
// Supabase free-tier projects sleep after inactivity. GoTrue (auth service)
// can take 20–30 s to wake up. We show progressively clearer messages so the
// user understands what's happening and isn't tempted to hard-refresh or
// assume the app is broken.
//
//  0–4 s   → plain spinner (fast networks, project awake)
//  4–15 s  → "Verifying your session…"
//  15–30 s → "Server is starting up, please wait…" + tip about free tier
//  30 s+   → "Taking longer than usual" + escape-hatch "Sign in again" button
//
// At 35 s, AuthContext's initTimeout clears loading and shows the login page
// as a fallback, so this component is never shown longer than ~35 s.
function FullPageSpinner() {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setElapsed(s => s + 1), 1_000)
    return () => clearInterval(t)
  }, [])

  function forceLogin() {
    // Clear stored session so user can sign in fresh — no network call needed.
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith('sb-'))
        .forEach(k => localStorage.removeItem(k))
    } catch {}
    window.location.reload()
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-bg gap-4 p-6">
      <Spinner size="lg" />

      {elapsed >= 4 && elapsed < 15 && (
        <p className="text-sm text-brand-muted text-center">
          Verifying your session…
        </p>
      )}

      {elapsed >= 15 && elapsed < 30 && (
        <div className="text-center max-w-xs space-y-1">
          <p className="text-sm font-semibold text-brand-text">
            Server is starting up, please wait…
          </p>
          <p className="text-xs text-brand-muted leading-relaxed">
            This happens once after the server has been idle.
            It usually takes 20–30 seconds.
          </p>
        </div>
      )}

      {elapsed >= 30 && (
        <div className="text-center max-w-xs space-y-3">
          <p className="text-sm font-semibold text-brand-text">
            Taking longer than usual…
          </p>
          <p className="text-xs text-brand-muted leading-relaxed">
            The server may be slow to respond today.
            You can wait a few more seconds or sign in again.
          </p>
          <button
            onClick={forceLogin}
            className="px-5 py-2 bg-primary text-white text-sm font-semibold rounded-full hover:bg-primary-light transition-colors"
          >
            Sign in again
          </button>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const { session, profile, loading, isPasswordRecovery } = useAuth()

  if (loading) return <FullPageSpinner />

  if (isPasswordRecovery) return <ResetPasswordPage />

  if (!session) return <LoginPage />

  // Admin is determined by both email match AND session being valid.
  // The profiles table is also kept in sync by AuthContext (upsert on login).
  const isAdmin = session.user.email?.toLowerCase() === ADMIN_EMAIL?.toLowerCase()
    || profile?.role === 'admin'

  if (isAdmin) {
    return (
      <Suspense fallback={<FullPageSpinner />}>
        <Routes>
          <Route path="/admin/*" element={<AdminLayout />} />
          <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
        </Routes>
      </Suspense>
    )
  }

  // Non-admin: wait for profile to resolve before rendering role-gated routes
  if (!profile || profile.status === 'pending') {
    return (
      <Suspense fallback={<FullPageSpinner />}>
        <PendingPage />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        {profile.role === 'team_lead' && (
          <Route path="/teamlead/*" element={<TeamLeadLayout />} />
        )}
        {profile.role === 'agent' && (
          <Route path="/agent/*" element={<AgentLayout />} />
        )}
        <Route path="*" element={<RoleRedirect role={profile.role} />} />
      </Routes>
    </Suspense>
  )
}

function RoleRedirect({ role }: { role: string }) {
  if (role === 'admin')     return <Navigate to="/admin/dashboard" replace />
  if (role === 'team_lead') return <Navigate to="/teamlead" replace />
  return <Navigate to="/agent" replace />
}
