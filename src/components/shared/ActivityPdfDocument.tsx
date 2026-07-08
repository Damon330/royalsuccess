import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { ActivityLogEntry, ActivityActionType } from '../../types'

const C = {
  primary:  '#0F4C35',
  text:     '#111827',
  muted:    '#6B7280',
  border:   '#E5E7EB',
  bg:       '#F9FAFB',
  white:    '#FFFFFF',
  green:    '#16A34A',
  blue:     '#2563EB',
  amber:    '#D97706',
  red:      '#DC2626',
}

const s = StyleSheet.create({
  page:        { padding: 36, fontFamily: 'Helvetica', fontSize: 9, color: C.text, backgroundColor: C.white },

  // Header
  hdr:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  bizName:     { fontSize: 18, fontFamily: 'Helvetica-Bold', color: C.primary },
  bizSub:      { fontSize: 8, color: C.muted, marginTop: 2 },
  rptTitle:    { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.primary, textAlign: 'right' },
  rptMeta:     { fontSize: 8, color: C.muted, textAlign: 'right', marginTop: 2 },
  divider:     { borderBottomWidth: 1, borderBottomColor: C.border, marginVertical: 8 },

  // Summary row
  summaryRow:  { flexDirection: 'row', gap: 12, marginBottom: 10 },
  summaryBox:  { flex: 1, backgroundColor: C.bg, borderRadius: 4, padding: 8, borderWidth: 1, borderColor: C.border },
  summaryVal:  { fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.primary },
  summaryLbl:  { fontSize: 7, color: C.muted, marginTop: 2 },

  // Table
  thead:       { flexDirection: 'row', backgroundColor: C.primary, borderRadius: 3, paddingVertical: 5, paddingHorizontal: 6 },
  theadCell:   { fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.white, textTransform: 'uppercase' },
  trow:        { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  trowAlt:     { backgroundColor: C.bg },
  tcell:       { fontSize: 8, color: C.text },
  tcellMuted:  { fontSize: 7.5, color: C.muted },

  // Column widths
  colDate:     { width: '16%' },
  colAction:   { width: '18%' },
  colDesc:     { width: '44%' },
  colActor:    { width: '22%' },

  // Footer
  footer:      { position: 'absolute', bottom: 24, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: C.border, paddingTop: 6 },
  footerTxt:   { fontSize: 7, color: C.muted },
})

const ACTION_LABELS: Record<ActivityActionType, string> = {
  PHONE_ASSIGNED:    'Phone Assigned',
  PHONE_UNASSIGNED:  'Phone Unassigned',
  SALE_RECORDED:     'Sale Recorded',
  SALE_RETURNED:     'Sale Returned',
  STOCK_ADDED:       'Stock Added',
  STOCK_ADJUSTED:    'Stock Adjusted',
  USER_CREATED:      'User Created',
  USER_DEACTIVATED:  'User Deactivated',
  RECEIPT_GENERATED: 'Receipt Generated',
  SCAN_EVENT:        'Scan Event',
}

function describeEntry(entry: ActivityLogEntry): string {
  const m = (entry.meta ?? {}) as Record<string, unknown>
  const label = entry.entity_label ?? ''
  const model = (m.model as string | undefined) ?? label.split(' /')[0].trim()

  switch (entry.action_type) {
    case 'STOCK_ADDED': {
      const count = Number(m.count ?? 1)
      return count > 1 ? `Added ${count} phones to inventory` : `Added ${model || 'phone'} to inventory`
    }
    case 'PHONE_ASSIGNED': {
      const count    = Number(m.count ?? 1)
      const assignee = m.assignee as string | undefined
      return `Assigned ${count} phone${count !== 1 ? 's' : ''}${assignee ? ` to ${assignee}` : ''}`
    }
    case 'SALE_RECORDED': {
      const price   = m.price ? `₦${Number(m.price).toLocaleString('en-NG')}` : ''
      const receipt = m.receipt_number as string | undefined
      return `Sold ${model || 'phone'}${price ? ` · ${price}` : ''}${receipt ? ` · ${receipt}` : ''}`
    }
    case 'SALE_RETURNED':     return `Return: ${model || 'phone'}${m.reason ? ` — ${m.reason}` : ''}`
    case 'PHONE_UNASSIGNED':  return `${model || 'Phone'} back in stock`
    case 'RECEIPT_GENERATED': return `Receipt ${label ? `#${label}` : 'generated'}`
    case 'USER_CREATED':      return `New user: ${label || entry.actor_name}`
    case 'USER_DEACTIVATED':  return `User deactivated: ${label}`
    default:                  return label || entry.action_type
  }
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true })
  return { date, time }
}

