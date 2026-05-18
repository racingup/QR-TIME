import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import * as absencesApi from '../api/absences'
import * as clockApi from '../api/clock'
import * as meApi from '../api/me'
import * as missionsApi from '../api/missions'
import { useSummary } from '../hooks/useSummary'
import { applyBreakDeduction } from '../utils/policy'

const VIEWS = [
  { id: 'month', label: 'Mois' },
  { id: 'week', label: 'Semaine' },
  { id: 'year', label: 'Année' },
]

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const DAY_LABELS_LONG = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

const COLORS = {
  PENDING: 'bg-amber-300',
  APPROVED: 'bg-green-400',
  REJECTED: 'bg-red-200',
}

const MISSION_COLOR = {
  APPROVED: { REMOTE: 'bg-indigo-400', FIELD: 'bg-violet-400' },
  PENDING:  { REMOTE: 'bg-indigo-200', FIELD: 'bg-violet-200' },
  REJECTED: { REMOTE: 'bg-gray-200',   FIELD: 'bg-gray-200' },
}

/**
 * { [YYYY-MM-DD]: Mission[] } — one entry per day the mission covers,
 * clipped to [rangeStart, rangeEnd].
 */
function buildMissionDayMap(missions, rangeStart, rangeEnd) {
  const map = {}
  const rsKey = iso(rangeStart)
  const reKey = iso(rangeEnd)
  for (const m of missions) {
    const startKey = m.date_start >= rsKey ? m.date_start : rsKey
    const endKey   = m.date_end   <= reKey ? m.date_end   : reKey
    if (startKey > endKey) continue
    for (let cur = parseIso(startKey); iso(cur) <= endKey; cur = addDays(cur, 1)) {
      const key = iso(cur)
      if (!map[key]) map[key] = []
      map[key].push(m)
    }
  }
  return map
}

