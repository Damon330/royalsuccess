import { lazy, Suspense } from 'react'
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

function FullPageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-bg">
      <Spinner size="lg" />
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
