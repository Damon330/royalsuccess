import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { ReceiptPdfData } from '../../hooks/useSaleReceipt'

const C = {
  primary: '#0F4C35',
  text:    '#111827',
  muted:   '#6B7280',
  border:  '#E5E7EB',
  white:   '#FFFFFF',
}

const s = StyleSheet.create({
  page:        { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: C.text, backgroundColor: C.white },
  // Header
  hdrRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  bizName:     { fontSize: 22, fontFamily: 'Helvetica-Bold', color: C.primary },
  bizSub:      { fontSize: 9,  color: C.muted, marginTop: 2 },
  receiptTag:  { fontSize: 9,  color: C.muted, textAlign: 'right' },
  receiptNum:  { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.primary, textAlign: 'right', marginTop: 2 },
  divider:     { borderBottomWidth: 1, borderBottomColor: C.border, marginVertical: 10 },
  // Sections
  sectionTitle:{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.muted,
                 textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  row:         { flexDirection: 'row', marginBottom: 4 },
  label:       { width: 130, color: C.muted },
  value:       { flex: 1, fontFamily: 'Helvetica-Bold' },
  // Price box
  priceBox:    { backgroundColor: C.primary, borderRadius: 6, padding: 14, marginVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceLabel:  { color: C.white, fontSize: 10, opacity: 0.8 },
  priceValue:  { color: C.white, fontSize: 20, fontFamily: 'Helvetica-Bold' },
  payBadge:    { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  payText:     { color: C.white, fontSize: 9, fontFamily: 'Helvetica-Bold' },
  // Footer
  footer:      { marginTop: 'auto', paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
  footerText:  { fontSize: 8, color: C.muted, textAlign: 'center', marginBottom: 2 },
  footerNum:   { fontSize: 7,  color: C.border, textAlign: 'center', marginTop: 6 },
  section:     { marginBottom: 14 },
})

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value}</Text>
    </View>
  )
}

function fmt(n: number) {
  return '₦' + n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-NG', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
}

export default function ReceiptDocument({ data }: { data: ReceiptPdfData }) {
  return (
    <Document title={`Receipt ${data.receiptNumber}`} author="Royal Success">
      <Page size="A5" style={s.page}>

        {/* Header */}
        <View style={s.hdrRow}>
          <View>
            <Text style={s.bizName}>Royal Success</Text>
            <Text style={s.bizSub}>Lagos, Nigeria  •  hello@royalsuccess.ng</Text>
          </View>
          <View>
            <Text style={s.receiptTag}>SALES RECEIPT</Text>
            <Text style={s.receiptNum}>{data.receiptNumber}</Text>
          </View>
        </View>
        <View style={s.divider} />

        {/* Receipt meta */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Receipt Details</Text>
          <Field label="Date"    value={fmtDate(data.generatedAt)} />
          <Field label="Time"    value={fmtTime(data.generatedAt)} />
          <Field label="Agent"   value={`${data.agentName}  (ID: ${data.agentId})`} />
        </View>

        {/* Customer */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Customer</Text>
          <Field label="Name"  value={data.buyerName} />
          <Field label="Phone" value={data.buyerPhone} />
        </View>

        {/* Product */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Product</Text>
          <Field label="Model"         value={data.phoneModel} />
          <Field label="IMEI"          value={data.imei} />
          <Field label="Barcode"       value={data.barcode !== data.imei ? data.barcode : ''} />
        </View>

        {/* Price box */}
        <View style={s.priceBox}>
          <View>
            <Text style={s.priceLabel}>Sale Price</Text>
            <Text style={s.priceValue}>{fmt(data.sellingPrice)}</Text>
          </View>
          <View style={s.payBadge}>
            <Text style={s.payText}>{data.paymentMethod}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>Thank you for your purchase.</Text>
          <Text style={s.footerText}>Goods sold are not returnable except on valid grounds.</Text>
          <View style={s.divider} />
          <Text style={s.footerNum}>{data.receiptNumber}</Text>
        </View>

      </Page>
    </Document>
  )
}
