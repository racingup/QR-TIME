import axios from 'axios'

const STORAGE_KEYS = {
  access: 'tb_access',
  refresh: 'tb_refresh',
}

export const tokens = {
  get access() {
    return localStorage.getItem(STORAGE_KEYS.access)
  },
  get refresh() {
    return localStorage.getItem(STORAGE_KEYS.refresh)
  },
  set(access, refresh) {
    if (access) localStorage.setItem(STORAGE_KEYS.access, access)
    if (refresh) localStorage.setItem(STORAGE_KEYS.refresh, refresh)
  },
  clear() {
    localStorage.removeItem(STORAGE_KEYS.access)
    localStorage.removeItem(STORAGE_KEYS.refresh)
  },
}

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const t = tokens.access
  if (t) config.headers.Authorization = `Bearer ${t}`
  // Mémoriser le token utilisé pour cette requête : si un refresh a
  // déjà eu lieu pendant l'envoi (concurrence), on évitera de re-refresh
  // pour rien et de griller le nouveau refresh-token (rotation JWT).
  config._sentWithAccessToken = t
  return config
})

let refreshing = null

function _redirectToLogin() {
  // Évite la boucle si on est déjà sur /login ou /privacy (publiques).
  const path = window.location.pathname
  if (path === '/login' || path === '/privacy') return
  // ?expired=1 permet à la LoginPage d'afficher un message clair.
  window.location.assign('/login?expired=1')
}

api.interceptors.response.use(
  (resp) => resp,
  async (error) => {
    const original = error.config
    if (error.response?.status !== 401 || original?._retry) {
      // 401 sans config (ex : refresh lui-même qui échoue) → forcer login.
      if (error.response?.status === 401) {
        tokens.clear()
        _redirectToLogin()
      }
      return Promise.reject(error)
    }
    if (!tokens.refresh) {
      tokens.clear()
      _redirectToLogin()
      return Promise.reject(error)
    }
    original._retry = true

    // Optimisation anti-race : si une autre requête a déjà refresh
    // pendant que celle-ci attendait sa réponse, on a un nouvel access
    // token en localStorage qui n'a pas été utilisé. On retry direct
    // sans re-consommer le refresh-token (qui peut être one-shot).
    if (tokens.access && tokens.access !== original._sentWithAccessToken) {
      original.headers.Authorization = `Bearer ${tokens.access}`
      return api(original)
    }

    refreshing ??= axios
      .post('/api/auth/refresh/', { refresh: tokens.refresh })
      .then((r) => {
        tokens.set(r.data.access, r.data.refresh)
        return r.data.access
      })
      .catch((e) => {
        tokens.clear()
        throw e
      })
      .finally(() => {
        refreshing = null
      })
    try {
      const newAccess = await refreshing
      original.headers.Authorization = `Bearer ${newAccess}`
      return api(original)
    } catch {
      // Refresh token lui aussi expiré → redirect login propre.
      _redirectToLogin()
      return Promise.reject(error)
    }
  },
)

export default api
