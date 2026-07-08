import { supabase } from './supabase'

// ── Configuration ─────────────────────────────────────────────────────────────
const SLOW_QUERY_MS   = 2_000
const IS_DEV          = import.meta.env.DEV
const ENABLE_DB_LOGS  = !IS_DEV

// ── Types ─────────────────────────────────────────────────────────────────────
export type ErrorType = 'JS_ERROR' | 'SLOW_QUERY' | 'API_ERROR' | 'UNHANDLED_REJECTION'

export interface ErrorPayload {
  errorType:  ErrorType
  message:    string
  context?:   Record<string, unknown>
  userId?:    string
}

// ── Core: tracked query wrapper ───────────────────────────────────────────────
export async function tracked<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now()
  try {
    const result = await fn()
    const ms     = Math.round(performance.now() - start)
    recordLatency(label, ms)
    return result
  } catch (err) {
    const ms = Math.round(performance.now() - start)
    logError({
      errorType: 'API_ERROR',
      message:   err instanceof Error ? err.message : String(err),
      context:   { label, durationMs: ms },
    })
    throw err
  }
}

// ── Latency recorder ─────────────────────────────────────────────────────────
function recordLatency(label: string, ms: number) {
  if (IS_DEV) {
    const colour = ms > SLOW_QUERY_MS ? '🔴' : ms > 500 ? '🟡' : '🟢'
    console.debug(`[perf] ${colour} ${label} — ${ms}ms`)
  }
  if (ms > SLOW_QUERY_MS) {
    logError({
      errorType: 'SLOW_QUERY',
      message:   `Slow query: "${label}" took ${ms}ms (threshold: ${SLOW_QUERY_MS}ms)`,
      context:   { label, durationMs: ms, threshold: SLOW_QUERY_MS },
    })
  }
}

// ── Error logger ──────────────────────────────────────────────────────────────
export function logError(payload: ErrorPayload): void {
  if (IS_DEV) {
    console.warn(`[telemetry:${payload.errorType}]`, payload.message, payload.context ?? '')
  }

  if (!ENABLE_DB_LOGS) return

  supabase.from('error_logs').insert({
    error_type: payload.errorType,
    message:    payload.message,
    user_id:    payload.userId ?? null,
    context:    {
      ...payload.context,
      url:        window.location.href,
      user_agent: navigator.userAgent,
    },
  }).then(({ error }) => {
    if (error && IS_DEV) console.warn('[telemetry] failed to write error_log:', error.message)
  })
}

// ── Web Vitals reporting ──────────────────────────────────────────────────────
export async function initWebVitals(userId?: string): Promise<void> {
  const { onCLS, onFCP, onINP, onLCP, onTTFB } = await import('web-vitals')

  // web-vitals v4 gives each on* a specific metric type; cast to common shape
  type AnyCallback = (cb: (m: { name: string; value: number; rating: string }) => void) => void

  function report(metric: { name: string; value: number; rating: string }) {
    if (IS_DEV) {
      const colour = metric.rating === 'good' ? '🟢' : metric.rating === 'needs-improvement' ? '🟡' : '🔴'
      console.info(`[vitals] ${colour} ${metric.name}: ${Math.round(metric.value)} (${metric.rating})`)
    }

    if (!ENABLE_DB_LOGS) return

    supabase.from('perf_logs').insert({
      label:       metric.name,
      duration_ms: Math.round(metric.value),
      user_id:     userId ?? null,
      meta:        { rating: metric.rating, url: window.location.href },
    }).then(({ error }) => {
      if (error && IS_DEV) console.warn('[telemetry] failed to write perf_log:', error.message)
    })
  }

  ;(onCLS  as AnyCallback)(report)
  ;(onFCP  as AnyCallback)(report)
  ;(onINP  as AnyCallback)(report)
  ;(onLCP  as AnyCallback)(report)
  ;(onTTFB as AnyCallback)(report)
}

// ── Global unhandled rejection capture ───────────────────────────────────────
export function initGlobalErrorCapture(getUserId: () => string | undefined): void {
  window.addEventListener('unhandledrejection', (event) => {
    const msg = event.reason instanceof Error
      ? event.reason.message
      : String(event.reason ?? 'Unhandled promise rejection')

    logError({
      errorType: 'UNHANDLED_REJECTION',
      message:   msg,
      context:   { stack: event.reason instanceof Error ? event.reason.stack : undefined },
      userId:    getUserId(),
    })
  })

  window.addEventListener('error', (event) => {
    logError({
      errorType: 'JS_ERROR',
      message:   event.message ?? 'Script error',
      context:   { filename: event.filename, lineno: event.lineno, colno: event.colno },
      userId:    getUserId(),
    })
  })
}
