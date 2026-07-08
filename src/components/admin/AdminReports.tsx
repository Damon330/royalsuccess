import { useEffect, useState } from 'react'
import Header from '../shared/Header'
import Badge from '../shared/Badge'
import { supabase } from '../../lib/supabase'
import type { Profile, Phone } from '../../types'
import { MdBarChart, MdWarning, MdRefresh } from 'react-icons/md'

interface AgentReport {
  profile: Profile
  assigned: number
  sold: number
  remaining: number
  sellRate: number
}

export default function AdminReports() {
  const [reports,      setReports]      = useState<AgentReport[]>([])
  const [dbError,      setDbError]      = useState(false)
  const [dbErrorMsg,   setDbErrorMsg]   = useState<string | null>(null)
  const [loading,      setLoading]      = useState(true)

  async function fetchReports() {
    setLoading(true)
    setDbError(false)
    setDbErrorMsg(null)
    try {
      // SECURITY DEFINER RPCs — bypass RLS, is_admin() checked once inside each function.
      const [phonesRes, profilesRes] = await Promise.all([
        supabase.rpc('admin_get_phones'),
        supabase.rpc('admin_get_profiles'),
      ])
      if (phonesRes.error)   throw phonesRes.error
      if (profilesRes.error) throw profilesRes.error

      const phones:   Phone[]   = (phonesRes.data   as Phone[]   | null) ?? []
      const profiles: Profile[] = (profilesRes.data as Profile[] | null) ?? []

      const active = profiles.filter((p) => p.role !== 'admin' && p.status === 'active')

      const rows: AgentReport[] = active.map((p: Profile) => {
        const myPhones  = phones.filter((ph: Phone) => ph.assigned_to === p.id)
        const sold      = myPhones.filter((ph: Phone) => ph.status === 'sold').length
        const assigned  = myPhones.length
        const remaining = assigned - sold
        const sellRate  = assigned > 0 ? Math.round((sold / assigned) * 100) : 0
        return { profile: p, assigned, sold, remaining, sellRate }
      })
      rows.sort((a, b) => b.sold - a.sold)
      setReports(rows)
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? 'Unknown error'
      setDbErrorMsg(msg)
      setDbError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchReports() }, [])

  return (
    <div className="flex-1 overflow-y-auto">
      <Header title="Reports" />
      <div className="p-6 space-y-5">

        {dbError && (
          <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex items-start gap-3">
            <MdWarning className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-brand-text">Failed to load report data</p>
              {dbErrorMsg && (
                <p className="text-xs text-warning mt-0.5 font-mono break-all">{dbErrorMsg}</p>
              )}
            </div>
            <button
              onClick={fetchReports}
              className="flex items-center gap-1 text-xs font-medium text-warning hover:text-amber-900 bg-warning/15 hover:bg-warning/25 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
            >
              <MdRefresh className="w-4 h-4" /> Refresh
            </button>
          </div>
        )}

        <div className="bg-brand-surface rounded-card border border-brand-border overflow-hidden">
          <div className="px-6 py-4 border-b border-brand-border flex items-center gap-2">
            <MdBarChart className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold text-brand-text">Agent & Team Lead Performance</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-brand-bg border-b border-brand-border">
                <tr>
                  {['#', 'Name', 'Role', 'Assigned', 'Sold', 'Remaining', 'Sell Rate'].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-brand-muted uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {reports.map((row, i) => (
                  <tr key={row.profile.id} className="hover:bg-brand-bg transition-colors">
                    <td className="px-5 py-4 text-brand-muted text-xs">{i + 1}</td>
                    <td className="px-5 py-4 font-medium text-brand-text">{row.profile.full_name}</td>
                    <td className="px-5 py-4">
                      <Badge variant={row.profile.role === 'team_lead' ? 'blue' : 'green'}>
                        {row.profile.role === 'team_lead' ? 'Team Lead' : 'Agent'}
                      </Badge>
                    </td>
                    <td className="px-5 py-4">{row.assigned}</td>
                    <td className="px-5 py-4 text-green-600 font-medium">{row.sold}</td>
                    <td className="px-5 py-4 text-orange-500 font-medium">{row.remaining}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-brand-border rounded-full h-2">
                          <div className="bg-primary rounded-full h-2" style={{ width: `${row.sellRate}%` }} />
                        </div>
                        <span className="text-xs text-brand-muted">{row.sellRate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {reports.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-brand-muted">
                      {loading ? 'Loading reports...' : dbError ? 'Could not load reports — check connection.' : 'No data yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
