import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import QRScanner, { decodeQrFromFile } from '../components/QRScanner'
import * as meApi from '../api/me'
import { useClock } from '../hooks/useClock'

export default function ScanPage() {
  const { state, submitScan, reset } = useClock()
  const [pendingToken, setPendingToken] = useState(null)
  const [justification, setJustification] = useState('')
  const [cameraError, setCameraError] = useState(null)
  const [uploadError, setUploadError] = useState(null)
  const [decoding, setDecoding] = useState(false)
  const [gpsConsent, setGpsConsent] = useState(null) // null=loading, true/false
  const fileInputRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    meApi.consent
      .get()
      .then((c) => setGpsConsent(c.gps?.granted === true))
      .catch(() => setGpsConsent(false))
  }, [])

  const grantConsent = async () => {
    await meApi.consent.set('GPS', true)
    setGpsConsent(true)
  }

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
    setUploadError(null)
    reset()
  }

  const handleFilePicked = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // permettre de re-sélectionner le même fichier
    if (!file) return
    setUploadError(null)
    setDecoding(true)
    try {
      const text = await decodeQrFromFile(file)
      handleDecode(text)
    } catch (err) {
      setUploadError(
        "Aucun QR code n'a pu être lu sur cette image. Réessayez avec une photo plus nette ou mieux cadrée.",
      )
    } finally {
      setDecoding(false)
    }
  }

  const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''

  // GPS consent gate (Art. 6 al. 6 LPD — consentement explicite pour le GPS)
  if (gpsConsent === false) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 safe-bottom">
        <div className="glass-strong rounded-3xl p-6 max-w-sm w-full space-y-3">
          <p className="text-3xl text-center">📍</p>
          <h1 className="text-lg font-semibold text-center">Géolocalisation requise</h1>
          <p className="text-sm text-slate-600">
            Pour pointer sur un site, l'application doit accéder à votre position GPS au
            moment du scan, afin de vérifier que vous êtes bien dans le périmètre du site.
          </p>
          <ul className="text-xs text-slate-500 list-disc list-inside space-y-1">
            <li>La position n'est utilisée que pour valider le pointage</li>
            <li>Aucune position n'est conservée à long terme</li>
            <li>Vous pouvez retirer votre consentement à tout moment dans <Link to="/my-data" className="underline">Mes données</Link></li>
          </ul>
          <p className="text-xs text-slate-500">
            Voir la <Link to="/privacy" className="text-blue-700 underline">politique de confidentialité</Link>.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => navigate('/')} className="flex-1 px-4 py-2 text-sm">
              Annuler
            </button>
            <button type="button" onClick={grantConsent} className="pill pill-primary flex-1 justify-center">
              J'accepte
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (gpsConsent === null) {
    return <p className="p-6 text-center text-slate-500">Chargement…</p>
  }

  return (
    <div className="min-h-screen flex flex-col items-center px-4 pt-2 pb-8 safe-bottom">
      <h1 className="text-xl font-semibold mb-3">Scanner</h1>

      {state.status === 'idle' && (
        <div className="w-full max-w-sm space-y-3">
          {cameraError ? (
            <div className="glass rounded-3xl p-5 text-center">
              <p className="font-semibold text-rose-700">Caméra indisponible</p>
              <p className="text-sm text-slate-500 mt-1">{cameraError.message}</p>
            </div>
          ) : (
            <div className="glass rounded-3xl p-2">
              <QRScanner onDecode={handleDecode} onError={setCameraError} />
            </div>
          )}
          <p className="text-center text-sm text-slate-500">
            Présentez le QR code de votre site ou de votre mission devant la caméra.
          </p>

          {/* Séparateur OU */}
          <div className="flex items-center gap-3 text-xs text-slate-400 py-1">
            <span className="flex-1 h-px bg-slate-300/60" />
            OU
            <span className="flex-1 h-px bg-slate-300/60" />
          </div>

          {/* Upload depuis fichier / photo */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFilePicked}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={decoding}
            className="press w-full glass-soft rounded-2xl p-3 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
            {decoding ? 'Lecture du QR…' : 'Importer depuis une photo'}
          </button>
          <p className="text-center text-[11px] text-slate-400">
            Sur mobile : choisir dans la galerie · Sur desktop : explorateur de fichiers
          </p>

          {uploadError && (
            <p role="alert" className="text-xs text-rose-700 text-center bg-rose-50/70 rounded-xl p-2">
              {uploadError}
            </p>
          )}
        </div>
      )}

      {state.status === 'sending' && (
        <p className="glass rounded-2xl px-4 py-3 text-slate-600 mt-6">
          Envoi en cours…
        </p>
      )}

      {state.status === 'ok' && (
        <div className="glass-strong rounded-3xl p-6 max-w-sm w-full text-center mt-6">
          <p className="text-5xl">✓</p>
          <p className="font-semibold text-lg mt-2 text-emerald-700">
            Pointage enregistré
          </p>
          <p className="text-sm mt-3">
            {state.data.action === 'IN' ? 'Arrivée' : 'Départ'} à{' '}
            <strong>
              {fmtTime(state.data.action === 'IN' ? state.data.clock_in_rounded : state.data.clock_out_rounded)}
            </strong>
          </p>
          <div className="flex gap-2 mt-5 justify-center">
            <button type="button" onClick={handleReset} className="pill pill-ghost">
              Nouveau scan
            </button>
            <button type="button" onClick={() => navigate('/')} className="pill pill-primary">
              Retour
            </button>
          </div>
        </div>
      )}

      {state.status === 'requires_justification' && (
        <div className="glass-strong rounded-3xl p-5 max-w-sm w-full mt-6 space-y-3">
          <p className="text-3xl text-center">⚠</p>
          <p className="font-semibold text-center text-amber-700">
            Justification requise
          </p>
          <p className="text-sm text-center text-slate-600">
            Vous êtes en dehors d'une plage horaire fixe.
          </p>
          <textarea
            data-testid="justification-input"
            className="glass-input w-full h-24"
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder="Ex : rendez-vous médical"
          />
          <button
            type="button"
            disabled={!justification.trim()}
            onClick={handleConfirmJustification}
            className="pill pill-primary w-full justify-center disabled:opacity-50"
          >
            Confirmer
          </button>
        </div>
      )}

      {state.status === 'gps_out_of_range' && (
        <div className="glass-strong rounded-3xl p-6 max-w-sm w-full text-center mt-6">
          <p className="text-5xl">✗</p>
          <p className="font-semibold text-rose-700">Hors périmètre</p>
          <p className="text-sm mt-3">
            Vous êtes à <strong>{state.data.distance_m} m</strong> du site.
          </p>
          <p className="text-sm">
            Rayon autorisé : <strong>{state.data.allowed_m} m</strong>.
          </p>
          <button type="button" onClick={handleReset} className="pill pill-ghost mt-5">
            Réessayer
          </button>
        </div>
      )}

      {state.status === 'gps_error' && (
        <div className="glass-strong rounded-3xl p-6 max-w-sm w-full text-center mt-6">
          <p className="font-semibold text-amber-700">GPS indisponible</p>
          <p className="text-sm text-slate-600 mt-2">{state.error.message}</p>
          <button type="button" onClick={handleReset} className="pill pill-ghost mt-5">
            Réessayer
          </button>
        </div>
      )}

      {state.status === 'error' && (
        <div className="glass-strong rounded-3xl p-6 max-w-sm w-full text-center mt-6">
          <p className="text-5xl">✗</p>
          <p className="font-semibold text-rose-700 mt-2">{String(state.error)}</p>
          <button type="button" onClick={handleReset} className="pill pill-ghost mt-5">
            Réessayer
          </button>
        </div>
      )}
    </div>
  )
}
