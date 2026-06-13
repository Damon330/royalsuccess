import { useState } from 'react'
import Header from '../../shared/Header'
import Spinner from '../../shared/Spinner'
import PayrollGenerate from './PayrollGenerate'
import PayrollRules from './PayrollRules'
import PayrollTargets from './PayrollTargets'
import PayrollHistory from './PayrollHistory'
import { usePayroll } from '../../../hooks/usePayroll'
import { useAuth } from '../../../hooks/useAuth'
import { useProfiles } from '../../../hooks/useProfiles'
import { formatNaira } from '../../../lib/payrollEngine'
import type { PayrollPeriod, EmployeePayrollEntry } from '../../../lib/payrollEngine'
import type { ConfigFormData, TargetFormData } from '../../../hooks/usePayroll'
import {
  MdPlayArrow, MdSettings, MdBarChart, MdHistory,
  MdWarning, MdRefresh, MdCheckCircle,
} from 'react-icons/md'

type Tab = 'generate' | 'rules' | 'targets' | 'history'

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'generate', label: 'Run Payroll', icon: MdPlayArrow  },
  { id: 'rules',    label: 'Pay Rules',   icon: MdSettings   },
  { id: 'targets',  label: 'Targets',     icon: MdBarChart   },
  { id: 'history',  label: 'History',     icon: MdHistory    },
]

