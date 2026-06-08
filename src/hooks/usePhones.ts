import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { withTimeout } from '../lib/withTimeout'
import { logActivity } from '../lib/logActivity'
import type { Phone, Profile } from '../types'
import toast from 'react-hot-toast'

const QUERY_TIMEOUT  = 8000
const MUTATE_TIMEOUT = 12000

export function usePhones(assignedTo?: string) {
  const [phones,  setPhones]  = useState<Phone[]>([])
  const [loading, setLoading] = useState(true)
  const [dbError, setDbError] = useState(false)

  // Tracks phone IDs currently mid-mutation so we block duplicate operations
  const mutatingIds = useRef<Set<string>>(new Set())

  const fetchPhones = useCallback(async () => {
    setLoading(true)
    setDbError(false)
    try {
      let query = supabase
        .from('phones')
        .select('*')
        .order('created_at', { ascending: false })

      if (assignedTo) query = query.eq('assigned_to', assignedTo)

      const { data, error } = await withTimeout(query, QUERY_TIMEOUT)
      if (error) throw error
      setPhones(data ?? [])
    } catch {
      setPhones([])
      setDbError(true)
    } finally {
      setLoading(false)
    }
  }, [assignedTo])

  useEffect(() => {
    fetchPhones()

    const channel = supabase
      .channel(`phones-${assignedTo ?? 'all'}`)
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
  }, [fetchPhones])

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

  // ── Mark as Sold ────────────────────────────────────────────
  async function markAsSold(phoneId: string, actor: Profile): Promise<boolean> {
    if (mutatingIds.current.has(phoneId)) return false
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
    serial: string,
    actor:  Profile,
    opts?: { barcode?: string; imei?: string },
  ): Promise<boolean> {
    try {
      const row: Record<string, unknown> = {
        model,
        serial_number: serial,
        status:        'in_stock',
      }
      if (opts?.barcode?.trim()) row.barcode = opts.barcode.trim()
      if (opts?.imei?.trim())    row.imei    = opts.imei.trim()

      const { error } = await withTimeout(
        supabase.from('phones').insert(row),
        MUTATE_TIMEOUT,
      )
      if (error) { toast.error(`Add failed: ${error.message}`); return false }

      // Realtime INSERT event updates local state — no refetch needed
      logActivity({
        actor_id:     actor.id,
        actor_name:   actor.full_name,
        role:         actor.role,
        action_type:  'STOCK_ADDED',
        entity_type:  'phone',
        entity_label: `${model} / SN ${serial}`,
        meta:         {
          model,
          serial,
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
  async function addPhonesBulk(model: string, serials: string[], actor: Profile): Promise<boolean> {
    const rows = serials.map((sn) => ({ model, serial_number: sn, status: 'in_stock' }))
    try {
      const { error } = await withTimeout(supabase.from('phones').insert(rows), MUTATE_TIMEOUT)
      if (error) { toast.error(`Bulk add failed: ${error.message}`); return false }

      logActivity({
        actor_id:     actor.id,
        actor_name:   actor.full_name,
        role:         actor.role,
        action_type:  'STOCK_ADDED',
        entity_type:  'phone',
        entity_label: model,
        meta:         { model, count: serials.length },
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
      const { error } = await withTimeout(
        supabase.from('phones')
          .update({ status: 'assigned', assigned_to: userId, assigned_at: now })
          .in('id', phoneIds),
        MUTATE_TIMEOUT,
      )
      if (error) { toast.error(`Assign failed: ${error.message}`); throw error }

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
      })

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
      const { error } = await withTimeout(
        supabase.from('phones').insert(
          rows.map((r) => ({
            model:         r.model,
            serial_number: r.serial_number,
            barcode:       r.barcode?.trim() || null,
            imei:          r.imei?.trim()    || null,
            status:        'in_stock',
          })),
        ),
        MUTATE_TIMEOUT,
      )
      if (error) { toast.error(`Import failed: ${error.message}`); return false }

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

  return {
    phones,
    loading,
    dbError,
    markAsSold,
    addPhone,
    addPhonesBulk,
    assignPhones,
    importPhones,
    lookupByBarcode,
    refetch: fetchPhones,
  }
}
