import { useEffect, useState } from 'react'
import Header from '../shared/Header'
import { supabase } from '../../lib/supabase'
import { withTimeout } from '../../lib/withTimeout'
import type { Phone } from '../../types'
import {
  MdTrendingUp, MdInventory2, MdWarning, MdRefresh,
  MdCheckCircle, MdBarChart, MdDevices, MdSell,
} from 'react-icons/md'

interface ModelStat {
  model:    string
  sold:     number
  inField:  number
  inStock:  number
  sellRate: number
}

// ── Summary KPI card ──────────────────────────────────────────────────────────
function KpiCard({
  label, value, icon: Icon, valueClass = 'text-brand-text',
}: {
  label:       string
  value:       number
  icon:        React.ElementType
  valueClass?: string
}) {
  return (
    <div className="bg-brand-surface border border-brand-border rounded-card p-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div>
        <p className="text-xs font-semibold text-brand-muted uppercase tracking-wide">{label}</p>
        <p className={`text-2xl font-bold mt-0.5 ${valueClass}`}>{value}</p>
      </div>
    </div>
  )
}

// ── Sell-through bar — colour shifts green → amber → red ──────────────────────
function SellRateBar({ rate }: { rate: number }) {
  const fill =
    rate >= 70 ? 'bg-positive' :
    rate >= 40 ? 'bg-warning'  : 'bg-negative'

  return (
    <div className="flex items-center gap-2.5">
      <div className="w-20 bg-brand-border rounded-full h-2 overflow-hidden flex-shrink-0">
        <div
          className={`h-full ${fill} rounded-full transition-all duration-500`}
          style={{ width: `${rate}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-brand-muted w-7 text-right">{rate}%</span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminInsights() {
  const [modelStats, setModelStats] = useState<ModelStat[]>([])
  const [loading,    setLoading]    = useState(true)
  const [dbError,    setDbError]    = useState(false)
  const [dbErrorMsg, setDbErrorMsg] = useState<string | null>(null)

  async function fetchData() {
    setLoading(true)
    setDbError(false)
    setDbErrorMsg(null)
    try {
      const { data, error } = await withTimeout(supabase.rpc('admin_get_phones'), 15_000)
      if (error) throw error

      const modelMap = new Map<string, { sold: number; inField: number; inStock: number }>()
      for (const ph of (data ?? []) as Pick<Phone, 'model' | 'status'>[]) {
        if (!modelMap.has(ph.model)) modelMap.set(ph.model, { sold: 0, inField: 0, inStock: 0 })
        const entry = modelMap.get(ph.model)!
        if      (ph.status === 'sold')     entry.sold++
        else if (ph.status === 'assigned') entry.inField++
        else if (ph.status === 'in_stock') entry.inStock++
      }

      const stats: ModelStat[] = [...modelMap.entries()].map(([model, counts]) => {
        const total    = counts.sold + counts.inField + counts.inStock
        const sellRate = total > 0 ? Math.round((counts.sold / total) * 100) : 0
        return { model, ...counts, sellRate }
      })
      stats.sort((a, b) => b.sold - a.sold)
      setModelStats(stats)
    } catch (err) {
      const msg = err instanceof Error
        ? err.message
        : (err as { message?: string })?.message ?? JSON.stringify(err)
      setDbErrorMsg(msg)
      setDbError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const maxSold      = modelStats[0]?.sold ?? 1
  const totalSold    = modelStats.reduce((s, r) => s + r.sold,    0)
  const totalInField = modelStats.reduce((s, r) => s + r.inField, 0)
  const totalInStock = modelStats.reduce((s, r) => s + r.inStock, 0)

  return (
    <div className="flex-1 overflow-y-auto bg-brand-bg">
      <Header title="Market Insights" />

      <div className="p-6 space-y-6">

        {/* Error banner */}
        {dbError && (
          <div className="bg-warning/10 border border-warning/30 rounded-card p-4 flex items-start gap-3">
            <MdWarning className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-brand-text">Could not load insights</p>
              {dbErrorMsg && (
                <p className="text-xs font-mono text-brand-muted mt-0.5 break-all">{dbErrorMsg}</p>
              )}
            </div>
            <button
              onClick={fetchData}
              className="flex items-center gap-1 text-xs font-medium text-warning bg-warning/15 hover:bg-warning/25 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
            >
              <MdRefresh className="w-4 h-4" /> Retry
            </button>
          </div>
        )}

        {/* KPI summary row */}
        {!loading && !dbError && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Models Tracked" value={modelStats.length} icon={MdDevices}    />
            <KpiCard label="Total Sold"     value={totalSold}         icon={MdSell}       valueClass="text-positive" />
            <KpiCard label="In Field"       value={totalInField}      icon={MdBarChart}   valueClass="text-warning"  />
            <KpiCard label="In Stock"       value={totalInStock}      icon={MdInventory2} valueClass="text-primary"  />
          </div>
        )}

        {/* Top Selling Models table */}
        <div className="bg-brand-surface border border-brand-border rounded-card overflow-hidden">

          {/* Card header */}
          <div className="px-6 py-4 border-b border-brand-border flex items-center gap-2.5">
            <MdTrendingUp className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold text-brand-text">Top Selling Models</h2>
            <span className="ml-auto text-xs font-semibold text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
              Restock Insights
            </span>
          </div>

          {/* Loading state */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-brand-muted">Loading phone data…</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">

                {/* Column headers */}
                <thead>
                  <tr className="bg-brand-bg border-b border-brand-border">
                    {['#', 'Model', 'Units Sold', 'In Field', 'In Stock', 'Sell-Through', 'Restock?'].map((h) => (
                      <th
                        key={h}
                        className="px-5 py-3 text-left text-xs font-semibold text-brand-muted uppercase tracking-wide whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-brand-border">
                  {modelStats.map((row, i) => {
                    const needsRestock = row.sold > 0 && row.inStock === 0
                    const lowStock     = row.sold > 0 && row.inStock > 0 && row.inStock <= 2
                    const hasActivity  = row.sold > 0
                    const barPct       = maxSold > 0 ? Math.round((row.sold / maxSold) * 100) : 0

                    return (
                      <tr
                        key={row.model}
                        className="hover:bg-brand-bg transition-colors group"
                      >
                        {/* Rank */}
                        <td className="px-5 py-4 w-10">
                          <span className={`text-xs font-bold tabular-nums ${
                            i === 0 ? 'text-primary' :
                            i === 1 ? 'text-brand-muted' :
                            i === 2 ? 'text-warning/80' :
                            'text-brand-label'
                          }`}>
                            {i + 1}
                          </span>
                        </td>

                        {/* Model + relative bar */}
                        <td className="px-5 py-4 font-medium text-brand-text max-w-[220px]">
                          <span className="block truncate" title={row.model}>
                            {row.model}
                          </span>
                          <div className="mt-1.5 h-1.5 w-full bg-brand-border rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-primary rounded-full transition-all duration-700"
                              style={{ width: `${barPct}%` }}
                            />
                          </div>
                        </td>

                        {/* Units sold */}
                        <td className="px-5 py-4 tabular-nums">
                          <span className={`font-bold text-base ${row.sold > 0 ? 'text-positive' : 'text-brand-label'}`}>
                            {row.sold}
                          </span>
                        </td>

                        {/* In field */}
                        <td className="px-5 py-4 tabular-nums">
                          <span className={`font-semibold ${row.inField > 0 ? 'text-warning' : 'text-brand-label'}`}>
                            {row.inField}
                          </span>
                        </td>

                        {/* In stock */}
                        <td className="px-5 py-4 tabular-nums">
                          <span className={`font-semibold ${
                            row.inStock === 0 && hasActivity ? 'text-negative' :
                            row.inStock <= 2  && hasActivity ? 'text-warning'  :
                            row.inStock > 0                  ? 'text-brand-text':
                            'text-brand-label'
                          }`}>
                            {row.inStock}
                          </span>
                        </td>

                        {/* Sell-through rate */}
                        <td className="px-5 py-4">
                          <SellRateBar rate={row.sellRate} />
                        </td>

                        {/* Restock badge */}
                        <td className="px-5 py-4">
                          {needsRestock ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-negative/15 text-negative border border-negative/25">
                              <MdInventory2 className="w-3 h-3" /> Restock Now
                            </span>
                          ) : lowStock ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-warning/15 text-warning border border-warning/25">
                              Low Stock
                            </span>
                          ) : hasActivity ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-positive/15 text-positive border border-positive/25">
                              <MdCheckCircle className="w-3 h-3" /> OK
                            </span>
                          ) : (
                            <span className="text-xs text-brand-label">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}

                  {modelStats.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-16 text-center">
                        <MdDevices className="w-10 h-10 text-brand-border mx-auto mb-2" />
                        <p className="text-sm font-medium text-brand-muted">No phone data yet.</p>
                        <p className="text-xs text-brand-label mt-1">Add phones to inventory to see model performance.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
