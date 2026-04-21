/**
 * Promise wrapper around navigator.geolocation.getCurrentPosition.
 * Resolves with { lat, lon } or rejects with { code, message }.
 */
export function getCurrentPosition(options = { timeout: 10000, enableHighAccuracy: true }) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject({ code: 'UNSUPPORTED', message: 'Géolocalisation non supportée' })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => {
        const map = {
          1: { code: 'PERMISSION_DENIED', message: 'Vous avez refusé l\'accès à votre position' },
          2: { code: 'UNAVAILABLE', message: 'Position indisponible' },
          3: { code: 'TIMEOUT', message: 'Le GPS met trop de temps à répondre' },
        }
        reject(map[err.code] || { code: 'UNKNOWN', message: 'Erreur GPS inconnue' })
      },
      options,
    )
  })
}
