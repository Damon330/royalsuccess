import { useEffect, useRef } from 'react'
import { format, isToday, isYesterday } from 'date-fns'
import type { ActivityLogEntry, ActivityActionType, ActivityFilters } from '../../hooks/useActivityLog'
import type { Profile } from '../../types'
import Spinner from './Spinner'
import {
  TbPhoneOutgoing, TbPhoneOff, TbShoppingCart, TbArrowBackUp,
  TbPackageImport, TbAdjustments, TbUserPlus, TbUserOff,
  TbReceipt, TbScan,
} from 'react-icons/tb'
import { MdRefresh } from 'react-icons/md'

// ── Config per action type ─────────────────────────────────────
const ACTION_CONFIG: Record<ActivityActionType, {
  icon:  React.ElementType
  dot:   string
  bg:    string
  label: string
}> = {
  PHONE_ASSIGNED:    { icon: TbPhoneOutgoing, dot: 'bg-amber-400',  bg: 'bg-amber-50',  label: 'Phone Assigned'    },
  PHONE_UNASSIGNED:  { icon: TbPhoneOff,      dot: 'bg-orange-400', bg: 'bg-orange-50', label: 'Phone Unassigned'  },
  SALE_RECORDED:     { icon: TbShoppingCart,  dot: 'bg-green-500',  bg: 'bg-green-50',  label: 'Sale Recorded'     },
  SALE_RETURNED:     { icon: TbArrowBackUp,   dot: 'bg-red-500',    bg: 'bg-red-50',    label: 'Sale Returned'     },
  STOCK_ADDED:       { icon: TbPackageImport, dot: 'bg-blue-500',   bg: 'bg-blue-50',   label: 'Stock Added'       },
  STOCK_ADJUSTED:    { icon: TbAdjustments,   dot: 'bg-blue-400',   bg: 'bg-blue-50',   label: 'Stock Adjusted'    },
  USER_CREATED:      { icon: TbUserPlus,      dot: 'bg-primary',    bg: 'bg-primary-pale', label: 'User Created'   },
  USER_DEACTIVATED:  { icon: TbUserOff,       dot: 'bg-gray-400',   bg: 'bg-gray-50',   label: 'User Deactivated'  },
  RECEIPT_GENERATED: { icon: TbReceipt,       dot: 'bg-primary',    bg: 'bg-primary-pale', label: 'Receipt Generated' },
  SCAN_EVENT:        { icon: TbScan,          dot: 'bg-gray-400',   bg: 'bg-gray-50',   label: 'Scan Event'        },
}

const ROLE_BADGE: Record<string, string> = {
  admin:     'bg-primary text-white',
  team_lead: 'bg-amber-100 text-amber-800',
  agent:     'bg-blue-100 text-blue-800',
}

function roleLabel(role: string): string {
  if (role === 'team_lead') return 'Team Lead'
  if (role === 'admin')     return 'Admin'
  return 'Agent'
}

function formatTime(iso: string): { relative: string; absolute: string } {
  const d = new Date(iso)
  const absolute = format(d, 'dd MMM yyyy, h:mm a')
  if (isToday(d))     return { relative: `Today ${format(d, 'h:mm a')}`,     absolute }
  if (isYesterday(d)) return { relative: `Yesterday ${format(d, 'h:mm a')}`, absolute }
  return { relative: format(d, 'dd MMM, h:mm a'), absolute }
}

// ── Human-readable headline + detail per action type ──────────
interface EntrySummary {
  headline: string
  detail:   string | null
  id_line:  string | null   // phone/receipt identifier shown in mono
}

