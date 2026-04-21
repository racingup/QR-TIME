import { useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

/**
 * Mounts an html5-qrcode camera scanner. Calls onDecode(text) once a code
 * is recognised. The parent should unmount this component to stop scanning.
 */
export default function QRScanner({ onDecode, onError }) {
  const elementId = 'qr-scanner-region'
  const scannerRef = useRef(null)

  useEffect(() => {
    let stopped = false
    const scanner = new Html5Qrcode(elementId, /* verbose= */ false)
    scannerRef.current = scanner

    Html5Qrcode.getCameras()
      .then((devices) => {
        if (!devices?.length) {
          onError?.({ code: 'NO_CAMERA', message: 'Aucune caméra détectée' })
          return
        }
        const camId = devices[devices.length - 1].id // back camera on phones
        return scanner.start(
          camId,
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (text) => {
            if (stopped) return
            stopped = true
            scanner.stop().catch(() => {})
            onDecode?.(text)
          },
          () => {
            // per-frame decode failure — silent
          },
        )
      })
      .catch((e) => onError?.({ code: 'CAMERA_ERROR', message: e?.message || String(e) }))

    return () => {
      stopped = true
      const s = scannerRef.current
      if (s && s.isScanning) {
        s.stop().catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      id={elementId}
      data-testid="qr-scanner-region"
      className="w-full max-w-sm aspect-square mx-auto rounded-lg overflow-hidden bg-black"
    />
  )
}
