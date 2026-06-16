import { useEffect, useState } from 'react'
import Header from '../shared/Header'
import { supabase } from '../../lib/supabase'
import { withTimeout } from '../../lib/withTimeout'
import type { Phone } from '../../types'
import { MdTrendingUp, MdInventory2, MdWarning, MdRefresh } from 'react-icons/md'

interface ModelStat {
  model:    string
  sold:     number
  inField:  number
  inStock:  number
  sellRate: number
}

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
      // SECURITY DEFINER RPC — bypasses RLS, no per-row is_admin() evaluation.
      const { data, error } = await withTimeout(
        supabase.rpc('admin_get_phones'),
        15_000,
      )
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

  const maxSold = modelStats[0]?.sold ?? 1

  return (
    <div className="flex-1 overflow-y-auto">
      <Header title="Market Insights" />
      <div className="p-6 space-y-6">

        {dbError && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <MdWarning className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">Could not load insights</p>
              {dbErrorMsg && (
                <p className="text-xs font-mono text-amber-700 mt-0.5 break-all">{dbErrorMsg}</p>
              )}
            </div>
            <button onClick={fetchData}
              className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0">
              <MdRefresh className="w-4 h-4" /> Retry
            </button>
          </div>
        )}

        {/* ── Top Selling Models ── */}
        <div className="bg-white rounded-xl border border-brand-border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-brand-border flex items-center gap-2">
            <MdTrendingUp className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold text-brand-text">Top Selling Models</h2>
            <span className="ml-auto text-xs text-brand-muted bg-primary-pale px-2 py-0.5 rounded-full font-medium">
              Restock Insights
            </span>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-brand-border">
                  <tr>
                    {['#', 'Model', 'Units Sold', 'In Field', 'In Stock', 'Sell-Through', 'Restock?'].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-brand-muted uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border">
                  {modelStats.map((row, i) => {
                    const needsRestock = row.sold > 0 && row.inStock === 0
                    const lowStock     = row.sold > 0 && row.inStock > 0 && row.inStock <= 2
                    const barWidth     = maxSold > 0 ? Math.round((row.sold / maxSold) * 100) : 0
                    return (
                      <tr key={row.model} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-4 text-brand-muted text-xs font-medium">{i + 1}</td>
                        <td className="px-5 py-4 font-medium text-brand-text max-w-[220px]">
                          <span className="block truncate" title={row.model}>{row.model}</span>
                          <div className="mt-1.5 h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${barWidth}%` }} />
                          </div>
                        </td>
                        <td className="px-5 py-4 text-green-600 font-bold text-base">{row.sold}</td>
                        <td className="px-5 py-4 text-orange-500 font-medium">{row.inField}</td>
                        <td className="px-5 py-4">
                          <span className={`font-semibold ${row.inStock === 0 ? 'text-red-500' : row.inStock <= 2 ? 'text-amber-600' : 'text-brand-text'}`}>
                            {row.inStock}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-20 bg-gray-200 rounded-full h-2">
                              <div className="bg-green-500 rounded-full h-2 transition-all" style={{ width: `${row.sellRate}%` }} />
                            </div>
                            <span className="text-xs text-brand-muted">{row.sellRate}%</span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {needsRestock ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                              <MdInventory2 className="w-3 h-3" /> Restock Now
                            </span>
                          ) : lowStock ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                              Low Stock
                            </span>
                          ) : (
                            <span className="text-xs text-brand-muted">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {modelStats.length === 0 && !loading && (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-brand-muted">No phone data yet.</td>
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
