import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import * as clockApi from '../api/clock'
import * as meApi from '../api/me'
import { useSummary } from '../hooks/useSummary'
import { useLiveWorkedTime } from '../hooks/useLiveWorkedMinutes'
import CalendarPage from './CalendarPage'

const TABS = [
  { id: 'day', label: "Aujourd'hui" },
  { id: 'week', label: 'Semaine' },
  { id: 'month', label: 'Mois' },
  { id: 'year', label: 'Année' },
]

const REQUEST_KINDS = [
  { id: 'VACATION', label: 'Congés payés', icon: '🏖', route: '/requests?type=absence&kind=VACATION' },
  { id: 'SICK',     label: 'Maladies',     icon: '🤒', route: '/requests?type=absence&kind=SICK' },
  { id: 'OTHER',    label: 'Autres',       icon: '📝', route: '/requests?type=absence&kind=OTHER' },
  { id: 'MISSION',  label: 'Mission',      icon: '🚗', route: '/requests?type=mission' },
]

export default function HomePage() {
  const [tab, setTab] = useState('day')
  const [requestMenuOpen, setRequestMenuOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <div className="px-3 max-w-3xl mx-auto">
      <Greeting />

      <nav className="glass mt-4 rounded-2xl p-1 flex gap-1 sticky top-20 z-10">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`press flex-1 py-2 rounded-xl text-sm font-medium transition ${
              tab === t.id
                ? 'bg-slate-900 text-white shadow'
                : 'text-slate-600 hover:bg-white/50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="mt-4">
        {tab === 'day' ? (
          <DayView />
        ) : (
          <CalendarPage initialView={tab} hideViewToggle />
        )}
      </div>

      <FabCluster
        onScan={() => navigate('/scan')}
        onAbsence={() => setRequestMenuOpen(true)}
      />

      {requestMenuOpen && (
        <RequestTypeMenu
          onPick={(route) => {
            setRequestMenuOpen(false)
            navigate(route)
          }}
          onClose={() => setRequestMenuOpen(false)}
        />
      )}
    </div>
  )
}

function Greeting() {
  // useSummary partage l'objet entre tous les composants montés simultanément :
  // évite que HomePage, ScanPage, AbsenceRequestPage refetch chacun de leur côté.
  const { summary } = useSummary()
  // Tick local pour le compteur live tant que la session est ouverte.
  const { minutes: worked, isLive } = useLiveWorkedTime(summary)

  if (!summary) {
    return (
      <section className="glass rounded-3xl p-5 mt-4 h-28 animate-pulse" />
    )
  }

  const target = summary.today.target_minutes
  const pct = Math.min(100, Math.round((worked / Math.max(target, 1)) * 100))
  const overtime = parseFloat(summary.overtime_balance_hours)
  const hour = new Date().getHours()
  const greet =
    hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir'

  return (
    <section className="glass rounded-3xl p-5 mt-4">
      <p className="text-xs uppercase tracking-widest text-slate-500">{greet}</p>
      <h1 className="text-2xl font-semibold tracking-tight">{summary.username}</h1>
      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="text-3xl font-semibold tabular-nums">
            {Math.floor(worked / 60)}
            <span className="text-base text-slate-500">h</span>
            {String(worked % 60).padStart(2, '0')}
            {isLive && (
              <span
                className="inline-block w-2 h-2 rounded-full bg-emerald-500 ml-2 align-middle animate-pulse"
                aria-label="Session en cours"
                title="Session en cours"
              />
            )}
          </p>
          <p className="text-xs text-slate-500">
            sur {Math.floor(target / 60)}h{String(target % 60).padStart(2, '0')} aujourd'hui
            {isLive && <span className="text-emerald-600 ml-1">· en cours</span>}
          </p>
        </div>
        <div className="text-right">
          <p className={`text-sm font-semibold ${overtime >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            {overtime >= 0 ? '+' : ''}{overtime.toFixed(2)} h
          </p>
          <p className="text-xs text-slate-500">solde sup</p>
        </div>
      </div>
      <div className="mt-3 h-2 rounded-full bg-white/60 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-sky-500 to-indigo-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      {/* Solde congés + demandes en attente */}
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        {summary.vacation_remaining !== undefined && (
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sky-700">
              {Number(summary.vacation_remaining).toFixed(1)}
            </span>
            <span className="text-slate-500">j congés restants</span>
          </div>
        )}
        {summary.pending_absences_count > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-amber-600">{summary.pending_absences_count}</span>
            <span className="text-slate-500">demande{summary.pending_absences_count > 1 ? 's' : ''} en attente</span>
          </div>
        )}
      </div>
      {/* Exempt badge */}
      {summary.exempt_from_clocking && (
        <div className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1.5">
          <span>📋</span>
          <span>Non soumis au timbrage — présence validée via la planification</span>
        </div>
      )}
      {summary.today.has_open_session && (
        <p className="mt-2 text-xs text-emerald-700">● Session en cours</p>
      )}
      <PolicyCard policy={summary.policy} />
    </section>
  )
}

