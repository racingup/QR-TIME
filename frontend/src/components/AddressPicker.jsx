import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { reverseGeocode, searchAddress } from '../utils/geocoding'

const MapPicker = lazy(() => import('./MapPicker'))

/**
 * AddressPicker — sélecteur d'adresse cartographique SANS afficher les
 * coordonnées brutes à l'utilisateur.
 *
 * 3 façons de positionner le marqueur :
 *   1. Taper une adresse → suggestions Nominatim → cliquer une
 *   2. Cliquer directement sur la carte → reverse geocoding
 *   3. Position initiale fournie via `initialLat`/`initialLon` (ex :
 *      adresse actuelle de l'employé) → reverse geocoding auto au mount
 *
 * Le parent reçoit `{lat, lon, label}` via `onPick`.
 *
 * Props :
 *   initialLat, initialLon : position de départ (carte centrée dessus)
 *   initialLabel           : texte d'adresse pré-affiché (évite un re-fetch)
 *   onPick({ lat, lon, label })
 *   height                 : pixels (défaut 320)
 *   placeholder            : placeholder du champ de recherche
 */
export default function AddressPicker({
  initialLat,
  initialLon,
  initialLabel = '',
  onPick,
  height = 320,
  placeholder = 'Rue, ville…',
}) {
  const [lat, setLat] = useState(initialLat ?? null)
  const [lon, setLon] = useState(initialLon ?? null)
  const [label, setLabel] = useState(initialLabel)
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [searching, setSearching] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const searchTimer = useRef(null)

  // Si on reçoit des coords sans label, faire un reverse-geocode auto
  // (l'employé veut voir SON adresse, pas des chiffres).
  useEffect(() => {
    if (initialLat == null || initialLon == null) return
    if (initialLabel) return  // déjà fourni → pas de fetch
    let cancelled = false
    reverseGeocode(initialLat, initialLon).then((addr) => {
      if (!cancelled && addr) setLabel(addr)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Debounce de la recherche : 1 req/s (Nominatim policy).
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (query.trim().length < 3) {
      setSuggestions([])
      return
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true)
      const results = await searchAddress(query)
      setSuggestions(results)
      setSearching(false)
    }, 400)
    return () => searchTimer.current && clearTimeout(searchTimer.current)
  }, [query])

  const applyPosition = (newLat, newLon, newLabel) => {
    setLat(newLat)
    setLon(newLon)
    setLabel(newLabel || '')
    setShowSuggestions(false)
    setQuery('')
    onPick?.({ lat: newLat, lon: newLon, label: newLabel || '' })
  }

  const handleSuggestionClick = (s) => {
    applyPosition(s.lat, s.lon, s.label)
  }

  // MapPicker appelle onPick(lat, lon) en arguments positionnels.
  const handleMapClick = async (newLat, newLon) => {
    setLat(newLat)
    setLon(newLon)
    setLabel('Résolution de l\'adresse…')
    const addr = await reverseGeocode(newLat, newLon)
    const finalLabel = addr || ''
    setLabel(finalLabel)
    onPick?.({ lat: newLat, lon: newLon, label: finalLabel })
  }

  const defaultCenter = lat != null && lon != null
    ? [lat, lon]
    : [46.519962, 6.633597]  // Lausanne

  return (
    <div className="space-y-2">
      {/* Champ de recherche d'adresse */}
      <div className="relative">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            🔍
          </span>
          <input
            type="text"
            className="glass-input w-full pl-9 pr-9"
            placeholder={placeholder}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShowSuggestions(true) }}
            onFocus={() => setShowSuggestions(true)}
            autoComplete="off"
          />
          {searching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
              …
            </span>
          )}
        </div>
        {showSuggestions && suggestions.length > 0 && (
          <ul className="absolute z-30 mt-1 w-full glass-strong rounded-xl overflow-hidden shadow-lg">
            {suggestions.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => handleSuggestionClick(s)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-white/50 press"
                >
                  📍 {s.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Adresse sélectionnée — affichée en clair, pas de coords */}
      {label && (
        <div className="glass-soft rounded-xl px-3 py-2 text-sm flex items-start gap-2">
          <span className="text-emerald-600 mt-0.5">📍</span>
          <span className="flex-1 text-slate-800">{label}</span>
        </div>
      )}

      {/* Carte interactive */}
      <div className="rounded-xl overflow-hidden border border-slate-200">
        <Suspense
          fallback={
            <div
              className="bg-slate-100 flex items-center justify-center text-sm text-slate-400"
              style={{ height }}
            >
              Chargement de la carte…
            </div>
          }
        >
          <MapPicker
            lat={lat}
            lon={lon}
            defaultCenter={defaultCenter}
            onPick={handleMapClick}
            height={height}
          />
        </Suspense>
      </div>

      <p className="text-xs text-slate-500">
        💡 Tapez l'adresse ou cliquez directement sur la carte à
        l'emplacement précis.
      </p>
    </div>
  )
}
