import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as adminApi from '../api/admin'
import MapPicker from '../components/MapPicker'
import { useAuth } from '../hooks/useAuth'
import { useCompany } from '../hooks/useCompany'

// ── Navigation groups ──────────────────────────────────────────────────────

const NAV_GROUPS = [
  {
    id: 'organisation',
    icon: '🏢',
    label: 'Organisation',
    tabs: [
      { id: 'sites',   icon: '📍', label: 'Sites & fériés',  desc: 'Sites de travail, périmètre GPS, jours fériés' },
      { id: 'company', icon: '🏭', label: 'Entreprise',      desc: 'Nom, logo, couleurs, contact RGPD', su: true },
    ],
  },
  {
    id: 'pointage',
    icon: '⏱',
    label: 'Pointage',
    tabs: [
      { id: 'work-time',  icon: '⚙',  label: 'Règles de travail', desc: 'Majorations, pauses, verrou mensuel', su: true },
      { id: 'slots',      icon: '🕐', label: 'Plages horaires',    desc: 'Plages fixes et justifications hors-plage' },
      { id: 'tolerance',  icon: '↕',  label: 'Arrondis',          desc: 'Tolérance et direction d\'arrondi' },
    ],
  },
  {
    id: 'equipe',
    icon: '👥',
    label: 'Équipe',
    tabs: [
      { id: 'users', icon: '👤', label: 'Utilisateurs', desc: 'Comptes, rôles, quotas, managers', su: true },
    ],
  },
  {
    id: 'conformite',
    icon: '🔐',
    label: 'Conformité',
    su: true,
    tabs: [
      { id: 'deletion-requests',     icon: '🗑',  label: 'Demandes RGPD',     desc: 'Suppressions de compte Art. 32 LPD', su: true },
      { id: 'home-address-requests', icon: '🏠', label: 'Changements adresse', desc: 'Approuver les demandes de domicile', su: true },
      { id: 'audit',                 icon: '📋', label: 'Journal d\'audit',  desc: 'Traçabilité des actions administrateurs', su: true },
    ],
  },
]

