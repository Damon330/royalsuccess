import { useState } from 'react'
import Spinner from '../../shared/Spinner'
import Button from '../../shared/Button'
import { useAuth } from '../../../hooks/useAuth'
import type { PayrollRun, PayrollEntry } from '../../../hooks/usePayroll'
import { formatNaira, formatDateRange } from '../../../lib/payrollEngine'
import {
  MdExpandMore, MdExpandLess, MdCheckCircle, MdPending,
  MdAttachMoney, MdPeople, MdCalendarToday,
} from 'react-icons/md'

interface Props {
  runs:              PayrollRun[]
  loading:           boolean
  onStatusChange:    (runId: string, status: 'approved' | 'paid') => Promise<boolean>
  onFetchEntries:    (runId: string) => Promise<PayrollEntry[]>
}

const STATUS_CONFIG = {
  draft:    { label: 'Draft',    bg: 'bg-gray-100',   text: 'text-gray-600' },
  approved: { label: 'Approved', bg: 'bg-blue-100',   text: 'text-blue-700' },
  paid:     { label: 'Paid',     bg: 'bg-green-100',  text: 'text-green-700' },
}

function RunRow({ run, onStatusChange, onFetchEntries }: {
  run:              PayrollRun
  onStatusChange:   (runId: string, status: 'approved' | 'paid') => Promise<boolean>
  onFetchEntries:   (runId: string) => Promise<PayrollEntry[]>
}) {
  const { profile } = useAuth()
  const [expanded, setExpanded] = useState(false)
  const [entries,  setEntries]  = useState<PayrollEntry[] | null>(null)
  const [loadingEntries, setLoadingEntries] = useState(false)
  const [changingStatus, setChangingStatus] = useState(false)

  const s = STATUS_CONFIG[run.status]

  async function toggleExpand() {
    setExpanded((v) => !v)
    if (!expanded && entries === null) {
      setLoadingEntries(true)
      const data = await onFetchEntries(run.id)
      setEntries(data)
      setLoadingEntries(false)
    }
  }

  async function handleStatusChange(newStatus: 'approved' | 'paid') {
    if (!profile) return
    setChangingStatus(true)
    await onStatusChange(run.id, newStatus)
    setChangingStatus(false)
  }

  const generatedAt = new Date(run.generated_at).toLocaleDateString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
      {/* Header row */}
      <button
        onClick={toggleExpand}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${s.bg} ${s.text}`}>
              {run.status === 'draft'    && <MdPending    className="w-3 h-3 mr-1" />}
              {run.status === 'approved' && <MdCheckCircle className="w-3 h-3 mr-1" />}
              {run.status === 'paid'     && <MdAttachMoney className="w-3 h-3 mr-1" />}
              {s.label}
            </span>
            <span className="text-xs text-brand-muted capitalize">{run.frequency}</span>
          </div>
          <p className="font-semibold text-brand-text mt-1">
            {formatDateRange(run.period_start, run.period_end)}
          </p>
          {run.notes && (
            <p className="text-xs text-brand-muted italic mt-0.5">{run.notes}</p>
          )}
        </div>

        <div className="hidden sm:flex items-center gap-6 flex-shrink-0">
          <div className="text-right">
            <p className="text-xs text-brand-muted flex items-center gap-1 justify-end">
              <MdPeople className="w-3 h-3" /> {run.employee_count} employees
            </p>
            <p className="text-xs text-brand-muted flex items-center gap-1 justify-end mt-0.5">
              <MdCalendarToday className="w-3 h-3" /> {generatedAt}
            </p>
          </div>
          <div className="text-right min-w-[100px]">
            <p className="text-xs text-brand-muted uppercase tracking-wide font-semibold">Total Payout</p>
            <p className="text-lg font-extrabold text-primary tabular-nums">{formatNaira(run.total_payout)}</p>
          </div>
        </div>

        {expanded
          ? <MdExpandLess className="w-5 h-5 text-brand-muted flex-shrink-0" />
          : <MdExpandMore  className="w-5 h-5 text-brand-muted flex-shrink-0" />
        }
      </button>

      {/* Mobile payout summary */}
      <div className="sm:hidden px-5 pb-3 flex items-center justify-between border-t border-brand-border pt-2">
        <span className="text-xs text-brand-muted">{run.employee_count} employees · {generatedAt}</span>
        <span className="font-extrabold text-primary">{formatNaira(run.total_payout)}</span>
      </div>

      {/* Expanded entries */}
      {expanded && (
        <div className="border-t border-brand-border">
          {/* Status controls */}
          {run.status !== 'paid' && (
            <div className="px-5 py-3 bg-gray-50 flex items-center justify-between border-b border-brand-border">
              <p className="text-xs text-brand-muted">
                {run.status === 'draft'
                  ? 'Review the breakdown below, then approve when ready.'
                  : 'Mark as paid once all employees have been compensated.'}
              </p>
              <Button
                size="sm"
                onClick={() => handleStatusChange(run.status === 'draft' ? 'approved' : 'paid')}
                loading={changingStatus}
                variant={run.status === 'draft' ? 'primary' : 'success'}
              >
                {run.status === 'draft' ? 'Approve Run' : 'Mark as Paid'}
              </Button>
            </div>
          )}

          {loadingEntries ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : entries && entries.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['Employee', 'Role', 'Units', 'Revenue', 'Base', 'Commission', 'Bonus', 'Total', 'Target'].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-brand-muted uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border">
                  {entries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
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
                      <td className="px-4 py-3 text-brand-text font-medium">{entry.units_sold}</td>
                      <td className="px-4 py-3 text-brand-muted tabular-nums">{formatNaira(entry.revenue)}</td>
                      <td className="px-4 py-3 text-brand-muted tabular-nums">{formatNaira(entry.base_salary)}</td>
                      <td className="px-4 py-3 text-blue-700 tabular-nums">{formatNaira(entry.total_commission)}</td>
                      <td className="px-4 py-3 text-orange-600 tabular-nums">{formatNaira(entry.performance_bonus)}</td>
                      <td className="px-4 py-3 font-extrabold text-brand-text tabular-nums">
                        {formatNaira(entry.total_earnings)}
                      </td>
                      <td className="px-4 py-3">
                        {entry.target_met ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                            <MdCheckCircle className="w-3 h-3" /> Met
                          </span>
                        ) : (
                          <span className="text-xs text-brand-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-primary-pale border-t-2 border-primary/20">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-sm font-bold text-primary">Totals</td>
                    <td className="px-4 py-3 font-bold text-brand-muted tabular-nums">
                      {formatNaira(entries.reduce((s, e) => s + e.base_salary, 0))}
                    </td>
                    <td className="px-4 py-3 font-bold text-blue-700 tabular-nums">
                      {formatNaira(entries.reduce((s, e) => s + e.total_commission, 0))}
                    </td>
                    <td className="px-4 py-3 font-bold text-orange-600 tabular-nums">
                      {formatNaira(entries.reduce((s, e) => s + e.performance_bonus, 0))}
                    </td>
                    <td className="px-4 py-3 font-extrabold text-primary text-base tabular-nums">
                      {formatNaira(run.total_payout)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-brand-muted">No entries found.</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function PayrollHistory({ runs, loading, onStatusChange, onFetchEntries }: Props) {
  const draft    = runs.filter((r) => r.status === 'draft')
  const approved = runs.filter((r) => r.status === 'approved')
  const paid     = runs.filter((r) => r.status === 'paid')

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  if (runs.length === 0) {
    return (
      <div className="bg-white border border-brand-border rounded-xl p-16 text-center">
        <div className="w-16 h-16 bg-primary-pale rounded-2xl flex items-center justify-center mx-auto mb-4">
          <MdAttachMoney className="w-8 h-8 text-primary/40" />
        </div>
        <p className="font-bold text-brand-text text-lg">No payroll runs yet</p>
        <p className="text-sm text-brand-muted mt-1.5">
          Configure rules and targets, then use the Generate tab to run your first payroll.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {draft.length > 0 && (
        <section>
          <h3 className="text-xs font-bold text-brand-muted uppercase tracking-widest mb-3">
            Draft ({draft.length})
          </h3>
          <div className="space-y-3">
            {draft.map((r) => (
              <RunRow key={r.id} run={r} onStatusChange={onStatusChange} onFetchEntries={onFetchEntries} />
            ))}
          </div>
        </section>
      )}
      {approved.length > 0 && (
        <section>
          <h3 className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-3">
            Approved ({approved.length})
          </h3>
          <div className="space-y-3">
            {approved.map((r) => (
              <RunRow key={r.id} run={r} onStatusChange={onStatusChange} onFetchEntries={onFetchEntries} />
            ))}
          </div>
        </section>
      )}
      {paid.length > 0 && (
        <section>
          <h3 className="text-xs font-bold text-green-600 uppercase tracking-widest mb-3">
            Paid ({paid.length})
          </h3>
          <div className="space-y-3">
            {paid.map((r) => (
              <RunRow key={r.id} run={r} onStatusChange={onStatusChange} onFetchEntries={onFetchEntries} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
