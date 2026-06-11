import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { withTimeout } from '../lib/withTimeout'
import { logActivity } from '../lib/logActivity'
import { sendNotification } from '../lib/sendNotification'
import type { PhoneReturn, ReturnReason, ReturnStatus, Profile } from '../types'
import toast from 'react-hot-toast'

// Return reasons for stock returns (agent/TL returning an assigned phone to warehouse)
export const STOCK_RETURN_REASONS: ReturnReason[] = [
  'Wrong model received',
  'Phone damaged',
  'Excess stock',
  'End of assignment period',
  'Other',
] as unknown as ReturnReason[]

const QUERY_TIMEOUT  = 8000
const MUTATE_TIMEOUT = 12000

export function useReturns(statusFilter?: ReturnStatus, channelId = 'returns-main') {
  const [returns,      setReturns]      = useState<PhoneReturn[]>([])
  const [loading,      setLoading]      = useState(true)
  const [dbError,      setDbError]      = useState(false)
  const [missingTable, setMissingTable] = useState(false)

  const fetchReturns = useCallback(async () => {
    setLoading(true)
    setDbError(false)
    setMissingTable(false)
    try {
      // Simple query without FK aliases to avoid Supabase constraint-name issues
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
      if (!returnRows || returnRows.length === 0) { setReturns([]); return }

      // Fetch associated phones and profiles in parallel
      const phoneIds   = [...new Set(returnRows.map((r) => r.phone_id).filter(Boolean))] as string[]
      const profileIds = [...new Set([
        ...returnRows.map((r) => r.returned_by).filter(Boolean),   // was missing filter(Boolean)
        ...returnRows.map((r) => r.approved_by).filter(Boolean),
      ])] as string[]

      const [phonesResult, profilesResult] = await Promise.all([
        phoneIds.length > 0
          ? withTimeout(supabase.from('phones').select('id,model,imei,barcode,serial_number').in('id', phoneIds), QUERY_TIMEOUT)
          : Promise.resolve({ data: [] as { id: string; model: string; imei: string | null; barcode: string | null; serial_number: string }[], error: null }),
        profileIds.length > 0
          ? withTimeout(supabase.from('profiles').select('id,full_name,role').in('id', profileIds), QUERY_TIMEOUT)
          : Promise.resolve({ data: [] as { id: string; full_name: string; role: string }[], error: null }),
      ])

      const phones   = phonesResult.data   ?? []
      const profiles = profilesResult.data ?? []

      const phoneMap   = Object.fromEntries(phones.map((p) => [p.id, p]))
      const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]))

      const enriched = returnRows.map((r) => ({
        ...r,
        phone:     phoneMap[r.phone_id]   ?? null,
        requester: profileMap[r.returned_by] ?? null,
        approver:  r.approved_by ? profileMap[r.approved_by] ?? null : null,
      }))

      setReturns(enriched)
    } catch {
      setDbError(true)
      setReturns([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    fetchReturns()

    const channel = supabase
      .channel(`returns-${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'returns' }, () => {
        fetchReturns()
      })
      .subscribe()

    return () => { channel.unsubscribe(); supabase.removeChannel(channel) }
  }, [fetchReturns])

  // ── Agent / TL submits a return for an ASSIGNED phone ─────────
  async function submitReturn(
    actor:   Profile,
    phoneId: string,
    reason:  string,
    notes:   string,
  ): Promise<boolean> {
    try {
      // Verify phone is still assigned to this user
      const { data: phone } = await withTimeout(
        supabase.from('phones').select('status, model, imei, serial_number').eq('id', phoneId).single(),
        QUERY_TIMEOUT,
      )
      if (!phone || phone.status !== 'assigned') {
        toast.error('This phone is not currently assigned and cannot be returned.')
        return false
      }

      const { error: retErr } = await withTimeout(
        supabase.from('returns').insert({
          phone_id:         phoneId,
          original_sale_id: null,
          returned_by:      actor.id,
          return_reason:    reason,
          return_status:    'PENDING',
          notes:            notes.trim() || null,
        }),
        MUTATE_TIMEOUT,
      )
      if (retErr) throw retErr

      // Move phone to 'returned' status while pending admin/TL approval
      const { error: phoneErr } = await withTimeout(
        supabase.from('phones').update({ status: 'returned' }).eq('id', phoneId),
        MUTATE_TIMEOUT,
      )
      if (phoneErr) throw phoneErr

      const label = `${phone.model} / ${phone.imei ?? phone.serial_number}`
      await logActivity({
        actor_id:     actor.id,
        actor_name:   actor.full_name,
        role:         actor.role,
        action_type:  'SALE_RETURNED',
        entity_type:  'phone',
        entity_id:    phoneId,
        entity_label: label,
        meta:         { reason, status: 'PENDING' },
        agent_id:     actor.role === 'agent'     ? actor.id : null,
        team_lead_id: actor.role === 'team_lead' ? actor.id : null,
      })

      // Notify the team lead if this agent has one
      if (actor.team_lead_id) {
        sendNotification(
          actor.team_lead_id,
          'RETURN_REQUESTED',
          'Return Request',
          `${actor.full_name} submitted a return for ${phone.model}. Reason: ${reason}`,
        )
      }

      toast.success('Return request submitted — awaiting approval.')
      await fetchReturns()
      return true
    } catch (err: unknown) {
      toast.error(`Return failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      return false
    }
  }

  // ── Admin / TL approves → phone goes back to in_stock ─────────
  async function approveReturn(returnId: string, approver: Profile): Promise<boolean> {
    try {
      // Re-fetch the specific return from DB to guarantee we have the live return_reason,
      // not a potentially stale value from local React state.
      const { data: freshRet, error: fetchErr } = await withTimeout(
        supabase.from('returns').select('*').eq('id', returnId).single(),
        QUERY_TIMEOUT,
      )
      if (fetchErr || !freshRet) { toast.error('Return not found.'); return false }

      const ret = freshRet

      const now = new Date().toISOString()

      const { error: retErr } = await withTimeout(
        supabase.from('returns').update({
          return_status: 'APPROVED',
          approved_by:   approver.id,
          resolved_at:   now,
        }).eq('id', returnId),
        MUTATE_TIMEOUT,
      )
      if (retErr) throw retErr

      // Damaged return reason → mark as damaged instead of back in stock
      const isDamaged = /damaged|defective/i.test(String(ret.return_reason ?? ''))
      const phoneStatus = isDamaged ? 'damaged' : 'in_stock'

      const { error: phoneErr } = await withTimeout(
        supabase.from('phones').update({
          status:      phoneStatus,
          // Keep assigned_to when damaged so the agent can still see it on their dashboard.
          // For in_stock returns, clear the assignment.
          assigned_to: isDamaged ? ret.returned_by : null,
          assigned_at: null,
        }).eq('id', ret.phone_id),
        MUTATE_TIMEOUT,
      )
      if (phoneErr) throw phoneErr

      const { data: phoneRow } = await withTimeout(
        supabase.from('phones').select('model,imei,serial_number').eq('id', ret.phone_id).single(),
        QUERY_TIMEOUT,
      )
      const p = phoneRow as { model?: string; imei?: string; serial_number?: string } | null

      await logActivity({
        actor_id:     approver.id,
        actor_name:   approver.full_name,
        role:         approver.role,
        action_type:  'PHONE_UNASSIGNED',
        entity_type:  'phone',
        entity_id:    ret.phone_id,
        entity_label: p ? `${p.model} / ${p.imei ?? p.serial_number}` : ret.phone_id,
        meta:         { action: 'RETURN_APPROVED', return_id: returnId },
      })

      // Notify the original requester
      sendNotification(
        ret.returned_by,
        'RETURN_APPROVED',
        'Return Approved',
        `Your return request for ${p?.model ?? 'the phone'} was approved by ${approver.full_name}. ${isDamaged ? 'Phone marked as damaged.' : 'Phone is back in stock.'}`,
      )

      toast.success(isDamaged ? 'Return approved — phone marked as damaged.' : 'Return approved — phone is back in stock.')
      await fetchReturns()
      return true
    } catch (err: unknown) {
      toast.error(`Approval failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      return false
    }
  }

  // ── Admin / TL rejects → phone goes back to assigned ─────────
  async function rejectReturn(
    returnId:      string,
    approver:      Profile,
    rejectionNote: string,
  ): Promise<boolean> {
    try {
      const ret = returns.find((r) => r.id === returnId)
      if (!ret) { toast.error('Return not found.'); return false }

      const now = new Date().toISOString()

      const { error } = await withTimeout(
        supabase.from('returns').update({
          return_status:  'REJECTED',
          approved_by:    approver.id,
          resolved_at:    now,
          rejection_note: rejectionNote.trim() || null,
        }).eq('id', returnId),
        MUTATE_TIMEOUT,
      )
      if (error) throw error

      // Revert phone back to assigned
      const { error: phoneErr } = await withTimeout(
        supabase.from('phones').update({ status: 'assigned' }).eq('id', ret.phone_id),
        MUTATE_TIMEOUT,
      )
      if (phoneErr) throw phoneErr

      // Notify the original requester
      sendNotification(
        ret.returned_by,
        'RETURN_REJECTED',
        'Return Rejected',
        `Your return request was rejected by ${approver.full_name}.${rejectionNote.trim() ? ` Reason: ${rejectionNote.trim()}` : ''}`,
      )

      toast.success('Return rejected — phone stays assigned.')
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
