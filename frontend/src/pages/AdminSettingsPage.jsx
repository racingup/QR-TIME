import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as adminApi from '../api/admin'
import MapPicker from '../components/MapPicker'
import { useAuth } from '../hooks/useAuth'

export default function AdminSettingsPage() {
  const { user } = useAuth()
  const canEditUsers = Boolean(user?.is_superuser)
  const tabs = [
    { id: 'sites', label: 'Sites' },
    { id: 'slots', label: 'Plages fixes' },
    { id: 'tolerance', label: 'Arrondis' },
    ...(canEditUsers ? [{ id: 'users', label: 'Utilisateurs' }] : []),
    ...(canEditUsers ? [{ id: 'audit', label: 'Audit' }] : []),
  ]
  const [tab, setTab] = useState('sites')
  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">Paramètres</h1>
      <nav className="flex gap-2 border-b mb-4">
        {tabs.map((t) => (
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
      {tab === 'users' && canEditUsers && <UsersTab />}
      {tab === 'audit' && canEditUsers && <AuditTab />}
    </div>
  )
}

function AuditTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ action: '', target_user: '', start: '', end: '' })

  const refresh = () => {
    setLoading(true)
    const params = Object.fromEntries(
      Object.entries(filter).filter(([, v]) => v),
    )
    adminApi.audit.list({ ...params, limit: 200 })
      .then(setData)
      .finally(() => setLoading(false))
  }

  useEffect(() => { refresh() /* eslint-disable-next-line */ }, [])

  const actionLabel = (val) =>
    data?.actions_choices.find((c) => c.value === val)?.label || val

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap gap-2 items-end bg-gray-50 border p-3 rounded">
        <label className="text-sm">
          Action
          <select
            className="border rounded p-1 ml-2"
            value={filter.action}
            onChange={(e) => setFilter({ ...filter, action: e.target.value })}
          >
            <option value="">— toutes —</option>
            {data?.actions_choices.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          User cible #
          <input
            type="number" placeholder="id"
            className="border rounded p-1 ml-2 w-20"
            value={filter.target_user}
            onChange={(e) => setFilter({ ...filter, target_user: e.target.value })}
          />
        </label>
        <label className="text-sm">
          Du
          <input
            type="date" className="border rounded p-1 ml-2"
            value={filter.start}
            onChange={(e) => setFilter({ ...filter, start: e.target.value })}
          />
        </label>
        <label className="text-sm">
          Au
          <input
            type="date" className="border rounded p-1 ml-2"
            value={filter.end}
            onChange={(e) => setFilter({ ...filter, end: e.target.value })}
          />
        </label>
        <button type="button" onClick={refresh} className="bg-blue-600 text-white px-3 py-1 rounded text-sm">
          Filtrer
        </button>
      </header>

      {loading || !data ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : data.results.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun événement pour ce filtre.</p>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            {data.count} événement(s) affichés (limite : {data.limit}). Append-only — non modifiable.
          </p>
          <table className="w-full text-xs bg-white border">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-2">Quand</th>
                <th className="p-2">Acteur</th>
                <th className="p-2">Action</th>
                <th className="p-2">Cible</th>
                <th className="p-2">Objet</th>
                <th className="p-2">Détails</th>
                <th className="p-2">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.results.map((r) => (
                <tr key={r.id} className="hover:bg-blue-50/40">
                  <td className="p-2 font-mono whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString('fr-FR')}
                  </td>
                  <td className="p-2">
                    {r.actor_username || <span className="text-slate-400">système</span>}
                  </td>
                  <td className="p-2 font-medium">{actionLabel(r.action)}</td>
                  <td className="p-2">
                    {r.target_username || (r.target_user_id ? `#${r.target_user_id}` : '—')}
                  </td>
                  <td className="p-2 text-slate-500">
                    {r.object_type && `${r.object_type} #${r.object_id}`}
                  </td>
                  <td className="p-2 text-slate-500">
                    {Object.keys(r.details || {}).length > 0 && (
                      <code className="text-[10px]">{JSON.stringify(r.details)}</code>
                    )}
                  </td>
                  <td className="p-2 font-mono text-slate-400">{r.ip_address || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

function SitesTab() {
  const [sites, setSites] = useState([])
  const [editing, setEditing] = useState(null) // site object or { new: true }

  const refresh = () => adminApi.sites.list().then((d) => setSites(d.results || d))
  useEffect(() => { refresh() }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setEditing({ new: true, name: '', latitude: '', longitude: '', gps_radius_meters: 150 })}
          className="bg-blue-600 text-white px-3 py-1 rounded text-sm"
        >
          + Nouveau site
        </button>
      </div>

      {editing && (
        <SiteEditor
          site={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh() }}
        />
      )}

      <ul className="divide-y border rounded bg-white">
        {sites.map((s) => (
          <li key={s.id} className="p-3 flex items-center gap-3 text-sm">
            <span className="font-semibold w-40">{s.name}</span>
            <span className="text-gray-500 font-mono text-xs">
              {Number(s.latitude).toFixed(4)}, {Number(s.longitude).toFixed(4)}
            </span>
            <span className="text-gray-500">±{s.gps_radius_meters}m</span>
            <span className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => setEditing({ ...s })}
                className="bg-blue-600 text-white px-3 py-1 rounded text-xs"
              >
                Éditer
              </button>
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

function SiteEditor({ site, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: site.name || '',
    latitude: site.latitude || '',
    longitude: site.longitude || '',
    gps_radius_meters: site.gps_radius_meters || 150,
  })
  const [saving, setSaving] = useState(false)

  const onSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (site.new) {
        await adminApi.sites.create(form)
      } else {
        await adminApi.sites.update(site.id, form)
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-gray-50 border p-4 rounded space-y-3">
      {/* Form for the site itself — siblings (holidays editor) live OUTSIDE
          to avoid nested-form HTML restrictions. */}
      <form onSubmit={onSave} className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{site.new ? 'Nouveau site' : `Éditer ${site.name}`}</h3>
          <button type="button" onClick={onClose} className="text-sm text-gray-500">✕</button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <input className="border rounded p-2 col-span-2" placeholder="Nom"
                 value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className="border rounded p-2" placeholder="Latitude" type="number" step="0.000001"
                 value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} required />
          <input className="border rounded p-2" placeholder="Longitude" type="number" step="0.000001"
                 value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} required />
          <label className="col-span-4 block text-sm">
            Rayon GPS (m)
            <input className="border rounded p-2 ml-2 w-24" type="number" min="10"
                   value={form.gps_radius_meters}
                   onChange={(e) => setForm({ ...form, gps_radius_meters: Number(e.target.value) })} />
          </label>
        </div>
        <div>
          <p className="text-sm mb-1">Clique sur la carte pour placer le site :</p>
          <MapPicker
            lat={form.latitude ? Number(form.latitude) : undefined}
            lon={form.longitude ? Number(form.longitude) : undefined}
            radius={Number(form.gps_radius_meters)}
            onPick={(lat, lon) =>
              setForm({ ...form, latitude: lat.toFixed(6), longitude: lon.toFixed(6) })
            }
          />
        </div>
        <div className="flex gap-2">
          <button disabled={saving} className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50">
            {saving ? 'Enregistrement…' : site.new ? 'Créer' : 'Enregistrer'}
          </button>
          <button type="button" onClick={onClose} className="bg-gray-300 px-4 py-2 rounded">
            Annuler
          </button>
        </div>
      </form>

      {!site.new && site.id && <SiteHolidaysEditor siteId={site.id} />}
    </div>
  )
}

function SiteHolidaysEditor({ siteId }) {
  const [items, setItems] = useState([])
  const [form, setForm] = useState({ date: '', name: '' })

  const refresh = () =>
    adminApi.holidays.list(siteId).then((d) => setItems(d.results || d))

  useEffect(() => { refresh() /* eslint-disable-next-line */ }, [siteId])

  const onAdd = async (e) => {
    e.preventDefault()
    if (!form.date || !form.name) return
    await adminApi.holidays.create({ site: siteId, date: form.date, name: form.name })
    setForm({ date: '', name: '' })
    refresh()
  }

  const onRemove = async (id) => {
    await adminApi.holidays.remove(id)
    refresh()
  }

  return (
    <div className="bg-white border rounded p-3 mt-3 space-y-2">
      <h4 className="font-semibold text-sm">Jours fériés du site</h4>
      <form onSubmit={onAdd} className="flex flex-wrap gap-2 items-end">
        <input type="date" className="border rounded p-1 text-sm"
               value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <input type="text" className="border rounded p-1 text-sm flex-1"
               placeholder="Ex : Pont de l'Ascension"
               value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <button className="bg-blue-600 text-white px-3 py-1 rounded text-sm">+ Ajouter</button>
      </form>
      {items.length === 0 ? (
        <p className="text-xs text-gray-500">Aucun jour férié configuré.</p>
      ) : (
        <ul className="text-sm divide-y">
          {items.map((h) => (
            <li key={h.id} className="flex items-center justify-between py-1">
              <span>
                <span className="font-mono">{h.date}</span> · {h.name}
              </span>
              <button
                type="button"
                onClick={() => onRemove(h.id)}
                className="text-red-700 text-xs"
              >
                Suppr.
              </button>
            </li>
          ))}
        </ul>
      )}
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
  const [sites, setSites] = useState([])
  const [form, setForm] = useState({
    username: '', password: '', weekly_target_hours: 42, vacation_quota: 25,
    is_manager: false, is_mission_manager: false, home_site: '',
  })

  const refresh = () => adminApi.users.list().then((d) => setUsers(d.results || d))
  useEffect(() => {
    refresh()
    adminApi.sites.list().then((d) => setSites(d.results || d))
  }, [])

  const updateField = async (id, field, value) => {
    await adminApi.users.update(id, { [field]: value === '' ? null : value })
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, [field]: value === '' ? null : value } : u)),
    )
  }

  const onCreate = async (e) => {
    e.preventDefault()
    const payload = { ...form, home_site: form.home_site || null }
    await adminApi.users.create(payload)
    setForm({
      username: '', password: '', weekly_target_hours: 42, vacation_quota: 25,
      is_manager: false, is_mission_manager: false, home_site: '',
    })
    refresh()
  }

  const onDelete = async (u) => {
    if (!window.confirm(`Supprimer "${u.username}" ?`)) return
    await adminApi.users.remove(u.id)
    refresh()
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onCreate} className="grid grid-cols-6 gap-2 items-end bg-gray-50 border p-3 rounded">
        <input className="border rounded p-2 col-span-2" placeholder="Nom d'utilisateur"
               value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
        <input className="border rounded p-2 col-span-2" placeholder="Mot de passe" type="text"
               value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <input className="border rounded p-2" placeholder="h/sem" type="number" step="0.5"
               value={form.weekly_target_hours} onChange={(e) => setForm({ ...form, weekly_target_hours: e.target.value })} />
        <input className="border rounded p-2" placeholder="Congés" type="number"
               value={form.vacation_quota} onChange={(e) => setForm({ ...form, vacation_quota: Number(e.target.value) })} />
        <select className="border rounded p-2 col-span-3"
                value={form.home_site}
                onChange={(e) => setForm({ ...form, home_site: e.target.value ? Number(e.target.value) : '' })}>
          <option value="">— site de rattachement —</option>
          {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <label className="col-span-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_manager}
                 onChange={(e) => setForm({ ...form, is_manager: e.target.checked })} />
          Manager
        </label>
        <label className="col-span-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_mission_manager}
                 onChange={(e) => setForm({ ...form, is_mission_manager: e.target.checked })} />
          Mission Manager
        </label>
        <button className="col-span-6 bg-blue-600 text-white py-2 rounded">
          Créer un collaborateur
        </button>
      </form>

      <table className="w-full text-sm border bg-white">
        <thead className="bg-gray-50 text-left">
          <tr>
            <th className="p-2 font-mono text-xs">ID</th>
            <th className="p-2">Utilisateur</th>
            <th className="p-2">Site</th>
            <th className="p-2">Heures/sem</th>
            <th className="p-2">Quota congés</th>
            <th className="p-2">Manager</th>
            <th className="p-2">Mission Mgr</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {users.map((u) => {
            const isAnonymized = /^deleted_\d+$/.test(u.username || '')
            return (
            <tr key={u.id} className={isAnonymized ? 'bg-slate-50 text-slate-500 italic' : ''}>
              <td className="p-2 font-mono text-xs text-slate-700">#{u.id}</td>
              <td className="p-2">
                {isAnonymized ? (
                  <span title="Compte anonymisé (LPD Art. 32 al. 2)">
                    🕯 {u.username}
                  </span>
                ) : (
                  <input
                    type="text" className="border rounded p-1 w-40"
                    defaultValue={u.username}
                    onBlur={(e) => {
                      if (e.target.value !== u.username) {
                        updateField(u.id, 'username', e.target.value)
                      }
                    }}
                  />
                )}
              </td>
              <td className="p-2">
                <select
                  className="border rounded p-1"
                  value={u.home_site || ''}
                  onChange={(e) =>
                    updateField(u.id, 'home_site', e.target.value ? Number(e.target.value) : '')
                  }
                >
                  <option value="">—</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </td>
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
              <td className="p-2">
                <input
                  type="checkbox"
                  defaultChecked={u.is_mission_manager}
                  onChange={(e) => updateField(u.id, 'is_mission_manager', e.target.checked)}
                />
              </td>
              <td className="p-2">
                {!isAnonymized && (
                  <button
                    type="button"
                    onClick={() => onDelete(u)}
                    className="bg-red-600 text-white px-3 py-1 rounded text-xs"
                  >
                    Suppr.
                  </button>
                )}
              </td>
            </tr>
          )})}
        </tbody>
      </table>
    </div>
  )
}