function pad(n) {
  return String(n).padStart(2, '0')
}
function iso(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function parseIso(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function addDays(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}
function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}
function startOfWeek(d) {
  // ISO week: Monday as first day
  const r = new Date(d)
  const day = (r.getDay() + 6) % 7 // 0 = Monday
  r.setDate(r.getDate() - day)
  return r
}

/**
 * Returns { [YYYY-MM-DD]: { status, absence } } for every day an absence covers.
 * Handles half-days by tagging `half = 'morning' | 'afternoon' | null`.
 */
function buildDayMap(absences) {
  const map = {}
  for (const a of absences) {
    const start = parseIso(a.date_start)
    const end = parseIso(a.date_end)
    for (let cur = start; cur <= end; cur = addDays(cur, 1)) {
      const key = iso(cur)
      const isFirst = key === a.date_start
      const isLast = key === a.date_end
      let half = null
      if (isFirst && a.half_day_start && !isLast) half = 'afternoon'
      if (isLast && a.half_day_end && !isFirst) half = 'morning'
      if (isFirst && isLast && a.half_day_start && a.half_day_end) half = 'afternoon'
      map[key] = { status: a.status, absence: a, half }
    }
  }
  return map
}

export default function CalendarPage({ initialView, hideViewToggle = false }) {
  const [view, setView] = useState(initialView || 'month')
  const [anchor, setAnchor] = useState(new Date())
  const [absences, setAbsences] = useState([])
  const [loading, setLoading] = useState(true)

  const range = useMemo(() => {
    if (view === 'week') {
      const s = startOfWeek(anchor)
      return { start: s, end: addDays(s, 6) }
    }
    if (view === 'year') {
      return {
        start: new Date(anchor.getFullYear(), 0, 1),
        end: new Date(anchor.getFullYear(), 11, 31),
      }
    }
    // month
    return { start: startOfMonth(anchor), end: endOfMonth(anchor) }
  }, [view, anchor])

  const [sessions, setSessions] = useState([])
  const [missions, setMissions] = useState([])
  const [holidays, setHolidays] = useState([])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [a, s, m, h] = await Promise.all([
        absencesApi.my({ start: iso(range.start), end: iso(range.end) }),
        clockApi.history({ start: iso(range.start), end: iso(range.end) }),
        missionsApi.my(),
        meApi.holidays(iso(range.start), iso(range.end)).catch(() => []),
      ])
      setAbsences(a.results || a)
      setSessions(Array.isArray(s) ? s : s.results || [])
      setMissions(Array.isArray(m) ? m : m.results || [])
      setHolidays(Array.isArray(h) ? h : h.results || [])
    } finally {
      setLoading(false)
    }
  }, [range.start, range.end])

  useEffect(() => { refresh() }, [refresh])

  const dayMap = useMemo(() => buildDayMap(absences), [absences])
  const missionDayMap = useMemo(
    () => buildMissionDayMap(missions, range.start, range.end),
    [missions, range.start, range.end],
  )
  // policy partagée (useSummary la fournit). Sert à déduire la pause auto
  // pour que le total affiché par jour matche le Greeting de la HomePage.
  // fetchOnMount=true au cas où on entre directement sur /calendar via URL.
  const { summary } = useSummary()
  const policy = summary?.policy
  const sessionsByDay = useMemo(() => {
    const m = new Map()
    for (const s of sessions) {
      const d = s.clock_in.slice(0, 10)
      if (!m.has(d)) m.set(d, { count: 0, minutes: 0, open: false })
      const e = m.get(d)
      e.count += 1
      if (s.clock_out_rounded) e.minutes += s.duration_minutes
      if (!s.clock_out) e.open = true
    }
    // Applique la déduction de pause par jour (cohérent backend).
    for (const e of m.values()) {
      e.minutes = applyBreakDeduction(e.minutes, policy)
    }
    return m
  }, [sessions, policy])

  const holidaysByDay = useMemo(() => {
    const m = new Map()
    for (const h of holidays) m.set(h.date, h)
    return m
  }, [holidays])

  const shift = (delta) => {
    const d = new Date(anchor)
    if (view === 'week') d.setDate(d.getDate() + delta * 7)
    if (view === 'month') d.setMonth(d.getMonth() + delta)
    if (view === 'year') d.setFullYear(d.getFullYear() + delta)
    setAnchor(d)
  }

  // When initialView prop changes (parent toggle), follow it.
  useEffect(() => {
    if (initialView && initialView !== view) setView(initialView)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialView])

  return (
    <div className="space-y-4">
      <header className="glass rounded-2xl p-3 flex flex-wrap items-center gap-2">
        {!hideViewToggle && (
          <h1 className="text-base font-semibold tracking-tight mr-2">Calendrier</h1>
        )}
        {!hideViewToggle && (
        <nav className="flex glass-soft rounded-xl overflow-hidden">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id)}
              className={`press px-3 py-1 text-sm transition ${
                view === v.id ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-white/40'
              }`}
            >
              {v.label}
            </button>
          ))}
        </nav>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => shift(-1)} className="press w-9 h-9 rounded-xl glass-soft">
            ←
          </button>
          <button type="button" onClick={() => setAnchor(new Date())} className="press px-3 py-1 rounded-xl glass-soft text-sm">
            Aujourd'hui
          </button>
          <button type="button" onClick={() => shift(+1)} className="press w-9 h-9 rounded-xl glass-soft">
            →
          </button>
        </div>
      </header>

      <Legend />

      {loading ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : view === 'year' ? (
        <YearView year={anchor.getFullYear()} dayMap={dayMap} sessionsByDay={sessionsByDay} missionDayMap={missionDayMap} holidaysByDay={holidaysByDay} />
      ) : view === 'week' ? (
        <WeekView start={range.start} dayMap={dayMap} sessionsByDay={sessionsByDay} missionDayMap={missionDayMap} holidaysByDay={holidaysByDay} />
      ) : (
        <MonthView anchor={anchor} dayMap={dayMap} sessionsByDay={sessionsByDay} missionDayMap={missionDayMap} holidaysByDay={holidaysByDay} />
      )}
    </div>
  )
}

