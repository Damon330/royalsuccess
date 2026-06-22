import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { withTimeout } from '../lib/withTimeout'
import { logActivity } from '../lib/logActivity'
import {
  computePayroll,
  type EmployeeRule,
  type EmployeeTarget,
  type EmployeePayrollEntry,
  type PayrollPeriod,
} from '../lib/payrollEngine'
import type { Profile } from '../types'
import toast from 'react-hot-toast'

const TIMEOUT = 10_000

// ── DB-layer types ────────────────────────────────────────────────────────────

export interface PayrollConfig {
  id:                 string
  employee_id:        string | null
  base_salary:        number
  payment_frequency:  'daily' | 'weekly' | 'monthly'
  commission_mode:    'fixed' | 'percentage'
  commission_value:   number
  notes:              string | null
  created_at:         string
  updated_at:         string
  employee?:          { id: string; full_name: string; role: string }
}

export interface PayrollTarget {
  id:           string
  employee_id:  string
  metric:       'units' | 'revenue'
  period:       'weekly' | 'monthly'
  target_value: number
  reward_mode:  'FIXED_REWARD' | 'ALL_SALES' | 'ABOVE_TARGET_ONLY'
  reward_value: number
  active:       boolean
  notes:        string | null
  created_at:   string
  employee?:    { id: string; full_name: string; role: string }
}

export interface PayrollRun {
  id:             string
  period_start:   string
  period_end:     string
  frequency:      'weekly' | 'monthly' | 'custom'
  status:         'draft' | 'approved' | 'paid'
  generated_by:   string | null
  generated_at:   string
  total_payout:   number
  employee_count: number
  notes:          string | null
  entries?:       PayrollEntry[]
}

export interface PayrollEntry {
  id:                 string
  run_id:             string
  employee_id:        string
  employee_name:      string
  employee_role:      string
  base_salary:        number
  total_commission:   number
  performance_bonus:  number
  total_earnings:     number
  units_sold:         number
  revenue:            number
  target_met:         boolean
  breakdown:          Record<string, unknown>
  created_at:         string
}

