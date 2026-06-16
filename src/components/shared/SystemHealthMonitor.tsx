import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useHealth, type HealthStatus } from '../../context/SystemHealthContext'
import {
  MdCheckCircle, MdWarning, MdError, MdRefresh,
  MdExpandMore, MdExpandLess, MdSpeed, MdCloud,
  MdWifiOff, MdInfo,
} from 'react-icons/md'

const STATUS_CFG: Record<HealthStatus, { icon: React.ReactNode; label: string }> = {
  checking: { icon: <MdCloud   className="w-4 h-4 text-brand-muted" />,  label: 'Checking system…'          },
  healthy:  { icon: <MdCheckCircle className="w-4 h-4 text-positive" />, label: 'All systems operational'   },
  slow:     { icon: <MdSpeed   className="w-4 h-4 text-amber-500" />,   label: 'Slow connection detected'  },
  degraded: { icon: <MdWarning className="w-4 h-4 text-orange-500" />,  label: 'Connection degraded'       },
  down:     { icon: <MdError   className="w-4 h-4 text-negative" />,    label: 'Database unreachable'       },
}

// ── Animated pulse dot ─────────────────────────────────────────────────────
function PingDot({ status }: { status: HealthStatus }) {
  const color: Record<HealthStatus, string> = {
    checking: 'bg-brand-muted',
    healthy:  'bg-positive',
    slow:     'bg-amber-400',
    degraded: 'bg-orange-400',
    down:     'bg-negative',
  }
  const animate = status !== 'healthy' && status !== 'checking'
  return (
    <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
      {animate && (
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color[status]} opacity-60`} />
      )}
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${color[status]}`} />
    </span>
  )
}

