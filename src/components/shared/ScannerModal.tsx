import { useEffect, useRef, useState } from 'react'
import { useBarcodeScan } from '../../hooks/useBarcodeScan'
import Modal from './Modal'
import { MdQrCodeScanner, MdCameraAlt, MdWifi, MdErrorOutline } from 'react-icons/md'

type Tab = 'hardware' | 'camera'

interface Props {
  isOpen:  boolean
  onClose: () => void
  onScan:  (barcode: string) => void
  title?:  string
}

export default function ScannerModal({ isOpen, onClose, onScan, title = 'Scan Phone' }: Props) {
  const [tab,    setTab]    = useState<Tab>('hardware')
  const [manual, setManual] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)

  function handleScan(value: string) {
    onScan(value.trim())
    onClose()
  }

  const { isScanning, cameraError, startCamera, stopCamera } =
    useBarcodeScan(handleScan, { enabled: isOpen })

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      stopCamera()
      setManual('')
      setTab('hardware')
    }
  }, [isOpen, stopCamera])

  // Start/stop camera when switching tabs
  useEffect(() => {
    if (!isOpen) return
    if (tab === 'camera' && videoRef.current) {
      startCamera(videoRef.current)
    } else {
      stopCamera()
    }
  }, [tab, isOpen, startCamera, stopCamera])

  // Also start camera once video element mounts on camera tab
  function handleVideoMount(el: HTMLVideoElement | null) {
    (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el
    if (el && tab === 'camera' && isOpen && !isScanning) {
      startCamera(el)
    }
  }

  function handleManualSubmit() {
    const v = manual.trim()
    if (v) handleScan(v)
  }

  const tabClass = (t: Tab) =>
    `flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${
      tab === t
        ? 'bg-white text-brand-text shadow-sm'
        : 'text-brand-muted hover:text-brand-text'
    }`

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4">

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          <button className={tabClass('hardware')} onClick={() => setTab('hardware')}>
            <MdWifi className="w-4 h-4" /> Hardware
          </button>
          <button className={tabClass('camera')} onClick={() => setTab('camera')}>
            <MdCameraAlt className="w-4 h-4" /> Camera
          </button>
        </div>

        {/* Hardware tab */}
        {tab === 'hardware' && (
          <div className="py-8 text-center space-y-3">
            <div className="relative inline-flex">
              <MdQrCodeScanner className="w-16 h-16 text-primary" />
              <span className="absolute top-0 right-0 w-3 h-3 bg-green-400 rounded-full animate-pulse" />
            </div>
            <p className="font-semibold text-brand-text">Listening for scanner…</p>
            <p className="text-sm text-brand-muted">
              Point any USB / Bluetooth HID scanner at the barcode.
              <br />Compatible with Zebra, Honeywell, Cino, Cilico, Eyoyo.
            </p>
          </div>
        )}

        {/* Camera tab */}
        {tab === 'camera' && (
          <div className="space-y-2">
            <div className="relative aspect-video rounded-xl overflow-hidden bg-gray-900">
              <video
                ref={handleVideoMount}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />

              {/* Targeting overlay — four corner brackets */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-56 h-40">
                  {/* Top-left */}
                  <div className="absolute top-0 left-0 w-7 h-7 border-t-[3px] border-l-[3px] border-green-400 rounded-tl" />
                  {/* Top-right */}
                  <div className="absolute top-0 right-0 w-7 h-7 border-t-[3px] border-r-[3px] border-green-400 rounded-tr" />
                  {/* Bottom-left */}
                  <div className="absolute bottom-0 left-0 w-7 h-7 border-b-[3px] border-l-[3px] border-green-400 rounded-bl" />
                  {/* Bottom-right */}
                  <div className="absolute bottom-0 right-0 w-7 h-7 border-b-[3px] border-r-[3px] border-green-400 rounded-br" />
                  {/* Scanning pulse line */}
                  {isScanning && (
                    <div className="absolute left-2 right-2 h-0.5 bg-green-400/80 animate-bounce top-1/2" />
                  )}
                </div>
              </div>

              {/* Scanning status badge */}
              {isScanning && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  Scanning…
                </div>
              )}
            </div>

            {cameraError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <MdErrorOutline className="w-4 h-4 flex-shrink-0" />
                {cameraError}
              </div>
            )}
          </div>
        )}

        {/* Manual input — always visible */}
        <div>
          <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-1.5">
            Manual Entry
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleManualSubmit() }}
              placeholder="Type barcode / IMEI and press Enter"
              data-scanner="true"
              className="flex-1 border border-brand-border rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={handleManualSubmit}
              disabled={!manual.trim()}
              className="px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-light disabled:opacity-40 transition-colors"
            >
              Go
            </button>
          </div>
        </div>

      </div>
    </Modal>
  )
}