function summarise(entry: ActivityLogEntry): EntrySummary {
  const m     = (entry.meta ?? {}) as Record<string, unknown>
  const label = entry.entity_label ?? ''

  // Helper to pull model from label or meta
  const modelFromLabel = label.split(' /')[0].trim()
  const model = (m.model as string | undefined) ?? modelFromLabel

  switch (entry.action_type) {
    case 'STOCK_ADDED': {
      const count = Number(m.count ?? 1)
      return {
        headline: count > 1
          ? `Added ${count} phones to inventory`
          : `Added ${model || 'a phone'} to inventory`,
        detail:  m.models ? `Models: ${m.models}` : null,
        id_line: m.imei    ? `IMEI: ${m.imei}`
               : m.barcode ? `Barcode: ${m.barcode}`
               : m.serial  ? `SN: ${m.serial}`
               : null,
      }
    }

    case 'PHONE_ASSIGNED': {
      const count    = Number(m.count ?? 1)
      const assignee = (m.assignee as string | undefined) ?? ''
      const models   = m.models as string | undefined
      return {
        headline: `Assigned ${count} phone${count !== 1 ? 's' : ''}${assignee ? ` to ${assignee}` : ''}`,
        detail:   models ? `Models: ${models}` : null,
        id_line:  null,
      }
    }

    case 'SALE_RECORDED': {
      const price   = m.price   ? `₦${Number(m.price).toLocaleString('en-NG')}` : null
      const payment = m.payment as string | null
      const receipt = m.receipt_number as string | null
      const parts   = [price, payment].filter(Boolean)
      return {
        headline: `Sold ${model || 'a phone'}`,
        detail:   parts.length ? parts.join(' · ') : null,
        id_line:  receipt ? `Receipt: ${receipt}` : (m.imei ? `IMEI: ${m.imei}` : null),
      }
    }

    case 'SALE_RETURNED': {
      const reason = (m.reason as string | undefined) ?? ''
      const status = (m.status as string | undefined) ?? ''
      return {
        headline: `Return request for ${model || 'a phone'}`,
        detail:   reason ? `Reason: ${reason}${status ? ` · ${status}` : ''}` : null,
        id_line:  null,
      }
    }

    case 'PHONE_UNASSIGNED': {
      const isReturnApproved = m.action === 'RETURN_APPROVED'
      return {
        headline: `${model || 'Phone'} back in stock`,
        detail:   isReturnApproved ? 'Return approved' : null,
        id_line:  null,
      }
    }

    case 'RECEIPT_GENERATED': {
      return {
        headline: `Receipt generated`,
        detail:   null,
        id_line:  label ? `#${label}` : null,
      }
    }

    case 'USER_CREATED': {
      return { headline: `New user account created`, detail: null, id_line: label || null }
    }

    case 'USER_DEACTIVATED': {
      return { headline: `User account deactivated`, detail: null, id_line: label || null }
    }

    case 'STOCK_ADJUSTED': {
      return { headline: `Stock adjusted`, detail: label || null, id_line: null }
    }

    default: {
      return { headline: label || ACTION_CONFIG.SCAN_EVENT.label, detail: null, id_line: null }
    }
  }
}

// ── Filters bar ───────────────────────────────────────────────
interface FiltersBarProps {
  filters:         ActivityFilters
  onUpdate:        (patch: Partial<ActivityFilters>) => void
  agents?:         Profile[]
  showAgentFilter: boolean
}

const ALL_ACTION_TYPES = Object.keys(ACTION_CONFIG) as ActivityActionType[]