export type ConfigFormData = Omit<PayrollConfig, 'id' | 'created_at' | 'updated_at' | 'employee'>
export type TargetFormData = Omit<PayrollTarget, 'id' | 'created_at' | 'employee'>

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePayroll() {
  const [configs,  setConfigs]  = useState<PayrollConfig[]>([])
  const [targets,  setTargets]  = useState<PayrollTarget[]>([])
  const [runs,     setRuns]     = useState<PayrollRun[]>([])
  const [loading,  setLoading]  = useState(true)
  const [dbError,  setDbError]  = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setDbError(false)
    try {
      const [cRes, tRes, rRes] = await Promise.all([
        withTimeout(
          supabase
            .from('payroll_configs')
            .select('*, employee:employee_id(id,full_name,role)')
            .order('created_at'),
          TIMEOUT,
        ),
        withTimeout(
          supabase
            .from('payroll_targets')
            .select('*, employee:employee_id(id,full_name,role)')
            .order('created_at'),
          TIMEOUT,
        ),
        withTimeout(
          supabase
            .from('payroll_runs')
            .select('*')
            .order('generated_at', { ascending: false })
            .limit(50),
          TIMEOUT,
        ),
      ])
      if (cRes.error) throw cRes.error
      if (tRes.error) throw tRes.error
      if (rRes.error) throw rRes.error
      setConfigs((cRes.data ?? []) as PayrollConfig[])
      setTargets((tRes.data ?? []) as PayrollTarget[])
      setRuns((rRes.data   ?? []) as PayrollRun[])
    } catch {
      setDbError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Config CRUD ────────────────────────────────────────────────────────────

  async function upsertConfig(data: ConfigFormData, actor: Profile): Promise<boolean> {
    try {
      const now      = new Date().toISOString()
      // Determine whether this is an INSERT or UPDATE by matching on employee_id
      // (null == null in JS, so this correctly handles the global-default case too)
      const existing = configs.find((c) => c.employee_id === data.employee_id)
      const { error } = await withTimeout(
        existing
          ? supabase.from('payroll_configs')
              .update({ ...data, updated_at: now })
              .eq('id', existing.id)
          : supabase.from('payroll_configs')
              .insert({ ...data, updated_at: now }),
        TIMEOUT,
      )
      if (error) throw error

      logActivity({
        actor_id:     actor.id,
        actor_name:   actor.full_name,
        role:         actor.role,
        action_type:  'PAYROLL_CONFIG_SAVED',
        entity_type:  'payroll_config',
        entity_label: data.employee_id ? `Config for employee` : 'Global payroll config',
        meta:         { ...data },
      })
      toast.success('Payroll rule saved.')
      await fetchAll()
      return true
    } catch (err) {
      toast.error(`Failed to save rule: ${(err as Error).message}`)
      return false
    }
  }

  async function deleteConfig(id: string, actor: Profile): Promise<boolean> {
    try {
      const { error } = await withTimeout(
        supabase.from('payroll_configs').delete().eq('id', id),
        TIMEOUT,
      )
      if (error) throw error
      logActivity({
        actor_id:     actor.id,
        actor_name:   actor.full_name,
        role:         actor.role,
        action_type:  'PAYROLL_CONFIG_DELETED',
        entity_type:  'payroll_config',
        entity_label: 'Payroll config deleted',
        meta:         { config_id: id },
      })
      toast.success('Rule deleted.')
      setConfigs((prev) => prev.filter((c) => c.id !== id))
      return true
    } catch {
      toast.error('Failed to delete rule.')
      return false
    }
  }

  // ── Target CRUD ────────────────────────────────────────────────────────────

  async function upsertTarget(data: TargetFormData, _actor: Profile): Promise<boolean> {
    try {
      // Deactivate any existing active target for this employee first
      if (data.active && data.employee_id) {
        await supabase
          .from('payroll_targets')
          .update({ active: false })
          .eq('employee_id', data.employee_id)
          .eq('active', true)
      }
      const { error } = await withTimeout(
        supabase.from('payroll_targets').insert({ ...data, updated_at: new Date().toISOString() }),
        TIMEOUT,
      )
      if (error) throw error
      toast.success('Target saved.')
      await fetchAll()
      return true
    } catch (err) {
      toast.error(`Failed to save target: ${(err as Error).message}`)
      return false
    }
  }

  async function updateTarget(id: string, data: Partial<TargetFormData>, _actor: Profile): Promise<boolean> {
    try {
      const { error } = await withTimeout(
        supabase.from('payroll_targets').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id),
        TIMEOUT,
      )
      if (error) throw error
      toast.success('Target updated.')
      setTargets((prev) => prev.map((t) => t.id === id ? { ...t, ...data } : t))
      return true
    } catch {
      toast.error('Failed to update target.')
      return false
    }
  }

  async function deleteTarget(id: string): Promise<boolean> {
    try {
      const { error } = await withTimeout(
        supabase.from('payroll_targets').delete().eq('id', id),
        TIMEOUT,
      )
      if (error) throw error
      toast.success('Target deleted.')
      setTargets((prev) => prev.filter((t) => t.id !== id))
      return true
    } catch {
      toast.error('Failed to delete target.')
      return false
    }
  }

  // ── Preview (in-memory, no DB write) ─────────────────────────────────────

  async function previewPayroll(
    period: PayrollPeriod,
    employees: Profile[],
  ): Promise<EmployeePayrollEntry[] | null> {
    try {
      const [salesRes, profilesRes] = await Promise.all([
        withTimeout(
          supabase
            .from('sales')
            .select('id, phone_id, sold_by, sold_at, agreed_price, phone:phone_id(model)')
            .gte('sold_at', `${period.start}T00:00:00`)
            .lte('sold_at', `${period.end}T23:59:59`),
          TIMEOUT,
        ),
        Promise.resolve({ data: employees }),
      ])
      if (salesRes.error) throw salesRes.error

      const salesRaw = salesRes.data ?? []
      const saleRecords = salesRaw.map((s: Record<string, unknown>) => ({
        id:           s.id as string,
        phone_model:  (s.phone as { model?: string } | null)?.model ?? 'Unknown',
        agreed_price: s.agreed_price as number | null,
        sold_by:      s.sold_by as string,
        sold_at:      s.sold_at as string,
      }))

      const engineRules: EmployeeRule[] = configs.map((c) => ({
        employee_id:       c.employee_id,
        base_salary:       c.base_salary,
        payment_frequency: c.payment_frequency,
        commission_mode:   c.commission_mode,
        commission_value:  c.commission_value,
      }))

      const engineTargets: EmployeeTarget[] = targets.map((t) => ({
        id:           t.id,
        employee_id:  t.employee_id,
        metric:       t.metric,
        period:       t.period,
        target_value: t.target_value,
        reward_mode:  t.reward_mode,
        reward_value: t.reward_value,
        active:       t.active,
      }))

      const employeeProfiles = (profilesRes.data ?? [])
        .filter((p) => p.role !== 'admin' && p.status === 'active')
        .map((p) => ({ id: p.id, full_name: p.full_name, role: p.role }))

      return computePayroll(employeeProfiles, saleRecords, engineRules, engineTargets, period)
    } catch (err) {
      toast.error(`Preview failed: ${(err as Error).message}`)
      return null
    }
  }

  // ── Generate payroll run (immutable snapshot) ─────────────────────────────

  async function generatePayroll(
    period:   PayrollPeriod,
    entries:  EmployeePayrollEntry[],
    actor:    Profile,
    notes?:   string,
  ): Promise<string | null> {
    try {
      const total_payout    = entries.reduce((s, e) => s + e.total_earnings, 0)
      const employee_count  = entries.length

      const { data: runData, error: runErr } = await withTimeout(
        supabase
          .from('payroll_runs')
          .insert({
            period_start:   period.start,
            period_end:     period.end,
            frequency:      period.frequency,
            status:         'draft',
            generated_by:   actor.id,
            total_payout:   Math.round(total_payout * 100) / 100,
            employee_count,
            notes:          notes ?? null,
          })
          .select('id')
          .single(),
        TIMEOUT,
      )
      if (runErr) throw runErr

      const runId = (runData as { id: string }).id

      const entryRows = entries.map((e) => ({
        run_id:            runId,
        employee_id:       e.employee_id,
        employee_name:     e.employee_name,
        employee_role:     e.employee_role,
        base_salary:       e.base_salary,
        total_commission:  e.total_commission,
        performance_bonus: e.performance_bonus,
        total_earnings:    e.total_earnings,
        units_sold:        e.units_sold,
        revenue:           e.revenue,
        target_met:        e.target_met,
        breakdown:         e.breakdown,
      }))

      const { error: entriesErr } = await withTimeout(
        supabase.from('payroll_entries').insert(entryRows),
        TIMEOUT,
      )
      if (entriesErr) throw entriesErr

      logActivity({
        actor_id:     actor.id,
        actor_name:   actor.full_name,
        role:         actor.role,
        action_type:  'PAYROLL_RUN_GENERATED',
        entity_type:  'payroll_run',
        entity_id:    runId,
        entity_label: `Payroll run ${period.start} – ${period.end}`,
        meta:         { employee_count, total_payout, period },
      })

      toast.success('Payroll run generated.')
      await fetchAll()
      return runId
    } catch (err) {
      toast.error(`Payroll generation failed: ${(err as Error).message}`)
      return null
    }
  }

  // ── Status transitions ────────────────────────────────────────────────────

  async function updateRunStatus(
    runId:  string,
    status: 'approved' | 'paid',
    _actor: Profile,
  ): Promise<boolean> {
    try {
      const { error } = await withTimeout(
        supabase.from('payroll_runs').update({ status }).eq('id', runId),
        TIMEOUT,
      )
      if (error) throw error
      toast.success(`Payroll run marked as ${status}.`)
      setRuns((prev) => prev.map((r) => r.id === runId ? { ...r, status } : r))
      return true
    } catch {
      toast.error('Failed to update payroll status.')
      return false
    }
  }

  // ── Fetch entries for a specific run ──────────────────────────────────────

  async function fetchRunEntries(runId: string): Promise<PayrollEntry[]> {
    const { data, error } = await withTimeout(
      supabase.from('payroll_entries').select('*').eq('run_id', runId).order('total_earnings', { ascending: false }),
      TIMEOUT,
    )
    if (error) { toast.error('Failed to load payroll entries.'); return [] }
    return (data ?? []) as PayrollEntry[]
  }

  return {
    configs, targets, runs,
    loading, dbError,
    upsertConfig, deleteConfig,
    upsertTarget, updateTarget, deleteTarget,
    previewPayroll, generatePayroll,
    updateRunStatus, fetchRunEntries,
    refetch: fetchAll,
  }
}
