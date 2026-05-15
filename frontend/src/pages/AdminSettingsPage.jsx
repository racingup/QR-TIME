import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as adminApi from '../api/admin'
import MapPicker from '../components/MapPicker'
import { useAuth } from '../hooks/useAuth'
import { useCompany } from '../hooks/useCompany'

export default function AdminSettingsPage() {
  const { user } = useAuth()
  const canEditUsers = Boolean(user?.is_superuser)
  const tabs = [
    { id: 'sites', label: 'Sites' },
    { id: 'slots', label: 'Plages fixes' },
    { id: 'tolerance', label: 'Arrondis' },
    ...(canEditUsers ? [{ id: 'work-time', label: 'Règles de travail' }] : []),
    ...(canEditUsers ? [{ id: 'users', label: 'Utilisateurs' }] : []),
    ...(canEditUsers ? [{ id: 'company', label: 'Entreprise' }] : []),
    ...(canEditUsers ? [{ id: 'deletion-requests', label: 'Demandes RGPD' }] : []),
    ...(canEditUsers ? [{ id: 'audit', label: 'Audit' }] : []),
  ]
  const [tab, setTab] = useState('sites')
  return (
    <div className="max-w-5xl mx-auto p-3 sm:p-6">
      <h1 className="text-xl sm:text-2xl font-semibold mb-4">Paramètres</h1>
      {/* Sur mobile : 7 onglets impossibles à afficher → scroll horizontal.
          `-mx-3 px-3` étend la zone scrollable bord-à-bord du viewport. */}
      <nav className="flex gap-2 border-b mb-4 overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 sm:px-4 py-2 text-sm whitespace-nowrap shrink-0 ${
              tab === t.id
                ? 'border-b-2 border-blue-600 text-blue-700'
                : 'text-gray-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'sites' && <SitesTab />}
      {tab === 'slots' && <SlotsTab />}
      {tab === 'tolerance' && <ToleranceTab />}
      {tab === 'work-time' && canEditUsers && <WorkTimeTab />}
      {tab === 'users' && canEditUsers && <UsersTab />}
      {tab === 'company' && canEditUsers && <CompanyTab />}
      {tab === 'deletion-requests' && canEditUsers && <DeletionRequestsTab />}
      {tab === 'audit' && canEditUsers && <AuditTab />}
    </div>
  )
}