export default function PayrollPage() {
  const { profile } = useAuth()
  const { profiles } = useProfiles()
  const {
    configs, targets, runs,
    loading, dbError,
    upsertConfig, deleteConfig,
    upsertTarget, updateTarget, deleteTarget,
    previewPayroll, generatePayroll,
    updateRunStatus, fetchRunEntries,
    refetch,
  } = usePayroll()

  const [tab, setTab] = useState<Tab>('generate')

  // ── Summary stats for the header cards ───────────────────────────────────
  const lastRun         = runs[0] ?? null
  const totalPaidRuns   = runs.filter((r) => r.status === 'paid').length
  const draftCount      = runs.filter((r) => r.status === 'draft').length
  const activeTargets   = targets.filter((t) => t.active).length
  const configuredCount = configs.filter((c) => c.employee_id !== null).length
  const hasGlobal       = configs.some((c) => c.employee_id === null)
  const activeAgents    = profiles.filter((p) => p.role !== 'admin' && p.status === 'active').length

  // ── Handler wrappers that pass the actor profile ──────────────────────────
  async function handleUpsertConfig(data: ConfigFormData): Promise<boolean> {
    if (!profile) return false
    return upsertConfig(data, profile)
  }

  async function handleDeleteConfig(id: string): Promise<boolean> {
    if (!profile) return false
    return deleteConfig(id, profile)
  }

  async function handleUpsertTarget(data: TargetFormData): Promise<boolean> {
    if (!profile) return false
    return upsertTarget(data, profile)
  }

  async function handleToggleTarget(id: string, active: boolean): Promise<boolean> {
    if (!profile) return false
    return updateTarget(id, { active }, profile)
  }

  async function handleDeleteTarget(id: string): Promise<boolean> {
    return deleteTarget(id)
  }

  async function handlePreview(period: PayrollPeriod, employees: typeof profiles): Promise<EmployeePayrollEntry[] | null> {
    return previewPayroll(period, employees)
  }

  async function handleGenerate(period: PayrollPeriod, entries: EmployeePayrollEntry[], notes?: string): Promise<string | null> {
    if (!profile) return null
    const id = await generatePayroll(period, entries, profile, notes)
    if (id) setTab('history')
    return id
  }

  async function handleStatusChange(runId: string, status: 'approved' | 'paid'): Promise<boolean> {
    if (!profile) return false
    return updateRunStatus(runId, status, profile)
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <Header title="Payroll" />

      <div className="p-6 space-y-6">

        {/* DB error banner */}
        {dbError && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <MdWarning className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">Database connection failed</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Make sure you've run <code className="bg-amber-100 px-1 rounded">supabase/payroll-schema.sql</code> in the Supabase SQL Editor first.
              </p>
            </div>
            <button
              onClick={refetch}
              className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
            >
              <MdRefresh className="w-4 h-4" /> Retry
            </button>
          </div>
        )}

        {/* Overview cards */}
        {!loading && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-brand-border border-l-4 border-l-primary p-4 shadow-sm hover:shadow-md transition-shadow">
              <p className="text-xs font-semibold text-brand-muted uppercase tracking-wider">Last Payout</p>
              <p className="text-2xl font-extrabold text-primary mt-1.5 tabular-nums">
                {lastRun ? formatNaira(lastRun.total_payout) : '—'}
              </p>
              {lastRun && (
                <p className="text-xs text-brand-muted mt-0.5 truncate">
                  {new Date(lastRun.generated_at).toLocaleDateString('en-NG', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </p>
              )}
            </div>

            <div className="bg-white rounded-xl border border-brand-border border-l-4 border-l-blue-400 p-4 shadow-sm hover:shadow-md transition-shadow">
              <p className="text-xs font-semibold text-brand-muted uppercase tracking-wider">Employees</p>
              <p className="text-2xl font-extrabold text-blue-700 mt-1.5 tabular-nums">
                {activeAgents}
              </p>
              <p className="text-xs text-brand-muted mt-0.5">
                {configuredCount} with specific rules{!hasGlobal ? ', no global default' : ''}
              </p>
            </div>

            <div className="bg-white rounded-xl border border-brand-border border-l-4 border-l-green-500 p-4 shadow-sm hover:shadow-md transition-shadow">
              <p className="text-xs font-semibold text-brand-muted uppercase tracking-wider">Runs Paid</p>
              <p className="text-2xl font-extrabold text-green-700 mt-1.5 tabular-nums">
                {totalPaidRuns}
              </p>
              {draftCount > 0 && (
                <p className="text-xs text-amber-600 font-medium mt-0.5">{draftCount} draft pending review</p>
              )}
            </div>

            <div className="bg-white rounded-xl border border-brand-border border-l-4 border-l-orange-400 p-4 shadow-sm hover:shadow-md transition-shadow">
              <p className="text-xs font-semibold text-brand-muted uppercase tracking-wider">Active Targets</p>
              <p className="text-2xl font-extrabold text-orange-600 mt-1.5 tabular-nums">
                {activeTargets}
              </p>
              <p className="text-xs text-brand-muted mt-0.5">
                {activeAgents - activeTargets} employees without a target
              </p>
            </div>
          </div>
        )}

        {/* Setup checklist (shown until fully configured) */}
        {!loading && (!hasGlobal || configs.length === 0) && (
          <div className="bg-white border border-brand-border rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-brand-text">Quick Setup Checklist</h3>
            <div className="space-y-2">
              {[
                {
                  done: hasGlobal || configuredCount > 0,
                  text: 'Add at least one pay rule (global default or per-employee)',
                  action: () => setTab('rules'),
                  cta: 'Go to Pay Rules',
                },
                {
                  done: activeTargets > 0,
                  text: 'Set performance targets for your team (optional)',
                  action: () => setTab('targets'),
                  cta: 'Go to Targets',
                },
              ].map(({ done, text, action, cta }) => (
                <div key={text} className={`flex items-center gap-3 rounded-xl p-3 ${done ? 'bg-green-50' : 'bg-gray-50'}`}>
                  {done
                    ? <MdCheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                    : <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
                  }
                  <span className={`text-sm flex-1 ${done ? 'text-green-800 line-through' : 'text-brand-text'}`}>
                    {text}
                  </span>
                  {!done && (
                    <button
                      onClick={action}
                      className="text-xs font-semibold text-primary hover:underline flex-shrink-0"
                    >
                      {cta} →
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white border border-brand-border rounded-xl overflow-hidden shadow-sm">
          {/* Tab bar */}
          <div className="flex border-b border-brand-border overflow-x-auto">
            {TABS.map(({ id, label, icon: Icon }) => {
              const badgeCount =
                id === 'history' ? draftCount :
                id === 'targets' ? 0 : 0
              return (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-all duration-150 ${
                    tab === id
                      ? 'border-primary text-primary bg-primary-pale/50'
                      : 'border-transparent text-brand-muted hover:text-brand-text hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                  {badgeCount > 0 && (
                    <span className="ml-1 bg-warning text-yellow-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {badgeCount}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Tab content */}
          <div className="p-5">
            {loading ? (
              <div className="flex justify-center py-12"><Spinner size="lg" /></div>
            ) : (
              <>
                {tab === 'generate' && (
                  <PayrollGenerate
                    onPreview={handlePreview}
                    onGenerate={handleGenerate}
                  />
                )}
                {tab === 'rules' && (
                  <PayrollRules
                    configs={configs}
                    loading={loading}
                    onUpsert={handleUpsertConfig}
                    onDelete={handleDeleteConfig}
                  />
                )}
                {tab === 'targets' && (
                  <PayrollTargets
                    targets={targets}
                    loading={loading}
                    onUpsert={handleUpsertTarget}
                    onDelete={handleDeleteTarget}
                    onToggle={handleToggleTarget}
                  />
                )}
                {tab === 'history' && (
                  <PayrollHistory
                    runs={runs}
                    loading={loading}
                    onStatusChange={handleStatusChange}
                    onFetchEntries={fetchRunEntries}
                  />
                )}
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
