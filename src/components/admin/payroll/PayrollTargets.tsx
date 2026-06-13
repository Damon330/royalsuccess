import { useState } from 'react'
import Button from '../../shared/Button'
import Modal from '../../shared/Modal'
import Spinner from '../../shared/Spinner'
import { useProfiles } from '../../../hooks/useProfiles'
import type { PayrollTarget, TargetFormData } from '../../../hooks/usePayroll'
import { formatNaira } from '../../../lib/payrollEngine'
import {
  MdAdd, MdDelete, MdCheckCircle, MdCancel,
} from 'react-icons/md'

interface Props {
  targets:      PayrollTarget[]
  loading:      boolean
  onUpsert:     (data: TargetFormData) => Promise<boolean>
  onDelete:     (id: string) => Promise<boolean>
  onToggle:     (id: string, active: boolean) => Promise<boolean>
}

const REWARD_MODE_LABELS: Record<string, string> = {
  FIXED_REWARD:      'Flat bonus',
  ALL_SALES:         'Bonus on all',
  ABOVE_TARGET_ONLY: 'Bonus above target',
}

const REWARD_MODE_DESCRIPTIONS: Record<string, string> = {
  FIXED_REWARD:      'Pay a flat reward when the target is met (e.g. ₦10,000)',
  ALL_SALES:         'Bonus applied to every unit/₦ sold once target is met',
  ABOVE_TARGET_ONLY: 'Bonus only on units/₦ above the target threshold',
}

const DEFAULT_FORM: TargetFormData = {
  employee_id:  '',
  metric:       'units',
  period:       'monthly',
  target_value: 50,
  reward_mode:  'FIXED_REWARD',
  reward_value: 10000,
  active:       true,
  notes:        null,
}

