import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <nav className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4 text-sm">
          <NavLink to="/" end className={navClass}>Pointer</NavLink>
          <NavLink to="/dashboard" className={navClass}>Mon tableau</NavLink>
          <NavLink to="/missions/new" className={navClass}>Demande</NavLink>
          {(user?.is_manager || user?.is_superuser) && (
            <>
              <NavLink to="/manager" className={navClass}>Manager</NavLink>
              <NavLink to="/admin" className={navClass}>Admin</NavLink>
            </>
          )}
          <span className="ml-auto flex items-center gap-3">
            <span className="text-gray-600">{user?.username}</span>
            <button
              type="button"
              onClick={handleLogout}
              className="text-gray-500 hover:text-gray-800"
            >
              Déconnexion
            </button>
          </span>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  )
}

function navClass({ isActive }) {
  return isActive
    ? 'text-blue-700 font-semibold'
    : 'text-gray-700 hover:text-gray-900'
}
