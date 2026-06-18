import { useState, useEffect, useRef, useCallback } from 'react'
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
  authEmail:    string | null
  isAdmin:      boolean | null
  checks:       HealthCheck[]
  consecutive:  number
}

// Serialisable form sent over BroadcastChannel (Date → ISO string)
interface HealthMessage {
  type:  'HEALTH_RESULT'
  state: Omit<HealthState, 'lastChecked'> & { lastChecked: string | null }
}

// ── Tuning ────────────────────────────────────────────────────────────────────
const POLL_MS      = 60_000   // 60 s between background checks
const VIS_COOLDOWN = 45_000   // min gap before a tab-focus re-check
const JITTER_MAX   = 6_000    // spread initial checks 0–6 s across tabs
const PING_TIMEOUT = 8_000    // abort the ping fetch after 8 s
const LAT_SLOW     = 4_000    // ms above which status = slow
const LAT_BAD      = 10_000   // ms above which status = degraded
const BC_CHANNEL   = 'royal-success-health-v1'

// Read once at module init — never change at runtime, so no reactivity needed
const SUPABASE_URL      = String(import.meta.env.VITE_SUPABASE_URL     ?? '')
const SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '')

// ── Helpers ───────────────────────────────────────────────────────────────────
const INITIAL: HealthState = {
  status: 'checking', latencyMs: null, lastChecked: null,
  errorCode: null, errorMessage: null, authEmail: null, isAdmin: null,
  checks: [], consecutive: 0,
}

function deserialise(msg: HealthMessage['state']): HealthState {
  return { ...msg, lastChecked: msg.lastChecked ? new Date(msg.lastChecked) : null }
}

function serialise(s: HealthState): HealthMessage['state'] {
  return { ...s, lastChecked: s.lastChecked?.toISOString() ?? null }
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useSystemHealth() {
  const [health, setHealth] = useState<HealthState>(INITIAL)

  // Mutable refs — never cause re-renders, safe inside intervals
  const consecutiveRef = useRef(0)
  const wasDownRef     = useRef(false)
  const inFlightRef    = useRef(false)      // prevents concurrent checks in same tab
  const lastCheckedRef = useRef(0)          // epoch ms of last completed check
  const intervalRef    = useRef<ReturnType<typeof setInterval>>()
  const startTimerRef  = useRef<ReturnType<typeof setTimeout>>()
  const bcRef          = useRef<BroadcastChannel | null>(null)
  const doCheckRef     = useRef<() => Promise<void>>()   // stable ref breaks stale-closure trap

  // ── Apply a health result (own check or received from another tab) ─────────
  const applyResult = useCallback((state: HealthState) => {
    setHealth(state)
    consecutiveRef.current = state.consecutive
    wasDownRef.current     = state.status === 'down' || state.status === 'degraded'
    lastCheckedRef.current = Date.now()
  }, [])

  // ── Execute a health check ────────────────────────────────────────────────
  // Uses a raw fetch() to GET /rest/v1/ — PostgREST returns its OpenAPI schema.
  // This call never touches the Supabase JS client auth layer, so it cannot hang
  // on JWT token-refresh the way supabase.rpc() can.
  const doCheck = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true

    setHealth(prev => ({
      ...prev,
      status: prev.status === 'healthy' || prev.status === 'down' ? 'checking' : prev.status,
    }))

    const t0         = Date.now()
    const controller = new AbortController()
    const pingTimer  = setTimeout(() => controller.abort(), PING_TIMEOUT)

    let ok            = false
    let latencyMs     = 0
    let detail        = ''
    let errorMessage: string | null = null

    try {
      // /auth/v1/health is the GoTrue service health endpoint.
      // It requires NO authentication — only the project apikey header.
      // It returns {"version":"...","name":"GoTrue"} with HTTP 200 whenever
      // the Supabase project is awake, without touching the database or the
      // RLS/PostgREST layer that can return 401 on schema requests.
      const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
        headers: { 'apikey': SUPABASE_ANON_KEY },
        signal: controller.signal,
      })
      clearTimeout(pingTimer)
      latencyMs = Date.now() - t0
      ok        = res.ok
      detail    = ok
        ? `HTTP ${res.status} · ${latencyMs}ms`
        : `HTTP ${res.status} – Supabase project may be paused or auth service is down`
      if (!ok) errorMessage = detail
    } catch (err) {
      clearTimeout(pingTimer)
      latencyMs = Date.now() - t0
      const isAbort = (err as { name?: string })?.name === 'AbortError'
      const msg     = err instanceof Error ? err.message : String(err)
      detail        = isAbort ? `Request timed out after ${PING_TIMEOUT / 1000}s` : msg
      errorMessage  = detail
    } finally {
      inFlightRef.current = false
    }

    const checks: HealthCheck[] = [{ name: 'Database Ping', ok, latencyMs, detail }]

    let result: HealthState

    if (!ok) {
      consecutiveRef.current += 1
      wasDownRef.current      = true

      const status: HealthStatus =
        consecutiveRef.current >= 5 ? 'down'     :
        consecutiveRef.current >= 3 ? 'degraded' :
                                      'slow'

      result = {
        status, latencyMs, lastChecked: new Date(),
        errorCode: null, errorMessage, authEmail: null, isAdmin: null,
        checks, consecutive: consecutiveRef.current,
      }
    } else {
      if (wasDownRef.current) {
        queryClient.invalidateQueries()
        wasDownRef.current = false
      }
      consecutiveRef.current = 0

      const status: HealthStatus =
        latencyMs > LAT_BAD  ? 'degraded' :
        latencyMs > LAT_SLOW ? 'slow'     : 'healthy'

      result = {
        status, latencyMs, lastChecked: new Date(),
        errorCode: null, errorMessage: null, authEmail: null, isAdmin: null,
        checks, consecutive: 0,
      }
    }

    applyResult(result)

    // Broadcast result to all other open tabs — only ONE network call per cycle
    bcRef.current?.postMessage({ type: 'HEALTH_RESULT', state: serialise(result) } satisfies HealthMessage)
  }, [applyResult])

  // Keep doCheckRef pointing at the latest doCheck (breaks stale-closure trap)
  useEffect(() => { doCheckRef.current = doCheck }, [doCheck])

  // ── BroadcastChannel — one-time setup ─────────────────────────────────────
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return

    const bc = new BroadcastChannel(BC_CHANNEL)
    bcRef.current = bc

    bc.onmessage = (event: MessageEvent<HealthMessage>) => {
      if (event.data?.type !== 'HEALTH_RESULT') return
      applyResult(deserialise(event.data.state))
      // Re-arm our interval so every tab stays in sync
      clearInterval(intervalRef.current)
      intervalRef.current = setInterval(() => doCheckRef.current?.(), POLL_MS)
    }

    return () => { bc.close(); bcRef.current = null }
  }, [applyResult])

  // ── Polling + visibility / online events ──────────────────────────────────
  useEffect(() => {
    const jitter = Math.floor(Math.random() * JITTER_MAX)
    startTimerRef.current = setTimeout(() => {
      doCheckRef.current?.()
      intervalRef.current = setInterval(() => doCheckRef.current?.(), POLL_MS)
    }, jitter)

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastCheckedRef.current < VIS_COOLDOWN) return
      doCheckRef.current?.()
    }
    const onOnline = () => doCheckRef.current?.()

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)

    return () => {
      clearTimeout(startTimerRef.current)
      clearInterval(intervalRef.current)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  return { health, recheckNow: doCheck }
}
