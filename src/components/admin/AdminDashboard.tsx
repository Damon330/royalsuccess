import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../hooks/useAuth'
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
  MdExpandMore, MdExpandLess, MdTrendingUp, MdPeople,
  MdCalendarToday,
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

// ── SVG ring chart ────────────────────────────────────────────────────────────
function RingChart({ percent, color, size = 76, strokeWidth = 7 }: {
  percent:     number
  color:       string
  size?:       number
  strokeWidth?: number
}) {
  const r      = (size - strokeWidth) / 2
  const circ   = 2 * Math.PI * r
  const pct    = Math.min(100, Math.max(0, percent))
  const offset = circ - (pct / 100) * circ

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  )
}

// ── Data fetchers ──────────────────────────────────────────────────────────────

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

// ── Main component ─────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { profile } = useAuth()
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

  const dbError    = statsError || teamError
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

  // Derived metrics
  const total           = stats.total || 1
  const sellThroughRate = (stats.sold    / total) * 100
  const fieldRate       = (stats.in_field / total) * 100
  const stockRate       = (stats.in_stock / total) * 100

  const pct = (n: number) =>
    total > 1 ? `${((n / total) * 100).toFixed(0)}% of total` : undefined

  const initials = (profile?.full_name ?? 'A')
    .split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')

  const todayStr = new Date().toLocaleDateString('en-NG', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="flex-1 overflow-y-auto bg-brand-bg">

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-brand-border px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="text-xs text-brand-muted font-medium">Home / Dashboard</p>
          <h1 className="text-xl font-extrabold text-brand-text leading-tight">Dashboard</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-brand-muted bg-gray-50 border border-brand-border rounded-xl px-3 py-2">
            <MdCalendarToday className="w-3.5 h-3.5 text-primary" />
            <span className="font-medium">{new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
          <button
            onClick={refetchAll}
            title="Refresh"
            className="p-2 rounded-xl border border-brand-border bg-white hover:bg-gray-50 text-brand-muted hover:text-primary transition-colors"
          >
            <MdRefresh className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">

        {/* ── DB error banner ──────────────────────────────────────────────── */}
        {dbError && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
            <MdWarning className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-800">Database connection failed</p>
              <p className="text-xs text-amber-700 mt-0.5">
                {(teamErrorObj as Error)?.message ?? 'Go to supabase.com → resume project → Refresh.'}
              </p>
            </div>
            <button
              onClick={refetchAll}
              className="flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
            >
              <MdRefresh className="w-4 h-4" /> Refresh
            </button>
          </div>
        )}

        {/* ── Welcome Banner ───────────────────────────────────────────────── */}
        <div className="bg-gradient-to-br from-primary via-primary to-primary-light rounded-2xl p-6 shadow-md overflow-hidden relative">
          {/* Decorative circles */}
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/5 rounded-full pointer-events-none" />
          <div className="absolute -bottom-8 right-20 w-28 h-28 bg-white/5 rounded-full pointer-events-none" />

          <div className="relative flex flex-col lg:flex-row items-start lg:items-center gap-6">
            {/* Left: greeting */}
            <div className="flex items-center gap-4 flex-1">
              <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center border-2 border-white/25 flex-shrink-0 shadow-inner">
                <span className="text-xl font-extrabold text-white tracking-tight">{initials}</span>
              </div>
              <div>
                <p className="text-white/65 text-sm font-medium">Welcome back,</p>
                <h2 className="text-2xl font-extrabold text-white leading-tight">{profile?.full_name ?? 'Admin'}</h2>
                <p className="text-white/50 text-xs mt-0.5 font-medium">{todayStr}</p>
              </div>
            </div>

            {/* Right: ring metrics */}
            <div className="flex items-center gap-5 sm:gap-8 flex-wrap">

              {/* Sell-Through */}
              <div className="text-center">
                <div className="relative inline-flex items-center justify-center">
                  <RingChart percent={sellThroughRate} color="#4ade80" size={76} strokeWidth={7} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-extrabold text-white leading-none">
                      {stats.total > 0 ? `${Math.round(sellThroughRate)}%` : '—'}
                    </span>
                  </div>
                </div>
                <p className="text-white/65 text-[11px] font-semibold uppercase tracking-wide mt-1">Sold</p>
                <p className="text-white font-bold text-sm tabular-nums">{stats.sold}</p>
              </div>

              {/* In Field */}
              <div className="text-center">
                <div className="relative inline-flex items-center justify-center">
                  <RingChart percent={fieldRate} color="#fb923c" size={76} strokeWidth={7} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-extrabold text-white leading-none">
                      {stats.total > 0 ? `${Math.round(fieldRate)}%` : '—'}
                    </span>
                  </div>
                </div>
                <p className="text-white/65 text-[11px] font-semibold uppercase tracking-wide mt-1">In Field</p>
                <p className="text-white font-bold text-sm tabular-nums">{stats.in_field}</p>
              </div>

              {/* In Stock */}
              <div className="text-center">
                <div className="relative inline-flex items-center justify-center">
                  <RingChart percent={stockRate} color="#60a5fa" size={76} strokeWidth={7} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-extrabold text-white leading-none">
                      {stats.total > 0 ? `${Math.round(stockRate)}%` : '—'}
                    </span>
                  </div>
                </div>
                <p className="text-white/65 text-[11px] font-semibold uppercase tracking-wide mt-1">In Stock</p>
                <p className="text-white font-bold text-sm tabular-nums">{stats.in_stock}</p>
              </div>

            </div>
          </div>
        </div>

        {/* ── Inventory Stats ───────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <MdInventory2 className="w-4 h-4 text-brand-muted" />
            <h2 className="text-xs font-bold text-brand-muted uppercase tracking-widest">Inventory Overview</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <StatCard
              label="Total Phones"
              value={stats.total}
              icon={<MdInventory2 className="w-5 h-5 text-primary" />}
              iconBg="bg-primary-pale"
              borderColor="border-l-primary"
              valueColor="text-primary"
            />
            <StatCard
              label="In Stock"
              value={stats.in_stock}
              icon={<MdStorefront className="w-5 h-5 text-blue-600" />}
              iconBg="bg-blue-50"
              borderColor="border-l-blue-500"
              valueColor="text-blue-700"
              sub={pct(stats.in_stock)}
            />
            <StatCard
              label="Out in Field"
              value={stats.in_field}
              icon={<MdLocalShipping className="w-5 h-5 text-orange-500" />}
              iconBg="bg-orange-50"
              borderColor="border-l-orange-400"
              valueColor="text-orange-600"
              sub={pct(stats.in_field)}
            />
            <StatCard
              label="Total Sold"
              value={stats.sold}
              icon={<MdCheckCircle className="w-5 h-5 text-green-600" />}
              iconBg="bg-green-50"
              borderColor="border-l-green-500"
              valueColor="text-green-700"
              sub={pct(stats.sold)}
            />
            <StatCard
              label="Returned"
              value={stats.returned}
              icon={<MdUndo className="w-5 h-5 text-yellow-600" />}
              iconBg="bg-yellow-50"
              borderColor="border-l-yellow-400"
              valueColor="text-yellow-700"
              sub={pct(stats.returned)}
            />
            <StatCard
              label="Damaged"
              value={stats.damaged}
              icon={<MdBuildCircle className="w-5 h-5 text-red-500" />}
              iconBg="bg-red-50"
              borderColor="border-l-red-500"
              valueColor="text-red-600"
              sub={pct(stats.damaged)}
            />
          </div>
        </div>

        {/* ── Stale Device Alerts ──────────────────────────────────────────── */}
        {(staleAlerts.length > 0 || teamLoading) && (
          <div className="bg-white rounded-2xl border border-brand-border shadow-sm overflow-hidden">
            <button
              onClick={() => setAlertsOpen((v) => !v)}
              className="w-full px-6 py-4 flex items-center gap-3 hover:bg-gray-50 transition-colors"
            >
              <div className="w-8 h-8 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <MdNotifications className="w-4 h-4 text-orange-500" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-bold text-brand-text">Stale Device Alerts</p>
                <p className="text-xs text-brand-muted">
                  Agents: &gt;{AGENT_STALE_DAYS}d · Team leads: &gt;{TEAMLEAD_STALE_DAYS}d without movement
                </p>
              </div>
              {staleAlerts.length > 0 && (
                <span className="bg-orange-500 text-white text-xs font-extrabold px-2.5 py-0.5 rounded-full tabular-nums">
                  {staleAlerts.length}
                </span>
              )}
              {teamFetching && !teamLoading && <Spinner size="sm" />}
              <div className="text-brand-muted ml-1">
                {alertsOpen
                  ? <MdExpandLess className="w-5 h-5" />
                  : <MdExpandMore  className="w-5 h-5" />
                }
              </div>
            </button>

            {alertsOpen && (
              <div className="border-t border-brand-border">
                {teamLoading ? (
                  <div className="flex justify-center py-10"><Spinner size="lg" /></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-orange-50/60 border-b border-orange-100">
                        <tr>
                          {['Holder', 'Role', 'Model', 'IMEI / Barcode', 'Days in Field', 'Status'].map((h) => (
                            <th key={h} className="px-5 py-3 text-left text-xs font-bold text-brand-muted uppercase tracking-wide whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-brand-border">
                        {pagedAlerts.map(({ phone, holderName, holderRole, daysAssigned, threshold }) => {
                          const overBy = daysAssigned - threshold
                          return (
                            <tr key={phone.id} className="hover:bg-orange-50/30 transition-colors">
                              <td className="px-5 py-3.5 font-semibold text-brand-text">{holderName}</td>
                              <td className="px-5 py-3.5">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                                  holderRole === 'team_lead' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                                }`}>
                                  {holderRole === 'team_lead' ? 'Team Lead' : 'Agent'}
                                </span>
                              </td>
                              <td className="px-5 py-3.5 text-brand-text">{phone.model}</td>
                              <td className="px-5 py-3.5 font-mono text-xs text-brand-muted">
                                {phone.imei ?? phone.barcode ?? phone.serial_number}
                              </td>
                              <td className="px-5 py-3.5">
                                <span className="font-extrabold text-orange-600 tabular-nums">{daysAssigned}d</span>
                                <span className="text-xs text-orange-400 ml-1.5">+{overBy}d over</span>
                              </td>
                              <td className="px-5 py-3.5">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700">
                                  <MdWarning className="w-3 h-3" /> Overdue
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                        {staleAlerts.length === 0 && !teamLoading && (
                          <tr>
                            <td colSpan={6} className="px-5 py-10 text-center text-brand-muted text-sm">
                              All clear — no overdue devices.
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

        {/* ── Team Overview ─────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-brand-border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-brand-border flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-primary-pale rounded-xl flex items-center justify-center flex-shrink-0">
                <MdPeople className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-bold text-brand-text text-sm leading-none">Team Overview</p>
                <p className="text-xs text-brand-muted mt-0.5">
                  {allRows.length} member{allRows.length !== 1 ? 's' : ''} · {teamLeadRows.length} TL · {agentOnlyRows.length} agent{agentOnlyRows.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {teamFetching && !teamLoading && <Spinner size="sm" />}
              <div className="hidden sm:flex items-center gap-1.5">
                <MdTrendingUp className="w-4 h-4 text-green-500" />
                <span className="text-xs font-semibold text-green-600">
                  {allRows.reduce((s, r) => s + r.sold, 0)} total sold
                </span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            {teamLoading ? (
              <div className="flex justify-center py-10"><Spinner size="lg" /></div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-brand-border">
                  <tr>
                    {['Member', 'Role', 'Assigned', 'Sold', 'Remaining', 'Sell Rate'].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-bold text-brand-muted uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border">
                  {pagedTeam.map(({ profile: p, assigned, sold, remaining }) => {
                    const rate = assigned > 0 ? Math.round((sold / assigned) * 100) : 0
                    return (
                      <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-extrabold flex-shrink-0 ${
                              p.role === 'team_lead'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-green-100 text-green-700'
                            }`}>
                              {p.full_name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                            </div>
                            <span className="font-semibold text-brand-text">{p.full_name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <Badge variant={p.role === 'team_lead' ? 'blue' : 'green'}>
                            {p.role === 'team_lead' ? 'Team Lead' : 'Agent'}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-brand-text tabular-nums">{assigned}</td>
                        <td className="px-5 py-3.5 font-bold text-green-600 tabular-nums">{sold}</td>
                        <td className="px-5 py-3.5 font-semibold text-orange-500 tabular-nums">{remaining}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden min-w-[60px]">
                              <div
                                className="h-full bg-primary rounded-full transition-all duration-500"
                                style={{ width: `${rate}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-brand-muted tabular-nums w-8 text-right">{rate}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {allRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-brand-muted">
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
