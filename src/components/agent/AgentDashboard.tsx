import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { usePhones } from '../../hooks/usePhones'
import { useReturns } from '../../hooks/useReturns'
import { useSaleReceipt } from '../../hooks/useSaleReceipt'
import { useStaleDeviceSettings } from '../../hooks/useStaleDeviceSettings'
import SaleConfirmationModal from '../shared/SaleConfirmationModal'
import ReceiptSuccessScreen from '../shared/ReceiptSuccessScreen'
import NotificationBell from '../shared/NotificationBell'
import Modal from '../shared/Modal'
import Button from '../shared/Button'
import Spinner from '../shared/Spinner'
import type { Phone, Receipt, SaleFormData } from '../../types'
import toast from 'react-hot-toast'
import {
  MdPhoneAndroid, MdLogout, MdCheckCircle, MdUndo,
  MdSell, MdWarning, MdGroup, MdStorefront, MdAccessTime,
} from 'react-icons/md'

const STOCK_RETURN_REASONS = [
  'Wrong model received',
  'Phone damaged / defective',
  'Excess stock',
  'End of assignment period',
  'Other',
] as const

function daysHeld(phone: Phone): number {
  if (!phone.assigned_at) return 0
  return (Date.now() - new Date(phone.assigned_at).getTime()) / 86_400_000
}

function isStale(phone: Phone, staleDays: number): boolean {
  return phone.status === 'assigned' && daysHeld(phone) > staleDays
}

type ReturnTarget = 'team_lead' | 'store'

