import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as meApi from '../api/me'

/**
 * Page de profil utilisateur — édition par l'employé lui-même.
 *
 * 3 sections :
 *   1. Informations personnelles (email, prénom, nom) — édition directe
 *   2. Mot de passe (avec ancien mot de passe pour anti-hijack)
 *   3. Adresse de domicile — demande RH d'approbation
 */
export default function ProfilePage() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    meApi.profile.get().then(setProfile).finally(() => setLoading(false))
  }, [])

  if (loading || !profile) {
    return <p className="p-6 text-center text-slate-500">Chargement…</p>
  }

  return (
    <div className="px-3 max-w-2xl mx-auto pt-2 pb-8 space-y-4">
      <header className="glass rounded-3xl p-5">
        <p className="text-xs uppercase tracking-widest text-slate-500">Mon compte</p>
        <h1 className="text-xl font-semibold tracking-tight">
          {profile.username}
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Mettez à jour vos informations personnelles, votre mot de passe
          et votre adresse de domicile.
        </p>
      </header>

      <InfoSection profile={profile} onChange={setProfile} />
      <PasswordSection />
      <HomeAddressSection
        profile={profile}
        onChange={(updated) => setProfile({ ...profile, ...updated })}
      />

      <p className="text-xs text-slate-500 text-center pt-4">
        Pour les autres droits (téléchargement, suppression, retrait de
        consentement), voir <Link to="/my-data" className="underline">Mes données</Link>.
      </p>
    </div>
  )
}

