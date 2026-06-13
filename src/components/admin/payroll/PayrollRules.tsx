import { useState } from 'react'
import Button from '../../shared/Button'
import Modal from '../../shared/Modal'
import Spinner from '../../shared/Spinner'
import { useAuth } from '../../../hooks/useAuth'
import { useProfiles } from '../../../hooks/useProfiles'
import type { PayrollConfig, ConfigFormData } from '../../../hooks/usePayroll'
import { formatNaira } from '../../../lib/payrollEngine'
import {
  MdAdd, MdEdit, MdDelete, MdPublic, MdPerson, MdWarning,
} from 'react-icons/md'

interface Props {
  configs:      PayrollConfig[]
  loading:      boolean
  onUpsert:     (data: ConfigFormData) => Promise<boolean>
  onDelete:     (id: string) => Promise<boolean>
}

const FREQ_LABELS: Record<string, string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly',
}

const DEFAULT_FORM: ConfigFormData = {
  employee_id:       null,
  base_salary:       0,
  payment_frequency: 'monthly',
  commission_mode:   'fixed',
  commission_value:  0,
  notes:             null,
}

function ConfigModal({ initial, onSave, onClose, profiles }: {
  initial:  ConfigFormData
  onSave:   (data: ConfigFormData) => Promise<boolean>
  onClose:  () => void
  profiles: { id: string; full_name: string; role: string }[]
}) {
  const [form,    setForm]    = useState<ConfigFormData>(initial)
  const [saving,  setSaving]  = useState(false)
  const isGlobal = form.employee_id === null || form.employee_id === ''

  function set<K extends keyof ConfigFormData>(k: K, v: ConfigFormData[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function handleSave() {
    setSaving(true)
    const data: ConfigFormData = {
      ...form,
      employee_id:      isGlobal ? null : form.employee_id,
      base_salary:      Number(form.base_salary)     || 0,
      commission_value: Number(form.commission_value) || 0,
    }
    const ok = await onSave(data)
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Modal isOpen onClose={onClose} title={initial.employee_id ? 'Edit Pay Rule' : 'New Pay Rule'}>
      <div className="space-y-4">

        {/* Scope */}
        <div>
          <label className="block text-sm font-medium text-brand-text mb-1.5">Apply to</label>
          <select
            value={form.employee_id ?? ''}
            onChange={(e) => set('employee_id', e.target.value || null)}
            className="w-full border border-brand-border rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
          >
            <option value="">Global default (everyone without a specific rule)</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name} ({p.role === 'team_lead' ? 'Team Lead' : 'Agent'})
              </option>
            ))}
          </select>
        </div>

        {/* Base salary */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-brand-text mb-1.5">Base Salary (₦)</label>
            <input
              type="number" min="0" step="500"
              value={form.base_salary}
              onChange={(e) => set('base_salary', Number(e.target.value))}
              className="w-full border border-brand-border rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-text mb-1.5">Frequency</label>
            <select
              value={form.payment_frequency}
              onChange={(e) => set('payment_frequency', e.target.value as ConfigFormData['payment_frequency'])}
              className="w-full border border-brand-border rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        </div>

        {/* Commission */}
        <div>
          <label className="block text-sm font-medium text-brand-text mb-2">Commission Rule</label>
          <div className="grid grid-cols-2 gap-2 mb-2">
            {(['fixed', 'percentage'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => set('commission_mode', mode)}
                className={`py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                  form.commission_mode === mode
                    ? 'border-primary bg-primary-pale text-primary'
                    : 'border-brand-border text-brand-muted hover:border-primary/40'
                }`}
              >
                {mode === 'fixed' ? '₦ Fixed per sale' : '% of sale price'}
              </button>
            ))}
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-brand-muted font-medium">
              {form.commission_mode === 'fixed' ? '₦' : '%'}
            </span>
            <input
              type="number" min="0" step={form.commission_mode === 'fixed' ? '100' : '0.5'}
              value={form.commission_mode === 'percentage' ? (form.commission_value * 100).toFixed(1) : form.commission_value}
              onChange={(e) => {
                const v = Number(e.target.value)
                set('commission_value', form.commission_mode === 'percentage' ? v / 100 : v)
              }}
              className="w-full border border-brand-border rounded-xl pl-8 pr-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          {form.commission_mode === 'percentage' && (
            <p className="text-xs text-brand-muted mt-1">
              e.g. 5 = 5% of the agreed sale price per unit
            </p>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-brand-text mb-1.5">
            Notes <span className="text-brand-muted font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={form.notes ?? ''}
            onChange={(e) => set('notes', e.target.value || null)}
            placeholder="e.g. Q2 2025 rate"
            className="w-full border border-brand-border rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" onClick={onClose} fullWidth>Cancel</Button>
          <Button onClick={handleSave} loading={saving} fullWidth>Save Rule</Button>
        </div>
      </div>
    </Modal>
  )
}

