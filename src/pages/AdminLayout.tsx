import { Component, lazy, ReactNode, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { RestrictedModeProvider } from '../context/RestrictedModeContext'
import { useRestrictedMode } from '../hooks/useRestrictedMode'
import type { AdminModuleId } from '../lib/adminModules'
import { SystemHealthProvider } from '../context/SystemHealthContext'
import SystemHealthMonitor from '../components/shared/SystemHealthMonitor'
import Sidebar from '../components/shared/Sidebar'
import Spinner from '../components/shared/Spinner'
import AdminWorkspaceSelector from '../components/admin/AdminWorkspaceSelector'

const AdminDashboard    = lazy(() => import('../components/admin/AdminDashboard'))
const AdminInventory    = lazy(() => import('../components/admin/AdminInventory'))
const AdminAgents       = lazy(() => import('../components/admin/AdminAgents'))
const AdminAssignPhones = lazy(() => import('../components/admin/AdminAssignPhones'))
const AdminReports      = lazy(() => import('../components/admin/AdminReports'))
const AdminInsights     = lazy(() => import('../components/admin/AdminInsights'))
const AdminReturns      = lazy(() => import('../components/admin/AdminReturns'))
const AdminReceipts     = lazy(() => import('../components/admin/AdminReceipts'))
const ActivityPage      = lazy(() => import('./ActivityPage'))
const PayrollPage       = lazy(() => import('../components/admin/payroll/PayrollPage'))
const ProfilePage       = lazy(() => import('../components/shared/ProfilePage'))
const SettingsPage      = lazy(() => import('../components/shared/SettingsPage'))
const DiagnosticsPage   = lazy(() => import('./DiagnosticsPage'))

class PageErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex-1 flex items-center justify-center p-10">
          <div className="bg-red-50 border border-red-200 rounded-xl p-8 max-w-lg text-center space-y-3">
            <p className="text-lg font-bold text-red-700">Page Error</p>
            <p className="text-sm text-red-600 font-mono">
              {(this.state.error as Error).message}
            </p>
            <p className="text-xs text-red-500">
              If this page requires a database migration, run the latest SQL file in{' '}
              <span className="font-mono">supabase/</span> in the Supabase SQL Editor, then refresh.
            </p>
            <button
              onClick={() => { this.setState({ error: null }); window.location.reload() }}
              className="mt-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function AdminLayout() {
  return (
    <RestrictedModeProvider>
      <AdminShell />
    </RestrictedModeProvider>
  )
}

function AdminShell() {
  const restrictedMode = useRestrictedMode()

  if (restrictedMode.selectionRequired) return <AdminWorkspaceSelector />

  return (
    <SystemHealthProvider>
      <RestrictedShortcutGuard />
      <div className="flex h-screen overflow-hidden bg-brand-bg transition-colors duration-200">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden">
          <SystemHealthMonitor />
          <PageErrorBoundary>
            <Suspense fallback={<AdminPageFallback />}>
              <Routes>
                <Route path="dashboard" element={<AdminDashboard />} />
                <Route path="inventory" element={<RequireAdminModule moduleId="inventory"><AdminInventory /></RequireAdminModule>} />
                <Route path="agents" element={<RequireAdminModule moduleId="employees"><AdminAgents /></RequireAdminModule>} />
                <Route path="assign" element={<RequireAdminModule moduleId="inventory"><AdminAssignPhones /></RequireAdminModule>} />
                <Route path="reports" element={<RequireAdminModule moduleId="reports"><AdminReports /></RequireAdminModule>} />
                <Route path="insights" element={<RequireAdminModule moduleId="reports"><AdminInsights /></RequireAdminModule>} />
                <Route path="returns" element={<RequireAdminModule moduleId="inventory"><AdminReturns /></RequireAdminModule>} />
                <Route path="receipts" element={<RequireAdminModule moduleId="sales"><AdminReceipts /></RequireAdminModule>} />
                <Route path="activity" element={<RequireAdminModule moduleId="reports"><ActivityPage /></RequireAdminModule>} />
                <Route path="payroll" element={<RequireAdminModule moduleId="payroll"><PayrollPage /></RequireAdminModule>} />
                <Route path="profile" element={<RequireAdminModule moduleId="settings"><ProfilePage /></RequireAdminModule>} />
                <Route path="settings" element={<RequireAdminModule moduleId="settings"><SettingsPage /></RequireAdminModule>} />
                <Route path="diagnostics" element={<RequireAdminModule moduleId="diagnostics"><DiagnosticsPage /></RequireAdminModule>} />
                <Route path="*" element={<Navigate to={restrictedMode.firstAllowedPath.replace('/admin/', '')} replace />} />
              </Routes>
            </Suspense>
          </PageErrorBoundary>
        </main>
      </div>
    </SystemHealthProvider>
  )
}

function AdminPageFallback() {
  return (
    <div className="flex-1 flex items-center justify-center bg-brand-bg">
      <Spinner size="lg" />
    </div>
  )
}

function RequireAdminModule({ moduleId, children }: { moduleId: AdminModuleId; children: ReactNode }) {
  const restrictedMode = useRestrictedMode()
  if (!restrictedMode.isModuleAllowed(moduleId)) {
    return <Navigate to="/admin/dashboard" replace />
  }
  return <>{children}</>
}

function RestrictedShortcutGuard() {
  const restrictedMode = useRestrictedMode()

  useEffect(() => {
    if (!restrictedMode.active) return

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const isTyping = target?.tagName === 'INPUT'
        || target?.tagName === 'TEXTAREA'
        || target?.isContentEditable
      if (isTyping) return

      const shortcutKey = e.key.toLowerCase()
      const isPotentialNavigationShortcut = e.altKey
        || ((e.ctrlKey || e.metaKey) && ['1', '2', '3', '4', '5', '6', '7', '8', 'p', 'r', 'e', 's'].includes(shortcutKey))

      if (isPotentialNavigationShortcut) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [restrictedMode.active])

  return null
}
