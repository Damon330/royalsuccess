import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { withTimeout } from '../lib/withTimeout'
import type { Receipt } from '../types'
import toast from 'react-hot-toast'

export const RECEIPTS_PAGE_SIZE = 25
const QUERY_TIMEOUT = 8000

export interface ReceiptFilters {
  agentId?:       string
  paymentMethod?: string
  dateFrom?:      string
  dateTo?:        string
  showVoided?:    boolean
}

export function useReceipts() {
  const [receipts,     setReceipts]     = useState<Receipt[]>([])
  const [loading,      setLoading]      = useState(true)
  const [dbError,      setDbError]      = useState(false)
  const [missingTable, setMissingTable] = useState(false)
  const [page,         setPage]         = useState(1)
  const [total,        setTotal]        = useState(0)
  const [filters,      setFilters]      = useState<ReceiptFilters>({})

  const totalPages = Math.max(1, Math.ceil(total / RECEIPTS_PAGE_SIZE))

  const fetchReceipts = useCallback(async (pg: number, f: ReceiptFilters) => {
    setLoading(true); setDbError(false); setMissingTable(false)
    try {
      const from = (pg - 1) * RECEIPTS_PAGE_SIZE
      const to   = pg * RECEIPTS_PAGE_SIZE - 1

      let q = supabase
        .from('receipts')
        .select('*, phone:phones(model,imei,barcode,serial_number)', { count: 'exact' })
        .order('generated_at', { ascending: false })
        .range(from, to)

      if (!f.showVoided)    q = q.eq('voided', false)
      if (f.agentId)        q = q.eq('agent_id', f.agentId)
      if (f.paymentMethod)  q = q.eq('payment_method', f.paymentMethod)
      if (f.dateFrom)       q = q.gte('generated_at', f.dateFrom)
      if (f.dateTo)         q = q.lte('generated_at', f.dateTo + 'T23:59:59Z')

      const { data, error, count } = await withTimeout(q as ReturnType<typeof q.range>, QUERY_TIMEOUT)

      if (error) {
        const msg  = (error as { message?: string }).message ?? ''
        const code = (error as { code?: string }).code ?? ''
        if (msg.includes('does not exist') || msg.includes('42P01') || code === '42P01') {
          setMissingTable(true)
        }
        throw error
      }

      setReceipts(data ?? [])
      setTotal(count ?? 0)
    } catch {
      setDbError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchReceipts(page, filters)
  }, [fetchReceipts, page, filters])

  function updateFilters(patch: Partial<ReceiptFilters>) {
    setFilters((prev) => ({ ...prev, ...patch }))
    setPage(1)
  }

  function goToPage(pg: number) {
    setPage(Math.max(1, Math.min(pg, totalPages)))
  }

  async function voidReceipt(id: string): Promise<boolean> {
    try {
      const { error } = await withTimeout(
        supabase.from('receipts').update({ voided: true }).eq('id', id),
        8000,
      )
      if (error) throw error
      // Refresh current page so the row disappears (or shows voided)
      await fetchReceipts(page, filters)
      toast.success('Receipt voided.')
      return true
    } catch {
      toast.error('Failed to void receipt.')
      return false
    }
  }

  return {
    receipts,
    loading,
    dbError,
    missingTable,
    page,
    totalPages,
    totalCount: total,
    filters,
    updateFilters,
    goToPage,
    voidReceipt,
    refetch: () => fetchReceipts(page, filters),
  }
}
