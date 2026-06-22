import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { withTimeout } from '../lib/withTimeout'
import { tracked } from '../lib/telemetry'
import { logDbError } from '../lib/errorLog'
import type { Profile } from '../types'

export const AGENTS_PAGE_SIZE = 20

// Stable per-module-load ID so the Supabase channel name is unique per browser
// session but survives hook re-mounts without conflicting with the previous instance.
const AGENTS_RT_CHANNEL = `agents-invalidator-${Math.random().toString(36).slice(2)}`

export interface AgentsFilter {
  role?:   'agent' | 'team_lead' | 'all'
  status?: 'active' | 'pending' | 'all'
  search?: string
}

export interface AgentsPage {
  profiles:   Profile[]
  totalCount: number
  totalPages: number
}

export function useAgentsPage(page: number, filter: AgentsFilter = {}) {
  const queryClient = useQueryClient()
  const queryKey    = agentsKey(page, filter)

  const query = useQuery<AgentsPage>({
    queryKey,
    queryFn:         () => tracked('agents-page', () => fetchAgentsPage(page, filter)),
    staleTime:       60_000,   // profiles change infrequently
    placeholderData: keepPreviousData,
  })

  // Realtime: invalidate when any profile changes.
  // Debounced 300 ms to batch burst events that arrive on Supabase cold-start
  // reconnect — prevents a wave of re-fetches that makes the page look like it
  // keeps "reloading".
  const invalidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const ch = supabase
      .channel(AGENTS_RT_CHANNEL)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        if (invalidateTimer.current) clearTimeout(invalidateTimer.current)
        invalidateTimer.current = setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['agents'] })
        }, 300)
      })
      .subscribe()
    return () => {
      if (invalidateTimer.current) clearTimeout(invalidateTimer.current)
      ch.unsubscribe()
      supabase.removeChannel(ch)
    }
  }, [queryClient])

  return query
}

function agentsKey(page: number, filter: AgentsFilter) {
  return ['agents', page, filter.role ?? 'all', filter.status ?? 'all', filter.search ?? ''] as const
}

async function fetchAgentsPage(page: number, filter: AgentsFilter): Promise<AgentsPage> {
  // SECURITY DEFINER RPC — bypasses RLS, no per-row is_admin() call.
  // Already excludes the admin row (WHERE role != 'admin' inside the function).
  const { data, error } = await withTimeout(supabase.rpc('admin_get_profiles'), 12_000)
  if (error) {
    logDbError('useAgentsPage', error.message, { code: error.code, detail: error.details })
    throw new Error(error.message)
  }

  let profiles = (data as Profile[]) ?? []

  // Newest first (RPC returns role, full_name order; re-sort client-side)
  profiles.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  if (filter.role && filter.role !== 'all') {
    profiles = profiles.filter((p) => p.role === filter.role)
  }
  if (filter.status && filter.status !== 'all') {
    profiles = profiles.filter((p) => p.status === filter.status)
  }
  if (filter.search?.trim()) {
    const s = filter.search.trim().toLowerCase()
    profiles = profiles.filter((p) => p.full_name.toLowerCase().includes(s))
  }

  const totalCount = profiles.length
  const from       = (page - 1) * AGENTS_PAGE_SIZE

  return {
    profiles:   profiles.slice(from, from + AGENTS_PAGE_SIZE),
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / AGENTS_PAGE_SIZE)),
  }
}
