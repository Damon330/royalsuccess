import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { withTimeout } from '../lib/withTimeout'
import { checkRateLimit, RATE_LIMITS } from '../lib/rateLimit'
import type { PhoneReturn, ReturnReason, ReturnStatus, Profile } from '../types'
import toast from 'react-hot-toast'

export const STOCK_RETURN_REASONS: ReturnReason[] = [
  'Wrong model received',
  'Phone damaged',
  'Excess stock',
  'End of assignment period',
  'Other',
] as unknown as ReturnReason[]

const QUERY_TIMEOUT = 8000
const MUTATE_TIMEOUT = 12000

export function useReturns(statusFilter?: ReturnStatus, channelId = 'returns-main', enabled = true) {
  const [returns, setReturns] = useState<PhoneReturn[]>([])
  const [loading, setLoading] = useState(true)
  const [dbError, setDbError] = useState(false)
  const [missingTable, setMissingTable] = useState(false)

  const fetchReturns = useCallback(async () => {
    if (!enabled) {
      setReturns([])
      setLoading(false)
      return
    }

    setLoading(true)
    setDbError(false)
    setMissingTable(false)
    try {
      let q = supabase
        .from('returns')
        .select('*')
        .order('created_at', { ascending: false })

      if (statusFilter) q = q.eq('return_status', statusFilter)

      const { data: returnRows, error } = await withTimeout(q, QUERY_TIMEOUT)
      if (error) {
        const msg = (error as { message?: string }).message ?? ''
        if (msg.includes('does not exist') || (error as { code?: string }).code === '42P01') {
          setMissingTable(true)
        }
        throw error
      }
      if (!returnRows?.length) {
        setReturns([])
        return
      }

      const phoneIds = [...new Set(returnRows.map((r) => r.phone_id).filter(Boolean))] as string[]
      const profileIds = [...new Set([
        ...returnRows.map((r) => r.returned_by).filter(Boolean),
        ...returnRows.map((r) => r.approved_by).filter(Boolean),
      ])] as string[]

      const [phonesSettled, profilesSettled] = await Promise.allSettled([
        phoneIds.length > 0
          ? withTimeout(supabase.from('phones').select('id,model,imei,barcode,serial_number').in('id', phoneIds), QUERY_TIMEOUT)
          : Promise.resolve({ data: [], error: null }),
        profileIds.length > 0
          ? withTimeout(supabase.from('profiles').select('id,full_name,role').in('id', profileIds), QUERY_TIMEOUT)
          : Promise.resolve({ data: [], error: null }),
      ])

      const phones = phonesSettled.status === 'fulfilled' ? (phonesSettled.value.data ?? []) : []
      const profiles = profilesSettled.status === 'fulfilled' ? (profilesSettled.value.data ?? []) : []

      const phoneMap = Object.fromEntries(phones.map((p) => [p.id, p]))
      const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]))

      setReturns(returnRows.map((r) => ({
        ...r,
        phone: phoneMap[r.phone_id] ?? null,
        requester: profileMap[r.returned_by] ?? null,
        approver: r.approved_by ? profileMap[r.approved_by] ?? null : null,
      })))
    } catch {
      setDbError(true)
      setReturns([])
    } finally {
      setLoading(false)
    }
  }, [enabled, statusFilter])

  useEffect(() => {
    if (!enabled) {
      setReturns([])
      setLoading(false)
      return
    }

    fetchReturns()

    const channel = supabase
      .channel(`returns-${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'returns' }, () => {
        fetchReturns()
      })
      .subscribe()

    return () => { channel.unsubscribe(); supabase.removeChannel(channel) }
  }, [enabled, fetchReturns, channelId])

  async function submitReturn(
    actor: Profile,
    phoneId: string,
    reason: string,
    notes: string,
  ): Promise<boolean> {
    if (!checkRateLimit({ key: `return-${actor.id}`, ...RATE_LIMITS.returnSubmit })) {
      toast.error('Too many return requests. Please wait before submitting another.')
      return false
    }
    try {
      const { error } = await withTimeout(
        supabase.rpc('submit_phone_return', {
          p_phone_id: phoneId,
          p_reason: reason,
          p_notes: notes,
        }),
        MUTATE_TIMEOUT,
      )
      if (error) throw error

      toast.success('Return request submitted - awaiting approval.')
      await fetchReturns()
      return true
    } catch (err: unknown) {
      toast.error(`Return failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      return false
    }
  }

  async function approveReturn(returnId: string, _approver: Profile): Promise<boolean> {
    try {
      const { error } = await withTimeout(
        supabase.rpc('resolve_phone_return', {
          p_return_id: returnId,
          p_status: 'APPROVED',
          p_rejection_note: null,
        }),
        MUTATE_TIMEOUT,
      )
      if (error) throw error

      toast.success('Return approved.')
      await fetchReturns()
      return true
    } catch (err: unknown) {
      toast.error(`Approval failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      return false
    }
  }

  async function rejectReturn(
    returnId: string,
    _approver: Profile,
    rejectionNote: string,
  ): Promise<boolean> {
    try {
      const { error } = await withTimeout(
        supabase.rpc('resolve_phone_return', {
          p_return_id: returnId,
          p_status: 'REJECTED',
          p_rejection_note: rejectionNote,
        }),
        MUTATE_TIMEOUT,
      )
      if (error) throw error

      toast.success('Return rejected - phone stays assigned.')
      await fetchReturns()
      return true
    } catch (err: unknown) {
      toast.error(`Rejection failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      return false
    }
  }

  const pendingCount = returns.filter((r) => r.return_status === 'PENDING').length

  return {
    returns,
    loading,
    dbError,
    missingTable,
    pendingCount,
    submitReturn,
    approveReturn,
    rejectReturn,
    refetch: fetchReturns,
  }
}
