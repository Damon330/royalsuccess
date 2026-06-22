import { createElement } from 'react'
import { supabase } from './supabase'
import type { ActivityLogEntry } from '../types'

export async function downloadActivityPdf(
  year:        number,
  month:       number,   // 1–12
  agentId?:    string,
  reportTitle = 'Activity Report',
) {
  const from = new Date(year, month - 1, 1).toISOString()
  const to   = new Date(year, month,     0, 23, 59, 59, 999).toISOString()

  let q = supabase
    .from('activity_log')
    .select('*')
    .gte('created_at', from)
    .lte('created_at', to)
    .order('created_at', { ascending: false })
    .limit(2000)

  if (agentId) q = q.eq('agent_id', agentId)

  const { data, error } = await q
  if (error) throw error

  const entries    = (data ?? []) as ActivityLogEntry[]
  const monthName  = new Date(year, month - 1).toLocaleString('en', { month: 'long' })
  const fileName   = `activity-${monthName.toLowerCase()}-${year}.pdf`

  const [{ pdf }, { default: ActivityPdfDocument }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('../components/shared/ActivityPdfDocument'),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = createElement(ActivityPdfDocument as any, { entries, month: monthName, year, reportTitle }) as any
  const blob = await pdf(element).toBlob()

  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}
