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

// Shows a spinner with a reassuring message after 5 s.
// This covers Supabase free-tier cold-start: GoTrue can take 20–30 s to wake
// from sleep, and the JWT refresh hangs until it does. The message tells the
// user something is happening rather than leaving them with a frozen screen.
function FullPageSpinner() {
  const [showHint, setShowHint] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setShowHint(true), 5_000)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-bg gap-3">
      <Spinner size="lg" />
      {showHint && (
        <p className="text-sm text-brand-muted text-center max-w-xs leading-relaxed">
          Starting up server, please wait…
          <br />
          <span className="text-xs opacity-70">This can take up to 30 seconds on first load.</span>
        </p>
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