export default function PayrollRules({ configs, loading, onUpsert, onDelete }: Props) {
  const { profile } = useAuth()
  const { profiles } = useProfiles()
  const [modal,    setModal]    = useState<ConfigFormData | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const activeProfiles = profiles.filter((p) => p.role !== 'admin' && p.status === 'active')
  const globalConfig   = configs.find((c) => c.employee_id === null)
  const empConfigs     = configs.filter((c) => c.employee_id !== null)

  async function handleDelete(id: string) {
    if (!profile) return
    setDeleting(id)
    await onDelete(id)
    setDeleting(null)
  }

  function commissionLabel(c: PayrollConfig): string {
    if (c.commission_value === 0) return 'No commission'
    return c.commission_mode === 'fixed'
      ? `${formatNaira(c.commission_value)} / sale`
      : `${(c.commission_value * 100).toFixed(1)}% of price`
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-brand-muted">
          Define base salary and commission for each employee. Employees without a specific
          rule inherit the global default.
        </p>
        <Button onClick={() => setModal(DEFAULT_FORM)} size="sm">
          <MdAdd className="w-4 h-4" /> Add Rule
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Spinner size="lg" /></div>
      ) : (
        <div className="space-y-4">

          {/* Global default */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <MdPublic className="w-4 h-4 text-brand-muted" />
              <h3 className="text-xs font-bold text-brand-muted uppercase tracking-widest">Global Default</h3>
            </div>
            {globalConfig ? (
              <div className="bg-white border border-brand-border border-l-4 border-l-primary rounded-xl p-4 flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-brand-text">Everyone (default)</p>
                  <p className="text-xs text-brand-muted mt-0.5">
                    {formatNaira(globalConfig.base_salary)} / {FREQ_LABELS[globalConfig.payment_frequency]}
                    {' · '}
                    {commissionLabel(globalConfig)}
                  </p>
                  {globalConfig.notes && <p className="text-xs text-brand-muted/70 italic mt-0.5">{globalConfig.notes}</p>}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => setModal({
                      employee_id:       globalConfig.employee_id,
                      base_salary:       globalConfig.base_salary,
                      payment_frequency: globalConfig.payment_frequency,
                      commission_mode:   globalConfig.commission_mode,
                      commission_value:  globalConfig.commission_value,
                      notes:             globalConfig.notes,
                    })}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-primary bg-primary-pale hover:bg-primary/15 transition-colors"
                  >
                    <MdEdit className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => handleDelete(globalConfig.id)}
                    disabled={deleting === globalConfig.id}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-danger bg-danger-light hover:bg-red-100 transition-colors disabled:opacity-50"
                  >
                    <MdDelete className="w-3.5 h-3.5" /> {deleting === globalConfig.id ? '…' : 'Delete'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-warning-light border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <MdWarning className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">No global default set</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Employees without a specific rule will receive ₦0. Add a global default to avoid this.
                  </p>
                </div>
                <button
                  onClick={() => setModal(DEFAULT_FORM)}
                  className="flex-shrink-0 text-xs font-semibold text-amber-700 bg-amber-200 hover:bg-amber-300 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Add Default
                </button>
              </div>
            )}
          </div>

          {/* Per-employee */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <MdPerson className="w-4 h-4 text-brand-muted" />
              <h3 className="text-xs font-bold text-brand-muted uppercase tracking-widest">
                Per-Employee Overrides ({empConfigs.length})
              </h3>
            </div>
            {empConfigs.length === 0 ? (
              <div className="bg-white border border-brand-border rounded-xl p-6 text-center text-brand-muted text-sm">
                No per-employee rules yet. The global default applies to everyone.
              </div>
            ) : (
              <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-brand-border">
                    <tr>
                      {['Employee', 'Role', 'Base Salary', 'Commission', 'Notes', ''].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-brand-muted uppercase tracking-wide">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border">
                    {empConfigs.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-brand-text">
                          {c.employee?.full_name ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            c.employee?.role === 'team_lead'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-green-100 text-green-700'
                          }`}>
                            {c.employee?.role === 'team_lead' ? 'Team Lead' : 'Agent'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-brand-text">
                          {formatNaira(c.base_salary)}
                          <span className="text-brand-muted text-xs ml-1">/{FREQ_LABELS[c.payment_frequency].toLowerCase()}</span>
                        </td>
                        <td className="px-4 py-3 text-brand-text">{commissionLabel(c)}</td>
                        <td className="px-4 py-3 text-brand-muted text-xs italic">{c.notes ?? '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => setModal({
                                employee_id:       c.employee_id,
                                base_salary:       c.base_salary,
                                payment_frequency: c.payment_frequency,
                                commission_mode:   c.commission_mode,
                                commission_value:  c.commission_value,
                                notes:             c.notes,
                              })}
                              className="p-1.5 rounded-lg text-primary hover:bg-primary-pale transition-colors"
                            >
                              <MdEdit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(c.id)}
                              disabled={deleting === c.id}
                              className="p-1.5 rounded-lg text-danger hover:bg-danger-light transition-colors disabled:opacity-50"
                            >
                              <MdDelete className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {modal !== null && profile && (
        <ConfigModal
          initial={modal}
          profiles={activeProfiles}
          onSave={(data) => onUpsert(data)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
