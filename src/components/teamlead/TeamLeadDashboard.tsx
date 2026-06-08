import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { usePhones } from '../../hooks/usePhones'
import { useReturns } from '../../hooks/useReturns'
import { useSaleReceipt } from '../../hooks/useSaleReceipt'
import SaleConfirmationModal from '../shared/SaleConfirmationModal'
import ReceiptSuccessScreen from '../shared/ReceiptSuccessScreen'
import { supabase } from '../../lib/supabase'
import { withTimeout } from '../../lib/withTimeout'
import type { Profile, Phone, PhoneReturn, Receipt, SaleFormData } from '../../types'
import Badge from '../shared/Badge'
import Button from '../shared/Button'
import Modal from '../shared/Modal'
import Spinner from '../shared/Spinner'
import toast from 'react-hot-toast'
import {
  MdPhoneAndroid, MdLogout, MdExpandMore, MdExpandLess,
  MdWarning, MdHistory, MdUndo, MdCheckCircle, MdCancel,
} from 'react-icons/md'


function RejectModal({ onConfirm, onClose }: {
  onConfirm: (note: string) => Promise<void>; onClose: () => void
}) {
  const [note, setNote]     = useState('')
  const [loading, setLoading] = useState(false)
  async function handle() {
    if (!note.trim()) { toast.error('Rejection note is required.'); return }
    setLoading(true); await onConfirm(note); setLoading(false); onClose()
  }
  return (
    <Modal isOpen onClose={onClose} title="Reject Return">
      <div className="space-y-4">
        <p className="text-sm text-brand-muted">Provide a reason for rejecting this return request.</p>
        <textarea value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Phone is in good working condition — return denied." rows={3}
          className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} fullWidth>Cancel</Button>
          <Button variant="danger" onClick={handle} loading={loading} fullWidth>Reject Return</Button>
        </div>
      </div>
    </Modal>
  )
}

interface AgentWithPhones { profile: Profile; phones: Phone[] }

