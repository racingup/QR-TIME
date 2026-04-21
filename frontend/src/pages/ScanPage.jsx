import { useState } from 'react'
import QRScanner from '../components/QRScanner'
import { useClock } from '../hooks/useClock'

export default function ScanPage() {
  const { state, submitScan, reset } = useClock()
  const [pendingToken, setPendingToken] = useState(null)
  const [justification, setJustification] = useState('')
  const [cameraError, setCameraError] = useState(null)

  const handleDecode = (text) => {
    setPendingToken(text)
    submitScan(text)
  }

  const handleConfirmJustification = () => {
    if (!pendingToken || !justification.trim()) return
    submitScan(pendingToken, justification.trim())
  }

  const handleReset = () => {
    setPendingToken(null)
    setJustification('')
    setCameraError(null)
    reset()
  }

  const formatTime = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Pointage</h1>

      {state.status === 'idle' && (
        <>
          <p className="text-gray-600 mb-4 text-center">
            Présentez le QR code de votre site devant la caméra.
          </p>
          {cameraError ? (
            <div
              role="alert"
              className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 max-w-sm text-center"
            >
              <p className="font-medium">Caméra indisponible</p>
              <p className="text-sm mt-1">{cameraError.message}</p>
            </div>
          ) : (
            <QRScanner onDecode={handleDecode} onError={setCameraError} />
          )}
        </>
      )}

      {(state.status === 'sending') && (
        <p className="text-gray-700">Envoi en cours…</p>
      )}

      {state.status === 'ok' && (
        <div
          role="status"
          className="bg-green-50 border border-green-200 text-green-900 rounded-lg p-6 max-w-sm w-full text-center"
        >
          <p className="text-3xl">✓</p>
          <p className="font-semibold text-lg mt-2">Pointage enregistré</p>
          <p className="text-sm mt-3">
            {state.data.action === 'IN' ? 'Arrivée' : 'Départ'} à{' '}
            <strong>
              {formatTime(
                state.data.action === 'IN'
                  ? state.data.clock_in_rounded
                  : state.data.clock_out_rounded,
              )}
            </strong>
          </p>
          <button
            type="button"
            className="mt-5 bg-green-600 text-white px-4 py-2 rounded"
            onClick={handleReset}
          >
            Nouveau scan
          </button>
        </div>
      )}

      {state.status === 'requires_justification' && (
        <div
          role="alert"
          className="bg-orange-50 border border-orange-200 text-orange-900 rounded-lg p-6 max-w-sm w-full"
        >
          <p className="text-3xl text-center">⚠</p>
          <p className="font-semibold text-lg text-center mt-2">
            Justification requise
          </p>
          <p className="text-sm text-center mt-2">
            Vous êtes en dehors d'une plage horaire fixe. Indiquez le motif :
          </p>
          <textarea
            data-testid="justification-input"
            className="w-full mt-3 border rounded p-2 h-24 text-sm"
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder="Ex: rendez-vous médical"
          />
          <button
            type="button"
            disabled={!justification.trim()}
            onClick={handleConfirmJustification}
            className="mt-3 w-full bg-orange-600 text-white py-2 rounded disabled:opacity-50"
          >
            Confirmer
          </button>
        </div>
      )}

      {state.status === 'gps_out_of_range' && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 text-red-900 rounded-lg p-6 max-w-sm w-full text-center"
        >
          <p className="text-3xl">✗</p>
          <p className="font-semibold text-lg mt-2">Hors périmètre</p>
          <p className="text-sm mt-3">
            Vous êtes à <strong>{state.data.distance_m} m</strong> du site.
          </p>
          <p className="text-sm">
            Rayon autorisé : <strong>{state.data.allowed_m} m</strong>.
          </p>
          <button
            type="button"
            className="mt-5 bg-gray-700 text-white px-4 py-2 rounded"
            onClick={handleReset}
          >
            Réessayer
          </button>
        </div>
      )}

      {state.status === 'gps_error' && (
        <div
          role="alert"
          className="bg-yellow-50 border border-yellow-200 text-yellow-900 rounded-lg p-6 max-w-sm w-full text-center"
        >
          <p className="font-semibold">GPS indisponible</p>
          <p className="text-sm mt-2">{state.error.message}</p>
          <button
            type="button"
            className="mt-4 bg-gray-700 text-white px-4 py-2 rounded"
            onClick={handleReset}
          >
            Réessayer
          </button>
        </div>
      )}

      {state.status === 'error' && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 text-red-900 rounded-lg p-6 max-w-sm w-full text-center"
        >
          <p className="text-3xl">✗</p>
          <p className="font-semibold mt-2">{String(state.error)}</p>
          <button
            type="button"
            className="mt-4 bg-gray-700 text-white px-4 py-2 rounded"
            onClick={handleReset}
          >
            Réessayer
          </button>
        </div>
      )}
    </div>
  )
}