// ── Section 1 : Infos perso (édition directe) ───────────────────────
function InfoSection({ profile, onChange }) {
  const [form, setForm] = useState({
    email: profile.email,
    first_name: profile.first_name,
    last_name: profile.last_name,
  })
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const dirty =
    form.email !== profile.email ||
    form.first_name !== profile.first_name ||
    form.last_name !== profile.last_name

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setFeedback(null)
    try {
      await meApi.profile.update(form)
      onChange({ ...profile, ...form })
      setFeedback({ type: 'success', msg: 'Informations mises à jour.' })
    } catch (err) {
      const detail = err.response?.data?.detail || 'Erreur lors de la mise à jour.'
      setFeedback({ type: 'error', msg: detail })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass rounded-3xl p-5 space-y-3">
      <h2 className="font-semibold">Informations personnelles</h2>
      <p className="text-xs text-slate-500">
        L'email sert aux notifications (oublis de pointage, décisions RH)
        et à la récupération du mot de passe.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-slate-600">Prénom</span>
          <input
            type="text"
            className="glass-input w-full mt-1"
            value={form.first_name}
            onChange={(e) => setForm({ ...form, first_name: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Nom</span>
          <input
            type="text"
            className="glass-input w-full mt-1"
            value={form.last_name}
            onChange={(e) => setForm({ ...form, last_name: e.target.value })}
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-slate-600">Adresse email</span>
        <input
          type="email"
          className="glass-input w-full mt-1"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="vous@exemple.com"
          autoComplete="email"
        />
      </label>
      {feedback && (
        <p
          className={`text-sm rounded-xl px-3 py-2 ${
            feedback.type === 'success'
              ? 'text-emerald-700 bg-emerald-50'
              : 'text-rose-700 bg-rose-50'
          }`}
        >
          {feedback.msg}
        </p>
      )}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!dirty || saving}
          className="pill pill-primary disabled:opacity-50"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  )
}

// ── Section 2 : Changement de mot de passe ──────────────────────────
function PasswordSection() {
  const [form, setForm] = useState({ old_password: '', new_password: '', confirm: '' })
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const ok =
    form.old_password.length > 0 &&
    form.new_password.length >= 8 &&
    form.new_password === form.confirm

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFeedback(null)
    if (form.new_password !== form.confirm) {
      setFeedback({ type: 'error', msg: 'Les deux nouveaux mots de passe ne correspondent pas.' })
      return
    }
    setSaving(true)
    try {
      await meApi.changePassword(form.old_password, form.new_password)
      setForm({ old_password: '', new_password: '', confirm: '' })
      setFeedback({ type: 'success', msg: 'Mot de passe modifié avec succès.' })
    } catch (err) {
      const detail = err.response?.data?.detail || 'Erreur lors du changement.'
      setFeedback({ type: 'error', msg: detail })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass rounded-3xl p-5 space-y-3">
      <h2 className="font-semibold">Mot de passe</h2>
      <label className="block text-sm">
        <span className="text-slate-600">Mot de passe actuel</span>
        <input
          type="password"
          className="glass-input w-full mt-1"
          value={form.old_password}
          onChange={(e) => setForm({ ...form, old_password: e.target.value })}
          autoComplete="current-password"
        />
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-slate-600">Nouveau mot de passe</span>
          <input
            type="password"
            className="glass-input w-full mt-1"
            value={form.new_password}
            onChange={(e) => setForm({ ...form, new_password: e.target.value })}
            autoComplete="new-password"
            minLength={8}
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Confirmer</span>
          <input
            type="password"
            className="glass-input w-full mt-1"
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            autoComplete="new-password"
          />
        </label>
      </div>
      <p className="text-xs text-slate-500">8 caractères minimum.</p>
      {feedback && (
        <p
          className={`text-sm rounded-xl px-3 py-2 ${
            feedback.type === 'success'
              ? 'text-emerald-700 bg-emerald-50'
              : 'text-rose-700 bg-rose-50'
          }`}
        >
          {feedback.msg}
        </p>
      )}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!ok || saving}
          className="pill pill-primary disabled:opacity-50"
        >
          {saving ? 'Modification…' : 'Modifier le mot de passe'}
        </button>
      </div>
    </form>
  )
}

// ── Section 3 : Adresse de domicile (workflow RH) ───────────────────
function HomeAddressSection({ profile, onChange }) {
  const [form, setForm] = useState({
    open: false,
    lat: profile.home_lat?.toString() ?? '',
    lon: profile.home_lon?.toString() ?? '',
    label: '',
    reason: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const pending = profile.pending_home_address_change

  const submit = async () => {
    setFeedback(null)
    const lat = parseFloat(form.lat)
    const lon = parseFloat(form.lon)
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      setFeedback({ type: 'error', msg: 'Coordonnées invalides.' })
      return
    }
    setSubmitting(true)
    try {
      const resp = await meApi.homeAddressRequest.create({
        lat, lon, label: form.label, reason: form.reason,
      })
      onChange({ pending_home_address_change: resp.request })
      setForm({ ...form, open: false, label: '', reason: '' })
      setFeedback({ type: 'success', msg: 'Demande envoyée à l\'administrateur RH.' })
    } catch (err) {
      const data = err.response?.data
      if (data?.error === 'ALREADY_PENDING' && data.request) {
        onChange({ pending_home_address_change: data.request })
        setFeedback({ type: 'error', msg: 'Une demande est déjà en attente.' })
      } else {
        setFeedback({ type: 'error', msg: data?.detail || 'Erreur lors de l\'envoi.' })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="glass rounded-3xl p-5 space-y-3">
      <h2 className="font-semibold">
        Adresse de domicile
        <span className="text-xs font-normal text-slate-500 ml-2">
          (utilisée pour le trajet pro — Art. 13 OLT 1)
        </span>
      </h2>
      <p className="text-xs text-slate-500">
        Toute modification de l'adresse de domicile a un impact contractuel
        (calcul du trajet pro compensable en mission). Votre demande est
        <strong> transmise à votre administrateur RH</strong>, qui validera
        avant que les nouvelles coordonnées soient appliquées.
      </p>

      {/* Adresse actuelle */}
      <div className="glass-soft rounded-2xl p-3 text-sm">
        <p className="text-slate-600">Adresse actuelle :</p>
        {profile.has_home_address ? (
          <p className="font-mono text-slate-800 mt-1">
            {profile.home_lat?.toFixed(5)}, {profile.home_lon?.toFixed(5)}
          </p>
        ) : (
          <p className="text-slate-400 italic mt-1">Non renseignée</p>
        )}
      </div>

      {/* Demande PENDING en cours */}
      {pending ? (
        <div className="glass-soft rounded-2xl p-3 space-y-2 border-l-4 border-amber-500">
          <p className="text-sm">
            <strong className="text-amber-700">⏳ Demande en attente</strong>
            <span className="text-slate-600">
              {' '}— soumise le {new Date(pending.created_at).toLocaleString('fr-FR')}
            </span>
          </p>
          <p className="text-sm font-mono text-slate-700">
            Nouvelles coordonnées : {pending.new_home_lat.toFixed(5)}, {pending.new_home_lon.toFixed(5)}
          </p>
          {pending.new_address_label && (
            <p className="text-xs text-slate-600 italic">« {pending.new_address_label} »</p>
          )}
          {pending.user_reason && (
            <p className="text-xs text-slate-500">Motif : {pending.user_reason}</p>
          )}
          <p className="text-xs text-slate-500">
            Vous serez notifié par email lors de la décision.
          </p>
        </div>
      ) : !form.open ? (
        <button
          type="button"
          onClick={() => setForm({ ...form, open: true })}
          className="pill pill-primary"
        >
          Demander un changement d'adresse
        </button>
      ) : (
        <div className="glass-soft rounded-2xl p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <label className="block">
              <span className="text-slate-600">Latitude</span>
              <input
                type="number"
                step="0.000001"
                className="glass-input w-full mt-1 font-mono"
                value={form.lat}
                onChange={(e) => setForm({ ...form, lat: e.target.value })}
                placeholder="46.519962"
              />
            </label>
            <label className="block">
              <span className="text-slate-600">Longitude</span>
              <input
                type="number"
                step="0.000001"
                className="glass-input w-full mt-1 font-mono"
                value={form.lon}
                onChange={(e) => setForm({ ...form, lon: e.target.value })}
                placeholder="6.633597"
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-slate-600">Adresse (libellé pour le RH)</span>
            <input
              type="text"
              className="glass-input w-full mt-1"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Rue de la Paix 12, 1003 Lausanne"
              maxLength={300}
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Motif (optionnel)</span>
            <textarea
              className="glass-input w-full mt-1 h-16"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="Ex : déménagement le 01/06"
              maxLength={1000}
            />
          </label>
          <p className="text-xs text-slate-500">
            💡 Pour trouver les coordonnées exactes : ouvrez l'adresse dans
            Google Maps ou OpenStreetMap, clic droit puis « Copier les coordonnées ».
          </p>
          {feedback && (
            <p
              className={`text-sm rounded-xl px-3 py-2 ${
                feedback.type === 'success'
                  ? 'text-emerald-700 bg-emerald-50'
                  : 'text-rose-700 bg-rose-50'
              }`}
            >
              {feedback.msg}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, open: false })}
              disabled={submitting}
              className="press px-4 py-2 text-sm text-slate-600"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="pill pill-primary disabled:opacity-50"
            >
              {submitting ? 'Envoi…' : 'Envoyer la demande au RH'}
            </button>
          </div>
        </div>
      )}

      {feedback && !form.open && (
        <p
          className={`text-sm rounded-xl px-3 py-2 ${
            feedback.type === 'success'
              ? 'text-emerald-700 bg-emerald-50'
              : 'text-rose-700 bg-rose-50'
          }`}
        >
          {feedback.msg}
        </p>
      )}
    </section>
  )
}
