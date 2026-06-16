import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
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
  checks:       HealthCheck[]
  consecutive:  number
}

const LATENCY_SLOW_MS  = 2_000
const LATENCY_BAD_MS   = 5_000
const POLL_INTERVAL_MS = 30_000

const INITIAL: HealthState = {
  status: 'checking', latencyMs: null, lastChecked: null,
  errorCode: null, errorMessage: null, checks: [], consecutive: 0,
}

export function useSystemHealth() {
  const [health,  setHealth]  = useState<HealthState>(INITIAL)
  const wasDownRef   = useRef(false)
  const consecutiveRef = useRef(0)
  const intervalRef  = useRef<ReturnType<typeof setInterval>>()

  const check = useCallback(async () => {
    setHealth((prev) => ({ ...prev, status: prev.status === 'down' ? 'checking' : prev.status }))

    const checks: HealthCheck[] = []
    let anyFailed = false

    // ── Check 1: session validity ───────────────────────────────────────
    const sessionStart = Date.now()
    try {
      const { data: { session }, error: sErr } = await supabase.auth.getSession()
      const sessionLatency = Date.now() - sessionStart
      if (sErr || !session) {
        checks.push({ name: 'Auth Session', ok: false, latencyMs: sessionLatency, detail: sErr?.message ?? 'No active session' })
        anyFailed = true
      } else {
        // Check if token expires soon (< 5 minutes) and proactively refresh
        const expiresIn = (session.expires_at ?? 0) - Math.floor(Date.now() / 1000)
        if (expiresIn < 300) {
          await supabase.auth.refreshSession()
          checks.push({ name: 'Auth Session', ok: true, latencyMs: sessionLatency, detail: 'Token refreshed (was expiring soon)' })
        } else {
          checks.push({ name: 'Auth Session', ok: true, latencyMs: sessionLatency, detail: `Token valid for ${Math.floor(expiresIn / 60)}m` })
        }
      }
    } catch (err) {
      checks.push({ name: 'Auth Session', ok: false, latencyMs: Date.now() - sessionStart, detail: String(err) })
      anyFailed = true
    }

    // ── Check 2: DB connectivity (profiles table — lightweight) ─────────
    const dbStart = Date.now()
    let dbLatency = 0
    let dbErrorCode: string | null = null
    let dbErrorMessage: string | null = null
    try {
      const { data, error: dbErr } = await supabase
        .from('profiles').select('id').limit(1)
      dbLatency = Date.now() - dbStart

      if (dbErr) {
        dbErrorCode    = dbErr.code ?? null
        dbErrorMessage = dbErr.message
        checks.push({ name: 'Database', ok: false, latencyMs: dbLatency, detail: `${dbErr.code ? `[${dbErr.code}] ` : ''}${dbErr.message}` })
        anyFailed = true
      } else {
        checks.push({ name: 'Database', ok: true, latencyMs: dbLatency, detail: data !== null ? 'Reachable' : 'Reachable (empty)' })
      }
    } catch (err) {
      dbLatency = Date.now() - dbStart
      dbErrorMessage = err instanceof Error ? err.message : String(err)
      checks.push({ name: 'Database', ok: false, latencyMs: dbLatency, detail: dbErrorMessage })
      anyFailed = true
    }

    // ── Check 3: phones table access ────────────────────────────────────
    const phonesStart = Date.now()
    try {
      const { error: pErr } = await supabase
        .from('phones').select('id').limit(1)
      const phonesLatency = Date.now() - phonesStart

      if (pErr) {
        checks.push({ name: 'Phones Table', ok: false, latencyMs: phonesLatency, detail: `${pErr.code ? `[${pErr.code}] ` : ''}${pErr.message}` })
        anyFailed = true
        if (!dbErrorMessage) { dbErrorCode = pErr.code ?? null; dbErrorMessage = pErr.message }
      } else {
        checks.push({ name: 'Phones Table', ok: true, latencyMs: phonesLatency, detail: 'Accessible' })
      }
    } catch (err) {
      checks.push({ name: 'Phones Table', ok: false, latencyMs: Date.now() - phonesStart, detail: String(err) })
      anyFailed = true
    }

    const totalLatency = checks.reduce((sum, c) => sum + (c.latencyMs ?? 0), 0)

    if (anyFailed) {
      consecutiveRef.current += 1
      wasDownRef.current = true
      const status: HealthStatus = consecutiveRef.current === 1 ? 'degraded' : 'down'
      setHealth({
        status,
        latencyMs:    totalLatency,
        lastChecked:  new Date(),
        errorCode:    dbErrorCode,
        errorMessage: dbErrorMessage,
        checks,
        consecutive:  consecutiveRef.current,
      })
    } else {
      if (wasDownRef.current) {
        // Just recovered — flush stale cached data so dashboard reloads fresh
        queryClient.invalidateQueries()
        wasDownRef.current = false
      }
      consecutiveRef.current = 0

      const worstLatency = Math.max(...checks.map((c) => c.latencyMs ?? 0))
      const status: HealthStatus =
        worstLatency > LATENCY_BAD_MS  ? 'degraded' :
        worstLatency > LATENCY_SLOW_MS ? 'slow'     : 'healthy'

      setHealth({ status, latencyMs: totalLatency, lastChecked: new Date(), errorCode: null, errorMessage: null, checks, consecutive: 0 })
    }
  }, [])

  useEffect(() => {
    check()
    intervalRef.current = setInterval(check, POLL_INTERVAL_MS)

    // Re-check immediately when the tab becomes visible again
    function onVisibility() {
      if (document.visibilityState === 'visible') check()
    }
    // Re-check when browser goes back online
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