// ── Main alert banner — renders in AdminLayout above the page ──────────────
export default function SystemHealthMonitor() {
  const { health, recheckNow } = useHealth()
  const [checking, setChecking] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const show    = health.status !== 'healthy' && health.status !== 'checking'
  const cfg     = STATUS_CFG[health.status]
  const timeAgo = health.lastChecked
    ? `${Math.round((Date.now() - health.lastChecked.getTime()) / 1000)}s ago`
    : ''

  async function handleRecheck() {
    setChecking(true)
    await recheckNow()
    setChecking(false)
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="health-banner"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="overflow-hidden flex-shrink-0"
        >
          <div className={`border-b border-brand-border/60 ${
            health.status === 'down'     ? 'bg-red-50   dark:bg-red-950/30'    :
            health.status === 'degraded' ? 'bg-orange-50 dark:bg-orange-950/20' :
                                           'bg-amber-50  dark:bg-amber-950/20'
          }`}>
            {/* Main row */}
            <div className="px-4 sm:px-5 py-2.5 flex items-start gap-3">
              <div className="mt-0.5 flex-shrink-0">{cfg.icon}</div>

              <div className="flex-1 min-w-0">
                {/* Title row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-sm font-bold leading-none ${
                    health.status === 'down'     ? 'text-negative'                          :
                    health.status === 'degraded' ? 'text-orange-600 dark:text-orange-400'   :
                                                   'text-amber-700  dark:text-amber-400'
                  }`}>
                    {cfg.label}
                  </p>
                  {health.consecutive > 1 && (
                    <span className="text-[10px] font-bold bg-negative/10 text-negative px-2 py-0.5 rounded-full">
                      {health.consecutive}× failed
                    </span>
                  )}
                </div>

                {/* Error detail */}
                {health.errorMessage && (
                  <p className="text-xs text-brand-muted mt-1 font-mono break-all leading-relaxed">
                    {health.errorCode && (
                      <span className="font-bold text-negative mr-1">[{health.errorCode}]</span>
                    )}
                    {health.errorMessage}
                  </p>
                )}

                {/* Context-aware hints */}
                {health.errorMessage?.toLowerCase().includes('timeout') && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                    Supabase free-tier projects pause after 1 week of inactivity. Resume at{' '}
                    <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="underline font-semibold">supabase.com/dashboard</a>, then Retry.
                  </p>
                )}
                {health.errorMessage?.toLowerCase().includes('jwt') && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                    Session expired — sign out and back in to refresh your token.
                  </p>
                )}
                {health.errorMessage?.toLowerCase().includes('mismatch') && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                    The DB sees a different email than expected. Sign out fully, clear browser cache, and sign in again.
                  </p>
                )}
                {(health.errorCode === '42501' || health.errorMessage?.toLowerCase().includes('permission denied')) && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                    RLS blocked the query. Run <span className="font-mono font-bold">supabase/v2-full-migration.sql</span> in the Supabase SQL Editor, then Retry.
                  </p>
                )}
                {(health.errorCode === 'PGRST202' || health.errorMessage?.toLowerCase().includes('could not find the function')) && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                    Missing RPC functions. Run <span className="font-mono font-bold">supabase/v2-full-migration.sql</span> in the Supabase SQL Editor.
                  </p>
                )}
                {(health.errorCode === 'PGRST301' || health.errorCode === '42P01') && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                    Table not found. Run the latest migration file from the <span className="font-mono font-bold">supabase/</span> folder.
                  </p>
                )}
                {/* Show what email the DB actually sees — key diagnostic info */}
                {health.authEmail && health.authEmail !== 'unauthenticated' && (
                  <p className="text-[11px] text-brand-muted mt-1 font-mono">
                    DB email: <span className="font-bold text-brand-text">{health.authEmail}</span>
                    {health.isAdmin === false && (
                      <span className="text-negative font-bold"> (not recognized as admin)</span>
                    )}
                    {health.isAdmin === true && (
                      <span className="text-positive font-bold"> ✓ admin</span>
                    )}
                  </p>
                )}
              </div>

              {/* Buttons */}
              <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                <button
                  onClick={() => setExpanded((v) => !v)}
                  title={expanded ? 'Hide diagnostics' : 'Show diagnostics'}
                  className="w-7 h-7 rounded-inner flex items-center justify-center text-brand-muted hover:text-brand-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  {expanded
                    ? <MdExpandLess className="w-4 h-4" />
                    : <MdExpandMore  className="w-4 h-4" />
                  }
                </button>
                <button
                  onClick={handleRecheck}
                  disabled={checking}
                  className="flex items-center gap-1.5 text-xs font-bold text-white bg-negative hover:bg-negative/80 disabled:opacity-50 px-3 py-1.5 rounded-full transition-colors"
                >
                  <MdRefresh className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
                  {checking ? 'Checking…' : 'Retry'}
                </button>
              </div>
            </div>

            {/* Diagnostic accordion */}
            <AnimatePresence>
              {expanded && health.checks.length > 0 && (
                <motion.div
                  initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="mx-4 sm:mx-5 mb-3 rounded-inner bg-brand-bg border border-brand-border p-3.5 space-y-2.5">
                    <div className="flex items-center gap-1.5">
                      <MdInfo className="w-3.5 h-3.5 text-brand-muted" />
                      <p className="text-[10px] font-extrabold text-brand-muted uppercase tracking-widest">
                        Diagnostic Report — checked {timeAgo}
                      </p>
                    </div>

                    {health.checks.map((c) => (
                      <div key={c.name} className="flex items-start gap-2.5">
                        {c.ok
                          ? <MdCheckCircle className="w-3.5 h-3.5 text-positive mt-0.5 flex-shrink-0" />
                          : <MdError       className="w-3.5 h-3.5 text-negative mt-0.5 flex-shrink-0" />
                        }
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-brand-text">{c.name}</span>
                            {c.latencyMs !== null && (
                              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                c.latencyMs > 3000 ? 'bg-negative/10 text-negative'                          :
                                c.latencyMs > 1500 ? 'bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400' :
                                                     'bg-positive/10 text-positive'
                              }`}>
                                {c.latencyMs}ms
                              </span>
                            )}
                          </div>
                          {c.detail && (
                            <p className="text-[11px] text-brand-muted font-mono mt-0.5 break-all">{c.detail}</p>
                          )}
                        </div>
                      </div>
                    ))}

                    <div className="pt-2 mt-1 border-t border-brand-border">
                      <p className="text-[10px] font-extrabold text-brand-muted uppercase tracking-widest mb-1.5">Suggested actions</p>
                      <ul className="text-[11px] text-brand-muted space-y-1.5 list-disc list-inside">
                        <li>
                          Check{' '}
                          <a href="https://status.supabase.com" target="_blank" rel="noreferrer" className="text-primary underline">
                            status.supabase.com
                          </a>{' '}
                          for outages
                        </li>
                        <li>
                          Resume a paused project at{' '}
                          <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="text-primary underline">
                            supabase.com/dashboard
                          </a>
                        </li>
                        <li>Run <span className="font-mono">supabase/fix-all-rls.sql</span> in Supabase SQL Editor for permission errors</li>
                        <li>Sign out and back in for JWT / session errors</li>
                      </ul>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Compact chip — used in Sidebar footer ──────────────────────────────────
export function HealthStatusChip() {
  const { health, recheckNow } = useHealth()
  const [checking, setChecking] = useState(false)

  async function handleClick() {
    setChecking(true)
    await recheckNow()
    setChecking(false)
  }

  const label: Record<HealthStatus, string> = {
    checking: 'Checking…',
    healthy:  'Connected',
    slow:     'Slow',
    degraded: 'Degraded',
    down:     'Disconnected',
  }

  return (
    <button
      onClick={handleClick}
      disabled={checking}
      title={health.errorMessage ?? label[health.status]}
      className="flex items-center gap-2 w-full px-3 py-2 rounded-inner hover:bg-brand-bg transition-colors group"
    >
      <PingDot status={checking ? 'checking' : health.status} />
      <span className={`flex-1 text-left text-xs font-semibold ${
        health.status === 'healthy'  ? 'text-positive'    :
        health.status === 'down'     ? 'text-negative'    :
        health.status === 'checking' ? 'text-brand-muted' :
                                       'text-amber-500'
      }`}>
        {checking ? 'Checking…' : label[health.status]}
      </span>
      {health.latencyMs !== null && health.status === 'healthy' && (
        <span className="text-[10px] font-mono text-brand-muted">{health.latencyMs}ms</span>
      )}
      {health.status !== 'healthy' && (
        <MdWifiOff className="w-3.5 h-3.5 text-negative flex-shrink-0" />
      )}
      <MdRefresh className={`w-3.5 h-3.5 text-brand-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ${checking ? 'animate-spin !opacity-100' : ''}`} />
    </button>
  )
}
