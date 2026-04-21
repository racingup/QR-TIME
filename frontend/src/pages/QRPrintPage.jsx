import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import * as adminApi from '../api/admin'

/**
 * /admin/sites/:id/qr — printable QR for a site.
 * Manager-only (route is gated upstream).
 */
export default function QRPrintPage() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    adminApi.sites
      .qr(id)
      .then(setData)
      .catch((e) => setError(e.response?.data?.detail || e.message))
  }, [id])

  if (error) return <p className="p-6 text-red-700">{error}</p>
  if (!data) return <p className="p-6">Chargement…</p>

  return (
    <div className="qr-print-root min-h-screen flex flex-col items-center justify-center p-8">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>
      <div className="text-center">
        <img
          src={`data:image/png;base64,${data.qr_png_base64}`}
          alt={`QR du site ${data.site_name}`}
          width={320}
          height={320}
          className="mx-auto border"
          style={{ imageRendering: 'pixelated' }}
        />
        <h1 className="mt-6 text-2xl font-semibold">{data.site_name}</h1>
        <p className="mt-1 text-sm text-gray-600">
          Généré le{' '}
          {new Date(data.token_updated_at).toLocaleString('fr-FR', {
            dateStyle: 'long',
            timeStyle: 'short',
          })}
        </p>
      </div>
      <button
        type="button"
        onClick={() => window.print()}
        className="no-print mt-8 bg-blue-600 text-white px-6 py-2 rounded"
      >
        Imprimer
      </button>
    </div>
  )
}
