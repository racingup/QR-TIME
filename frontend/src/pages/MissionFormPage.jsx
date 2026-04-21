import { useState } from 'react'
import * as missionsApi from '../api/missions'

export default function MissionFormPage() {
  const [form, setForm] = useState({
    mission_type: 'REMOTE',
    date_start: '',
    date_end: '',
    location_name: '',
    gps_radius_meters: 500,
  })
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState(null)
  const [error, setError] = useState(null)

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
          </label>
          <p className="text-xs text-gray-600 bg-gray-50 border rounded p-2">
            Votre pointage sera valide dans un rayon de{' '}
            <strong>{form.gps_radius_meters} m</strong>{' '}
            autour de <strong>{form.location_name || '(adresse à définir)'}</strong>.
          </p>
        </>
      )}

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
