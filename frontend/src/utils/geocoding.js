/**
 * Geocoding via Nominatim (OpenStreetMap).
 *
 * Pourquoi Nominatim : gratuit, sans clé, basé sur OSM (les mêmes tuiles
 * que MapPicker). Pas de tracking utilisateur côté serveur (vs Google).
 *
 * Usage policy : https://operations.osmfoundation.org/policies/nominatim/
 *   - User-Agent identifiant l'app
 *   - Max 1 req/sec (on debounce côté UI)
 *   - Préférer un service self-hosted en cas de gros volume
 *
 * Toutes les fonctions retournent null en cas d'échec (fail-open).
 */

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org'

// User-Agent personnalisé (requis par la policy Nominatim).
// Le navigateur n'autorise pas la modification de User-Agent en JS pur,
// mais on peut envoyer Referer + Accept-Language.
const COMMON_HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'fr',
}

/**
 * Reverse geocoding : coordonnées → adresse humaine.
 * @returns {Promise<string|null>}
 */
export async function reverseGeocode(lat, lon) {
  try {
    const url = new URL(`${NOMINATIM_BASE}/reverse`)
    url.searchParams.set('format', 'json')
    url.searchParams.set('lat', String(lat))
    url.searchParams.set('lon', String(lon))
    url.searchParams.set('zoom', '18')
    url.searchParams.set('addressdetails', '1')
    url.searchParams.set('accept-language', 'fr')

    const r = await fetch(url.toString(), { headers: COMMON_HEADERS })
    if (!r.ok) return null
    const data = await r.json()
    return formatDisplayAddress(data) || data?.display_name || null
  } catch {
    return null
  }
}

/**
 * Forward search : texte d'adresse → liste de suggestions.
 * @returns {Promise<Array<{label, lat, lon}>>}
 */
export async function searchAddress(query, { limit = 5, countryCodes = 'ch,fr,be,lu' } = {}) {
  const q = (query || '').trim()
  if (q.length < 3) return []
  try {
    const url = new URL(`${NOMINATIM_BASE}/search`)
    url.searchParams.set('format', 'json')
    url.searchParams.set('q', q)
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('addressdetails', '1')
    url.searchParams.set('accept-language', 'fr')
    if (countryCodes) url.searchParams.set('countrycodes', countryCodes)

    const r = await fetch(url.toString(), { headers: COMMON_HEADERS })
    if (!r.ok) return []
    const data = await r.json()
    if (!Array.isArray(data)) return []
    return data
      .map((d) => ({
        label: formatDisplayAddress(d) || d.display_name,
        lat: parseFloat(d.lat),
        lon: parseFloat(d.lon),
      }))
      .filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon))
  } catch {
    return []
  }
}

/**
 * Construit une étiquette d'affichage propre depuis un résultat Nominatim.
 * Privilégie la forme "Rue + Numéro, Code postal Ville" plutôt que le
 * full display_name qui peut être verbeux ("XX, YY, ZZ, …, France").
 */
function formatDisplayAddress(d) {
  const a = d?.address
  if (!a) return null
  const street = [a.house_number, a.road || a.pedestrian || a.path].filter(Boolean).join(' ')
  const city = a.village || a.town || a.city || a.municipality || a.county || ''
  const postcode = a.postcode || ''
  const parts = []
  if (street) parts.push(street)
  if (postcode || city) parts.push(`${postcode} ${city}`.trim())
  return parts.length > 0 ? parts.join(', ') : null
}
