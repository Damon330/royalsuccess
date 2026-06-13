import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Header from '../shared/Header'
import StatCard from '../shared/StatCard'
import Badge from '../shared/Badge'
import Pagination from '../shared/Pagination'
import Spinner from '../shared/Spinner'
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
const STALE_PAGE_SIZE     = 10
const TEAM_PAGE_SIZE      = 15
const DASHBOARD_STALE_MS  = 60_000

interface AgentRow {
  profile:   Profile
  assigned:  number
  sold:      number
  remaining: number
}

interface StaleAlert {
  phone:        Phone
  holderName:   string
  holderRole:   'agent' | 'team_lead'
  daysAssigned: number
  threshold:    number
}

const DEFAULT_STATS: AdminDashboardStats = {
  total: 0, in_stock: 0, in_field: 0, sold: 0, returned: 0, damaged: 0,
}

// Parallel HEAD count queries — zero row data transferred
async function fetchDashboardStats(): Promise<AdminDashboardStats> {
  const [tTotal, tStock, tField, tSold, tReturned, tDamaged] = await Promise.all([
    supabase.from('phones').select('*', { count: 'exact', head: true }),
    supabase.from('phones').select('*', { count: 'exact', head: true }).eq('status', 'in_stock'),
    supabase.from('phones').select('*', { count: 'exact', head: true }).eq('status', 'assigned'),
    supabase.from('phones').select('*', { count: 'exact', head: true }).eq('status', 'sold'),
    supabase.from('phones').select('*', { count: 'exact', head: true }).eq('status', 'returned'),
    supabase.from('phones').select('*', { count: 'exact', head: true }).eq('status', 'damaged'),
  ])
  const anyError = [tTotal, tStock, tField, tSold, tReturned, tDamaged].find((r) => r.error)
  if (anyError?.error) throw new Error(anyError.error.message)
  return {
    total:    tTotal.count    ?? 0,
    in_stock: tStock.count    ?? 0,
    in_field: tField.count    ?? 0,
    sold:     tSold.count     ?? 0,
    returned: tReturned.count ?? 0,
    damaged:  tDamaged.count  ?? 0,
  }
}

// Slim column selection: skips sold_at / returned_by / updated_at
// Fetches only the fields needed for team overview + stale alerts
async function fetchTeamData(): Promise<{ agentRows: AgentRow[]; staleAlerts: StaleAlert[] }> {
  const [phonesRes, profilesRes] = await Promise.all([
    withTimeout(
      supabase.from('phones')
        .select('id, assigned_to, status, model, imei, barcode, serial_number, assigned_at, created_at')
        .limit(5000),
      8000,
    ),
    withTimeout(
      supabase.from('profiles').select('*').neq('role', 'admin'),
      8000,
    ),
  ])
  if (phonesRes.error)   throw new Error(phonesRes.error.message)
  if (profilesRes.error) throw new Error(profilesRes.error.message)

  const phones   = (phonesRes.data   ?? []) as Phone[]
  const profiles = (profilesRes.data ?? []) as Profile[]

  const agentRows: AgentRow[] = profiles.map((prof) => {
    const mine = phones.filter((ph) => ph.assigned_to === prof.id)
    const sold = mine.filter((ph) => ph.status === 'sold').length
    return { profile: prof, assigned: mine.length, sold, remaining: mine.length - sold }
  })

  const now = Date.now()
  const alerts: StaleAlert[] = []
  for (const phone of phones.filter((p) => p.status === 'assigned' && p.assigned_at)) {
    const holder = profiles.find((p) => p.id === phone.assigned_to)
    if (!holder) continue
    const days      = (now - new Date(phone.assigned_at!).getTime()) / 86_400_000
    const threshold = holder.role === 'team_lead' ? TEAMLEAD_STALE_DAYS : AGENT_STALE_DAYS
    if (days > threshold) {
      alerts.push({
        phone,
        holderName:   holder.full_name,
        holderRole:   holder.role as 'agent' | 'team_lead',
        daysAssigned: Math.floor(days),
        threshold,
      })
    }
  }
  alerts.sort((a, b) => b.daysAssigned - a.daysAssigned)
  return { agentRows, staleAlerts: alerts }
}

