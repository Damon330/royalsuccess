// ── Payroll Calculation Engine ────────────────────────────────────────────────
// Pure functions — no Supabase calls, no side effects.
// Same inputs → same outputs (deterministic).
// Extend by adding new RewardMode cases or commission lookups without touching callers.

export type CommissionMode    = 'fixed' | 'percentage'
export type PaymentFrequency  = 'daily' | 'weekly' | 'monthly'
export type TargetMetric      = 'units' | 'revenue'
export type TargetPeriod      = 'weekly' | 'monthly'
export type RewardMode        = 'FIXED_REWARD' | 'ALL_SALES' | 'ABOVE_TARGET_ONLY'

// ── Input types ───────────────────────────────────────────────────────────────

export interface SaleRecord {
  id:           string
  phone_model:  string
  agreed_price: number | null   // null → percentage commission yields ₦0 for that sale
  sold_by:      string
  sold_at:      string          // ISO 8601 timestamp
}

export interface EmployeeRule {
  employee_id:        string | null  // null = global default (fallback for everyone)
  base_salary:        number
  payment_frequency:  PaymentFrequency
  commission_mode:    CommissionMode
  commission_value:   number         // ₦ per unit  OR  decimal (0.05 = 5%)
}

export interface EmployeeTarget {
  id:           string
  employee_id:  string
  metric:       TargetMetric
  period:       TargetPeriod
  target_value: number
  reward_mode:  RewardMode
  reward_value: number   // ₦ flat bonus  |  ₦ per-unit  |  decimal % multiplier
  active:       boolean
}

export interface EmployeeProfile {
  id:        string
  full_name: string
  role:      string
}

export interface PayrollPeriod {
  start:     string  // 'YYYY-MM-DD'
  end:       string  // 'YYYY-MM-DD'
  frequency: 'weekly' | 'monthly' | 'custom'
}

// ── Output types ──────────────────────────────────────────────────────────────

export interface CommissionLine {
  sale_id:      string
  phone_model:  string
  agreed_price: number | null
  mode:         CommissionMode
  rate:         number
  amount:       number
}

export interface TargetEvaluation {
  has_target:   boolean
  target_id?:   string
  metric?:      TargetMetric
  reward_mode?: RewardMode
  actual_value: number
  target_value: number
  met:          boolean
  bonus:        number
  shortfall:    number
}

export interface EmployeePayrollEntry {
  employee_id:       string
  employee_name:     string
  employee_role:     string
  base_salary:       number
  total_commission:  number
  performance_bonus: number
  total_earnings:    number
  units_sold:        number
  revenue:           number
  target_met:        boolean
  breakdown: {
    commission_lines: CommissionLine[]
    target:           TargetEvaluation
    rule_used:        'employee-specific' | 'global-default' | 'none'
  }
}

// ── Core engine functions ─────────────────────────────────────────────────────

function r2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Priority: employee-specific rule → global default → null (no rule)
 */
function resolveRule(
  employeeId: string,
  rules: EmployeeRule[],
): { rule: EmployeeRule; source: 'employee-specific' | 'global-default' } | null {
  const specific = rules.find((r) => r.employee_id === employeeId)
  if (specific) return { rule: specific, source: 'employee-specific' }
  const global_ = rules.find((r) => r.employee_id === null)
  if (global_) return { rule: global_, source: 'global-default' }
  return null
}

/**
 * Prorate base salary to the exact period length.
 *
 * daily   → salary × days
 * weekly  → salary × (days / 7)
 * monthly → salary × (days / 30)  [standard proration — avoids month-length ambiguity]
 */
function proratedSalary(rule: EmployeeRule, period: PayrollPeriod): number {
  const days =
    Math.ceil(
      (new Date(period.end).getTime() - new Date(period.start).getTime()) / 86_400_000,
    ) + 1  // inclusive of both start and end day

  switch (rule.payment_frequency) {
    case 'daily':   return r2(rule.base_salary * days)
    case 'weekly':  return r2(rule.base_salary * (days / 7))
    case 'monthly': return r2(rule.base_salary * (days / 30))
  }
}

/**
 * Commission for a single sale.
 *
 * fixed      → rule.commission_value  (₦ per unit, ignores price)
 * percentage → agreed_price × rule.commission_value  (e.g. 0.05 = 5%)
 *              If agreed_price is null → ₦0 (price unknown, cannot compute)
 */
function commissionForSale(sale: SaleRecord, rule: EmployeeRule): CommissionLine {
  const amount =
    rule.commission_mode === 'fixed'
      ? rule.commission_value
      : r2((sale.agreed_price ?? 0) * rule.commission_value)

  return {
    sale_id:      sale.id,
    phone_model:  sale.phone_model,
    agreed_price: sale.agreed_price,
    mode:         rule.commission_mode,
    rate:         rule.commission_value,
    amount:       r2(amount),
  }
}

/**
 * Performance target evaluation.
 *
 * Metric value:
 *   units   → count of sales in period
 *   revenue → sum of agreed_price values
 *
 * If target is NOT met → bonus = 0.
 * If target IS met:
 *   FIXED_REWARD       bonus = reward_value (flat, regardless of amount exceeded)
 *   ALL_SALES          units:   bonus = units_sold × reward_value
 *                      revenue: bonus = revenue × reward_value  (reward_value is a decimal %)
 *   ABOVE_TARGET_ONLY  units:   bonus = (units - target) × reward_value
 *                      revenue: bonus = (revenue - target) × reward_value
 */
