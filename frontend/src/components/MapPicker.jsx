import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'

// Fix default marker icons (Vite doesn't resolve the CSS-referenced .pngs).
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const PARIS = [48.8566, 2.3522]

function ClickHandler({ onPick }) {
  useMapEvents({
    click(e) {
      onPick([e.latlng.lat, e.latlng.lng])
    },
  })
  return null
}

function Recenter({ center }) {
  const map = useMap()
  const lastRef = useRef(null)
  useEffect(() => {
    if (!center) return
    const key = `${center[0]}:${center[1]}`
    if (lastRef.current === key) return
    lastRef.current = key
    map.setView(center, map.getZoom())
  }, [center, map])
  return null
}

/**
 * Click-to-pick map.
 * Props:
 *   lat, lon : marker position (controlled)
 *   radius   : meters, optional circle around marker
 *   defaultCenter : [lat, lon] used to center the map when no marker is set
 *                   (typically the user's home_site coords). Falls back to PARIS.
 *   onPick   : (lat, lon) => void
 */
export default function MapPicker({ lat, lon, radius, onPick, defaultCenter, height = 300 }) {
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lon)
  const fallback = (Array.isArray(defaultCenter)
    && defaultCenter.length === 2
    && Number.isFinite(defaultCenter[0])
    && Number.isFinite(defaultCenter[1]))
    ? defaultCenter
    : PARIS
  const center = hasPoint ? [lat, lon] : fallback
  return (
    <div style={{ height }} className="rounded overflow-hidden border">
      <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onPick={([la, lo]) => onPick(la, lo)} />
        {hasPoint && <Marker position={[lat, lon]} />}
        {hasPoint && radius > 0 && (
          <Circle center={[lat, lon]} radius={radius} pathOptions={{ color: '#2563eb' }} />
        )}
        <Recenter center={hasPoint ? [lat, lon] : fallback} />
      </MapContainer>
    </div>
  )
}
