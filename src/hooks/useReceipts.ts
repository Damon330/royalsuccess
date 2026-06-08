import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { withTimeout } from '../lib/withTimeout'
import type { Receipt } from '../types'
import toast from 'react-hot-toast'

const PAGE_SIZE    = 50
const QUERY_TIMEOUT = 8000

export function useReceipts() {
  const [receipts,    setReceipts]    = useState<Receipt[]>([])
  const [loading,     setLoading]     = useState(true)
  const [dbError,     setDbError]     = useState(false)
  const [missingTable, setMissingTable] = useState(false)

  const fetchReceipts = useCallback(async () => {
    setLoading(true); setDbError(false); setMissingTable(false)
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('receipts')
          .select('*, phone:phones(model,imei,barcode,serial_number)')
          .order('generated_at', { ascending: false })
          .limit(PAGE_SIZE),
        QUERY_TIMEOUT,
      )
      if (error) {
        const msg = (error as { message?: string }).message ?? ''
        if (msg.includes('does not exist') || msg.includes('42P01') || (error as { code?: string }).code === '42P01') {
          setMissingTable(true)
        }
        throw error
      }
      setReceipts(data ?? [])
    } catch {
      setDbError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchReceipts() }, [fetchReceipts])

  async function voidReceipt(id: string): Promise<boolean> {
    try {
      const { error } = await withTimeout(
        supabase.from('receipts').update({ voided: true }).eq('id', id),
        8000,
      )
      if (error) throw error
      setReceipts((prev) => prev.map((r) => r.id === id ? { ...r, voided: true } : r))
      toast.success('Receipt voided.')
      return true
    } catch {
      toast.error('Failed to void receipt.')
      return false
    }
  }

  return { receipts, loading, dbError, missingTable, voidReceipt, refetch: fetchReceipts }
}
