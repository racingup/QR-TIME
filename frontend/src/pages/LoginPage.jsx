import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
    <>
      <div className="app-bg" aria-hidden />
      <div className="min-h-screen flex items-center justify-center px-4 safe-top safe-bottom">
        <form onSubmit={onSubmit} className="glass-strong rounded-3xl p-6 w-full max-w-sm space-y-4">
          <div className="text-center">
            <img
              src="/logo.png"
              alt="qrtime.ch"
              width="72" height="72"
              className="mx-auto w-18 h-18 object-contain"
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
            <p className="text-xs uppercase tracking-widest text-slate-500 mt-3">qrtime.ch</p>
            <h1 className="text-2xl font-semibold tracking-tight mt-1">Connexion</h1>
          </div>
          <input
            className="glass-input w-full"
            placeholder="Nom d'utilisateur"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus required
          />
          <input
            type="password"
            className="glass-input w-full"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p role="alert" className="text-rose-700 text-sm">{error}</p>}
          <button
            disabled={submitting}
            className="pill pill-primary w-full justify-center disabled:opacity-50"
          >
            {submitting ? 'Connexion…' : 'Se connecter'}
          </button>
          <p className="text-xs text-center text-slate-500 pt-2">
            En vous connectant, vous acceptez notre{' '}
            <Link to="/privacy" className="underline text-blue-700">
              politique de confidentialité
            </Link>.
          </p>
        </form>
      </div>
    </>
  )
}