function DayView() {
  const today = new Date()
  const iso = today.toISOString().slice(0, 10)
  const [data, setData] = useState(null)

  useEffect(() => {
    clockApi.day(iso).then(setData).catch(() => setData({ sessions: [], total_minutes: 0 }))
  }, [iso])

  if (!data) {
    return <div className="glass rounded-2xl p-5 h-32 animate-pulse mt-2" />
  }

  return (
    <section className="glass rounded-3xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Sessions du jour</h2>
        <Link to={`/history/${iso}`} className="text-xs text-blue-700 underline">
          Détail complet
        </Link>
      </div>
      {data.sessions.length === 0 ? (
        <p className="text-sm text-slate-500">
          Pas encore de pointage aujourd'hui.
        </p>
      ) : (
        <ul className="space-y-2">
          {data.sessions.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 glass-soft rounded-2xl p-3 text-sm"
            >
              <span className="font-mono tabular-nums text-slate-700">
                {fmt(s.clock_in_rounded)}
              </span>
              <span className="text-slate-400">→</span>
              <span className="font-mono tabular-nums text-slate-700">
                {s.clock_out_rounded ? fmt(s.clock_out_rounded) : 'en cours'}
              </span>
              <span className="ml-auto text-xs text-slate-500">
                {s.session_type}
              </span>
              {s.justification && (
                <span title={s.justification} className="text-amber-600">✎</span>
              )}
              {s.is_forgotten && <span className="text-rose-600">⚠</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function FabCluster({ onScan, onAbsence }) {
  // Cluster aligné en COLONNE CENTRÉE (items-center) plutôt que sur le bord
  // droit (items-end) : les deux boutons partagent le même axe vertical, le
  // « + » apparaît comme satellite propre du gros bouton QR sans décalage
  // visuel disgracieux.
  // QR = action n°1 de l'app → 80px + couleur marque + ring + label.
  return (
    <div className="fixed bottom-6 right-4 safe-bottom flex flex-col items-center gap-3 z-30">
      <button
        type="button"
        onClick={onAbsence}
        className="press w-12 h-12 rounded-full glass-strong text-slate-900 flex items-center justify-center shadow-lg ring-1 ring-slate-200"
        aria-label="Nouvelle demande (absence ou mission)"
        title="Nouvelle demande"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onScan}
        className="press w-20 h-20 rounded-full bg-slate-900 text-white flex flex-col items-center justify-center shadow-2xl shadow-slate-900/50 ring-4 ring-white"
        aria-label="Scanner un QR pour pointer"
        title="Pointer (scanner un QR)"
      >
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <path d="M14 14h3v3M21 14h-1M14 17v4M17 21h4M17 17h.01M21 21h.01" />
        </svg>
        <span className="text-[9px] font-medium tracking-wide mt-0.5">POINTER</span>
      </button>
    </div>
  )
}

function PolicyCard({ policy }) {
  const [open, setOpen] = useState(false)
  if (!policy) return null

  const active = []
  if (policy.auto_deduct_break) {
    const net = policy.break_duration_minutes - policy.paid_break_minutes
    active.push(`Pause auto : −${net} min au-delà de ${minsHHMM(policy.break_trigger_minutes)}`)
  }
  if (policy.daily_min_minutes > 0) active.push(`Minimum : ${minsHHMM(policy.daily_min_minutes)}`)
  if (policy.daily_max_minutes > 0) active.push(`Maximum : ${minsHHMM(policy.daily_max_minutes)}`)
  if (policy.eve_holiday_reduced_minutes > 0) active.push(`Veilles fériés : cible ${minsHHMM(policy.eve_holiday_reduced_minutes)}`)
  if (active.length === 0) return null

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-slate-500 flex items-center gap-1 hover:text-slate-700"
      >
        <span>{open ? '▾' : '▸'}</span>
        Règles actives ({active.length})
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1">
          {active.map((a) => (
            <li key={a} className="text-xs bg-slate-50/80 rounded-lg px-2.5 py-1.5 text-slate-600 border border-slate-100">
              {a}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function minsHHMM(mins) {
  if (!mins) return '0h00'
  return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}`
}

function RequestTypeMenu({ onPick, onClose }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center" role="dialog">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative glass-strong w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-4 safe-bottom space-y-2">
        <p className="text-center text-xs uppercase tracking-widest text-slate-500 mb-2">
          Nouvelle demande
        </p>
        {REQUEST_KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => onPick(k.route)}
            className="press w-full glass-soft rounded-2xl p-4 flex items-center gap-3 text-left hover:bg-white/60"
          >
            <span className="text-2xl">{k.icon}</span>
            <span className="font-medium">{k.label}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-2 py-3 rounded-2xl text-slate-500"
        >
          Annuler
        </button>
      </div>
    </div>
  )
}
