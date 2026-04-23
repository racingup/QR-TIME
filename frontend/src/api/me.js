import api from './axiosInstance'

export const summary = () => api.get('/me/summary/').then((r) => r.data)
export const holidays = (start, end) =>
  api.get('/me/holidays/', { params: { start, end } }).then((r) => r.data)

export const consent = {
  get: () => api.get('/me/consent/').then((r) => r.data),
  set: (kind, granted) =>
    api.post('/me/consent/', { kind, granted }).then((r) => r.data),
}

export const exportData = () => api.get('/me/export/').then((r) => r.data)

// Workflow LPD : on ne supprime PAS direct (cf. /me/delete-account/ qui
// pointait avant vers anonymize_user). On crée une *demande* que l'admin/RH
// validera. L'employé voit son statut PENDING en attendant.
export const deletionRequest = {
  get: () => api.get('/me/deletion-request/').then((r) => r.data),
  create: (reason = '') =>
    api
      .post('/me/deletion-request/', { confirm: 'DELETE', reason })
      .then((r) => r.data),
}
