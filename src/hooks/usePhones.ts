import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { withTimeout } from '../lib/withTimeout'
import { logActivity } from '../lib/logActivity'
import { sendNotification } from '../lib/sendNotification'
import { checkRateLimit, RATE_LIMITS } from '../lib/rateLimit'
import { logDbError } from '../lib/errorLog'
import type { Phone, Profile } from '../types'
import toast from 'react-hot-toast'

const QUERY_TIMEOUT  = 30_000
const MUTATE_TIMEOUT = 12000

export function usePhones(assignedTo?: string, statusFilter?: import('../types').PhoneStatus) {
  const [phones,     setPhones]     = useState<Phone[]>([])
  const [loading,    setLoading]    = useState(true)
  const [dbError,    setDbError]    = useState(false)
  const [dbErrorMsg, setDbErrorMsg] = useState<string | null>(null)

  // Tracks phone IDs currently mid-mutation so we block duplicate operations
  const mutatingIds = useRef<Set<string>>(new Set())

  // Unique channel name per hook instance so React StrictMode double-invoke
  // never creates two subscriptions on the same channel name simultaneously.
  const channelName = useMemo(
    () => `phones-${assignedTo ?? 'all'}-${statusFilter ?? 'all'}-${Math.random().toString(36).slice(2)}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const fetchPhones = useCallback(async () => {
    setLoading(true)
    setDbError(false)
    setDbErrorMsg(null)
    try {
      let result: Phone[]

      if (!assignedTo) {
        // Admin context — use SECURITY DEFINER RPC that bypasses RLS entirely.
        // Eliminates per-row is_admin() evaluation and cold-start RLS timeouts.
        const { data, error } = await withTimeout(
          supabase.rpc('admin_get_phones'),
          QUERY_TIMEOUT,
        )
        if (error) throw error
        result = (data as Phone[]) ?? []
        // Apply status filter client-side (RPC returns all phones)
        if (statusFilter) result = result.filter((p) => p.status === statusFilter)
      } else {
        // Agent / team-lead context — direct query filtered by assignment
        let query = supabase
          .from('phones')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500)
          .eq('assigned_to', assignedTo)
        if (statusFilter) query = query.eq('status', statusFilter)
        const { data, error } = await withTimeout(query, QUERY_TIMEOUT)
        if (error) throw error
        result = data ?? []
      }

      setPhones(result)
    } catch (err) {
      const e   = err as { message?: string; code?: string; details?: string }
      const msg = err instanceof Error ? err.message : e?.message ?? JSON.stringify(err)
      logDbError('usePhones', msg, { code: e?.code, detail: e?.details })
      setDbErrorMsg(msg)
      setPhones([])
      setDbError(true)
    } finally {
      setLoading(false)
    }
  }, [assignedTo, statusFilter])

  useEffect(() => {
    fetchPhones()

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'phones' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          // Remove any temp optimistic entry before adding the confirmed row
          setPhones((prev) => {
            const filtered = prev.filter((p) => !p.id.startsWith('tmp-'))
            return [payload.new as Phone, ...filtered]
          })
        } else if (payload.eventType === 'UPDATE') {
          setPhones((prev) => prev.map((p) => p.id === payload.new.id ? payload.new as Phone : p))
        } else if (payload.eventType === 'DELETE') {
          setPhones((prev) => prev.filter((p) => p.id !== payload.old.id))
        }
      })
      .subscribe()

    return () => { channel.unsubscribe(); supabase.removeChannel(channel) }
  }, [fetchPhones, channelName])

  // ── Lookup ──────────────────────────────────────────────────
  async function lookupByBarcode(barcode: string): Promise<Phone | null> {
    const v = barcode.trim()
    try {
      for (const col of ['barcode', 'imei', 'serial_number'] as const) {
        const { data } = await withTimeout(
          supabase.from('phones').select('*').eq(col, v).maybeSingle(),
          QUERY_TIMEOUT,
        )
        if (data) return data
      }
      return null
    } catch {
      return null
    }
  }

  // ── Return phone to team lead (direct transfer, no approval) ──
  async function returnToTeamLead(phoneId: string, teamLeadId: string, actor: Profile): Promise<boolean> {
    if (mutatingIds.current.has(phoneId)) return false
    mutatingIds.current.add(phoneId)

    const phone = phones.find((p) => p.id === phoneId)
    const now   = new Date().toISOString()

    setPhones((prev) =>
      prev.map((p) => p.id === phoneId ? { ...p, assigned_to: teamLeadId, assigned_at: now } : p)
    )

    try {
      const { error } = await withTimeout(
        supabase.rpc('return_phone_to_team_lead', { p_phone_id: phoneId }),
        MUTATE_TIMEOUT,
      )
      if (error) throw error

      const label = phone ? `${phone.model} / ${phone.imei ?? phone.serial_number}` : phoneId
      logActivity({
        actor_id:     actor.id,
        actor_name:   actor.full_name,
        role:         actor.role,
        action_type:  'PHONE_UNASSIGNED',
        entity_type:  'phone',
        entity_id:    phoneId,
        entity_label: label,
        meta:         { action: 'RETURNED_TO_TEAM_LEAD', team_lead_id: teamLeadId },
        agent_id:     actor.id,
        team_lead_id: teamLeadId,
      })

      sendNotification(
        teamLeadId,
        'PHONE_ASSIGNED',
        'Phone Returned to Your Stock',
        `${actor.full_name} returned ${phone?.model ?? 'a phone'} to your stock.`,
      )

      toast.success('Phone transferred to your team lead.')
      return true
    } catch {
      toast.error('Failed to return phone to team lead.')
      fetchPhones()
      return false
    } finally {
      mutatingIds.current.delete(phoneId)
    }
  }

  // ── Mark as Sold ────────────────────────────────────────────
  async function markAsSold(phoneId: string, actor: Profile): Promise<boolean> {
    if (mutatingIds.current.has(phoneId)) return false
    if (!checkRateLimit({ key: `sale-${actor.id}`, ...RATE_LIMITS.saleRecord })) {
      toast.error('Slow down — too many sale actions. Try again shortly.')
      return false
    }
    mutatingIds.current.add(phoneId)

    const phone = phones.find((p) => p.id === phoneId)
    if (phone?.status !== 'assigned') {
      toast.error('This phone is not currently assigned.')
      mutatingIds.current.delete(phoneId)
      return false
    }

    const now = new Date().toISOString()
    // Optimistic update
    setPhones((prev) =>
      prev.map((p) => p.id === phoneId ? { ...p, status: 'sold', sold_at: now } : p),
    )
    try {
      const { error: phoneErr } = await withTimeout(
        supabase.from('phones').update({ status: 'sold', sold_at: now }).eq('id', phoneId),
        MUTATE_TIMEOUT,
      )
      if (phoneErr) throw phoneErr

      await supabase.from('sales').insert({ phone_id: phoneId, sold_by: actor.id, sold_at: now })

      const label = phone ? `${phone.model} / IMEI ${phone.imei ?? phone.serial_number}` : phoneId
      logActivity({
        actor_id:     actor.id,
        actor_name:   actor.full_name,
        role:         actor.role,
        action_type:  'SALE_RECORDED',
        entity_type:  'phone',
        entity_id:    phoneId,
        entity_label: label,
        meta:         {
          model:   phone?.model,
          imei:    phone?.imei,
          serial:  phone?.serial_number,
        },
        agent_id:     actor.role === 'agent'     ? actor.id : null,
        team_lead_id: actor.role === 'team_lead' ? actor.id : null,
      })
      return true
    } catch {
      toast.error('Failed to mark as sold.')
      // Revert optimistic update
      fetchPhones()
      return false
    } finally {
      mutatingIds.current.delete(phoneId)
    }
  }

  // ── Add single phone ────────────────────────────────────────
  async function addPhone(
    model:  string,
    actor:  Profile,
    opts?: { barcode?: string; imei?: string },
  ): Promise<boolean> {
    try {
      const serial = opts?.imei?.trim() || opts?.barcode?.trim()
        || `RS-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`

      const { error: rpcErr } = await withTimeout(
        supabase.rpc('admin_insert_phone', {
          p_model:         model,
          p_serial_number: serial,
          p_barcode:       opts?.barcode?.trim() || null,
          p_imei:          opts?.imei?.trim()    || null,
        }),
        MUTATE_TIMEOUT,
      )

      if (rpcErr) {
        const isNotFound = rpcErr.code === '42883' || rpcErr.code === 'PGRST202'
        if (!isNotFound) { toast.error(`Add failed: ${rpcErr.message}`); return false }

        // RPC not deployed — fall back to direct insert.
        // Run supabase/fix-admin-permissions.sql to deploy it.
        const row: Record<string, unknown> = { model, serial_number: serial, status: 'in_stock' }
        if (opts?.barcode?.trim()) row.barcode = opts.barcode.trim()
        if (opts?.imei?.trim())    row.imei    = opts.imei.trim()
        const { error } = await withTimeout(supabase.from('phones').insert(row), MUTATE_TIMEOUT)
        if (error) { toast.error(`Add failed: ${error.message}`); return false }
      }

      logActivity({
        actor_id:     actor.id,
        actor_name:   actor.full_name,
        role:         actor.role,
        action_type:  'STOCK_ADDED',
        entity_type:  'phone',
        entity_label: model,
        meta:         {
          model,
          imei:    opts?.imei    || null,
          barcode: opts?.barcode || null,
          count:   1,
        },
      })
      return true
    } catch {
      toast.error('Database connection failed.')
      return false
    }
  }

  // ── Add bulk phones ─────────────────────────────────────────
  async function addPhonesBulk(model: string, count: number, actor: Profile): Promise<boolean> {
    const rows = Array.from({ length: count }, (_, i) => ({
      model,
      serial_number: `RS-${Date.now()}-${i}-${Math.random().toString(36).slice(2,6).toUpperCase()}`,
    }))
    try {
      const { error: rpcErr } = await withTimeout(
        supabase.rpc('admin_insert_phones_bulk', { p_rows: JSON.stringify(rows) }),
        MUTATE_TIMEOUT,
      ) as { data: number | null; error: { code: string; message: string } | null }

      if (rpcErr) {
        const isNotFound = rpcErr.code === '42883' || rpcErr.code === 'PGRST202'
        if (!isNotFound) { toast.error(`Bulk add failed: ${rpcErr.message}`); return false }

        const { error } = await withTimeout(
          supabase.from('phones').insert(rows.map((r) => ({ ...r, status: 'in_stock' }))),
          MUTATE_TIMEOUT,
        )
        if (error) { toast.error(`Bulk add failed: ${error.message}`); return false }
      }

      logActivity({
        actor_id:     actor.id,
        actor_name:   actor.full_name,
        role:         actor.role,
        action_type:  'STOCK_ADDED',
        entity_type:  'phone',
        entity_label: model,
        meta:         { model, count },
      })
      return true
    } catch {
      toast.error('Database connection failed.')
      return false
    }
  }

  // ── Assign phones ───────────────────────────────────────────
  async function assignPhones(
    phoneIds:     string[],
    userId:       string,
    actor:        Profile,
    assigneeName: string,
  ): Promise<boolean> {
    if (!checkRateLimit({ key: `assign-${actor.id}`, ...RATE_LIMITS.phoneAssign })) {
      toast.error('Too many assignment actions. Wait a moment before assigning again.')
      return false
    }
    // Guard: block assigning phones already mid-mutation
    const busy = phoneIds.filter((id) => mutatingIds.current.has(id))
    if (busy.length) {
      toast.error('One or more phones are already being processed.')
      return false
    }
    phoneIds.forEach((id) => mutatingIds.current.add(id))

    const now = new Date().toISOString()
    const phoneModels = phones
      .filter((p) => phoneIds.includes(p.id))
      .map((p) => p.model)

    // Optimistic update — UI responds instantly
    setPhones((prev) =>
      prev.map((p) =>
        phoneIds.includes(p.id)
          ? { ...p, status: 'assigned', assigned_to: userId, assigned_at: now }
          : p,
      ),
    )

    try {
      // .eq('status', 'in_stock') ensures another admin assigning the same phone
      // concurrently won't succeed — the second UPDATE finds zero matching rows
      const { data: assignedCount, error } = await withTimeout(
        supabase.rpc('assign_phones_to_user', {
          p_phone_ids: phoneIds,
          p_user_id:   userId,
        }),
        MUTATE_TIMEOUT,
      )
      if (error) { toast.error(`Assign failed: ${error.message}`); throw error }

      const actuallyAssigned = Number(assignedCount ?? 0)
      if (actuallyAssigned < phoneIds.length) {
        const skipped = phoneIds.length - actuallyAssigned
        toast.error(`${skipped} phone(s) were already assigned by someone else and were skipped.`)
        fetchPhones()
        return false
      }

      logActivity({
        actor_id:     actor.id,
        actor_name:   actor.full_name,
        role:         actor.role,
        action_type:  'PHONE_ASSIGNED',
        entity_type:  'phone',
        entity_label: `${phoneIds.length} phone(s) → ${assigneeName}`,
        meta:         {
          count:    phoneIds.length,
          assignee: assigneeName,
          models:   phoneModels.slice(0, 5).join(', '),
        },
        team_lead_id: actor.role === 'team_lead' ? actor.id : null,
      })

      // Notify the assignee
      sendNotification(
        userId,
        'PHONE_ASSIGNED',
        `${phoneIds.length} Phone${phoneIds.length !== 1 ? 's' : ''} Assigned`,
        `${phoneIds.length} phone(s) assigned to you by ${actor.full_name}: ${phoneModels.slice(0, 3).join(', ')}${phoneModels.length > 3 ? '…' : ''}`,
      )

      toast.success(`${phoneIds.length} phone(s) assigned.`)
      return true
    } catch {
      // Revert optimistic update
      fetchPhones()
      return false
    } finally {
      phoneIds.forEach((id) => mutatingIds.current.delete(id))
    }
  }

  // ── Import from Excel ───────────────────────────────────────
  async function importPhones(
    rows:  { model: string; serial_number: string; barcode?: string; imei?: string }[],
    actor: Profile,
  ): Promise<boolean> {
    try {
      const mapped = rows.map((r) => ({
        model:         r.model,
        serial_number: r.serial_number?.trim() || r.imei?.trim() || r.barcode?.trim() || `RS-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`,
        barcode:       r.barcode?.trim() || null,
        imei:          r.imei?.trim()    || null,
      }))

      const { error: rpcErr } = await withTimeout(
        supabase.rpc('admin_insert_phones_bulk', { p_rows: JSON.stringify(mapped) }),
        MUTATE_TIMEOUT,
      ) as { data: number | null; error: { code: string; message: string } | null }

      if (rpcErr) {
        const isNotFound = rpcErr.code === '42883' || rpcErr.code === 'PGRST202'
        if (!isNotFound) { toast.error(`Import failed: ${rpcErr.message}`); return false }

        const { error } = await withTimeout(
          supabase.from('phones').insert(mapped.map((r) => ({ ...r, status: 'in_stock' }))),
          MUTATE_TIMEOUT,
        )
        if (error) { toast.error(`Import failed: ${error.message}`); return false }
      }

      const models = [...new Set(rows.map((r) => r.model))]
      logActivity({
        actor_id:     actor.id,
        actor_name:   actor.full_name,
        role:         actor.role,
        action_type:  'STOCK_ADDED',
        entity_type:  'phone',
        entity_label: `Excel import — ${rows.length} phone(s)`,
        meta:         { count: rows.length, models: models.slice(0, 5).join(', ') },
      })
      return true
    } catch {
      toast.error('Database connection failed.')
      return false
    }
  }

  // ── Delete phone ────────────────────────────────────────────
  async function deletePhone(phoneId: string, actor: Profile): Promise<boolean> {
    if (mutatingIds.current.has(phoneId)) return false
    mutatingIds.current.add(phoneId)
    const phone = phones.find((p) => p.id === phoneId)

    setPhones((prev) => prev.filter((p) => p.id !== phoneId))

    try {
      const { error: rpcErr } = await withTimeout(
        supabase.rpc('admin_delete_phone', { p_phone_id: phoneId }),
        MUTATE_TIMEOUT,
      ) as { data: null; error: { code: string; message: string } | null }

      if (rpcErr) {
        // RPC not deployed yet — fall back to direct delete with row-count check.
        // Run supabase/admin-delete-phone.sql to deploy the RPC.
        const isNotFound = rpcErr.code === '42883' || rpcErr.code === 'PGRST202'
        if (!isNotFound) throw rpcErr

        const { data, error } = await withTimeout(
          supabase.from('phones').delete().eq('id', phoneId).select(),
          MUTATE_TIMEOUT,
        )
        if (error) throw error
        if (!data?.length) {
          toast.error('Delete blocked by database — run supabase/admin-delete-phone.sql in Supabase SQL Editor.')
          fetchPhones()
          return false
        }
      }

      logActivity({
        actor_id:     actor.id,
        actor_name:   actor.full_name,
        role:         actor.role,
        action_type:  'STOCK_ADJUSTED',
        entity_type:  'phone',
        entity_id:    phoneId,
        entity_label: phone?.model ?? phoneId,
        meta:         { action: 'DELETED', model: phone?.model, imei: phone?.imei },
      })
      toast.success('Phone deleted from inventory.')
      return true
    } catch {
      toast.error('Failed to delete phone.')
      fetchPhones()
      return false
    } finally {
      mutatingIds.current.delete(phoneId)
    }
  }

  // ── Update phone ────────────────────────────────────────────
  async function updatePhone(phoneId: string, updates: { model?: string }, actor: Profile): Promise<boolean> {
    try {
      const { error: rpcErr } = await withTimeout(
        supabase.rpc('admin_update_phone', {
          p_phone_id: phoneId,
          p_model:    updates.model ?? '',
        }),
        MUTATE_TIMEOUT,
      ) as { data: null; error: { code: string; message: string } | null }

      if (rpcErr) {
        const isNotFound = rpcErr.code === '42883' || rpcErr.code === 'PGRST202'
        if (!isNotFound) { toast.error(`Update failed: ${rpcErr.message}`); return false }

        const { error } = await withTimeout(
          supabase.from('phones').update(updates).eq('id', phoneId),
          MUTATE_TIMEOUT,
        )
        if (error) { toast.error(`Update failed: ${error.message}`); return false }
      }

      setPhones((prev) => prev.map((p) => p.id === phoneId ? { ...p, ...updates } : p))
      logActivity({
        actor_id:     actor.id,
        actor_name:   actor.full_name,
        role:         actor.role,
        action_type:  'STOCK_ADJUSTED',
        entity_type:  'phone',
        entity_id:    phoneId,
        entity_label: updates.model ?? phoneId,
        meta:         updates,
      })
      toast.success('Phone updated.')
      return true
    } catch {
      toast.error('Failed to update phone.')
      return false
    }
  }

  return {
    phones,
    loading,
    dbError,
    dbErrorMsg,
    markAsSold,
    returnToTeamLead,
    addPhone,
    addPhonesBulk,
    assignPhones,
    updatePhone,
    deletePhone,
    importPhones,
    lookupByBarcode,
    refetch: fetchPhones,
  }
}

// Standalone — safe to call from components that don't need the full hook.
// Team lead: phone returns to their own stock (assigned_to = team lead).
// Admin:     phone returns to warehouse (in_stock, assigned_to = null).
export async function unassignPhone(phoneId: string, actor: Profile): Promise<boolean> {
  try {
    const { data: phone } = await supabase
      .from('phones')
      .select('model,imei')
      .eq('id', phoneId)
      .single()

    const { error } = await withTimeout(
      supabase.rpc('unassign_phone_to_stock', { p_phone_id: phoneId }),
      12000,
    ) as { data: unknown; error: { message: string } | null }
    if (error) throw error

    logActivity({
      actor_id:     actor.id,
      actor_name:   actor.full_name,
      role:         actor.role,
      action_type:  'PHONE_UNASSIGNED',
      entity_type:  'phone',
      entity_id:    phoneId,
      entity_label: (phone as { model?: string } | null)?.model ?? phoneId,
      meta:         {
        model: (phone as { model?: string } | null)?.model,
        imei:  (phone as { imei?: string }  | null)?.imei,
      },
      team_lead_id: actor.role === 'team_lead' ? actor.id : null,
    })

    toast.success(
      actor.role === 'team_lead' ? 'Phone returned to your stock.' : 'Phone unassigned.',
    )
    return true
  } catch {
    toast.error('Failed to unassign phone.')
    return false
  }
}

