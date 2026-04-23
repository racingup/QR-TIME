import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as meApi from '../api/me'

const KIND_LABEL = {
  GPS: 'Géolocalisation',
  STORAGE: 'Stockage local de session',
  PRIVACY_POLICY: 'Politique de confidentialité',
}

export default function MyDataPage() {
  const [consents, setConsents] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [pendingRequest, setPendingRequest] = useState(null)
  const [requestForm, setRequestForm] = useState({ open: false, reason: '' })
  const [submitting, setSubmitting] = useState(false)

  const refreshConsents = () => meApi.consent.get().then(setConsents)
  const refreshDeletionRequest = () =>
    meApi.deletionRequest.get().then((d) => setPendingRequest(d.pending))

  useEffect(() => {
    refreshConsents()
    refreshDeletionRequest()
  }, [])

  const toggle = async (kind, granted) => {
    await meApi.consent.set(kind, granted)
    refreshConsents()
  }

  const downloadExport = async () => {
    setExporting(true)
    try {
      const data = await meApi.exportData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      const stamp = new Date().toISOString().slice(0, 10)
      a.download = `mes-donnees-qrtime-${stamp}.json`
      a.click()
      URL.revokeObjectURL(a.href)
    } finally {
      setExporting(false)
    }
  }

  const submitDeletionRequest = async () => {
    setSubmitting(true)
    try {
      const resp = await meApi.deletionRequest.create(requestForm.reason)
      setPendingRequest(resp.pending)
      setRequestForm({ open: false, reason: '' })
    } catch (e) {
      const data = e?.response?.data
      if (data?.error === 'ALREADY_PENDING' && data.request) {
        setPendingRequest(data.request)
        setRequestForm({ open: false, reason: '' })
      } else {
        alert(`Erreur : ${data?.error || e.message}`)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="px-3 max-w-3xl mx-auto pt-2 pb-8 space-y-3">
      <header className="glass rounded-3xl p-5">
        <p className="text-xs uppercase tracking-widest text-slate-500">Protection des données</p>
        <h1 className="text-xl font-semibold tracking-tight">Mes données personnelles</h1>
        <p className="text-sm text-slate-600 mt-1">
          Vos droits d'accès, de portabilité et d'effacement —{' '}
          <Link to="/privacy" className="text-blue-700 underline">politique de confidentialité</Link>.
        </p>
      </header>

      {/* Consentements */}
      <section className="glass rounded-3xl p-5 space-y-3">
        <h2 className="font-semibold">Mes consentements</h2>
        {consents === null ? (
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : (
          <ul className="space-y-2">
            {['GPS', 'STORAGE', 'PRIVACY_POLICY'].map((k) => {
              const c = consents[k.toLowerCase()]
              const granted = c?.granted
              return (
                <li key={k} className="glass-soft rounded-2xl p-3 flex items-center gap-3 text-sm">
                  <span className="flex-1">
                    <span className="font-medium">{KIND_LABEL[k]}</span>
                    <span className="block text-xs text-slate-500">
                      {c
                        ? `${granted ? 'Accordé' : 'Refusé'} le ${new Date(c.at).toLocaleString('fr-FR')}`
                        : 'Aucune décision enregistrée'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => toggle(k, !granted)}
                    className={`press text-xs px-3 py-1 rounded-full ${
                      granted
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {granted ? 'Retirer' : 'Accorder'}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Export */}
      <section className="glass rounded-3xl p-5 space-y-3">
        <h2 className="font-semibold">Télécharger mes données <span className="text-xs font-normal text-slate-500">(Art. 25 et 28 LPD)</span></h2>
        <p className="text-sm text-slate-600">
          Récupère un fichier JSON contenant l'intégralité des données que nous détenons à votre sujet
          (profil, pointages, missions, congés, consentements).
        </p>
        <button
          type="button"
          onClick={downloadExport}
          disabled={exporting}
          className="pill pill-primary disabled:opacity-50"
        >
          {exporting ? 'Préparation…' : '⬇ Télécharger (JSON)'}
        </button>
      </section>

      {/* Demande de suppression RH */}
      <section className="glass rounded-3xl p-5 space-y-3">
        <h2 className="font-semibold">
          Demande de suppression RH
          <span className="text-xs font-normal text-slate-500 ml-2">(Art. 32 al. 2 LPD)</span>
        </h2>
        <p className="text-sm text-slate-600">
          La suppression de votre compte engendre la fin effective de votre accès
          à l'application. Pour éviter qu'un clic accidentel ne soit assimilé à
          une rupture du contrat, votre demande est <strong>transmise à votre
          administrateur RH</strong>. Vous resterez actif tant qu'elle n'aura pas
          été traitée.
        </p>
        <p className="text-xs text-slate-500">
          Au moment où l'admin l'approuvera, votre compte sera anonymisé
          (nom, email, mot de passe effacés). Les enregistrements de temps de
          travail sont conservés à des fins comptables et légales (Art. 73 OLT 1)
          mais rattachés à un identifiant anonyme — sans lien avec vous.
        </p>

        {pendingRequest ? (
          <div className="glass-soft rounded-2xl p-3 space-y-2 border-l-4 border-amber-500">
            <p className="text-sm">
              <strong className="text-amber-700">⏳ Demande en attente</strong>
              <span className="text-slate-600">
                {' '}— soumise le{' '}
                {new Date(pendingRequest.created_at).toLocaleString('fr-FR')}
              </span>
            </p>
            {pendingRequest.user_reason && (
              <p className="text-xs text-slate-600 italic">
                Votre motif : « {pendingRequest.user_reason} »
              </p>
            )}
            <p className="text-xs text-slate-500">
              Vous serez notifié par email lors de la décision. Pour annuler,
              contactez directement votre administrateur RH.
            </p>
          </div>
        ) : !requestForm.open ? (
          <button
            type="button"
            onClick={() => setRequestForm({ open: true, reason: '' })}
            className="pill bg-rose-600 text-white"
          >
            Faire une demande de suppression RH
          </button>
        ) : (
          <div className="glass-soft rounded-2xl p-3 space-y-3">
            <label className="block text-sm">
              Motif (optionnel)
              <textarea
                className="glass-input w-full mt-1 h-20"
                placeholder="Ex : départ de l'entreprise au 30/04, retraite, autre…"
                value={requestForm.reason}
                onChange={(e) =>
                  setRequestForm({ ...requestForm, reason: e.target.value })
                }
                maxLength={1000}
              />
            </label>
            <p className="text-xs text-slate-500">
              Votre motif sera visible par l'administrateur RH afin d'orienter
              le traitement (calcul du solde de tout compte, etc.).
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setRequestForm({ open: false, reason: '' })}
                disabled={submitting}
                className="px-4 py-2 text-sm"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={submitDeletionRequest}
                disabled={submitting}
                className="pill bg-rose-600 text-white disabled:opacity-50"
              >
                {submitting ? 'Envoi…' : 'Envoyer la demande à l\'admin RH'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