function CompanyTab() {
  const { refresh: refreshGlobalCompany } = useCompany()
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [err, setErr] = useState(null)

  const reload = () =>
    adminApi.company.get().then(setForm).catch((e) => setErr(e.message))
  useEffect(() => { reload() }, [])

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const onSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    try {
      const updated = await adminApi.company.update(form)
      setForm(updated)
      setSavedAt(new Date())
      // Re-charge le contexte global → couleurs, logo, nom appliqués
      // immédiatement dans le header / login screen sans reload.
      await refreshGlobalCompany()
    } catch (e) {
      const data = e?.response?.data
      setErr(data ? JSON.stringify(data) : e.message)
    } finally {
      setSaving(false)
    }
  }

  // Conversion fichier → data URL avec redimensionnement à 256 px max.
  // Permet de respecter la limite 200 KB sans avoir à demander à l'admin
  // de réduire son logo lui-même.
  const onLogoFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setErr(null)
    try {
      const dataUrl = await resizeImageToDataUrl(file, 256)
      set({ logo_data_url: dataUrl })
    } catch (err) {
      setErr(`Lecture du fichier impossible : ${err.message}`)
    }
  }

  if (!form) return <p className="text-sm text-slate-500">Chargement…</p>

  return (
    <form onSubmit={onSubmit} className="space-y-5 max-w-2xl">
      <section className="bg-amber-50 border-l-4 border-amber-400 p-3 text-sm space-y-1">
        <p className="font-medium text-amber-900">
          Configuration entreprise
        </p>
        <p className="text-amber-800 text-xs">
          Ces informations sont utilisées par la <strong>politique de
          confidentialité</strong> (interpolation : nom du responsable, contact
          DPO, adresse — Art. 14 LPD) et par le <strong>branding</strong> de
          l'application (logo + couleurs visibles partout, y compris sur la
          page de connexion).
        </p>
      </section>

      {/* ── Identification ── */}
      <fieldset className="space-y-3">
        <legend className="font-medium">Identification</legend>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm col-span-2">
            Raison sociale
            <input
              type="text" className="border rounded p-2 w-full mt-1"
              value={form.name || ''}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="Acme SA"
            />
          </label>
          <label className="text-sm">
            Forme juridique
            <input
              type="text" className="border rounded p-2 w-full mt-1"
              value={form.legal_form || ''}
              onChange={(e) => set({ legal_form: e.target.value })}
              placeholder="SA / Sàrl / AG / GmbH / …"
            />
          </label>
          <label className="text-sm">
            Pays
            <input
              type="text" className="border rounded p-2 w-full mt-1"
              value={form.country || ''}
              onChange={(e) => set({ country: e.target.value })}
            />
          </label>
        </div>

        <label className="text-sm block">
          Adresse
          <input
            type="text" className="border rounded p-2 w-full mt-1"
            value={form.address_line || ''}
            onChange={(e) => set({ address_line: e.target.value })}
            placeholder="Rue de l'Industrie 12"
          />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-sm">
            NPA
            <input
              type="text" className="border rounded p-2 w-full mt-1"
              value={form.postal_code || ''}
              onChange={(e) => set({ postal_code: e.target.value })}
              maxLength={10}
            />
          </label>
          <label className="text-sm col-span-2">
            Ville
            <input
              type="text" className="border rounded p-2 w-full mt-1"
              value={form.city || ''}
              onChange={(e) => set({ city: e.target.value })}
            />
          </label>
        </div>
      </fieldset>

      {/* ── Contact protection des données ── */}
      <fieldset className="space-y-3">
        <legend className="font-medium">
          Contact protection des données <span className="text-xs text-slate-500">(Art. 14 LPD)</span>
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">
            Email DPO
            <input
              type="email" className="border rounded p-2 w-full mt-1"
              value={form.dpo_contact_email || ''}
              onChange={(e) => set({ dpo_contact_email: e.target.value })}
              placeholder="dpo@entreprise.ch"
            />
          </label>
          <label className="text-sm">
            Téléphone (optionnel)
            <input
              type="tel" className="border rounded p-2 w-full mt-1"
              value={form.dpo_contact_phone || ''}
              onChange={(e) => set({ dpo_contact_phone: e.target.value })}
              placeholder="+41 …"
            />
          </label>
        </div>
        <label className="text-sm block">
          Texte additionnel pour la politique de confidentialité (optionnel)
          <textarea
            className="border rounded p-2 w-full mt-1 h-24"
            value={form.privacy_policy_extra || ''}
            onChange={(e) => set({ privacy_policy_extra: e.target.value })}
            placeholder="Mentions sectorielles, sous-traitants spécifiques, …"
          />
        </label>
      </fieldset>

      {/* ── Branding ── */}
      <fieldset className="space-y-3">
        <legend className="font-medium">Branding</legend>
        <div className="grid grid-cols-[1fr_120px] gap-3 items-start">
          <label className="text-sm block">
            Logo (PNG / JPG / SVG — redimensionné à 256 px max)
            <input
              type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="block mt-1 text-xs"
              onChange={onLogoFile}
            />
            {form.logo_data_url && (
              <button
                type="button"
                onClick={() => set({ logo_data_url: '' })}
                className="text-xs text-rose-700 hover:underline mt-1"
              >
                Effacer le logo
              </button>
            )}
          </label>
          <div className="border rounded p-2 bg-white text-center">
            <p className="text-[10px] text-slate-500 mb-1">aperçu</p>
            {form.logo_data_url ? (
              <img
                src={form.logo_data_url} alt="logo"
                className="w-20 h-20 mx-auto object-contain"
              />
            ) : (
              <p className="text-xs text-slate-400">aucun</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            Couleur primaire
            <div className="flex items-center gap-2 mt-1">
              <input
                type="color"
                className="h-10 w-14 border rounded cursor-pointer"
                value={form.primary_color || '#1e3a5f'}
                onChange={(e) => set({ primary_color: e.target.value })}
              />
              <input
                type="text"
                className="border rounded p-2 flex-1 font-mono text-xs"
                value={form.primary_color || ''}
                onChange={(e) => set({ primary_color: e.target.value })}
                placeholder="#1e3a5f"
                maxLength={9}
              />
            </div>
          </label>
          <label className="text-sm">
            Couleur secondaire
            <div className="flex items-center gap-2 mt-1">
              <input
                type="color"
                className="h-10 w-14 border rounded cursor-pointer"
                value={form.secondary_color || '#10b981'}
                onChange={(e) => set({ secondary_color: e.target.value })}
              />
              <input
                type="text"
                className="border rounded p-2 flex-1 font-mono text-xs"
                value={form.secondary_color || ''}
                onChange={(e) => set({ secondary_color: e.target.value })}
                placeholder="#10b981"
                maxLength={9}
              />
            </div>
          </label>
        </div>
      </fieldset>

      {err && (
        <p className="text-xs text-rose-700 bg-rose-50 rounded p-2 break-all">
          ⚠ {err}
        </p>
      )}
      {savedAt && !err && (
        <p className="text-xs text-emerald-700">
          ✓ Enregistré à {savedAt.toLocaleTimeString('fr-FR')} — appliqué partout dans l'app.
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit" disabled={saving}
          className="bg-blue-600 text-white px-5 py-2 rounded disabled:opacity-50"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  )
}

/**
 * Lit un File image, le redimensionne (côté CLIENT — pas d'envoi de gros
 * fichiers au backend) et renvoie un data URL PNG.
 * SVG passe tel quel (vectoriel, pas besoin de redimensionner).
 */
function resizeImageToDataUrl(file, maxSide) {
  return new Promise((resolve, reject) => {
    if (file.type === 'image/svg+xml') {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('Lecture SVG échouée'))
      reader.readAsDataURL(file)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const ratio = Math.min(1, maxSide / Math.max(img.width, img.height))
        const w = Math.round(img.width * ratio)
        const h = Math.round(img.height * ratio)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)
        // PNG préserve la transparence. Quality 0.9 négligé en PNG.
        resolve(canvas.toDataURL('image/png'))
      }
      img.onerror = () => reject(new Error('Image illisible'))
      img.src = reader.result
    }
    reader.onerror = () => reject(new Error('Lecture du fichier échouée'))
    reader.readAsDataURL(file)
  })
}

