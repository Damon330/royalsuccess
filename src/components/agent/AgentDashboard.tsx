import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { usePhones } from '../../hooks/usePhones'
import { useReturns } from '../../hooks/useReturns'
import { useSaleReceipt } from '../../hooks/useSaleReceipt'
import SaleConfirmationModal from '../shared/SaleConfirmationModal'
import ReceiptSuccessScreen from '../shared/ReceiptSuccessScreen'
import NotificationBell from '../shared/NotificationBell'
import type { Phone, Receipt, SaleFormData } from '../../types'
import Modal from '../shared/Modal'
import Button from '../shared/Button'
import Spinner from '../shared/Spinner'
import toast from 'react-hot-toast'
import {
  MdPhoneAndroid, MdLogout, MdCheckCircle, MdUndo,
  MdSell, MdWarning,
} from 'react-icons/md'

const STOCK_RETURN_REASONS = [
  'Wrong model received',
  'Phone damaged / defective',
  'Excess stock',
  'End of assignment period',
  'Other',
] as const

function ReturnModal({ phone, onSubmit, onClose }: {
  phone:    Phone
  onSubmit: (reason: string, notes: string) => Promise<void>
  onClose:  () => void
}) {
  const [reason,  setReason]  = useState<string>(STOCK_RETURN_REASONS[0])
  const [notes,   setNotes]   = useState('')
  const [loading, setLoading] = useState(false)
  const isDamaged = reason.toLowerCase().includes('damaged') || reason.toLowerCase().includes('defective')

  async function handle() {
    setLoading(true)
    await onSubmit(reason, notes)
    setLoading(false)
    onClose()
  }

  return (
    <Modal isOpen onClose={onClose} title="Return Phone">
      <div className="space-y-4">
        <div className="bg-gray-50 border border-brand-border rounded-xl p-4 flex items-center gap-3">
          <div className="bg-primary-pale rounded-xl p-2.5">
            <MdPhoneAndroid className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-brand-text text-sm">{phone.model}</p>
            {phone.imei && <p className="text-xs font-mono text-brand-muted">IMEI: {phone.imei}</p>}
            <p className="text-xs font-mono text-brand-muted">SN: {phone.serial_number}</p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-brand-text mb-1.5">Reason for Return</label>
          <select value={reason} onChange={(e) => setReason(e.target.value)}
            className="w-full border border-brand-border rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white">
            {STOCK_RETURN_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {isDamaged && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
            <MdWarning className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 font-medium">
              This phone will be marked as <strong>Damaged</strong> once approved — it won't return to stock.
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-brand-text mb-1.5">
            Notes <span className="text-brand-muted font-normal">(optional)</span>
          </label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional details…" rows={3}
            className="w-full border border-brand-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
        </div>

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" onClick={onClose} fullWidth>Cancel</Button>
          <Button onClick={handle} loading={loading} fullWidth>Submit Request</Button>
        </div>
      </div>
    </Modal>
  )
}

function PhoneCard({ phone, onSell, onReturn }: {
  phone:    Phone
  onSell:   (p: Phone) => void
  onReturn: (p: Phone) => void
}) {
  const isAssigned = phone.status === 'assigned'
  const isSold     = phone.status === 'sold'
  const isReturned = phone.status === 'returned'

  return (
    <div className={`bg-white rounded-2xl border p-4 transition-all ${
      isReturned ? 'border-amber-200' : 'border-brand-border'
    } ${isSold ? 'opacity-60' : ''}`}>

      {/* Phone info row */}
      <div className="flex items-start gap-3">
        <div className={`rounded-xl p-3 flex-shrink-0 ${
          isSold     ? 'bg-gray-100' :
          isReturned ? 'bg-amber-50' :
                       'bg-primary-pale'
        }`}>
          <MdPhoneAndroid className={`w-5 h-5 ${
            isSold     ? 'text-gray-400' :
            isReturned ? 'text-amber-500' :
                         'text-primary'
          }`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-brand-text text-[15px] leading-snug">{phone.model}</p>
          {phone.imei && (
            <p className="text-xs font-mono text-brand-muted mt-0.5 truncate">IMEI: {phone.imei}</p>
          )}
          {phone.barcode && phone.barcode !== phone.imei && (
            <p className="text-xs font-mono text-brand-muted truncate">Barcode: {phone.barcode}</p>
          )}
          <p className="text-xs font-mono text-brand-muted truncate">SN: {phone.serial_number}</p>
        </div>
        {isSold && (
          <span className="flex items-center gap-1 bg-green-100 text-green-700 text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0">
            <MdCheckCircle className="w-3.5 h-3.5" /> Sold
          </span>
        )}
        {isReturned && (
          <span className="flex items-center gap-1 bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0">
            <MdUndo className="w-3.5 h-3.5" /> Pending
          </span>
        )}
      </div>

      {/* Action buttons — assigned only */}
      {isAssigned && (
        <div className="grid grid-cols-2 gap-2.5 mt-4">
          <button
            onClick={() => onSell(phone)}
            className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 active:scale-95 text-white font-bold rounded-xl py-3.5 text-sm transition-all"
          >
            <MdSell className="w-4 h-4" />
            Mark as Sold
          </button>
          <button
            onClick={() => onReturn(phone)}
            className="flex items-center justify-center gap-2 bg-white border border-brand-border hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 text-brand-muted rounded-xl py-3.5 text-sm font-semibold transition-all active:scale-95"
          >
            <MdUndo className="w-4 h-4" />
            Return
          </button>
        </div>
      )}

      {/* Return pending notice */}
      {isReturned && (
        <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-center gap-2">
          <MdUndo className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <p className="text-xs font-medium text-amber-700">Return submitted — awaiting approval</p>
        </div>
      )}

      {/* Sold date */}
      {isSold && phone.sold_at && (
        <p className="text-xs text-brand-muted text-center mt-3">
          Sold {new Date(phone.sold_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      )}
    </div>
  )
}

export default function AgentDashboard() {
  const { profile, signOut } = useAuth()
  const { phones, loading, markAsSold } = usePhones(profile?.id)
  const { submitReturn } = useReturns()
  const { completeSale, loading: saleLoading } = useSaleReceipt()

  const [sellingPhone,   setSellingPhone]   = useState<Phone | null>(null)
  const [returningPhone, setReturningPhone] = useState<Phone | null>(null)
  const [saleResult,     setSaleResult]     = useState<{ receipt: Receipt; pdfBlob: Blob } | null>(null)

  void markAsSold

  const assigned  = phones.filter((p) => p.status === 'assigned')
  const inReturn  = phones.filter((p) => p.status === 'returned')
  const sold      = phones.filter((p) => p.status === 'sold')

  async function handleSaleConfirmed(form: SaleFormData) {
    if (!profile || !sellingPhone) return
    const result = await completeSale(sellingPhone, profile, form)
    if (result) {
      setSaleResult({ receipt: result.receipt, pdfBlob: result.pdfBlob })
      setSellingPhone(null)
    }
  }

  async function handleReturn(reason: string, notes: string) {
    if (!profile || !returningPhone) return
    await submitReturn(profile, returningPhone.id, reason, notes)
    setReturningPhone(null)
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Header */}
      <header className="bg-primary text-white px-5 pt-safe-top pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-lg leading-tight">{profile?.full_name}</p>
            <p className="text-white/70 text-xs">Field Agent</p>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell userId={profile?.id} />
            <button
              onClick={() => { signOut(); toast('Signed out.') }}
              className="bg-white/10 hover:bg-white/20 rounded-xl p-3 transition-colors flex items-center justify-center"
              aria-label="Sign out"
            >
              <MdLogout className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="px-4 pt-5 pb-24 max-w-lg mx-auto space-y-5">

        {/* Stats */}
        <div className={`grid gap-3 ${inReturn.length > 0 ? 'grid-cols-4' : 'grid-cols-3'}`}>
          <div className="bg-white rounded-2xl border border-brand-border p-3 text-center">
            <p className="text-2xl font-extrabold text-primary">{assigned.length}</p>
            <p className="text-[11px] text-brand-muted mt-0.5 font-medium">Active</p>
          </div>
          <div className="bg-white rounded-2xl border border-brand-border p-3 text-center">
            <p className="text-2xl font-extrabold text-green-600">{sold.length}</p>
            <p className="text-[11px] text-brand-muted mt-0.5 font-medium">Sold</p>
          </div>
          <div className="bg-white rounded-2xl border border-brand-border p-3 text-center">
            <p className="text-2xl font-extrabold text-orange-500">{assigned.length}</p>
            <p className="text-[11px] text-brand-muted mt-0.5 font-medium">Remaining</p>
          </div>
          {inReturn.length > 0 && (
            <div className="bg-amber-50 rounded-2xl border border-amber-200 p-3 text-center">
              <p className="text-2xl font-extrabold text-amber-600">{inReturn.length}</p>
              <p className="text-[11px] text-amber-600 mt-0.5 font-medium">In Return</p>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : phones.length === 0 ? (
          <div className="bg-white rounded-2xl border border-brand-border p-12 text-center">
            <MdPhoneAndroid className="w-16 h-16 text-gray-200 mx-auto mb-3" />
            <p className="font-bold text-brand-text">No phones assigned yet</p>
            <p className="text-sm text-brand-muted mt-1">Your team lead or admin will assign phones to you.</p>
          </div>
        ) : (
          <div className="space-y-5">

            {/* Active phones */}
            {assigned.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-brand-text uppercase tracking-wide">
                    Active — {assigned.length} phone{assigned.length !== 1 ? 's' : ''}
                  </h2>
                </div>
                <div className="space-y-3">
                  {assigned.map((phone) => (
                    <PhoneCard key={phone.id} phone={phone} onSell={setSellingPhone} onReturn={setReturningPhone} />
                  ))}
                </div>
              </section>
            )}

            {/* Pending returns */}
            {inReturn.length > 0 && (
              <section>
                <h2 className="text-sm font-bold text-amber-600 uppercase tracking-wide mb-3">
                  Pending Return — {inReturn.length}
                </h2>
                <div className="space-y-3">
                  {inReturn.map((phone) => (
                    <PhoneCard key={phone.id} phone={phone} onSell={setSellingPhone} onReturn={setReturningPhone} />
                  ))}
                </div>
              </section>
            )}

            {/* Sold phones */}
            {sold.length > 0 && (
              <section>
                <h2 className="text-sm font-bold text-brand-muted uppercase tracking-wide mb-3">
                  Sold — {sold.length}
                </h2>
                <div className="space-y-3">
                  {sold.map((phone) => (
                    <PhoneCard key={phone.id} phone={phone} onSell={setSellingPhone} onReturn={setReturningPhone} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
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