function ReturnModal({ phone, hasTeamLead, onSubmitToStore, onReturnToTL, onClose }: {
  phone:          Phone
  hasTeamLead:    boolean
  onSubmitToStore: (reason: string, notes: string) => Promise<void>
  onReturnToTL:   () => Promise<void>
  onClose:        () => void
}) {
  const [target,  setTarget]  = useState<ReturnTarget>(hasTeamLead ? 'team_lead' : 'store')
  const [reason,  setReason]  = useState<string>(STOCK_RETURN_REASONS[0])
  const [notes,   setNotes]   = useState('')
  const [loading, setLoading] = useState(false)
  const isDamaged = reason.toLowerCase().includes('damaged') || reason.toLowerCase().includes('defective')

  async function handle() {
    setLoading(true)
    if (target === 'team_lead') {
      await onReturnToTL()
    } else {
      await onSubmitToStore(reason, notes)
    }
    setLoading(false)
    onClose()
  }

  return (
    <Modal isOpen onClose={onClose} title="Return Phone">
      <div className="space-y-4">

        {/* Phone info */}
        <div className="bg-brand-bg rounded-card p-4 flex items-center gap-3 border border-brand-border">
          <div className="bg-primary-pale rounded-xl p-2.5 flex-shrink-0">
            <MdPhoneAndroid className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-brand-text text-sm">{phone.model}</p>
            {phone.imei && <p className="text-xs font-mono text-brand-muted">IMEI: {phone.imei}</p>}
            <p className="text-xs font-mono text-brand-muted">SN: {phone.serial_number}</p>
          </div>
        </div>

        {/* Target selection */}
        {hasTeamLead && (
          <div>
            <p className="text-sm font-medium text-brand-text mb-2">Where are you returning this?</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setTarget('team_lead')}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 text-sm font-semibold transition-all ${
                  target === 'team_lead'
                    ? 'border-primary bg-primary-pale text-primary'
                    : 'border-brand-border text-brand-muted hover:border-primary/40 hover:bg-brand-bg'
                }`}
              >
                <MdGroup className="w-6 h-6" />
                <span>Team Lead</span>
                <span className="text-[10px] font-normal text-center leading-tight">
                  Direct transfer — no wait
                </span>
              </button>
              <button
                onClick={() => setTarget('store')}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 text-sm font-semibold transition-all ${
                  target === 'store'
                    ? 'border-primary bg-primary-pale text-primary'
                    : 'border-brand-border text-brand-muted hover:border-primary/40 hover:bg-brand-bg'
                }`}
              >
                <MdStorefront className="w-6 h-6" />
                <span>Back to Store</span>
                <span className="text-[10px] font-normal text-center leading-tight">
                  Needs admin approval
                </span>
              </button>
            </div>
          </div>
        )}

        {target === 'team_lead' ? (
          <div className="flex items-start gap-2.5 bg-green-50 border border-green-200 rounded-xl p-3.5">
            <MdCheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-green-700">
              Phone transfers directly to your team lead's stock. No approval needed.
            </p>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium text-brand-text mb-1.5">Reason for Return</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full border border-brand-border rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
              >
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
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional details…"
                rows={3}
                className="w-full border border-brand-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
          </>
        )}

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" onClick={onClose} fullWidth>Cancel</Button>
          <Button onClick={handle} loading={loading} fullWidth>
            {target === 'team_lead' ? 'Transfer to Team Lead' : 'Submit Return'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function PhoneCard({ phone, hasTeamLead, staleDays, onSell, onReturn }: {
  phone:       Phone
  hasTeamLead: boolean
  staleDays:   number
  onSell:      (p: Phone) => void
  onReturn:    (p: Phone) => void
}) {
  const isAssigned = phone.status === 'assigned'
  const isSold     = phone.status === 'sold'
  const isReturned = phone.status === 'returned'
  const stale      = isAssigned && isStale(phone, staleDays)
  const days       = Math.floor(daysHeld(phone))

  const accentBorder = isSold
    ? 'border-l-gray-300'
    : isReturned
    ? 'border-l-amber-400'
    : stale
    ? 'border-l-orange-500'
    : 'border-l-primary'

  const iconBg = isSold
    ? 'bg-brand-bg'
    : isReturned
    ? 'bg-amber-50'
    : stale
    ? 'bg-orange-50'
    : 'bg-primary-pale'

  const iconColor = isSold
    ? 'text-gray-400'
    : isReturned
    ? 'text-amber-500'
    : stale
    ? 'text-orange-500'
    : 'text-primary'

  return (
    <div className={`bg-white rounded-2xl border border-brand-border border-l-4 ${accentBorder} overflow-hidden transition-shadow hover:shadow-md ${isSold ? 'opacity-70' : ''}`}>

      {/* Stale banner */}
      {stale && (
        <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 border-b border-orange-100">
          <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse flex-shrink-0" />
          <MdAccessTime className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
          <p className="text-xs font-semibold text-orange-700">
            Overdue — {days}d in field (limit: {staleDays}d)
            {hasTeamLead && ' · Return to team lead or store'}
          </p>
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`${iconBg} rounded-xl p-2.5 flex-shrink-0`}>
            <MdPhoneAndroid className={`w-5 h-5 ${iconColor}`} />
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
            <span className="flex items-center gap-1 bg-green-100 text-green-700 text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0">
              <MdCheckCircle className="w-3.5 h-3.5" /> Sold
            </span>
          )}
          {isReturned && (
            <span className="flex items-center gap-1 bg-amber-100 text-amber-700 text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0">
              <MdUndo className="w-3.5 h-3.5" /> Pending
            </span>
          )}
        </div>

        {/* Action buttons */}
        {isAssigned && (
          <div className="grid grid-cols-2 gap-2.5 mt-4">
            <button
              onClick={() => onSell(phone)}
              className="flex items-center justify-center gap-2 bg-success hover:bg-green-700 active:scale-[0.97] text-white font-bold rounded-xl py-3.5 text-sm transition-all shadow-sm"
            >
              <MdSell className="w-4 h-4" />
              Mark as Sold
            </button>
            <button
              onClick={() => onReturn(phone)}
              className={`flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold transition-all active:scale-[0.97] ${
                stale
                  ? 'bg-orange-50 border-2 border-orange-400 text-orange-700 hover:bg-orange-100'
                  : 'bg-white border border-brand-border hover:border-primary/40 hover:bg-primary-pale text-brand-muted hover:text-primary'
              }`}
            >
              <MdUndo className="w-4 h-4" />
              Return
            </button>
          </div>
        )}

        {isReturned && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-center gap-2">
            <MdUndo className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <p className="text-xs font-medium text-amber-700">Return submitted — awaiting approval</p>
          </div>
        )}

        {isSold && phone.sold_at && (
          <p className="text-xs text-brand-muted text-center mt-3">
            Sold{' '}
            {new Date(phone.sold_at).toLocaleDateString('en-NG', {
              day: 'numeric', month: 'short', year: 'numeric',
            })}
          </p>
        )}
      </div>
    </div>
  )
}

