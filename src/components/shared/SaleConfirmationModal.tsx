import { useState } from 'react'
import type { Phone, Profile, SaleFormData, PaymentMethod } from '../../types'
import Modal from './Modal'
import Button from './Button'
import { MdPhoneAndroid } from 'react-icons/md'

const NIGERIAN_PHONE_RE = /^(070|080|081|090|091)\d{8}$/
const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'TRANSFER', 'POS']

interface Props {
  phone:    Phone
  actor:    Profile
  onConfirm: (form: SaleFormData) => Promise<void>
  onClose:  () => void
}

interface FieldError { buyerName?: string; buyerPhone?: string; agreedPrice?: string }

export default function SaleConfirmationModal({ phone, onConfirm, onClose }: Props) {
  const [form, setForm] = useState<SaleFormData>({
    buyerName:     '',
    buyerPhone:    '',
    agreedPrice:   '',
    paymentMethod: 'CASH',
  })
  const [errors,  setErrors]  = useState<FieldError>({})
  const [loading, setLoading] = useState(false)

  function set(key: keyof SaleFormData, val: string) {
    setForm((p) => ({ ...p, [key]: val }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function validate(): boolean {
    const e: FieldError = {}
    if (form.buyerName.trim().length < 2)          e.buyerName  = 'Name must be at least 2 characters.'
    if (!NIGERIAN_PHONE_RE.test(form.buyerPhone))  e.buyerPhone = 'Enter a valid 11-digit Nigerian number (070/080/081/090/091…).'
    const p = parseFloat(form.agreedPrice)
    if (isNaN(p) || p <= 0)                        e.agreedPrice = 'Enter a price greater than ₦0.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setLoading(true)
    await onConfirm(form)
    setLoading(false)
  }

  const isValid = form.buyerName.trim().length >= 2
    && NIGERIAN_PHONE_RE.test(form.buyerPhone)
    && parseFloat(form.agreedPrice) > 0
    && form.paymentMethod !== undefined

  return (
    <Modal isOpen onClose={onClose} title={`Confirm Sale — ${phone.model}`} maxWidth="max-w-lg">
      <div className="space-y-5">

        {/* Phone thumbnail */}
        <div className="flex items-center gap-3 bg-primary-pale border border-primary/20 rounded-xl p-4">
          <div className="bg-primary rounded-xl p-3 flex-shrink-0">
            <MdPhoneAndroid className="w-7 h-7 text-white" />
          </div>
          <div>
            <p className="font-bold text-brand-text">{phone.model}</p>
            {phone.imei    && <p className="text-xs font-mono text-brand-muted">IMEI: {phone.imei}</p>}
            {phone.barcode && <p className="text-xs font-mono text-brand-muted">Barcode: {phone.barcode}</p>}
            <p className="text-xs font-mono text-brand-muted">SN: {phone.serial_number}</p>
          </div>
        </div>

        {/* Customer Name */}
        <div>
          <label className="block text-sm font-medium text-brand-text mb-1">
            Customer Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.buyerName}
            onChange={(e) => set('buyerName', e.target.value)}
            placeholder="e.g. Adaeze Obi"
            className={`w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${errors.buyerName ? 'border-red-400 bg-red-50' : 'border-brand-border'}`}
          />
          {errors.buyerName && <p className="text-xs text-red-600 mt-1">{errors.buyerName}</p>}
        </div>

        {/* Customer Phone */}
        <div>
          <label className="block text-sm font-medium text-brand-text mb-1">
            Customer Phone <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            value={form.buyerPhone}
            onChange={(e) => set('buyerPhone', e.target.value.replace(/\D/g, '').slice(0, 11))}
            placeholder="08012345678"
            className={`w-full border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary ${errors.buyerPhone ? 'border-red-400 bg-red-50' : 'border-brand-border'}`}
          />
          {errors.buyerPhone && <p className="text-xs text-red-600 mt-1">{errors.buyerPhone}</p>}
        </div>

        {/* Agreed Price */}
        <div>
          <label className="block text-sm font-medium text-brand-text mb-1">
            Agreed Sale Price (₦) <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted font-medium">₦</span>
            <input
              type="number"
              min="1"
              step="100"
              value={form.agreedPrice}
              onChange={(e) => set('agreedPrice', e.target.value)}
              placeholder="0.00"
              className={`w-full border rounded-xl pl-9 pr-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary ${errors.agreedPrice ? 'border-red-400 bg-red-50' : 'border-brand-border'}`}
            />
          </div>
          {errors.agreedPrice && <p className="text-xs text-red-600 mt-1">{errors.agreedPrice}</p>}
        </div>

        {/* Payment Method */}
        <div>
          <label className="block text-sm font-medium text-brand-text mb-2">
            Payment Method <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => set('paymentMethod', m)}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-all ${
                  form.paymentMethod === m
                    ? 'border-primary bg-primary text-white'
                    : 'border-brand-border bg-white text-brand-muted hover:border-primary hover:text-primary'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" onClick={onClose} fullWidth disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            loading={loading}
            disabled={!isValid}
            fullWidth
            size="lg"
          >
            Confirm &amp; Generate Receipt
          </Button>
        </div>
      </div>
    </Modal>
  )
}
