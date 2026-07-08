import { useState } from 'react'
import { pdf } from '@react-pdf/renderer'
import { createElement } from 'react'
import { supabase } from '../lib/supabase'
import { withTimeout } from '../lib/withTimeout'
import { invalidateKeys } from '../lib/cache'
import type { Phone, Profile, Receipt, SaleFormData } from '../types'
import toast from 'react-hot-toast'

let ReceiptDocumentComponent: React.ComponentType<{ data: ReceiptPdfData }> | null = null
async function getReceiptDocument() {
  if (!ReceiptDocumentComponent) {
    const mod = await import('../components/shared/ReceiptDocument')
    ReceiptDocumentComponent = mod.default
  }
  return ReceiptDocumentComponent
}

export interface ReceiptPdfData {
  receiptNumber: string
  generatedAt: string
  agentName: string
  agentId: string
  buyerName: string
  buyerPhone: string
  phoneModel: string
  imei: string
  barcode: string
  sellingPrice: number
  paymentMethod: string
}

interface SaleResult {
  receipt: Receipt
  pdfBlob: Blob
  pdfUrl: string
}

interface CompletedSaleRow {
  sale_id: string
  receipt_id: string
  receipt_number: string
  generated_at: string
}

export function useSaleReceipt() {
  const [loading, setLoading] = useState(false)

  async function completeSale(
    phone: Phone,
    actor: Profile,
    form: SaleFormData,
  ): Promise<SaleResult | null> {
    setLoading(true)
    try {
      const now = new Date().toISOString()
      const price = parseFloat(form.agreedPrice)

      const { data: saleRows, error: saleErr } = await withTimeout(
        supabase.rpc('complete_phone_sale', {
          p_phone_id: phone.id,
          p_buyer_name: form.buyerName.trim(),
          p_buyer_phone: form.buyerPhone,
          p_agreed_price: price,
          p_payment_method: form.paymentMethod,
        }),
        12000,
      )
      if (saleErr) throw saleErr

      const completed = (saleRows as CompletedSaleRow[] | null)?.[0]
      if (!completed) throw new Error('Sale completion failed')

      const receipt: Receipt = {
        id: completed.receipt_id,
        sale_id: completed.sale_id,
        receipt_number: completed.receipt_number,
        phone_id: phone.id,
        agent_id: actor.id,
        buyer_name: form.buyerName.trim(),
        buyer_phone: form.buyerPhone,
        selling_price: price,
        payment_method: form.paymentMethod,
        generated_at: completed.generated_at ?? now,
        pdf_url: null,
        voided: false,
        phone,
        agent: actor,
      }

      const pdfData: ReceiptPdfData = {
        receiptNumber: receipt.receipt_number,
        generatedAt: receipt.generated_at,
        agentName: actor.full_name,
        agentId: actor.id.slice(0, 8).toUpperCase(),
        buyerName: receipt.buyer_name,
        buyerPhone: receipt.buyer_phone,
        phoneModel: phone.model,
        imei: phone.imei ?? '',
        barcode: phone.barcode ?? '',
        sellingPrice: price,
        paymentMethod: form.paymentMethod,
      }

      const DocComponent = await getReceiptDocument()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const element = createElement(DocComponent as any, { data: pdfData }) as any
      const pdfBlob = await pdf(element).toBlob()

      const fileName = `${receipt.receipt_number}.pdf`
      const { error: uploadErr } = await supabase.storage
        .from('receipts')
        .upload(fileName, pdfBlob, { contentType: 'application/pdf', upsert: true })

      let pdfUrl = ''
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(fileName)
        pdfUrl = urlData.publicUrl
        await withTimeout(
          supabase.rpc('update_receipt_pdf_url', {
            p_receipt_id: receipt.id,
            p_pdf_url:    pdfUrl,
          }),
          8000,
        )
      } else {
        console.warn('[receipt upload]', uploadErr.message)
      }

      await invalidateKeys('inventory:all', `sales:summary:${actor.id}:${now.slice(0, 10)}`)

      toast.success('Sale recorded!')
      return { receipt: { ...receipt, pdf_url: pdfUrl }, pdfBlob, pdfUrl }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast.error(`Sale failed: ${msg}`)
      return null
    } finally {
      setLoading(false)
    }
  }

  return { completeSale, loading }
}
