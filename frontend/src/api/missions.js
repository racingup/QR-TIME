import api from './axiosInstance'

export const create = (payload) => api.post('/missions/', payload).then((r) => r.data)
export const my = () => api.get('/missions/my/').then((r) => r.data)
export const pending = () => api.get('/missions/pending/').then((r) => r.data)
export const all = (params = {}) =>
  api.get('/missions/all/', { params }).then((r) => r.data)
export const assign = (payload) =>
  api.post('/missions/', { ...payload, auto_approve: true }).then((r) => r.data)
export const approve = (id, payload = {}) => {
  // Accept either a string (legacy: just the comment) or full options object.
  const body = typeof payload === 'string' ? { manager_comment: payload } : payload
  return api.patch(`/missions/${id}/approve/`, body).then((r) => r.data)
}
export const reject = (id, comment = '') =>
  api.patch(`/missions/${id}/reject/`, { manager_comment: comment }).then((r) => r.data)
export const update = (id, data) =>
  api.patch(`/missions/${id}/`, data).then((r) => r.data)
export const qr = (id) => api.get(`/missions/${id}/qr/`).then((r) => r.data)