function evaluateTarget(
  employeeId: string,
  sales: SaleRecord[],
  targets: EmployeeTarget[],
): TargetEvaluation {
  const target = targets.find((t) => t.employee_id === employeeId && t.active)

  if (!target) {
    return { has_target: false, actual_value: 0, target_value: 0, met: false, bonus: 0, shortfall: 0 }
  }

  const units   = sales.length
  const revenue = r2(sales.reduce((s, sale) => s + (sale.agreed_price ?? 0), 0))
  const actual  = target.metric === 'units' ? units : revenue
  const met     = actual >= target.target_value

  let bonus = 0
  if (met) {
    const excess = r2(actual - target.target_value)
    switch (target.reward_mode) {
      case 'FIXED_REWARD':
        bonus = target.reward_value
        break
      case 'ALL_SALES':
        bonus = target.metric === 'units'
          ? r2(units * target.reward_value)
          : r2(revenue * target.reward_value)
        break
      case 'ABOVE_TARGET_ONLY':
        bonus = target.metric === 'units'
          ? r2(excess * target.reward_value)
          : r2(excess * target.reward_value)
        break
    }
  }

  return {
    has_target:   true,
    target_id:    target.id,
    metric:       target.metric,
    reward_mode:  target.reward_mode,
    actual_value: actual,
    target_value: target.target_value,
    met,
    bonus:        r2(bonus),
    shortfall:    met ? 0 : r2(target.target_value - actual),
  }
}

// ── Main exported function ────────────────────────────────────────────────────

/**
 * computePayroll — the heart of the engine.
 *
 * Step 1: Filter sales to the period window.
 * Step 2: For each non-admin employee:
 *   a) Resolve commission/salary rule (employee-specific → global → none)
 *   b) Prorate base salary
 *   c) Compute per-sale commission lines
 *   d) Evaluate performance target
 *   e) Sum totals
 * Step 3: Return one EmployeePayrollEntry per employee (includes full audit breakdown).
 *
 * Employees with zero sales and no rule still appear — they receive 0 for everything.
 */
export function computePayroll(
  employees: EmployeeProfile[],
  sales: SaleRecord[],
  rules: EmployeeRule[],
  targets: EmployeeTarget[],
  period: PayrollPeriod,
): EmployeePayrollEntry[] {
  const periodStart = new Date(period.start)
  const periodEnd   = new Date(period.end)
  periodEnd.setHours(23, 59, 59, 999)

  return employees
    .filter((e) => e.role !== 'admin')
    .map((employee) => {
      const employeeSales = sales.filter((s) => {
        const d = new Date(s.sold_at)
        return s.sold_by === employee.id && d >= periodStart && d <= periodEnd
      })

      const resolved = resolveRule(employee.id, rules)
      const base_salary      = resolved ? proratedSalary(resolved.rule, period) : 0
      const commission_lines = resolved
        ? employeeSales.map((s) => commissionForSale(s, resolved.rule))
        : []
      const total_commission = r2(commission_lines.reduce((sum, l) => sum + l.amount, 0))
      const targetEval       = evaluateTarget(employee.id, employeeSales, targets)
      const revenue          = r2(employeeSales.reduce((s, sale) => s + (sale.agreed_price ?? 0), 0))

      return {
        employee_id:       employee.id,
        employee_name:     employee.full_name,
        employee_role:     employee.role,
        base_salary,
        total_commission,
        performance_bonus: targetEval.bonus,
        total_earnings:    r2(base_salary + total_commission + targetEval.bonus),
        units_sold:        employeeSales.length,
        revenue,
        target_met:        targetEval.met,
        breakdown: {
          commission_lines,
          target:    targetEval,
          rule_used: resolved?.source ?? 'none',
        },
      }
    })
}

// ── Helpers exported for UI ───────────────────────────────────────────────────

export function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', {
    minimumFractionDigits:  2,
    maximumFractionDigits: 2,
  })}`
}

/** Returns the ISO date string for the start/end of the current week (Mon–Sun) */
export function currentWeekRange(): { start: string; end: string } {
  const today = new Date()
  const day   = today.getDay()
  const diff  = day === 0 ? -6 : 1 - day  // Monday
  const mon   = new Date(today)
  mon.setDate(today.getDate() + diff)
  mon.setHours(0, 0, 0, 0)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return { start: mon.toISOString().slice(0, 10), end: sun.toISOString().slice(0, 10) }
}

/** Returns the ISO date string for the start/end of the current calendar month */
export function currentMonthRange(): { start: string; end: string } {
  const now   = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return {
    start: start.toISOString().slice(0, 10),
    end:   end.toISOString().slice(0, 10),
  }
}

export function formatDateRange(start: string, end: string): string {
  const s = new Date(start)
  const e = new Date(end)
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${s.getDate()} – ${e.toLocaleDateString('en-NG', opts)}`
  }
  return `${s.toLocaleDateString('en-NG', opts)} – ${e.toLocaleDateString('en-NG', opts)}`
}
