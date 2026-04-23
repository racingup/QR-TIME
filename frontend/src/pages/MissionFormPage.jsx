import { useEffect, useMemo, useState } from 'react'
import * as meApi from '../api/me'
import * as missionsApi from '../api/missions'
import MapPicker from '../components/MapPicker'

export default function MissionFormPage() {
  const [form, setForm] = useState({
    mission_type: 'REMOTE',
    date_start: '',
    date_end: '',
    location_name: '',
    gps_radius_meters: 500,
    location_lat: null,
    location_lon: null,
    user_comment: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState(null)
  const [error, setError] = useState(null)
  const [homeSite, setHomeSite] = useState(null)

  useEffect(() => {
    meApi.summary().then((s) => setHomeSite(s.home_site)).catch(() => setHomeSite(null))
  }, [])

  const defaultMapCenter = useMemo(() => {
    if (!homeSite) return undefined
    return [Number(homeSite.latitude), Number(homeSite.longitude)]
  }, [homeSite])

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const payload = { ...form, gps_radius_meters: Number(form.gps_radius_meters) }
      if (form.mission_type === 'REMOTE') {
        delete payload.gps_radius_meters
        delete payload.location_name
        delete payload.location_lat
        delete payload.location_lon
      }
      const data = await missionsApi.create(payload)
      setCreated(data)
    } catch (err) {
      setError(err.response?.data || { error: String(err) })
    } finally {
      setSubmitting(false)
    }
  }

  if (created) {
    return (
      <div className="max-w-md mx-auto p-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 text-blue-900">
          <p className="text-3xl">📨</p>
          <p className="font-semibold mt-2">Demande envoyée</p>
          <p className="text-sm mt-2">
            Statut actuel : <strong>{created.status}</strong>. Un manager doit
            l'approuver pour que vous receviez votre QR code.
          </p>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold">Nouvelle demande de mission</h1>

      <label className="block">
        <span className="text-sm">Type</span>
        <select
          className="w-full border rounded p-2 mt-1"
          value={form.mission_type}
          onChange={update('mission_type')}
        >
          <option value="REMOTE">Télétravail</option>
          <option value="FIELD">Mission externe</option>
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm">Date début</span>
          <input
            type="date"
            required
            className="w-full border rounded p-2 mt-1"
            value={form.date_start}
            onChange={update('date_start')}
          />
        </label>
        <label className="block">
          <span className="text-sm">Date fin</span>
          <input
            type="date"
            required
            className="w-full border rounded p-2 mt-1"
            value={form.date_end}
            onChange={update('date_end')}
          />
        </label>
      </div>

      {form.mission_type === 'FIELD' && (
        <>
          <label className="block">
            <span className="text-sm">Lieu / adresse</span>
            <input
              type="text"
              className="w-full border rounded p-2 mt-1"
              value={form.location_name}
              onChange={update('location_name')}
              placeholder="Client Renault Boulogne"
            />
          </label>
          <label className="block">
            <span className="text-sm">Rayon GPS souhaité (m)</span>
            <input
              type="number"
              min={50}
              className="w-full border rounded p-2 mt-1"
              value={form.gps_radius_meters}
              onChange={update('gps_radius_meters')}
            />
            <span className="block text-xs text-gray-500 mt-1">
              Le manager pourra ajuster ce rayon à l'approbation.
            </span>
          </label>
          <div>
            <p className="text-sm mb-1">
              Position sur la carte (cliquer pour choisir)
              {homeSite && !form.location_lat && (
                <span className="text-xs text-slate-500 ml-1">
                  · centrée sur votre site de rattachement ({homeSite.name})
                </span>
              )}
            </p>
            <MapPicker
              lat={form.location_lat ? Number(form.location_lat) : undefined}
              lon={form.location_lon ? Number(form.location_lon) : undefined}
              radius={Number(form.gps_radius_meters)}
              defaultCenter={defaultMapCenter}
              onPick={(lat, lon) =>
                setForm({
                  ...form,
                  location_lat: lat.toFixed(6),
                  location_lon: lon.toFixed(6),
                })
              }
            />
            {form.location_lat && (
              <p className="text-xs text-gray-500 mt-1 font-mono">
                {form.location_lat}, {form.location_lon}
              </p>
            )}
          </div>
          <p className="text-xs text-gray-600 bg-gray-50 border rounded p-2">
            Votre pointage sera valide dans un rayon de{' '}
            <strong>{form.gps_radius_meters} m</strong>{' '}
            autour de <strong>{form.location_name || '(adresse à définir)'}</strong>.
          </p>
        </>
      )}

      <label className="block">
        <span className="text-sm">
          Commentaire à l'intention du manager (optionnel)
        </span>
        <textarea
          className="w-full border rounded p-2 mt-1 h-20 text-sm"
          value={form.user_comment}
          onChange={update('user_comment')}
          placeholder="Ex : déplacement client important, besoin d'accès au matériel…"
        />
      </label>

      {error && (
        <p className="text-red-700 text-sm" role="alert">
          {JSON.stringify(error)}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-blue-600 text-white py-2 rounded disabled:opacity-50"
      >
        {submitting ? 'Envoi…' : 'Soumettre la demande'}
      </button>
    </form>
  )
}
