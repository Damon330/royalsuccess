import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { withTimeout } from '../lib/withTimeout'
import { queryClient } from '../lib/queryClient'

export type HealthStatus = 'checking' | 'healthy' | 'slow' | 'degraded' | 'down'

export interface HealthCheck {
  name:      string
  ok:        boolean
  latencyMs: number | null
  detail:    string | null
}

export interface HealthState {
  status:       HealthStatus
  latencyMs:    number | null
  lastChecked:  Date | null
  errorCode:    string | null
  errorMessage: string | null
  authEmail:    string | null    // What the DB sees for the current session
  isAdmin:      boolean | null   // Whether DB agrees this is an admin
  checks:       HealthCheck[]
  consecutive:  number
}

const LATENCY_SLOW_MS  = 2_000
const LATENCY_BAD_MS   = 5_000
const POLL_INTERVAL_MS = 30_000

const INITIAL: HealthState = {
  status: 'checking', latencyMs: null, lastChecked: null,
  errorCode: null, errorMessage: null, authEmail: null, isAdmin: null,
  checks: [], consecutive: 0,
}

export function useSystemHealth() {
  const [health,  setHealth]  = useState<HealthState>(INITIAL)
  const wasDownRef     = useRef(false)
  const consecutiveRef = useRef(0)
  const intervalRef    = useRef<ReturnType<typeof setInterval>>()

  const check = useCallback(async () => {
    setHealth((prev) => ({
      ...prev,
      status: prev.status === 'down' || prev.status === 'healthy' ? 'checking' : prev.status,
    }))

    const checks: HealthCheck[] = []
    let anyFailed        = false
    let errorCode:    string | null = null
    let errorMessage: string | null = null
    let authEmail:    string | null = null
    let isAdmin:      boolean | null = null

    // ── Check 1: health_check() RPC ─────────────────────────────────────
    // Returns exact email the DB sees + is_admin flag.
    // If the RPC doesn't exist yet (migration not run), fall back to raw query.
    const t0 = Date.now()
    try {
      const { data, error } = await withTimeout(supabase.rpc('health_check'), 35_000)
      const latency = Date.now() - t0

      if (error) {
        // RPC might not exist yet — fall through to raw query check
        checks.push({
          name: 'DB Health RPC',
          ok: false,
          latencyMs: latency,
          detail: `[${error.code ?? 'ERR'}] ${error.message} — run v2-full-migration.sql`,
        })
        errorCode    = error.code ?? null
        errorMessage = error.message
        anyFailed    = true
      } else {
        const hc = data as { ok: boolean; is_admin: boolean; auth_email: string; ts: number }
        authEmail = hc?.auth_email ?? null
        isAdmin   = hc?.is_admin  ?? null
        checks.push({
          name: 'DB Health RPC',
          ok: true,
          latencyMs: latency,
          detail: `Connected · email=${hc?.auth_email ?? 'null'} · is_admin=${hc?.is_admin}`,
        })

        // Warn if admin email doesn't match (JWT issue)
        if (hc?.is_admin === false && hc?.auth_email && hc.auth_email !== 'unauthenticated') {
          checks.push({
            name: 'Admin JWT Check',
            ok: false,
            latencyMs: null,
            detail: `DB sees email "${hc.auth_email}" but admin_email is "patrickwlax@gmail.com". Sign out and back in.`,
          })
          anyFailed    = true
          errorMessage = `Admin email mismatch: DB sees "${hc.auth_email}". Sign out and sign in again.`
        } else if (hc?.is_admin === true) {
          checks.push({ name: 'Admin JWT Check', ok: true, latencyMs: null, detail: 'Admin identity confirmed by DB' })
        }
      }
    } catch (err) {
      const latency = Date.now() - t0
      errorMessage = err instanceof Error ? err.message : String(err)
      checks.push({ name: 'DB Health RPC', ok: false, latencyMs: latency, detail: errorMessage })
      anyFailed = true
    }

    // ── Check 2: Auth session ────────────────────────────────────────────
    const t1 = Date.now()
    try {
      const { data: { session }, error: sErr } = await supabase.auth.getSession()
      const latency = Date.now() - t1

      if (sErr || !session) {
        checks.push({ name: 'Auth Session', ok: false, latencyMs: latency, detail: sErr?.message ?? 'No active session — please sign in' })
        anyFailed = true
        if (!errorMessage) errorMessage = 'No active session'
      } else {
        const expiresIn = (session.expires_at ?? 0) - Math.floor(Date.now() / 1000)
        if (expiresIn < 300) {
          await supabase.auth.refreshSession()
          checks.push({ name: 'Auth Session', ok: true, latencyMs: latency, detail: 'Token auto-refreshed (was expiring)' })
        } else {
          checks.push({ name: 'Auth Session', ok: true, latencyMs: latency, detail: `Valid for ${Math.floor(expiresIn / 60)}m · ${session.user.email}` })
        }
      }
    } catch (err) {
      checks.push({ name: 'Auth Session', ok: false, latencyMs: Date.now() - t1, detail: String(err) })
      anyFailed = true
    }

    const totalLatency = checks.reduce((s, c) => s + (c.latencyMs ?? 0), 0)

    if (anyFailed) {
      consecutiveRef.current += 1
      wasDownRef.current = true
      const status: HealthStatus = consecutiveRef.current === 1 ? 'degraded' : 'down'
      setHealth({
        status,
        latencyMs:    totalLatency,
        lastChecked:  new Date(),
        errorCode,
        errorMessage,
        authEmail,
        isAdmin,
        checks,
        consecutive: consecutiveRef.current,
      })
    } else {
      if (wasDownRef.current) {
        queryClient.invalidateQueries()
        wasDownRef.current = false
      }
      consecutiveRef.current = 0

      const worstLatency = Math.max(...checks.map((c) => c.latencyMs ?? 0))
      const status: HealthStatus =
        worstLatency > LATENCY_BAD_MS  ? 'degraded' :
        worstLatency > LATENCY_SLOW_MS ? 'slow'      : 'healthy'

      setHealth({
        status, latencyMs: totalLatency, lastChecked: new Date(),
        errorCode: null, errorMessage: null, authEmail, isAdmin,
        checks, consecutive: 0,
      })
    }
  }, [])

  useEffect(() => {
    check()
    intervalRef.current = setInterval(check, POLL_INTERVAL_MS)

    function onVisibility() {
      if (document.visibilityState === 'visible') check()
    }
    function onOnline() { check() }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
    }
  }, [check])

  return { health, recheckNow: check }
}
