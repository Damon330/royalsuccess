import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useActivityLog } from '../hooks/useActivityLog'
import { useProfiles } from '../hooks/useProfiles'
import ActivityFeed, { ActivityFiltersBar } from '../components/shared/ActivityFeed'
import Header from '../components/shared/Header'
import { downloadActivityPdf } from '../lib/activityPdf'
import toast from 'react-hot-toast'
import { MdDownload } from 'react-icons/md'

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

function getYearOptions() {
  const current = new Date().getFullYear()
  return [current, current - 1, current - 2]
}

export default function ActivityPage() {
  const { profile } = useAuth()

  // Agents only ever see their own activity — pass their ID as a fixed filter
  // so both the DB query and the Realtime subscription are scoped correctly.
  const agentId = profile?.role === 'agent' ? profile.id : undefined

  const {
    entries, loading, loadingMore, hasMore, dbError,
    filters, updateFilters, fetchMore, refetch,
  } = useActivityLog({ agentId })

  const { agents } = useProfiles()

  const showAgentFilter = profile?.role === 'admin' || profile?.role === 'team_lead'

  // PDF export state
  const now          = new Date()
  const [pdfMonth,   setPdfMonth]   = useState(now.getMonth() + 1)   // 1–12
  const [pdfYear,    setPdfYear]    = useState(now.getFullYear())
  const [exporting,  setExporting]  = useState(false)

  async function handleExport() {
    setExporting(true)
    try {
      const title = profile?.role === 'agent'
        ? `My Activity Report — ${profile.full_name}`
        : 'Activity Report'

      await downloadActivityPdf(pdfYear, pdfMonth, agentId, title)
      toast.success(`PDF downloaded for ${MONTHS[pdfMonth - 1]} ${pdfYear}`)
    } catch {
      toast.error('Failed to generate PDF. Try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <Header title="Activity" />
      <div className="p-6 space-y-5 max-w-3xl">

        {/* Export bar */}
        <div className="bg-white border border-brand-border rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-brand-text">Download monthly report:</span>
          <select
            value={pdfMonth}
            onChange={(e) => setPdfMonth(Number(e.target.value))}
            className="border border-brand-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={pdfYear}
            onChange={(e) => setPdfYear(Number(e.target.value))}
            className="border border-brand-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {getYearOptions().map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 bg-primary hover:bg-primary-light text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <MdDownload className="w-4 h-4" />
            {exporting ? 'Generating…' : 'Download PDF'}
          </button>
        </div>

        <ActivityFiltersBar
          filters={filters}
          onUpdate={updateFilters}
          agents={showAgentFilter ? agents : []}
          showAgentFilter={showAgentFilter ?? false}
        />

        <ActivityFeed
          entries={entries}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          dbError={dbError}
          onLoadMore={fetchMore}
          onRefetch={refetch}
        />
      </div>
    </div>
  )
}