function DeletionRequestsTab() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('PENDING')
  const [decisionFor, setDecisionFor] = useState(null) // {req, action:'approve'|'reject'}

  const refresh = () => {
    setLoading(true)
    adminApi.deletionRequests
      .list(filter === 'ALL' ? '' : filter)
      .then((d) => setRows(d.results || []))
      .finally(() => setLoading(false))
  }
  useEffect(refresh, [filter])

  const fmt = (iso) => new Date(iso).toLocaleString('fr-FR')
  const badge = {
    PENDING: 'bg-amber-100 text-amber-800',
    APPROVED: 'bg-emerald-100 text-emerald-800',
    REJECTED: 'bg-slate-200 text-slate-700',
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border-l-4 border-blue-400 p-3 text-sm space-y-1">
        <p className="font-medium text-blue-900">
          Inbox RH — demandes de suppression de compte (Art. 32 al. 2 LPD)
        </p>
        <p className="text-blue-800 text-xs">
          <strong>Approuver</strong> déclenche immédiatement l'anonymisation
          du compte (nom, email, mot de passe effacés, username remplacé par
          <code> deleted_N</code>). Les pointages sont préservés mais anonymes.
          À faire <u>après</u> la sortie effective du collaborateur (solde de
          tout compte réglé). <strong>Refuser</strong> trace la décision avec
          un motif — à utiliser si la demande est prématurée ou doit passer
          par le SIRH.
        </p>
      </div>

      <div className="flex gap-2">
        {['PENDING', 'APPROVED', 'REJECTED', 'ALL'].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`text-xs px-3 py-1 rounded-full ${
              filter === s ? 'bg-slate-900 text-white' : 'bg-white border'
            }`}
          >
            {s === 'ALL' ? 'Tout' : s === 'PENDING' ? 'En attente' : s === 'APPROVED' ? 'Approuvées' : 'Refusées'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500 bg-slate-50 rounded p-4 text-center">
          Aucune demande pour ce filtre.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="bg-white border rounded-lg p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-mono text-xs text-slate-500">#{r.id}</span>
                <span className="font-semibold">{r.username}</span>
                <span className="text-slate-400">·</span>
                <span className="text-xs text-slate-500">
                  soumise le {fmt(r.created_at)}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${badge[r.status]}`}>
                  {r.status}
                </span>
              </div>
              {r.user_reason && (
                <p className="text-sm text-slate-700 bg-slate-50 rounded px-2 py-1 italic">
                  💬 « {r.user_reason} »
                </p>
              )}
              {r.admin_comment && (
                <p className="text-sm text-slate-700 bg-blue-50 rounded px-2 py-1">
                  <span className="text-xs text-slate-500">Admin ({r.decided_by_username}) :</span>{' '}
                  {r.admin_comment}
                </p>
              )}
              {r.status === 'PENDING' && (
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setDecisionFor({ req: r, action: 'approve' })}
                    className="text-xs px-3 py-1 rounded bg-rose-600 text-white"
                    title="Anonymise le compte maintenant"
                  >
                    ✓ Approuver + anonymiser
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecisionFor({ req: r, action: 'reject' })}
                    className="text-xs px-3 py-1 rounded bg-slate-200"
                  >
                    ✕ Refuser
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {decisionFor && (
        <DeletionDecisionModal
          req={decisionFor.req}
          action={decisionFor.action}
          onClose={() => setDecisionFor(null)}
          onSaved={() => { setDecisionFor(null); refresh() }}
        />
      )}
    </div>
  )
}

function DeletionDecisionModal({ req, action, onClose, onSaved }) {
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const submit = async () => {
    setSaving(true)
    setErr(null)
    try {
      await adminApi.deletionRequests.decide(req.id, action, comment)
      onSaved()
    } catch (e) {
      setErr(e?.response?.data?.error || e.message)
      setSaving(false)
    }
  }

  const destructive = action === 'approve'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" role="dialog">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-3">
        <h3 className="font-semibold">
          {destructive ? '⚠ Approuver et anonymiser' : 'Refuser la demande'}
          {' '}de <span className="font-mono">{req.username}</span>
        </h3>
        {destructive && (
          <p className="text-xs text-rose-700 bg-rose-50 rounded p-2">
            Cette action va <strong>anonymiser immédiatement</strong> le compte.
            Le collaborateur ne pourra plus se connecter. Les pointages sont
            préservés mais rattachés à <code>deleted_N</code>. Action
            irréversible — à faire uniquement après sa sortie effective.
          </p>
        )}
        <label className="block text-sm">
          Commentaire {destructive ? '(optionnel)' : '(motif du refus)'}
          <textarea
            className="w-full border rounded p-2 mt-1 h-24 text-sm"
            placeholder={destructive
              ? 'Ex : STC effectué le 30/04, accès retiré'
              : 'Ex : demande prématurée, le collaborateur est encore en préavis'
            }
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
          />
        </label>
        {err && <p className="text-xs text-rose-700 bg-rose-50 rounded p-2">⚠ {err}</p>}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm"
          >Annuler</button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className={`px-4 py-2 text-sm text-white rounded disabled:opacity-50 ${
              destructive ? 'bg-rose-600' : 'bg-slate-700'
            }`}
          >
            {saving ? 'Traitement…' : destructive ? 'Anonymiser maintenant' : 'Refuser'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AuditTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ action: '', target_user: '', start: '', end: '' })

  const refresh = () => {
    setLoading(true)
    const params = Object.fromEntries(
      Object.entries(filter).filter(([, v]) => v),
    )
    adminApi.audit.list({ ...params, limit: 200 })
      .then(setData)
      .finally(() => setLoading(false))
  }

  useEffect(() => { refresh() /* eslint-disable-next-line */ }, [])

  const actionLabel = (val) =>
    data?.actions_choices.find((c) => c.value === val)?.label || val

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap gap-2 items-end bg-gray-50 border p-3 rounded">
        <label className="text-sm">
          Action
          <select
            className="border rounded p-1 ml-2"
            value={filter.action}
            onChange={(e) => setFilter({ ...filter, action: e.target.value })}
          >
            <option value="">— toutes —</option>
            {data?.actions_choices.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          User cible #
          <input
            type="number" placeholder="id"
            className="border rounded p-1 ml-2 w-20"
            value={filter.target_user}
            onChange={(e) => setFilter({ ...filter, target_user: e.target.value })}
          />
        </label>
        <label className="text-sm">
          Du
          <input
            type="date" className="border rounded p-1 ml-2"
            value={filter.start}
            onChange={(e) => setFilter({ ...filter, start: e.target.value })}
          />
        </label>
        <label className="text-sm">
          Au
          <input
            type="date" className="border rounded p-1 ml-2"
            value={filter.end}
            onChange={(e) => setFilter({ ...filter, end: e.target.value })}
          />
        </label>
        <button type="button" onClick={refresh} className="bg-blue-600 text-white px-3 py-1 rounded text-sm">
          Filtrer
        </button>
      </header>

      {loading || !data ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : data.results.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun événement pour ce filtre.</p>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            {data.count} événement(s) affichés (limite : {data.limit}). Append-only — non modifiable.
          </p>
          <div className="overflow-x-auto -mx-3 sm:mx-0">
          <table className="min-w-[720px] sm:min-w-0 w-full text-xs bg-white border">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-2">Quand</th>
                <th className="p-2">Acteur</th>
                <th className="p-2">Action</th>
                <th className="p-2">Cible</th>
                <th className="p-2">Objet</th>
                <th className="p-2">Détails</th>
                <th className="p-2">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.results.map((r) => (
                <tr key={r.id} className="hover:bg-blue-50/40">
                  <td className="p-2 font-mono whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString('fr-FR')}
                  </td>
                  <td className="p-2">
                    {r.actor_username || <span className="text-slate-400">système</span>}
                  </td>
                  <td className="p-2 font-medium">{actionLabel(r.action)}</td>
                  <td className="p-2">
                    {r.target_username || (r.target_user_id ? `#${r.target_user_id}` : '—')}
                  </td>
                  <td className="p-2 text-slate-500">
                    {r.object_type && `${r.object_type} #${r.object_id}`}
                  </td>
                  <td className="p-2 text-slate-500">
                    {Object.keys(r.details || {}).length > 0 && (
                      <code className="text-[10px]">{JSON.stringify(r.details)}</code>
                    )}
                  </td>
                  <td className="p-2 font-mono text-slate-400">{r.ip_address || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}
    </div>
  )
}

