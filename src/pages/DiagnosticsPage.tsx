import { useState, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { withTimeout } from '../lib/withTimeout'
import { useErrorLog, clearErrorLog } from '../lib/errorLog'
import Header from '../components/shared/Header'
import Spinner from '../components/shared/Spinner'
import {
  MdCheckCircle, MdError, MdWarning, MdHelpOutline,
  MdRefresh, MdContentCopy, MdDelete, MdExpandMore, MdExpandLess,
} from 'react-icons/md'
import toast from 'react-hot-toast'

// ── Types ──────────────────────────────────────────────────────────────────────

type Status = 'pending' | 'running' | 'ok' | 'warn' | 'error'

interface Check {
  id:        string
  label:     string
  group:     string
  status:    Status
  latencyMs: number | null
  detail:    string | null
  raw?:      unknown
}

// ── Status icon ────────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: Status }) {
  if (status === 'running') return <Spinner size="sm" />
  if (status === 'ok')      return <MdCheckCircle className="w-4 h-4 text-positive flex-shrink-0" />
  if (status === 'warn')    return <MdWarning     className="w-4 h-4 text-accent flex-shrink-0" />
  if (status === 'error')   return <MdError       className="w-4 h-4 text-negative flex-shrink-0" />
  return <MdHelpOutline className="w-4 h-4 text-brand-muted flex-shrink-0" />
}

// ── Check row ─────────────────────────────────────────────────────────────────

