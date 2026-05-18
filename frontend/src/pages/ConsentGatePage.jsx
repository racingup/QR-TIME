import { useState } from 'react'
import * as meApi from '../api/me'

const ITEMS = [
  {
    kind: 'GPS',
    title: 'Géolocalisation',
    desc: "L'application utilise votre position GPS pour valider le pointage depuis les sites autorisés (périmètre configurable par l'administrateur).",
  },
  {
    kind: 'STORAGE',
    title: 'Stockage local de session',
    desc: "Votre jeton d'authentification est conservé localement dans le navigateur afin de maintenir votre session sans vous re-demander votre mot de passe à chaque visite.",
  },
  {
    kind: 'PRIVACY_POLICY',
    title: 'Politique de confidentialité',
    desc: "J'ai lu et j'accepte la politique de confidentialité de la plateforme QR-Time conformément à la LPD (loi fédérale suisse sur la protection des données).",
    link: '/privacy',
  },
]

export default function ConsentGatePage({ onAccepted }) {
  const [checked, setChecked] = useState({ GPS: false, STORAGE: false, PRIVACY_POLICY: false })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const allChecked = Object.values(checked).every(Boolean)

  const toggle = (kind) => setChecked((p) => ({ ...p, [kind]: !p[kind] }))

  const handleSubmit = async () => {
    if (!allChecked) return
    setSubmitting(true)
    setError(null)
    try {
      await meApi.acceptInitialConsent()
      onAccepted()
    } catch {
      setError('Une erreur est survenue. Veuillez réessayer.')
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="app-bg" aria-hidden />
      <div className="glass rounded-3xl p-7 max-w-lg w-full space-y-6 relative z-10">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="text-3xl">🔒</div>
          <h1 className="text-xl font-semibold tracking-tight">Consentement requis</h1>
          <p className="text-sm text-slate-500">
            Avant d'accéder à la plateforme, veuillez lire et accepter les 3 points ci-dessous.
          </p>
        </div>

        {/* Checkboxes */}
        <ul className="space-y-3">
          {ITEMS.map(({ kind, title, desc, link }) => (
            <li
              key={kind}
              onClick={() => toggle(kind)}
              className={`glass-soft rounded-2xl p-4 flex gap-3 cursor-pointer transition-all ${
                checked[kind] ? 'ring-2 ring-emerald-400' : ''
              }`}
            >
              <div
                className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                  checked[kind] ? 'bg-emerald-500 border-emerald-500' : 'border-slate-400'
                }`}
              >
                {checked[kind] && <span className="text-white text-xs">✓</span>}
              </div>
              <div className="space-y-1">
                <p className="font-medium text-sm">{title}</p>
                <p className="text-xs text-slate-500">{desc}</p>
                {link && (
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-blue-600 underline"
                  >
                    Lire la politique de confidentialité ↗
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>

        {error && <p className="text-sm text-rose-600 text-center">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!allChecked || submitting}
          className="pill pill-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting
            ? 'Enregistrement…'
            : allChecked
              ? "J'accepte et j'accède à la plateforme"
              : 'Cochez les 3 points pour continuer'}
        </button>

        <p className="text-xs text-slate-400 text-center">
          Vous pourrez demander le retrait de ces consentements à tout moment via « Mes données ».
          Le retrait fait l'objet d'une demande RH.
        </p>
      </div>
    </div>
  )
}
