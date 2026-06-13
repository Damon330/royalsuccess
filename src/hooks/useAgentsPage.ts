import { useEffect } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { tracked } from '../lib/telemetry'
import type { Profile } from '../types'

export const AGENTS_PAGE_SIZE = 20

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

  // Realtime: invalidate when any profile changes
  useEffect(() => {
    const ch = supabase
      .channel('agents-cache-invalidator')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        queryClient.invalidateQueries({ queryKey: ['agents'] })
      })
      .subscribe()
    return () => { ch.unsubscribe(); supabase.removeChannel(ch) }
  }, [queryClient])

  return query
}

function agentsKey(page: number, filter: AgentsFilter) {
  return ['agents', page, filter.role ?? 'all', filter.status ?? 'all', filter.search ?? ''] as const
}

async function fetchAgentsPage(page: number, filter: AgentsFilter): Promise<AgentsPage> {
  const from = (page - 1) * AGENTS_PAGE_SIZE
  const to   = from + AGENTS_PAGE_SIZE - 1

  let q = supabase
    .from('profiles')
    .select('*', { count: 'exact' })
    .neq('role', 'admin')
    .order('created_at', { ascending: false })
    .range(from, to)

  if (filter.role && filter.role !== 'all') {
    q = q.eq('role', filter.role)
  }
  if (filter.status && filter.status !== 'all') {
    q = q.eq('status', filter.status)
  }
  if (filter.search?.trim()) {
    q = q.ilike('full_name', `%${filter.search.trim()}%`)
  }

  const { data, error, count } = await q
  if (error) throw new Error(error.message)

  const totalCount = count ?? 0
  return {
    profiles:   (data as Profile[]) ?? [],
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / AGENTS_PAGE_SIZE)),
  }
}