interface Props {
  entries:     ActivityLogEntry[]
  month:       string
  year:        number
  reportTitle: string
}

export default function ActivityPdfDocument({ entries, month, year, reportTitle }: Props) {
  const generatedAt = new Date().toLocaleString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })

  const salesCount  = entries.filter((e) => e.action_type === 'SALE_RECORDED').length
  const stockAdded  = entries.filter((e) => e.action_type === 'STOCK_ADDED').length
  const assignments = entries.filter((e) => e.action_type === 'PHONE_ASSIGNED').length

  return (
    <Document title={`${reportTitle} — ${month} ${year}`} author="Royal Success">
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={s.hdr}>
          <View>
            <Text style={s.bizName}>Royal Success</Text>
            <Text style={s.bizSub}>Phone Inventory & Field Sales</Text>
          </View>
          <View>
            <Text style={s.rptTitle}>{reportTitle}</Text>
            <Text style={s.rptMeta}>{month} {year}</Text>
            <Text style={s.rptMeta}>Generated: {generatedAt}</Text>
          </View>
        </View>
        <View style={s.divider} />

        {/* Summary */}
        <View style={s.summaryRow}>
          <View style={s.summaryBox}>
            <Text style={s.summaryVal}>{entries.length}</Text>
            <Text style={s.summaryLbl}>Total Events</Text>
          </View>
          <View style={s.summaryBox}>
            <Text style={[s.summaryVal, { color: C.green }]}>{salesCount}</Text>
            <Text style={s.summaryLbl}>Sales</Text>
          </View>
          <View style={s.summaryBox}>
            <Text style={[s.summaryVal, { color: C.blue }]}>{assignments}</Text>
            <Text style={s.summaryLbl}>Assignments</Text>
          </View>
          <View style={s.summaryBox}>
            <Text style={[s.summaryVal, { color: C.amber }]}>{stockAdded}</Text>
            <Text style={s.summaryLbl}>Stock Added</Text>
          </View>
        </View>

        {/* Table header */}
        <View style={s.thead}>
          <Text style={[s.theadCell, s.colDate]}>Date / Time</Text>
          <Text style={[s.theadCell, s.colAction]}>Action</Text>
          <Text style={[s.theadCell, s.colDesc]}>Description</Text>
          <Text style={[s.theadCell, s.colActor]}>By</Text>
        </View>

        {/* Rows */}
        {entries.map((entry, i) => {
          const { date, time } = formatDate(entry.created_at)
          const desc = describeEntry(entry)
          const role = entry.role === 'team_lead' ? 'Team Lead' : entry.role === 'admin' ? 'Admin' : 'Agent'
          return (
            <View key={entry.id} style={[s.trow, i % 2 !== 0 ? s.trowAlt : {}]} wrap={false}>
              <View style={s.colDate}>
                <Text style={s.tcell}>{date}</Text>
                <Text style={s.tcellMuted}>{time}</Text>
              </View>
              <Text style={[s.tcell, s.colAction]}>{ACTION_LABELS[entry.action_type] ?? entry.action_type}</Text>
              <Text style={[s.tcell, s.colDesc]}>{desc}</Text>
              <View style={s.colActor}>
                <Text style={s.tcell}>{entry.actor_name}</Text>
                <Text style={s.tcellMuted}>{role}</Text>
              </View>
            </View>
          )
        })}

        {entries.length === 0 && (
          <View style={{ padding: 24, alignItems: 'center' }}>
            <Text style={{ fontSize: 9, color: C.muted }}>No activity recorded for this period.</Text>
          </View>
        )}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerTxt}>Royal Success · Confidential</Text>
          <Text style={s.footerTxt} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>

      </Page>
    </Document>
  )
}
