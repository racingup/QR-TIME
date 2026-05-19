import { useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

/**
 * Decode a QR code from a static image file (photo from gallery or file picker).
 * Returns the decoded string. Throws if no QR is detected.
 */
export async function decodeQrFromFile(file) {
  const tempEl = document.createElement('div')
  tempEl.id = `qr-file-tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  tempEl.style.display = 'none'
  document.body.appendChild(tempEl)
  const scanner = new Html5Qrcode(tempEl.id, /* verbose */ false)
  try {
    return await scanner.scanFile(file, /* showImage */ false)
  } finally {
    try { document.body.removeChild(tempEl) } catch { /* element gone */ }
  }
}

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
        // qrbox dynamique = 85% du min(width, height) de la vidéo →
        // carré qui couvre la majorité du flux caméra (vs 240×240 fixe).
        const qrbox = (viewportWidth, viewportHeight) => {
          const minEdge = Math.min(viewportWidth, viewportHeight)
          const size = Math.floor(minEdge * 0.85)
          return { width: size, height: size }
        }
        return scanner.start(
          camId,
          {
            fps: 10,
            qrbox,
            aspectRatio: 1.0,  // force le flux en carré (cadre uniforme)
          },
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
