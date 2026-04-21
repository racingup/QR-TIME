import { useCallback, useEffect, useState } from 'react'
import * as absencesApi from '../api/absences'
import * as managerApi from '../api/manager'
import * as missionsApi from '../api/missions'

export default function ManagerDashboard() {
  const [presence, setPresence] = useState({ present: [], count: 0 })
  const [alerts, setAlerts] = useState({ alerts: [], pending_justifications: [] })
  const [pendingMissions, setPendingMissions] = useState([])
  const [pendingAbsences, setPendingAbsences] = useState([])
  const [loading, setLoading] = useState(true)

  const refreshAll = useCallback(async () => {
    const [p, a, m, ab] = await Promise.all([
      managerApi.presence(),
      managerApi.alerts(),
      missionsApi.pending(),
      absencesApi.pending(),
    ])
    setPresence(p)
    setAlerts(a)
    setPendingMissions(m.results || m)
    setPendingAbsences(ab.results || ab)
    setLoading(false)
  }, [])

  useEffect(() => {
    refreshAll()
    const t = setInterval(refreshAll, 60_000)
    return () => clearInterval(t)
  }, [refreshAll])

  const decide = async (kind, id, action, comment = '') => {
    const fn =
      kind === 'mission'
        ? action === 'approve'
          ? missionsApi.approve
          : missionsApi.reject
        : absencesApi.approve
    try {
      await fn(id, comment)
      refreshAll()
    } catch (e) {
      alert(`Erreur : ${e.response?.data?.error || e.message}`)
    }
  }

  if (loading) return <p className="p-6">Chargement…</p>

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Tableau de bord manager</h1>

      <section>
        <h2 className="text-lg font-semibold mb-3">
          Présence en temps réel ({presence.count})
        </h2>
        {presence.present.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun salarié pointé actuellement.</p>
        ) : (
          <ul className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {presence.present.map((p) => (
              <li
                key={p.user_id}
                className="bg-green-50 border border-green-200 rounded p-3 text-sm"
              >
                <p className="font-semibold">{p.username}</p>
                <p className="text-xs text-gray-600">
                  {p.session_type} {p.site_name ? `· ${p.site_name}` : ''}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Depuis {new Date(p.clock_in).toLocaleTimeString('fr-FR')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">
          Alertes ({alerts.alerts.length + alerts.pending_justifications.length})
        </h2>
        <ul className="space-y-2">
          {alerts.alerts.map((a) => (
            <li key={`alert-${a.id}`} className="border rounded p-3 bg-red-50">
              <p className="text-sm">
                <span className="font-semibold">{a.username}</span> — {a.message}
              </p>
            </li>
          ))}
          {alerts.pending_justifications.map((j) => (
            <li key={`justif-${j.session_id}`} className="border rounded p-3 bg-orange-50">
              <p className="text-sm">
                <span className="font-semibold">{j.username}</span> — justification :{' '}
                <em>{j.justification}</em>
              </p>
            </li>
          ))}
          {alerts.alerts.length + alerts.pending_justifications.length === 0 && (
            <li className="text-sm text-gray-500">Aucune alerte.</li>
          )}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Centre de validation</h2>
        <ValidationList
          title="Missions en attente"
          items={pendingMissions}
          renderRow={(m) => (
            <RowApproveReject
              key={`m-${m.id}`}
              label={`${m.user} · ${m.mission_type} · ${m.date_start} → ${m.date_end}`}
              onApprove={() => decide('mission', m.id, 'approve')}
              onReject={() => {
                const c = window.prompt('Motif du refus ?') ?? ''
                decide('mission', m.id, 'reject', c)
              }}
            />
          )}
        />
        <ValidationList
          title="Congés en attente"
          items={pendingAbsences}
          renderRow={(a) => (
            <RowApproveReject
              key={`a-${a.id}`}
              label={`${a.user} · ${a.absence_type} · ${a.date_start} → ${a.date_end}`}
              onApprove={() => decide('absence', a.id, 'approve')}
              onReject={() => decide('absence', a.id, 'approve')}
            />
          )}
        />
      </section>
    </div>
  )
}

function ValidationList({ title, items, renderRow }) {
  return (
    <div className="mb-4">
      <p className="text-sm font-medium text-gray-700 mb-2">
        {title} ({items.length})
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400">Aucun.</p>
      ) : (
        <ul className="space-y-2">{items.map(renderRow)}</ul>
      )}
    </div>
  )
}

function RowApproveReject({ label, onApprove, onReject }) {
  return (
    <li className="flex items-center justify-between border rounded p-3 text-sm">
      <span>{label}</span>
      <span className="flex gap-2">
        <button
          type="button"
          onClick={onApprove}
          className="bg-green-600 text-white px-3 py-1 rounded text-xs"
        >
          Valider
        </button>
        <button
          type="button"
          onClick={onReject}
          className="bg-red-600 text-white px-3 py-1 rounded text-xs"
        >
          Refuser
        </button>
      </span>
    </li>
  )
}