function SitesTab() {
  const [sites, setSites] = useState([])
  const [editing, setEditing] = useState(null) // site object or { new: true }

  const refresh = () => adminApi.sites.list().then((d) => setSites(d.results || d))
  useEffect(() => { refresh() }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setEditing({ new: true, name: '', latitude: '', longitude: '', gps_radius_meters: 150 })}
          className="bg-blue-600 text-white px-3 py-1 rounded text-sm"
        >
          + Nouveau site
        </button>
      </div>

      {editing && (
        <SiteEditor
          site={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh() }}
        />
      )}

      <ul className="divide-y border rounded bg-white">
        {sites.map((s) => (
          <li key={s.id} className="p-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <span className="font-semibold w-32 sm:w-40 truncate">{s.name}</span>
            <span className="text-gray-500 font-mono text-xs">
              {Number(s.latitude).toFixed(4)}, {Number(s.longitude).toFixed(4)}
            </span>
            <span className="text-gray-500">±{s.gps_radius_meters}m</span>
            <span className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setEditing({ ...s })}
                className="bg-blue-600 text-white px-3 py-1 rounded text-xs"
              >
                Éditer
              </button>
              <Link
                to={`/admin/sites/${s.id}/qr`}
                className="bg-gray-700 text-white px-3 py-1 rounded text-xs"
              >
                QR
              </Link>
              <button
                type="button"
                onClick={async () => { await adminApi.sites.regenQr(s.id); refresh() }}
                className="bg-amber-600 text-white px-3 py-1 rounded text-xs"
              >
                Nouveau QR
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (window.confirm(`Supprimer "${s.name}" ?`)) {
                    await adminApi.sites.remove(s.id); refresh()
                  }
                }}
                className="bg-red-600 text-white px-3 py-1 rounded text-xs"
              >
                Suppr.
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SiteEditor({ site, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: site.name || '',
    latitude: site.latitude || '',
    longitude: site.longitude || '',
    gps_radius_meters: site.gps_radius_meters || 150,
  })
  const [saving, setSaving] = useState(false)

  const onSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (site.new) {
        await adminApi.sites.create(form)
      } else {
        await adminApi.sites.update(site.id, form)
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-gray-50 border p-4 rounded space-y-3">
      {/* Form for the site itself — siblings (holidays editor) live OUTSIDE
          to avoid nested-form HTML restrictions. */}
      <form onSubmit={onSave} className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{site.new ? 'Nouveau site' : `Éditer ${site.name}`}</h3>
          <button type="button" onClick={onClose} className="text-sm text-gray-500">✕</button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <input className="border rounded p-2 col-span-2" placeholder="Nom"
                 value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className="border rounded p-2" placeholder="Latitude" type="number" step="0.000001"
                 value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} required />
          <input className="border rounded p-2" placeholder="Longitude" type="number" step="0.000001"
                 value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} required />
          <label className="col-span-4 block text-sm">
            Rayon GPS (m)
            <input className="border rounded p-2 ml-2 w-24" type="number" min="10"
                   value={form.gps_radius_meters}
                   onChange={(e) => setForm({ ...form, gps_radius_meters: Number(e.target.value) })} />
          </label>
        </div>
        <div>
          <p className="text-sm mb-1">Clique sur la carte pour placer le site :</p>
          <MapPicker
            lat={form.latitude ? Number(form.latitude) : undefined}
            lon={form.longitude ? Number(form.longitude) : undefined}
            radius={Number(form.gps_radius_meters)}
            onPick={(lat, lon) =>
              setForm({ ...form, latitude: lat.toFixed(6), longitude: lon.toFixed(6) })
            }
          />
        </div>
        <div className="flex gap-2">
          <button disabled={saving} className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50">
            {saving ? 'Enregistrement…' : site.new ? 'Créer' : 'Enregistrer'}
          </button>
          <button type="button" onClick={onClose} className="bg-gray-300 px-4 py-2 rounded">
            Annuler
          </button>
        </div>
      </form>

      {!site.new && site.id && <SiteHolidaysEditor siteId={site.id} />}
    </div>
  )
}

