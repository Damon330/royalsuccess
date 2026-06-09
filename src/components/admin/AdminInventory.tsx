import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import Header from '../shared/Header'
import Button from '../shared/Button'
import Badge from '../shared/Badge'
import Modal from '../shared/Modal'
import ScannerModal from '../shared/ScannerModal'
import Pagination from '../shared/Pagination'
import { usePhones } from '../../hooks/usePhones'
import { useProfiles } from '../../hooks/useProfiles'
import { useAuth } from '../../hooks/useAuth'
import { useBarcodeScan } from '../../hooks/useBarcodeScan'
import { lookupByIMEI } from '../../lib/imeiLookup'
import Spinner from '../shared/Spinner'
import toast from 'react-hot-toast'

const INV_PAGE_SIZE = 25
import {
  MdAdd, MdQrCode2, MdWarning, MdRefresh, MdUploadFile,
  MdDownload, MdCheckCircle, MdQrCodeScanner, MdCameraAlt,
  MdWifi, MdErrorOutline,
} from 'react-icons/md'
import type { Phone, PhoneStatus } from '../../types'

const STATUS_VARIANT: Record<PhoneStatus, 'green' | 'blue' | 'gray' | 'yellow' | 'red'> = {
  in_stock: 'green', assigned: 'blue', sold: 'gray', returned: 'yellow', damaged: 'red',
}
const STATUS_LABEL: Record<PhoneStatus, string> = {
  in_stock: 'In Stock', assigned: 'Assigned', sold: 'Sold', returned: 'Returned', damaged: 'Damaged',
}

type AddMode    = 'single' | 'bulk' | 'excel' | 'scan'
type ScanCamTab = 'hardware' | 'camera'
type ScanStep   = 'scanning' | 'confirm'

interface ExcelRow { model: string; serial_number: string; barcode?: string; imei?: string }

function ScanResultBanner({ phone, onClose }: { phone: Phone; onClose: () => void }) {
  return (
    <div className="bg-primary-pale border border-primary/20 rounded-xl p-4 flex items-start gap-4">
      <MdQrCode2 className="w-8 h-8 text-primary flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-brand-text">{phone.model}</p>
        {phone.imei    && <p className="text-xs font-mono text-brand-muted">IMEI: {phone.imei}</p>}
        {phone.barcode && <p className="text-xs font-mono text-brand-muted">Barcode: {phone.barcode}</p>}
        <p className="text-xs font-mono text-brand-muted">SN: {phone.serial_number}</p>
        <Badge variant={STATUS_VARIANT[phone.status]} className="mt-1">{STATUS_LABEL[phone.status]}</Badge>
      </div>
      <button onClick={onClose} className="text-brand-muted hover:text-brand-text transition-colors text-xs">Dismiss</button>
    </div>
  )
}