export default function AdminDashboard() {
  const [alertsOpen, setAlertsOpen] = useState(true)
  const [alertsPage, setAlertsPage] = useState(1)
  const [teamPage,   setTeamPage]   = useState(1)

  const {
    data:    stats = DEFAULT_STATS,
    isError: statsError,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn:  fetchDashboardStats,
    staleTime: DASHBOARD_STALE_MS,
  })

  const {
    data:       teamData,
    isLoading:  teamLoading,
    isError:    teamError,
    isFetching: teamFetching,
    error:      teamErrorObj,
    refetch:    refetchTeam,
  } = useQuery({
    queryKey: ['dashboard-team'],
    queryFn:  fetchTeamData,
    staleTime: DASHBOARD_STALE_MS,
  })

  const dbError   = statsError || teamError
  const agentRows  = teamData?.agentRows   ?? []
  const staleAlerts = teamData?.staleAlerts ?? []

  const teamLeadRows  = agentRows.filter((r) => r.profile.role === 'team_lead')
  const agentOnlyRows = agentRows.filter((r) => r.profile.role === 'agent')
  const allRows       = [...teamLeadRows, ...agentOnlyRows]

  const alertsTotalPages = Math.max(1, Math.ceil(staleAlerts.length / STALE_PAGE_SIZE))
  const pagedAlerts      = staleAlerts.slice((alertsPage - 1) * STALE_PAGE_SIZE, alertsPage * STALE_PAGE_SIZE)

  const teamTotalPages = Math.max(1, Math.ceil(allRows.length / TEAM_PAGE_SIZE))
  const pagedTeam      = allRows.slice((teamPage - 1) * TEAM_PAGE_SIZE, teamPage * TEAM_PAGE_SIZE)

  function refetchAll() { refetchStats(); refetchTeam() }

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
                {(teamErrorObj as Error)?.message ?? 'Go to supabase.com → resume project → Refresh.'}
              </p>
            </div>
            <button
              onClick={refetchAll}
              className="flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
            >
              <MdRefresh className="w-4 h-4" /> Refresh
            </button>
          </div>
        )}

        {/* Stats — HEAD queries, no row data */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard label="Total Phones" value={stats.total}
            icon={<MdInventory2 className="w-6 h-6 text-primary" />}
            borderColor="border-l-primary" valueColor="text-primary" />
          <StatCard label="In Stock" value={stats.in_stock}
            icon={<MdStorefront className="w-6 h-6 text-blue-600" />}
            iconBg="bg-blue-50" borderColor="border-l-blue-500" valueColor="text-blue-700" />
          <StatCard label="Out in Field" value={stats.in_field}
            icon={<MdLocalShipping className="w-6 h-6 text-orange-500" />}
            iconBg="bg-orange-50" borderColor="border-l-orange-400" valueColor="text-orange-600" />
          <StatCard label="Total Sold" value={stats.sold}
            icon={<MdCheckCircle className="w-6 h-6 text-green-600" />}
            iconBg="bg-green-50" borderColor="border-l-green-500" valueColor="text-green-700" />
          <StatCard label="Returned" value={stats.returned}
            icon={<MdUndo className="w-6 h-6 text-yellow-600" />}
            iconBg="bg-yellow-50" borderColor="border-l-yellow-400" valueColor="text-yellow-700" />
          <StatCard label="Damaged" value={stats.damaged}
            icon={<MdBuildCircle className="w-6 h-6 text-red-500" />}
            iconBg="bg-red-50" borderColor="border-l-red-500" valueColor="text-red-600" />
        </div>

        {/* Stale Device Alerts */}
        {(staleAlerts.length > 0 || teamLoading) && (
          <div className="bg-white rounded-xl border border-orange-200 shadow-sm overflow-hidden">
            <button
              onClick={() => setAlertsOpen((v) => !v)}
              className="w-full px-6 py-4 border-b border-orange-100 flex items-center gap-2 hover:bg-orange-50 transition-colors"
            >
              <MdNotifications className="w-5 h-5 text-orange-500 flex-shrink-0" />
              <h2 className="text-base font-semibold text-brand-text flex-1 text-left">
                Stale Device Alerts
              </h2>
              {staleAlerts.length > 0 && (
                <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {staleAlerts.length}
                </span>
              )}
              {teamFetching && !teamLoading && <Spinner size="sm" />}
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
                {teamLoading ? (
                  <div className="flex justify-center py-10"><Spinner size="lg" /></div>
                ) : (
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
                        {pagedAlerts.map(({ phone, holderName, holderRole, daysAssigned, threshold }) => {
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
                        {staleAlerts.length === 0 && !teamLoading && (
                          <tr>
                            <td colSpan={6} className="px-5 py-8 text-center text-brand-muted text-sm">
                              No stale devices — all agents are within their limits.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    <Pagination
                      page={alertsPage}
                      totalPages={alertsTotalPages}
                      totalCount={staleAlerts.length}
                      pageSize={STALE_PAGE_SIZE}
                      onPageChange={(p) => setAlertsPage(p)}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Team Overview */}
        <div className="bg-white rounded-xl border border-brand-border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-brand-border flex items-center justify-between">
            <h2 className="text-base font-semibold text-brand-text">
              Team Overview
              {allRows.length > 0 && (
                <span className="ml-2 text-sm font-normal text-brand-muted">({allRows.length} members)</span>
              )}
            </h2>
            {teamFetching && !teamLoading && <Spinner size="sm" />}
          </div>
          <div className="overflow-x-auto">
            {teamLoading ? (
              <div className="flex justify-center py-10"><Spinner size="lg" /></div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-brand-border">
                  <tr>
                    {['Name', 'Role', 'Assigned', 'Sold', 'Remaining'].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-brand-muted uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border">
                  {pagedTeam.map(({ profile, assigned, sold, remaining }) => (
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
                        {dbError ? 'Could not load team data — check connection.' : 'No team members yet.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
            <Pagination
              page={teamPage}
              totalPages={teamTotalPages}
              totalCount={allRows.length}
              pageSize={TEAM_PAGE_SIZE}
              onPageChange={(p) => setTeamPage(p)}
            />
          </div>
        </div>

      </div>
    </div>
  )
}