function Legend() {
  return (
    <p className="text-xs text-gray-600 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <span className="font-medium text-gray-400 uppercase tracking-wide text-[10px]">Absences</span>
      <span className="flex items-center gap-1">
        <span className={`${COLORS.APPROVED} inline-block w-3 h-3 rounded`} />
        Approuvée
      </span>
      <span className="flex items-center gap-1">
        <span className={`${COLORS.PENDING} inline-block w-3 h-3 rounded`} />
        Demandée
      </span>
      <span className="flex items-center gap-1">
        <span className={`${COLORS.REJECTED} inline-block w-3 h-3 rounded`} />
        Refusée
      </span>
      <span className="w-px h-3 bg-gray-200 mx-1" />
      <span className="flex items-center gap-1">
        <span className="bg-gray-300 inline-block w-3 h-3 rounded" />
        Férié
      </span>
      <span className="w-px h-3 bg-gray-200 mx-1" />
      <span className="font-medium text-gray-400 uppercase tracking-wide text-[10px]">Missions</span>
      <span className="flex items-center gap-1">
        <span className="bg-indigo-400 inline-block w-3 h-3 rounded" />
        Télétravail
      </span>
      <span className="flex items-center gap-1">
        <span className="bg-violet-400 inline-block w-3 h-3 rounded" />
        Externe
      </span>
    </p>
  )
}

function rangeDays(start, end) {
  const days = []
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) days.push(new Date(d))
  return days
}

function formatWeek(start, end) {
  return `Semaine du ${iso(start)} au ${iso(end)}`
}

function DayCell({ date, entry, sessions, missions = [], holiday }) {
  const key = iso(date)
  const isToday = iso(new Date()) === key
  const color = entry ? COLORS[entry.status] : ''
  const halfClass = entry?.half === 'morning'
    ? '[clip-path:inset(0_50%_0_0)]'
    : entry?.half === 'afternoon'
      ? '[clip-path:inset(0_0_0_50%)]'
      : ''
  const hours = sessions ? Math.floor(sessions.minutes / 60) : 0
  const mins = sessions ? sessions.minutes % 60 : 0

  return (
    <Link
      to={`/history/${key}`}
      title={
        holiday ? `Férié : ${holiday.name}` :
        entry ? `${entry.absence.absence_type} — ${entry.status}` : ''
      }
      className={`aspect-square border rounded text-xs p-1 flex flex-col transition-colors ${
        isToday ? 'ring-2 ring-blue-500' : ''
      } ${holiday ? 'bg-gray-200/70 text-gray-500' : 'hover:bg-gray-50'}`}
    >
      <div className="flex items-center justify-between leading-none">
        <span className={`font-medium ${holiday ? 'text-gray-500' : 'text-gray-600'}`}>
          {date.getDate()}
        </span>
        {holiday && <span className="text-[10px]" aria-hidden>🎉</span>}
      </div>
      {holiday && (
        <span className="text-[9px] text-gray-500 leading-tight mt-0.5 truncate">
          {holiday.name}
        </span>
      )}

      {/* Pointage */}
      {sessions && sessions.count > 0 && (
        <span className="text-[10px] text-blue-700 leading-tight mt-0.5">
          {hours}h{String(mins).padStart(2, '0')}
          {sessions.open && <span className="ml-0.5 text-green-600">●</span>}
        </span>
      )}

      {/* Missions — une barre fine par mission */}
      {missions.map((m, i) => (
        <span
          key={i}
          className={`mt-0.5 h-1.5 w-full rounded-sm ${
            (MISSION_COLOR[m.status] ?? MISSION_COLOR.PENDING)[m.mission_type] ?? 'bg-gray-200'
          }`}
          title={`${m.mission_type === 'REMOTE' ? 'Télétravail' : 'Mission externe'} — ${m.status}`}
          aria-label={`${m.mission_type} ${m.status}`}
        />
      ))}

      {/* Absence — barre de statut en bas */}
      {entry && (
        <span
          className={`mt-auto h-2 w-full rounded ${color} ${halfClass}`}
          aria-label={`${entry.absence.absence_type} ${entry.status}`}
        />
      )}
    </Link>
  )
}

