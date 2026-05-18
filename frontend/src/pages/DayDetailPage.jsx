import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import * as clockApi from '../api/clock'
import * as meApi from '../api/me'
import { useAuth } from '../hooks/useAuth'

function fmtTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function fmtDuration(minutes) {
  return `${Math.floor(minutes / 60)}h${pad(minutes % 60)}`
}

function isoDateTimeLocal(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function localToISO(localStr) {
  if (!localStr) return null
  return new Date(localStr).toISOString()
}

export default function DayDetailPage() {
  const { date } = useParams()
  const [searchParams] = useSearchParams()
  const targetUserId = searchParams.get('user_id') || null
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [deletingSession, setDeletingSession] = useState(null) // session object
  const [deleteErr, setDeleteErr] = useState(null)
  const [policy, setPolicy] = useState(null)

  const isSuperUser = Boolean(user?.is_superuser)
  const isManagerRole = Boolean(user?.is_manager || isSuperUser)
  const isLookingAtOther =
    targetUserId && Number(targetUserId) !== Number(user?.id ?? -1)
  // Anti-self : un manager ne peut PAS éditer ses propres pointages.
  // L'admin (superuser) le peut toujours.
  const canEdit = isManagerRole && (isLookingAtOther || isSuperUser)

  const refresh = useCallback(() => {
    setLoading(true)
    clockApi
      .day(date, targetUserId ? Number(targetUserId) : undefined)
      .then((d) => { setData(d); setError(null) })
      .catch((e) => setError(e.response?.data || e.message))
      .finally(() => setLoading(false))
  }, [date, targetUserId])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    meApi.summary().then((s) => setPolicy(s.policy)).catch(() => {})
  }, [])

  if (loading) return <p className="p-6">Chargement…</p>
  if (error) return <p className="p-6 text-red-700">{JSON.stringify(error)}</p>

  const fmtDate = (iso) => {
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
  }

  return (
    <div className="px-3 max-w-3xl mx-auto pt-2 pb-8 space-y-3">
      {isLookingAtOther && (
        <div className="glass-soft rounded-2xl px-3 py-2 flex items-center gap-2 text-xs text-slate-600">
          <span>👁 Vue manager — vous consultez la journée de {data.username}</span>
          <Link to="/manager" className="ml-auto text-blue-700 underline">
            ← retour tableau
          </Link>
        </div>
      )}
      <header className="glass rounded-3xl p-5">
        <p className="text-xs uppercase tracking-widest text-slate-500">Détail journée</p>
        <h1 className="text-xl font-semibold tracking-tight capitalize">{fmtDate(data.date)}</h1>
        <p className="text-sm text-slate-600 mt-1">
          {data.username} · Total travaillé{' '}
          <strong>{fmtDuration(data.total_minutes)}</strong>
          {data.open_session && (
            <span className="ml-2 text-emerald-700">● session en cours</span>
          )}
        </p>
        {/* Policy thresholds — only show when relevant limits are set */}
        {policy && (policy.daily_min_minutes > 0 || policy.daily_max_minutes > 0) && !data.open_session && (
          <div className="mt-3 flex flex-wrap gap-2">
            {policy.daily_min_minutes > 0 && (
              <span className={`text-xs px-2.5 py-1 rounded-full border ${
                data.total_minutes < policy.daily_min_minutes
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-800'
              }`}>
                {data.total_minutes < policy.daily_min_minutes ? '⚠' : '✓'} Min {fmtDuration(policy.daily_min_minutes)}
              </span>
            )}
            {policy.daily_max_minutes > 0 && (
              <span className={`text-xs px-2.5 py-1 rounded-full border ${
                data.total_minutes > policy.daily_max_minutes
                  ? 'bg-rose-50 border-rose-300 text-rose-800'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}>
                {data.total_minutes > policy.daily_max_minutes ? '⚠' : '●'} Max {fmtDuration(policy.daily_max_minutes)}
              </span>
            )}
            {policy.auto_deduct_break && data.total_minutes >= policy.break_trigger_minutes && (
              <span className="text-xs px-2.5 py-1 rounded-full border bg-indigo-50 border-indigo-200 text-indigo-700">
                Pause déduite : −{policy.break_duration_minutes - policy.paid_break_minutes} min
              </span>
            )}
          </div>
        )}
      </header>

      {/* Contexte métier : férié / mission / absence */}
      {(data.holiday || data.absences_active?.length > 0 || data.missions_active?.length > 0) && (
        <section className="space-y-2">
          {data.holiday && (
            <div className="glass-soft rounded-2xl p-3 flex items-center gap-3 text-sm">
              <span className="text-2xl">🎉</span>
              <div>
                <p className="font-semibold text-slate-700">Jour férié</p>
                <p className="text-xs text-slate-500">
                  {data.holiday.name} · {data.holiday.site_name}
                </p>
              </div>
            </div>
          )}
          {data.absences_active?.map((a) => (
            <div key={`abs-${a.id}`} className="glass-soft rounded-2xl p-3 flex items-center gap-3 text-sm">
              <span className="text-2xl">🏖</span>
              <div className="flex-1">
                <p className="font-semibold text-slate-700">
                  Absence — {labelAbsence(a.absence_type)}
                </p>
                <p className="text-xs text-slate-500">
                  {a.date_start} → {a.date_end}
                  {a.days_count != null && ` · ${a.days_count} j`}
                  {(a.half_day_start || a.half_day_end) && ' (demi-journée)'}
                </p>
              </div>
              <span className="text-[10px] uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                {a.status}
              </span>
            </div>
          ))}
          {data.missions_active?.map((m) => (
            <div key={`mis-${m.id}`} className={`glass-soft rounded-2xl p-3 flex items-center gap-3 text-sm`}>
              <span className="text-2xl">{m.mission_type === 'REMOTE' ? '🏠' : '📍'}</span>
              <div className="flex-1">
                <p className="font-semibold text-slate-700">
                  {m.mission_type === 'REMOTE' ? 'Télétravail' : 'Mission externe'}
                  {m.location_name && ` · ${m.location_name}`}
                </p>
                <p className="text-xs text-slate-500">
                  {m.date_start} → {m.date_end}
                </p>
              </div>
              <span className="text-[10px] uppercase px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                {m.status}
              </span>
            </div>
          ))}
        </section>
      )}

      {/* Sessions de pointage */}
      <section className="glass rounded-3xl p-4">
        <div className="flex items-center justify-between mb-3 gap-2">
          <h2 className="font-semibold">Pointages ({data.sessions.length})</h2>
          {canEdit && (
            <button
              type="button"
              onClick={() => setManualOpen(true)}
              className="press text-xs px-3 py-1 rounded-full glass-soft"
              title="Créer un pointage à la main pour cet employé"
            >
              + Pointage manuel
            </button>
          )}
        </div>
        {data.sessions.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun pointage enregistré ce jour-là.</p>
        ) : (
          <ul className="space-y-2">
            {data.sessions.map((s) => (
              <li key={s.id} className="glass-soft rounded-2xl p-3 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono tabular-nums text-slate-700">
                    {fmtTime(s.clock_in_rounded)}
                  </span>
                  <span className="text-slate-400">→</span>
                  <span className="font-mono tabular-nums text-slate-700">
                    {s.clock_out_rounded ? fmtTime(s.clock_out_rounded) : 'en cours'}
                  </span>
                  <span className="text-xs text-slate-500">
                    {s.session_type === 'OFFICE' ? '🏢 Bureau' :
                     s.session_type === 'REMOTE' ? '🏠 Télétravail' :
                     '📍 Mission'}
                  </span>
                  <span className="ml-auto text-sm text-slate-700">
                    {s.clock_out_rounded ? fmtDuration(s.duration_minutes) : '—'}
                  </span>
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditing(s)}
                        className="press px-3 py-1 rounded-full glass-soft text-xs"
                      >
                        Éditer
                      </button>
                      <button
                        type="button"
                        onClick={() => { setDeletingSession(s); setDeleteErr(null) }}
                        className="press px-3 py-1 rounded-full text-xs bg-rose-600 text-white hover:bg-rose-700"
                        title="Supprimer ce pointage (audit log conservé)"
                      >
                        🗑
                      </button>
                    </>
                  )}
                </div>
                <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-3">
                  <span className="font-mono">brut : {fmtTime(s.clock_in)} → {fmtTime(s.clock_out)}</span>
                  {s.is_forgotten && <span className="text-rose-700">⚠ oubli</span>}
                  {s.justification && (
                    <span className="text-amber-700" title={s.justification}>
                      ✎ {s.justification.length > 40 ? `${s.justification.slice(0, 40)}…` : s.justification}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing && (
        <SessionEditModal
          session={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh() }}
        />
      )}

      {manualOpen && (
        <ManualSessionModal
          userId={data.user_id}
          username={data.username}
          date={data.date}
          onClose={() => setManualOpen(false)}
          onSaved={() => { setManualOpen(false); refresh() }}
        />
      )}

      {deletingSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setDeletingSession(null)} aria-hidden />
          <div className="relative glass-strong w-full max-w-sm rounded-3xl p-5 space-y-4">
            <p className="font-semibold text-rose-700">Supprimer ce pointage ?</p>
            <p className="text-sm text-slate-600">
              Session du <strong>{fmtTime(deletingSession.clock_in)}</strong>
              {deletingSession.clock_out ? ` → ${fmtTime(deletingSession.clock_out)}` : ' (en cours)'}.
              <br />
              <span className="text-xs text-slate-400 mt-1 block">
                L'opération est tracée dans le journal d'audit et ne peut pas être annulée.
              </span>
            </p>
            {deleteErr && (
              <p className="text-xs text-rose-700 bg-rose-50 rounded px-2 py-1">{String(deleteErr)}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setDeletingSession(null)} className="press px-4 py-2 text-sm">
                Annuler
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await clockApi.deleteSession(deletingSession.id)
                    setDeletingSession(null)
                    refresh()
                  } catch (e) {
                    setDeleteErr(e?.response?.data?.error || e?.message || 'Erreur inconnue')
                  }
                }}
                className="press bg-rose-600 text-white px-4 py-2 rounded-xl text-sm"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ManualSessionModal({ userId, username, date, onClose, onSaved }) {
  const [form, setForm] = useState({
    clock_in: `${date}T09:00`,
    clock_out: `${date}T17:00`,
    session_type: 'OFFICE',
    justification: 'Pointage manuel par le manager',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const onSave = async () => {
    // Validation front : clock_out > clock_in et non vide.
    if (!form.clock_in || !form.clock_out) {
      setErr('Veuillez renseigner les deux horodatages.')
      return
    }
    if (new Date(form.clock_out) <= new Date(form.clock_in)) {
      setErr('La sortie doit être postérieure à l\'entrée.')
      return
    }
    setSaving(true)
    setErr(null)
    try {
      await clockApi.manualSession({
        user_id: userId,
        clock_in: localToISO(form.clock_in),
        clock_out: localToISO(form.clock_out),
        session_type: form.session_type,
        justification: form.justification,
      })
      onSaved()
    } catch (e) {
      const data = e.response?.data
      if (data?.error === 'OVERLAPPING_SESSION') {
        setErr(data.detail || 'Un pointage existe déjà sur cette période.')
      } else if (data?.error === 'SPAN_TOO_LONG') {
        setErr(data.detail || 'Pointage trop long.')
      } else if (data?.error === 'FUTURE_TIMESTAMP') {
        setErr(data.detail || 'Pointage dans le futur impossible.')
      } else {
        setErr(data?.detail || data?.error || e.message)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 z-50">
      <div className="glass-strong rounded-3xl p-5 w-full sm:max-w-md max-h-[90vh] overflow-y-auto safe-bottom space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Pointage manuel — {username}</h3>
          <button type="button" onClick={onClose} className="press w-8 h-8 rounded-lg hover:bg-white/40">✕</button>
        </div>
        <p className="text-xs text-slate-500">
          Crée une session pour le {date}. La session est marquée "régularisée" et automatiquement justifiée.
        </p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label>
            Entrée
            <input
              type="datetime-local"
              className="glass-input w-full mt-1"
              value={form.clock_in}
              onChange={(e) => setForm({ ...form, clock_in: e.target.value })}
            />
          </label>
          <label>
            Sortie
            <input
              type="datetime-local"
              className="glass-input w-full mt-1"
              value={form.clock_out}
              onChange={(e) => setForm({ ...form, clock_out: e.target.value })}
            />
          </label>
        </div>
        <label className="block text-sm">
          Type
          <select
            className="glass-input w-full mt-1"
            value={form.session_type}
            onChange={(e) => setForm({ ...form, session_type: e.target.value })}
          >
            <option value="OFFICE">🏢 Bureau</option>
            <option value="REMOTE">🏠 Télétravail</option>
            <option value="MISSION">📍 Mission</option>
          </select>
        </label>
        <label className="block text-sm">
          Justification
          <textarea
            className="glass-input w-full mt-1 h-16"
            value={form.justification}
            onChange={(e) => setForm({ ...form, justification: e.target.value })}
          />
        </label>
        {err && (
          <p className="text-sm text-rose-700 bg-rose-50 rounded-xl px-3 py-2">
            {typeof err === 'string' ? err : JSON.stringify(err)}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="press px-4 py-2 text-sm">Annuler</button>
          <button type="button" disabled={saving} onClick={onSave} className="pill pill-primary disabled:opacity-50">
            {saving ? 'Création…' : 'Créer le pointage'}
          </button>
        </div>
      </div>
    </div>
  )
}

function labelAbsence(type) {
  switch (type) {
    case 'VACATION': return 'Congés'
    case 'SICK': return 'Maladie'
    default: return 'Autre'
  }
}

function SessionEditModal({ session, onClose, onSaved }) {
  const [form, setForm] = useState({
    clock_in: isoDateTimeLocal(session.clock_in),
    clock_in_rounded: isoDateTimeLocal(session.clock_in_rounded),
    clock_out: isoDateTimeLocal(session.clock_out),
    clock_out_rounded: isoDateTimeLocal(session.clock_out_rounded),
    justification: session.justification || '',
    is_forgotten: Boolean(session.is_forgotten),
    justification_approved: session.justification_approved,
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const onSave = async () => {
    setSaving(true)
    setErr(null)
    try {
      const payload = {
        clock_in: localToISO(form.clock_in),
        clock_in_rounded: localToISO(form.clock_in_rounded),
        clock_out: localToISO(form.clock_out),
        clock_out_rounded: localToISO(form.clock_out_rounded),
        justification: form.justification,
        is_forgotten: form.is_forgotten,
        justification_approved: form.justification_approved,
      }
      await clockApi.editSession(session.id, payload)
      onSaved()
    } catch (e) {
      const data = e.response?.data
      if (data?.error === 'OVERLAPPING_SESSION') {
        setErr(data.detail || 'Un pointage existe déjà sur cette période.')
      } else {
        setErr(data?.detail || data?.error || e.message)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 z-50">
      <div className="glass-strong rounded-3xl p-5 w-full sm:max-w-md max-h-[90vh] overflow-y-auto safe-bottom space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Édition session #{session.id}</h3>
          <button type="button" onClick={onClose} className="press w-8 h-8 rounded-lg hover:bg-white/40">✕</button>
        </div>

        <fieldset className="glass-soft rounded-xl p-3 space-y-3">
          <legend className="text-xs uppercase tracking-widest text-slate-500 px-1">Horodatages</legend>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="block">
              <span className="text-slate-600 text-xs">Entrée brute</span>
              <input
                type="datetime-local"
                className="glass-input w-full mt-1 text-sm"
                value={form.clock_in}
                onChange={(e) => setForm({ ...form, clock_in: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="text-slate-600 text-xs">Entrée arrondie</span>
              <input
                type="datetime-local"
                className="glass-input w-full mt-1 text-sm"
                value={form.clock_in_rounded}
                onChange={(e) => setForm({ ...form, clock_in_rounded: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="text-slate-600 text-xs">Sortie brute</span>
              <input
                type="datetime-local"
                className="glass-input w-full mt-1 text-sm"
                value={form.clock_out}
                onChange={(e) => setForm({ ...form, clock_out: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="text-slate-600 text-xs">Sortie arrondie</span>
              <input
                type="datetime-local"
                className="glass-input w-full mt-1 text-sm"
                value={form.clock_out_rounded}
                onChange={(e) => setForm({ ...form, clock_out_rounded: e.target.value })}
              />
            </label>
          </div>
        </fieldset>

        <label className="block text-sm">
          <span className="text-slate-600">Justification</span>
          <textarea
            className="glass-input w-full mt-1 h-16"
            value={form.justification}
            onChange={(e) => setForm({ ...form, justification: e.target.value })}
            placeholder="Motif de l'anomalie…"
          />
        </label>

        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="rounded"
              checked={form.is_forgotten}
              onChange={(e) => setForm({ ...form, is_forgotten: e.target.checked })}
            />
            <span className="text-slate-700">Marqué "oubli"</span>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-slate-600">Justification :</span>
            <select
              className="border rounded-lg p-1.5 text-sm bg-white/60"
              value={
                form.justification_approved === true ? 'true'
                  : form.justification_approved === false ? 'false' : 'null'
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  justification_approved:
                    e.target.value === 'true' ? true
                      : e.target.value === 'false' ? false : null,
                })
              }
            >
              <option value="null">⏳ en attente</option>
              <option value="true">✓ validée</option>
              <option value="false">✕ refusée</option>
            </select>
          </label>
        </div>

        {err && (
          <p className="text-rose-700 text-sm bg-rose-50 rounded-xl px-3 py-2">
            {typeof err === 'string' ? err : JSON.stringify(err)}
          </p>
        )}
        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={onClose} className="press px-4 py-2 text-sm">Annuler</button>
          <button
            type="button"
            disabled={saving}
            onClick={onSave}
            className="pill pill-primary disabled:opacity-50"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}
