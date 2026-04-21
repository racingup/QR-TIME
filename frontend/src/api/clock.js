import api from './axiosInstance'

export const scan = (payload) => api.post('/clock/scan/', payload).then((r) => r.data)
export const today = () => api.get('/clock/today/').then((r) => r.data)
export const history = (month) =>
  api.get('/clock/history/', { params: { month } }).then((r) => r.data)
export const regularize = (id, clockOut) =>
  api.patch(`/clock/${id}/regularize/`, { clock_out: clockOut }).then((r) => r.data)