export default function TeamLeadDashboard() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const { phones: myPhones, loading: phonesLoading, dbError, markAsSold } = usePhones(profile?.id)
  const { returns, approveReturn, rejectReturn, submitReturn } = useReturns()
  const { completeSale, loading: saleLoading } = useSaleReceipt()

  const [agents,        setAgents]        = useState<AgentWithPhones[]>([])
  const [agentsLoading, setAgentsLoading] = useState(true)
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)
  const [sellingPhone,   setSellingPhone]   = useState<Phone | null>(null)
  const [returningPhone, setReturningPhone] = useState<Phone | null>(null)
  const [saleResult,     setSaleResult]     = useState<{ receipt: Receipt; pdfBlob: Blob } | null>(null)
  const [rejectingRet,   setRejectingRet]   = useState<PhoneReturn | null>(null)
  const [approving,      setApproving]      = useState<string | null>(null)

  const pendingReturns = returns.filter((r) => r.return_status === 'PENDING')

  useEffect(() => {
    if (!profile) return
    async function loadAgents() {
      setAgentsLoading(true)
      try {
        const { data: agentProfiles } = await withTimeout(
          supabase.from('profiles').select('*').eq('team_lead_id', profile!.id).eq('status', 'active'),
          8000,
        )
        if (!agentProfiles) return
        const ids = agentProfiles.map((a: Profile) => a.id)
        const { data: agentPhones } = ids.length > 0
          ? await withTimeout(supabase.from('phones').select('*').in('assigned_to', ids), 8000)
          : { data: [] }
        setAgents(agentProfiles.map((a: Profile) => ({
          profile: a,
          phones:  (agentPhones ?? []).filter((ph: Phone) => ph.assigned_to === a.id),
        })))
      } catch { /* empty state */ } finally { setAgentsLoading(false) }
    }
    loadAgents()
  }, [profile])

  async function handleSaleConfirmed(form: SaleFormData) {
    if (!profile || !sellingPhone) return
    const result = await completeSale(sellingPhone, profile, form)
    if (result) {
      setSaleResult({ receipt: result.receipt, pdfBlob: result.pdfBlob })
      setSellingPhone(null)
    }
  }

  void markAsSold // kept to avoid unused-import lint; replaced by completeSale

  async function handleApprove(ret: PhoneReturn) {
    if (!profile) return
    setApproving(ret.id)
    await approveReturn(ret.id, profile)
    setApproving(null)
  }

  const mySold      = myPhones.filter((p) => p.status === 'sold').length
  const myRemaining = myPhones.filter((p) => p.status === 'assigned').length

  return (
    <div className="min-h-screen bg-brand-bg">
      <header className="bg-primary text-white px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 rounded-xl p-2"><MdPhoneAndroid className="w-5 h-5" /></div>
          <div>
            <p className="font-bold text-sm">Royal Success</p>
            <p className="text-white/70 text-xs">Team Lead — {profile?.full_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/teamlead/activity')}
            className="relative bg-white/10 hover:bg-white/20 rounded-lg p-2 transition-colors">
            <MdHistory className="w-5 h-5" />
          </button>
          <button onClick={() => { signOut(); toast('Signed out.') }}
            className="bg-white/10 hover:bg-white/20 rounded-lg p-2 transition-colors">
            <MdLogout className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-5 space-y-6">

        {dbError && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <MdWarning className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700">
              <strong>Database connection failed.</strong> Ask admin to resume Supabase project, then refresh.
            </p>
          </div>
        )}

        {/* ── Pending Returns ── */}
        {pendingReturns.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <MdUndo className="w-5 h-5 text-amber-500" />
              <h2 className="text-base font-bold text-brand-text">Pending Returns</h2>
              <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-0.5 rounded-full">
                {pendingReturns.length}
              </span>
            </div>
            <div className="space-y-2">
              {pendingReturns.map((ret) => {
                const p = ret.phone as { model?: string; imei?: string; serial_number?: string } | undefined
                const r = ret.requester as { full_name?: string } | undefined
                return (
                  <div key={ret.id} className="bg-white rounded-xl border border-amber-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-brand-text">{p?.model ?? '—'}</p>
                        <p className="text-xs font-mono text-brand-muted">
                          {p?.imei ? `IMEI: ${p.imei}` : `SN: ${p?.serial_number ?? '—'}`}
                        </p>
                        <p className="text-xs text-brand-muted mt-1">
                          <strong>Agent:</strong> {r?.full_name ?? '—'} ·{' '}
                          <strong>Reason:</strong> {ret.return_reason}
                        </p>
                        {ret.notes && <p className="text-xs text-brand-muted italic">"{ret.notes}"</p>}
                        <p className="text-xs text-brand-muted mt-1">
                          {new Date(ret.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleApprove(ret)}
                          disabled={approving === ret.id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          <MdCheckCircle className="w-3.5 h-3.5" />
                          {approving === ret.id ? 'Approving…' : 'Approve'}
                        </button>
                        <button
                          onClick={() => setRejectingRet(ret)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-medium transition-colors"
                        >
                          <MdCancel className="w-3.5 h-3.5" /> Reject
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── My Phones ── */}
        <section>
          <h2 className="text-base font-bold text-brand-text mb-3">My Phones</h2>
          {phonesLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : myPhones.length === 0 ? (
            <div className="bg-white rounded-xl border border-brand-border p-6 text-center text-brand-muted text-sm">
              No phones assigned to you yet.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-3 mb-3">
                {[
                  { label: 'Assigned', value: myPhones.length, color: 'text-primary' },
                  { label: 'Sold',     value: mySold,          color: 'text-green-600' },
                  { label: 'Remaining',value: myRemaining,     color: 'text-orange-500' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex-1 bg-white rounded-xl border border-brand-border p-3 text-center">
                    <p className={`text-2xl font-bold ${color}`}>{value}</p>
                    <p className="text-xs text-brand-muted">{label}</p>
                  </div>
                ))}
              </div>
              {myPhones.map((phone) => (
                <div key={phone.id} className={`bg-white rounded-xl border border-brand-border p-4 flex items-center justify-between ${phone.status !== 'assigned' ? 'opacity-60' : ''}`}>
                  <div>
                    <p className="text-sm font-semibold text-brand-text">{phone.model}</p>
                    {phone.imei && <p className="text-xs font-mono text-brand-muted">IMEI: {phone.imei}</p>}
                    <p className="text-xs font-mono text-brand-muted">SN: {phone.serial_number}</p>
                  </div>
                  {phone.status === 'assigned'
                    ? (
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="success" onClick={() => setSellingPhone(phone)}>Mark as Sold</Button>
                        <button
                          onClick={() => setReturningPhone(phone)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-amber-50 hover:text-amber-700 text-brand-muted border border-brand-border hover:border-amber-300 rounded-lg text-xs font-medium transition-colors"
                        >
                          <MdUndo className="w-3.5 h-3.5" /> Return
                        </button>
                      </div>
                    )
                    : <Badge variant={phone.status === 'sold' ? 'green' : 'gray'}>{phone.status === 'sold' ? 'Sold' : phone.status}</Badge>
                  }
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── My Agents ── */}
        <section>
          <h2 className="text-base font-bold text-brand-text mb-3">My Agents</h2>
          {agentsLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : agents.length === 0 ? (
            <div className="bg-white rounded-xl border border-brand-border p-6 text-center text-brand-muted text-sm">No agents yet.</div>
          ) : (
            <div className="space-y-2">
              {agents.map(({ profile: agent, phones: aPhones }) => {
                const sold = aPhones.filter((p) => p.status === 'sold').length
                const isExpanded = expandedAgent === agent.id
                return (
                  <div key={agent.id} className="bg-white rounded-xl border border-brand-border overflow-hidden">
                    <button
                      onClick={() => setExpandedAgent(isExpanded ? null : agent.id)}
                      className="w-full flex items-center justify-between px-4 py-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-primary rounded-full h-8 w-8 flex items-center justify-center text-white text-sm font-bold">
                          {agent.full_name.charAt(0)}
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-semibold text-brand-text">{agent.full_name}</p>
                          <p className="text-xs text-brand-muted">{sold} / {aPhones.length} sold</p>
                        </div>
                      </div>
                      {isExpanded ? <MdExpandLess className="w-5 h-5 text-brand-muted" /> : <MdExpandMore className="w-5 h-5 text-brand-muted" />}
                    </button>
                    {isExpanded && (
                      <div className="border-t border-brand-border divide-y divide-brand-border">
                        {aPhones.length === 0
                          ? <p className="px-4 py-3 text-sm text-brand-muted">No phones.</p>
                          : aPhones.map((ph) => (
                            <div key={ph.id} className={`px-4 py-3 flex items-center justify-between ${ph.status !== 'assigned' ? 'opacity-60' : ''}`}>
                              <div>
                                <p className="text-sm text-brand-text">{ph.model}</p>
                                {ph.imei && <p className="text-xs font-mono text-brand-muted">IMEI: {ph.imei}</p>}
                                <p className="text-xs font-mono text-brand-muted">SN: {ph.serial_number}</p>
                              </div>
                              <Badge variant={ph.status === 'sold' ? 'green' : 'blue'}>
                                {ph.status === 'sold' ? 'Sold' : 'Assigned'}
                              </Badge>
                            </div>
                          ))
                        }
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {sellingPhone && profile && (
        <SaleConfirmationModal
          phone={sellingPhone}
          actor={profile}
          onConfirm={handleSaleConfirmed}
          onClose={() => setSellingPhone(null)}
        />
      )}
      {saleLoading && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded-xl p-6 text-center space-y-3">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm font-medium text-brand-text">Generating receipt…</p>
          </div>
        </div>
      )}
      {saleResult && (
        <ReceiptSuccessScreen
          receipt={saleResult.receipt}
          pdfBlob={saleResult.pdfBlob}
          onClose={() => setSaleResult(null)}
        />
      )}
      {rejectingRet && profile && (
        <RejectModal
          onConfirm={async (note) => { await rejectReturn(rejectingRet.id, profile, note) }}
          onClose={() => setRejectingRet(null)}
        />
      )}
      {returningPhone && profile && (
        <TLReturnModal
          phone={returningPhone}
          onSubmit={async (reason, notes) => { await submitReturn(profile, returningPhone.id, reason, notes) }}
          onClose={() => setReturningPhone(null)}
        />
      )}
    </div>
  )
}

function TLReturnModal({ phone, onSubmit, onClose }: {
  phone: Phone; onSubmit: (reason: string, notes: string) => Promise<void>; onClose: () => void
}) {
  const REASONS = ['Wrong model received','Phone damaged / defective','Excess stock','End of assignment period','Other'] as const
  const [reason,  setReason]  = useState(REASONS[0] as string)
  const [notes,   setNotes]   = useState('')
  const [loading, setLoading] = useState(false)
  async function handle() { setLoading(true); await onSubmit(reason, notes); setLoading(false); onClose() }
  return (
    <Modal isOpen onClose={onClose} title="Return Phone to Store">
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-xs text-amber-700 font-semibold mb-1">Returning assigned phone to warehouse</p>
          <p className="font-semibold text-brand-text">{phone.model}</p>
          {phone.imei && <p className="text-xs font-mono text-brand-muted">IMEI: {phone.imei}</p>}
          <p className="text-xs font-mono text-brand-muted">SN: {phone.serial_number}</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-brand-text mb-1">Reason</label>
          <select value={reason} onChange={(e) => setReason(e.target.value)}
            className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
            {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-brand-text mb-1">Notes <span className="text-brand-muted font-normal">(optional)</span></label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Details…" rows={3}
            className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} fullWidth>Cancel</Button>
          <Button onClick={handle} loading={loading} fullWidth>Submit Return</Button>
        </div>
      </div>
    </Modal>
  )
}
