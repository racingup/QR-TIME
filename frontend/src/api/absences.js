import api from './axiosInstance'

export const create = (payload) => api.post('/absences/', payload).then((r) => r.data)
export const my = () => api.get('/absences/my/').then((r) => r.data)
export const pending = () => api.get('/absences/pending/').then((r) => r.data)
export const approve = (id, comment = '') =>
  api.patch(`/absences/${id}/approve/`, { manager_comment: comment }).then((r) => r.data)
