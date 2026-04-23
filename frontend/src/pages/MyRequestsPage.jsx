import { useCallback, useEffect, useMemo, useState } from 'react'
import * as absencesApi from '../api/absences'
import * as missionsApi from '../api/missions'
import MapPicker from '../components/MapPicker'

const STATUSES = ['ALL', 'PENDING', 'APPROVED', 'REJECTED']
const KINDS = [
  { id: 'all', label: 'Tout' },
  { id: 'mission', label: 'Missions' },
  { id: 'absence', label: 'Congés' },
]

const STATUS_PILL = {
  PENDING: 'bg-amber-100/80 text-amber-800',
  APPROVED: 'bg-emerald-100/80 text-emerald-800',
  REJECTED: 'bg-rose-100/80 text-rose-800',
}

export default function MyRequestsPage() {
  const [missions, setMissions] = useState([])
  const [absences, setAbsences] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [kindFilter, setKindFilter] = useState('all')
  const [missionEditing, setMissionEditing] = useState(null)
  const [missionQr, setMissionQr] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [m, a] = await Promise.all([missionsApi.my(), absencesApi.my()])
      setMissions(m.results || m)
      setAbsences(a.results || a)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const items = useMemo(() => {
    const m = (kindFilter === 'absence' ? [] : missions).map((x) => ({
      kind: 'mission',
      raw: x,
      id: x.id,
      label: `${x.mission_type}${x.location_name ? ` · ${x.location_name}` : ''}${x.mission_number ? ` · N° ${x.mission_number}` : ''}`,
      date_start: x.date_start, date_end: x.date_end,
      status: x.status, manager_comment: x.manager_comment, created_at: x.created_at,
    }))
    const a = (kindFilter === 'mission' ? [] : absences).map((x) => ({
      kind: 'absence',
      raw: x,
      id: x.id,
      label: `${x.absence_type}${x.days_count ? ` · ${x.days_count} j` : ''}`,
      date_start: x.date_start, date_end: x.date_end,
      status: x.status, manager_comment: x.manager_comment, created_at: x.created_at,
    }))
    return [...m, ...a]
      .filter((it) => statusFilter === 'ALL' || it.status === statusFilter)
      .sort((x, y) => (y.created_at || '').localeCompare(x.created_at || ''))
  }, [missions, absences, statusFilter, kindFilter])

  const counts = useMemo(() => {
    const all = [
      ...missions.map((m) => ({ status: m.status })),
      ...absences.map((a) => ({ status: a.status })),
    ]
    const c = { ALL: all.length, PENDING: 0, APPROVED: 0, REJECTED: 0 }
    for (const it of all) c[it.status] = (c[it.status] || 0) + 1
    return c
  }, [missions, absences])

  return (
    <div className="space-y-3">
      <div className="glass rounded-2xl p-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500 mr-1">Statut</span>
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`press px-3 py-1 rounded-full text-xs ${
              statusFilter === s ? 'bg-slate-900 text-white' : 'glass-soft text-slate-700'
            }`}
          >
            {s === 'ALL' ? 'Tous' : s} ({counts[s] || 0})
          </button>
        ))}
        <span className="text-xs text-slate-500 mx-1 ml-3">Type</span>
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => setKindFilter(k.id)}
            className={`press px-3 py-1 rounded-full text-xs ${
              kindFilter === k.id ? 'bg-slate-900 text-white' : 'glass-soft text-slate-700'
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500 glass rounded-2xl p-5">
          Aucune demande pour ce filtre.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li
              key={`${it.kind}-${it.id}`}
              className="glass rounded-2xl p-3 flex flex-col gap-2 text-sm"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[10px] uppercase tracking-widest text-slate-400 w-16">
                  {it.kind === 'mission' ? 'Mission' : 'Congés'}
                </span>
                <span className="font-medium flex-1 min-w-[8rem]">{it.label}</span>
                <span className="text-slate-500 text-xs whitespace-nowrap">
                  {it.date_start} → {it.date_end}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_PILL[it.status]}`}>
                  {it.status}
                </span>
                <span className="ml-auto flex items-center gap-2">
                  {it.kind === 'mission' && it.status === 'PENDING' && (
                    <button
                      type="button"
                      onClick={() => setMissionEditing(it.raw)}
                      className="press px-3 py-1 rounded-full glass-soft text-xs"
                    >
                      Éditer
                    </button>
                  )}
                  {it.kind === 'mission' && it.status === 'APPROVED' && it.raw.qr_token && (
                    <button
                      type="button"
                      onClick={() => setMissionQr(it.raw)}
                      className="press px-3 py-1 rounded-full bg-slate-900 text-white text-xs"
                    >
                      📱 Mon QR
                    </button>
                  )}
                </span>
              </div>
              {(it.raw.user_comment || it.manager_comment) && (
                <div className="space-y-1 text-xs">
                  {it.raw.user_comment && (
                    <p className="text-slate-600 bg-slate-50/70 rounded px-2 py-1">
                      💬 <span className="text-slate-500">vous :</span> <em>{it.raw.user_comment}</em>
                    </p>
                  )}
                  {it.manager_comment && (
                    <p className="text-slate-700 bg-blue-50/70 rounded px-2 py-1">
                      💬 <span className="text-slate-500">manager :</span> <em>{it.manager_comment}</em>
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {missionEditing && (
        <MissionEditModal
          mission={missionEditing}
          onClose={() => setMissionEditing(null)}
          onSaved={() => { setMissionEditing(null); refresh() }}
        />
      )}
      {missionQr && (
        <MissionQrModal
          mission={missionQr}
          onClose={() => setMissionQr(null)}
        />
      )}
    </div>
  )
}

function MissionEditModal({ mission, onClose, onSaved }) {
  const [form, setForm] = useState({
    mission_type: mission.mission_type,
    date_start: mission.date_start,
    date_end: mission.date_end,
    location_name: mission.location_name || '',
    location_lat: mission.location_lat,
    location_lon: mission.location_lon,
    gps_radius_meters: mission.gps_radius_meters || 500,
    user_comment: mission.user_comment || '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const onSave = async () => {
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
        payload.gps_radius_meters = Number(form.gps_radius_meters)
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
    <ModalShell title={`Éditer mission #${mission.id}`} onClose={onClose}>
      <label className="block text-sm">
        Type
        <select
          className="glass-input w-full mt-1"
          value={form.mission_type}
          onChange={(e) => setForm({ ...form, mission_type: e.target.value })}
        >
          <option value="REMOTE">Télétravail</option>
          <option value="FIELD">Mission externe</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          Date début
          <input type="date" className="glass-input w-full mt-1"
                 value={form.date_start} onChange={(e) => setForm({ ...form, date_start: e.target.value })} />
        </label>
        <label className="block text-sm">
          Date fin
          <input type="date" className="glass-input w-full mt-1"
                 value={form.date_end} onChange={(e) => setForm({ ...form, date_end: e.target.value })} />
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
            // Centre par défaut : site de rattachement de l'employé
            // (exposé par MissionSerializer via user.home_site).
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
        Commentaire au manager
        <textarea
          className="glass-input w-full mt-1 h-20"
          value={form.user_comment}
          onChange={(e) => setForm({ ...form, user_comment: e.target.value })}
        />
      </label>
      {err && <p className="text-rose-700 text-xs">{JSON.stringify(err)}</p>}
      <ModalButtons onClose={onClose} onSubmit={onSave} saving={saving} />
    </ModalShell>
  )
}

function MissionQrModal({ mission, onClose }) {
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
    <ModalShell title={`QR — ${mission.mission_number || mission.mission_type}`} onClose={onClose} maxWidth="max-w-sm">
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
          <div className="text-center text-xs text-slate-500 mt-3 space-y-1">
            <p>{mission.date_start} → {mission.date_end}</p>
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

function ModalButtons({ onClose, onSubmit, saving }) {
  return (
    <div className="flex gap-2 justify-end pt-2">
      <button type="button" onClick={onClose} className="press px-4 py-2 text-sm">Annuler</button>
      <button
        type="button"
        disabled={saving}
        onClick={onSubmit}
        className="pill pill-primary disabled:opacity-50"
      >
        {saving ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </div>
  )
}
