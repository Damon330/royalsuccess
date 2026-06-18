import { useState, useEffect, useRef } from 'react'
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
import { logDbError } from '../../lib/errorLog'
import type { AdminDashboardStats } from '../../types'
import {
  MdInventory2, MdStorefront, MdLocalShipping, MdCheckCircle,
  MdWarning, MdRefresh, MdUndo, MdBuildCircle, MdNotifications,
  MdExpandMore, MdExpandLess, MdTrendingUp, MdPeople,
} from 'react-icons/md'

const AGENT_STALE_DAYS    = 3
const TEAMLEAD_STALE_DAYS = 14
const STALE_PAGE_SIZE     = 10
const TEAM_PAGE_SIZE      = 15
const DASHBOARD_STALE_MS  = 120_000

// ── Types matching admin_team_overview() and admin_stale_alerts() RPC output ──

interface TeamMember {
  id:               string
  full_name:        string
  role:             'agent' | 'team_lead'
  status:           string
  team_lead_id:     string | null
  created_at:       string
  assigned_count:   number
  sold_count:       number
  active_count:     number
  stale_phone_count: number
  max_days_assigned: number | null
}

interface StaleAlert {
  phone_id:       string
  model:          string
  imei:           string | null
  barcode:        string | null
  serial_number:  string
  assigned_at:    string
  holder_id:      string
  holder_name:    string
  holder_role:    'agent' | 'team_lead'
  days_assigned:  number
  threshold_days: number
  over_by_days:   number
}

interface DashboardStats {
  total:    number
  in_stock: number
  in_field: number
  sold:     number
  returned: number
  damaged:  number
}

interface DashboardData {
  stats:       AdminDashboardStats
  team:        TeamMember[]
  staleAlerts: StaleAlert[]
}

const DEFAULT_STATS: AdminDashboardStats = {
  total: 0, in_stock: 0, in_field: 0, sold: 0, returned: 0, damaged: 0,
}

// ── SVG ring chart ─────────────────────────────────────────────────────────────
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
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={strokeWidth} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
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

// ── Data fetcher — uses SECURITY DEFINER RPCs ──────────────────────────────────
// RPCs bypass RLS entirely (run as postgres), enforcing admin check inside the
// function with is_admin(). This is immune to JWT email format differences.

