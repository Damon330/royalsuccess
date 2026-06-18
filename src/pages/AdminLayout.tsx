import { Component, ReactNode, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { RestrictedModeProvider } from '../context/RestrictedModeContext'
import { useRestrictedMode } from '../hooks/useRestrictedMode'
import type { AdminModuleId } from '../lib/adminModules'
import { SystemHealthProvider } from '../context/SystemHealthContext'
import SystemHealthMonitor from '../components/shared/SystemHealthMonitor'
import Sidebar from '../components/shared/Sidebar'
import AdminDashboard from '../components/admin/AdminDashboard'
import AdminInventory from '../components/admin/AdminInventory'
import AdminAgents from '../components/admin/AdminAgents'
import AdminAssignPhones from '../components/admin/AdminAssignPhones'
import AdminReports from '../components/admin/AdminReports'
import AdminInsights from '../components/admin/AdminInsights'
import AdminReturns from '../components/admin/AdminReturns'
import AdminReceipts from '../components/admin/AdminReceipts'
import ActivityPage from './ActivityPage'
import PayrollPage from '../components/admin/payroll/PayrollPage'
import ProfilePage from '../components/shared/ProfilePage'
import SettingsPage from '../components/shared/SettingsPage'
import DiagnosticsPage from './DiagnosticsPage'

// Catches rendering errors in any admin page so the layout never goes blank
class PageErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
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

  return (
    <SystemHealthProvider>
      <RestrictedShortcutGuard />
      <div className="flex h-screen overflow-hidden bg-brand-bg transition-colors duration-200">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* System health banner — auto-shows when DB or auth has issues */}
          <SystemHealthMonitor />
          <PageErrorBoundary>
            <Routes>
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="inventory" element={<RequireAdminModule moduleId="inventory"><AdminInventory /></RequireAdminModule>} />
            <Route path="agents"    element={<RequireAdminModule moduleId="employees"><AdminAgents /></RequireAdminModule>} />
            <Route path="assign"    element={<RequireAdminModule moduleId="inventory"><AdminAssignPhones /></RequireAdminModule>} />
            <Route path="reports"   element={<RequireAdminModule moduleId="reports"><AdminReports /></RequireAdminModule>} />
            <Route path="insights"  element={<RequireAdminModule moduleId="reports"><AdminInsights /></RequireAdminModule>} />
            <Route path="returns"   element={<RequireAdminModule moduleId="inventory"><AdminReturns /></RequireAdminModule>} />
            <Route path="receipts"  element={<RequireAdminModule moduleId="sales"><AdminReceipts /></RequireAdminModule>} />
            <Route path="activity"  element={<RequireAdminModule moduleId="reports"><ActivityPage /></RequireAdminModule>} />
            <Route path="payroll"   element={<RequireAdminModule moduleId="payroll"><PayrollPage /></RequireAdminModule>} />
            <Route path="profile"      element={<RequireAdminModule moduleId="settings"><ProfilePage /></RequireAdminModule>} />
            <Route path="settings"     element={<RequireAdminModule moduleId="settings"><SettingsPage /></RequireAdminModule>} />
            <Route path="diagnostics"  element={<RequireAdminModule moduleId="diagnostics"><DiagnosticsPage /></RequireAdminModule>} />
            <Route path="*"            element={<Navigate to={restrictedMode.firstAllowedPath.replace('/admin/', '')} replace />} />
            </Routes>
          </PageErrorBoundary>
        </main>
      </div>
    </SystemHealthProvider>
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
