import api from './axiosInstance'

export const presence = () => api.get('/manager/presence/').then((r) => r.data)
export const absent = () => api.get('/manager/absent-today/').then((r) => r.data)
export const alerts = () => api.get('/manager/alerts/').then((r) => r.data)
export const team = () => api.get('/manager/team/').then((r) => r.data)
export const teamCalendar = (start, end) =>
  api.get('/manager/team-calendar/', { params: { start, end } }).then((r) => r.data)
export const report = (month) =>
  api.get('/manager/report/', { params: { month } }).then((r) => r.data)
export const reportForUser = (userId, month) =>
  api.get(`/manager/report/${userId}/`, { params: { month } }).then((r) => r.data)

export const reportDownloadUrl = (month, format) =>
  `/api/manager/report/?month=${encodeURIComponent(month)}&download=${format}`
