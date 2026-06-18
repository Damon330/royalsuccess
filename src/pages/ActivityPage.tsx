import { useState, useMemo } from 'react'
import { format, addDays, subDays, parseISO, isToday, isYesterday } from 'date-fns'
import { useAuth } from '../hooks/useAuth'
import { useActivityLog } from '../hooks/useActivityLog'
import { useProfiles } from '../hooks/useProfiles'
import ActivityFeed, { ActivityFiltersBar } from '../components/shared/ActivityFeed'
import Header from '../components/shared/Header'
import { downloadActivityPdf } from '../lib/activityPdf'
import toast from 'react-hot-toast'
import { MdDownload, MdChevronLeft, MdChevronRight } from 'react-icons/md'

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

  // Day-by-day pagination — start on today
  const initDate = useMemo(() => format(new Date(), 'yyyy-MM-dd'), [])
  const [selectedDate, setSelectedDate] = useState(initDate)

  const {
    entries, loading, loadingMore, hasMore, dbError,
    filters, updateFilters, fetchMore, refetch,
  } = useActivityLog({ agentId, dateFrom: initDate, dateTo: initDate })

  const { agents } = useProfiles()
  const showAgentFilter = profile?.role === 'admin' || profile?.role === 'team_lead'

  // PDF export state
  const now         = new Date()
  const [pdfMonth,  setPdfMonth]  = useState(now.getMonth() + 1)  // 1–12
  const [pdfYear,   setPdfYear]   = useState(now.getFullYear())
  const [exporting, setExporting] = useState(false)

  // ── Day navigation ──────────────────────────────────────────────────
  const parsedDate      = parseISO(selectedDate)
  const isSelectedToday = isToday(parsedDate)

  const dayLabel = isSelectedToday
    ? 'Today'
    : isYesterday(parsedDate)
      ? 'Yesterday'
      : format(parsedDate, 'EEE, d MMM')

  const daySubLabel = isSelectedToday
    ? format(parsedDate, 'EEEE, d MMMM yyyy')
    : null

  function goToDate(date: string) {
    setSelectedDate(date)
    updateFilters({ dateFrom: date, dateTo: date })
  }

  function goPrevDay() {
    goToDate(format(subDays(parsedDate, 1), 'yyyy-MM-dd'))
  }

  function goNextDay() {
    if (!isSelectedToday) goToDate(format(addDays(parsedDate, 1), 'yyyy-MM-dd'))
  }

  // ── PDF export ──────────────────────────────────────────────────────
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

        {/* Day navigator */}
        <div className="bg-white border border-brand-border rounded-xl px-4 py-3 flex items-center gap-3">
          <button
            onClick={goPrevDay}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-brand-muted border border-brand-border hover:border-primary hover:text-primary transition-colors"
          >
            <MdChevronLeft className="w-4 h-4" /> Prev
          </button>

          <div className="flex-1 text-center">
            <p className="text-sm font-semibold text-brand-text">{dayLabel}</p>
            {daySubLabel && (
              <p className="text-xs text-brand-muted mt-0.5">{daySubLabel}</p>
            )}
            {!isSelectedToday && (
              <p className="text-xs text-brand-muted mt-0.5">
                {format(parsedDate, 'EEEE, d MMMM yyyy')}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isSelectedToday && (
              <button
                onClick={() => goToDate(initDate)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-primary border border-primary/40 hover:bg-primary/5 transition-colors"
              >
                Today
              </button>
            )}
            <button
              onClick={goNextDay}
              disabled={isSelectedToday}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-brand-muted border border-brand-border hover:border-primary hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next <MdChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Event-type + agent filter (date handled by day nav above) */}
        <ActivityFiltersBar
          filters={filters}
          onUpdate={updateFilters}
          agents={showAgentFilter ? agents : []}
          showAgentFilter={showAgentFilter ?? false}
          hideDateFilters
        />

        <ActivityFeed
          entries={entries}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          dbError={dbError}
          onLoadMore={fetchMore}
          onRefetch={refetch}
          selectedDate={selectedDate}
          dayLabel={dayLabel}
        />
      </div>
    </div>
  )
}
