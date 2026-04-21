import api from './axiosInstance'

export const presence = () => api.get('/manager/presence/').then((r) => r.data)
export const alerts = () => api.get('/manager/alerts/').then((r) => r.data)
