import { useState } from 'react'
import Button from '../../shared/Button'
import Spinner from '../../shared/Spinner'
import { useAuth } from '../../../hooks/useAuth'
import { useProfiles } from '../../../hooks/useProfiles'
import type { EmployeePayrollEntry, PayrollPeriod } from '../../../lib/payrollEngine'
import {
  formatNaira, formatDateRange,
  currentWeekRange, currentMonthRange,
} from '../../../lib/payrollEngine'
import {
  MdCalendarToday, MdPlayArrow, MdCheckCircle,
  MdWarning, MdPeople, MdTrendingUp,
} from 'react-icons/md'

interface Props {
  onPreview:  (period: PayrollPeriod, employees: ReturnType<typeof useProfiles>['profiles']) => Promise<EmployeePayrollEntry[] | null>
  onGenerate: (period: PayrollPeriod, entries: EmployeePayrollEntry[], notes?: string) => Promise<string | null>
}

type QuickRange = 'week' | 'month' | 'custom'

function ProgressBar({ value, max, color = 'bg-primary' }: {
  value: number; max: number; color?: string
}) {
  const pct = max === 0 ? 0 : Math.min(100, (value / max) * 100)
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function PayrollGenerate({ onPreview, onGenerate }: Props) {
  const { profile } = useAuth()
  const { profiles } = useProfiles()

  const [range,     setRange]     = useState<QuickRange>('month')
  const [customStart, setCustomStart] = useState(currentMonthRange().start)
  const [customEnd,   setCustomEnd]   = useState(currentMonthRange().end)
  const [notes,     setNotes]     = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [entries,   setEntries]   = useState<EmployeePayrollEntry[] | null>(null)
  const [generated, setGenerated] = useState<string | null>(null)

  const period = buildPeriod()

  function buildPeriod(): PayrollPeriod {
    if (range === 'week') {
      const w = currentWeekRange()
      return { start: w.start, end: w.end, frequency: 'weekly' }
    }
    if (range === 'month') {
      const m = currentMonthRange()
      return { start: m.start, end: m.end, frequency: 'monthly' }
    }
    return { start: customStart, end: customEnd, frequency: 'custom' }
  }

  async function handlePreview() {
    setPreviewing(true)
    setEntries(null)
    setGenerated(null)
    const result = await onPreview(period, profiles)
    setEntries(result)
    setPreviewing(false)
  }

  async function handleGenerate() {
    if (!entries || !profile) return
    setGenerating(true)
    const runId = await onGenerate(period, entries, notes || undefined)
    setGenerating(false)
    if (runId) setGenerated(runId)
  }

  const totalPayout    = entries ? entries.reduce((s, e) => s + e.total_earnings, 0)  : 0
  const totalComm      = entries ? entries.reduce((s, e) => s + e.total_commission, 0) : 0
  const totalBonus     = entries ? entries.reduce((s, e) => s + e.performance_bonus, 0): 0
  const targetMetCount = entries ? entries.filter((e) => e.target_met).length           : 0
  const withSales      = entries ? entries.filter((e) => e.units_sold > 0).length       : 0

  return (
    <div className="space-y-5 max-w-3xl">

      {/* Period selector */}
      <div className="bg-white border border-brand-border rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-brand-text flex items-center gap-2">
          <MdCalendarToday className="w-4 h-4 text-primary" />
          Select Pay Period
        </h3>

        {/* Quick ranges */}
        <div className="flex gap-2">
          {(['week', 'month', 'custom'] as const).map((r) => (
            <button
              key={r}
              onClick={() => { setRange(r); setEntries(null); setGenerated(null) }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                range === r
                  ? 'border-primary bg-primary-pale text-primary'
                  : 'border-brand-border text-brand-muted hover:border-primary/40'
              }`}
            >
              {r === 'week' ? 'This Week' : r === 'month' ? 'This Month' : 'Custom'}
            </button>
          ))}
        </div>

        {range === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-brand-muted mb-1">Start Date</label>
              <input
                type="date"
                value={customStart}
                max={customEnd}
                onChange={(e) => { setCustomStart(e.target.value); setEntries(null) }}
                className="w-full border border-brand-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-brand-muted mb-1">End Date</label>
              <input
                type="date"
                value={customEnd}
                min={customStart}
                onChange={(e) => { setCustomEnd(e.target.value); setEntries(null) }}
                className="w-full border border-brand-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-brand-muted">
            Period: <span className="font-medium text-brand-text">{formatDateRange(period.start, period.end)}</span>
          </p>
          <Button onClick={handlePreview} loading={previewing} size="sm">
            <MdPlayArrow className="w-4 h-4" />
            Preview Payroll
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {previewing && (
        <div className="flex flex-col items-center gap-3 py-12">
          <Spinner size="lg" />
          <p className="text-sm text-brand-muted">Calculating earnings…</p>
        </div>
      )}

      {/* Preview results */}
      {entries && !previewing && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Payout',       value: formatNaira(totalPayout),    border: 'border-l-primary',     val: 'text-primary' },
              { label: 'Total Commission',   value: formatNaira(totalComm),      border: 'border-l-blue-400',    val: 'text-blue-700' },
              { label: 'Performance Bonus',  value: formatNaira(totalBonus),     border: 'border-l-orange-400',  val: 'text-orange-600' },
              { label: 'Targets Met',        value: `${targetMetCount} / ${entries.length}`, border: 'border-l-green-500', val: 'text-green-700' },
            ].map(({ label, value, border, val }) => (
              <div key={label} className={`bg-white rounded-xl border border-brand-border border-l-4 ${border} p-4`}>
                <p className="text-xs text-brand-muted uppercase tracking-wide font-semibold">{label}</p>
                <p className={`text-xl font-extrabold ${val} mt-1 tabular-nums`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Employee breakdown table */}
          <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-brand-border flex items-center gap-2">
              <MdPeople className="w-4 h-4 text-brand-muted" />
              <h3 className="text-sm font-bold text-brand-text">
                Employee Breakdown — {entries.length} employees, {withSales} with sales
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-brand-border">
                  <tr>
                    {['Employee', 'Role', 'Sales', 'Base', 'Commission', 'Bonus', 'Total', 'Target'].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-brand-muted uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border">
                  {entries
                    .slice()
                    .sort((a, b) => b.total_earnings - a.total_earnings)
                    .map((entry) => (
                      <tr key={entry.employee_id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-brand-text whitespace-nowrap">
                          {entry.employee_name}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            entry.employee_role === 'team_lead'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-green-100 text-green-700'
                          }`}>
                            {entry.employee_role === 'team_lead' ? 'TL' : 'Agent'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-brand-text">
                          <span className="font-medium">{entry.units_sold}</span>
                          {entry.revenue > 0 && (
                            <span className="text-xs text-brand-muted ml-1">
                              ({formatNaira(entry.revenue)})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-brand-muted tabular-nums">
                          {formatNaira(entry.base_salary)}
                        </td>
                        <td className="px-4 py-3 text-blue-700 tabular-nums">
                          {formatNaira(entry.total_commission)}
                        </td>
                        <td className="px-4 py-3 text-orange-600 tabular-nums">
                          {formatNaira(entry.performance_bonus)}
                        </td>
                        <td className="px-4 py-3 font-bold text-brand-text tabular-nums">
                          {formatNaira(entry.total_earnings)}
                        </td>
                        <td className="px-4 py-3">
                          {entry.breakdown.target.has_target ? (
                            entry.target_met ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                                <MdCheckCircle className="w-3 h-3" /> Met
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full whitespace-nowrap">
                                <MdWarning className="w-3 h-3" />
                                {entry.breakdown.target.metric === 'units'
                                  ? `${entry.breakdown.target.shortfall} short`
                                  : `${formatNaira(entry.breakdown.target.shortfall)} short`
                                }
                              </span>
                            )
                          ) : (
                            <span className="text-xs text-brand-muted">No target</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
                <tfoot className="bg-primary-pale border-t-2 border-primary/20">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-sm font-bold text-primary">Totals</td>
                    <td className="px-4 py-3 font-bold text-brand-text tabular-nums">
                      {formatNaira(entries.reduce((s, e) => s + e.base_salary, 0))}
                    </td>
                    <td className="px-4 py-3 font-bold text-blue-700 tabular-nums">
                      {formatNaira(totalComm)}
                    </td>
                    <td className="px-4 py-3 font-bold text-orange-600 tabular-nums">
                      {formatNaira(totalBonus)}
                    </td>
                    <td className="px-4 py-3 font-extrabold text-primary text-base tabular-nums">
                      {formatNaira(totalPayout)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Sales ratio visual */}
          <div className="bg-white border border-brand-border rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <MdTrendingUp className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-brand-text">Payout Breakdown</h3>
            </div>
            {[
              { label: 'Base Salary', amount: entries.reduce((s, e) => s + e.base_salary, 0), color: 'bg-primary' },
              { label: 'Commission',  amount: totalComm,  color: 'bg-blue-500' },
              { label: 'Bonus',       amount: totalBonus, color: 'bg-orange-400' },
            ].map(({ label, amount, color }) => (
              <div key={label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-brand-muted font-medium">{label}</span>
                  <span className="text-brand-text font-semibold">{formatNaira(amount)}</span>
                </div>
                <ProgressBar value={amount} max={totalPayout} color={color} />
              </div>
            ))}
          </div>

          {/* Generate action */}
          {generated ? (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
              <MdCheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-green-800">Payroll run generated!</p>
                <p className="text-xs text-green-700 mt-0.5">
                  Saved as a draft. Go to <strong>History</strong> to approve or mark as paid.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-brand-border rounded-xl p-5 space-y-3">
              <div>
                <label className="block text-sm font-medium text-brand-text mb-1.5">
                  Notes <span className="text-brand-muted font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. May 2025 monthly payroll"
                  className="w-full border border-brand-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-brand-muted">
                  This will save an immutable snapshot. You can review and approve it in History.
                </p>
                <Button onClick={handleGenerate} loading={generating} size="lg">
                  Generate Payroll Run
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
