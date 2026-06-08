import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { ActivityLogEntry, ActivityActionType } from '../types'

const PAGE_SIZE = 20

export type { ActivityLogEntry, ActivityActionType } from '../types'

export interface ActivityFilters {
  dateFrom?:   string           // ISO date string YYYY-MM-DD
  dateTo?:     string
  actionTypes: ActivityActionType[]
  agentId?:    string
}

export function useActivityLog(initialFilters?: Partial<ActivityFilters>) {
  const [entries,  setEntries]  = useState<ActivityLogEntry[]>([])
  const [loading,  setLoading]  = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore,  setHasMore]  = useState(true)
  const [dbError,  setDbError]  = useState(false)

  const [filters, setFilters] = useState<ActivityFilters>({
    dateFrom:    initialFilters?.dateFrom    ?? '',
    dateTo:      initialFilters?.dateTo      ?? '',
    actionTypes: initialFilters?.actionTypes ?? [],
    agentId:     initialFilters?.agentId     ?? '',
  })

  const offsetRef = useRef(0)

  const buildQuery = useCallback((offset: number) => {
    let q = supabase
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)

    if (filters.dateFrom) q = q.gte('created_at', filters.dateFrom)
    if (filters.dateTo)   q = q.lte('created_at', filters.dateTo + 'T23:59:59Z')
    if (filters.actionTypes.length > 0) q = q.in('action_type', filters.actionTypes)
    if (filters.agentId)  q = q.eq('agent_id', filters.agentId)

    return q
  }, [filters])

  const fetchFirst = useCallback(async () => {
    setLoading(true)
    setDbError(false)
    offsetRef.current = 0
    try {
      const { data, error } = await buildQuery(0)
      if (error) throw error
      const rows = data ?? []
      setEntries(rows)
      setHasMore(rows.length === PAGE_SIZE)
      offsetRef.current = rows.length
    } catch {
      setDbError(true)
    } finally {
      setLoading(false)
    }
  }, [buildQuery])

  const fetchMore = useCallback(async () => {
    if (!hasMore || loadingMore) return
    setLoadingMore(true)
    try {
      const { data, error } = await buildQuery(offsetRef.current)
      if (error) throw error
      const rows = data ?? []
      setEntries((prev) => [...prev, ...rows])
      setHasMore(rows.length === PAGE_SIZE)
      offsetRef.current += rows.length
    } catch {
      // silently fail on load-more
    } finally {
      setLoadingMore(false)
    }
  }, [buildQuery, hasMore, loadingMore])

  // Initial load + re-fetch when filters change
  useEffect(() => {
    fetchFirst()
  }, [fetchFirst])

  // Realtime subscription — prepend new entries
  useEffect(() => {
    const channel = supabase
      .channel('activity-log-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activity_log' },
        (payload) => {
          setEntries((prev) => [payload.new as ActivityLogEntry, ...prev])
        },
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
      supabase.removeChannel(channel)
    }
  }, [])

  function updateFilters(patch: Partial<ActivityFilters>) {
    setFilters((prev) => ({ ...prev, ...patch }))
  }

  return {
    entries,
    loading,
    loadingMore,
    hasMore,
    dbError,
    filters,
    updateFilters,
    fetchMore,
    refetch: fetchFirst,
  }
}
