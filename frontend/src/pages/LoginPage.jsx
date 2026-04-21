import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await login(username, password)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.detail || 'Identifiants invalides')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-sm mx-auto mt-20 p-6 space-y-4 bg-white border rounded">
      <h1 className="text-xl font-semibold">Connexion</h1>
      <input
        className="w-full border rounded p-2"
        placeholder="Nom d'utilisateur"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoFocus
        required
      />
      <input
        type="password"
        className="w-full border rounded p-2"
        placeholder="Mot de passe"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
      <button
        disabled={submitting}
        className="w-full bg-blue-600 text-white py-2 rounded disabled:opacity-50"
      >
        {submitting ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  )
}
