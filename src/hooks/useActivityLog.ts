import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { withTimeout } from '../lib/withTimeout'
import type { ActivityLogEntry, ActivityActionType } from '../types'

const PAGE_SIZE = 100   // one day rarely exceeds this; keeps day-view complete in a single fetch

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
      const { data, error } = await withTimeout(buildQuery(0), 12_000)
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
      const { data, error } = await withTimeout(buildQuery(offsetRef.current), 12_000)
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

  // Realtime subscription — prepend new entries.
  // When agentId filter is active, scope the subscription to that agent so
  // Supabase delivers the event even when RLS restricts visibility.
  useEffect(() => {
    const agentId = filters.agentId

    const pgFilter = agentId
      ? { event: 'INSERT' as const, schema: 'public', table: 'activity_log', filter: `agent_id=eq.${agentId}` }
      : { event: 'INSERT' as const, schema: 'public', table: 'activity_log' }

    // Use a unique channel name so multiple instances don't conflict
    const channelName = agentId ? `activity-log-${agentId}` : 'activity-log-admin'

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', pgFilter, (payload) => {
        const newEntry = payload.new as ActivityLogEntry
        setEntries((prev) => {
          // Deduplicate in case the fetch and realtime race
          if (prev.find((e) => e.id === newEntry.id)) return prev
          return [newEntry, ...prev]
        })
      })
      .subscribe()

    return () => {
      channel.unsubscribe()
      supabase.removeChannel(channel)
    }
  }, [filters.agentId])

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
