import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { useAuth } from '../../hooks/useAuth'
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
  MdExpandMore, MdExpandLess, MdTrendingUp, MdPeople,
} from 'react-icons/md'

const AGENT_STALE_DAYS    = 3
const TEAMLEAD_STALE_DAYS = 14
const STALE_PAGE_SIZE     = 10
const TEAM_PAGE_SIZE      = 15
const DASHBOARD_STALE_MS  = 120_000   // 2 min — cache longer so nav feels instant
const QUERY_TIMEOUT_MS    = 10_000    // 10 s hard timeout per fetch

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

function RingMetric({ percent, color, label, value, total }: {
  percent: number; color: string; label: string; value: number; total: number
}) {
  return (
    <div className="text-center">
      <div className="relative inline-flex items-center justify-center">
        <RingChart percent={percent} color={color} size={76} strokeWidth={7} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-extrabold text-white leading-none">
            {total > 0 ? `${Math.round(percent)}%` : '—'}
          </span>
        </div>
      </div>
      <p className="text-white/55 text-[10px] font-bold uppercase tracking-widest mt-1">{label}</p>
      <p className="text-white font-extrabold text-sm tabular-nums">{value}</p>
    </div>
  )
}

// ── Data fetchers ──────────────────────────────────────────────────────────────
// Single function: 2 parallel queries instead of the old 7 (6 count + 1 phones).
// Phones (status only) → stats.  Phones (full) + profiles → team/alerts.

interface DashboardData {
  stats:       AdminDashboardStats
  agentRows:   AgentRow[]
  staleAlerts: StaleAlert[]
}

