import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import PendingPage from './pages/PendingPage'
import AdminLayout from './pages/AdminLayout'
import TeamLeadLayout from './pages/TeamLeadLayout'
import AgentLayout from './pages/AgentLayout'
import ResetPasswordPage from './pages/ResetPasswordPage'
import Spinner from './components/shared/Spinner'

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL as string

export default function App() {
  const { session, profile, loading, isPasswordRecovery } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-bg">
        <Spinner size="lg" />
      </div>
    )
  }

  if (isPasswordRecovery) return <ResetPasswordPage />

  if (!session) return <LoginPage />

  const isAdminEmail = session.user.email?.toLowerCase() === ADMIN_EMAIL?.toLowerCase()

  // Admin email always bypasses the pending screen
  if (isAdminEmail) {
    return (
      <Routes>
        <Route path="/admin/*" element={<AdminLayout />} />
        <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
      </Routes>
    )
  }

  if (!profile || profile.status === 'pending') return <PendingPage />

  return (
    <Routes>
      {profile.role === 'team_lead' && (
        <Route path="/teamlead/*" element={<TeamLeadLayout />} />
      )}
      {profile.role === 'agent' && (
        <Route path="/agent/*" element={<AgentLayout />} />
      )}
      <Route path="*" element={<RoleRedirect role={profile.role} />} />
    </Routes>
  )
}

function RoleRedirect({ role }: { role: string }) {
  if (role === 'admin') return <Navigate to="/admin/dashboard" replace />
  if (role === 'team_lead') return <Navigate to="/teamlead" replace />
  return <Navigate to="/agent" replace />
}
