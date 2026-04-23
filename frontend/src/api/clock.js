import api from './axiosInstance'

export const scan = (payload) => api.post('/clock/scan/', payload).then((r) => r.data)
export const today = () => api.get('/clock/today/').then((r) => r.data)
export const history = (monthOrParams) => {
  const params =
    typeof monthOrParams === 'string'
      ? { month: monthOrParams }
      : monthOrParams
  return api.get('/clock/history/', { params }).then((r) => r.data)
}
export const day = (date, userId) =>
  api
    .get('/clock/day/', { params: userId ? { date, user_id: userId } : { date } })
    .then((r) => r.data)
export const regularize = (id, clockOut) =>
  api
    .patch(`/clock/${id}/regularize/`, clockOut ? { clock_out: clockOut } : {})
    .then((r) => r.data)
export const editSession = (id, data) =>
  api.patch(`/clock/${id}/edit/`, data).then((r) => r.data)
export const deleteSession = (id) =>
  api.delete(`/clock/${id}/delete/`).then((r) => r.data)
export const manualSession = (data) =>
  api.post('/clock/manual/', data).then((r) => r.data)