function CheckRow({ check }: { check: Check }) {
  const [expanded, setExpanded] = useState(check.status === 'error')

  useEffect(() => {
    if (check.status === 'error') setExpanded(true)
  }, [check.status])

  const rowBg =
    check.status === 'ok'    ? 'bg-positive/5 border-positive/20' :
    check.status === 'error' ? 'bg-negative/5 border-negative/20' :
    check.status === 'warn'  ? 'bg-accent/5 border-accent/20'     :
    'bg-brand-surface border-brand-border'

  return (
    <div className={`rounded-xl border ${rowBg} overflow-hidden`}>
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        onClick={() => setExpanded(v => !v)}
      >
        <StatusIcon status={check.status} />

        <span className="flex-1 text-sm font-mono font-medium text-brand-text truncate">
          {check.label}
        </span>

        {check.latencyMs !== null && (
          <span className="text-xs text-brand-muted tabular-nums flex-shrink-0">
            {check.latencyMs}ms
          </span>
        )}

        <button className="text-brand-muted flex-shrink-0">
          {expanded ? <MdExpandLess className="w-4 h-4" /> : <MdExpandMore className="w-4 h-4" />}
        </button>
      </div>

      {expanded && check.detail && (
        <div className="px-4 pb-3 pt-0 border-t border-brand-border/50">
          <p className="text-xs font-mono text-brand-muted break-all whitespace-pre-wrap leading-relaxed">
            {check.detail}
          </p>
          {check.raw !== undefined && (
            <details className="mt-2">
              <summary className="text-xs text-brand-muted cursor-pointer hover:text-brand-text">
                Raw response
              </summary>
              <pre className="mt-1 text-xs font-mono text-brand-muted bg-brand-bg rounded-lg p-3 overflow-x-auto">
                {JSON.stringify(check.raw, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

// ── Initial checks skeleton ────────────────────────────────────────────────────

function makeChecks(): Check[] {
  return [
    // Environment
    { id: 'env_url',       group: 'Environment',           label: 'VITE_SUPABASE_URL',          status: 'pending', latencyMs: null, detail: null },
    { id: 'env_key',       group: 'Environment',           label: 'VITE_SUPABASE_ANON_KEY',     status: 'pending', latencyMs: null, detail: null },
    { id: 'env_admin',     group: 'Environment',           label: 'VITE_ADMIN_EMAIL',            status: 'pending', latencyMs: null, detail: null },
    // Auth
    { id: 'auth_session',  group: 'Authentication',        label: 'Auth Session',                status: 'pending', latencyMs: null, detail: null },
    { id: 'auth_match',    group: 'Authentication',        label: 'Admin Email Match (frontend)', status: 'pending', latencyMs: null, detail: null },
    // Health RPC
    { id: 'rpc_health',    group: 'Database — Health RPC', label: 'health_check()',              status: 'pending', latencyMs: null, detail: null },
    // Admin RPCs
    { id: 'rpc_phones',    group: 'Database — Admin RPCs', label: 'admin_get_phones()',          status: 'pending', latencyMs: null, detail: null },
    { id: 'rpc_profiles',  group: 'Database — Admin RPCs', label: 'admin_get_profiles()',        status: 'pending', latencyMs: null, detail: null },
    { id: 'rpc_stats',     group: 'Database — Admin RPCs', label: 'admin_dashboard_stats()',     status: 'pending', latencyMs: null, detail: null },
    { id: 'rpc_team',      group: 'Database — Admin RPCs', label: 'admin_team_overview()',       status: 'pending', latencyMs: null, detail: null },
    { id: 'rpc_stale',     group: 'Database — Admin RPCs', label: 'admin_stale_alerts()',        status: 'pending', latencyMs: null, detail: null },
    // Direct table access (compare with RPC to isolate RLS vs RPC issues)
    { id: 'tbl_profiles',  group: 'Direct Table (RLS)',    label: 'SELECT FROM profiles',        status: 'pending', latencyMs: null, detail: null },
    { id: 'tbl_phones',    group: 'Direct Table (RLS)',    label: 'SELECT FROM phones',          status: 'pending', latencyMs: null, detail: null },
  ]
}

// ── Run all checks ─────────────────────────────────────────────────────────────

async function executeChecks(
  _checks: Check[],
  update: (id: string, patch: Partial<Check>) => void,
) {
  // ── Environment (synchronous) ──────────────────────────────────────
  update('env_url', {
    status: import.meta.env.VITE_SUPABASE_URL ? 'ok' : 'error',
    detail: import.meta.env.VITE_SUPABASE_URL
      ? String(import.meta.env.VITE_SUPABASE_URL)
      : 'MISSING — app cannot connect to Supabase. Add VITE_SUPABASE_URL to .env',
  })

  update('env_key', {
    status: import.meta.env.VITE_SUPABASE_ANON_KEY ? 'ok' : 'error',
    detail: import.meta.env.VITE_SUPABASE_ANON_KEY
      ? `eyJ... (${String(import.meta.env.VITE_SUPABASE_ANON_KEY).length} chars)`
      : 'MISSING — add VITE_SUPABASE_ANON_KEY to .env',
  })

  const adminEmailEnv = String(import.meta.env.VITE_ADMIN_EMAIL ?? '')
  update('env_admin', {
    status: adminEmailEnv ? 'ok' : 'warn',
    detail: adminEmailEnv
      ? adminEmailEnv
      : 'Not set in .env — is_admin() falls back to hardcoded "patrickwlax@gmail.com"',
  })

  // ── Auth session ──────────────────────────────────────────────────
  update('auth_session', { status: 'running' })
  const tAuth = Date.now()
  let sessionEmail: string | null = null
  try {
    const { data: { session }, error } = await supabase.auth.getSession()
    const lat = Date.now() - tAuth
    if (error || !session) {
      update('auth_session', {
        status: 'error',
        latencyMs: lat,
        detail: error?.message ?? 'No active session — sign out and sign back in',
      })
      update('auth_match', { status: 'warn', detail: 'Cannot check — no session' })
    } else {
      const expiresIn = (session.expires_at ?? 0) - Math.floor(Date.now() / 1000)
      sessionEmail = session.user.email?.toLowerCase() ?? null
      update('auth_session', {
        status: expiresIn > 60 ? 'ok' : expiresIn > 0 ? 'warn' : 'error',
        latencyMs: lat,
        detail: expiresIn > 0
          ? `${session.user.email}\nExpires in: ${Math.floor(expiresIn / 60)}m ${expiresIn % 60}s\nUser ID: ${session.user.id}`
          : `TOKEN EXPIRED ${Math.abs(expiresIn)}s ago — sign out and sign back in`,
        raw: {
          email:      session.user.email,
          user_id:    session.user.id,
          expires_at: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
        },
      })

      const adminExpected = (adminEmailEnv || 'patrickwlax@gmail.com').toLowerCase()
      const matches       = sessionEmail === adminExpected
      update('auth_match', {
        status: matches ? 'ok' : 'error',
        detail: matches
          ? `"${session.user.email}" matches admin config ✓`
          : `MISMATCH — session email "${session.user.email}" ≠ admin config "${adminEmailEnv || 'patrickwlax@gmail.com'}"\n→ The is_admin() DB function will return false → all admin RPCs will fail`,
      })
    }
  } catch (err) {
    update('auth_session', { status: 'error', latencyMs: Date.now() - tAuth, detail: String(err) })
    update('auth_match',   { status: 'warn',  detail: 'Cannot check — getSession() threw' })
  }

  // ── health_check() RPC ────────────────────────────────────────────
  update('rpc_health', { status: 'running' })
  const tH = Date.now()
  try {
    const { data, error } = await withTimeout(supabase.rpc('health_check'), 10_000)
    const lat = Date.now() - tH
    if (error) {
      update('rpc_health', {
        status: 'error', latencyMs: lat,
        detail: `[${error.code ?? 'ERR'}] ${error.message}\nHint: ${error.hint ?? 'run v2-full-migration.sql'}`,
      })
    } else {
      const hc = data as { ok?: boolean; is_admin?: boolean; auth_email?: string; ts?: number } | null
      const isAdminOk = hc?.is_admin === true
      update('rpc_health', {
        status:    hc?.ok ? (isAdminOk ? 'ok' : 'warn') : 'error',
        latencyMs: lat,
        detail:    `ok=${hc?.ok}\nauth_email=${hc?.auth_email ?? 'null'}\nis_admin=${hc?.is_admin ?? 'null'}\nts=${hc?.ts ?? 'null'}\n\n${!isAdminOk && hc?.auth_email && hc.auth_email !== 'unauthenticated' ? `⚠ DB sees "${hc.auth_email}" — is_admin()=false. Sign out + sign in to refresh JWT.` : ''}`,
        raw: hc,
      })
    }
  } catch (err) {
    update('rpc_health', { status: 'error', latencyMs: Date.now() - tH, detail: String(err) })
  }

  // ── Admin RPCs (parallel) ──────────────────────────────────────────
  const rpcDefs = [
    { id: 'rpc_phones',   fn: () => supabase.rpc('admin_get_phones')   },
    { id: 'rpc_profiles', fn: () => supabase.rpc('admin_get_profiles') },
    { id: 'rpc_stats',    fn: () => supabase.rpc('admin_dashboard_stats') },
    { id: 'rpc_team',     fn: () => supabase.rpc('admin_team_overview') },
    { id: 'rpc_stale',    fn: () => supabase.rpc('admin_stale_alerts', { p_agent_days: 3, p_teamlead_days: 14 }) },
  ]

  rpcDefs.forEach(r => update(r.id, { status: 'running' }))

  await Promise.all(rpcDefs.map(async (r) => {
    const t = Date.now()
    try {
      const { data, error } = await withTimeout(r.fn(), 15_000)
      const lat = Date.now() - t
      if (error) {
        update(r.id, {
          status: 'error', latencyMs: lat,
          detail: `[${error.code ?? 'ERR'}] ${error.message}${error.hint ? '\nHint: ' + error.hint : ''}${error.details ? '\nDetails: ' + error.details : ''}`,
          raw: { error },
        })
      } else {
        const count = Array.isArray(data) ? data.length : null
        update(r.id, {
          status: 'ok', latencyMs: lat,
          detail: count !== null
            ? `${count} row(s) returned`
            : `Result: ${JSON.stringify(data).slice(0, 200)}`,
          raw: Array.isArray(data) ? data.slice(0, 3) : data,
        })
      }
    } catch (err) {
      update(r.id, { status: 'error', latencyMs: Date.now() - t, detail: String(err) })
    }
  }))

  // ── Direct table access ────────────────────────────────────────────
  const tblDefs = [
    { id: 'tbl_profiles', table: 'profiles' },
    { id: 'tbl_phones',   table: 'phones'   },
  ]

  tblDefs.forEach(r => update(r.id, { status: 'running' }))

  await Promise.all(tblDefs.map(async (r) => {
    const t = Date.now()
    try {
      const { count, data, error } = await withTimeout(
        supabase.from(r.table).select('*', { count: 'exact', head: true }),
        10_000,
      )
      const lat = Date.now() - t
      if (error) {
        update(r.id, {
          status: 'error', latencyMs: lat,
          detail: `[${error.code ?? 'ERR'}] ${error.message}${error.hint ? '\nHint: ' + error.hint : ''}`,
        })
      } else {
        update(r.id, {
          status: 'ok', latencyMs: lat,
          detail: `${count ?? 0} row(s) visible to current session via RLS\n(Admin RPC would see all rows regardless of RLS)`,
        })
      }
      void data
    } catch (err) {
      update(r.id, { status: 'error', latencyMs: Date.now() - t, detail: String(err) })
    }
  }))
}

// ── Group helper ───────────────────────────────────────────────────────────────

function groupChecks(checks: Check[]) {
  const groups: Record<string, Check[]> = {}
  for (const c of checks) {
    if (!groups[c.group]) groups[c.group] = []
    groups[c.group].push(c)
  }
  return groups
}

// ── Summary counts ─────────────────────────────────────────────────────────────

function SummaryBadge({ checks }: { checks: Check[] }) {
  const errors  = checks.filter(c => c.status === 'error').length
  const warns   = checks.filter(c => c.status === 'warn').length
  const ok      = checks.filter(c => c.status === 'ok').length
  const running = checks.some(c => c.status === 'running' || c.status === 'pending')

  if (running) return <span className="text-xs text-brand-muted">Running…</span>

  return (
    <div className="flex items-center gap-2 text-xs font-semibold">
      {errors > 0 && <span className="text-negative">{errors} error{errors !== 1 ? 's' : ''}</span>}
      {warns  > 0 && <span className="text-accent">{warns} warning{warns !== 1 ? 's' : ''}</span>}
      {ok     > 0 && <span className="text-positive">{ok} passed</span>}
    </div>
  )
}

// ── Copy report ────────────────────────────────────────────────────────────────

function buildReport(checks: Check[]): string {
  const lines: string[] = [
    `Royal Success — Diagnostic Report`,
    `Generated: ${new Date().toISOString()}`,
    `URL: ${window.location.href}`,
    '',
  ]
  const groups = groupChecks(checks)
  for (const [group, items] of Object.entries(groups)) {
    lines.push(`=== ${group} ===`)
    for (const c of items) {
      const icon = c.status === 'ok' ? '✓' : c.status === 'error' ? '✗' : c.status === 'warn' ? '!' : '?'
      lines.push(`  [${icon}] ${c.label}${c.latencyMs !== null ? ` (${c.latencyMs}ms)` : ''}`)
      if (c.detail) lines.push(`       ${c.detail.replace(/\n/g, '\n       ')}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function DiagnosticsPage() {
  const [checks,  setChecks]  = useState<Check[]>(makeChecks)
  const [running, setRunning] = useState(false)
  const errorLog = useErrorLog()

  function applyUpdate(id: string, patch: Partial<Check>) {
    setChecks(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
  }

  const run = useCallback(async () => {
    const fresh = makeChecks()
    setChecks(fresh)
    setRunning(true)
    try {
      await executeChecks(fresh, applyUpdate)
    } finally {
      setRunning(false)
    }
  }, [])

  // Auto-run on mount
  useEffect(() => { run() }, [run])

  function copyReport() {
    const text = buildReport(checks)
    navigator.clipboard.writeText(text).then(() => {
      toast.success('Report copied to clipboard.')
    }).catch(() => {
      toast.error('Could not copy — paste manually from console.')
      console.log(text)
    })
  }

  const groups = groupChecks(checks)

  return (
    <div className="flex-1 overflow-y-auto bg-brand-bg">
      <Header title="Diagnostics" subtitle="System checks" />

      <div className="p-4 sm:p-6 space-y-6 max-w-3xl">

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3">
          <SummaryBadge checks={checks} />
          <div className="flex items-center gap-2">
            <button
              onClick={copyReport}
              disabled={running}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold text-brand-muted bg-brand-surface border border-brand-border hover:bg-brand-bg transition-colors disabled:opacity-40"
            >
              <MdContentCopy className="w-3.5 h-3.5" /> Copy Report
            </button>
            <button
              onClick={run}
              disabled={running}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold text-white bg-primary hover:bg-primary-light transition-colors disabled:opacity-50"
            >
              {running ? <Spinner size="sm" /> : <MdRefresh className="w-4 h-4" />}
              Re-run All
            </button>
          </div>
        </div>

        {/* Check groups */}
        {Object.entries(groups).map(([groupName, items]) => (
          <section key={groupName} className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="section-label">{groupName}</h2>
              <div className="flex-1 h-px bg-brand-border" />
              <span className="text-[10px] font-bold text-brand-muted uppercase tracking-wide">
                {items.filter(c => c.status === 'error').length > 0
                  ? `${items.filter(c => c.status === 'error').length} error(s)`
                  : items.filter(c => c.status === 'ok').length === items.length
                    ? 'All OK'
                    : ''}
              </span>
            </div>
            <div className="space-y-1.5">
              {items.map(c => <CheckRow key={c.id} check={c} />)}
            </div>
          </section>
        ))}

        {/* Runtime error log */}
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="section-label">Runtime Error Log</h2>
            <div className="flex-1 h-px bg-brand-border" />
            <button
              onClick={clearErrorLog}
              className="flex items-center gap-1 text-[10px] font-bold text-brand-muted hover:text-negative uppercase tracking-wide transition-colors"
            >
              <MdDelete className="w-3 h-3" /> Clear
            </button>
          </div>

          {errorLog.length === 0 ? (
            <div className="bg-brand-surface border border-brand-border rounded-xl px-4 py-6 text-center">
              <MdCheckCircle className="w-6 h-6 text-positive mx-auto mb-1" />
              <p className="text-sm text-brand-muted">No runtime errors captured yet.</p>
              <p className="text-xs text-brand-muted mt-0.5">
                Errors from hooks and components appear here automatically.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
              {errorLog.map(e => (
                <div
                  key={e.id}
                  className="bg-negative/5 border border-negative/20 rounded-xl px-4 py-3 space-y-0.5"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-bold text-negative font-mono">{e.source}</span>
                    <span className="text-[10px] text-brand-muted ml-auto flex-shrink-0">
                      {e.ts.toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-brand-text break-all">{e.message}</p>
                  {e.code    && <p className="text-[10px] font-mono text-brand-muted">code: {e.code}</p>}
                  {e.detail  && <p className="text-[10px] font-mono text-brand-muted break-all">{e.detail}</p>}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Instructions */}
        <section className="bg-brand-surface border border-brand-border rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-brand-text">How to use this page</h2>
          <ol className="space-y-1.5 text-sm text-brand-muted list-decimal list-inside">
            <li>Click <strong>Re-run All</strong> to get a fresh snapshot of every system check.</li>
            <li>Expand any <span className="text-negative font-medium">red (error)</span> row to see the exact error code and message.</li>
            <li>Compare <strong>Admin RPCs</strong> vs <strong>Direct Table</strong> — if RPC fails but table works, the RLS grant is missing. If both fail, the session is invalid.</li>
            <li>If <strong>health_check → is_admin=false</strong>, sign out and sign back in to refresh the JWT.</li>
            <li>Click <strong>Copy Report</strong> and share with the developer to diagnose remotely.</li>
          </ol>
        </section>

      </div>
    </div>
  )
}