export default function AdminInventory() {
  const { profile } = useAuth()
  const { phones, loading, dbError, addPhone, addPhonesBulk, importPhones, lookupByBarcode, refetch } = usePhones()
  const { profiles } = useProfiles()

  const [showAddModal,     setShowAddModal]     = useState(false)
  const [showScannerModal, setShowScannerModal] = useState(false)
  const [scanResult,       setScanResult]       = useState<Phone | null>(null)

  const [mode,    setMode]   = useState<AddMode>('single')
  const [model,   setModel]  = useState('')
  const [barcode, setBarcode] = useState('')
  const [imei,    setImei]   = useState('')
  const [bulkCount, setBulkCount] = useState('1')
  const [submitting,   setSubmitting]   = useState(false)
  const [filter,    setFilter]    = useState<PhoneStatus | 'all'>('all')
  const [search,    setSearch]    = useState('')
  const [invPage,   setInvPage]   = useState(1)

  const [excelRows,     setExcelRows]     = useState<ExcelRow[]>([])
  const [excelFileName, setExcelFileName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Scan-tab state ──────────────────────────────────────────────────────
  const [scanStep,    setScanStep]    = useState<ScanStep>('scanning')
  const [scanCamTab,  setScanCamTab]  = useState<ScanCamTab>('hardware')
  const [scanManual,  setScanManual]  = useState('')
  const [lookingUp,   setLookingUp]   = useState(false)
  const scanVideoRef = useRef<HTMLVideoElement | null>(null)

  const scanTabEnabled = showAddModal && mode === 'scan' && scanStep === 'scanning'

  async function onCodeCaptured(code: string) {
    const trimmed = code.trim()
    setBarcode(trimmed)
    setScanManual('')
    setScanStep('confirm')

    if (/^\d{15}$/.test(trimmed)) {
      setImei(trimmed)
      setLookingUp(true)
      const info = await lookupByIMEI(trimmed)
      if (info) {
        const fullModel = [info.manufacturer, info.model].filter(Boolean).join(' ')
        if (fullModel) setModel(fullModel)
      }
      setLookingUp(false)
    }
  }

  const {
    isScanning:  scanIsActive,
    cameraError: scanCamError,
    startCamera: startScanCam,
    stopCamera:  stopScanCam,
  } = useBarcodeScan(onCodeCaptured, { enabled: scanTabEnabled })

  // Camera control: start/stop based on scan tab visibility
  useEffect(() => {
    if (scanTabEnabled && scanCamTab === 'camera' && scanVideoRef.current) {
      startScanCam(scanVideoRef.current)
    } else {
      stopScanCam()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanTabEnabled, scanCamTab])

  // Stop camera when leaving scan mode
  useEffect(() => {
    if (mode !== 'scan') stopScanCam()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  function handleScanVideoMount(el: HTMLVideoElement | null) {
    scanVideoRef.current = el
    if (el && scanTabEnabled && scanCamTab === 'camera' && !scanIsActive) {
      startScanCam(el)
    }
  }

  function handleManualScan() {
    const v = scanManual.trim()
    if (!v) return
    onCodeCaptured(v)
  }

  function resetScanTab() {
    setScanStep('scanning')
    setScanCamTab('hardware')
    setScanManual('')
    setBarcode('')
    setImei('')
  }
  // ── End scan-tab state ──────────────────────────────────────────────────

  const filtered = phones.filter((p) => {
    const matchStatus = filter === 'all' || p.status === filter
    const matchSearch = !search ||
      p.model.toLowerCase().includes(search.toLowerCase()) ||
      p.serial_number.toLowerCase().includes(search.toLowerCase()) ||
      (p.imei    ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (p.barcode ?? '').toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  const invTotalPages = Math.max(1, Math.ceil(filtered.length / INV_PAGE_SIZE))
  const paginated     = filtered.slice((invPage - 1) * INV_PAGE_SIZE, invPage * INV_PAGE_SIZE)

  function getAssigneeName(assignedTo: string | null) {
    if (!assignedTo) return '—'
    return profiles.find((p) => p.id === assignedTo)?.full_name ?? '—'
  }

  function resetModal() {
    setMode('single'); setModel(''); setBarcode(''); setImei(''); setBulkCount('1')
    setExcelRows([]); setExcelFileName(''); setShowAddModal(false)
    resetScanTab()
  }

  async function handleScanResult(code: string) {
    const phone = await lookupByBarcode(code)
    if (!phone) {
      toast.error(`Phone not found for: ${code}`)
      setBarcode(code)
      setMode('single')
      setShowAddModal(true)
    } else {
      setScanResult(phone)
      setSearch(phone.imei ?? phone.barcode ?? phone.serial_number)
    }
  }

  function downloadTemplate() {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      ['Model', 'Serial Number', 'Barcode', 'IMEI'],
      ['iPhone 15 Pro', 'SN-IP15P-001', '352876543210001', '352876543210001'],
      ['Samsung S24 Ultra', 'SN-S24U-001', '356789012345001', '356789012345001'],
    ])
    ws['!cols'] = [{ wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 18 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Phones')
    XLSX.writeFile(wb, 'royal-success-phone-import.xlsx')
    toast.success('Template downloaded.')
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setExcelFileName(file.name); setExcelRows([])
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer)
        const wb   = XLSX.read(data, { type: 'array' })
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(
          wb.Sheets[wb.SheetNames[0]], { defval: '' },
        )
        const parsed: ExcelRow[] = json.map((row) => {
          const keys       = Object.keys(row)
          const modelKey   = keys.find((k) => k.toLowerCase().includes('model'))   ?? keys[0]
          const serialKey  = keys.find((k) => k.toLowerCase().includes('serial'))  ?? keys[1]
          const barcodeKey = keys.find((k) => k.toLowerCase().includes('barcode')) ?? keys[2]
          const imeiKey    = keys.find((k) => k.toLowerCase().includes('imei'))    ?? keys[3]
          return {
            model:         String(row[modelKey]   ?? '').trim(),
            serial_number: String(row[serialKey]  ?? '').trim(),
            barcode:       barcodeKey ? String(row[barcodeKey] ?? '').trim() : undefined,
            imei:          imeiKey    ? String(row[imeiKey]    ?? '').trim() : undefined,
          }
        }).filter((r) => r.model && r.serial_number)

        if (!parsed.length) { toast.error('No valid rows found.'); return }
        setExcelRows(parsed)
      } catch { toast.error('Could not read file.') }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  async function handleAdd() {
    if (!profile) return
    setSubmitting(true)
    let ok = false

    if (mode === 'single' || mode === 'scan') {
      if (!model.trim()) { toast.error('Enter a model name.'); setSubmitting(false); return }
      ok = await addPhone(model.trim(), profile, {
        barcode: barcode.trim() || undefined,
        imei:    imei.trim()    || undefined,
      })
    } else if (mode === 'bulk') {
      if (!model.trim()) { toast.error('Enter a model name.'); setSubmitting(false); return }
      const count = parseInt(bulkCount) || 1
      if (count < 1 || count > 500) { toast.error('Enter a count between 1 and 500.'); setSubmitting(false); return }
      ok = await addPhonesBulk(model.trim(), count, profile)
    } else {
      if (!excelRows.length) { toast.error('Select a file first.'); setSubmitting(false); return }
      ok = await importPhones(excelRows, profile)
    }

    if (ok) {
      toast.success(mode === 'excel' ? `${excelRows.length} phone(s) imported.` : 'Phone added to inventory.')
      if (mode === 'scan') {
        // Stay in scan mode so they can scan the next phone
        setModel('')
        resetScanTab()
      } else {
        resetModal()
      }
    }
    setSubmitting(false)
  }

  const modeTabs: { key: AddMode; label: string }[] = [
    { key: 'single', label: 'Single' },
    { key: 'bulk',   label: 'Bulk' },
    { key: 'excel',  label: 'Excel' },
    { key: 'scan',   label: 'Scan' },
  ]
  const allFilters: (PhoneStatus | 'all')[] = ['all', 'in_stock', 'assigned', 'sold', 'returned', 'damaged']

  const scanCamTabClass = (t: ScanCamTab) =>
    `flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
      scanCamTab === t
        ? 'bg-white text-brand-text shadow-sm'
        : 'text-brand-muted hover:text-brand-text'
    }`

  return (
    <div className="flex-1 overflow-y-auto">
      <Header title="Inventory" />
      <div className="p-6 space-y-5">

        {dbError && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <MdWarning className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">Database connection failed</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Go to <strong>supabase.com</strong> → resume project → Refresh.
              </p>
            </div>
            <button onClick={refetch}
              className="flex items-center gap-1 text-xs text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors">
              <MdRefresh className="w-4 h-4" /> Refresh
            </button>
          </div>
        )}

        {scanResult && (
          <ScanResultBanner phone={scanResult} onClose={() => { setScanResult(null); setSearch('') }} />
        )}

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            {allFilters.map((f) => (
              <button key={f} onClick={() => { setFilter(f); setInvPage(1) }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filter === f ? 'bg-primary text-white' : 'bg-white border border-brand-border text-brand-muted hover:bg-gray-50'
                }`}>
                {f === 'all' ? 'All' : STATUS_LABEL[f as PhoneStatus]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input type="text" placeholder="Search model, SN, IMEI or barcode…" value={search}
              onChange={(e) => { setSearch(e.target.value); setInvPage(1) }}
              className="border border-brand-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary flex-1 sm:w-64" />
            <button onClick={() => setShowScannerModal(true)} title="Scan IMEI / barcode"
              className="flex items-center gap-1.5 border border-brand-border bg-white hover:bg-gray-50 text-brand-text px-3 py-2 rounded-lg text-sm font-medium transition-colors">
              <MdQrCodeScanner className="w-5 h-5 text-primary" />
              <span className="hidden sm:inline">Scan</span>
            </button>
            <Button onClick={() => setShowAddModal(true)} size="sm">
              <MdAdd className="w-4 h-4" /> Add Phone
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-brand-border shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-brand-border">
                  <tr>
                    {['Model', 'Barcode / IMEI', 'Status', 'Holder', 'Added'].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-brand-muted uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border">
                  {paginated.map((phone) => (
                    <tr key={phone.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-4 font-medium text-brand-text">{phone.model}</td>
                      <td className="px-5 py-4 font-mono text-xs text-brand-muted">
                        {phone.imei ?? phone.barcode ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant={STATUS_VARIANT[phone.status]}>{STATUS_LABEL[phone.status]}</Badge>
                      </td>
                      <td className="px-5 py-4 text-brand-muted">{getAssigneeName(phone.assigned_to)}</td>
                      <td className="px-5 py-4 text-brand-muted">{new Date(phone.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-brand-muted">
                        <MdQrCode2 className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                        {phones.length === 0 ? 'No phones yet.' : 'No phones match your filter.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <Pagination
                page={invPage}
                totalPages={invTotalPages}
                totalCount={filtered.length}
                pageSize={INV_PAGE_SIZE}
                onPageChange={setInvPage}
              />
            </div>
          )}
        </div>
      </div>

      {/* Inventory lookup scanner */}
      <ScannerModal
        isOpen={showScannerModal}
        onClose={() => setShowScannerModal(false)}
        onScan={handleScanResult}
        title="Scan / Lookup Phone"
      />

      {/* Add / Import Modal */}
      <Modal isOpen={showAddModal} onClose={resetModal} title="Add Phone(s) to Inventory">
        <div className="space-y-4">
          {/* Mode tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {modeTabs.map((t) => (
              <button key={t.key} onClick={() => setMode(t.key)}
                className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  mode === t.key ? 'bg-white text-brand-text shadow-sm' : 'text-brand-muted hover:text-brand-text'
                }`}>
                {t.key === 'scan' && <MdQrCodeScanner className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />}
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Single ── */}
          {mode === 'single' && (
            <>
              <div>
                <label className="block text-sm font-medium text-brand-text mb-1">Model Name</label>
                <input type="text" value={model} onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. iPhone 15 Pro" autoFocus
                  className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-text mb-1">
                  Barcode / IMEI
                  <span className="text-brand-muted font-normal ml-1">(scan or type)</span>
                </label>
                <input type="text" value={barcode} onChange={(e) => setBarcode(e.target.value)}
                  placeholder="Enter barcode or IMEI…"
                  className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-text mb-1">IMEI <span className="text-brand-muted font-normal">(if different from barcode)</span></label>
                <input type="text" value={imei} onChange={(e) => setImei(e.target.value)}
                  placeholder="15-digit IMEI (optional)"
                  className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </>
          )}

          {/* ── Bulk ── */}
          {mode === 'bulk' && (
            <>
              <div>
                <label className="block text-sm font-medium text-brand-text mb-1">Model Name</label>
                <input type="text" value={model} onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. Samsung S24 Ultra" autoFocus
                  className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-text mb-1">Quantity</label>
                <input type="number" min="1" max="500" value={bulkCount}
                  onChange={(e) => setBulkCount(e.target.value)}
                  placeholder="e.g. 10"
                  className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                <p className="text-xs text-brand-muted mt-1">Max 500 at a time</p>
              </div>
            </>
          )}

          {/* ── Excel ── */}
          {mode === 'excel' && (
            <div className="space-y-3">
              <div className="bg-primary-pale border border-primary/20 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-primary">Download template first</p>
                  <p className="text-xs text-primary/70 mt-0.5">Columns: Model, Serial Number, Barcode, IMEI</p>
                </div>
                <button onClick={downloadTemplate}
                  className="flex items-center gap-1.5 text-xs font-semibold text-primary bg-white border border-primary/30 hover:bg-primary hover:text-white px-3 py-2 rounded-lg transition-colors">
                  <MdDownload className="w-4 h-4" /> Template
                </button>
              </div>
              <div onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-brand-border rounded-xl p-6 text-center cursor-pointer hover:border-primary hover:bg-primary-pale transition-colors">
                <MdUploadFile className="w-8 h-8 mx-auto mb-2 text-brand-muted" />
                {excelFileName
                  ? <p className="text-sm font-medium text-brand-text">{excelFileName}</p>
                  : <><p className="text-sm font-medium text-brand-text">Click to select file</p>
                     <p className="text-xs text-brand-muted mt-1">.xlsx, .xls, .csv</p></>
                }
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="sr-only" />
              </div>
              {excelRows.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
                  <MdCheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-green-800">{excelRows.length} phone(s) ready to import</span>
                </div>
              )}
            </div>
          )}

          {/* ── Scan ── */}
          {mode === 'scan' && (
            <div className="space-y-4">
              {scanStep === 'scanning' ? (
                <>
                  {/* Hardware / Camera sub-tabs */}
                  <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                    <button className={scanCamTabClass('hardware')} onClick={() => setScanCamTab('hardware')}>
                      <MdWifi className="w-4 h-4" /> Hardware
                    </button>
                    <button className={scanCamTabClass('camera')} onClick={() => setScanCamTab('camera')}>
                      <MdCameraAlt className="w-4 h-4" /> Camera
                    </button>
                  </div>

                  {scanCamTab === 'hardware' && (
                    <div className="py-6 text-center space-y-3">
                      <div className="relative inline-flex">
                        <MdQrCodeScanner className="w-14 h-14 text-primary" />
                        <span className="absolute top-0 right-0 w-3 h-3 bg-green-400 rounded-full animate-pulse" />
                      </div>
                      <p className="font-semibold text-brand-text">Ready — point scanner at barcode</p>
                      <p className="text-sm text-brand-muted">
                        USB / Bluetooth HID scanners are supported.
                      </p>
                    </div>
                  )}

                  {scanCamTab === 'camera' && (
                    <div className="space-y-2">
                      <div className="relative aspect-video rounded-xl overflow-hidden bg-gray-900">
                        <video
                          ref={handleScanVideoMount}
                          autoPlay
                          muted
                          playsInline
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="relative w-56 h-40">
                            <div className="absolute top-0 left-0 w-7 h-7 border-t-[3px] border-l-[3px] border-green-400 rounded-tl" />
                            <div className="absolute top-0 right-0 w-7 h-7 border-t-[3px] border-r-[3px] border-green-400 rounded-tr" />
                            <div className="absolute bottom-0 left-0 w-7 h-7 border-b-[3px] border-l-[3px] border-green-400 rounded-bl" />
                            <div className="absolute bottom-0 right-0 w-7 h-7 border-b-[3px] border-r-[3px] border-green-400 rounded-br" />
                            {scanIsActive && (
                              <div className="absolute left-2 right-2 h-0.5 bg-green-400/80 animate-bounce top-1/2" />
                            )}
                          </div>
                        </div>
                        {scanIsActive && (
                          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full flex items-center gap-1.5">
                            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                            Scanning…
                          </div>
                        )}
                      </div>
                      {scanCamError && (
                        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                          <MdErrorOutline className="w-4 h-4 flex-shrink-0" />
                          {scanCamError}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Manual entry fallback */}
                  <div>
                    <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-1.5">
                      Or type barcode / IMEI
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={scanManual}
                        onChange={(e) => setScanManual(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleManualScan() }}
                        placeholder="Type barcode / IMEI and press Enter"
                        data-scanner="true"
                        className="flex-1 border border-brand-border rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <button
                        onClick={handleManualScan}
                        disabled={!scanManual.trim()}
                        className="px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-light disabled:opacity-40 transition-colors"
                      >
                        Go
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                /* Confirm step — barcode captured, fill model + serial */
                <>
                  <div className="bg-primary-pale border border-primary/20 rounded-lg px-4 py-3 flex items-center gap-3">
                    <MdCheckCircle className="w-5 h-5 text-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-primary">Barcode captured</p>
                      <p className="text-xs font-mono text-primary/80 truncate">{barcode}</p>
                      {imei && imei !== barcode && (
                        <p className="text-xs font-mono text-primary/60">IMEI: {imei}</p>
                      )}
                    </div>
                    <button
                      onClick={resetScanTab}
                      className="text-xs text-brand-muted hover:text-brand-text transition-colors flex-shrink-0"
                    >
                      Re-scan
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-brand-text mb-1">
                      Model Name
                      {lookingUp && (
                        <span className="ml-2 text-xs text-brand-muted font-normal animate-pulse">
                          Looking up device…
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder={lookingUp ? 'Looking up…' : 'e.g. iPhone 15 Pro'}
                      autoFocus={!lookingUp}
                      disabled={lookingUp}
                      className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50 disabled:text-brand-muted"
                    />
                    {!lookingUp && model && (
                      <p className="text-xs text-primary mt-1 flex items-center gap-1">
                        <MdCheckCircle className="w-3.5 h-3.5" /> Auto-filled from IMEI — verify or edit
                      </p>
                    )}
                  </div>

                </>
              )}
            </div>
          )}

          {/* Footer buttons — hidden while scanning or looking up */}
          {!(mode === 'scan' && (scanStep === 'scanning' || lookingUp)) && (
            <div className="flex gap-3 pt-1">
              <Button variant="secondary" onClick={resetModal} fullWidth>Cancel</Button>
              <Button onClick={handleAdd} loading={submitting} fullWidth>
                {mode === 'excel' && excelRows.length > 0
                  ? `Import ${excelRows.length}`
                  : mode === 'scan'
                  ? 'Add Phone'
                  : 'Add Phone(s)'}
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
