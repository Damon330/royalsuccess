import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { usePhones } from '../../hooks/usePhones'
import { useReturns } from '../../hooks/useReturns'
import { useSaleReceipt } from '../../hooks/useSaleReceipt'
import SaleConfirmationModal from '../shared/SaleConfirmationModal'
import ReceiptSuccessScreen from '../shared/ReceiptSuccessScreen'
import type { Phone, Receipt, SaleFormData } from '../../types'
import Modal from '../shared/Modal'
import Button from '../shared/Button'
import Badge from '../shared/Badge'
import Spinner from '../shared/Spinner'
import toast from 'react-hot-toast'
import { MdPhoneAndroid, MdLogout, MdCheckCircle, MdUndo, MdHistory } from 'react-icons/md'

// Stock return reasons — agent returning an assigned phone back to the warehouse
const STOCK_RETURN_REASONS = [
  'Wrong model received',
  'Phone damaged / defective',
  'Excess stock',
  'End of assignment period',
  'Other',
] as const

// ── Return request modal ───────────────────────────────────────
function ReturnModal({ phone, onSubmit, onClose }: {
  phone: Phone
  onSubmit: (reason: string, notes: string) => Promise<void>
  onClose: () => void
}) {
  const [reason,  setReason]  = useState<string>(STOCK_RETURN_REASONS[0])
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
          <label className="block text-sm font-medium text-brand-text mb-1">Reason for Return</label>
          <select value={reason} onChange={(e) => setReason(e.target.value)}
            className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
            {STOCK_RETURN_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-brand-text mb-1">
            Notes <span className="text-brand-muted font-normal">(optional)</span>
          </label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional details…" rows={3}
            className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} fullWidth>Cancel</Button>
          <Button onClick={handle} loading={loading} fullWidth>Submit Return Request</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Phone card ────────────────────────────────────────────────
function PhoneCard({ phone, onSell, onReturn }: {
  phone: Phone
  onSell:   (p: Phone) => void
  onReturn: (p: Phone) => void
}) {
  const isSold     = phone.status === 'sold'
  const isAssigned = phone.status === 'assigned'

  return (
    <div className={`bg-white rounded-2xl border border-brand-border p-5 transition-opacity ${isSold ? 'opacity-70' : ''}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`rounded-xl p-3 ${isSold ? 'bg-gray-100' : 'bg-primary-pale'}`}>
            <MdPhoneAndroid className={`w-6 h-6 ${isSold ? 'text-gray-400' : 'text-primary'}`} />
          </div>
          <div>
            <p className="font-bold text-brand-text">{phone.model}</p>
            {phone.imei    && <p className="text-xs font-mono text-brand-muted">IMEI: {phone.imei}</p>}
            {phone.barcode && phone.barcode !== phone.imei &&
              <p className="text-xs font-mono text-brand-muted">Barcode: {phone.barcode}</p>}
            <p className="text-xs font-mono text-brand-muted">SN: {phone.serial_number}</p>
          </div>
        </div>
        {isSold && <Badge variant="green"><MdCheckCircle className="w-3 h-3 mr-1" />Sold</Badge>}
      </div>

      {isAssigned && (
        <div className="flex gap-2">
          <button onClick={() => onSell(phone)}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl py-3.5 text-sm transition-colors min-h-touch">
            Mark as Sold
          </button>
          <button onClick={() => onReturn(phone)}
            title="Return phone to store"
            className="flex items-center justify-center gap-1 bg-gray-100 hover:bg-amber-50 hover:text-amber-700 text-brand-muted border border-brand-border hover:border-amber-300 rounded-xl px-4 py-3.5 text-sm font-medium transition-colors min-h-touch">
            <MdUndo className="w-4 h-4" />
            <span className="hidden sm:inline">Return</span>
          </button>
        </div>
      )}

      {isSold && phone.sold_at && (
        <p className="text-xs text-brand-muted text-center mt-2">
          Sold {new Date(phone.sold_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      )}
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────
export default function AgentDashboard() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const { phones, loading, markAsSold } = usePhones(profile?.id)
  const { submitReturn, returns } = useReturns()

  const { completeSale, loading: saleLoading } = useSaleReceipt()

  const [sellingPhone,    setSellingPhone]    = useState<Phone | null>(null)
  const [returningPhone,  setReturningPhone]  = useState<Phone | null>(null)
  const [saleResult,      setSaleResult]      = useState<{ receipt: Receipt; pdfBlob: Blob } | null>(null)

  const pendingReturnIds = new Set(
    returns.filter((r) => r.return_status === 'PENDING').map((r) => r.phone_id),
  )

  const sold      = phones.filter((p) => p.status === 'sold').length
  const remaining = phones.filter((p) => p.status === 'assigned').length

  async function handleSaleConfirmed(form: SaleFormData) {
    if (!profile || !sellingPhone) return
    const result = await completeSale(sellingPhone, profile, form)
    if (result) {
      setSaleResult({ receipt: result.receipt, pdfBlob: result.pdfBlob })
      setSellingPhone(null)
    }
  }

  // markAsSold kept for legacy — not used with new modal
  void markAsSold

  async function handleReturn(reason: string, notes: string) {
    if (!profile || !returningPhone) return
    await submitReturn(profile, returningPhone.id, reason, notes)
  }

  return (
    <div className="min-h-screen bg-brand-bg safe-top">
      <header className="bg-primary text-white px-5 pt-safe-top pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-lg">{profile?.full_name}</p>
            <p className="text-white/70 text-xs">Agent Dashboard</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/agent/activity')}
              className="bg-white/10 hover:bg-white/20 rounded-xl p-3 transition-colors min-h-touch flex items-center justify-center">
              <MdHistory className="w-5 h-5" />
            </button>
            <button onClick={() => { signOut(); toast('Signed out.') }}
              className="bg-white/10 hover:bg-white/20 rounded-xl p-3 transition-colors min-h-touch flex items-center justify-center">
              <MdLogout className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="px-4 py-5 max-w-lg mx-auto space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-brand-border p-4 text-center">
            <p className="text-3xl font-extrabold text-primary">{phones.length}</p>
            <p className="text-xs text-brand-muted mt-1 font-medium">Assigned</p>
          </div>
          <div className="bg-white rounded-2xl border border-brand-border p-4 text-center">
            <p className="text-3xl font-extrabold text-green-600">{sold}</p>
            <p className="text-xs text-brand-muted mt-1 font-medium">Sold</p>
          </div>
          <div className="bg-white rounded-2xl border border-brand-border p-4 text-center">
            <p className="text-3xl font-extrabold text-orange-500">{remaining}</p>
            <p className="text-xs text-brand-muted mt-1 font-medium">Remaining</p>
          </div>
        </div>

        <div>
          <h2 className="text-base font-bold text-brand-text mb-3">Your Phones</h2>
          {loading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : phones.length === 0 ? (
            <div className="bg-white rounded-2xl border border-brand-border p-10 text-center">
              <MdPhoneAndroid className="w-14 h-14 text-gray-300 mx-auto mb-3" />
              <p className="font-semibold text-brand-text">No phones assigned</p>
              <p className="text-sm text-brand-muted mt-1">Your admin will assign phones to you.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {phones.filter((p) => p.status === 'assigned').map((phone) => (
                <PhoneCard key={phone.id} phone={phone} onSell={setSellingPhone} onReturn={setReturningPhone} />
              ))}
              {phones.filter((p) => p.status === 'sold').map((phone) => (
                <div key={phone.id} className="relative">
                  <PhoneCard phone={phone} onSell={setSellingPhone} onReturn={setReturningPhone} />
                  {pendingReturnIds.has(phone.id) && (
                    <span className="absolute top-3 right-3 text-xs bg-yellow-100 text-yellow-800 font-medium px-2 py-0.5 rounded-full">
                      Return Pending
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="h-6 safe-bottom" />
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
      {returningPhone && (
        <ReturnModal
          phone={returningPhone}
          onSubmit={handleReturn}
          onClose={() => setReturningPhone(null)}
        />
      )}
    </div>
  )
}
