import api from './axiosInstance'

export const create = (payload) => api.post('/missions/', payload).then((r) => r.data)
export const my = () => api.get('/missions/my/').then((r) => r.data)
export const pending = () => api.get('/missions/pending/').then((r) => r.data)
export const approve = (id, comment = '') =>
  api.patch(`/missions/${id}/approve/`, { manager_comment: comment }).then((r) => r.data)
export const reject = (id, comment = '') =>
  api.patch(`/missions/${id}/reject/`, { manager_comment: comment }).then((r) => r.data)
export const qr = (id) => api.get(`/missions/${id}/qr/`).then((r) => r.data)