function SiteHolidaysEditor({ siteId }) {
  const [items, setItems] = useState([])
  const [form, setForm] = useState({ date: '', name: '' })

  const refresh = () =>
    adminApi.holidays.list(siteId).then((d) => setItems(d.results || d))

  useEffect(() => { refresh() /* eslint-disable-next-line */ }, [siteId])

  const onAdd = async (e) => {
    e.preventDefault()
    if (!form.date || !form.name) return
    await adminApi.holidays.create({ site: siteId, date: form.date, name: form.name })
    setForm({ date: '', name: '' })
    refresh()
  }

  const onRemove = async (id) => {
    await adminApi.holidays.remove(id)
    refresh()
  }

  return (
    <div className="bg-white border rounded p-3 mt-3 space-y-2">
      <h4 className="font-semibold text-sm">Jours fériés du site</h4>
      <form onSubmit={onAdd} className="flex flex-wrap gap-2 items-end">
        <input type="date" className="border rounded p-1 text-sm"
               value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <input type="text" className="border rounded p-1 text-sm flex-1"
               placeholder="Ex : Pont de l'Ascension"
               value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <button className="bg-blue-600 text-white px-3 py-1 rounded text-sm">+ Ajouter</button>
      </form>
      {items.length === 0 ? (
        <p className="text-xs text-gray-500">Aucun jour férié configuré.</p>
      ) : (
        <ul className="text-sm divide-y">
          {items.map((h) => (
            <li key={h.id} className="flex items-center justify-between py-1">
              <span>
                <span className="font-mono">{h.date}</span> · {h.name}
              </span>
              <button
                type="button"
                onClick={() => onRemove(h.id)}
                className="text-red-700 text-xs"
              >
                Suppr.
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SlotsTab() {
  const [slots, setSlots] = useState([])
  const [form, setForm] = useState({ name: '', start_time: '', end_time: '' })

  const refresh = () => adminApi.fixedSlots.list().then((d) => setSlots(d.results || d))
  useEffect(() => { refresh() }, [])

  const onCreate = async (e) => {
    e.preventDefault()
    await adminApi.fixedSlots.create(form)
    setForm({ name: '', start_time: '', end_time: '' })
    refresh()
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onCreate} className="grid grid-cols-4 gap-2 items-end bg-gray-50 border p-3 rounded">
        <input className="border rounded p-2 col-span-2" placeholder="Nom"
               value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input className="border rounded p-2" type="time"
               value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} required />
        <input className="border rounded p-2" type="time"
               value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} required />
        <button className="col-span-4 bg-blue-600 text-white py-2 rounded">Ajouter une plage</button>
      </form>
      <ul className="divide-y border rounded bg-white">
        {slots.map((s) => (
          <li key={s.id} className="p-3 flex items-center gap-3 text-sm">
            <span className="font-semibold">{s.name}</span>
            <span className="text-gray-500">{s.start_time} → {s.end_time}</span>
            <button
              className="ml-auto bg-red-600 text-white px-3 py-1 rounded text-xs"
              onClick={async () => { await adminApi.fixedSlots.remove(s.id); refresh() }}
            >
              Suppr.
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ToleranceTab() {
  const [cfg, setCfg] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { adminApi.tolerance.get().then(setCfg) }, [])
  if (!cfg) return <p>Chargement…</p>

  const onSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const updated = await adminApi.tolerance.update(cfg)
      setCfg(updated)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSave} className="space-y-3 max-w-md">
      <label className="block">
        <span className="text-sm">Tolérance (minutes)</span>
        <input
          type="number" min="0" max="60"
          className="w-full border rounded p-2 mt-1"
          value={cfg.tolerance_minutes}
          onChange={(e) => setCfg({ ...cfg, tolerance_minutes: Number(e.target.value) })}
        />
      </label>
      <label className="block">
        <span className="text-sm">Direction d'arrondi</span>
        <select
          className="w-full border rounded p-2 mt-1"
          value={cfg.rounding_direction}
          onChange={(e) => setCfg({ ...cfg, rounding_direction: e.target.value })}
        >
          <option value="NEAREST">Plus proche</option>
          <option value="DOWN">Inférieur</option>
          <option value="UP">Supérieur</option>
        </select>
      </label>
      <button disabled={saving} className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50">
        {saving ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </form>
  )
}

function UsersTab() {
  const [users, setUsers] = useState([])
  const [sites, setSites] = useState([])
  const [form, setForm] = useState({
    username: '', password: '', weekly_target_hours: 42, vacation_quota: 25,
    is_manager: false, is_mission_manager: false, home_site: '',
    exempt_from_clocking: false, can_edit_locked_months: false, manager: '',
  })
  // Modal d'édition du domicile sur carte (null si fermée).
  const [homeEditing, setHomeEditing] = useState(null)

  const refresh = () => adminApi.users.list().then((d) => setUsers(d.results || d))
  useEffect(() => {
    refresh()
    adminApi.sites.list().then((d) => setSites(d.results || d))
  }, [])

  const updateField = async (id, field, value) => {
    // Le backend renvoie l'objet à jour — on s'en sert pour récupérer aussi
    // les champs recalculés côté serveur (notamment standard_commute_minutes
    // après changement de home_lat/home_lon ou home_site).
    const payload = { [field]: value === '' ? null : value }
    const updated = await adminApi.users.update(id, payload)
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...updated } : u)))
  }

  const updateMany = async (id, payload) => {
    const updated = await adminApi.users.update(id, payload)
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...updated } : u)))
  }

  const onCreate = async (e) => {
    e.preventDefault()
    const payload = { ...form, home_site: form.home_site || null }
    await adminApi.users.create(payload)
    setForm({
      username: '', password: '', weekly_target_hours: 42, vacation_quota: 25,
      is_manager: false, is_mission_manager: false, home_site: '',
      exempt_from_clocking: false, can_edit_locked_months: false, manager: '',
    })
    refresh()
  }

  const onDelete = async (u) => {
    if (!window.confirm(`Supprimer "${u.username}" ?`)) return
    await adminApi.users.remove(u.id)
    refresh()
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onCreate} className="grid grid-cols-6 gap-2 items-end bg-gray-50 border p-3 rounded">
        <input className="border rounded p-2 col-span-2" placeholder="Nom d'utilisateur"
               value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
        <input className="border rounded p-2 col-span-2" placeholder="Mot de passe" type="text"
               value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <input className="border rounded p-2" placeholder="h/sem" type="number" step="0.5"
               value={form.weekly_target_hours} onChange={(e) => setForm({ ...form, weekly_target_hours: e.target.value })} />
        <input className="border rounded p-2" placeholder="Congés" type="number"
               value={form.vacation_quota} onChange={(e) => setForm({ ...form, vacation_quota: Number(e.target.value) })} />
        <select className="border rounded p-2 col-span-3"
                value={form.home_site}
                onChange={(e) => setForm({ ...form, home_site: e.target.value ? Number(e.target.value) : '' })}>
          <option value="">— site de rattachement —</option>
          {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <label className="col-span-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_manager}
                 onChange={(e) => setForm({ ...form, is_manager: e.target.checked })} />
          Manager
        </label>
        <label className="col-span-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_mission_manager}
                 onChange={(e) => setForm({ ...form, is_mission_manager: e.target.checked })} />
          Mission Manager
        </label>
        <label className="col-span-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.exempt_from_clocking}
                 onChange={(e) => setForm({ ...form, exempt_from_clocking: e.target.checked })} />
          Non-badgeur
        </label>
        <label className="col-span-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.can_edit_locked_months}
                 onChange={(e) => setForm({ ...form, can_edit_locked_months: e.target.checked })} />
          Peut modifier mois verrouillés
        </label>
        <button className="col-span-6 bg-blue-600 text-white py-2 rounded">
          Créer un collaborateur
        </button>
      </form>

      {/* Table users : 10 colonnes (#ID, username, site, domicile, trajet,
          h/sem, congés, manager, mission_mgr, action). Largement >402 px → scroll. */}
      <div className="overflow-x-auto -mx-3 sm:mx-0">
      <table className="min-w-[900px] sm:min-w-0 w-full text-sm border bg-white">
        <thead className="bg-gray-50 text-left">
          <tr>
            <th className="p-2 font-mono text-xs">ID</th>
            <th className="p-2">Utilisateur</th>
            <th className="p-2">Site</th>
            <th className="p-2" title="Domicile sélectionné sur carte">🏠 Domicile</th>
            <th className="p-2" title="Trajet domicile → site, ALLER simple, en minutes">🚗 Trajet</th>
            <th className="p-2">Heures/sem</th>
            <th className="p-2">Quota congés</th>
            <th className="p-2">Manager direct</th>
            <th className="p-2">Manager</th>
            <th className="p-2">Mission Mgr</th>
            <th className="p-2" title="Non soumis au timbrage">Non-badgeur</th>
            <th className="p-2" title="Peut modifier les mois verrouillés">🔓 Mois</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {users.map((u) => {
            const isAnonymized = /^deleted_\d+$/.test(u.username || '')
            return (
            <tr key={u.id} className={isAnonymized ? 'bg-slate-50 text-slate-500 italic' : ''}>
              <td className="p-2 font-mono text-xs text-slate-700">#{u.id}</td>
              <td className="p-2">
                {isAnonymized ? (
                  <span title="Compte anonymisé (LPD Art. 32 al. 2)">
                    🕯 {u.username}
                  </span>
                ) : (
                  <input
                    type="text" className="border rounded p-1 w-40"
                    defaultValue={u.username}
                    onBlur={(e) => {
                      if (e.target.value !== u.username) {
                        updateField(u.id, 'username', e.target.value)
                      }
                    }}
                  />
                )}
              </td>
              <td className="p-2">
                <select
                  className="border rounded p-1"
                  value={u.home_site || ''}
                  onChange={(e) =>
                    updateField(u.id, 'home_site', e.target.value ? Number(e.target.value) : '')
                  }
                >
                  <option value="">—</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </td>
              <td className="p-2">
                {/* Domicile : badge cliquable qui ouvre la modal MapPicker. */}
                <button
                  type="button"
                  onClick={() => !isAnonymized && setHomeEditing(u)}
                  disabled={isAnonymized}
                  className={`text-xs px-2 py-1 rounded border ${
                    u.home_lat != null && u.home_lon != null
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                      : 'bg-amber-50 text-amber-700 border-amber-300'
                  } ${isAnonymized ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-50'}`}
                  title={
                    u.home_lat != null
                      ? `lat ${Number(u.home_lat).toFixed(4)}, lon ${Number(u.home_lon).toFixed(4)}`
                      : 'Cliquer pour définir sur la carte'
                  }
                >
                  {u.home_lat != null ? '📍 défini' : '+ définir'}
                </button>
              </td>
              <td className="p-2">
                {/* Trajet : éditable manuellement, badge "auto" sinon. */}
                <input
                  type="number" min="0" max="999"
                  className="border rounded p-1 w-16 text-right"
                  defaultValue={u.standard_commute_minutes ?? ''}
                  placeholder="—"
                  disabled={isAnonymized}
                  onBlur={(e) => {
                    const v = e.target.value === '' ? null : Number(e.target.value)
                    if (v !== (u.standard_commute_minutes ?? null)) {
                      updateField(u.id, 'standard_commute_minutes', v)
                    }
                  }}
                  title="Trajet aller simple en minutes (×2 pour A/R dans les calculs)"
                />
                <span className="text-[10px] text-slate-500 ml-1">min</span>
              </td>
              <td className="p-2">
                <input
                  type="number" step="0.5" className="border rounded p-1 w-24"
                  defaultValue={u.weekly_target_hours}
                  onBlur={(e) => updateField(u.id, 'weekly_target_hours', e.target.value)}
                />
              </td>
              <td className="p-2">
                <input
                  type="number" className="border rounded p-1 w-20"
                  defaultValue={u.vacation_quota}
                  onBlur={(e) => updateField(u.id, 'vacation_quota', Number(e.target.value))}
                />
              </td>
              <td className="p-2">
                {/* Manager direct (pour les notifications email) */}
                <select
                  className="border rounded p-1 text-xs max-w-[120px]"
                  value={u.manager || ''}
                  onChange={(e) => updateField(u.id, 'manager', e.target.value ? Number(e.target.value) : null)}
                  disabled={isAnonymized}
                >
                  <option value="">—</option>
                  {users.filter((x) => x.is_manager && x.id !== u.id).map((m) => (
                    <option key={m.id} value={m.id}>{m.username}</option>
                  ))}
                </select>
              </td>
              <td className="p-2">
                <input
                  type="checkbox"
                  defaultChecked={u.is_manager}
                  onChange={(e) => updateField(u.id, 'is_manager', e.target.checked)}
                />
              </td>
              <td className="p-2">
                <input
                  type="checkbox"
                  defaultChecked={u.is_mission_manager}
                  onChange={(e) => updateField(u.id, 'is_mission_manager', e.target.checked)}
                />
              </td>
              <td className="p-2">
                <input
                  type="checkbox"
                  defaultChecked={u.exempt_from_clocking}
                  onChange={(e) => updateField(u.id, 'exempt_from_clocking', e.target.checked)}
                  disabled={isAnonymized}
                />
              </td>
              <td className="p-2">
                <input
                  type="checkbox"
                  defaultChecked={u.can_edit_locked_months}
                  onChange={(e) => updateField(u.id, 'can_edit_locked_months', e.target.checked)}
                  disabled={isAnonymized}
                />
              </td>
              <td className="p-2">
                {!isAnonymized && (
                  <button
                    type="button"
                    onClick={() => onDelete(u)}
                    className="bg-red-600 text-white px-3 py-1 rounded text-xs"
                  >
                    Suppr.
                  </button>
                )}
              </td>
            </tr>
          )})}
        </tbody>
      </table>
      </div>

      {homeEditing && (
        <HomeAddressModal
          user={homeEditing}
          siteCenter={(() => {
            const s = sites.find((x) => x.id === homeEditing.home_site)
            return s ? [Number(s.latitude), Number(s.longitude)] : null
          })()}
          onClose={() => setHomeEditing(null)}
          onSave={async (lat, lon) => {
            await updateMany(homeEditing.id, { home_lat: lat, home_lon: lon })
            setHomeEditing(null)
          }}
          onClear={async () => {
            await updateMany(homeEditing.id, { home_lat: null, home_lon: null })
            setHomeEditing(null)
          }}
        />
      )}
    </div>
  )
}

