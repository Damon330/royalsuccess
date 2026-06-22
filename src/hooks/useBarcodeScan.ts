import { useEffect, useRef, useState, useCallback } from 'react'

// HID keyboard-wedge scanners (Zebra, Honeywell, Cino, Cilico, Eyoyo) send
// characters at burst speed (< 50 ms apart) and terminate with Enter.
// ZXing BrowserMultiFormatReader handles camera-based scanning.

const SCANNER_GAP_MS = 50   // max ms between chars for hardware-scanner detection
const SETTLE_MS      = 120  // flush buffer after this many ms of silence
const MIN_LENGTH     = 4    // ignore bursts shorter than this

interface UseBarcodeScanReturn {
  isScanning:  boolean       // camera is actively scanning
  cameraError: string | null
  startCamera: (el: HTMLVideoElement) => Promise<void>
  stopCamera:  () => void
}

export function useBarcodeScan(
  onScan: (value: string) => void,
  { enabled = true }: { enabled?: boolean } = {},
): UseBarcodeScanReturn {
  const [isScanning,  setIsScanning]  = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  // Keep onScan in a ref so camera callback doesn't stale-close over it
  const onScanRef   = useRef(onScan)
  useEffect(() => { onScanRef.current = onScan }, [onScan])

  // ── Camera (ZXing) ──────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readerRef   = useRef<any>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop()
    controlsRef.current = null
    setIsScanning(false)
  }, [])

  const startCamera = useCallback(async (videoEl: HTMLVideoElement) => {
    setCameraError(null)
    setIsScanning(true)
    try {
      if (!readerRef.current) {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        readerRef.current = new BrowserMultiFormatReader()
      }
      controlsRef.current = await readerRef.current.decodeFromVideoDevice(
        undefined,   // undefined = let browser pick default camera
        videoEl,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (result: any, _err: any, controls: any) => {
          if (result) {
            controls.stop()
            controlsRef.current = null
            setIsScanning(false)
            onScanRef.current(result.getText())
          }
        },
      )
    } catch {
      setCameraError('Camera unavailable — check browser permissions.')
      setIsScanning(false)
    }
  }, [])

  // ── Hardware keyboard-wedge ─────────────────────────────────
  const bufferRef    = useRef('')
  const lastKeyRef   = useRef(0)
  const isScanRef    = useRef(false)   // true once we've seen scanner-speed input
  const timerRef     = useRef<ReturnType<typeof setTimeout>>()

  const flush = useCallback(() => {
    clearTimeout(timerRef.current)
    const val = bufferRef.current.trim()
    bufferRef.current = ''
    isScanRef.current = false
    if (val.length >= MIN_LENGTH) onScanRef.current(val)
  }, [])

  const discard = useCallback(() => {
    clearTimeout(timerRef.current)
    bufferRef.current = ''
    isScanRef.current = false
  }, [])

  useEffect(() => {
    if (!enabled) return

    function onKeyDown(e: KeyboardEvent) {
      const target   = e.target as HTMLElement
      const inInput  = (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
                       && target.getAttribute('data-scanner') !== 'true'

      const now = Date.now()
      const gap = now - lastKeyRef.current
      lastKeyRef.current = now

      // ─ Enter: commit if scanner-speed buffer exists ─
      if (e.key === 'Enter') {
        if (isScanRef.current && bufferRef.current.length >= MIN_LENGTH) {
          if (inInput) { e.preventDefault(); e.stopPropagation() }
          flush()
        } else {
          discard()
        }
        return
      }

      if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) return

      if (gap < SCANNER_GAP_MS) {
        isScanRef.current  = true
        bufferRef.current += e.key
        if (inInput) { e.preventDefault(); e.stopPropagation() }
        clearTimeout(timerRef.current)
        timerRef.current = setTimeout(flush, SETTLE_MS)
      } else if (bufferRef.current.length === 0 && !inInput) {
        // First char outside an input — speculative buffer start
        bufferRef.current = e.key
        clearTimeout(timerRef.current)
        timerRef.current = setTimeout(discard, SCANNER_GAP_MS)
      } else if (isScanRef.current) {
        // Gap slightly too long but we're already in scanner mode
        bufferRef.current += e.key
        clearTimeout(timerRef.current)
        timerRef.current = setTimeout(flush, SETTLE_MS)
      } else {
        discard()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      clearTimeout(timerRef.current)
    }
  }, [enabled, flush, discard])

  // Clean up camera on unmount
  useEffect(() => () => stopCamera(), [stopCamera])

  return { isScanning, cameraError, startCamera, stopCamera }
}
