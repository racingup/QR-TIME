import api from './axiosInstance'

export const sites = {
  list: () => api.get('/admin/sites/').then((r) => r.data),
  create: (data) => api.post('/admin/sites/', data).then((r) => r.data),
  update: (id, data) => api.patch(`/admin/sites/${id}/`, data).then((r) => r.data),
  remove: (id) => api.delete(`/admin/sites/${id}/`).then((r) => r.data),
  regenQr: (id) => api.post(`/admin/sites/${id}/regen-qr/`).then((r) => r.data),
  qr: (id) => api.get(`/admin/sites/${id}/qr/`).then((r) => r.data),
}

export const fixedSlots = {
  list: () => api.get('/admin/fixed-slots/').then((r) => r.data),
  create: (data) => api.post('/admin/fixed-slots/', data).then((r) => r.data),
  update: (id, data) => api.patch(`/admin/fixed-slots/${id}/`, data).then((r) => r.data),
  remove: (id) => api.delete(`/admin/fixed-slots/${id}/`).then((r) => r.data),
}

export const tolerance = {
  get: () => api.get('/admin/tolerance/').then((r) => r.data),
  update: (data) => api.put('/admin/tolerance/', data).then((r) => r.data),
}

export const holidays = {
  list: (siteId) =>
    api.get('/admin/holidays/', { params: siteId ? { site: siteId } : {} })
      .then((r) => r.data),
  create: (data) => api.post('/admin/holidays/', data).then((r) => r.data),
  remove: (id) => api.delete(`/admin/holidays/${id}/`).then((r) => r.data),
}

export const users = {
  list: () => api.get('/admin/users/').then((r) => r.data),
  create: (data) => api.post('/admin/users/', data).then((r) => r.data),
  update: (id, data) => api.patch(`/admin/users/${id}/`, data).then((r) => r.data),
  remove: (id) => api.delete(`/admin/users/${id}/`).then((r) => r.data),
}

export const audit = {
  list: (params) => api.get('/admin/audit/', { params }).then((r) => r.data),
}
