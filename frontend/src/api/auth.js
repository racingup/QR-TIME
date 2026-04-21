import api, { tokens } from './axiosInstance'

export async function login(username, password) {
  const { data } = await api.post('/auth/login/', { username, password })
  tokens.set(data.access, data.refresh)
  return data
}

export async function logout() {
  try {
    if (tokens.refresh) {
      await api.post('/auth/logout/', { refresh: tokens.refresh })
    }
  } finally {
    tokens.clear()
  }
}
