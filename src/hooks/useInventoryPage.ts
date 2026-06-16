import { useEffect } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { withTimeout } from '../lib/withTimeout'
import { tracked } from '../lib/telemetry'
import { logDbError } from '../lib/errorLog'
import type { Phone, PhoneStatus } from '../types'

export const INVENTORY_PAGE_SIZE = 25

export interface InventoryFilter {
  status?: PhoneStatus | 'all'
  search?: string
}

export interface InventoryPage {
  phones:     Phone[]
  totalCount: number
  totalPages: number
}

// ── Server-side paginated phone query ─────────────────────────────────────────
// Returns only one page of phones from the DB — never pulls 500 rows.
// React Query caches each [page, status, search] combination independently
// so navigating back to a previous page is instant (no extra round-trip).
export function useInventoryPage(page: number, filter: InventoryFilter = {}) {
  const queryClient = useQueryClient()
  const queryKey    = inventoryKey(page, filter)

  const query = useQuery<InventoryPage>({
    queryKey,
    queryFn:         () => tracked('inventory-page', () => fetchPage(page, filter)),
    staleTime:       30_000,
    placeholderData: keepPreviousData,   // old page stays visible while next loads
  })

  // Prefetch the next page while the current one is displayed
  useEffect(() => {
    const nextKey = inventoryKey(page + 1, filter)
    queryClient.prefetchQuery({
      queryKey: nextKey,
      queryFn:  () => tracked('inventory-prefetch', () => fetchPage(page + 1, filter)),
      staleTime: 30_000,
    })
  }, [page, filter, queryClient])

  // Realtime: invalidate cached pages when any phone changes
  useEffect(() => {
    const ch = supabase
      .channel('inventory-cache-invalidator')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'phones' }, () => {
        queryClient.invalidateQueries({ queryKey: ['inventory'] })
      })
      .subscribe()
    return () => { ch.unsubscribe(); supabase.removeChannel(ch) }
  }, [queryClient])

  return query
}

// Invalidate all cached inventory pages (call after add/import/assign)
export function invalidateInventory(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['inventory'] })
}

function inventoryKey(page: number, filter: InventoryFilter) {
  return ['inventory', page, filter.status ?? 'all', filter.search ?? ''] as const
}

async function fetchPage(page: number, filter: InventoryFilter): Promise<InventoryPage> {
  const { data, error } = await withTimeout(supabase.rpc('admin_get_phones'), 15_000)
  if (error) {
    logDbError('useInventoryPage', error.message, { code: error.code, detail: error.details })
    throw new Error(error.message)
  }

  let phones = (data as Phone[]) ?? []

  if (filter.status && filter.status !== 'all') {
    phones = phones.filter((p) => p.status === filter.status)
  }

  if (filter.search?.trim()) {
    const s = filter.search.trim().toLowerCase()
    phones = phones.filter((p) =>
      p.model?.toLowerCase().includes(s) ||
      p.imei?.toLowerCase().includes(s) ||
      p.serial_number?.toLowerCase().includes(s) ||
      p.barcode?.toLowerCase().includes(s),
    )
  }

  const totalCount = phones.length
  const from       = (page - 1) * INVENTORY_PAGE_SIZE

  return {
    phones:     phones.slice(from, from + INVENTORY_PAGE_SIZE),
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / INVENTORY_PAGE_SIZE)),
  }
}
