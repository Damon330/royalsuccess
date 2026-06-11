import { useEffect, useState } from 'react'
import Header from '../shared/Header'
import StatCard from '../shared/StatCard'
import Badge from '../shared/Badge'
import { supabase } from '../../lib/supabase'
import { withTimeout } from '../../lib/withTimeout'
import type { Profile, Phone, AdminDashboardStats } from '../../types'
import {
  MdInventory2, MdStorefront, MdLocalShipping, MdCheckCircle,
  MdWarning, MdRefresh, MdUndo, MdBuildCircle, MdNotifications,
  MdExpandMore, MdExpandLess,
} from 'react-icons/md'

const AGENT_STALE_DAYS    = 3
const TEAMLEAD_STALE_DAYS = 14

interface AgentRow {
  profile: Profile
  assigned: number
  sold: number
  remaining: number
}

interface StaleAlert {
  phone:       Phone
  holderName:  string
  holderRole:  'agent' | 'team_lead'
  daysAssigned: number
  threshold:   number
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminDashboardStats>({ total: 0, in_stock: 0, in_field: 0, sold: 0, returned: 0, damaged: 0 })
  const [agentRows,    setAgentRows]    = useState<AgentRow[]>([])
  const [staleAlerts,  setStaleAlerts]  = useState<StaleAlert[]>([])
  const [alertsOpen,   setAlertsOpen]   = useState(true)
  const [dbError,      setDbError]      = useState(false)
  const [dataLoading,  setDataLoading]  = useState(true)