function TargetModal({ initial, onSave, onClose, profiles }: {
  initial:  TargetFormData
  onSave:   (data: TargetFormData) => Promise<boolean>
  onClose:  () => void
  profiles: { id: string; full_name: string; role: string }[]
}) {
  const [form,   setForm]   = useState<TargetFormData>(initial)
  const [saving, setSaving] = useState(false)

  function set<K extends keyof TargetFormData>(k: K, v: TargetFormData[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function handleSave() {
    if (!form.employee_id) { return }
    setSaving(true)
    const data: TargetFormData = {
      ...form,
      target_value: Number(form.target_value) || 0,
      reward_value: Number(form.reward_value)  || 0,
    }
    const ok = await onSave(data)
    setSaving(false)
    if (ok) onClose()
  }

  const rewardLabel = form.reward_mode === 'ALL_SALES' && form.metric === 'revenue'
    ? '% of total revenue (enter as whole number, e.g. 5 = 5%)'
    : '₦ amount'

  return (
    <Modal isOpen onClose={onClose} title="Performance Target">
      <div className="space-y-4">

        {/* Employee */}
        <div>
          <label className="block text-sm font-medium text-brand-text mb-1.5">Employee</label>
          <select
            value={form.employee_id}
            onChange={(e) => set('employee_id', e.target.value)}
            className="w-full border border-brand-border rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
          >
            <option value="">— Select employee —</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name} ({p.role === 'team_lead' ? 'Team Lead' : 'Agent'})
              </option>
            ))}
          </select>
        </div>

        {/* Metric + Period */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-brand-text mb-1.5">Measure by</label>
            <div className="grid grid-cols-2 gap-2">
              {(['units', 'revenue'] as const).map((m) => (
                <button key={m} onClick={() => set('metric', m)}
                  className={`py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                    form.metric === m
                      ? 'border-primary bg-primary-pale text-primary'
                      : 'border-brand-border text-brand-muted hover:border-primary/40'
                  }`}
                >
                  {m === 'units' ? '# Units' : '₦ Revenue'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-text mb-1.5">Period</label>
            <div className="grid grid-cols-2 gap-2">
              {(['weekly', 'monthly'] as const).map((p) => (
                <button key={p} onClick={() => set('period', p)}
                  className={`py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                    form.period === p
                      ? 'border-primary bg-primary-pale text-primary'
                      : 'border-brand-border text-brand-muted hover:border-primary/40'
                  }`}
                >
                  {p === 'weekly' ? 'Weekly' : 'Monthly'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Target value */}
        <div>
          <label className="block text-sm font-medium text-brand-text mb-1.5">
            Target — {form.metric === 'units' ? 'units to sell' : '₦ revenue to generate'}
          </label>
          <div className="relative">
            {form.metric === 'revenue' && (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-brand-muted">₦</span>
            )}
            <input
              type="number" min="1" step={form.metric === 'units' ? '1' : '10000'}
              value={form.target_value}
              onChange={(e) => set('target_value', Number(e.target.value))}
              className={`w-full border border-brand-border rounded-xl pr-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${form.metric === 'revenue' ? 'pl-8' : 'pl-3'}`}
            />
          </div>
        </div>

        {/* Reward mode */}
        <div>
          <label className="block text-sm font-medium text-brand-text mb-2">If Target is Met</label>
          <div className="space-y-2">
            {(['FIXED_REWARD', 'ALL_SALES', 'ABOVE_TARGET_ONLY'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => set('reward_mode', mode)}
                className={`w-full text-left flex items-start gap-3 p-3 rounded-xl border-2 transition-all ${
                  form.reward_mode === mode
                    ? 'border-primary bg-primary-pale'
                    : 'border-brand-border hover:border-primary/40'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 transition-colors ${
                  form.reward_mode === mode ? 'border-primary bg-primary' : 'border-brand-muted'
                }`} />
                <div>
                  <p className={`text-sm font-semibold ${form.reward_mode === mode ? 'text-primary' : 'text-brand-text'}`}>
                    {REWARD_MODE_LABELS[mode]}
                  </p>
                  <p className="text-xs text-brand-muted mt-0.5">{REWARD_MODE_DESCRIPTIONS[mode]}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Reward value */}
        <div>
          <label className="block text-sm font-medium text-brand-text mb-1.5">
            Reward Value ({rewardLabel})
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-brand-muted">₦</span>
            <input
              type="number" min="0" step="500"
              value={form.reward_mode === 'ALL_SALES' && form.metric === 'revenue'
                ? (form.reward_value * 100).toFixed(1)
                : form.reward_value
              }
              onChange={(e) => {
                const v = Number(e.target.value)
                set('reward_value', form.reward_mode === 'ALL_SALES' && form.metric === 'revenue' ? v / 100 : v)
              }}
              className="w-full border border-brand-border rounded-xl pl-8 pr-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
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
            placeholder="e.g. Q2 2025 incentive"
            className="w-full border border-brand-border rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" onClick={onClose} fullWidth>Cancel</Button>
          <Button onClick={handleSave} loading={saving} disabled={!form.employee_id} fullWidth>
            Save Target
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default function PayrollTargets({ targets, loading, onUpsert, onDelete, onToggle }: Props) {
  const { profiles } = useProfiles()
  const [modal,    setModal]    = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  const activeProfiles = profiles.filter((p) => p.role !== 'admin' && p.status === 'active')

  async function handleDelete(id: string) {
    setDeleting(id)
    await onDelete(id)
    setDeleting(null)
  }

  async function handleToggle(id: string, currentActive: boolean) {
    setToggling(id)
    await onToggle(id, !currentActive)
    setToggling(null)
  }

  function rewardSummary(t: PayrollTarget): string {
    if (t.reward_mode === 'FIXED_REWARD') return `${formatNaira(t.reward_value)} flat`
    if (t.reward_mode === 'ALL_SALES') {
      return t.metric === 'units'
        ? `${formatNaira(t.reward_value)}/unit (all)`
        : `${(t.reward_value * 100).toFixed(1)}% revenue`
    }
    return t.metric === 'units'
      ? `${formatNaira(t.reward_value)}/unit above target`
      : `${(t.reward_value * 100).toFixed(1)}% above target`
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-brand-muted">
          Set performance targets per employee. Only one active target per employee is allowed.
          Targets that are not met yield no bonus.
        </p>
        <Button onClick={() => setModal(true)} size="sm">
          <MdAdd className="w-4 h-4" /> Add Target
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Spinner size="lg" /></div>
      ) : targets.length === 0 ? (
        <div className="bg-white border border-brand-border rounded-xl p-12 text-center">
          <div className="w-14 h-14 bg-primary-pale rounded-2xl flex items-center justify-center mx-auto mb-3">
            <MdCheckCircle className="w-7 h-7 text-primary/40" />
          </div>
          <p className="font-semibold text-brand-text">No targets set</p>
          <p className="text-sm text-brand-muted mt-1">Add targets to enable performance bonuses.</p>
        </div>
      ) : (
        <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-brand-border">
              <tr>
                {['Employee', 'Metric', 'Period', 'Target', 'Reward Mode', 'Reward', 'Status', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-brand-muted uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {targets.map((t) => (
                <tr key={t.id} className={`hover:bg-gray-50 transition-colors ${!t.active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-brand-text whitespace-nowrap">
                    {t.employee?.full_name ?? '—'}
                  </td>
                  <td className="px-4 py-3 capitalize text-brand-text">{t.metric}</td>
                  <td className="px-4 py-3 capitalize text-brand-text">{t.period}</td>
                  <td className="px-4 py-3 font-medium text-brand-text whitespace-nowrap">
                    {t.metric === 'units'
                      ? `${t.target_value} units`
                      : formatNaira(t.target_value)
                    }
                  </td>
                  <td className="px-4 py-3 text-brand-muted text-xs">{REWARD_MODE_LABELS[t.reward_mode]}</td>
                  <td className="px-4 py-3 text-brand-text whitespace-nowrap">{rewardSummary(t)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(t.id, t.active)}
                      disabled={toggling === t.id}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold transition-colors disabled:opacity-50 ${
                        t.active
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {t.active
                        ? <><MdCheckCircle className="w-3 h-3" /> Active</>
                        : <><MdCancel className="w-3 h-3" /> Off</>
                      }
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(t.id)}
                      disabled={deleting === t.id}
                      className="p-1.5 rounded-lg text-danger hover:bg-danger-light transition-colors disabled:opacity-50"
                    >
                      <MdDelete className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <TargetModal
          initial={DEFAULT_FORM}
          profiles={activeProfiles}
          onSave={(data) => onUpsert(data)}
          onClose={() => setModal(false)}
        />
      )}
    </div>
  )
}
