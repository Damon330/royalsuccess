import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { usePhones } from '../../hooks/usePhones'
import { useReturns, STOCK_RETURN_REASONS } from '../../hooks/useReturns'
import { useSaleReceipt } from '../../hooks/useSaleReceipt'
import { useStaleDeviceSettings } from '../../hooks/useStaleDeviceSettings'
import SaleConfirmationModal from '../shared/SaleConfirmationModal'
import ReceiptSuccessScreen from '../shared/ReceiptSuccessScreen'
import NotificationBell from '../shared/NotificationBell'
import type { Phone, PhoneReturn, Receipt, SaleFormData } from '../../types'
import Badge from '../shared/Badge'
import Button from '../shared/Button'
import Modal from '../shared/Modal'
import Spinner from '../shared/Spinner'
import toast from 'react-hot-toast'
import {
  MdPhoneAndroid, MdLogout, MdWarning, MdUndo, MdCheckCircle,
  MdCancel, MdSell, MdAccessTime, MdSearch, MdClose,
} from 'react-icons/md'

const PAGE_SIZE = 10

function matchesSearch(phone: Phone, q: string): boolean {
  if (!q.trim()) return true
  const term = q.toLowerCase().trim()
  return (
    phone.model.toLowerCase().includes(term) ||
    (phone.imei?.toLowerCase().includes(term) ?? false) ||
    (phone.barcode?.toLowerCase().includes(term) ?? false) ||
    phone.serial_number.toLowerCase().includes(term)
  )
}

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search by IMEI, model, barcode…"
        className="w-full pl-9 pr-9 py-2.5 text-sm border border-brand-border rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted hover:text-brand-text"
          aria-label="Clear search"
        >
          <MdClose className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

function Pagination({ page, total, pageSize, onChange }: {
  page: number; total: number; pageSize: number; onChange: (p: number) => void
}) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null
  const start = (page - 1) * pageSize + 1
  const end   = Math.min(page * pageSize, total)
  return (
    <div className="flex items-center justify-between mt-3 px-1">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        className="px-3 py-1.5 text-xs font-semibold text-primary border border-primary/30 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-primary-pale transition-colors"
      >
        ← Prev
      </button>
      <span className="text-xs text-brand-muted font-medium tabular-nums">
        {start}–{end} of {total}
      </span>
      <button
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        className="px-3 py-1.5 text-xs font-semibold text-primary border border-primary/30 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-primary-pale transition-colors"
      >
        Next →
      </button>
    </div>
  )
}

function daysHeld(phone: Phone): number {
  if (!phone.assigned_at) return 0
  return (Date.now() - new Date(phone.assigned_at).getTime()) / 86_400_000
}

function RejectModal({ onConfirm, onClose }: {
  onConfirm: (note: string) => Promise<void>
  onClose:   () => void
}) {
  const [note,    setNote]    = useState('')
  const [loading, setLoading] = useState(false)
  async function handle() {
    if (!note.trim()) { toast.error('Rejection note is required.'); return }
    setLoading(true)
    await onConfirm(note)
    setLoading(false)
    onClose()
  }
  return (
    <Modal isOpen onClose={onClose} title="Reject Return">
      <div className="space-y-4">
        <p className="text-sm text-brand-muted">Provide a reason for rejecting this return request.</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Phone is in good working condition — return denied."
          rows={3}
          className="w-full border border-brand-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
        />
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} fullWidth>Cancel</Button>
          <Button variant="danger" onClick={handle} loading={loading} fullWidth>Reject Return</Button>
        </div>
      </div>
    </Modal>
  )
}

