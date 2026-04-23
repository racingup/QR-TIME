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
export const deleteAccount = () =>
  api.post('/me/delete-account/', { confirm: 'DELETE' }).then((r) => r.data)