// ── WorkTimeTab — Règles de travail paramétrables ─────────────────────────

function WorkTimeTab() {
  const [policy, setPolicy] = useState(null)
  const [rules, setRules] = useState([])
  const [saving, setSaving] = useState(false)
  const [ruleForm, setRuleForm] = useState({
    description: '', day_type: 'ALL', threshold_minutes: 510, rate: '1.25', order: 0,
  })
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(null)

  const refresh = () => {
    adminApi.workTimePolicy.get().then(setPolicy)
    adminApi.majorationRules.list().then((d) => setRules(d.results || d))
  }
  useEffect(() => { refresh() }, [])

  const savePolicy = async (e) => {
    e.preventDefault()
    setSaving(true); setErr(null); setOk(null)
    try {
      const updated = await adminApi.workTimePolicy.update(policy)
      setPolicy(updated)
      setOk('Politique enregistrée.')
    } catch (e) {
      setErr(e?.response?.data ? JSON.stringify(e.response.data) : e.message)
    } finally { setSaving(false) }
  }

  const createRule = async (e) => {
    e.preventDefault()
    await adminApi.majorationRules.create({
      ...ruleForm,
      threshold_minutes: Number(ruleForm.threshold_minutes),
      rate: String(ruleForm.rate),
      order: Number(ruleForm.order),
    })
    setRuleForm({ description: '', day_type: 'ALL', threshold_minutes: 510, rate: '1.25', order: 0 })
    refresh()
  }

  const toggleRule = async (rule) => {
    await adminApi.majorationRules.update(rule.id, { is_active: !rule.is_active })
    refresh()
  }

  const deleteRule = async (rule) => {
    if (!window.confirm(`Supprimer la règle "${rule.description}" ?`)) return
    await adminApi.majorationRules.remove(rule.id)
    refresh()
  }

  const p = (field) => (e) => setPolicy((prev) => ({ ...prev, [field]: e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value) }))

  if (!policy) return <div className="animate-pulse h-32 glass rounded-2xl" />

  return (
    <div className="space-y-8">

      {/* ── Règles de majoration ─────────────────────────────────────── */}
      <section className="glass rounded-2xl p-5">
        <h2 className="font-semibold text-base mb-4">Règles de majoration horaire</h2>
        <p className="text-xs text-slate-500 mb-4">
          Les heures travaillées au-delà du seuil configuré sont pondérées par le taux de majoration.
          Plusieurs règles peuvent coexister (types de jours différents).
        </p>

        {/* Existing rules */}
        <div className="space-y-2 mb-4">
          {rules.length === 0 && <p className="text-sm text-slate-400">Aucune règle configurée.</p>}
          {rules.map((r) => (
            <div key={r.id} className={`glass-soft rounded-xl p-3 flex items-center gap-3 ${!r.is_active ? 'opacity-50' : ''}`}>
              <div className="flex-1">
                <p className="text-sm font-medium">{r.description}</p>
                <p className="text-xs text-slate-500">
                  {r.get_day_type_display ?? r.day_type} · au-delà de {r.threshold_display} · {r.rate_display}
                </p>
              </div>
              <button
                type="button"
                onClick={() => toggleRule(r)}
                className={`text-xs px-2 py-1 rounded border ${r.is_active ? 'border-emerald-400 text-emerald-700' : 'border-slate-300 text-slate-500'}`}
              >
                {r.is_active ? 'Actif' : 'Inactif'}
              </button>
              <button type="button" onClick={() => deleteRule(r)} className="text-xs text-rose-600 hover:bg-rose-50 px-2 py-1 rounded">✕</button>
            </div>
          ))}
        </div>

        {/* New rule form */}
        <form onSubmit={createRule} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end bg-slate-50 border rounded-xl p-3">
          <input
            className="border rounded p-2 col-span-2"
            placeholder="Libellé (ex: Heures sup.)"
            value={ruleForm.description}
            onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })}
            required
          />
          <select
            className="border rounded p-2"
            value={ruleForm.day_type}
            onChange={(e) => setRuleForm({ ...ruleForm, day_type: e.target.value })}
          >
            <option value="ALL">Tous les jours</option>
            <option value="WEEKDAY">Jours ouvrés</option>
            <option value="WEEKEND">Weekend</option>
            <option value="HOLIDAY">Jours fériés</option>
          </select>
          <div className="flex items-center gap-1">
            <input
              type="number" min="0" max="1440" className="border rounded p-2 w-20"
              placeholder="min" title="Seuil en minutes (ex: 510 = 8h30)"
              value={ruleForm.threshold_minutes}
              onChange={(e) => setRuleForm({ ...ruleForm, threshold_minutes: e.target.value })}
            />
            <span className="text-xs text-slate-500">min</span>
          </div>
          <div className="flex items-center gap-1">
            <input
              type="number" min="1" max="3" step="0.05" className="border rounded p-2 w-20"
              placeholder="1.25" title="Taux (ex: 1.25 = +25%)"
              value={ruleForm.rate}
              onChange={(e) => setRuleForm({ ...ruleForm, rate: e.target.value })}
            />
            <span className="text-xs text-slate-500">×</span>
          </div>
          <button className="bg-slate-900 text-white py-2 px-3 rounded text-sm">+ Ajouter</button>
        </form>
      </section>

      {/* ── Politique de temps de travail ────────────────────────────── */}
      <section className="glass rounded-2xl p-5">
        <h2 className="font-semibold text-base mb-4">Politique de temps de travail</h2>
        <form onSubmit={savePolicy} className="space-y-5">

          {/* Verrou mensuel */}
          <fieldset className="glass-soft rounded-xl p-4">
            <legend className="text-sm font-semibold px-1 mb-2">Verrou mensuel</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block text-sm">
                <span className="text-slate-600">Jour de clôture du mois</span>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="number" min="1" max="28"
                    className="border rounded p-2 w-20"
                    value={policy.month_lock_day}
                    onChange={p('month_lock_day')}
                  />
                  <span className="text-xs text-slate-500">du mois (ex: 10 → clôture le 10)</span>
                </div>
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Qui peut modifier un mois verrouillé</span>
                <select
                  className="border rounded p-2 w-full mt-1"
                  value={policy.lock_bypass_roles}
                  onChange={(e) => setPolicy({ ...policy, lock_bypass_roles: e.target.value })}
                >
                  <option value="superuser">Superuser uniquement</option>
                  <option value="manager">Manager et superuser</option>
                  <option value="any">Tous les utilisateurs</option>
                </select>
              </label>
            </div>
          </fieldset>

          {/* Pauses */}
          <fieldset className="glass-soft rounded-xl p-4">
            <legend className="text-sm font-semibold px-1 mb-2">Pauses obligatoires</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <label className="block text-sm">
                <span className="text-slate-600">Déclenchement après (min)</span>
                <input type="number" min="0" className="border rounded p-2 w-full mt-1"
                  value={policy.break_trigger_minutes} onChange={p('break_trigger_minutes')} />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Durée de la pause (min)</span>
                <input type="number" min="0" className="border rounded p-2 w-full mt-1"
                  value={policy.break_duration_minutes} onChange={p('break_duration_minutes')} />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Pause payée (min)</span>
                <input type="number" min="0" className="border rounded p-2 w-full mt-1"
                  value={policy.paid_break_minutes} onChange={p('paid_break_minutes')} />
              </label>
              <label className="flex items-center gap-2 text-sm mt-4">
                <input type="checkbox" checked={policy.auto_deduct_break} onChange={p('auto_deduct_break')} />
                Déduction automatique
              </label>
            </div>
          </fieldset>

          {/* Journée */}
          <fieldset className="glass-soft rounded-xl p-4">
            <legend className="text-sm font-semibold px-1 mb-2">Durées journalières</legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="block text-sm">
                <span className="text-slate-600">Durée min (min)</span>
                <input type="number" min="0" className="border rounded p-2 w-full mt-1"
                  value={policy.daily_min_minutes} onChange={p('daily_min_minutes')} />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Durée max (min)</span>
                <input type="number" min="0" className="border rounded p-2 w-full mt-1"
                  value={policy.daily_max_minutes} onChange={p('daily_max_minutes')} />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Veilles de jours fériés (min, 0 = désactivé)</span>
                <input type="number" min="0" className="border rounded p-2 w-full mt-1"
                  value={policy.eve_holiday_reduced_minutes} onChange={p('eve_holiday_reduced_minutes')} />
              </label>
            </div>
          </fieldset>

          {err && <p className="text-xs text-rose-700 bg-rose-50 rounded px-3 py-2">⚠ {err}</p>}
          {ok && <p className="text-xs text-emerald-700 bg-emerald-50 rounded px-3 py-2">✓ {ok}</p>}

          <button
            type="submit"
            disabled={saving}
            className="press w-full bg-slate-900 text-white py-2.5 rounded-xl font-medium disabled:opacity-50"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer la politique'}
          </button>
        </form>
      </section>
    </div>
  )
}


