import api from './axiosInstance'

export const create = (payload) => api.post('/absences/', payload).then((r) => r.data)
export const my = (params = {}) =>
  api.get('/absences/my/', { params }).then((r) => r.data)
export const pending = () => api.get('/absences/pending/').then((r) => r.data)
export const approve = (id, comment = '') =>
  api.patch(`/absences/${id}/approve/`, { manager_comment: comment }).then((r) => r.data)
export const reject = (id, comment = '') =>
  api.patch(`/absences/${id}/reject/`, { manager_comment: comment }).then((r) => r.data)
export const update = (id, data) =>
  api.patch(`/absences/${id}/`, data).then((r) => r.data)
export const cancel = (id) =>
  api.post(`/absences/${id}/cancel/`).then((r) => r.data)