export function ActivityFiltersBar({ filters, onUpdate, agents = [], showAgentFilter }: FiltersBarProps) {
  function toggleAction(a: ActivityActionType) {
    const next = filters.actionTypes.includes(a)
      ? filters.actionTypes.filter((x) => x !== a)
      : [...filters.actionTypes, a]
    onUpdate({ actionTypes: next })
  }

  return (
    <div className="bg-white border border-brand-border rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-1">From</label>
          <input
            type="date"
            value={filters.dateFrom ?? ''}
            onChange={(e) => onUpdate({ dateFrom: e.target.value })}
            className="border border-brand-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-1">To</label>
          <input
            type="date"
            value={filters.dateTo ?? ''}
            onChange={(e) => onUpdate({ dateTo: e.target.value })}
            className="border border-brand-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        {showAgentFilter && agents.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-1">Agent / TL</label>
            <select
              value={filters.agentId ?? ''}
              onChange={(e) => onUpdate({ agentId: e.target.value })}
              className="border border-brand-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">All</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.full_name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-brand-muted uppercase tracking-wide mb-2">Filter by event</p>
        <div className="flex flex-wrap gap-2">
          {ALL_ACTION_TYPES.map((a) => {
            const cfg    = ACTION_CONFIG[a]
            const active = filters.actionTypes.includes(a)
            return (
              <button
                key={a}
                onClick={() => toggleAction(a)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  active
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-brand-muted border-brand-border hover:border-primary hover:text-primary'
                }`}
              >
                <cfg.icon className="w-3.5 h-3.5" />
                {cfg.label}
              </button>
            )
          })}
          {filters.actionTypes.length > 0 && (
            <button
              onClick={() => onUpdate({ actionTypes: [] })}
              className="px-2.5 py-1 rounded-full text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Feed ──────────────────────────────────────────────────────
interface FeedProps {
  entries:     ActivityLogEntry[]
  loading:     boolean
  loadingMore: boolean
  hasMore:     boolean
  dbError:     boolean
  onLoadMore:  () => void
  onRefetch:   () => void
}

export default function ActivityFeed({
  entries, loading, loadingMore, hasMore, dbError, onLoadMore, onRefetch,
}: FeedProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!sentinelRef.current) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting && hasMore && !loadingMore) onLoadMore() },
      { threshold: 0.1 },
    )
    obs.observe(sentinelRef.current)
    return () => obs.disconnect()
  }, [hasMore, loadingMore, onLoadMore])

  if (loading) {
    return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
  }

  if (dbError) {
    return (
      <div className="text-center py-12 text-brand-muted space-y-3">
        <p className="text-sm">Could not load activity log.</p>
        <button
          onClick={onRefetch}
          className="flex items-center gap-1.5 mx-auto text-xs font-medium text-primary hover:underline"
        >
          <MdRefresh className="w-4 h-4" /> Retry
        </button>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-16 text-brand-muted">
        <TbScan className="w-10 h-10 mx-auto mb-2 text-gray-300" />
        <p className="text-sm font-medium">No activity yet.</p>
        <p className="text-xs mt-1">Events will appear here as phones are added, assigned, and sold.</p>
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Vertical timeline line */}
      <div className="absolute left-[19px] top-0 bottom-0 w-px bg-brand-border" aria-hidden />

      <div className="space-y-0">
        {entries.map((entry, idx) => {
          const cfg    = ACTION_CONFIG[entry.action_type] ?? ACTION_CONFIG.SCAN_EVENT
          const Icon   = cfg.icon
          const time   = formatTime(entry.created_at)
          const sum    = summarise(entry)
          const isLast = idx === entries.length - 1

          return (
            <div key={entry.id} className={`relative flex gap-4 ${isLast ? '' : 'pb-5'}`}>
              {/* Timeline dot */}
              <div className="relative z-10 flex-shrink-0 w-10 h-10 rounded-full bg-white border-2 border-brand-border flex items-center justify-center">
                <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
              </div>

              {/* Card */}
              <div className="flex-1 min-w-0">
                <div className={`rounded-xl border border-brand-border bg-white px-4 py-3 shadow-sm`}>

                  {/* Header row: icon + actor + role badge + time */}
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md ${cfg.bg} flex-shrink-0`}>
                        <Icon className={`w-3.5 h-3.5`} style={{ color: 'inherit' }} />
                      </span>
                      <span className="text-sm font-semibold text-brand-text">
                        {entry.actor_name}
                      </span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ROLE_BADGE[entry.role] ?? 'bg-gray-100 text-gray-600'}`}>
                        {roleLabel(entry.role)}
                      </span>
                    </div>
                    <time
                      title={time.absolute}
                      className="text-xs text-brand-muted whitespace-nowrap flex-shrink-0 mt-0.5 cursor-default"
                    >
                      {time.relative}
                    </time>
                  </div>

                  {/* Headline */}
                  <p className="text-sm text-brand-text font-medium">
                    {sum.headline}
                  </p>

                  {/* Detail line (price, reason, models…) */}
                  {sum.detail && (
                    <p className="text-xs text-brand-muted mt-0.5">
                      {sum.detail}
                    </p>
                  )}

                  {/* Identifier line (IMEI, SN, receipt#) */}
                  {sum.id_line && (
                    <p className="text-xs font-mono text-brand-muted mt-0.5">
                      {sum.id_line}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div ref={sentinelRef} className="h-4" />

      {loadingMore && (
        <div className="flex justify-center py-4"><Spinner size="sm" /></div>
      )}

      {!hasMore && entries.length > 0 && (
        <p className="text-center text-xs text-brand-muted py-4">
          All {entries.length} event{entries.length !== 1 ? 's' : ''} loaded.
        </p>
      )}
    </div>
  )
}
