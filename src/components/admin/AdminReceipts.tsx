import { useState } from 'react'
import { useReceipts, RECEIPTS_PAGE_SIZE } from '../../hooks/useReceipts'
import { useProfiles } from '../../hooks/useProfiles'
import Header from '../shared/Header'
import Badge from '../shared/Badge'
import Modal from '../shared/Modal'
import Button from '../shared/Button'
import Spinner from '../shared/Spinner'
import Pagination from '../shared/Pagination'
import type { Receipt } from '../../types'
import { MdDownload, MdWarning, MdRefresh, MdReceipt } from 'react-icons/md'

function VoidConfirmModal({ receipt, onConfirm, onClose }: {
  receipt: Receipt; onConfirm: () => Promise<void>; onClose: () => void
}) {
  const [loading, setLoading] = useState(false)
  async function handle() { setLoading(true); await onConfirm(); setLoading(false); onClose() }
  return (
    <Modal isOpen onClose={onClose} title="Void Receipt">
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="font-semibold text-brand-text">{receipt.receipt_number}</p>
          <p className="text-sm text-brand-muted mt-1">Buyer: {receipt.buyer_name}</p>
          <p className="text-sm text-brand-muted">
            ₦{receipt.selling_price.toLocaleString('en-NG', { minimumFractionDigits: 2 })} · {receipt.payment_method}
          </p>
        </div>
        <p className="text-sm text-brand-muted">
          Voiding preserves the audit trail but marks the receipt as invalid. This cannot be undone.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} fullWidth>Cancel</Button>
          <Button variant="danger" onClick={handle} loading={loading} fullWidth>Void Receipt</Button>
        </div>
      </div>
    </Modal>
  )
}

export default function AdminReceipts() {
  const {
    receipts, loading, dbError, missingTable,
    page, totalPages, totalCount,
    filters, updateFilters, goToPage,
    voidReceipt, refetch,
  } = useReceipts()
  const { agents, teamLeads } = useProfiles()

  // Text search is client-side (operates on the current page)
  const [search,     setSearch]     = useState('')
  const [voidTarget, setVoidTarget] = useState<Receipt | null>(null)

  const allAgents = [...agents, ...teamLeads]

  const displayed = search
    ? receipts.filter((r) => {
        const q = search.toLowerCase()
        return r.buyer_name.toLowerCase().includes(q) || r.buyer_phone.includes(q)
      })
    : receipts

  function downloadReceipt(r: Receipt) {
    if (r.pdf_url) {
      const a = document.createElement('a')
      a.href = r.pdf_url; a.download = `${r.receipt_number}.pdf`; a.target = '_blank'; a.click()
    } else {
      window.open(`/api/receipt?id=${r.id}`, '_blank')
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <Header title="Receipts" />
      <div className="p-6 space-y-5">

        {dbError && (
          <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex items-start gap-3">
            <MdWarning className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              {missingTable ? (
                <>
                  <p className="text-sm font-semibold text-brand-text">Receipts table not found in database</p>
                  <p className="text-xs text-warning">
                    Go to <strong>supabase.com</strong> → your project → <strong>SQL Editor</strong> → New query →
                    paste the contents of <code className="bg-amber-100 px-1 rounded">supabase/fix-missing-tables.sql</code> → Run.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-brand-text">Database connection failed</p>
                  <p className="text-xs text-warning">Go to <strong>supabase.com</strong> → resume your project, then refresh.</p>
                </>
              )}
            </div>
            <button onClick={refetch}
              className="flex items-center gap-1 text-xs text-warning bg-warning/15 hover:bg-warning/25 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0">
              <MdRefresh className="w-4 h-4" /> Refresh
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white border border-brand-border rounded-xl p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-1">Search Buyer</label>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or phone…"
              className="border border-brand-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary w-44" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-1">Agent</label>
            <select value={filters.agentId ?? ''} onChange={(e) => updateFilters({ agentId: e.target.value || undefined })}
              className="border border-brand-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">All</option>
              {allAgents.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-1">Payment</label>
            <select value={filters.paymentMethod ?? ''} onChange={(e) => updateFilters({ paymentMethod: e.target.value || undefined })}
              className="border border-brand-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">All</option>
              <option value="CASH">Cash</option>
              <option value="TRANSFER">Transfer</option>
              <option value="POS">POS</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-1">From</label>
            <input type="date" value={filters.dateFrom ?? ''} onChange={(e) => updateFilters({ dateFrom: e.target.value || undefined })}
              className="border border-brand-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-1">To</label>
            <input type="date" value={filters.dateTo ?? ''} onChange={(e) => updateFilters({ dateTo: e.target.value || undefined })}
              className="border border-brand-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <label className="flex items-center gap-2 text-sm text-brand-muted cursor-pointer select-none">
            <input type="checkbox" checked={!!filters.showVoided} onChange={(e) => updateFilters({ showVoided: e.target.checked || undefined })}
              className="rounded" />
            Show voided
          </label>
        </div>

        {/* Table */}
        <div className="bg-brand-surface rounded-card border border-brand-border overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-brand-bg border-b border-brand-border">
                    <tr>
                      {['Receipt No', 'Buyer', 'Phone Model', 'Agent', 'Amount', 'Payment', 'Date', 'Status', 'Actions'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-brand-muted uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border">
                    {displayed.map((r) => {
                      const phone = r.phone as { model?: string; imei?: string } | undefined
                      const agentProfile = allAgents.find((a) => a.id === r.agent_id)
                      return (
                        <tr key={r.id} className={`hover:bg-brand-bg transition-colors ${r.voided ? 'opacity-60' : ''}`}>
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">{r.receipt_number}</td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-brand-text">{r.buyer_name}</p>
                            <p className="text-xs text-brand-muted">{r.buyer_phone}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-brand-text">{phone?.model ?? '—'}</p>
                            {phone?.imei && <p className="text-xs font-mono text-brand-muted">IMEI: {phone.imei}</p>}
                          </td>
                          <td className="px-4 py-3 text-brand-muted">{agentProfile?.full_name ?? '—'}</td>
                          <td className="px-4 py-3 font-semibold text-brand-text">
                            ₦{r.selling_price.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={r.payment_method === 'CASH' ? 'green' : r.payment_method === 'TRANSFER' ? 'blue' : 'primary'}>
                              {r.payment_method}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-xs text-brand-muted whitespace-nowrap">
                            {new Date(r.generated_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="px-4 py-3">
                            {r.voided
                              ? <Badge variant="red">Voided</Badge>
                              : <Badge variant="green">Active</Badge>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button onClick={() => downloadReceipt(r)}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-primary-pale hover:bg-primary/10 text-primary rounded-lg text-xs font-medium transition-colors">
                                <MdDownload className="w-3.5 h-3.5" /> Download
                              </button>
                              {!r.voided && (
                                <button onClick={() => setVoidTarget(r)}
                                  className="flex items-center gap-1 px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-medium transition-colors">
                                  Void
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {displayed.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-5 py-14 text-center text-brand-muted">
                          <MdReceipt className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                          No receipts found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <Pagination
                page={page}
                totalPages={totalPages}
                totalCount={totalCount}
                pageSize={RECEIPTS_PAGE_SIZE}
                onPageChange={goToPage}
              />
            </>
          )}
        </div>
      </div>

      {voidTarget && (
        <VoidConfirmModal
          receipt={voidTarget}
          onConfirm={async () => { await voidReceipt(voidTarget.id) }}
          onClose={() => setVoidTarget(null)}
        />
      )}
    </div>
  )
}
