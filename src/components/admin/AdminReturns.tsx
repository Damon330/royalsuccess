import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useReturns } from '../../hooks/useReturns'
import { useProfiles } from '../../hooks/useProfiles'
import Header from '../shared/Header'
import Badge from '../shared/Badge'
import Button from '../shared/Button'
import Modal from '../shared/Modal'
import Spinner from '../shared/Spinner'
import Pagination from '../shared/Pagination'
import { MdCheckCircle, MdCancel, MdWarning, MdRefresh, MdInbox } from 'react-icons/md'

const RETURNS_PAGE_SIZE = 25

type FilterStatus = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'

const STATUS_BADGE: Record<string, 'yellow' | 'green' | 'red' | 'gray'> = {
  PENDING:  'yellow',
  APPROVED: 'green',
  REJECTED: 'red',
}

function safeStr(v: unknown): string {
  if (v == null) return '—'
  return String(v)
}

function RejectModal({ onConfirm, onClose }: {
  onConfirm: (note: string) => Promise<void>; onClose: () => void
}) {
  const [note, setNote]     = useState('')
  const [loading, setLoading] = useState(false)
  async function handle() {
    if (!note.trim()) return
    setLoading(true); await onConfirm(note); setLoading(false); onClose()
  }
  return (
    <Modal isOpen onClose={onClose} title="Reject Return">
      <div className="space-y-4">
        <p className="text-sm text-brand-muted">Provide a reason for rejecting this return request.</p>
        <div>
          <label className="block text-sm font-medium text-brand-text mb-1">
            Rejection Note <span className="text-red-500">*</span>
          </label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Phone is in good working condition — return denied." rows={3}
            className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} fullWidth>Cancel</Button>
          <Button variant="danger" onClick={handle} loading={loading} disabled={!note.trim()} fullWidth>
            Reject Return
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default function AdminReturns() {
  const { profile } = useAuth()
  const { returns, loading, dbError, missingTable, approveReturn, rejectReturn, refetch } = useReturns()
  const { agents, teamLeads } = useProfiles()

  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL')
  const [filterAgent,  setFilterAgent]  = useState('')
  const [dateFrom,     setDateFrom]     = useState('')
  const [dateTo,       setDateTo]       = useState('')
  const [rejectingId,  setRejectingId]  = useState<string | null>(null)
  const [approving,    setApproving]    = useState<string | null>(null)
  const [retPage,      setRetPage]      = useState(1)

  // Guard: returns is always an array from the hook, but be safe
  const safeReturns = Array.isArray(returns) ? returns : []

  const filtered = safeReturns.filter((r) => {
    const status = String(r.return_status ?? '')
    if (filterStatus !== 'ALL' && status !== filterStatus) return false
    if (filterAgent && r.returned_by !== filterAgent) return false
    if (dateFrom && r.created_at < dateFrom) return false
    if (dateTo   && r.created_at > dateTo + 'T23:59:59Z') return false
    return true
  })

  const pendingCount  = safeReturns.filter((r) => r.return_status === 'PENDING').length
  const allAgents     = [...(agents ?? []), ...(teamLeads ?? [])]
  const retTotalPages = Math.max(1, Math.ceil(filtered.length / RETURNS_PAGE_SIZE))
  const paginatedRet  = filtered.slice((retPage - 1) * RETURNS_PAGE_SIZE, retPage * RETURNS_PAGE_SIZE)

  async function handleApprove(id: string) {
    if (!profile) return
    setApproving(id)
    await approveReturn(id, profile)
    setApproving(null)
  }

  async function handleReject(id: string, note: string) {
    if (!profile) return
    await rejectReturn(id, profile, note)
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <Header title="Returns" />
      <div className="p-6 space-y-5">

        {/* DB error */}
        {dbError && (
          <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex items-start gap-3">
            <MdWarning className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              {missingTable ? (
                <>
                  <p className="text-sm font-semibold text-brand-text">Returns table not found in database</p>
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
              className="flex items-center gap-1 text-xs text-warning bg-warning/15 hover:bg-warning/25 px-3 py-1.5 rounded-lg flex-shrink-0">
              <MdRefresh className="w-4 h-4" /> Retry
            </button>
          </div>
        )}

        {/* Pending banner */}
        {pendingCount > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-3 flex items-center gap-3">
            <MdWarning className="w-5 h-5 text-yellow-500 flex-shrink-0" />
            <p className="text-sm font-medium text-yellow-800">
              {pendingCount} return request{pendingCount !== 1 ? 's' : ''} awaiting approval.
            </p>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white border border-brand-border rounded-xl p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-1">Status</label>
            <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value as FilterStatus); setRetPage(1) }}
              className="border border-brand-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="ALL">All</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
          {allAgents.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-1">Agent / TL</label>
              <select value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)}
                className="border border-brand-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">All</option>
                {allAgents.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-1">From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="border border-brand-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-1">To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="border border-brand-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
        </div>

        {/* Table */}
        <div className="bg-brand-surface rounded-card border border-brand-border overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-brand-bg border-b border-brand-border">
                  <tr>
                    {['Phone', 'Returned By', 'Reason', 'Status', 'Date', 'Actions'].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-brand-muted uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border">
                  {paginatedRet.map((ret) => {
                    // Safely read joined objects
                    const phone     = ret.phone     as Record<string, unknown> | null | undefined
                    const requester = ret.requester as Record<string, unknown> | null | undefined
                    const statusVal = String(ret.return_status ?? '')
                    const badgeVariant = STATUS_BADGE[statusVal] ?? 'gray'

                    return (
                      <tr key={ret.id} className="hover:bg-brand-bg transition-colors">
                        <td className="px-5 py-4">
                          <p className="font-medium text-brand-text">{safeStr(phone?.model)}</p>
                          <p className="text-xs font-mono text-brand-muted">
                            {phone?.imei ? `IMEI: ${phone.imei}` : `SN: ${safeStr(phone?.serial_number)}`}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-medium text-brand-text">{safeStr(requester?.full_name)}</p>
                          <p className="text-xs text-brand-muted capitalize">
                            {String(requester?.role ?? '').replace('_', ' ')}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-brand-text">{safeStr(ret.return_reason)}</p>
                          {ret.notes && (
                            <p className="text-xs text-brand-muted italic">"{ret.notes}"</p>
                          )}
                          {ret.rejection_note && (
                            <p className="text-xs text-red-600 mt-1">↳ {ret.rejection_note}</p>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <Badge variant={badgeVariant}>{statusVal || '—'}</Badge>
                        </td>
                        <td className="px-5 py-4 text-xs text-brand-muted whitespace-nowrap">
                          {ret.created_at ? new Date(ret.created_at).toLocaleDateString('en-NG', {
                            day: 'numeric', month: 'short', year: 'numeric',
                          }) : '—'}
                        </td>
                        <td className="px-5 py-4">
                          {statusVal === 'PENDING' && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleApprove(ret.id)}
                                disabled={approving === ret.id}
                                className="flex items-center gap-1 px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                              >
                                <MdCheckCircle className="w-3.5 h-3.5" />
                                {approving === ret.id ? '…' : 'Approve'}
                              </button>
                              <button
                                onClick={() => setRejectingId(ret.id)}
                                className="flex items-center gap-1 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-medium transition-colors"
                              >
                                <MdCancel className="w-3.5 h-3.5" /> Reject
                              </button>
                            </div>
                          )}
                          {statusVal === 'APPROVED' && (
                            <span className="text-xs text-green-600 font-medium">✓ Approved</span>
                          )}
                          {statusVal === 'REJECTED' && ret.resolved_at && (
                            <span className="text-xs text-brand-muted">
                              {new Date(ret.resolved_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}

                  {filtered.length === 0 && !loading && (
                    <tr>
                      <td colSpan={6} className="px-5 py-16 text-center text-brand-muted">
                        <MdInbox className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                        <p className="text-sm">
                          {dbError
                            ? 'Could not load returns — check database connection above.'
                            : 'No return requests found. When agents return phones, they appear here.'}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <Pagination
                page={retPage}
                totalPages={retTotalPages}
                totalCount={filtered.length}
                pageSize={RETURNS_PAGE_SIZE}
                onPageChange={setRetPage}
              />
            </div>
          )}
        </div>

      </div>

      {rejectingId && (
        <RejectModal
          onConfirm={(note) => handleReject(rejectingId, note)}
          onClose={() => setRejectingId(null)}
        />
      )}
    </div>
  )
}
