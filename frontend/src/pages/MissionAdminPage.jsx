import { useCallback, useEffect, useMemo, useState } from 'react'
import * as adminApi from '../api/admin'
import * as missionsApi from '../api/missions'
import MapPicker from '../components/MapPicker'
import { useAuth } from '../hooks/useAuth'

const STATUS_FILTERS = [
  { id: 'ALL', label: 'Tous' },
  { id: 'PENDING', label: 'En attente' },
  { id: 'APPROVED', label: 'Approuvées' },
  { id: 'REJECTED', label: 'Refusées' },
]

const STATUS_PILL = {
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-rose-100 text-rose-800',
}

function fmtDuration(minutes) {
  const h = Math.floor((minutes || 0) / 60)
  const m = (minutes || 0) % 60
  return `${h}h${String(m).padStart(2, '0')}`
}

export default function MissionAdminPage() {
  const { user: me } = useAuth()
  const isSuperUser = Boolean(me?.is_superuser)
  // Mission_manager *pur* : pas manager régulier, pas superuser. Le télétravail
  // (REMOTE) est géré par le manager ou l'admin uniquement — le mission_manager
  // pur ne voit ni n'attribue de REMOTE.
  const isPureMissionManager = Boolean(
    me?.is_mission_manager && !me?.is_manager && !me?.is_superuser,
  )
  // Anti-self : le manager / mission_mgr ne peut pas valider/éditer ses propres missions.
  const canActOn = (uid) => isSuperUser || Number(uid) !== Number(me?.id ?? -1)
  const [missions, setMissions] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ status: 'ALL', user_id: '', q: '', from: '', to: '' })
  const [editing, setEditing] = useState(null)
  const [assigning, setAssigning] = useState(false)
  const [qrFor, setQrFor] = useState(null)

  const refresh = useCallback(() => {
    setLoading(true)
    const params = {}
    if (filter.status !== 'ALL') params.status = filter.status
    if (filter.user_id) params.user_id = filter.user_id
    if (filter.q) params.q = filter.q
    if (filter.from) params.from = filter.from
    if (filter.to) params.to = filter.to
    missionsApi.all(params)
      .then(setMissions)
      .finally(() => setLoading(false))
  }, [filter])

  useEffect(() => { refresh() }, [refresh])

  // Charger la liste des collabs (filtre + assign).
  useEffect(() => {
    adminApi.users.list()
      .then((d) => setUsers(d.results || d))
      .catch(() => {
        // Mission manager non-superuser n'a pas accès à /admin/users — fallback : utilise ce qu'on a.
        const fromMissions = new Map()
        missions.forEach((m) => fromMissions.set(m.user, m.username))
        setUsers([...fromMissions.entries()].map(([id, username]) => ({ id, username })))
      })
    // eslint-disable-next-line
  }, [missions.length])

  const userOptions = useMemo(
    () =>
      users
        .filter((u) => !u.is_superuser)
        // Anti-self : un manager n'attribue jamais à lui-même.
        .filter((u) => isSuperUser || Number(u.id) !== Number(me?.id ?? -1))
        .map((u) => ({
          id: u.id,
          username: u.username,
          // Coords du site de rattachement — utilisées pour pré-centrer
          // la carte de sélection du lieu de mission.
          home_site_latitude: u.home_site_latitude,
          home_site_longitude: u.home_site_longitude,
        })),
    [users, isSuperUser, me?.id],
  )

  const decide = async (id, action) => {
    try {
      if (action === 'approve') await missionsApi.approve(id)
      else {
        const c = window.prompt('Motif du refus ?') ?? ''
        await missionsApi.reject(id, c)
      }
      refresh()
    } catch (e) {
      alert(`Erreur : ${e.response?.data?.error || e.message}`)
    }
  }

  return (
    <div className="px-3 max-w-5xl mx-auto pt-2 pb-8 space-y-3">
      <header className="glass rounded-3xl p-5">
        <p className="text-xs uppercase tracking-widest text-slate-500">Gestion missions</p>
        <h1 className="text-xl font-semibold tracking-tight">Toutes les missions</h1>
        <p className="text-sm text-slate-600 mt-1">
          Vue transverse — assigner, valider, suivre le temps réellement passé.
        </p>
        {isPureMissionManager && (
          <p className="text-xs text-slate-500 mt-2 italic">
            🏠 Télétravail = géré par le manager ou l'admin (pas affiché ici).
          </p>
        )}
      </header>

      <div className="glass rounded-2xl p-3 flex flex-wrap items-end gap-2">
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setFilter({ ...filter, status: s.id })}
              className={`press text-xs px-3 py-1 rounded-full ${
                filter.status === s.id ? 'bg-slate-900 text-white' : 'glass-soft text-slate-700'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <select
          className="glass-input text-sm"
          value={filter.user_id}
          onChange={(e) => setFilter({ ...filter, user_id: e.target.value })}
        >
          <option value="">— tous les collaborateurs —</option>
          {userOptions.map((u) => (
            <option key={u.id} value={u.id}>{u.username}</option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Rechercher (lieu, n° mission)"
          className="glass-input text-sm flex-1 min-w-[12rem]"
          value={filter.q}
          onChange={(e) => setFilter({ ...filter, q: e.target.value })}
        />
        <input type="date" className="glass-input text-sm" value={filter.from}
               onChange={(e) => setFilter({ ...filter, from: e.target.value })} title="Du" />
        <input type="date" className="glass-input text-sm" value={filter.to}
               onChange={(e) => setFilter({ ...filter, to: e.target.value })} title="Au" />
        <button
          type="button"
          onClick={() => setAssigning(true)}
          className="press ml-auto pill pill-primary text-sm"
        >
          + Attribuer
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : missions.length === 0 ? (
        <p className="glass rounded-2xl p-6 text-sm text-slate-500 text-center">
          Aucune mission pour ce filtre.
        </p>
      ) : (
        <ul className="space-y-2">
          {missions.map((m) => (
            <li key={m.id} className="glass rounded-2xl p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-semibold">{m.username || `#${m.user}`}</span>
                <span className="text-slate-400">·</span>
                <span>{m.mission_type === 'REMOTE' ? '🏠 Télétravail' : '📍 Mission externe'}</span>
                {m.location_name && (
                  <span className="text-slate-500">· {m.location_name}</span>
                )}
                <span className="text-slate-500 text-xs">
                  {m.date_start} → {m.date_end}
                </span>
                {m.mission_number && (
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">
                    N° {m.mission_number}
                  </span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_PILL[m.status]}`}>
                  {m.status}
                </span>
                <span className="ml-auto text-xs text-slate-600">
                  ⏱ {fmtDuration(m.time_spent_minutes)}
                </span>
              </div>
              {/* Trajet pro Art. 13 al. 3 OLT 1 — affiché si la mission a été
                  approuvée et que le calcul a abouti. */}
              {m.mission_type === 'FIELD' && m.travel_minutes_actual != null && (
                <div className="text-xs text-slate-600 bg-indigo-50/50 rounded px-2 py-1 flex flex-wrap items-center gap-2">
                  🚗 Trajet :
                  <span><strong>{m.travel_minutes_actual}</strong> min aller</span>
                  <span className="text-slate-400">−</span>
                  <span>standard <strong>{m.standard_commute_minutes ?? 0}</strong> min</span>
                  <span className="text-slate-400">·</span>
                  <span className="font-medium text-indigo-800">
                    = {m.travel_minutes_compensable} min A/R compensé
                  </span>
                </div>
              )}
              {m.mission_type === 'FIELD' && m.status === 'APPROVED'
                && m.travel_minutes_actual == null && !m.user_has_home_address && (
                <p className="text-xs text-amber-700 bg-amber-50/60 rounded px-2 py-1">
                  ⚠ Domicile du collaborateur non défini — trajet pro non comptabilisé.
                  Définissez son adresse dans Paramètres → Utilisateurs.
                </p>
              )}
              {(m.user_comment || m.manager_comment) && (
                <div className="space-y-1 text-xs">
                  {m.user_comment && (
                    <p className="text-slate-600 bg-slate-50/70 rounded px-2 py-1">
                      💬 <span className="text-slate-500">{m.username} :</span> <em>{m.user_comment}</em>
                    </p>
                  )}
                  {m.manager_comment && (
                    <p className="text-slate-700 bg-blue-50/70 rounded px-2 py-1">
                      💬 <span className="text-slate-500">manager :</span> <em>{m.manager_comment}</em>
                    </p>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(m)}
                  className="press text-xs px-3 py-1 rounded-full glass-soft"
                >
                  Détails{canActOn(m.user) ? ' / éditer' : ''}
                </button>
                {m.status === 'PENDING' && canActOn(m.user) && (
                  <>
                    <button
                      type="button"
                      onClick={() => decide(m.id, 'approve')}
                      className="press text-xs px-3 py-1 rounded-full bg-emerald-600 text-white"
                    >
                      Approuver
                    </button>
                    <button
                      type="button"
                      onClick={() => decide(m.id, 'reject')}
                      className="press text-xs px-3 py-1 rounded-full bg-rose-600 text-white"
                    >
                      Refuser
                    </button>
                  </>
                )}
                {m.status === 'PENDING' && !canActOn(m.user) && (
                  <span className="text-[11px] italic text-slate-500 self-center">
                    votre demande — un autre admin doit décider
                  </span>
                )}
                {m.status === 'APPROVED' && m.qr_token && (
                  <button
                    type="button"
                    onClick={() => setQrFor(m)}
                    className="press text-xs px-3 py-1 rounded-full bg-slate-900 text-white"
                  >
                    📱 QR
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {assigning && (
        <AssignModal
          users={userOptions}
          onClose={() => setAssigning(false)}
          onSaved={() => { setAssigning(false); refresh() }}
          fieldOnly={isPureMissionManager}
        />
      )}
      {editing && (
        <DetailEditModal
          mission={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh() }}
          onShowQr={(m) => { setEditing(null); setQrFor(m) }}
          fieldOnly={isPureMissionManager}
        />
      )}
      {qrFor && (
        <QrModal mission={qrFor} onClose={() => setQrFor(null)} />
      )}
    </div>
  )
}

// ─────────────── Modals ───────────────

function AssignModal({ users, onClose, onSaved, fieldOnly = false }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    user_id: users[0]?.id || '',
    mission_type: 'FIELD',
    date_start: today,
    date_end: today,
    location_name: '',
    location_lat: null,
    location_lon: null,
    gps_radius_meters: 500,
    mission_number: '',
    manager_comment: '',
    auto_approve: true,
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const submit = async () => {
    setSaving(true)
    setErr(null)
    try {
      const payload = { ...form }
      if (form.mission_type === 'REMOTE') {
        delete payload.location_name
        delete payload.location_lat
        delete payload.location_lon
        delete payload.gps_radius_meters
      } else {
        payload.gps_radius_meters = Number(payload.gps_radius_meters)
      }
      await missionsApi.create(payload)
      onSaved()
    } catch (e) {
      setErr(e.response?.data || e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title="Attribuer une mission" onClose={onClose} maxWidth="max-w-lg">
      <label className="block text-sm">
        Collaborateur
        <select
          className="glass-input w-full mt-1"
          value={form.user_id}
          onChange={(e) => setForm({ ...form, user_id: e.target.value })}
          required
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.username}</option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Type
        <select
          className="glass-input w-full mt-1"
          value={form.mission_type}
          onChange={(e) => setForm({ ...form, mission_type: e.target.value })}
          disabled={fieldOnly}
        >
          <option value="FIELD">📍 Mission externe</option>
          {!fieldOnly && <option value="REMOTE">🏠 Télétravail</option>}
        </select>
        {fieldOnly && (
          <span className="text-[11px] italic text-slate-500 block mt-1">
            Le télétravail est attribué par le manager/admin.
          </span>
        )}
      </label>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <label>
          Du
          <input type="date" className="glass-input w-full mt-1"
                 value={form.date_start}
                 onChange={(e) => setForm({ ...form, date_start: e.target.value })} />
        </label>
        <label>
          Au
          <input type="date" className="glass-input w-full mt-1"
                 value={form.date_end}
                 onChange={(e) => setForm({ ...form, date_end: e.target.value })} />
        </label>
      </div>
      <label className="block text-sm">
        N° de mission (optionnel)
        <input type="text" className="glass-input w-full mt-1"
               placeholder="ex : MIS-2026-001"
               value={form.mission_number}
               onChange={(e) => setForm({ ...form, mission_number: e.target.value })} />
      </label>
      {form.mission_type === 'FIELD' && (
        <>
          <label className="block text-sm">
            Lieu
            <input type="text" className="glass-input w-full mt-1"
                   value={form.location_name}
                   onChange={(e) => setForm({ ...form, location_name: e.target.value })} />
          </label>
          <label className="block text-sm">
            Rayon GPS (m)
            <input type="number" min="50" className="glass-input w-full mt-1"
                   value={form.gps_radius_meters}
                   onChange={(e) => setForm({ ...form, gps_radius_meters: e.target.value })} />
          </label>
          <MapPicker
            lat={form.location_lat ? Number(form.location_lat) : undefined}
            lon={form.location_lon ? Number(form.location_lon) : undefined}
            radius={Number(form.gps_radius_meters)}
            // Centre par défaut : site de rattachement du collaborateur ciblé
            // (récupéré dans `users` via form.user_id). Évite que la carte
            // s'ouvre sur un point arbitraire — l'admin clique près du site.
            defaultCenter={(() => {
              const target = users.find((u) => Number(u.id) === Number(form.user_id))
              if (target?.home_site_latitude != null && target?.home_site_longitude != null) {
                return [Number(target.home_site_latitude), Number(target.home_site_longitude)]
              }
              return undefined
            })()}
            onPick={(lat, lon) =>
              setForm({ ...form, location_lat: lat.toFixed(6), location_lon: lon.toFixed(6) })
            }
          />
        </>
      )}
      <label className="block text-sm">
        Commentaire au collaborateur (optionnel)
        <textarea className="glass-input w-full mt-1 h-16"
                  value={form.manager_comment}
                  onChange={(e) => setForm({ ...form, manager_comment: e.target.value })} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.auto_approve}
               onChange={(e) => setForm({ ...form, auto_approve: e.target.checked })} />
        Créer et approuver immédiatement (QR code généré)
      </label>
      {err && <p className="text-rose-700 text-xs">{JSON.stringify(err)}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onClose} className="press px-4 py-2 text-sm">Annuler</button>
        <button type="button" disabled={saving} onClick={submit}
                className="pill pill-primary disabled:opacity-50">
          {saving ? 'Enregistrement…' : 'Attribuer'}
        </button>
      </div>
    </ModalShell>
  )
}

function DetailEditModal({ mission, onClose, onSaved, onShowQr, fieldOnly = false }) {
  const [form, setForm] = useState({
    mission_type: mission.mission_type,
    date_start: mission.date_start,
    date_end: mission.date_end,
    location_name: mission.location_name || '',
    location_lat: mission.location_lat,
    location_lon: mission.location_lon,
    gps_radius_meters: mission.gps_radius_meters || 500,
    mission_number: mission.mission_number || '',
    manager_comment: mission.manager_comment || '',
    user_comment: mission.user_comment || '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const save = async () => {
    setSaving(true)
    setErr(null)
    try {
      const payload = { ...form }
      if (form.mission_type === 'REMOTE') {
        payload.location_name = ''
        payload.location_lat = null
        payload.location_lon = null
        payload.gps_radius_meters = null
      } else {
        payload.gps_radius_meters = Number(payload.gps_radius_meters)
      }
      await missionsApi.update(mission.id, payload)
      onSaved()
    } catch (e) {
      setErr(e.response?.data || e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title={`Mission #${mission.id} — ${mission.username}`} onClose={onClose} maxWidth="max-w-lg">
      <div className="text-xs text-slate-500 -mt-2 flex flex-wrap gap-2">
        <span>Statut : <strong>{mission.status}</strong></span>
        {mission.mission_number && (
          <span>· N° <strong>{mission.mission_number}</strong></span>
        )}
        <span>· ⏱ {fmtDuration(mission.time_spent_minutes)} pointé</span>
      </div>
      <label className="block text-sm">
        N° de mission
        <input type="text" className="glass-input w-full mt-1"
               value={form.mission_number}
               onChange={(e) => setForm({ ...form, mission_number: e.target.value })} />
      </label>
      <label className="block text-sm">
        Type
        <select className="glass-input w-full mt-1"
                value={form.mission_type}
                onChange={(e) => setForm({ ...form, mission_type: e.target.value })}
                disabled={fieldOnly}>
          {!fieldOnly && <option value="REMOTE">🏠 Télétravail</option>}
          <option value="FIELD">📍 Mission externe</option>
        </select>
        {fieldOnly && (
          <span className="text-[11px] italic text-slate-500 block mt-1">
            Le télétravail est géré par le manager/admin.
          </span>
        )}
      </label>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <label>Du
          <input type="date" className="glass-input w-full mt-1"
                 value={form.date_start}
                 onChange={(e) => setForm({ ...form, date_start: e.target.value })} />
        </label>
        <label>Au
          <input type="date" className="glass-input w-full mt-1"
                 value={form.date_end}
                 onChange={(e) => setForm({ ...form, date_end: e.target.value })} />
        </label>
      </div>
      {form.mission_type === 'FIELD' && (
        <>
          <label className="block text-sm">
            Lieu
            <input type="text" className="glass-input w-full mt-1"
                   value={form.location_name}
                   onChange={(e) => setForm({ ...form, location_name: e.target.value })} />
          </label>
          <label className="block text-sm">
            Rayon GPS (m)
            <input type="number" min="50" className="glass-input w-full mt-1"
                   value={form.gps_radius_meters}
                   onChange={(e) => setForm({ ...form, gps_radius_meters: e.target.value })} />
          </label>
          <MapPicker
            lat={form.location_lat ? Number(form.location_lat) : undefined}
            lon={form.location_lon ? Number(form.location_lon) : undefined}
            radius={Number(form.gps_radius_meters)}
            // Centre par défaut : site de rattachement du collaborateur de
            // cette mission (exposé par MissionSerializer en lecture seule).
            // Utile quand la mission n'a pas encore de coords (édition d'une
            // mission REMOTE qu'on bascule en FIELD).
            defaultCenter={
              mission.user_home_site_latitude != null
                && mission.user_home_site_longitude != null
                ? [
                    Number(mission.user_home_site_latitude),
                    Number(mission.user_home_site_longitude),
                  ]
                : undefined
            }
            onPick={(lat, lon) =>
              setForm({ ...form, location_lat: lat.toFixed(6), location_lon: lon.toFixed(6) })
            }
          />
        </>
      )}
      <label className="block text-sm">
        Commentaire employé
        <textarea className="glass-input w-full mt-1 h-16"
                  value={form.user_comment}
                  onChange={(e) => setForm({ ...form, user_comment: e.target.value })} />
      </label>
      <label className="block text-sm">
        Commentaire manager
        <textarea className="glass-input w-full mt-1 h-16"
                  value={form.manager_comment}
                  onChange={(e) => setForm({ ...form, manager_comment: e.target.value })} />
      </label>
      {err && <p className="text-rose-700 text-xs">{JSON.stringify(err)}</p>}
      <div className="flex flex-wrap justify-between gap-2 pt-1">
        {mission.qr_token ? (
          <button
            type="button"
            onClick={() => onShowQr(mission)}
            className="press text-sm px-3 py-2 rounded-full bg-slate-900 text-white"
          >
            📱 Voir / télécharger QR
          </button>
        ) : <span />}
        <div className="flex gap-2 ml-auto">
          <button type="button" onClick={onClose} className="press px-4 py-2 text-sm">Annuler</button>
          <button type="button" disabled={saving} onClick={save}
                  className="pill pill-primary disabled:opacity-50">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

function QrModal({ mission, onClose }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    missionsApi.qr(mission.id).then(setData).catch((e) => setErr(e.message))
  }, [mission.id])

  const download = () => {
    if (!data) return
    const a = document.createElement('a')
    a.href = `data:image/png;base64,${data.qr_png_base64}`
    const stamp = mission.mission_number || `mission-${mission.id}`
    a.download = `qr-${stamp}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <ModalShell title={`QR — ${mission.mission_number || mission.username}`} onClose={onClose} maxWidth="max-w-sm">
      {err && <p className="text-rose-700">{err}</p>}
      {!data && !err && <p className="text-sm text-slate-500">Chargement…</p>}
      {data && (
        <>
          <img
            src={`data:image/png;base64,${data.qr_png_base64}`}
            alt="QR mission"
            width={280} height={280}
            className="mx-auto rounded-xl bg-white p-2 border"
            style={{ imageRendering: 'pixelated' }}
          />
          <div className="text-center text-xs text-slate-500 mt-2 space-y-1">
            <p>{mission.username} · {mission.date_start} → {mission.date_end}</p>
            {mission.location_name && <p>{mission.location_name}</p>}
            {mission.mission_number && (
              <p className="font-mono">N° {mission.mission_number}</p>
            )}
          </div>
          <button
            type="button"
            onClick={download}
            className="pill pill-primary w-full justify-center mt-3"
          >
            ⬇ Télécharger le QR (PNG)
          </button>
        </>
      )}
    </ModalShell>
  )
}

function ModalShell({ title, onClose, children, maxWidth = 'max-w-md' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3" role="dialog">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className={`relative glass-strong w-full ${maxWidth} rounded-3xl p-5 max-h-[90vh] overflow-y-auto safe-bottom space-y-3`}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="press w-8 h-8 rounded-lg hover:bg-white/40">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