export default function AdminSettingsPage() {
  const { user } = useAuth()
  const isSu = Boolean(user?.is_superuser)

  // Default to first accessible tab
  const firstTab = NAV_GROUPS.flatMap((g) => g.tabs)
    .find((t) => !t.su || isSu)?.id ?? 'sites'
  const [tab, setTab] = useState(firstTab)

  // Derive active group from active tab
  const activeGroup = NAV_GROUPS.find((g) => g.tabs.some((t) => t.id === tab))

  const visibleGroups = NAV_GROUPS.filter((g) => !g.su || isSu)
  const visibleTabs = (g) => g.tabs.filter((t) => !t.su || isSu)

  return (
    <div className="max-w-6xl mx-auto px-3 pt-2 pb-12 sm:px-6">
      <h1 className="text-xl font-semibold tracking-tight mb-5">Paramètres</h1>

      <div className="flex gap-6 items-start">

        {/* ── Sidebar (desktop) ──────────────────────────────────────── */}
        <aside className="hidden md:flex flex-col gap-1 w-52 shrink-0 sticky top-20">
          {visibleGroups.map((g) => (
            <div key={g.id} className="mb-1">
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold px-3 py-1.5 flex items-center gap-1.5">
                <span>{g.icon}</span>{g.label}
              </p>
              {visibleTabs(g).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`press w-full text-left px-3 py-2 rounded-xl text-sm transition flex items-center gap-2 ${
                    tab === t.id
                      ? 'bg-slate-900 text-white shadow'
                      : 'text-slate-600 hover:bg-white/60'
                  }`}
                >
                  <span className="text-base leading-none">{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          ))}
        </aside>

        {/* ── Content ────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* Mobile: group chips then sub-tab pills */}
          <div className="md:hidden space-y-2">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {visibleGroups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => { const first = visibleTabs(g)[0]; if (first) setTab(first.id) }}
                  className={`press shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                    activeGroup?.id === g.id
                      ? 'bg-slate-900 text-white'
                      : 'glass-soft text-slate-600'
                  }`}
                >
                  <span>{g.icon}</span>{g.label}
                </button>
              ))}
            </div>
            {activeGroup && visibleTabs(activeGroup).length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {visibleTabs(activeGroup).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`press shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition ${
                      tab === t.id
                        ? 'bg-slate-700 text-white'
                        : 'glass text-slate-600'
                    }`}
                  >
                    <span>{t.icon}</span>{t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Breadcrumb + page title */}
          {activeGroup && (() => {
            const currentTab = activeGroup.tabs.find((t2) => t2.id === tab)
            return currentTab ? (
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <span>{activeGroup.icon}</span>
                    <span>{activeGroup.label}</span>
                    <span className="mx-1">›</span>
                    <span>{currentTab.label}</span>
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{currentTab.desc}</p>
                </div>
              </div>
            ) : null
          })()}

          {/* Tab panels */}
          {tab === 'sites'              && <SitesTab />}
          {tab === 'slots'              && <SlotsTab />}
          {tab === 'tolerance'          && <ToleranceTab />}
          {tab === 'work-time'   && isSu && <WorkTimeTab />}
          {tab === 'users'       && isSu && <UsersTab />}
          {tab === 'company'     && isSu && <CompanyTab />}
          {tab === 'deletion-requests' && isSu && <DeletionRequestsTab />}
          {tab === 'home-address-requests' && isSu && <HomeAddressRequestsTab />}
          {tab === 'audit'       && isSu && <AuditTab />}
        </div>
      </div>
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
      <section className="glass-soft rounded-xl p-4 text-sm space-y-1">
        <p className="font-semibold text-slate-800">
          🏭 Configuration entreprise
        </p>
        <p className="text-slate-600 text-xs">
          Ces informations sont utilisées par la <strong>politique de
          confidentialité</strong> (interpolation : nom du responsable, contact
          DPO, adresse — Art. 14 LPD) et par le <strong>branding</strong> de
          l'application (logo + couleurs visibles partout, y compris sur la
          page de connexion).
        </p>
      </section>

      {/* ── Identification ── */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-1">Identification</legend>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm col-span-2">
            Raison sociale
            <input
              type="text" className="glass-input w-full mt-1"
              value={form.name || ''}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="Acme SA"
            />
          </label>
          <label className="text-sm">
            Forme juridique
            <input
              type="text" className="glass-input w-full mt-1"
              value={form.legal_form || ''}
              onChange={(e) => set({ legal_form: e.target.value })}
              placeholder="SA / Sàrl / AG / GmbH / …"
            />
          </label>
          <label className="text-sm">
            Pays
            <input
              type="text" className="glass-input w-full mt-1"
              value={form.country || ''}
              onChange={(e) => set({ country: e.target.value })}
            />
          </label>
        </div>

        <label className="text-sm block">
          Adresse
          <input
            type="text" className="glass-input w-full mt-1"
            value={form.address_line || ''}
            onChange={(e) => set({ address_line: e.target.value })}
            placeholder="Rue de l'Industrie 12"
          />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-sm">
            NPA
            <input
              type="text" className="glass-input w-full mt-1"
              value={form.postal_code || ''}
              onChange={(e) => set({ postal_code: e.target.value })}
              maxLength={10}
            />
          </label>
          <label className="text-sm col-span-2">
            Ville
            <input
              type="text" className="glass-input w-full mt-1"
              value={form.city || ''}
              onChange={(e) => set({ city: e.target.value })}
            />
          </label>
        </div>
      </fieldset>

      {/* ── Contact protection des données ── */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-1">
          Protection des données <span className="text-xs font-normal normal-case tracking-normal">(Art. 14 LPD)</span>
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">
            Email DPO
            <input
              type="email" className="glass-input w-full mt-1"
              value={form.dpo_contact_email || ''}
              onChange={(e) => set({ dpo_contact_email: e.target.value })}
              placeholder="dpo@entreprise.ch"
            />
          </label>
          <label className="text-sm">
            Téléphone (optionnel)
            <input
              type="tel" className="glass-input w-full mt-1"
              value={form.dpo_contact_phone || ''}
              onChange={(e) => set({ dpo_contact_phone: e.target.value })}
              placeholder="+41 …"
            />
          </label>
        </div>
        <label className="text-sm block">
          Texte additionnel pour la politique de confidentialité (optionnel)
          <textarea
            className="glass-input w-full mt-1 h-24"
            value={form.privacy_policy_extra || ''}
            onChange={(e) => set({ privacy_policy_extra: e.target.value })}
            placeholder="Mentions sectorielles, sous-traitants spécifiques, …"
          />
        </label>
      </fieldset>

      {/* ── Branding ── */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-1">Branding</legend>
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
                className="text-xs text-rose-600 hover:underline mt-1"
              >
                Effacer le logo
              </button>
            )}
          </label>
          <div className="glass-soft rounded-xl p-2 text-center">
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
                className="h-10 w-14 rounded-lg cursor-pointer border border-white/40"
                value={form.primary_color || '#1e3a5f'}
                onChange={(e) => set({ primary_color: e.target.value })}
              />
              <input
                type="text"
                className="glass-input flex-1 font-mono text-xs"
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
                className="h-10 w-14 rounded-lg cursor-pointer border border-white/40"
                value={form.secondary_color || '#10b981'}
                onChange={(e) => set({ secondary_color: e.target.value })}
              />
              <input
                type="text"
                className="glass-input flex-1 font-mono text-xs"
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
        <p className="text-xs text-rose-700 glass-soft rounded-xl p-3 break-all">
          ⚠ {err}
        </p>
      )}
      {savedAt && !err && (
        <p className="text-xs text-emerald-700 glass-soft rounded-xl p-3">
          ✓ Enregistré à {savedAt.toLocaleTimeString('fr-FR')} — appliqué partout dans l'app.
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit" disabled={saving}
          className="pill pill-primary disabled:opacity-50"
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
      <div className="glass-soft rounded-xl p-4 text-sm space-y-1">
        <p className="font-semibold text-slate-800">
          📥 Inbox RH — demandes de suppression de compte (Art. 32 al. 2 LPD)
        </p>
        <p className="text-slate-600 text-xs">
          <strong>Approuver</strong> déclenche immédiatement l'anonymisation
          du compte (nom, email, mot de passe effacés, username remplacé par
          <code> deleted_N</code>). Les pointages sont préservés mais anonymes.
          À faire <u>après</u> la sortie effective du collaborateur (solde de
          tout compte réglé). <strong>Refuser</strong> trace la décision avec
          un motif — à utiliser si la demande est prématurée ou doit passer
          par le SIRH.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {['PENDING', 'APPROVED', 'REJECTED', 'ALL'].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-full press transition ${
              filter === s ? 'bg-slate-900 text-white' : 'glass-soft text-slate-700'
            }`}
          >
            {s === 'ALL' ? 'Tout' : s === 'PENDING' ? 'En attente' : s === 'APPROVED' ? 'Approuvées' : 'Refusées'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500 glass-soft rounded-xl p-4 text-center">
          Aucune demande pour ce filtre.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="glass-soft rounded-xl p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-mono text-xs text-slate-500">#{r.id}</span>
                <span className="font-semibold">{r.username}</span>
                <span className="text-slate-400">·</span>
                <span className="text-xs text-slate-500">
                  soumise le {fmt(r.created_at)}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${badge[r.status]}`}>
                  {r.status === 'PENDING' ? 'En attente' : r.status === 'APPROVED' ? 'Approuvée' : 'Refusée'}
                </span>
              </div>
              {r.user_reason && (
                <p className="text-sm text-slate-700 glass rounded-xl px-3 py-2 italic">
                  💬 « {r.user_reason} »
                </p>
              )}
              {r.admin_comment && (
                <p className="text-sm text-slate-700 glass-soft rounded-xl px-3 py-2">
                  <span className="text-xs text-slate-500">Admin ({r.decided_by_username}) :</span>{' '}
                  {r.admin_comment}
                </p>
              )}
              {r.status === 'PENDING' && (
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setDecisionFor({ req: r, action: 'approve' })}
                    className="press text-xs px-3 py-1.5 rounded-xl bg-rose-500 text-white font-medium"
                    title="Anonymise le compte maintenant"
                  >
                    ✓ Approuver + anonymiser
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecisionFor({ req: r, action: 'reject' })}
                    className="press text-xs px-3 py-1.5 rounded-xl glass text-slate-700 font-medium"
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
  const [confirmText, setConfirmText] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const destructive = action === 'approve'
  // Garde-fou anti-clic-accidentel : pour approuver une anonymisation
  // irréversible, l'admin doit retaper le username.
  const confirmOk = !destructive || confirmText.trim() === req.username

  const submit = async () => {
    if (!confirmOk) {
      setErr('Veuillez retaper le nom d\'utilisateur pour confirmer.')
      return
    }
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" role="dialog">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative glass-strong rounded-2xl w-full max-w-md p-5 space-y-4">
        <h3 className="font-semibold text-slate-900">
          {destructive ? '⚠️ Approuver et anonymiser' : '✕ Refuser la demande'}
          {' '}de <span className="font-mono">{req.username}</span>
        </h3>
        {destructive && (
          <p className="text-xs text-rose-700 glass rounded-xl p-3">
            Cette action va <strong>anonymiser immédiatement</strong> le compte.
            Le collaborateur ne pourra plus se connecter. Les pointages sont
            préservés mais rattachés à <code>deleted_N</code>. Action
            irréversible — à faire uniquement après sa sortie effective.
          </p>
        )}
        <label className="block text-sm">
          <span className="text-slate-600">Commentaire {destructive ? '(optionnel)' : '(motif du refus)'}</span>
          <textarea
            className="glass-input w-full mt-1 h-24 text-sm"
            placeholder={destructive
              ? 'Ex : STC effectué le 30/04, accès retiré'
              : 'Ex : demande prématurée, le collaborateur est encore en préavis'
            }
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
          />
        </label>
        {destructive && (
          <label className="block text-sm">
            <span className="text-slate-700">
              Pour confirmer, retapez <code className="font-mono bg-slate-100 px-1 rounded">{req.username}</code> :
            </span>
            <input
              type="text"
              className="glass-input w-full mt-1 text-sm font-mono"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={req.username}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        )}
        {err && <p className="text-xs text-rose-700 glass rounded-xl p-3">⚠ {err}</p>}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="press px-4 py-2 text-sm glass-soft rounded-xl text-slate-700"
          >Annuler</button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || !confirmOk}
            className={`press px-4 py-2 text-sm text-white rounded-xl font-medium disabled:opacity-40 disabled:cursor-not-allowed ${
              destructive ? 'bg-rose-500' : 'bg-slate-800'
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
    <div className="space-y-4">
      <div className="glass-soft rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <label className="text-sm">
          <span className="text-slate-600 block mb-1">Action</span>
          <select
            className="glass-input"
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
          <span className="text-slate-600 block mb-1">User cible #</span>
          <input
            type="number" placeholder="id"
            className="glass-input w-24"
            value={filter.target_user}
            onChange={(e) => setFilter({ ...filter, target_user: e.target.value })}
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-600 block mb-1">Du</span>
          <input
            type="date" className="glass-input"
            value={filter.start}
            onChange={(e) => setFilter({ ...filter, start: e.target.value })}
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-600 block mb-1">Au</span>
          <input
            type="date" className="glass-input"
            value={filter.end}
            onChange={(e) => setFilter({ ...filter, end: e.target.value })}
          />
        </label>
        <button type="button" onClick={refresh} className="pill pill-primary text-sm self-end">
          Filtrer
        </button>
      </div>

      {loading || !data ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : data.results.length === 0 ? (
        <p className="text-sm text-slate-500 glass-soft rounded-xl p-4 text-center">
          Aucun événement pour ce filtre.
        </p>
      ) : (
        <>
          <p className="text-xs text-slate-500 px-1">
            {data.count} événement(s) affichés (limite : {data.limit}). Append-only — non modifiable.
          </p>
          <div className="glass rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full text-xs">
            <thead className="text-left border-b border-white/20">
              <tr>
                <th className="px-3 py-2.5 text-slate-500 font-medium">Quand</th>
                <th className="px-3 py-2.5 text-slate-500 font-medium">Acteur</th>
                <th className="px-3 py-2.5 text-slate-500 font-medium">Action</th>
                <th className="px-3 py-2.5 text-slate-500 font-medium">Cible</th>
                <th className="px-3 py-2.5 text-slate-500 font-medium">Objet</th>
                <th className="px-3 py-2.5 text-slate-500 font-medium">Détails</th>
                <th className="px-3 py-2.5 text-slate-500 font-medium">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {data.results.map((r) => (
                <tr key={r.id} className="hover:bg-white/20 transition">
                  <td className="px-3 py-2 font-mono whitespace-nowrap text-slate-700">
                    {new Date(r.created_at).toLocaleString('fr-FR')}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {r.actor_username || <span className="text-slate-400">système</span>}
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-800">{actionLabel(r.action)}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {r.target_username || (r.target_user_id ? `#${r.target_user_id}` : '—')}
                  </td>
                  <td className="px-3 py-2 text-slate-500">
                    {r.object_type && `${r.object_type} #${r.object_id}`}
                  </td>
                  <td className="px-3 py-2 text-slate-500">
                    {Object.keys(r.details || {}).length > 0 && (
                      <code className="text-[10px]">{JSON.stringify(r.details)}</code>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-400">{r.ip_address || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          </div>
        </>
      )}
    </div>
  )
}

function SitesTab() {
  const [sites, setSites] = useState([])
  const [editing, setEditing] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const refresh = () => adminApi.sites.list().then((d) => setSites(d.results || d))
  useEffect(() => { refresh() }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{sites.length} site{sites.length !== 1 ? 's' : ''} configuré{sites.length !== 1 ? 's' : ''}</p>
        <button
          type="button"
          onClick={() => setEditing({ new: true, name: '', latitude: '', longitude: '', gps_radius_meters: 150 })}
          className="pill pill-primary text-sm"
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

      {sites.length === 0 && !editing && (
        <div className="glass rounded-2xl p-8 text-center text-slate-400 text-sm">
          Aucun site configuré — commencez par en créer un.
        </div>
      )}

      <ul className="space-y-2">
        {sites.map((s) => (
          <li key={s.id} className="glass rounded-2xl p-4 flex flex-wrap items-center gap-3 text-sm">
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{s.name}</p>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                {Number(s.latitude).toFixed(4)}, {Number(s.longitude).toFixed(4)} · ±{s.gps_radius_meters} m
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button type="button" onClick={() => setEditing({ ...s })}
                className="press px-3 py-1 rounded-full glass-soft text-xs">
                Éditer
              </button>
              <Link to={`/admin/sites/${s.id}/qr`}
                className="press px-3 py-1 rounded-full glass-soft text-xs">
                📱 QR
              </Link>
              <button type="button" onClick={async () => { await adminApi.sites.regenQr(s.id); refresh() }}
                className="press px-3 py-1 rounded-full glass-soft text-xs text-amber-700">
                ↻ Nouveau QR
              </button>
              <button type="button" onClick={() => setDeletingId(s.id)}
                className="press px-3 py-1 rounded-full text-xs bg-rose-50 text-rose-700 border border-rose-200">
                Suppr.
              </button>
            </div>
          </li>
        ))}
      </ul>

      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setDeletingId(null)} aria-hidden />
          <div className="relative glass-strong w-full max-w-sm rounded-3xl p-5 space-y-4">
            <p className="font-semibold">Supprimer ce site ?</p>
            <p className="text-sm text-slate-600">Les pointages associés resteront mais le QR code sera invalide.</p>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setDeletingId(null)} className="press px-4 py-2 text-sm">Annuler</button>
              <button type="button" onClick={async () => { await adminApi.sites.remove(deletingId); setDeletingId(null); refresh() }}
                className="press bg-rose-600 text-white px-4 py-2 rounded-xl text-sm">
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
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
  const [err, setErr] = useState(null)

  const onSave = async (e) => {
    e.preventDefault()
    setSaving(true); setErr(null)
    try {
      if (site.new) await adminApi.sites.create(form)
      else await adminApi.sites.update(site.id, form)
      onSaved()
    } catch (e) {
      setErr(e?.response?.data ? JSON.stringify(e.response.data) : e.message)
    } finally { setSaving(false) }
  }

  return (
    <div className="glass rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{site.new ? '+ Nouveau site' : `Éditer · ${site.name}`}</h3>
        <button type="button" onClick={onClose} className="press w-8 h-8 rounded-lg hover:bg-white/40 text-slate-500">✕</button>
      </div>
      <form onSubmit={onSave} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block text-sm sm:col-span-2">
            <span className="text-slate-600">Nom du site</span>
            <input className="glass-input w-full mt-1" placeholder="Ex : Siège Lausanne"
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Latitude</span>
            <input className="glass-input w-full mt-1 font-mono" placeholder="46.5197" type="number" step="0.000001"
              value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} required />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Longitude</span>
            <input className="glass-input w-full mt-1 font-mono" placeholder="6.6323" type="number" step="0.000001"
              value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} required />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-slate-600">Rayon GPS (m)</span>
            <div className="flex items-center gap-2 mt-1">
              <input className="glass-input w-24 font-mono text-center" type="number" min="10"
                value={form.gps_radius_meters}
                onChange={(e) => setForm({ ...form, gps_radius_meters: Number(e.target.value) })} />
              <span className="text-xs text-slate-500">m — les employés doivent être dans ce périmètre pour pointer</span>
            </div>
          </label>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-2">Cliquez sur la carte pour positionner le site :</p>
          <MapPicker
            lat={form.latitude ? Number(form.latitude) : undefined}
            lon={form.longitude ? Number(form.longitude) : undefined}
            radius={Number(form.gps_radius_meters)}
            onPick={(lat, lon) => setForm({ ...form, latitude: lat.toFixed(6), longitude: lon.toFixed(6) })}
          />
        </div>
        {err && <p className="text-xs text-rose-700 bg-rose-50 rounded px-2 py-1">{err}</p>}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="press px-4 py-2 text-sm">Annuler</button>
          <button type="submit" disabled={saving} className="pill pill-primary disabled:opacity-50">
            {saving ? 'Enregistrement…' : site.new ? 'Créer le site' : 'Enregistrer'}
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

  const refresh = () => adminApi.holidays.list(siteId).then((d) => setItems(d.results || d))
  useEffect(() => { refresh() /* eslint-disable-next-line */ }, [siteId])

  const onAdd = async (e) => {
    e.preventDefault()
    if (!form.date || !form.name) return
    await adminApi.holidays.create({ site: siteId, date: form.date, name: form.name })
    setForm({ date: '', name: '' })
    refresh()
  }

  return (
    <div className="glass-soft rounded-xl p-4 space-y-3 mt-2">
      <h4 className="text-sm font-semibold flex items-center gap-1.5">🎉 Jours fériés du site</h4>
      <form onSubmit={onAdd} className="flex flex-wrap gap-2 items-end">
        <input type="date" className="glass-input text-sm"
          value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <input type="text" className="glass-input text-sm flex-1 min-w-[8rem]"
          placeholder="Ex : Jeûne fédéral"
          value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <button type="submit" className="press px-3 py-2 rounded-xl bg-slate-900 text-white text-xs">+ Ajouter</button>
      </form>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">Aucun jour férié configuré pour ce site.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((h) => (
            <li key={h.id} className="flex items-center justify-between text-sm bg-white/40 rounded-lg px-3 py-1.5">
              <span>
                <span className="font-mono text-xs text-slate-600">{h.date}</span>
                <span className="mx-2 text-slate-300">·</span>
                {h.name}
              </span>
              <button type="button" onClick={() => adminApi.holidays.remove(h.id).then(refresh)}
                className="text-rose-600 text-xs hover:text-rose-800 press px-2 py-0.5 rounded">
                ✕
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
  const [saving, setSaving] = useState(false)

  const refresh = () => adminApi.fixedSlots.list().then((d) => setSlots(d.results || d))
  useEffect(() => { refresh() }, [])

  const onCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    try { await adminApi.fixedSlots.create(form); setForm({ name: '', start_time: '', end_time: '' }); refresh() }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-4">
        <p className="text-xs text-slate-500 mb-3">
          Les pointages hors des plages actives déclenchent une demande de justification.
        </p>
        <form onSubmit={onCreate} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
          <input className="glass-input sm:col-span-2 text-sm" placeholder="Nom de la plage (ex : Entrée standard)"
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className="glass-input text-sm" type="time"
            value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} required />
          <input className="glass-input text-sm" type="time"
            value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} required />
          <button type="submit" disabled={saving}
            className="sm:col-span-4 press bg-slate-900 text-white py-2 rounded-xl text-sm disabled:opacity-50">
            {saving ? 'Ajout…' : '+ Ajouter la plage'}
          </button>
        </form>
      </div>

      {slots.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">Aucune plage horaire fixe configurée.</p>
      ) : (
        <ul className="space-y-2">
          {slots.map((s) => (
            <li key={s.id} className="glass rounded-2xl px-4 py-3 flex items-center gap-4 text-sm">
              <div className="flex-1">
                <p className="font-medium">{s.name}</p>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{s.start_time} → {s.end_time}</p>
              </div>
              <button type="button"
                onClick={async () => { await adminApi.fixedSlots.remove(s.id); refresh() }}
                className="press px-3 py-1 rounded-full text-xs bg-rose-50 text-rose-700 border border-rose-200">
                Suppr.
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ToleranceTab() {
  const [cfg, setCfg] = useState(null)
  const [saving, setSaving] = useState(false)
  const [ok, setOk] = useState(false)

  useEffect(() => { adminApi.tolerance.get().then(setCfg) }, [])
  if (!cfg) return <div className="glass rounded-2xl h-32 animate-pulse" />

  const onSave = async (e) => {
    e.preventDefault()
    setSaving(true); setOk(false)
    try {
      const updated = await adminApi.tolerance.update(cfg)
      setCfg(updated)
      setOk(true)
      setTimeout(() => setOk(false), 3000)
    } finally { setSaving(false) }
  }

  return (
    <div className="glass rounded-2xl p-5 max-w-md space-y-5">
      <p className="text-xs text-slate-500">
        L'arrondi s'applique à chaque heure de pointage. La tolérance définit
        la plage autour de la plage fixe dans laquelle le pointage est accepté sans justification.
      </p>
      <form onSubmit={onSave} className="space-y-4">
        <label className="block text-sm">
          <span className="text-slate-600">Tolérance</span>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="number" min="0" max="60"
              className="glass-input w-20 font-mono text-center"
              value={cfg.tolerance_minutes}
              onChange={(e) => setCfg({ ...cfg, tolerance_minutes: Number(e.target.value) })}
            />
            <span className="text-xs text-slate-500">
              min — pointage accepté ±{cfg.tolerance_minutes} min autour des plages
            </span>
          </div>
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Direction d'arrondi</span>
          <select
            className="glass-input w-full mt-1"
            value={cfg.rounding_direction}
            onChange={(e) => setCfg({ ...cfg, rounding_direction: e.target.value })}
          >
            <option value="NEAREST">↕ Plus proche (recommandé)</option>
            <option value="DOWN">↓ Inférieur (favorise l'employeur)</option>
            <option value="UP">↑ Supérieur (favorise l'employé)</option>
          </select>
        </label>
        {ok && <p className="text-xs text-emerald-700 bg-emerald-50 rounded px-3 py-2">✓ Configuration enregistrée</p>}
        <button type="submit" disabled={saving} className="pill pill-primary w-full justify-center disabled:opacity-50">
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>
    </div>
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

  const [deletingUser, setDeletingUser] = useState(null)
  const [promotingUser, setPromotingUser] = useState(null)

  const onDelete = async () => {
    if (!deletingUser) return
    await adminApi.users.remove(deletingUser.id)
    setDeletingUser(null)
    refresh()
  }

  return (
    <div className="space-y-4">
      {/* Dialog promotion/démotion admin général (clé secrète requise) */}
      {promotingUser && (
        <PromoteSuperuserModal
          user={promotingUser}
          onClose={() => setPromotingUser(null)}
          onDone={(updated) => {
            // Met à jour la ligne dans la table.
            setUsers((prev) =>
              prev.map((x) => x.id === updated.user_id ? { ...x, is_superuser: updated.is_superuser } : x),
            )
            setPromotingUser(null)
          }}
        />
      )}

      {/* Dialog de confirmation suppression */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3" role="dialog">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setDeletingUser(null)} aria-hidden />
          <div className="relative glass-strong rounded-2xl w-full max-w-sm p-5 space-y-4">
            <p className="font-semibold text-slate-900">Supprimer ce collaborateur ?</p>
            <p className="text-sm text-slate-600">
              L'utilisateur <span className="font-mono font-semibold">{deletingUser.username}</span> sera définitivement supprimé.
              Préférez la demande RGPD pour une anonymisation conforme.
            </p>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setDeletingUser(null)}
                className="press px-4 py-2 text-sm glass-soft rounded-xl text-slate-700">Annuler</button>
              <button type="button" onClick={onDelete}
                className="press px-4 py-2 text-sm bg-rose-500 text-white rounded-xl font-medium">Supprimer</button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={onCreate} className="glass-soft rounded-xl p-4 grid grid-cols-6 gap-2 items-end">
        <input className="glass-input col-span-2" placeholder="Nom d'utilisateur"
               value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
        <input className="glass-input col-span-2" placeholder="Mot de passe" type="text"
               value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <input className="glass-input" placeholder="h/sem" type="number" step="0.5"
               value={form.weekly_target_hours} onChange={(e) => setForm({ ...form, weekly_target_hours: e.target.value })} />
        <input className="glass-input" placeholder="Congés" type="number"
               value={form.vacation_quota} onChange={(e) => setForm({ ...form, vacation_quota: Number(e.target.value) })} />
        <select className="glass-input col-span-3"
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
        <button className="col-span-6 pill pill-primary justify-center">
          Créer un collaborateur
        </button>
      </form>

      {/* Table users : 10 colonnes (#ID, username, site, domicile, trajet,
          h/sem, congés, manager, mission_mgr, action). Largement >402 px → scroll. */}
      <div className="glass rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
      <table className="min-w-[900px] w-full text-sm">
        <thead className="text-left border-b border-white/20">
          <tr>
            <th className="px-3 py-2.5 text-xs text-slate-500 font-medium font-mono">ID</th>
            <th className="px-3 py-2.5 text-xs text-slate-500 font-medium">Utilisateur</th>
            <th className="px-3 py-2.5 text-xs text-slate-500 font-medium">Site</th>
            <th className="px-3 py-2.5 text-xs text-slate-500 font-medium" title="Domicile sélectionné sur carte">🏠 Domicile</th>
            <th className="px-3 py-2.5 text-xs text-slate-500 font-medium" title="Trajet domicile → site, ALLER simple, en minutes">🚗 Trajet</th>
            <th className="px-3 py-2.5 text-xs text-slate-500 font-medium">Heures/sem</th>
            <th className="px-3 py-2.5 text-xs text-slate-500 font-medium">Quota congés</th>
            <th className="px-3 py-2.5 text-xs text-slate-500 font-medium">Manager direct</th>
            <th className="px-3 py-2.5 text-xs text-slate-500 font-medium">Manager</th>
            <th className="px-3 py-2.5 text-xs text-slate-500 font-medium">Mission Mgr</th>
            <th className="px-3 py-2.5 text-xs text-slate-500 font-medium" title="Non soumis au timbrage">Non-badgeur</th>
            <th className="px-3 py-2.5 text-xs text-slate-500 font-medium" title="Peut modifier les mois verrouillés">🔓 Mois</th>
            <th className="px-3 py-2.5"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {users.map((u) => {
            const isAnonymized = /^deleted_\d+$/.test(u.username || '')
            return (
            <tr key={u.id} className={`hover:bg-white/20 transition ${isAnonymized ? 'opacity-60 italic' : ''}`}>
              <td className="px-3 py-2 font-mono text-xs text-slate-500">#{u.id}</td>
              <td className="px-3 py-2">
                {isAnonymized ? (
                  <span title="Compte anonymisé (LPD Art. 32 al. 2)">
                    🕯 {u.username}
                  </span>
                ) : (
                  <input
                    type="text" className="glass-input text-sm py-1 px-2 w-36"
                    defaultValue={u.username}
                    onBlur={(e) => {
                      if (e.target.value !== u.username) {
                        updateField(u.id, 'username', e.target.value)
                      }
                    }}
                  />
                )}
              </td>
              <td className="px-3 py-2">
                <select
                  className="glass-input text-sm py-1 px-2"
                  value={u.home_site || ''}
                  onChange={(e) =>
                    updateField(u.id, 'home_site', e.target.value ? Number(e.target.value) : '')
                  }
                >
                  <option value="">—</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </td>
              <td className="px-3 py-2">
                {/* Domicile : badge cliquable qui ouvre la modal MapPicker. */}
                <button
                  type="button"
                  onClick={() => !isAnonymized && setHomeEditing(u)}
                  disabled={isAnonymized}
                  className={`press text-xs px-2 py-1 rounded-lg ${
                    u.home_lat != null && u.home_lon != null
                      ? 'bg-emerald-100/60 text-emerald-700'
                      : 'bg-amber-100/60 text-amber-700'
                  } ${isAnonymized ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={
                    u.home_lat != null
                      ? `lat ${Number(u.home_lat).toFixed(4)}, lon ${Number(u.home_lon).toFixed(4)}`
                      : 'Cliquer pour définir sur la carte'
                  }
                >
                  {u.home_lat != null ? '📍 défini' : '+ définir'}
                </button>
              </td>
              <td className="px-3 py-2">
                {/* Trajet : éditable manuellement, badge "auto" sinon. */}
                <div className="flex items-center gap-1">
                <input
                  type="number" min="0" max="999"
                  className="glass-input text-sm py-1 px-2 w-16 text-right"
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
                <span className="text-[10px] text-slate-500">min</span>
                </div>
              </td>
              <td className="px-3 py-2">
                <input
                  type="number" step="0.5" className="glass-input text-sm py-1 px-2 w-20"
                  defaultValue={u.weekly_target_hours}
                  onBlur={(e) => updateField(u.id, 'weekly_target_hours', e.target.value)}
                />
              </td>
              <td className="px-3 py-2">
                <input
                  type="number" className="glass-input text-sm py-1 px-2 w-16"
                  defaultValue={u.vacation_quota}
                  onBlur={(e) => updateField(u.id, 'vacation_quota', Number(e.target.value))}
                />
              </td>
              <td className="px-3 py-2">
                {/* Manager direct (pour les notifications email) */}
                <select
                  className="glass-input text-xs py-1 px-2 max-w-[110px]"
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
              <td className="px-3 py-2 text-center">
                <input
                  type="checkbox"
                  defaultChecked={u.is_manager}
                  onChange={(e) => updateField(u.id, 'is_manager', e.target.checked)}
                />
              </td>
              <td className="px-3 py-2 text-center">
                <input
                  type="checkbox"
                  defaultChecked={u.is_mission_manager}
                  onChange={(e) => updateField(u.id, 'is_mission_manager', e.target.checked)}
                />
              </td>
              <td className="px-3 py-2 text-center">
                <input
                  type="checkbox"
                  defaultChecked={u.exempt_from_clocking}
                  onChange={(e) => updateField(u.id, 'exempt_from_clocking', e.target.checked)}
                  disabled={isAnonymized}
                />
              </td>
              <td className="px-3 py-2 text-center">
                <input
                  type="checkbox"
                  defaultChecked={u.can_edit_locked_months}
                  onChange={(e) => updateField(u.id, 'can_edit_locked_months', e.target.checked)}
                  disabled={isAnonymized}
                />
              </td>
              <td className="px-3 py-2">
                {!isAnonymized && (
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => setPromotingUser(u)}
                      className={`press text-xs px-3 py-1 rounded-lg transition ${
                        u.is_superuser
                          ? 'bg-purple-100/60 text-purple-700 hover:bg-purple-200/60'
                          : 'bg-slate-100/60 text-slate-700 hover:bg-slate-200/60'
                      }`}
                      title={u.is_superuser
                        ? 'Démettre cet admin général (clé requise)'
                        : 'Promouvoir en admin général (clé requise)'}
                    >
                      {u.is_superuser ? '◆ Admin général' : '⬆ Promouvoir'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingUser(u)}
                      className="press text-xs px-3 py-1 rounded-lg bg-rose-100/60 text-rose-700 hover:bg-rose-200/60 transition"
                    >
                      Suppr.
                    </button>
                  </div>
                )}
              </td>
            </tr>
          )})}
        </tbody>
      </table>
      </div>
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
  const [deletingRule, setDeletingRule] = useState(null)

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

  const deleteRule = async () => {
    if (!deletingRule) return
    await adminApi.majorationRules.remove(deletingRule.id)
    setDeletingRule(null)
    refresh()
  }

  const p = (field) => (e) => setPolicy((prev) => ({ ...prev, [field]: e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value) }))

  const minsToHHMM = (mins) => {
    if (!mins || mins === 0) return '0h00'
    return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}`
  }

  if (!policy) return <div className="animate-pulse h-32 glass rounded-2xl" />

  return (
    <div className="space-y-8">

      {/* Dialog de confirmation suppression règle */}
      {deletingRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3" role="dialog">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setDeletingRule(null)} aria-hidden />
          <div className="relative glass-strong rounded-2xl w-full max-w-sm p-5 space-y-4">
            <p className="font-semibold text-slate-900">Supprimer cette règle ?</p>
            <p className="text-sm text-slate-600">
              <span className="font-medium">{deletingRule.description}</span> sera définitivement supprimée.
            </p>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setDeletingRule(null)}
                className="press px-4 py-2 text-sm glass-soft rounded-xl text-slate-700">Annuler</button>
              <button type="button" onClick={deleteRule}
                className="press px-4 py-2 text-sm bg-rose-500 text-white rounded-xl font-medium">Supprimer</button>
            </div>
          </div>
        </div>
      )}

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
                className={`press text-xs px-2.5 py-1 rounded-lg ${r.is_active ? 'bg-emerald-100/60 text-emerald-700' : 'glass text-slate-500'}`}
              >
                {r.is_active ? 'Actif' : 'Inactif'}
              </button>
              <button type="button" onClick={() => setDeletingRule(r)} className="press text-xs text-rose-600 glass-soft px-2 py-1 rounded-lg">✕</button>
            </div>
          ))}
        </div>

        {/* New rule form */}
        <form onSubmit={createRule} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end glass-soft rounded-xl p-4">
          <input
            className="glass-input col-span-2"
            placeholder="Libellé (ex: Heures sup.)"
            value={ruleForm.description}
            onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })}
            required
          />
          <select
            className="glass-input"
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
              type="number" min="0" max="1440" className="glass-input w-20"
              placeholder="min" title="Seuil en minutes (ex: 510 = 8h30)"
              value={ruleForm.threshold_minutes}
              onChange={(e) => setRuleForm({ ...ruleForm, threshold_minutes: e.target.value })}
            />
            <span className="text-xs text-slate-500">min</span>
          </div>
          <div className="flex items-center gap-1">
            <input
              type="number" min="1" max="3" step="0.05" className="glass-input w-20"
              placeholder="1.25" title="Taux (ex: 1.25 = +25%)"
              value={ruleForm.rate}
              onChange={(e) => setRuleForm({ ...ruleForm, rate: e.target.value })}
            />
            <span className="text-xs text-slate-500">×</span>
          </div>
          <button className="pill pill-primary justify-center">+ Ajouter</button>
        </form>
      </section>

      {/* ── Politique de temps de travail ────────────────────────────── */}
      <section className="glass rounded-2xl p-5">
        <h2 className="font-semibold text-base mb-1">Politique de temps de travail</h2>
        <p className="text-xs text-slate-500 mb-5">
          Ces paramètres s'appliquent à tous les collaborateurs soumis au timbrage.
          Toute modification prend effet immédiatement.
        </p>
        <form onSubmit={savePolicy} className="space-y-5">

          {/* ── Verrou mensuel ── */}
          <fieldset className="glass-soft rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">🔒</span>
              <legend className="text-sm font-semibold">Verrou mensuel</legend>
            </div>
            <p className="text-xs text-slate-500 -mt-2">
              Après le jour de clôture, les pointages du mois précédent ne peuvent plus être modifiés
              (sauf les rôles autorisés ci-dessous).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Jour de clôture du mois</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min="1" max="28"
                    className="glass-input w-20 text-center font-mono"
                    value={policy.month_lock_day}
                    onChange={p('month_lock_day')}
                  />
                  <span className="text-xs text-slate-500">
                    → clôture le {policy.month_lock_day} de chaque mois
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Qui peut modifier un mois verrouillé</label>
                <select
                  className="glass-input w-full"
                  value={policy.lock_bypass_roles}
                  onChange={(e) => { const v = e.target.value; setPolicy((prev) => ({ ...prev, lock_bypass_roles: v })) }}
                >
                  <option value="superuser">🔐 Superuser uniquement</option>
                  <option value="manager">👔 Manager et superuser</option>
                  <option value="any">👥 Tous les utilisateurs</option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Note : les utilisateurs avec le droit individuel «&nbsp;Mois verrouillés&nbsp;» peuvent toujours modifier.
                </p>
              </div>
            </div>
          </fieldset>

          {/* ── Pauses obligatoires ── */}
          <fieldset className="glass-soft rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">☕</span>
                <legend className="text-sm font-semibold">Pauses obligatoires</legend>
              </div>
              <button
                type="button"
                onClick={() => setPolicy((prev) => ({ ...prev, auto_deduct_break: !prev.auto_deduct_break }))}
                className={`text-xs px-3 py-1 rounded-full font-medium border transition ${
                  policy.auto_deduct_break
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                    : 'bg-slate-50 border-slate-300 text-slate-500'
                }`}
              >
                {policy.auto_deduct_break ? '● Déduction active' : '○ Déduction inactive'}
              </button>
            </div>
            <p className="text-xs text-slate-500 -mt-2">
              Quand la déduction est active, la pause est automatiquement soustraite du temps travaillé
              dès que le seuil est atteint. La portion payée est conservée.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-slate-600 mb-1">
                  Déclenchement après
                </label>
                <div className="flex items-center gap-2">
                  <input type="number" min="0" className="glass-input w-20 font-mono text-center"
                    value={policy.break_trigger_minutes} onChange={p('break_trigger_minutes')} />
                  <span className="text-xs text-slate-500">
                    min ({minsToHHMM(policy.break_trigger_minutes)})
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Durée de la pause</label>
                <div className="flex items-center gap-2">
                  <input type="number" min="0" className="glass-input w-20 font-mono text-center"
                    value={policy.break_duration_minutes} onChange={p('break_duration_minutes')} />
                  <span className="text-xs text-slate-500">min</span>
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Dont pause payée</label>
                <div className="flex items-center gap-2">
                  <input type="number" min="0" className="glass-input w-20 font-mono text-center"
                    value={policy.paid_break_minutes} onChange={p('paid_break_minutes')} />
                  <span className="text-xs text-slate-500">min</span>
                </div>
              </div>
            </div>
            {policy.auto_deduct_break && (
              <p className="text-xs bg-emerald-50 text-emerald-800 rounded-lg px-3 py-2">
                ● Au-delà de {minsToHHMM(policy.break_trigger_minutes)} travaillées,{' '}
                {policy.break_duration_minutes - policy.paid_break_minutes} min seront déduites
                automatiquement ({policy.break_duration_minutes} min pause −{' '}
                {policy.paid_break_minutes} min payées).
              </p>
            )}
          </fieldset>

          {/* ── Durées journalières ── */}
          <fieldset className="glass-soft rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">⏱</span>
              <legend className="text-sm font-semibold">Durées journalières</legend>
            </div>
            <p className="text-xs text-slate-500 -mt-2">
              Une alerte est affichée à l'employé lors de la sortie si le temps travaillé sort
              des bornes. Mettre 0 pour désactiver chaque borne.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-slate-600 mb-1">
                  Minimum journalier
                  {policy.daily_min_minutes === 0 && (
                    <span className="ml-1 text-[10px] text-slate-400">(désactivé)</span>
                  )}
                </label>
                <div className="flex items-center gap-2">
                  <input type="number" min="0" className="glass-input w-20 font-mono text-center"
                    value={policy.daily_min_minutes} onChange={p('daily_min_minutes')} />
                  <span className="text-xs text-slate-500">
                    {policy.daily_min_minutes > 0 ? `min (${minsToHHMM(policy.daily_min_minutes)})` : 'min'}
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">
                  Maximum journalier
                  {policy.daily_max_minutes === 0 && (
                    <span className="ml-1 text-[10px] text-slate-400">(désactivé)</span>
                  )}
                </label>
                <div className="flex items-center gap-2">
                  <input type="number" min="0" className="glass-input w-20 font-mono text-center"
                    value={policy.daily_max_minutes} onChange={p('daily_max_minutes')} />
                  <span className="text-xs text-slate-500">
                    {policy.daily_max_minutes > 0 ? `min (${minsToHHMM(policy.daily_max_minutes)})` : 'min'}
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">
                  Cible veilles de jours fériés
                  {policy.eve_holiday_reduced_minutes === 0 && (
                    <span className="ml-1 text-[10px] text-slate-400">(désactivé)</span>
                  )}
                </label>
                <div className="flex items-center gap-2">
                  <input type="number" min="0" className="glass-input w-20 font-mono text-center"
                    value={policy.eve_holiday_reduced_minutes} onChange={p('eve_holiday_reduced_minutes')} />
                  <span className="text-xs text-slate-500">
                    {policy.eve_holiday_reduced_minutes > 0
                      ? `min (${minsToHHMM(policy.eve_holiday_reduced_minutes)})`
                      : 'min'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Remplace la cible journalière la veille d'un férié (0 = cible normale).
                </p>
              </div>
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
  const [confirmingClear, setConfirmingClear] = useState(false)

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
      setConfirmingClear(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" role="dialog">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative glass-strong rounded-2xl w-full max-w-2xl p-5 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">
            🏠 Domicile de <span className="font-mono">{user.username}</span>
          </h3>
          <button type="button" onClick={onClose} className="press w-8 h-8 rounded-lg glass-soft text-slate-600">✕</button>
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
        <div className="text-xs text-slate-500 font-mono glass-soft rounded-xl px-3 py-2">
          {lat != null && lon != null
            ? `📍 lat ${lat.toFixed(6)}, lon ${lon.toFixed(6)}`
            : '— Aucun point sélectionné'}
        </div>
        {err && (
          <p className="text-xs text-rose-700 glass rounded-xl px-3 py-2 break-all">
            ⚠ {err}
          </p>
        )}

        {/* Confirmation inline d'effacement */}
        {confirmingClear && (
          <div className="glass-soft rounded-xl p-3 space-y-2">
            <p className="text-sm text-slate-700">Effacer le domicile de <span className="font-semibold">{user.username}</span> ?</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmingClear(false)}
                className="press px-3 py-1.5 text-xs glass rounded-xl text-slate-700">Annuler</button>
              <button type="button" onClick={clear} disabled={saving}
                className="press px-3 py-1.5 text-xs bg-rose-500 text-white rounded-xl font-medium disabled:opacity-50">
                {saving ? '…' : 'Confirmer'}
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-between gap-2 pt-1">
          {user.home_lat != null && !confirmingClear ? (
            <button
              type="button" onClick={() => setConfirmingClear(true)} disabled={saving}
              className="press text-sm px-3 py-2 rounded-xl text-rose-600 glass-soft"
            >
              Effacer le domicile
            </button>
          ) : <span />}
          <div className="flex gap-2 ml-auto">
            <button
              type="button" onClick={onClose} disabled={saving}
              className="press px-4 py-2 text-sm glass-soft rounded-xl text-slate-700"
            >Annuler</button>
            <button
              type="button" onClick={submit}
              disabled={saving || lat == null || lon == null}
              className="pill pill-primary disabled:opacity-50"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


// ── Modal de promotion / démotion admin général (clé secrète) ─────────
function PromoteSuperuserModal({ user, onClose, onDone }) {
  const demoting = Boolean(user.is_superuser)
  const [key, setKey] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  // Pour éviter toute promotion accidentelle, on demande aussi de retaper
  // le username (comme la suppression LPD).
  const confirmOk = confirmText.trim() === user.username && key.length >= 8

  const submit = async () => {
    if (!confirmOk) {
      setErr('Veuillez saisir la clé secrète ET retaper le username.')
      return
    }
    setSaving(true)
    setErr(null)
    try {
      const resp = await adminApi.users.promoteSuperuser(user.id, key.trim(), demoting)
      onDone(resp)
    } catch (e) {
      const data = e.response?.data
      if (data?.error === 'INVALID_KEY') {
        setErr('Clé secrète incorrecte.')
      } else if (data?.error === 'FEATURE_DISABLED') {
        setErr('Promotion superuser désactivée (SUPERUSER_PROMOTION_KEY vide).')
      } else if (data?.error === 'CANNOT_DEMOTE_SELF') {
        setErr('Vous ne pouvez pas vous démettre vous-même.')
      } else {
        setErr(data?.detail || data?.error || e.message)
      }
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" role="dialog">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative glass-strong rounded-2xl w-full max-w-md p-5 space-y-4">
        <h3 className="font-semibold text-slate-900">
          {demoting ? '⚠ Démettre admin général' : '⬆ Promouvoir admin général'}
          {' '}— <span className="font-mono">{user.username}</span>
        </h3>
        <p className={`text-xs glass rounded-xl p-3 ${demoting ? 'text-amber-700' : 'text-purple-700'}`}>
          {demoting ? (
            <>
              Démettre <strong>{user.username}</strong> retire tous les
              privilèges d'admin général (accès à l'admin, auto-approbation
              des demandes, gestion des utilisateurs). Les données restent
              intactes.
            </>
          ) : (
            <>
              Promouvoir <strong>{user.username}</strong> en admin général :
              il pourra tout faire (gérer utilisateurs, sites, paramètres,
              s'auto-approuver les demandes RH, etc.). Action sensible —
              clé secrète d'organisation requise.
            </>
          )}
        </p>
        <label className="block text-sm">
          <span className="text-slate-700">Clé secrète (admin général)</span>
          <input
            type="password"
            className="glass-input w-full mt-1 font-mono"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="••••••••••••••• (15 chiffres)"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-700">
            Pour confirmer, retapez <code className="font-mono bg-slate-100 px-1 rounded">{user.username}</code> :
          </span>
          <input
            type="text"
            className="glass-input w-full mt-1 font-mono"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={user.username}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {err && <p className="text-xs text-rose-700 glass rounded-xl p-3">⚠ {err}</p>}
        <div className="flex gap-2 justify-end">
          <button
            type="button" onClick={onClose} disabled={saving}
            className="press px-4 py-2 text-sm glass-soft rounded-xl text-slate-700"
          >Annuler</button>
          <button
            type="button" onClick={submit} disabled={saving || !confirmOk}
            className={`press px-4 py-2 text-sm text-white rounded-xl font-medium disabled:opacity-40 disabled:cursor-not-allowed ${
              demoting ? 'bg-amber-600' : 'bg-purple-600'
            }`}
          >
            {saving ? 'Traitement…' : demoting ? 'Démettre' : 'Promouvoir'}
          </button>
        </div>
      </div>
    </div>
  )
}


// ── Tab : demandes de changement d'adresse de domicile ───────────────
function HomeAddressRequestsTab() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [decidingReq, setDecidingReq] = useState(null) // {req, action}

  const refresh = () => {
    setLoading(true)
    adminApi.homeAddressRequests.list()
      .then((d) => setRequests(d.results || d))
      .finally(() => setLoading(false))
  }
  useEffect(() => { refresh() }, [])

  const pending = requests.filter((r) => r.status === 'PENDING')
  const past = requests.filter((r) => r.status !== 'PENDING')

  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-lg">Demandes de changement d'adresse</h2>
      <p className="text-xs text-slate-500">
        Une modification de l'adresse de domicile a un impact sur le calcul du
        trajet pro compensable (Art. 13 OLT 1). Approuvez après vérification
        du justificatif (RH).
      </p>

      {loading ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : (
        <>
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-amber-700">
              En attente ({pending.length})
            </h3>
            {pending.length === 0 ? (
              <p className="text-sm text-slate-400 italic">Aucune demande en attente.</p>
            ) : (
              <ul className="space-y-2">
                {pending.map((r) => (
                  <li key={r.id} className="glass-soft rounded-xl p-3 space-y-2 border-l-4 border-amber-500">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">
                          {r.user.full_name || r.user.username}{' '}
                          <span className="text-xs text-slate-500 font-mono">@{r.user.username}</span>
                        </p>
                        <p className="text-xs text-slate-500">
                          Soumis le {new Date(r.created_at).toLocaleString('fr-FR')}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setDecidingReq({ req: r, action: 'REJECT' })}
                          className="press text-xs px-3 py-1 rounded-lg bg-slate-200 text-slate-700"
                        >Refuser</button>
                        <button
                          type="button"
                          onClick={() => setDecidingReq({ req: r, action: 'APPROVE' })}
                          className="press text-xs px-3 py-1 rounded-lg bg-emerald-500 text-white font-medium"
                        >Approuver</button>
                      </div>
                    </div>
                    <p className="text-xs font-mono text-slate-700">
                      📍 {r.new_home_lat.toFixed(5)}, {r.new_home_lon.toFixed(5)}
                    </p>
                    {r.new_address_label && (
                      <p className="text-xs text-slate-600 italic">« {r.new_address_label} »</p>
                    )}
                    {r.user_reason && (
                      <p className="text-xs text-slate-500">Motif : {r.user_reason}</p>
                    )}
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${r.new_home_lat}&mlon=${r.new_home_lon}#map=17/${r.new_home_lat}/${r.new_home_lon}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-600 underline"
                    >Voir sur OpenStreetMap ↗</a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {past.length > 0 && (
            <section className="space-y-2 pt-2">
              <h3 className="text-sm font-semibold text-slate-600">Historique récent</h3>
              <ul className="space-y-1 text-xs">
                {past.slice(0, 10).map((r) => (
                  <li key={r.id} className="glass-soft rounded-xl px-3 py-2 flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      r.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {r.status === 'APPROVED' ? 'Approuvé' : 'Refusé'}
                    </span>
                    <span className="font-mono">{r.user.username}</span>
                    <span className="text-slate-500">
                      → {r.new_home_lat.toFixed(3)}, {r.new_home_lon.toFixed(3)}
                    </span>
                    <span className="text-slate-400 ml-auto">
                      {r.decided_at ? new Date(r.decided_at).toLocaleDateString('fr-FR') : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {decidingReq && (
        <HomeAddressDecideModal
          req={decidingReq.req}
          action={decidingReq.action}
          onClose={() => setDecidingReq(null)}
          onSaved={() => { setDecidingReq(null); refresh() }}
        />
      )}
    </div>
  )
}

function HomeAddressDecideModal({ req, action, onClose, onSaved }) {
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const isApprove = action === 'APPROVE'

  const submit = async () => {
    setSaving(true)
    setErr(null)
    try {
      await adminApi.homeAddressRequests.decide(req.id, action, comment)
      onSaved()
    } catch (e) {
      setErr(e?.response?.data?.detail || e.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" role="dialog">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative glass-strong rounded-2xl w-full max-w-md p-5 space-y-4">
        <h3 className="font-semibold text-slate-900">
          {isApprove ? '✓ Approuver' : '✕ Refuser'} la demande de{' '}
          <span className="font-mono">{req.user.username}</span>
        </h3>
        <p className="text-xs text-slate-600">
          Nouvelles coordonnées : <span className="font-mono">{req.new_home_lat.toFixed(5)}, {req.new_home_lon.toFixed(5)}</span>
        </p>
        {req.new_address_label && (
          <p className="text-xs text-slate-700 glass-soft rounded-xl p-2 italic">
            « {req.new_address_label} »
          </p>
        )}
        {isApprove && (
          <p className="text-xs text-emerald-700 glass-soft rounded-xl p-2">
            Les coordonnées seront appliquées immédiatement et le trajet
            standard recalculé via ORS.
          </p>
        )}
        <label className="block text-sm">
          <span className="text-slate-600">Commentaire {isApprove ? '(optionnel)' : '(motif du refus)'}</span>
          <textarea
            className="glass-input w-full mt-1 h-20"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
          />
        </label>
        {err && <p className="text-xs text-rose-700 glass rounded-xl p-3">⚠ {err}</p>}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} disabled={saving}
            className="press px-4 py-2 text-sm glass-soft rounded-xl text-slate-700">Annuler</button>
          <button type="button" onClick={submit} disabled={saving}
            className={`press px-4 py-2 text-sm text-white rounded-xl font-medium disabled:opacity-50 ${
              isApprove ? 'bg-emerald-500' : 'bg-slate-800'
            }`}>
            {saving ? 'Traitement…' : isApprove ? 'Approuver' : 'Refuser'}
          </button>
        </div>
      </div>
    </div>
  )
}