async function fetchDashboard(): Promise<DashboardData> {
  const [statsRes, teamRes, alertsRes] = await Promise.all([
    withTimeout(supabase.rpc('admin_dashboard_stats'), 45_000),
    withTimeout(supabase.rpc('admin_team_overview'), 45_000),
    withTimeout(supabase.rpc('admin_stale_alerts', {
      p_agent_days:    AGENT_STALE_DAYS,
      p_teamlead_days: TEAMLEAD_STALE_DAYS,
    }), 45_000),
  ])

  if (statsRes.error)  throw new Error(statsRes.error.message)
  if (teamRes.error)   throw new Error(teamRes.error.message)
  if (alertsRes.error) throw new Error(alertsRes.error.message)

  const raw = statsRes.data as {
    phones:      DashboardStats
    team:        { total_agents: number; total_teamleads: number }
    salesToday:  number
    salesMonth:  number
  }

  const stats: AdminDashboardStats = {
    total:    raw.phones.total    ?? 0,
    in_stock: raw.phones.in_stock ?? 0,
    in_field: raw.phones.in_field ?? 0,
    sold:     raw.phones.sold     ?? 0,
    returned: raw.phones.returned ?? 0,
    damaged:  raw.phones.damaged  ?? 0,
  }

  const team: TeamMember[]       = (teamRes.data   as TeamMember[]   ) ?? []
  const staleAlerts: StaleAlert[] = (alertsRes.data as StaleAlert[]   ) ?? []

  return { stats, team, staleAlerts }
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { profile } = useAuth()
  const [alertsOpen,   setAlertsOpen]   = useState(true)
  const [alertsPage,   setAlertsPage]   = useState(1)
  const [teamPage,     setTeamPage]     = useState(1)
  const [loadingMs,    setLoadingMs]    = useState(0)
  const loadTimerRef = useRef<ReturnType<typeof setInterval>>()

  const {
    data,
    isLoading,
    isError:      dbError,
    isFetching,
    failureCount,
    error:        dbErrorObj,
    refetch:      refetchAll,
  } = useQuery({
    queryKey:   ['dashboard'],
    queryFn:    fetchDashboard,
    staleTime:  DASHBOARD_STALE_MS,
    // 3 total attempts (1 initial + 2 retries) with 5 s → 10 s backoff.
    // Covers the Supabase free-tier cold-start window (~20-30 s): first attempt
    // times out while DB wakes, second attempt succeeds in < 1 s.
    retry:      2,
    retryDelay: (attempt) => Math.min(5_000 * (attempt + 1), 10_000),
  })

  // Track how long the current fetch (initial or retry) is taking
  const isConnecting = isLoading || (isFetching && failureCount > 0)

  useEffect(() => {
    if (isConnecting) {
      setLoadingMs(0)
      loadTimerRef.current = setInterval(() => setLoadingMs(ms => ms + 1000), 1000)
    } else {
      clearInterval(loadTimerRef.current)
      setLoadingMs(0)
    }
    return () => clearInterval(loadTimerRef.current)
  }, [isConnecting])

  useEffect(() => {
    if (dbErrorObj) {
      const e = dbErrorObj as { message?: string; code?: string; details?: string }
      logDbError('AdminDashboard', e?.message ?? String(dbErrorObj), { code: e?.code, detail: e?.details })
    }
  }, [dbErrorObj])

  const stats       = data?.stats       ?? DEFAULT_STATS
  const team        = data?.team        ?? []
  const staleAlerts = data?.staleAlerts ?? []

  const teamLeadRows  = team.filter((m) => m.role === 'team_lead')
  const agentOnlyRows = team.filter((m) => m.role === 'agent')
  const allRows       = [...teamLeadRows, ...agentOnlyRows]

  const alertsTotalPages = Math.max(1, Math.ceil(staleAlerts.length / STALE_PAGE_SIZE))
  const pagedAlerts      = staleAlerts.slice((alertsPage - 1) * STALE_PAGE_SIZE, alertsPage * STALE_PAGE_SIZE)
  const teamTotalPages   = Math.max(1, Math.ceil(allRows.length / TEAM_PAGE_SIZE))
  const pagedTeam        = allRows.slice((teamPage - 1) * TEAM_PAGE_SIZE, teamPage * TEAM_PAGE_SIZE)

  const total           = stats.total || 1
  const sellThroughRate = (stats.sold     / total) * 100
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

        {/* ── Cold-start / reconnecting indicator ─────────────────────── */}
        {isConnecting && loadingMs >= 4000 && (
          <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/30 rounded-card p-4 flex items-center gap-3">
            <Spinner size="sm" />
            <div className="flex-1">
              {failureCount > 0 ? (
                <>
                  <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                    Reconnecting… (attempt {failureCount + 1} of 3)
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
                    Database took too long to respond — retrying automatically. Please wait.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                    Connecting to database… ({Math.round(loadingMs / 1000)}s)
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
                    Supabase may be waking up after inactivity — this takes up to 30 s once, then is fast.
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── DB error banner ──────────────────────────────────────────── */}
        {dbError && (
          <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-card p-4 flex items-start gap-3">
            <MdWarning className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-brand-text dark:text-amber-300">
                Failed to load dashboard data
              </p>
              <p className="text-xs text-warning dark:text-amber-400 mt-0.5 font-mono">
                {(dbErrorObj as Error)?.message ?? 'Unknown error'}
              </p>
              <p className="text-xs text-warning dark:text-amber-400 mt-1">
                {(dbErrorObj as Error)?.message?.includes('timed out')
                  ? 'Database took too long to respond — your Supabase project may have been sleeping. Click Retry; it should load on the second attempt.'
                  : 'If this says "permission denied", run supabase/v2-full-migration.sql in the Supabase SQL Editor, then Retry.'}
                {' '}Open <strong>Diagnostics</strong> (sidebar → Account) for a full system check.
              </p>
            </div>
            <button
              onClick={() => refetchAll()}
              className="flex items-center gap-1 text-xs font-semibold text-warning dark:text-amber-300 bg-amber-100 dark:bg-amber-800/30 hover:bg-amber-200 dark:hover:bg-amber-800/50 px-3 py-1.5 rounded-full transition-colors flex-shrink-0"
            >
              <MdRefresh className="w-4 h-4" /> Retry
            </button>
          </div>
        )}

        {/* ── Welcome Banner ───────────────────────────────────────────── */}
        <div className="bg-gradient-banner rounded-card p-6 shadow-card overflow-hidden relative">
          <div className="absolute -top-10 -right-8 w-44 h-44 bg-white/6 rounded-full pointer-events-none" />
          <div className="absolute -bottom-6 right-24 w-32 h-32 bg-white/5 rounded-full pointer-events-none" />

          <div className="relative flex flex-col lg:flex-row items-start lg:items-center gap-6">
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

            <div className="flex items-center gap-5 sm:gap-8 flex-wrap">
              <RingMetric percent={sellThroughRate} color="#B6D86B" label="Sold"     value={stats.sold}     total={stats.total} />
              <RingMetric percent={fieldRate}        color="#E8559A" label="In Field" value={stats.in_field} total={stats.total} />
              <RingMetric percent={stockRate}        color="#84B84C" label="In Stock" value={stats.in_stock} total={stats.total} />
            </div>
          </div>
        </div>

        {/* ── Inventory Stats ───────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <MdInventory2 className="w-3.5 h-3.5 text-brand-label" />
            <h2 className="section-label">Inventory Overview</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <StatCard label="Total"    value={stats.total}
              icon={<MdInventory2    className="w-5 h-5 text-primary"     />} iconBg="bg-primary/10 dark:bg-primary/20"      accentColor="bg-primary"  />
            <StatCard label="In Stock" value={stats.in_stock} sub={pct(stats.in_stock)}
              icon={<MdStorefront    className="w-5 h-5 text-blue-500"    />} iconBg="bg-blue-50 dark:bg-blue-900/20"         accentColor="bg-blue-400" />
            <StatCard label="In Field" value={stats.in_field} sub={pct(stats.in_field)}
              icon={<MdLocalShipping className="w-5 h-5 text-accent"      />} iconBg="bg-accent/10 dark:bg-accent/15"         accentColor="bg-accent"   />
            <StatCard label="Sold"     value={stats.sold}     sub={pct(stats.sold)}
              icon={<MdCheckCircle   className="w-5 h-5 text-positive"    />} iconBg="bg-positive/10 dark:bg-positive/15"     accentColor="bg-positive" />
            <StatCard label="Returned" value={stats.returned} sub={pct(stats.returned)}
              icon={<MdUndo          className="w-5 h-5 text-warning"   />} iconBg="bg-amber-50 dark:bg-amber-900/20"       accentColor="bg-amber-400" />
            <StatCard label="Damaged"  value={stats.damaged}  sub={pct(stats.damaged)}
              icon={<MdBuildCircle   className="w-5 h-5 text-negative"    />} iconBg="bg-negative/10 dark:bg-negative/15"     accentColor="bg-negative" />
          </div>
        </div>

        {/* ── Stale Device Alerts ──────────────────────────────────────── */}
        {(staleAlerts.length > 0 || isLoading) && (
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
                <MdNotifications className="w-4 h-4 text-warning" />
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
              {isFetching && !isLoading && <Spinner size="sm" />}
              <div className="text-brand-muted ml-1">
                {alertsOpen ? <MdExpandLess className="w-5 h-5" /> : <MdExpandMore className="w-5 h-5" />}
              </div>
            </button>

            {alertsOpen && (
              <div className="border-t border-brand-border">
                {isLoading ? (
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
                        {pagedAlerts.map((a) => (
                          <tr key={a.phone_id} className="hover:bg-brand-bg transition-colors">
                            <td className="px-5 py-3.5 font-semibold text-brand-text">{a.holder_name}</td>
                            <td className="px-5 py-3.5">
                              <Badge variant={a.holder_role === 'team_lead' ? 'blue' : 'green'}>
                                {a.holder_role === 'team_lead' ? 'Team Lead' : 'Agent'}
                              </Badge>
                            </td>
                            <td className="px-5 py-3.5 text-brand-text">{a.model}</td>
                            <td className="px-5 py-3.5 font-mono text-xs text-brand-muted">
                              {a.imei ?? a.barcode ?? a.serial_number}
                            </td>
                            <td className="px-5 py-3.5">
                              <span className="font-extrabold text-amber-600 dark:text-amber-400 tabular-nums">{a.days_assigned}d</span>
                              <span className="text-xs text-brand-muted ml-1.5">+{a.over_by_days}d over</span>
                            </td>
                            <td className="px-5 py-3.5">
                              <Badge variant="yellow">
                                <MdWarning className="w-3 h-3 mr-1" /> Overdue
                              </Badge>
                            </td>
                          </tr>
                        ))}
                        {staleAlerts.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-5 py-10 text-center text-brand-muted text-sm">
                              All clear — no overdue devices.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    <Pagination
                      page={alertsPage} totalPages={alertsTotalPages}
                      totalCount={staleAlerts.length} pageSize={STALE_PAGE_SIZE}
                      onPageChange={(p) => setAlertsPage(p)}
                    />
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* ── Team Overview ─────────────────────────────────────────────── */}
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
              {isFetching && !isLoading && <Spinner size="sm" />}
              <div className="hidden sm:flex items-center gap-1.5 bg-positive/10 dark:bg-positive/15 px-3 py-1 rounded-full">
                <MdTrendingUp className="w-4 h-4 text-positive" />
                <span className="text-xs font-semibold text-positive">
                  {allRows.reduce((s, m) => s + (m.sold_count ?? 0), 0)} total sold
                </span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            {isLoading ? (
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
                  {pagedTeam.map((m) => {
                    const remaining = m.assigned_count - m.sold_count
                    const rate      = m.assigned_count > 0 ? Math.round((m.sold_count / m.assigned_count) * 100) : 0
                    const initRow   = m.full_name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
                    return (
                      <tr key={m.id} className="hover:bg-brand-bg transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-inner flex items-center justify-center text-xs font-extrabold flex-shrink-0 ${
                              m.role === 'team_lead'
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                : 'bg-primary/10 dark:bg-primary/20 text-primary'
                            }`}>
                              {initRow}
                            </div>
                            <div>
                              <span className="font-semibold text-brand-text">{m.full_name}</span>
                              {m.stale_phone_count > 0 && (
                                <span className="ml-2 text-[10px] font-bold bg-amber-100 dark:bg-amber-900/20 text-warning dark:text-amber-400 px-1.5 py-0.5 rounded-full">
                                  {m.stale_phone_count} stale
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <Badge variant={m.role === 'team_lead' ? 'blue' : 'green'}>
                            {m.role === 'team_lead' ? 'Team Lead' : 'Agent'}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-brand-text tabular-nums">{m.assigned_count}</td>
                        <td className="px-5 py-3.5 font-bold text-positive tabular-nums">{m.sold_count}</td>
                        <td className="px-5 py-3.5 font-semibold text-accent tabular-nums">{remaining}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-brand-border rounded-full overflow-hidden min-w-[60px]">
                              <div className="h-full bg-gradient-primary rounded-full transition-all duration-500" style={{ width: `${rate}%` }} />
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
                        {dbError ? 'Could not load team data — see error above.' : 'No team members yet.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
            <Pagination
              page={teamPage} totalPages={teamTotalPages}
              totalCount={allRows.length} pageSize={TEAM_PAGE_SIZE}
              onPageChange={(p) => setTeamPage(p)}
            />
          </div>
        </motion.div>

      </div>
    </div>
  )
}
