import { useState, useEffect } from 'react'

export interface AppError {
  id:        string
  ts:        Date
  source:    string   // hook or component name
  message:   string
  code?:     string   // Supabase error code (e.g. "42501", "PGRST301")
  detail?:   string
}

const MAX = 100
const _log: AppError[] = []
const _subs = new Set<(log: AppError[]) => void>()

function _notify() {
  const snap = [..._log]
  _subs.forEach(fn => fn(snap))
}

export function logDbError(source: string, message: string, opts?: { code?: string; detail?: string }) {
  _log.unshift({
    id:      Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ts:      new Date(),
    source,
    message,
    code:    opts?.code,
    detail:  opts?.detail,
  })
  if (_log.length > MAX) _log.length = MAX
  _notify()
}

export function clearErrorLog() {
  _log.length = 0
  _notify()
}

export function getErrorLog(): AppError[] {
  return [..._log]
}

export function useErrorLog() {
  const [log, setLog] = useState<AppError[]>([..._log])
  useEffect(() => {
    function handle(e: AppError[]) { setLog(e) }
    _subs.add(handle)
    return () => { _subs.delete(handle) }
  }, [])
  return log
}
