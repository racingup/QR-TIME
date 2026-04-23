import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import * as absencesApi from '../api/absences'
import { tokens } from '../api/axiosInstance'
import * as clockApi from '../api/clock'
import * as managerApi from '../api/manager'
import * as missionsApi from '../api/missions'
import MapPicker from '../components/MapPicker'
import { useAuth } from '../hooks/useAuth'

const TABS = [
  { id: 'overview', label: 'Vue d\'ensemble' },
  { id: 'team', label: 'Mon équipe' },
  { id: 'team-calendar', label: 'Calendrier équipe' },
  { id: 'reporting', label: 'Reporting mensuel' },
]

export default function ManagerDashboard() {
  const [tab, setTab] = useState('overview')
  return (
    <div className="max-w-5xl mx-auto p-3 sm:p-6">
      <h1 className="text-xl sm:text-2xl font-semibold mb-4">Tableau de bord manager</h1>
      {/* Sur mobile : padding réduit + scroll horizontal des tabs.
          `-mx-3 px-3` étend la zone scrollable bord-à-bord. */}
      <nav className="flex gap-2 border-b mb-4 overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
        {TABS.map((t) => (
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
      {tab === 'overview' && <OverviewTab />}
      {tab === 'team' && <TeamTab />}
      {tab === 'team-calendar' && <TeamCalendarTab />}
      {tab === 'reporting' && <ReportingTab />}
    </div>
  )
}

function TeamTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    setLoading(true)
    managerApi.team().then(setData).finally(() => setLoading(false))
  }, [])

  if (loading || !data) return <p className="text-sm text-slate-500">Chargement…</p>

  const rows = data.rows.filter(
    (r) => !filter || r.username.toLowerCase().includes(filter.toLowerCase()),
  )

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3 flex-wrap">
        <p className="text-sm text-slate-500">
          Semaine du {data.week_start} au {data.week_end}
        </p>
        <input
          type="search"
          placeholder="Filtrer un nom…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="ml-auto glass-input text-sm"
        />
      </header>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun collaborateur.</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {rows.map((r) => {
            const today = new Date().toISOString().slice(0, 10)
            const pct = Math.min(
              100,
              Math.round((r.week_worked_minutes / Math.max(r.week_target_minutes, 1)) * 100),
            )
            const overtime = r.overtime_balance_hours
            const overtimeColor = overtime >= 0 ? 'text-emerald-700' : 'text-rose-700'
            const statusBadge = {
              present: { color: 'bg-emerald-100 text-emerald-800', label: '● présent' },
              absent_on_leave: { color: 'bg-rose-100 text-rose-800', label: '🏖 absent' },
              silent: { color: 'bg-slate-100 text-slate-600', label: '○ ni pointé' },
            }[r.today_status]
            return (
              <li key={r.user_id} className="glass rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Link
                    to={`/history/${today}?user_id=${r.user_id}`}
                    className="font-semibold text-blue-700 hover:underline"
                  >
                    {r.username}
                  </Link>
                  {r.is_manager && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                      manager
                    </span>
                  )}
                  {r.is_superuser && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                      super
                    </span>
                  )}
                  <span
                    className={`ml-auto text-[10px] px-2 py-0.5 rounded-full ${statusBadge.color}`}
                  >
                    {statusBadge.label}
                  </span>
                </div>
                {r.home_site_name && (
                  <p className="text-xs text-slate-500">📍 {r.home_site_name}</p>
                )}
                <div>
                  <p className="text-xs text-slate-500 flex justify-between">
                    <span>
                      Semaine : {Math.floor(r.week_worked_minutes / 60)}h
                      {String(r.week_worked_minutes % 60).padStart(2, '0')} /{' '}
                      {Math.floor(r.week_target_minutes / 60)}h
                    </span>
                    <span>{pct}%</span>
                  </p>
                  <div className="h-1.5 mt-1 rounded-full bg-white/60 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-sky-400 to-indigo-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className={overtimeColor}>
                    Sup : {overtime >= 0 ? '+' : ''}{overtime.toFixed(2)} h
                  </span>
                  <span className="text-slate-500">
                    Congés : {r.vacation_remaining.toFixed(1)} j
                  </span>
                </div>
                {(r.unresolved_alerts > 0 || r.pending_missions > 0 || r.pending_absences > 0) && (
                  <div className="flex items-center gap-2 text-[11px] pt-1 border-t border-white/40">
                    {r.unresolved_alerts > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                        ⚠ {r.unresolved_alerts} alerte{r.unresolved_alerts > 1 ? 's' : ''}
                      </span>
                    )}
                    {r.pending_missions > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                        {r.pending_missions} mission{r.pending_missions > 1 ? 's' : ''}
                      </span>
                    )}
                    {r.pending_absences > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                        {r.pending_absences} congé{r.pending_absences > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function OverviewTab() {
  const { user: me } = useAuth()
  const isSuperUser = Boolean(me?.is_superuser)
  // Anti-self : un manager ne peut pas valider ses propres demandes.
  const canActOn = (uid) =>
    isSuperUser || Number(uid) !== Number(me?.id ?? -1)
  const [presence, setPresence] = useState({ present: [], count: 0 })
  const [absent, setAbsent] = useState({ absent_on_leave: [], silent: [] })
  const [alerts, setAlerts] = useState({ alerts: [], pending_justifications: [] })
  const [pendingMissions, setPendingMissions] = useState([])
  const [pendingAbsences, setPendingAbsences] = useState([])
  const [loading, setLoading] = useState(true)
  const [missionToApprove, setMissionToApprove] = useState(null)
  const [missionToEdit, setMissionToEdit] = useState(null)

  const refreshAll = useCallback(async () => {
    const [p, ab, a, m, abs] = await Promise.all([
      managerApi.presence(),
      managerApi.absent(),
      managerApi.alerts(),
      missionsApi.pending(),
      absencesApi.pending(),
    ])
    setPresence(p)
    setAbsent(ab)
    setAlerts(a)
    setPendingMissions(m.results || m)
    setPendingAbsences(abs.results || abs)
    setLoading(false)
  }, [])

  useEffect(() => {
    refreshAll()
    const t = setInterval(refreshAll, 60_000)
    return () => clearInterval(t)
  }, [refreshAll])

  const quickRegularize = async (sessionId) => {
    if (!window.confirm('Clôturer cette session avec une durée par défaut de 8h ?')) return
    try {
      await clockApi.regularize(sessionId, null)
      refreshAll()
    } catch (e) {
      alert(`Erreur : ${e.response?.data?.error || e.message}`)
    }
  }

  const decideAbsence = async (id, action) => {
    try {
      if (action === 'approve') await absencesApi.approve(id)
      else {
        const c = window.prompt('Motif du refus ?') ?? ''
        await absencesApi.reject(id, c)
      }
      refreshAll()
    } catch (e) {
      alert(`Erreur : ${e.response?.data?.error || e.message}`)
    }
  }

  const rejectMission = async (id) => {
    const c = window.prompt('Motif du refus ?') ?? ''
    try {
      await missionsApi.reject(id, c)
      refreshAll()
    } catch (e) {
      alert(`Erreur : ${e.response?.data?.error || e.message}`)
    }
  }

  if (loading) return <p>Chargement…</p>

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold mb-3">
          Temps réel — présence ({presence.count}) · absents ({absent.absent_on_leave.length})
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {presence.present.map((p) => {
            const today = new Date(p.clock_in).toISOString().slice(0, 10)
            return (
              <Link
                key={`p-${p.user_id}`}
                to={`/history/${today}?user_id=${p.user_id}`}
                className="bg-green-50 border border-green-200 rounded p-3 text-sm hover:bg-green-100 press"
              >
                <p className="font-semibold">{p.username}</p>
                <p className="text-xs text-gray-600">
                  {p.session_type}{p.site_name ? ` · ${p.site_name}` : ''}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Depuis {new Date(p.clock_in).toLocaleTimeString('fr-FR')}
                </p>
              </Link>
            )
          })}
          {absent.absent_on_leave.map((a) => (
            <div
              key={`a-${a.user_id}`}
              className="bg-red-50 border border-red-300 rounded p-3 text-sm"
            >
              <p className="font-semibold text-red-800">{a.username}</p>
              <p className="text-xs text-red-700">
                Absent · {a.absence_type}
              </p>
              <p className="text-xs text-red-600 mt-1">
                {a.date_start} → {a.date_end}
                {(a.half_day_start || a.half_day_end) && ' (½ j)'}
              </p>
            </div>
          ))}
          {absent.silent.map((s) => (
            <div
              key={`s-${s.id}`}
              className="bg-gray-50 border border-gray-200 rounded p-3 text-sm text-gray-500"
            >
              <p className="font-semibold">{s.username}</p>
              <p className="text-xs">Pas pointé · pas d'absence</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">
          Alertes ({alerts.alerts.length + alerts.pending_justifications.length})
        </h2>
        <ul className="space-y-2">
          {alerts.alerts.map((a) => (
            <li key={`alert-${a.id}`} className="border rounded p-3 bg-red-50 flex flex-wrap items-center gap-2">
              <p className="text-sm flex-1 min-w-[12rem]">
                <span className="font-semibold">{a.username}</span> — {a.message}
              </p>
              {a.kind === 'FORGOTTEN_CLOCKOUT' && a.session_id && (
                <button
                  type="button"
                  onClick={() => quickRegularize(a.session_id)}
                  className="press text-xs px-3 py-1 rounded-full bg-emerald-600 text-white"
                  title="Clôturer la session avec une durée par défaut de 8h"
                >
                  ⚡ Clôturer (8h)
                </button>
              )}
              {a.session_date && (
                <Link
                  to={`/history/${a.session_date}?user_id=${a.user_id}`}
                  className="press text-xs px-3 py-1 rounded-full bg-slate-900 text-white"
                >
                  Éditer manuellement
                </Link>
              )}
            </li>
          ))}
          {alerts.pending_justifications.map((j) => (
            <li key={`justif-${j.session_id}`} className="border rounded p-3 bg-orange-50 flex flex-wrap items-center gap-2">
              <p className="text-sm flex-1 min-w-[12rem]">
                <span className="font-semibold">{j.username}</span> — justification :{' '}
                <em>{j.justification}</em>
              </p>
              <Link
                to={`/history/${j.session_date}?user_id=${j.user_id}`}
                className="press text-xs px-3 py-1 rounded-full bg-slate-900 text-white"
              >
                Éditer la session
              </Link>
            </li>
          ))}
          {alerts.alerts.length + alerts.pending_justifications.length === 0 && (
            <li className="text-sm text-gray-500">Aucune alerte.</li>
          )}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Centre de validation</h2>
        <div className="mb-4">
          <p className="text-sm font-medium text-gray-700 mb-2">
            Missions en attente ({pendingMissions.length})
          </p>
          {pendingMissions.length === 0 ? (
            <p className="text-sm text-gray-400">Aucune.</p>
          ) : (
            <ul className="space-y-2">
              {pendingMissions.map((m) => (
                <li key={`m-${m.id}`} className="flex flex-col gap-2 border rounded p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="font-semibold">{m.username || `#${m.user}`}</span>
                      <span className="text-slate-400 mx-1">·</span>
                      {m.mission_type}
                      <span className="text-slate-400 mx-1">·</span>
                      <span className="text-slate-600">{m.date_start} → {m.date_end}</span>
                      {m.location_name && (
                        <span className="text-slate-500"> · {m.location_name}</span>
                      )}
                    </span>
                  <span className="flex gap-2">
                    {canActOn(m.user) ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setMissionToEdit(m)}
                          className="press px-3 py-1 rounded-full glass-soft text-xs"
                        >
                          Éditer
                        </button>
                        <button
                          type="button"
                          onClick={() => setMissionToApprove(m)}
                          className="press bg-emerald-600 text-white px-3 py-1 rounded-full text-xs"
                        >
                          Approuver
                        </button>
                        <button
                          type="button"
                          onClick={() => rejectMission(m.id)}
                          className="press bg-rose-600 text-white px-3 py-1 rounded-full text-xs"
                        >
                          Refuser
                        </button>
                      </>
                    ) : (
                      <span className="text-[11px] italic text-slate-500 self-center">
                        votre demande — un autre manager doit décider
                      </span>
                    )}
                  </span>
                  </div>
                  {m.user_comment && (
                    <p className="text-xs text-slate-600 bg-slate-50/70 rounded px-2 py-1">
                      💬 <em>{m.user_comment}</em>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">
            Congés en attente ({pendingAbsences.length})
          </p>
          {pendingAbsences.length === 0 ? (
            <p className="text-sm text-gray-400">Aucun.</p>
          ) : (
            <ul className="space-y-2">
              {pendingAbsences.map((a) => (
                <li key={`a-${a.id}`} className="flex flex-col gap-2 border rounded p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="font-semibold">{a.username || `#${a.user}`}</span>
                      <span className="text-slate-400 mx-1">·</span>
                      {a.absence_type}
                      <span className="text-slate-400 mx-1">·</span>
                      <span className="text-slate-600">{a.date_start} → {a.date_end}</span>
                      <span className="text-slate-500"> · {a.days_count} j</span>
                    </span>
                    <span className="flex gap-2">
                      {canActOn(a.user) ? (
                        <>
                          <button
                            type="button"
                            onClick={() => decideAbsence(a.id, 'approve')}
                            className="press bg-emerald-600 text-white px-3 py-1 rounded-full text-xs"
                          >
                            Valider
                          </button>
                          <button
                            type="button"
                            onClick={() => decideAbsence(a.id, 'reject')}
                            className="press bg-rose-600 text-white px-3 py-1 rounded-full text-xs"
                          >
                            Refuser
                          </button>
                        </>
                      ) : (
                        <span className="text-[11px] italic text-slate-500 self-center">
                          votre demande — un autre manager doit décider
                        </span>
                      )}
                    </span>
                  </div>
                  {a.user_comment && (
                    <p className="text-xs text-slate-600 bg-slate-50/70 rounded px-2 py-1">
                      💬 <em>{a.user_comment}</em>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {missionToApprove && (
        <ApproveMissionModal
          mission={missionToApprove}
          onClose={() => setMissionToApprove(null)}
          onSaved={() => { setMissionToApprove(null); refreshAll() }}
        />
      )}
      {missionToEdit && (
        <EditMissionModal
          mission={missionToEdit}
          onClose={() => setMissionToEdit(null)}
          onSaved={() => { setMissionToEdit(null); refreshAll() }}
        />
      )}
    </div>
  )
}

function EditMissionModal({ mission, onClose, onSaved }) {
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

  const onSave = async () => {
    setSaving(true)
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
      alert(`Erreur : ${e.response?.data?.error || e.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 z-50">
      <div className="glass-strong rounded-3xl p-5 w-full sm:max-w-md max-h-[90vh] overflow-y-auto safe-bottom space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">
            Éditer mission · {mission.user}
          </h3>
          <button type="button" onClick={onClose} className="press w-8 h-8 rounded-lg hover:bg-white/40">✕</button>
        </div>
        <label className="block text-sm">
          Type
          <select className="glass-input w-full mt-1"
                  value={form.mission_type}
                  onChange={(e) => setForm({ ...form, mission_type: e.target.value })}>
            <option value="REMOTE">Télétravail</option>
            <option value="FIELD">Mission externe</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            Début
            <input type="date" className="glass-input w-full mt-1"
                   value={form.date_start} onChange={(e) => setForm({ ...form, date_start: e.target.value })} />
          </label>
          <label className="block text-sm">
            Fin
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
              onPick={(lat, lon) =>
                setForm({ ...form, location_lat: lat.toFixed(6), location_lon: lon.toFixed(6) })
              }
            />
          </>
        )}
        <label className="block text-sm">
          Commentaire de l'employé
          <textarea
            className="glass-input w-full mt-1 h-20"
            value={form.user_comment}
            onChange={(e) => setForm({ ...form, user_comment: e.target.value })}
          />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="press px-4 py-2 text-sm">Annuler</button>
          <button type="button" disabled={saving} onClick={onSave}
                  className="pill pill-primary disabled:opacity-50">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ApproveMissionModal({ mission, onClose, onSaved }) {
  const [radius, setRadius] = useState(mission.gps_radius_meters || 500)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async () => {
    setSubmitting(true)
    try {
      const payload = { manager_comment: comment }
      if (mission.mission_type === 'FIELD') {
        payload.gps_radius_meters = Number(radius)
      }
      await missionsApi.approve(mission.id, payload)
      onSaved()
    } catch (e) {
      alert(`Erreur : ${e.response?.data?.error || e.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-5 max-w-sm w-full space-y-3">
        <h3 className="font-semibold">
          Approuver {mission.user} · {mission.mission_type}
        </h3>
        <p className="text-sm text-gray-600">
          {mission.date_start} → {mission.date_end}
          {mission.location_name && <> · {mission.location_name}</>}
        </p>
        {mission.mission_type === 'FIELD' && (
          <>
            <label className="block text-sm">
              Rayon GPS de validation (m)
              <input
                type="number" min="50"
                className="w-full border rounded p-2 mt-1"
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
              />
              <span className="text-xs text-gray-500">
                Demandé par l'employé : {mission.gps_radius_meters || 'non spécifié'}
              </span>
            </label>
            <div className="text-xs text-indigo-700 bg-indigo-50/70 rounded p-2 leading-snug">
              🚗 À l'approbation, le trajet pro (Art. 13 al. 3 OLT 1) sera
              calculé automatiquement : trajet domicile → mission moins le
              trajet standard du collaborateur. Le résultat apparaîtra sur la
              fiche mission, et sera comptabilisé dans son temps de travail.
            </div>
          </>
        )}
        <label className="block text-sm">
          Commentaire (optionnel)
          <textarea
            className="w-full border rounded p-2 mt-1 h-20"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </label>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-3 py-1 text-sm">
            Annuler
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={onSubmit}
            className="bg-green-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
          >
            {submitting ? 'Approbation…' : 'Approuver'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ReportingTab() {
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [month, setMonth] = useState(defaultMonth)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [drilldown, setDrilldown] = useState(null) // { user_id, username }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await managerApi.report(month)
      setReport(data)
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => { load() }, [load])

  const downloadAuthorized = async (format) => {
    // Fetch with Authorization header so the JWT is honored, then trigger
    // a blob download (the backend serves CSV/PDF as attachment).
    const url = managerApi.reportDownloadUrl(month, format)
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${tokens.access}` },
    })
    if (!r.ok) {
      alert(`Échec du téléchargement (${r.status})`)
      return
    }
    const blob = await r.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `report-${month}.${format}`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3 flex-wrap">
        <label className="text-sm">
          Mois
          <input
            type="month"
            className="border rounded p-1 ml-2"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => downloadAuthorized('csv')}
          className="bg-gray-700 text-white px-3 py-1 rounded text-sm"
        >
          Télécharger CSV
        </button>
        <button
          type="button"
          onClick={() => downloadAuthorized('pdf')}
          className="bg-red-700 text-white px-3 py-1 rounded text-sm"
        >
          Télécharger PDF
        </button>
      </header>

      {loading || !report ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : report.rows.length === 0 ? (
        <p className="text-sm text-gray-500">Aucun collaborateur actif.</p>
      ) : (
        // Wrapper de scroll horizontal pour mobile (tableau 9 colonnes ne
        // tient pas en 402 px). `-mx-3 sm:mx-0` étend bord-à-bord du viewport.
        <div className="overflow-x-auto -mx-3 sm:mx-0">
        <table className="min-w-[640px] sm:min-w-0 w-full text-sm bg-white border">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="p-2 font-mono text-xs">ID</th>
              <th className="p-2">Collaborateur</th>
              <th className="p-2 text-right">Sessions</th>
              <th className="p-2 text-right">Heures travaillées</th>
              <th className="p-2 text-right">Solde heures sup</th>
              <th className="p-2 text-right">Oublis</th>
              <th className="p-2 text-right">Sessions ouvertes</th>
              <th className="p-2 text-right">Quota congés</th>
              <th className="p-2 text-right">Congés utilisés</th>
              <th className="p-2 text-right">Congés restants</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {report.rows.map((r) => {
              const isAnonymized = /^deleted_\d+$/.test(r.username || '')
              return (
              <tr
                key={r.user_id}
                className={`hover:bg-blue-50 cursor-pointer ${isAnonymized ? 'text-slate-500 italic bg-slate-50/40' : ''}`}
                onClick={() => setDrilldown({ user_id: r.user_id, username: r.username })}
              >
                <td className="p-2 font-mono text-xs text-slate-700">#{r.user_id}</td>
                <td className="p-2 font-medium text-blue-700">
                  {isAnonymized ? <span title="Compte anonymisé">🕯 {r.username}</span> : <>{r.username} ›</>}
                </td>
                <td className="p-2 text-right">{r.sessions_count}</td>
                <td className="p-2 text-right">{r.worked_hours.toFixed(2)} h</td>
                <td className={`p-2 text-right ${r.overtime_balance_hours >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {r.overtime_balance_hours >= 0 ? '+' : ''}
                  {r.overtime_balance_hours.toFixed(2)} h
                </td>
                <td className="p-2 text-right">{r.forgotten_sessions || ''}</td>
                <td className="p-2 text-right">{r.open_sessions || ''}</td>
                <td className="p-2 text-right">{r.vacation_quota}</td>
                <td className="p-2 text-right">{r.vacation_used.toFixed(1)}</td>
                <td className="p-2 text-right">{r.vacation_remaining.toFixed(1)}</td>
              </tr>
            )})}
          </tbody>
        </table>
        </div>
      )}

      {drilldown && (
        <UserDailyDrilldown
          userId={drilldown.user_id}
          username={drilldown.username}
          month={month}
          onClose={() => setDrilldown(null)}
        />
      )}
    </div>
  )
}

function UserDailyDrilldown({ userId, username, month, onClose }) {
  const [data, setData] = useState(null)
  const refresh = useCallback(() => {
    managerApi.reportForUser(userId, month).then(setData)
  }, [userId, month])
  useEffect(() => { refresh() }, [refresh])

  const onDeleteSession = async (s) => {
    const ok = window.confirm(
      `Supprimer le pointage ${fmtTime(s.clock_in_rounded)}` +
      (s.clock_out_rounded ? `–${fmtTime(s.clock_out_rounded)}` : ' (en cours)') +
      ' ?\n\nL\'opération est tracée dans le journal d\'audit.',
    )
    if (!ok) return
    try {
      await clockApi.deleteSession(s.id)
      refresh()
    } catch (e) {
      alert(`Erreur : ${e?.response?.data?.error || e?.message || 'inconnue'}`)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <header className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
          <h3 className="font-semibold">
            {username} — détail du mois {month}
          </h3>
          <button type="button" onClick={onClose} className="text-gray-500 text-lg">✕</button>
        </header>
        {!data ? (
          <p className="p-4 text-sm text-gray-500">Chargement…</p>
        ) : (
          <div className="p-4 space-y-3">
            <p className="text-sm text-gray-700">
              Total mois : <strong>{data.total_worked_hours.toFixed(2)} h</strong>
              · Solde sup : <strong className={data.overtime_balance_hours >= 0 ? 'text-green-700' : 'text-red-700'}>
                {data.overtime_balance_hours >= 0 ? '+' : ''}{data.overtime_balance_hours.toFixed(2)} h
              </strong>
              · Congés restants : <strong>{data.vacation_remaining.toFixed(1)} j</strong>
            </p>
            <table className="w-full text-xs border bg-white">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="p-2">Jour</th>
                  <th className="p-2">Sessions</th>
                  <th className="p-2 text-right">Travaillé</th>
                  <th className="p-2">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.days.map((d) => {
                  const isWeekend = d.weekday === 'Saturday' || d.weekday === 'Sunday'
                  const tagBg = d.holiday
                    ? 'bg-blue-50'
                    : d.absence
                      ? 'bg-amber-50'
                      : isWeekend
                        ? 'bg-gray-50'
                        : ''
                  return (
                    <tr key={d.date} className={`${tagBg} hover:bg-blue-50/60`}>
                      <td className="p-2 font-mono whitespace-nowrap">
                        <Link
                          to={`/history/${d.date}?user_id=${userId}`}
                          className="text-blue-700 underline"
                        >
                          {d.date}
                        </Link>
                      </td>
                      <td className="p-2">
                        {d.sessions.length === 0 && '—'}
                        {d.sessions.map((s) => (
                          <span
                            key={s.id}
                            className="inline-flex items-center gap-1 mr-2 text-gray-600 bg-white border rounded px-1.5"
                          >
                            <span>
                              {fmtTime(s.clock_in_rounded)}–{fmtTime(s.clock_out_rounded) || '?'}
                            </span>
                            <button
                              type="button"
                              onClick={() => onDeleteSession(s)}
                              className="text-rose-600 hover:text-rose-800 leading-none px-0.5"
                              title="Supprimer ce pointage (audit log conservé)"
                              aria-label="Supprimer"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </td>
                      <td className="p-2 text-right whitespace-nowrap">
                        {d.worked_minutes > 0
                          ? `${Math.floor(d.worked_minutes / 60)}h${String(d.worked_minutes % 60).padStart(2, '0')}`
                          : '—'}
                        {d.travel_compensable_minutes > 0 && (
                          <div className="text-[10px] text-indigo-700 italic">
                            dont {d.travel_compensable_minutes} min trajet
                          </div>
                        )}
                      </td>
                      <td className="p-2 text-gray-600">
                        {d.holiday && <span className="text-blue-700">🎉 {d.holiday}</span>}
                        {d.absence && (
                          <span className="text-amber-700 ml-2">
                            🏖 {d.absence.type}
                            {(d.absence.half_day_start || d.absence.half_day_end) && ' (½ j)'}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function fmtTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

// ─────────────── Team calendar ───────────────

function TeamCalendarTab() {
  const [anchor, setAnchor] = useState(new Date())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const range = useMemo(() => {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
    return { start, end }
  }, [anchor])

  const iso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  useEffect(() => {
    setLoading(true)
    managerApi.teamCalendar(iso(range.start), iso(range.end))
      .then(setData)
      .finally(() => setLoading(false))
  }, [range.start, range.end])

  const { byDay, userColors } = useMemo(() => {
    const map = {}
    const colorMap = new Map()
    const palette = [
      'bg-rose-400', 'bg-amber-400', 'bg-emerald-400', 'bg-sky-400',
      'bg-violet-400', 'bg-pink-400', 'bg-teal-400', 'bg-indigo-400',
    ]
    const colorFor = (uid) => {
      if (!colorMap.has(uid)) {
        colorMap.set(uid, palette[colorMap.size % palette.length])
      }
      return colorMap.get(uid)
    }
    if (!data) return { byDay: map, userColors: colorMap }
    const pushDay = (key, item) => {
      if (!map[key]) map[key] = []
      map[key].push(item)
    }
    const dayWalk = (startIso, endIso, addItem) => {
      let cur = new Date(startIso + 'T00:00:00')
      const end = new Date(endIso + 'T00:00:00')
      while (cur <= end) {
        addItem(iso(cur))
        cur.setDate(cur.getDate() + 1)
      }
    }
    for (const a of data.absences) {
      const c = colorFor(a.user_id)
      dayWalk(a.date_start, a.date_end, (d) =>
        pushDay(d, { kind: 'absence', color: c, label: a.username, sub: a.absence_type, status: a.status }),
      )
    }
    for (const m of data.missions) {
      const c = colorFor(m.user_id)
      dayWalk(m.date_start, m.date_end, (d) =>
        pushDay(d, { kind: 'mission', color: c, label: m.username, sub: m.mission_type, status: m.status }),
      )
    }
    return { byDay: map, userColors: colorMap }
  }, [data])

  const shift = (delta) => {
    const d = new Date(anchor)
    d.setMonth(d.getMonth() + delta)
    setAnchor(d)
  }

  const monthLabel = anchor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  // Build month grid (Mon-first)
  const first = range.start
  const leading = (first.getDay() + 6) % 7
  const cells = []
  for (let i = 0; i < leading; i += 1) cells.push(null)
  let cur = new Date(first)
  while (cur <= range.end) {
    cells.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => shift(-1)} className="press w-9 h-9 rounded-xl glass-soft">←</button>
        <h2 className="text-base font-semibold capitalize">{monthLabel}</h2>
        <button type="button" onClick={() => shift(+1)} className="press w-9 h-9 rounded-xl glass-soft">→</button>
        <button type="button" onClick={() => setAnchor(new Date())} className="press px-3 py-1 rounded-xl glass-soft text-sm">
          Aujourd'hui
        </button>
        <span className="ml-auto text-xs text-slate-500">
          {data?.absences.length || 0} absence(s) · {data?.missions.length || 0} mission(s) · {userColors.size} personne(s) concernée(s)
        </span>
      </header>

      {loading ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500">
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <div key={`b-${i}`} className="min-h-[80px]" />
              const key = iso(d)
              const items = byDay[key] || []
              const isToday = iso(new Date()) === key
              return (
                <div
                  key={key}
                  className={`glass-soft rounded-lg p-1 min-h-[80px] flex flex-col text-[10px] ${
                    isToday ? 'ring-2 ring-blue-500' : ''
                  }`}
                >
                  <span className="text-slate-600 font-medium">{d.getDate()}</span>
                  <div className="mt-1 space-y-0.5 overflow-hidden">
                    {items.slice(0, 3).map((it, j) => (
                      <div
                        key={j}
                        title={`${it.label} — ${it.kind === 'absence' ? '🏖' : '📍'} ${it.sub} (${it.status})`}
                        className={`${it.color} ${it.status !== 'APPROVED' ? 'opacity-60' : ''} rounded px-1 truncate text-white text-[9px] leading-tight`}
                      >
                        {it.kind === 'absence' ? '🏖' : '📍'} {it.label}
                      </div>
                    ))}
                    {items.length > 3 && (
                      <div className="text-[9px] text-slate-500">+{items.length - 3}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {/* Légende couleurs par utilisateur */}
          {userColors.size > 0 && (
            <div className="flex flex-wrap gap-2 text-[11px] pt-2 border-t border-white/40">
              <span className="text-slate-500">Légende :</span>
              {[...userColors.entries()].map(([uid, color]) => {
                const username = data?.absences.find(a => a.user_id === uid)?.username
                  ?? data?.missions.find(m => m.user_id === uid)?.username
                  ?? `#${uid}`
                return (
                  <span key={uid} className="flex items-center gap-1">
                    <span className={`${color} inline-block w-3 h-3 rounded`} />
                    {username}
                  </span>
                )
              })}
              <span className="ml-2 text-slate-400">opacité réduite = en attente</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