function MonthView({ anchor, dayMap, sessionsByDay, missionDayMap, holidaysByDay }) {
  const first = startOfMonth(anchor)
  const last = endOfMonth(anchor)
  const leadingBlanks = (first.getDay() + 6) % 7
  const cells = [...Array(leadingBlanks).fill(null), ...rangeDays(first, last)]
  const monthLabel = anchor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  return (
    <div>
      <h2 className="font-semibold capitalize mb-2">{monthLabel}</h2>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500 mb-1">
        {DAY_LABELS.map((d) => <span key={d}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) =>
          d ? (
            <DayCell
              key={iso(d)}
              date={d}
              entry={dayMap[iso(d)]}
              sessions={sessionsByDay.get(iso(d))}
              missions={missionDayMap[iso(d)] ?? []}
              holiday={holidaysByDay?.get(iso(d))}
            />
          ) : (
            <div key={`blank-${i}`} />
          ),
        )}
      </div>
    </div>
  )
}

function WeekView({ start, dayMap, sessionsByDay, missionDayMap, holidaysByDay }) {
  const days = rangeDays(start, addDays(start, 6))
  return (
    <div>
      <h2 className="font-semibold mb-2">
        Semaine du {iso(days[0])} au {iso(days[6])}
      </h2>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500 mb-1">
        {DAY_LABELS_LONG.map((d) => <span key={d}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => (
          <DayCell
            key={iso(d)}
            date={d}
            entry={dayMap[iso(d)]}
            sessions={sessionsByDay.get(iso(d))}
            missions={missionDayMap[iso(d)] ?? []}
            holiday={holidaysByDay?.get(iso(d))}
          />
        ))}
      </div>
    </div>
  )
}

function YearView({ year, dayMap, sessionsByDay, missionDayMap, holidaysByDay }) {
  const months = Array.from({ length: 12 }, (_, i) => new Date(year, i, 1))
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      {months.map((m) => (
        <div key={m.getMonth()} className="glass rounded-2xl p-3">
          <p className="font-semibold capitalize mb-2 text-sm">
            {m.toLocaleDateString('fr-FR', { month: 'long' })}
          </p>
          <MiniMonth anchor={m} dayMap={dayMap} sessionsByDay={sessionsByDay}
                     missionDayMap={missionDayMap} holidaysByDay={holidaysByDay} />
        </div>
      ))}
    </div>
  )
}

function MiniMonth({ anchor, dayMap, sessionsByDay, missionDayMap, holidaysByDay }) {
  const first = startOfMonth(anchor)
  const last = endOfMonth(anchor)
  const leadingBlanks = (first.getDay() + 6) % 7
  const cells = [...Array(leadingBlanks).fill(null), ...rangeDays(first, last)]
  return (
    <>
      <div className="grid grid-cols-7 gap-0.5 text-[9px] text-gray-400 mb-0.5">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <span key={i} className="text-center">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-[10px]">
        {cells.map((d, i) => {
          if (!d) return <div key={`b-${i}`} className="aspect-square" />
          const key = iso(d)
          const entry = dayMap[key]
          const holiday = holidaysByDay?.get(key)
          const hasSession = sessionsByDay?.has(key)
          const hasMission = missionDayMap?.[key]?.length > 0
          const missionApproved = missionDayMap?.[key]?.some(m => m.status === 'APPROVED')
          return (
            <Link
              key={key}
              to={`/history/${key}`}
              title={
                holiday ? `Férié : ${holiday.name}` :
                entry ? `${entry.absence.absence_type} — ${entry.status}` : ''
              }
              className={`aspect-square flex items-center justify-center rounded relative transition-colors ${
                holiday ? 'bg-gray-300/70 text-gray-600' :
                entry ? COLORS[entry.status] : 'bg-white/40 hover:bg-white/70'
              }`}
            >
              <span className={`text-[9px] font-medium ${holiday ? 'text-gray-600' : 'text-gray-700'}`}>{d.getDate()}</span>
              {/* Session dot — bottom-right */}
              {hasSession && (
                <span className="absolute bottom-0 right-0 w-1 h-1 rounded-full bg-blue-600" />
              )}
              {/* Mission dot — bottom-left */}
              {hasMission && (
                <span className={`absolute bottom-0 left-0 w-1 h-1 rounded-full ${
                  missionApproved ? 'bg-indigo-500' : 'bg-indigo-300'
                }`} />
              )}
            </Link>
          )
        })}
      </div>
    </>
  )
}
