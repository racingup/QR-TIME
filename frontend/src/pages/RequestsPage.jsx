import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AbsenceRequestPage from './AbsenceRequestPage'
import MissionFormPage from './MissionFormPage'
import MyRequestsPage from './MyRequestsPage'

const TABS = [
  { id: 'list', label: 'Mes demandes' },
  { id: 'mission', label: 'Mission' },
  { id: 'absence', label: 'Absence' },
]

export default function RequestsPage() {
  const [params] = useSearchParams()
  const [tab, setTab] = useState('list')
  const presetKind = params.get('kind') || undefined

  useEffect(() => {
    const t = params.get('type')
    if (t === 'absence') setTab('absence')
    if (t === 'mission') setTab('mission')
    if (t === 'list') setTab('list')
  }, [params])

  return (
    <div className="px-3 max-w-3xl mx-auto pt-2 space-y-4">
      <nav className="glass rounded-2xl p-1 flex gap-1">
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
      {tab === 'list' && <MyRequestsPage />}
      {tab === 'mission' && <MissionFormPage />}
      {tab === 'absence' && <AbsenceRequestPage presetKind={presetKind} />}
    </div>
  )
}
