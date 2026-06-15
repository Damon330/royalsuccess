import type { Receipt } from '../../types'
import { MdCheckCircle, MdDownload } from 'react-icons/md'
import { TbBrandWhatsapp } from 'react-icons/tb'

interface Props {
  receipt:  Receipt
  pdfBlob:  Blob
  onClose:  () => void
}

export default function ReceiptSuccessScreen({ receipt, pdfBlob, onClose }: Props) {
  function downloadPdf() {
    const url = URL.createObjectURL(pdfBlob)
    const a   = document.createElement('a')
    a.href    = url
    a.download = `${receipt.receipt_number}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  function shareWhatsApp() {
    const priceStr = receipt.selling_price.toLocaleString('en-NG', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    })
    const text = encodeURIComponent(
      `Your receipt from Royal Success\n` +
      `Receipt No: ${receipt.receipt_number}\n` +
      `Amount: ₦${priceStr}\n` +
      (receipt.pdf_url ? receipt.pdf_url : ''),
    )
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-brand-surface rounded-card w-full max-w-sm p-8 text-center space-y-5" style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        {/* Icon */}
        <div className="flex justify-center">
          <div className="bg-green-100 rounded-full p-4">
            <MdCheckCircle className="w-14 h-14 text-green-500" />
          </div>
        </div>

        <div>
          <h2 className="text-xl font-extrabold text-brand-text">Sale Recorded!</h2>
          <p className="text-sm text-brand-muted mt-1">Receipt has been generated.</p>
        </div>

        {/* Receipt number */}
        <div className="bg-primary/10 dark:bg-primary/20 border border-primary/20 rounded-inner py-3 px-5 inline-block w-full">
          <p className="text-xs text-brand-muted uppercase tracking-wide font-semibold">Receipt No.</p>
          <p className="text-2xl font-extrabold text-primary mt-0.5">{receipt.receipt_number}</p>
          <p className="text-sm text-brand-muted mt-1">
            ₦{receipt.selling_price.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
            {' · '}{receipt.payment_method}
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            onClick={downloadPdf}
            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-light text-white font-semibold py-3 rounded-xl transition-colors"
          >
            <MdDownload className="w-5 h-5" /> Download Receipt PDF
          </button>
          <button
            onClick={shareWhatsApp}
            className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1da851] text-white font-semibold py-3 rounded-xl transition-colors"
          >
            <TbBrandWhatsapp className="w-5 h-5" /> Share via WhatsApp
          </button>
          <button
            onClick={onClose}
            className="w-full py-2.5 text-sm font-medium text-brand-muted hover:text-brand-text transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
