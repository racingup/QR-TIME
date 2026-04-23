import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { tokens } from '../api/axiosInstance'
import * as meApi from '../api/me'
import { useAuth } from '../hooks/useAuth'

const KIND_LABEL = {
  GPS: 'Géolocalisation',
  STORAGE: 'Stockage local de session',
  PRIVACY_POLICY: 'Politique de confidentialité',
}

export default function MyDataPage() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [consents, setConsents] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const refreshConsents = () => meApi.consent.get().then(setConsents)
  useEffect(() => { refreshConsents() }, [])

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

  const deleteAccount = async () => {
    setDeleting(true)
    try {
      await meApi.deleteAccount()
      tokens.clear()
      await logout().catch(() => {})
      navigate('/login')
    } catch (e) {
      alert(`Erreur : ${e.response?.data?.error || e.message}`)
      setDeleting(false)
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

      {/* Suppression */}
      <section className="glass rounded-3xl p-5 space-y-3 border-rose-300">
        <h2 className="font-semibold text-rose-700">Supprimer mon compte <span className="text-xs font-normal text-slate-500">(Art. 32 al. 2 LPD)</span></h2>
        <p className="text-sm text-slate-600">
          Votre compte sera <strong>anonymisé</strong> immédiatement (nom, email, mot de passe effacés).
          Les pointages sont conservés à des fins comptables et légales mais rattachés à un identifiant
          anonyme — plus aucun lien avec vous.
        </p>
        <p className="text-xs text-rose-600">
          ⚠ Cette action est <strong>irréversible</strong>. Vous serez déconnecté et ne pourrez plus vous reconnecter.
        </p>
        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="pill bg-rose-600 text-white"
          >
            Demander la suppression
          </button>
        ) : (
          <div className="glass-soft rounded-2xl p-3 space-y-2">
            <p className="text-sm font-medium">Confirmer la suppression définitive ?</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={deleteAccount}
                disabled={deleting}
                className="pill bg-rose-700 text-white disabled:opacity-50"
              >
                {deleting ? 'Suppression…' : 'Oui, supprimer mon compte'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 text-sm"
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