export default function AgentDashboard() {
  const { profile, signOut } = useAuth()
  const { phones, loading, returnToTeamLead } = usePhones(profile?.id)
  const { submitReturn } = useReturns()
  const { completeSale, loading: saleLoading } = useSaleReceipt()
  const { settings: staleSettings } = useStaleDeviceSettings()

  const [sellingPhone,   setSellingPhone]   = useState<Phone | null>(null)
  const [returningPhone, setReturningPhone] = useState<Phone | null>(null)
  const [saleResult,     setSaleResult]     = useState<{ receipt: Receipt; pdfBlob: Blob } | null>(null)

  const hasTeamLead = !!profile?.team_lead_id
  const assigned    = phones.filter((p) => p.status === 'assigned')
  const inReturn    = phones.filter((p) => p.status === 'returned')
  const sold        = phones.filter((p) => p.status === 'sold')
  const staleCount  = assigned.filter((phone) => isStale(phone, staleSettings.agentDays)).length

  const initials = (profile?.full_name ?? 'A')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

  async function handleSaleConfirmed(form: SaleFormData) {
    if (!profile || !sellingPhone) return
    const result = await completeSale(sellingPhone, profile, form)
    if (result) {
      setSaleResult({ receipt: result.receipt, pdfBlob: result.pdfBlob })
      setSellingPhone(null)
    }
  }

  async function handleReturnToStore(reason: string, notes: string) {
    if (!profile || !returningPhone) return
    await submitReturn(profile, returningPhone.id, reason, notes)
    setReturningPhone(null)
  }

  async function handleReturnToTL() {
    if (!profile || !returningPhone || !profile.team_lead_id) return
    await returnToTeamLead(returningPhone.id, profile.team_lead_id, profile)
    setReturningPhone(null)
  }

  return (
    <div className="min-h-screen bg-brand-bg">

      {/* Gradient header */}
      <header className="sticky top-0 z-20 bg-gradient-to-br from-primary-dark via-primary to-primary-light text-white">
        <div className="pt-safe-top px-5 pb-5">

          {/* Top row */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/20 border border-white/25 flex items-center justify-center font-extrabold text-base flex-shrink-0">
                {initials}
              </div>
              <div>
                <p className="font-extrabold text-[17px] leading-tight">{profile?.full_name}</p>
                <p className="text-white/60 text-xs font-medium">Field Agent</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell userId={profile?.id} />
              <button
                onClick={() => { signOut(); toast('Signed out.') }}
                className="w-10 h-10 bg-white/15 hover:bg-white/25 rounded-xl flex items-center justify-center transition-colors"
                aria-label="Sign out"
              >
                <MdLogout className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Stats pills */}
          <div className={`grid gap-2 ${staleCount > 0 ? 'grid-cols-4' : 'grid-cols-3'}`}>
            <div className="bg-white/15 backdrop-blur-sm rounded-xl p-2.5 text-center border border-white/10">
              <p className="text-xl font-extrabold tabular-nums">{assigned.length}</p>
              <p className="text-[10px] text-white/65 font-semibold uppercase tracking-wide">Active</p>
            </div>
            <div className="bg-white/15 backdrop-blur-sm rounded-xl p-2.5 text-center border border-white/10">
              <p className="text-xl font-extrabold tabular-nums text-green-200">{sold.length}</p>
              <p className="text-[10px] text-white/65 font-semibold uppercase tracking-wide">Sold</p>
            </div>
            <div className="bg-white/15 backdrop-blur-sm rounded-xl p-2.5 text-center border border-white/10">
              <p className="text-xl font-extrabold tabular-nums">{inReturn.length}</p>
              <p className="text-[10px] text-white/65 font-semibold uppercase tracking-wide">In Return</p>
            </div>
            {staleCount > 0 && (
              <div className="bg-orange-500/40 backdrop-blur-sm rounded-xl p-2.5 text-center border border-orange-300/30">
                <p className="text-xl font-extrabold tabular-nums text-orange-100">{staleCount}</p>
                <p className="text-[10px] text-orange-200 font-semibold uppercase tracking-wide">Overdue</p>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="px-4 pt-5 pb-28 max-w-lg mx-auto space-y-6">

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : phones.length === 0 ? (
          <div className="bg-white rounded-2xl border border-brand-border p-12 text-center mt-4">
            <div className="w-16 h-16 bg-primary-pale rounded-2xl flex items-center justify-center mx-auto mb-4">
              <MdPhoneAndroid className="w-8 h-8 text-primary/40" />
            </div>
            <p className="font-bold text-brand-text text-lg">No phones assigned yet</p>
            <p className="text-sm text-brand-muted mt-1.5">
              Your team lead or admin will assign phones to you shortly.
            </p>
          </div>
        ) : (
          <>
            {/* Stale warning banner */}
            {staleCount > 0 && (
              <div className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-2xl p-4">
                <MdAccessTime className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-orange-800">
                    {staleCount} phone{staleCount !== 1 ? 's' : ''} overdue
                  </p>
                  <p className="text-xs text-orange-700 mt-0.5">
                    Phones held over {staleSettings.agentDays} days should be returned
                    {hasTeamLead ? ' to your team lead or the store.' : ' to store.'}
                  </p>
                </div>
              </div>
            )}

            {/* Active phones */}
            {assigned.length > 0 && (
              <section>
                <h2 className="text-xs font-bold text-brand-muted uppercase tracking-widest mb-3">
                  Active — {assigned.length}
                </h2>
                <div className="space-y-3">
                  {assigned.map((phone) => (
                    <PhoneCard
                      key={phone.id}
                      phone={phone}
                      hasTeamLead={hasTeamLead}
                      staleDays={staleSettings.agentDays}
                      onSell={setSellingPhone}
                      onReturn={setReturningPhone}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Pending returns */}
            {inReturn.length > 0 && (
              <section>
                <h2 className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-3">
                  Pending Return — {inReturn.length}
                </h2>
                <div className="space-y-3">
                  {inReturn.map((phone) => (
                    <PhoneCard
                      key={phone.id}
                      phone={phone}
                      hasTeamLead={hasTeamLead}
                      staleDays={staleSettings.agentDays}
                      onSell={setSellingPhone}
                      onReturn={setReturningPhone}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Sold */}
            {sold.length > 0 && (
              <section>
                <h2 className="text-xs font-bold text-brand-muted uppercase tracking-widest mb-3">
                  Sold — {sold.length}
                </h2>
                <div className="space-y-3">
                  {sold.map((phone) => (
                    <PhoneCard
                      key={phone.id}
                      phone={phone}
                      hasTeamLead={hasTeamLead}
                      staleDays={staleSettings.agentDays}
                      onSell={setSellingPhone}
                      onReturn={setReturningPhone}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
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
          <div className="bg-brand-surface rounded-card p-6 text-center space-y-3">
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
          hasTeamLead={hasTeamLead}
          onSubmitToStore={handleReturnToStore}
          onReturnToTL={handleReturnToTL}
          onClose={() => setReturningPhone(null)}
        />
      )}
    </div>
  )
}
