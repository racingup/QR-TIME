import api from './axiosInstance'

export const summary = () => api.get('/me/summary/').then((r) => r.data)
