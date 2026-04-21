import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as adminApi from '../api/admin'

const TABS = [
  { id: 'sites', label: 'Sites' },
  { id: 'slots', label: 'Plages fixes' },
  { id: 'tolerance', label: 'Arrondis' },
  { id: 'users', label: 'Utilisateurs' },
]

export default function AdminSettingsPage() {
  const [tab, setTab] = useState('sites')
  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">Paramètres</h1>
      <nav className="flex gap-2 border-b mb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm ${
              tab === t.id
                ? 'border-b-2 border-blue-600 text-blue-700'
                : 'text-gray-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'sites' && <SitesTab />}
      {tab === 'slots' && <SlotsTab />}
      {tab === 'tolerance' && <ToleranceTab />}
      {tab === 'users' && <UsersTab />}
    </div>
  )
}

function SitesTab() {
  const [sites, setSites] = useState([])
  const [form, setForm] = useState({
    name: '', latitude: '', longitude: '', gps_radius_meters: 150,
  })

  const refresh = () => adminApi.sites.list().then((d) => setSites(d.results || d))
  useEffect(() => { refresh() }, [])

  const onCreate = async (e) => {
    e.preventDefault()
    await adminApi.sites.create(form)
    setForm({ name: '', latitude: '', longitude: '', gps_radius_meters: 150 })
    refresh()
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onCreate} className="grid grid-cols-5 gap-2 items-end bg-gray-50 border p-3 rounded">
        <input className="border rounded p-2 col-span-2" placeholder="Nom"
               value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input className="border rounded p-2" placeholder="Latitude" type="number" step="0.000001"
               value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} required />
        <input className="border rounded p-2" placeholder="Longitude" type="number" step="0.000001"
               value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} required />
        <input className="border rounded p-2" placeholder="Rayon (m)" type="number" min="10"
               value={form.gps_radius_meters} onChange={(e) => setForm({ ...form, gps_radius_meters: Number(e.target.value) })} />
        <button className="col-span-5 bg-blue-600 text-white py-2 rounded">Créer site</button>
      </form>

      <ul className="divide-y border rounded bg-white">
        {sites.map((s) => (
          <li key={s.id} className="p-3 flex items-center gap-3 text-sm">
            <span className="font-semibold w-40">{s.name}</span>
            <span className="text-gray-500 font-mono text-xs">
              {Number(s.latitude).toFixed(4)}, {Number(s.longitude).toFixed(4)}
            </span>
            <span className="text-gray-500">±{s.gps_radius_meters}m</span>
            <span className="ml-auto flex gap-2">
              <Link
                to={`/admin/sites/${s.id}/qr`}
                className="bg-gray-700 text-white px-3 py-1 rounded text-xs"
              >
                QR
              </Link>
              <button
                type="button"
                onClick={async () => { await adminApi.sites.regenQr(s.id); refresh() }}
                className="bg-amber-600 text-white px-3 py-1 rounded text-xs"
              >
                Nouveau QR
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (window.confirm(`Supprimer "${s.name}" ?`)) {
                    await adminApi.sites.remove(s.id); refresh()
                  }
                }}
                className="bg-red-600 text-white px-3 py-1 rounded text-xs"
              >
                Suppr.
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SlotsTab() {
  const [slots, setSlots] = useState([])
  const [form, setForm] = useState({ name: '', start_time: '', end_time: '' })

  const refresh = () => adminApi.fixedSlots.list().then((d) => setSlots(d.results || d))
  useEffect(() => { refresh() }, [])

  const onCreate = async (e) => {
    e.preventDefault()
    await adminApi.fixedSlots.create(form)
    setForm({ name: '', start_time: '', end_time: '' })
    refresh()
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onCreate} className="grid grid-cols-4 gap-2 items-end bg-gray-50 border p-3 rounded">
        <input className="border rounded p-2 col-span-2" placeholder="Nom"
               value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input className="border rounded p-2" type="time"
               value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} required />
        <input className="border rounded p-2" type="time"
               value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} required />
        <button className="col-span-4 bg-blue-600 text-white py-2 rounded">Ajouter une plage</button>
      </form>
      <ul className="divide-y border rounded bg-white">
        {slots.map((s) => (
          <li key={s.id} className="p-3 flex items-center gap-3 text-sm">
            <span className="font-semibold">{s.name}</span>
            <span className="text-gray-500">{s.start_time} → {s.end_time}</span>
            <button
              className="ml-auto bg-red-600 text-white px-3 py-1 rounded text-xs"
              onClick={async () => { await adminApi.fixedSlots.remove(s.id); refresh() }}
            >
              Suppr.
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ToleranceTab() {
  const [cfg, setCfg] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { adminApi.tolerance.get().then(setCfg) }, [])
  if (!cfg) return <p>Chargement…</p>

  const onSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const updated = await adminApi.tolerance.update(cfg)
      setCfg(updated)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSave} className="space-y-3 max-w-md">
      <label className="block">
        <span className="text-sm">Tolérance (minutes)</span>
        <input
          type="number" min="0" max="60"
          className="w-full border rounded p-2 mt-1"
          value={cfg.tolerance_minutes}
          onChange={(e) => setCfg({ ...cfg, tolerance_minutes: Number(e.target.value) })}
        />
      </label>
      <label className="block">
        <span className="text-sm">Direction d'arrondi</span>
        <select
          className="w-full border rounded p-2 mt-1"
          value={cfg.rounding_direction}
          onChange={(e) => setCfg({ ...cfg, rounding_direction: e.target.value })}
        >
          <option value="NEAREST">Plus proche</option>
          <option value="DOWN">Inférieur</option>
          <option value="UP">Supérieur</option>
        </select>
      </label>
      <button disabled={saving} className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50">
        {saving ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </form>
  )
}

function UsersTab() {
  const [users, setUsers] = useState([])
  useEffect(() => { adminApi.users.list().then((d) => setUsers(d.results || d)) }, [])

  const updateField = async (id, field, value) => {
    await adminApi.users.update(id, { [field]: value })
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, [field]: value } : u)))
  }

  return (
    <table className="w-full text-sm border bg-white">
      <thead className="bg-gray-50 text-left">
        <tr>
          <th className="p-2">Utilisateur</th>
          <th className="p-2">Heures/sem</th>
          <th className="p-2">Quota congés</th>
          <th className="p-2">Manager ?</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {users.map((u) => (
          <tr key={u.id}>
            <td className="p-2">{u.username}</td>
            <td className="p-2">
              <input
                type="number" step="0.5" className="border rounded p-1 w-24"
                defaultValue={u.weekly_target_hours}
                onBlur={(e) => updateField(u.id, 'weekly_target_hours', e.target.value)}
              />
            </td>
            <td className="p-2">
              <input
                type="number" className="border rounded p-1 w-20"
                defaultValue={u.vacation_quota}
                onBlur={(e) => updateField(u.id, 'vacation_quota', Number(e.target.value))}
              />
            </td>
            <td className="p-2">
              <input
                type="checkbox"
                defaultChecked={u.is_manager}
                onChange={(e) => updateField(u.id, 'is_manager', e.target.checked)}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
