import { Component, ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
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
    <div className="flex min-h-screen bg-brand-bg">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <PageErrorBoundary>
          <Routes>
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="inventory" element={<AdminInventory />} />
            <Route path="agents"    element={<AdminAgents />} />
            <Route path="assign"    element={<AdminAssignPhones />} />
            <Route path="reports"   element={<AdminReports />} />
            <Route path="insights"  element={<AdminInsights />} />
            <Route path="returns"   element={<AdminReturns />} />
            <Route path="receipts"  element={<AdminReceipts />} />
            <Route path="activity"  element={<ActivityPage />} />
            <Route path="*"         element={<Navigate to="dashboard" replace />} />
          </Routes>
        </PageErrorBoundary>
      </main>
    </div>
  )
}
