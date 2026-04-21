import { useMemo, useState } from 'react'
import { useEmployee } from '../hooks/useEmployee'

function pad(n) {
  return String(n).padStart(2, '0')
}

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

function statusColor(session) {
  if (session.justification && session.justification_approved === false) return 'bg-red-500'
  if (session.justification && session.justification_approved === true) return 'bg-orange-400'
  if (session.is_forgotten) return 'bg-red-500'
  return 'bg-green-500'
}

export default function EmployeeDashboard() {
  const [month] = useState(currentMonth())
  const { summary, history, loading } = useEmployee(month)

  const days = useMemo(() => {
    const byDay = new Map()
    for (const s of history) {
      const d = s.clock_in.slice(0, 10)
      if (!byDay.has(d)) byDay.set(d, [])
      byDay.get(d).push(s)
    }
    return [...byDay.entries()].sort(([a], [b]) => b.localeCompare(a))
  }, [history])

  if (loading || !summary) {
    return <p className="p-6">Chargement…</p>
  }

  const todayPct = Math.min(
    100,
    Math.round(
      (summary.today.worked_minutes / Math.max(summary.today.target_minutes, 1)) * 100,
    ),
  )
  const overtime = parseFloat(summary.overtime_balance_hours)
  const overtimeColor = overtime >= 0 ? 'text-green-600' : 'text-red-600'

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Bonjour {summary.username}</h1>

      <section className="bg-white border rounded-lg p-5">
        <p className="text-sm text-gray-500">Aujourd'hui</p>
        <div className="flex items-baseline justify-between mt-1">
          <p className="text-lg font-semibold">
            {Math.floor(summary.today.worked_minutes / 60)}h
            {pad(summary.today.worked_minutes % 60)}
            <span className="text-gray-400 font-normal">
              {' '}
              / {Math.floor(summary.today.target_minutes / 60)}h
              {pad(summary.today.target_minutes % 60)}
            </span>
          </p>
          <p className="text-sm text-gray-500">{todayPct}%</p>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3 mt-3 overflow-hidden">
          <div
            className="h-full bg-blue-500"
            style={{ width: `${todayPct}%` }}
            data-testid="today-progress"
          />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4">
        <div className="bg-white border rounded-lg p-5">
          <p className="text-sm text-gray-500">Heures sup</p>
          <p className={`text-2xl font-semibold mt-1 ${overtimeColor}`}>
            {overtime >= 0 ? '+' : ''}
            {overtime.toFixed(2)} h
          </p>
        </div>
        <div className="bg-white border rounded-lg p-5">
          <p className="text-sm text-gray-500">Congés restants</p>
          <p className="text-2xl font-semibold mt-1">
            {summary.vacation_remaining} <span className="text-base text-gray-500">jours</span>
          </p>
        </div>
      </section>

      <section className="bg-white border rounded-lg p-5">
        <h2 className="font-semibold mb-3">Historique du mois</h2>
        {days.length === 0 ? (
          <p className="text-sm text-gray-500">Aucune session ce mois-ci.</p>
        ) : (
          <ul className="divide-y">
            {days.map(([day, sessions]) => {
              const totalMin = sessions
                .filter((s) => s.clock_out_rounded)
                .reduce((a, s) => a + s.duration_minutes, 0)
              return (
                <li key={day} className="py-2 flex items-center gap-3 text-sm">
                  <span
                    className={`inline-block w-3 h-3 rounded-full ${statusColor(sessions[0])}`}
                    aria-hidden
                  />
                  <span className="font-mono">{day}</span>
                  <span className="text-gray-500 ml-auto">
                    {Math.floor(totalMin / 60)}h{pad(totalMin % 60)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