  async function fetchData() {
    setDataLoading(true)
    setDbError(false)
    try {
      const { data: phones, error: phonesError } = await withTimeout(
        supabase.from('phones').select('*'),
        8000
      )
      if (phonesError) throw phonesError
      if (!phones) return

      setStats({
        total:    phones.length,
        in_stock: phones.filter((p: Phone) => p.status === 'in_stock').length,
        in_field: phones.filter((p: Phone) => p.status === 'assigned').length,
        sold:     phones.filter((p: Phone) => p.status === 'sold').length,
        returned: phones.filter((p: Phone) => p.status === 'returned').length,
        damaged:  phones.filter((p: Phone) => p.status === 'damaged').length,
      })

      const { data: profiles, error: profilesError } = await withTimeout(
        supabase.from('profiles').select('*').neq('role', 'admin'),
        8000
      )
      if (profilesError) throw profilesError
      if (!profiles) return

      setAgentRows(
        profiles.map((prof: Profile) => {
          const myPhones = phones.filter((ph: Phone) => ph.assigned_to === prof.id)
          const sold = myPhones.filter((ph: Phone) => ph.status === 'sold').length
          return { profile: prof, assigned: myPhones.length, sold, remaining: myPhones.length - sold }
        })
      )

      const now = Date.now()
      const alerts: StaleAlert[] = []
      for (const phone of (phones as Phone[]).filter((p) => p.status === 'assigned' && p.assigned_at)) {
        const holder = (profiles as Profile[]).find((p) => p.id === phone.assigned_to)
        if (!holder) continue
        const daysAssigned = (now - new Date(phone.assigned_at!).getTime()) / (1000 * 60 * 60 * 24)
        const threshold    = holder.role === 'team_lead' ? TEAMLEAD_STALE_DAYS : AGENT_STALE_DAYS
        if (daysAssigned > threshold) {
          alerts.push({
            phone,
            holderName:  holder.full_name,
            holderRole:  holder.role as 'agent' | 'team_lead',
            daysAssigned: Math.floor(daysAssigned),
            threshold,
          })
        }
      }
      alerts.sort((a, b) => b.daysAssigned - a.daysAssigned)
      setStaleAlerts(alerts)
    } catch (err) {
      console.error('Dashboard fetch error:', err)
      setDbError(true)
    } finally {
      setDataLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const teamLeadRows = agentRows.filter((r) => r.profile.role === 'team_lead')
  const agentOnlyRows = agentRows.filter((r) => r.profile.role === 'agent')
  const allRows = [...teamLeadRows, ...agentOnlyRows]

  return (
    <div className="flex-1 overflow-y-auto">
      <Header title="Dashboard" />
      <div className="p-6 space-y-6">

        {dbError && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <MdWarning className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">Database connection failed</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Your Supabase project may be paused (free tier pauses after inactivity).
                Go to <strong>supabase.com</strong> → open your project → click{' '}
                <strong>"Resume project"</strong> → wait 30 seconds → then click Refresh below.
              </p>
            </div>
            <button
              onClick={fetchData}
              className="flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
            >
              <MdRefresh className="w-4 h-4" /> Refresh
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard label="Total Phones" value={stats.total}
            icon={<MdInventory2 className="w-6 h-6 text-primary" />} />
          <StatCard label="In Stock" value={stats.in_stock}
            icon={<MdStorefront className="w-6 h-6 text-blue-600" />} iconBg="bg-blue-50" />
          <StatCard label="Out in Field" value={stats.in_field}
            icon={<MdLocalShipping className="w-6 h-6 text-orange-500" />} iconBg="bg-orange-50" />
          <StatCard label="Total Sold" value={stats.sold}
            icon={<MdCheckCircle className="w-6 h-6 text-green-600" />} iconBg="bg-green-50" />
          <StatCard label="Returned" value={stats.returned}
            icon={<MdUndo className="w-6 h-6 text-yellow-600" />} iconBg="bg-yellow-50" />
          <StatCard label="Damaged" value={stats.damaged}
            icon={<MdBuildCircle className="w-6 h-6 text-red-500" />} iconBg="bg-red-50" />
        </div>

        {/* ── Stale Device Alerts ── */}
        {staleAlerts.length > 0 && (
          <div className="bg-white rounded-xl border border-orange-200 shadow-sm overflow-hidden">
            <button
              onClick={() => setAlertsOpen((v) => !v)}
              className="w-full px-6 py-4 border-b border-orange-100 flex items-center gap-2 hover:bg-orange-50 transition-colors"
            >
              <MdNotifications className="w-5 h-5 text-orange-500 flex-shrink-0" />
              <h2 className="text-base font-semibold text-brand-text flex-1 text-left">
                Stale Device Alerts
              </h2>
              <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {staleAlerts.length}
              </span>
              {alertsOpen
                ? <MdExpandLess className="w-5 h-5 text-brand-muted ml-1" />
                : <MdExpandMore className="w-5 h-5 text-brand-muted ml-1" />
              }
            </button>

            {alertsOpen && (
              <div>
                <div className="px-6 py-2 bg-orange-50 border-b border-orange-100 flex gap-6 text-xs text-orange-700 font-medium">
                  <span>Agents: alert after {AGENT_STALE_DAYS} days · Team leads: alert after {TEAMLEAD_STALE_DAYS} days without a sale</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-brand-border">
                      <tr>
                        {['Holder', 'Role', 'Model', 'IMEI / Barcode', 'Days In Field', 'Status'].map((h) => (
                          <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-brand-muted uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-border">
                      {staleAlerts.map(({ phone, holderName, holderRole, daysAssigned, threshold }) => {
                        const overBy = daysAssigned - threshold
                        return (
                          <tr key={phone.id} className="hover:bg-orange-50/40 transition-colors">
                            <td className="px-5 py-4 font-medium text-brand-text">{holderName}</td>
                            <td className="px-5 py-4">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                holderRole === 'team_lead' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                              }`}>
                                {holderRole === 'team_lead' ? 'Team Lead' : 'Agent'}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-brand-text">{phone.model}</td>
                            <td className="px-5 py-4 font-mono text-xs text-brand-muted">
                              {phone.imei ?? phone.barcode ?? phone.serial_number}
                            </td>
                            <td className="px-5 py-4">
                              <span className="font-bold text-orange-600">{daysAssigned}d</span>
                              <span className="text-xs text-orange-400 ml-1">({overBy}d over)</span>
                            </td>
                            <td className="px-5 py-4">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">
                                <MdWarning className="w-3 h-3" /> Overdue
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-xl border border-brand-border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-brand-border">
            <h2 className="text-base font-semibold text-brand-text">Team Overview</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-brand-border">
                <tr>
                  {['Name', 'Role', 'Assigned', 'Sold', 'Remaining'].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-brand-muted uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {allRows.map(({ profile, assigned, sold, remaining }) => (
                  <tr key={profile.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4 font-medium text-brand-text">{profile.full_name}</td>
                    <td className="px-5 py-4">
                      <Badge variant={profile.role === 'team_lead' ? 'blue' : 'green'}>
                        {profile.role === 'team_lead' ? 'Team Lead' : 'Agent'}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 font-medium">{assigned}</td>
                    <td className="px-5 py-4 text-green-600 font-medium">{sold}</td>
                    <td className="px-5 py-4 text-orange-500 font-medium">{remaining}</td>
                  </tr>
                ))}
                {allRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-brand-muted">
                      {dataLoading ? 'Loading team data...' : dbError ? 'Could not load team data — check connection.' : 'No team members yet.'}
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