function TLReturnModal({ phone, onSubmit, onClose }: {
  phone:    Phone
  onSubmit: (reason: string, notes: string) => Promise<void>
  onClose:  () => void
}) {
  const [reason,  setReason]  = useState<string>(STOCK_RETURN_REASONS[0] ?? '')
  const [notes,   setNotes]   = useState('')
  const [loading, setLoading] = useState(false)

  async function handle() {
    setLoading(true)
    await onSubmit(reason, notes)
    setLoading(false)
    onClose()
  }

  return (
    <Modal isOpen onClose={onClose} title="Return Phone to Store">
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-xs text-amber-700 font-semibold mb-1.5">Returning to warehouse for admin approval</p>
          <div className="flex items-center gap-3">
            <div className="bg-amber-100 rounded-xl p-2 flex-shrink-0">
              <MdPhoneAndroid className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="font-semibold text-brand-text text-sm">{phone.model}</p>
              {phone.imei && <p className="text-xs font-mono text-brand-muted">IMEI: {phone.imei}</p>}
              <p className="text-xs font-mono text-brand-muted">SN: {phone.serial_number}</p>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-brand-text mb-1.5">Reason</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full border border-brand-border rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
          >
            {STOCK_RETURN_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-brand-text mb-1.5">
            Notes <span className="text-brand-muted font-normal">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Details…"
            rows={3}
            className="w-full border border-brand-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} fullWidth>Cancel</Button>
          <Button onClick={handle} loading={loading} fullWidth>Submit Return</Button>
        </div>
      </div>
    </Modal>
  )
}

export default function TeamLeadDashboard() {
  const { profile, signOut } = useAuth()
  const { phones: myPhones, loading: phonesLoading, dbError } = usePhones(profile?.id)
  const { returns, approveReturn, rejectReturn, submitReturn } = useReturns()
  const { completeSale, loading: saleLoading } = useSaleReceipt()
  const { settings: staleSettings } = useStaleDeviceSettings()

  const [sellingPhone,   setSellingPhone]   = useState<Phone | null>(null)
  const [returningPhone, setReturningPhone] = useState<Phone | null>(null)
  const [saleResult,     setSaleResult]     = useState<{ receipt: Receipt; pdfBlob: Blob } | null>(null)
  const [rejectingRet,   setRejectingRet]   = useState<PhoneReturn | null>(null)
  const [approving,      setApproving]      = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [stockPage,   setStockPage]   = useState(1)

  useEffect(() => { setStockPage(1) }, [searchQuery])

  const pendingReturns  = returns.filter((r) => r.return_status === 'PENDING')
  const mySold          = myPhones.filter((p) => p.status === 'sold').length
  const myActive        = myPhones.filter((p) => p.status === 'assigned')
  const staleCount      = myActive.filter((p) => daysHeld(p) > staleSettings.teamLeadDays).length

  const filteredPhones  = myPhones.filter((p) => matchesSearch(p, searchQuery))
  const pagedPhones     = filteredPhones.slice((stockPage - 1) * PAGE_SIZE, stockPage * PAGE_SIZE)

  const initials = (profile?.full_name ?? 'T')
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

  async function handleApprove(ret: PhoneReturn) {
    if (!profile) return
    setApproving(ret.id)
    await approveReturn(ret.id, profile)
    setApproving(null)
  }

  return (
    <div className="min-h-screen bg-brand-bg">

      {/* Gradient header */}
      <header className="sticky top-0 z-20 bg-gradient-to-br from-primary-dark via-primary to-primary-light text-white">
        <div className="pt-safe-top px-5 pb-5">

          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/20 border border-white/25 flex items-center justify-center font-extrabold text-base flex-shrink-0">
                {initials}
              </div>
              <div>
                <p className="font-extrabold text-[17px] leading-tight">{profile?.full_name}</p>
                <p className="text-white/60 text-xs font-medium">Team Lead</p>
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

          <div className={`grid gap-2 ${staleCount > 0 ? 'grid-cols-4' : 'grid-cols-3'}`}>
            <div className="bg-white/15 backdrop-blur-sm rounded-xl p-2.5 text-center border border-white/10">
              <p className="text-xl font-extrabold tabular-nums">{myPhones.length}</p>
              <p className="text-[10px] text-white/65 font-semibold uppercase tracking-wide">My Stock</p>
            </div>
            <div className="bg-white/15 backdrop-blur-sm rounded-xl p-2.5 text-center border border-white/10">
              <p className="text-xl font-extrabold tabular-nums text-green-200">{mySold}</p>
              <p className="text-[10px] text-white/65 font-semibold uppercase tracking-wide">Sold</p>
            </div>
            <div className="bg-white/15 backdrop-blur-sm rounded-xl p-2.5 text-center border border-white/10">
              <p className="text-xl font-extrabold tabular-nums text-amber-200">{pendingReturns.length}</p>
              <p className="text-[10px] text-white/65 font-semibold uppercase tracking-wide">Pending</p>
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

      <div className="max-w-lg mx-auto px-4 py-5 pb-28 space-y-6">

        {dbError && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <MdWarning className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700">
              <strong>Database connection failed.</strong> Ask admin to resume Supabase project, then refresh.
            </p>
          </div>
        )}

        {/* Pending Returns from agents */}
        {pendingReturns.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-xs font-bold text-amber-600 uppercase tracking-widest flex-1">
                Agent Returns — {pendingReturns.length}
              </h2>
            </div>
            <div className="space-y-3">
              {pendingReturns.map((ret) => {
                const p = ret.phone     as { model?: string; imei?: string; serial_number?: string } | undefined
                const r = ret.requester as { full_name?: string } | undefined
                return (
                  <div key={ret.id} className="bg-white rounded-2xl border border-amber-200 overflow-hidden">
                    <div className="flex items-start gap-3 p-4">
                      <div className="bg-amber-50 rounded-xl p-2.5 flex-shrink-0">
                        <MdPhoneAndroid className="w-5 h-5 text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-brand-text text-sm">{p?.model ?? '—'}</p>
                        <p className="text-xs font-mono text-brand-muted">
                          {p?.imei ? `IMEI: ${p.imei}` : `SN: ${p?.serial_number ?? '—'}`}
                        </p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                          <span className="text-xs text-brand-muted">
                            <span className="font-medium">Agent:</span> {r?.full_name ?? '—'}
                          </span>
                          <span className="text-xs text-brand-muted">
                            <span className="font-medium">Reason:</span> {ret.return_reason}
                          </span>
                        </div>
                        {ret.notes && (
                          <p className="text-xs text-brand-muted italic mt-0.5">"{ret.notes}"</p>
                        )}
                        <p className="text-xs text-brand-muted/70 mt-1">
                          {new Date(ret.created_at).toLocaleDateString('en-NG', {
                            day: 'numeric', month: 'short', year: 'numeric',
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 px-4 pb-4">
                      <button
                        onClick={() => handleApprove(ret)}
                        disabled={approving === ret.id}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-success-light hover:bg-green-100 text-success border border-green-200 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                      >
                        <MdCheckCircle className="w-4 h-4" />
                        {approving === ret.id ? 'Approving…' : 'Approve'}
                      </button>
                      <button
                        onClick={() => setRejectingRet(ret)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-danger-light hover:bg-red-100 text-danger border border-red-200 rounded-xl text-sm font-semibold transition-colors"
                      >
                        <MdCancel className="w-4 h-4" /> Reject
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* My Stock */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold text-brand-muted uppercase tracking-widest">
              My Stock{myPhones.length > 0 ? ` — ${myPhones.length}` : ''}
            </h2>
            {searchQuery && (
              <span className="text-xs text-brand-muted">
                {filteredPhones.length} result{filteredPhones.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* IMEI / model search */}
          {myPhones.length > 0 && !phonesLoading && (
            <div className="mb-3">
              <SearchBar value={searchQuery} onChange={setSearchQuery} />
            </div>
          )}

          {phonesLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : myPhones.length === 0 ? (
            <div className="bg-white rounded-2xl border border-brand-border p-10 text-center">
              <div className="w-14 h-14 bg-primary-pale rounded-2xl flex items-center justify-center mx-auto mb-3">
                <MdPhoneAndroid className="w-7 h-7 text-primary/40" />
              </div>
              <p className="font-semibold text-brand-text">No phones in your stock</p>
              <p className="text-sm text-brand-muted mt-1">Admin will assign phones to you soon.</p>
            </div>
          ) : filteredPhones.length === 0 ? (
            <div className="bg-white rounded-2xl border border-brand-border p-8 text-center">
              <MdSearch className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="font-semibold text-brand-text text-sm">No phones match "{searchQuery}"</p>
              <button
                onClick={() => setSearchQuery('')}
                className="mt-2 text-xs text-primary font-semibold hover:underline"
              >
                Clear search
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {pagedPhones.map((phone) => {
                  const heldDays = daysHeld(phone)
                  const days  = Math.floor(heldDays)
                  const stale = phone.status === 'assigned' && heldDays > staleSettings.teamLeadDays

                  return (
                    <div
                      key={phone.id}
                      className={`bg-white rounded-2xl border border-l-4 overflow-hidden transition-shadow hover:shadow-md ${
                        phone.status === 'sold'
                          ? 'border-brand-border border-l-gray-300 opacity-70'
                          : stale
                          ? 'border-brand-border border-l-orange-400'
                          : 'border-brand-border border-l-primary'
                      }`}
                    >
                      {stale && (
                        <div className="flex items-center gap-2 px-4 py-1.5 bg-orange-50 border-b border-orange-100">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse flex-shrink-0" />
                          <MdAccessTime className="w-3 h-3 text-orange-500 flex-shrink-0" />
                          <p className="text-[11px] font-semibold text-orange-700">Overdue — {days}d (limit: {staleSettings.teamLeadDays}d)</p>
                        </div>
                      )}

                      <div className="flex items-center gap-3 p-3.5">
                        <div className={`rounded-xl p-2 flex-shrink-0 ${
                          phone.status === 'sold' ? 'bg-brand-bg' : stale ? 'bg-warning/10' : 'bg-primary-pale'
                        }`}>
                          <MdPhoneAndroid className={`w-5 h-5 ${
                            phone.status === 'sold' ? 'text-gray-400' : stale ? 'text-orange-500' : 'text-primary'
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-brand-text truncate">{phone.model}</p>
                          {phone.imei
                            ? <p className="text-xs font-mono text-brand-muted truncate">IMEI: {phone.imei}</p>
                            : <p className="text-xs font-mono text-brand-muted truncate">SN: {phone.serial_number}</p>
                          }
                        </div>

                        {phone.status === 'assigned' ? (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Button size="sm" variant="success" onClick={() => setSellingPhone(phone)}>
                              <MdSell className="w-3.5 h-3.5 mr-1" />
                              Sell
                            </Button>
                            <button
                              onClick={() => setReturningPhone(phone)}
                              className="flex items-center justify-center w-9 h-9 bg-brand-bg hover:bg-warning/10 hover:text-warning text-brand-muted border border-brand-border hover:border-warning/50 rounded-xl transition-colors"
                              title="Return to store"
                            >
                              <MdUndo className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <Badge variant={phone.status === 'sold' ? 'green' : 'gray'}>
                            {phone.status === 'sold' ? 'Sold' : phone.status}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              <Pagination
                page={stockPage}
                total={filteredPhones.length}
                pageSize={PAGE_SIZE}
                onChange={setStockPage}
              />
            </>
          )}
        </section>
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

      {rejectingRet && profile && (
        <RejectModal
          onConfirm={async (note) => { await rejectReturn(rejectingRet.id, profile, note) }}
          onClose={() => setRejectingRet(null)}
        />
      )}

      {returningPhone && profile && (
        <TLReturnModal
          phone={returningPhone}
          onSubmit={async (reason, notes) => {
            await submitReturn(profile, returningPhone.id, reason, notes)
          }}
          onClose={() => setReturningPhone(null)}
        />
      )}
    </div>
  )
}
