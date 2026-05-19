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

// Workflow LPD : on ne supprime PAS direct (cf. /me/delete-account/ qui
// pointait avant vers anonymize_user). On crée une *demande* que l'admin/RH
// validera. L'employé voit son statut PENDING en attendant.
export const deletionRequest = {
  get: () => api.get('/me/deletion-request/').then((r) => r.data),
  create: (reason = '') =>
    api
      .post('/me/deletion-request/', { confirm: 'DELETE', reason })
      .then((r) => r.data),
}

// Acceptation initiale des 3 consentements (premier usage)
export const acceptInitialConsent = () =>
  api.post('/me/consent/accept-initial/').then((r) => r.data)

// Demandes de retrait de consentement
export const consentWithdrawal = {
  get: () => api.get('/me/consent-withdrawal/').then((r) => r.data),
  create: (kind, reason) =>
    api.post('/me/consent-withdrawal/', { kind, reason }).then((r) => r.data),
}

// ── Profil utilisateur ───────────────────────────────────────────────
export const profile = {
  get: () => api.get('/me/profile/').then((r) => r.data),
  update: (fields) => api.patch('/me/profile/', fields).then((r) => r.data),
}

export const changePassword = (oldPassword, newPassword) =>
  api
    .post('/me/change-password/', {
      old_password: oldPassword,
      new_password: newPassword,
    })
    .then((r) => r.data)

export const homeAddressRequest = {
  get: () => api.get('/me/home-address-request/').then((r) => r.data),
  create: ({ lat, lon, label, reason }) =>
    api
      .post('/me/home-address-request/', {
        new_home_lat: lat,
        new_home_lon: lon,
        new_address_label: label,
        reason,
      })
      .then((r) => r.data),
}