function HomeAddressModal({ user, siteCenter, onClose, onSave, onClear }) {
  // Important : on stocke et envoie des valeurs ARRONDIES à 6 décimales.
  // Leaflet renvoie des floats à 13-15 décimales, mais le DecimalField
  // côté backend (max_digits=9, decimal_places=6) refuse au-delà.
  const round6 = (n) => (n == null ? null : Number(Number(n).toFixed(6)))
  const [lat, setLat] = useState(round6(user.home_lat))
  const [lon, setLon] = useState(round6(user.home_lon))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const submit = async () => {
    if (lat == null || lon == null) return
    setSaving(true)
    setErr(null)
    try {
      await onSave(round6(lat), round6(lon))
    } catch (e) {
      // Surface l'erreur réseau / 400 / 403 pour qu'elle ne reste pas
      // dans la console et que le bouton n'ait pas l'air mort.
      setErr(
        e?.response?.data
          ? JSON.stringify(e.response.data)
          : e?.message || 'Erreur inconnue',
      )
    } finally {
      setSaving(false)
    }
  }

  const clear = async () => {
    if (!window.confirm('Effacer le domicile de ce collaborateur ?')) return
    setSaving(true)
    setErr(null)
    try {
      await onClear()
    } catch (e) {
      setErr(
        e?.response?.data
          ? JSON.stringify(e.response.data)
          : e?.message || 'Erreur inconnue',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" role="dialog">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl p-5 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">
            Domicile de <span className="font-mono">{user.username}</span>
          </h3>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded hover:bg-slate-100">✕</button>
        </div>
        <p className="text-xs text-slate-600">
          Cliquez sur la carte pour positionner le domicile du collaborateur.
          Le trajet domicile → site sera recalculé automatiquement à l'enregistrement
          (sauf si vous avez saisi manuellement le temps standard de trajet).
        </p>
        <MapPicker
          lat={lat ?? undefined}
          lon={lon ?? undefined}
          defaultCenter={siteCenter}
          onPick={(la, lo) => { setLat(round6(la)); setLon(round6(lo)) }}
          height={380}
        />
        <div className="text-xs text-slate-600 font-mono">
          {lat != null && lon != null
            ? `lat ${lat.toFixed(6)}, lon ${lon.toFixed(6)}`
            : 'Aucun point sélectionné'}
        </div>
        {err && (
          <p className="text-xs text-rose-700 bg-rose-50 rounded px-2 py-1 break-all">
            ⚠ {err}
          </p>
        )}
        <div className="flex justify-between gap-2 pt-1">
          {user.home_lat != null ? (
            <button
              type="button" onClick={clear} disabled={saving}
              className="text-sm px-3 py-2 rounded text-rose-700 hover:bg-rose-50"
            >
              Effacer le domicile
            </button>
          ) : <span />}
          <div className="flex gap-2 ml-auto">
            <button
              type="button" onClick={onClose} disabled={saving}
              className="px-4 py-2 text-sm"
            >Annuler</button>
            <button
              type="button" onClick={submit}
              disabled={saving || lat == null || lon == null}
              className="px-4 py-2 text-sm rounded bg-blue-600 text-white disabled:opacity-50"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
