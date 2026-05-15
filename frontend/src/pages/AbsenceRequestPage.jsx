import { useEffect, useMemo, useState } from 'react'
import * as absencesApi from '../api/absences'
import * as meApi from '../api/me'

/**
 * Half-day flags semantics (must match backend AbsenceRequest.days_count) :
 *   half_day_start = True  → travaille le matin de date_start, absent l'après-midi
 *   half_day_end   = True  → travaille l'après-midi de date_end, absent le matin
 * Single-day request : exactly one of the two flags ⇒ 0.5 j (matin OR après-midi).
 */

function computeDays(form) {
  if (!form.date_start || !form.date_end) return null
  const start = new Date(form.date_start)
  const end = new Date(form.date_end)
  if (end < start) return null
  if (form.date_start === form.date_end) {
    if (form.half_day_start && form.half_day_end) return 0
    if (form.half_day_start || form.half_day_end) return 0.5
    return 1
  }
  const MS = 1000 * 60 * 60 * 24
  const whole = Math.round((end - start) / MS) + 1
  let delta = 0
  if (form.half_day_start) delta += 0.5
  if (form.half_day_end) delta += 0.5
  return whole - delta
}

export default function AbsenceRequestPage({ presetKind }) {
  const [form, setForm] = useState({
    absence_type: presetKind || 'VACATION',
    date_start: '',
    date_end: '',
    half_day_start: false,
    half_day_end: false,
    user_comment: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState(null)
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState(null)

  useEffect(() => { meApi.summary().then(setSummary).catch(() => {}) }, [])

  const isSingleDay =
    form.date_start && form.date_end && form.date_start === form.date_end

  // When dates change to single-day, normalize both flags off (radio takes over).
  useEffect(() => {
    if (isSingleDay && form.half_day_start && form.half_day_end) {
      setForm((f) => ({ ...f, half_day_start: false, half_day_end: false }))
    }
  }, [isSingleDay, form.half_day_start, form.half_day_end])

  const days = useMemo(() => computeDays(form), [form])

  const setSingleDayKind = (kind) => {
    // kind ∈ "FULL" | "MORNING" | "AFTERNOON"
    setForm({
      ...form,
      half_day_start: kind === 'AFTERNOON',
      half_day_end: kind === 'MORNING',
    })
  }
  const singleDayKind = form.half_day_start
    ? 'AFTERNOON'
    : form.half_day_end
      ? 'MORNING'
      : 'FULL'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const data = await absencesApi.create(form)
      setCreated(data)
    } catch (err) {
      setError(err.response?.data || { error: String(err) })
    } finally {
      setSubmitting(false)
    }
  }

  if (created) {
    return (
      <div className="glass rounded-3xl p-5 mt-2">
        <p className="text-3xl">🏖️</p>
        <p className="font-semibold mt-2">Demande envoyée</p>
        <p className="text-sm mt-2 text-slate-700">
          <strong>{created.days_count} jour{Number(created.days_count) > 1 ? 's' : ''}</strong>{' '}
          du {created.date_start} au {created.date_end}.
          Statut : <strong>{
            { PENDING: 'En attente', APPROVED: 'Validé', REJECTED: 'Refusé' }[created.status] || created.status
          }</strong>.
        </p>
      </div>
    )
  }

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  return (
    <form onSubmit={handleSubmit} className="glass rounded-3xl p-5 space-y-4">
      <h1 className="text-lg font-semibold tracking-tight">Demande d'absence</h1>

      {/* Solde congés affiché quand type = VACATION */}
      {form.absence_type === 'VACATION' && summary && (
        <div className="glass-soft rounded-xl px-4 py-2.5 flex items-center justify-between">
          <span className="text-sm text-slate-600">Solde congés disponible</span>
          <span className={`text-base font-semibold ${Number(summary.vacation_remaining) > 0 ? 'text-sky-700' : 'text-rose-600'}`}>
            {Number(summary.vacation_remaining).toFixed(1)} jour{Number(summary.vacation_remaining) !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      <label className="block text-sm">
        <span className="text-slate-600">Type</span>
        <select
          className="glass-input w-full mt-1"
          value={form.absence_type}
          onChange={update('absence_type')}
        >
          <option value="VACATION">Congés payés</option>
          <option value="SICK">Maladie</option>
          <option value="OTHER">Autre</option>
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-slate-600">Date début</span>
          <input
            type="date" required
            className="glass-input w-full mt-1"
            value={form.date_start}
            onChange={update('date_start')}
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Date fin</span>
          <input
            type="date" required
            className="glass-input w-full mt-1"
            value={form.date_end}
            onChange={update('date_end')}
            min={form.date_start || undefined}
          />
        </label>
      </div>

      {/* Demi-journée — UI contextuelle */}
      {isSingleDay ? (
        <fieldset className="space-y-2">
          <legend className="text-xs uppercase tracking-widest text-slate-500 mb-1">
            Sur cette journée
          </legend>
          <div className="grid grid-cols-3 gap-2">
            <SegBtn
              active={singleDayKind === 'FULL'}
              onClick={() => setSingleDayKind('FULL')}
              label="Journée"
              sub="1 j"
            />
            <SegBtn
              active={singleDayKind === 'MORNING'}
              onClick={() => setSingleDayKind('MORNING')}
              label="Matin"
              sub="0,5 j"
            />
            <SegBtn
              active={singleDayKind === 'AFTERNOON'}
              onClick={() => setSingleDayKind('AFTERNOON')}
              label="Après-midi"
              sub="0,5 j"
            />
          </div>
        </fieldset>
      ) : form.date_start && form.date_end ? (
        <fieldset className="space-y-2">
          <legend className="text-xs uppercase tracking-widest text-slate-500 mb-1">
            Demi-journées (optionnel)
          </legend>
          <label className="glass-soft rounded-xl p-3 flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.half_day_start}
              onChange={(e) => setForm({ ...form, half_day_start: e.target.checked })}
            />
            <span>
              <span className="font-medium">Premier jour : matin travaillé</span>
              <span className="block text-xs text-slate-500">
                Je travaille le matin du {form.date_start}, absent l'après-midi
              </span>
            </span>
          </label>
          <label className="glass-soft rounded-xl p-3 flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.half_day_end}
              onChange={(e) => setForm({ ...form, half_day_end: e.target.checked })}
            />
            <span>
              <span className="font-medium">Dernier jour : après-midi travaillé</span>
              <span className="block text-xs text-slate-500">
                Je reprends l'après-midi du {form.date_end}, absent le matin
              </span>
            </span>
          </label>
        </fieldset>
      ) : null}

      {days !== null && (
        <p className="glass-soft rounded-xl p-3 text-sm">
          Durée d'absence :{' '}
          <strong>
            {days} jour{days > 1 ? 's' : ''}
          </strong>
        </p>
      )}

      <label className="block text-sm">
        <span className="text-slate-600">
          Commentaire à l'intention du manager (optionnel)
        </span>
        <textarea
          className="glass-input w-full mt-1 h-20"
          value={form.user_comment}
          onChange={(e) => setForm({ ...form, user_comment: e.target.value })}
          placeholder="Ex : RDV médical, événement familial…"
        />
      </label>

      {error && (
        <p className="text-rose-700 text-sm" role="alert">
          {typeof error === 'object'
            ? Object.entries(error).map(([k, v]) => `${k}: ${v}`).join(' · ')
            : String(error)}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || days === 0}
        className="pill pill-primary w-full justify-center disabled:opacity-50"
      >
        {submitting ? 'Envoi…' : 'Soumettre la demande'}
      </button>
    </form>
  )
}

function SegBtn({ active, onClick, label, sub }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`press py-3 rounded-xl text-sm transition ${
        active
          ? 'bg-slate-900 text-white shadow'
          : 'glass-soft text-slate-700 hover:bg-white/60'
      }`}
    >
      <span className="block font-medium">{label}</span>
      <span className={`block text-[10px] ${active ? 'text-white/70' : 'text-slate-500'}`}>
        {sub}
      </span>
    </button>
  )
}