async function fetchDashboard(): Promise<DashboardData> {
  const [phonesRes, profilesRes] = await Promise.all([
    withTimeout(
      supabase.from('phones')
        .select('id, assigned_to, status, model, imei, barcode, serial_number, assigned_at')
        .limit(5000),
      QUERY_TIMEOUT_MS,
    ),
    withTimeout(
      supabase.from('profiles')
        .select('id, full_name, role, team_lead_id, status, created_at')
        .neq('role', 'admin'),
      QUERY_TIMEOUT_MS,
    ),
  ])

  if (phonesRes.error)   throw new Error(phonesRes.error.message)
  if (profilesRes.error) throw new Error(profilesRes.error.message)

  const phones   = (phonesRes.data   ?? []) as Phone[]
  const profiles = (profilesRes.data ?? []) as Profile[]

  // ── Stats (computed from phones — no extra queries) ──
  const stats: AdminDashboardStats = {
    total:    phones.length,
    in_stock: phones.filter((p) => p.status === 'in_stock').length,
    in_field: phones.filter((p) => p.status === 'assigned').length,
    sold:     phones.filter((p) => p.status === 'sold').length,
    returned: phones.filter((p) => p.status === 'returned').length,
    damaged:  phones.filter((p) => p.status === 'damaged').length,
  }

  // ── Team overview ────────────────────────────────────
  const agentRows: AgentRow[] = profiles.map((prof) => {
    const mine = phones.filter((ph) => ph.assigned_to === prof.id)
    const sold = mine.filter((ph) => ph.status === 'sold').length
    return { profile: prof, assigned: mine.length, sold, remaining: mine.length - sold }
  })

  // ── Stale alerts ─────────────────────────────────────
  const now = Date.now()
  const staleAlerts: StaleAlert[] = []
  for (const phone of phones.filter((p) => p.status === 'assigned' && p.assigned_at)) {
    const holder = profiles.find((p) => p.id === phone.assigned_to)
    if (!holder) continue
    const days      = (now - new Date(phone.assigned_at!).getTime()) / 86_400_000
    const threshold = holder.role === 'team_lead' ? TEAMLEAD_STALE_DAYS : AGENT_STALE_DAYS
    if (days > threshold) {
      staleAlerts.push({
        phone,
        holderName:   holder.full_name,
        holderRole:   holder.role as 'agent' | 'team_lead',
        daysAssigned: Math.floor(days),
        threshold,
      })
    }
  }
  staleAlerts.sort((a, b) => b.daysAssigned - a.daysAssigned)

  return { stats, agentRows, staleAlerts }
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { profile } = useAuth()
  const [alertsOpen, setAlertsOpen] = useState(true)
  const [alertsPage, setAlertsPage] = useState(1)
  const [teamPage,   setTeamPage]   = useState(1)

  const {
    data,
    isLoading,
    isError:    dbError,
    isFetching,
    error:      dbErrorObj,
    refetch:    refetchAll,
  } = useQuery({
    queryKey:  ['dashboard'],
    queryFn:   fetchDashboard,
    staleTime: DASHBOARD_STALE_MS,
  })

  const stats       = data?.stats       ?? DEFAULT_STATS
  const agentRows   = data?.agentRows   ?? []
  const staleAlerts = data?.staleAlerts ?? []

  const teamLoading  = isLoading
  const teamFetching = isFetching

  const teamLeadRows  = agentRows.filter((r) => r.profile.role === 'team_lead')
  const agentOnlyRows = agentRows.filter((r) => r.profile.role === 'agent')
  const allRows       = [...teamLeadRows, ...agentOnlyRows]

  const alertsTotalPages = Math.max(1, Math.ceil(staleAlerts.length / STALE_PAGE_SIZE))
  const pagedAlerts      = staleAlerts.slice((alertsPage - 1) * STALE_PAGE_SIZE, alertsPage * STALE_PAGE_SIZE)

  const teamTotalPages = Math.max(1, Math.ceil(allRows.length / TEAM_PAGE_SIZE))
  const pagedTeam      = allRows.slice((teamPage - 1) * TEAM_PAGE_SIZE, teamPage * TEAM_PAGE_SIZE)

  // refetchAll is already defined from useQuery above

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

      <Header title="Dashboard" subtitle="Home" />

      <div className="p-4 sm:p-6 space-y-5">

        {/* ── DB error banner ──────────────────────────────────────────────── */}
        {dbError && (
          <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-card p-4 flex items-start gap-3">
            <MdWarning className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Database connection failed</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                {(dbErrorObj as Error)?.message ?? 'Could not reach database. Check your connection and try again.'}
              </p>
            </div>
            <button
              onClick={() => refetchAll()}
              className="flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-800/30 hover:bg-amber-200 dark:hover:bg-amber-800/50 px-3 py-1.5 rounded-full transition-colors flex-shrink-0"
            >
              <MdRefresh className="w-4 h-4" /> Refresh
            </button>
          </div>
        )}

        {/* ── Welcome Banner ───────────────────────────────────────────────── */}
        <div className="bg-gradient-banner rounded-card p-6 shadow-card overflow-hidden relative">
          {/* Decorative blobs */}
          <div className="absolute -top-10 -right-8 w-44 h-44 bg-white/6 rounded-full pointer-events-none" />
          <div className="absolute -bottom-6 right-24 w-32 h-32 bg-white/5 rounded-full pointer-events-none" />
          <div className="absolute top-1/2 -translate-y-1/2 left-1/2 w-96 h-1 bg-white/5 blur-sm pointer-events-none" />

          <div className="relative flex flex-col lg:flex-row items-start lg:items-center gap-6">
            {/* Left: greeting */}
            <div className="flex items-center gap-4 flex-1">
              <div className="w-14 h-14 bg-white/20 rounded-card flex items-center justify-center border border-white/20 flex-shrink-0 shadow-soft">
                <span className="text-xl font-extrabold text-white tracking-tight">{initials}</span>
              </div>
              <div>
                <p className="text-white/60 text-sm font-medium tracking-wide">Welcome back,</p>
                <h2 className="text-2xl font-extrabold leading-tight">
                  <span className="text-white">{profile?.full_name?.split(' ')[0] ?? 'Admin'} </span>
                  <span className="text-accent-light font-extrabold">{profile?.full_name?.split(' ').slice(1).join(' ')}</span>
                </h2>
                <p className="text-white/45 text-xs mt-0.5 font-medium">{todayStr}</p>
              </div>
            </div>

            {/* Right: ring metrics — primary=lime, accent=pink, blue=stock */}
            <div className="flex items-center gap-5 sm:gap-8 flex-wrap">

              <RingMetric percent={sellThroughRate} color="#B6D86B" label="Sold"     value={stats.sold}     total={stats.total} />
              <RingMetric percent={fieldRate}        color="#E8559A" label="In Field" value={stats.in_field} total={stats.total} />
              <RingMetric percent={stockRate}        color="#84B84C" label="In Stock" value={stats.in_stock} total={stats.total} />

            </div>
          </div>
        </div>

        {/* ── Inventory Stats ───────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <MdInventory2 className="w-3.5 h-3.5 text-brand-label" />
            <h2 className="section-label">Inventory Overview</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <StatCard
              label="Total" value={stats.total}
              icon={<MdInventory2 className="w-5 h-5 text-primary" />}
              iconBg="bg-primary/10 dark:bg-primary/20"
              accentColor="bg-primary"
            />
            <StatCard
              label="In Stock" value={stats.in_stock}
              icon={<MdStorefront className="w-5 h-5 text-blue-500" />}
              iconBg="bg-blue-50 dark:bg-blue-900/20"
              accentColor="bg-blue-400"
              sub={pct(stats.in_stock)}
            />
            <StatCard
              label="In Field" value={stats.in_field}
              icon={<MdLocalShipping className="w-5 h-5 text-accent" />}
              iconBg="bg-accent/10 dark:bg-accent/15"
              accentColor="bg-accent"
              sub={pct(stats.in_field)}
            />
            <StatCard
              label="Sold" value={stats.sold}
              icon={<MdCheckCircle className="w-5 h-5 text-positive" />}
              iconBg="bg-positive/10 dark:bg-positive/15"
              accentColor="bg-positive"
              sub={pct(stats.sold)}
            />
            <StatCard
              label="Returned" value={stats.returned}
              icon={<MdUndo className="w-5 h-5 text-amber-500" />}
              iconBg="bg-amber-50 dark:bg-amber-900/20"
              accentColor="bg-amber-400"
              sub={pct(stats.returned)}
            />
            <StatCard
              label="Damaged" value={stats.damaged}
              icon={<MdBuildCircle className="w-5 h-5 text-negative" />}
              iconBg="bg-negative/10 dark:bg-negative/15"
              accentColor="bg-negative"
              sub={pct(stats.damaged)}
            />
          </div>
        </div>

        {/* ── Stale Device Alerts ──────────────────────────────────────────── */}
        {(staleAlerts.length > 0 || teamLoading) && (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.3 }}
            className="bg-brand-surface rounded-card border border-brand-border shadow-card overflow-hidden"
          >
            <button
              onClick={() => setAlertsOpen((v) => !v)}
              className="w-full px-6 py-4 flex items-center gap-3 hover:bg-brand-bg transition-colors"
            >
              <div className="w-8 h-8 bg-amber-50 dark:bg-amber-900/20 rounded-inner flex items-center justify-center flex-shrink-0">
                <MdNotifications className="w-4 h-4 text-amber-500" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-bold text-brand-text">Stale Device Alerts</p>
                <p className="text-xs text-brand-muted">
                  Agents: &gt;{AGENT_STALE_DAYS}d · Team leads: &gt;{TEAMLEAD_STALE_DAYS}d without movement
                </p>
              </div>
              {staleAlerts.length > 0 && (
                <span className="bg-amber-500 text-white text-xs font-extrabold px-2.5 py-0.5 rounded-full tabular-nums">
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
                      <thead className="bg-brand-bg border-b border-brand-border">
                        <tr>
                          {['Holder', 'Role', 'Model', 'IMEI / Barcode', 'Days in Field', 'Status'].map((h) => (
                            <th key={h} className="px-5 py-3 text-left text-xs font-bold text-brand-label uppercase tracking-wide whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-brand-border">
                        {pagedAlerts.map(({ phone, holderName, holderRole, daysAssigned, threshold }) => {
                          const overBy = daysAssigned - threshold
                          return (
                            <tr key={phone.id} className="hover:bg-brand-bg transition-colors">
                              <td className="px-5 py-3.5 font-semibold text-brand-text">{holderName}</td>
                              <td className="px-5 py-3.5">
                                <Badge variant={holderRole === 'team_lead' ? 'blue' : 'green'}>
                                  {holderRole === 'team_lead' ? 'Team Lead' : 'Agent'}
                                </Badge>
                              </td>
                              <td className="px-5 py-3.5 text-brand-text">{phone.model}</td>
                              <td className="px-5 py-3.5 font-mono text-xs text-brand-muted">
                                {phone.imei ?? phone.barcode ?? phone.serial_number}
                              </td>
                              <td className="px-5 py-3.5">
                                <span className="font-extrabold text-amber-600 dark:text-amber-400 tabular-nums">{daysAssigned}d</span>
                                <span className="text-xs text-brand-muted ml-1.5">+{overBy}d over</span>
                              </td>
                              <td className="px-5 py-3.5">
                                <Badge variant="yellow">
                                  <MdWarning className="w-3 h-3 mr-1" /> Overdue
                                </Badge>
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
          </motion.div>
        )}

        {/* ── Team Overview ─────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.3 }}
          className="bg-brand-surface rounded-card border border-brand-border shadow-card overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-brand-border flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-primary/10 dark:bg-primary/20 rounded-inner flex items-center justify-center flex-shrink-0">
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
              <div className="hidden sm:flex items-center gap-1.5 bg-positive/10 dark:bg-positive/15 px-3 py-1 rounded-full">
                <MdTrendingUp className="w-4 h-4 text-positive" />
                <span className="text-xs font-semibold text-positive">
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
                <thead className="bg-brand-bg border-b border-brand-border">
                  <tr>
                    {['Member', 'Role', 'Assigned', 'Sold', 'Remaining', 'Sell Rate'].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-bold text-brand-label uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border">
                  {pagedTeam.map(({ profile: p, assigned, sold, remaining }) => {
                    const rate = assigned > 0 ? Math.round((sold / assigned) * 100) : 0
                    return (
                      <tr key={p.id} className="hover:bg-brand-bg transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-inner flex items-center justify-center text-xs font-extrabold flex-shrink-0 ${
                              p.role === 'team_lead'
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                : 'bg-primary/10 dark:bg-primary/20 text-primary'
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
                        <td className="px-5 py-3.5 font-bold text-positive tabular-nums">{sold}</td>
                        <td className="px-5 py-3.5 font-semibold text-accent tabular-nums">{remaining}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-brand-border rounded-full overflow-hidden min-w-[60px]">
                              <div
                                className="h-full bg-gradient-primary rounded-full transition-all duration-500"
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
        </motion.div>

      </div>
    </div>
  )
}
