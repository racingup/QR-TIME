import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import * as managerApi from '../api/manager'
import { useAuth } from '../hooks/useAuth'
import { useCompany } from '../hooks/useCompany'

export default function AppLayout() {
  const { user, logout } = useAuth()
  const { company } = useCompany()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [alertCount, setAlertCount] = useState(0)
  const brandLogo = company?.logo_data_url || '/logo.png'
  const brandName = company?.name || 'qrtime.ch'

  // Poll the alerts count every 60s for managers/superusers (used by drawer badge).
  useEffect(() => {
    if (!user || (!user.is_manager && !user.is_superuser)) {
      setAlertCount(0)
      return
    }
    let cancelled = false
    const fetchCount = () =>
      managerApi
        .alerts()
        .then((d) => {
          if (cancelled) return
          const n = (d.alerts?.length || 0) + (d.pending_justifications?.length || 0)
          setAlertCount(n)
        })
        .catch(() => {})
    fetchCount()
    const t = setInterval(fetchCount, 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [user])

  const handleLogout = async () => {
    await logout()
    setMenuOpen(false)
    navigate('/login')
  }

  return (
    <>
      <div className="app-bg" aria-hidden />

      <header className="safe-top sticky top-0 z-30">
        <div className="glass mx-3 mt-3 rounded-2xl px-3 py-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="press relative w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/50"
            aria-label={alertCount > 0 ? `Menu, ${alertCount} alerte(s) en attente` : 'Menu'}
          >
            <BurgerIcon />
            {alertCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-semibold flex items-center justify-center">
                {alertCount > 99 ? '99+' : alertCount}
              </span>
            )}
          </button>
          <NavLink to="/" className="font-semibold tracking-tight flex-1 truncate flex items-center gap-2 min-w-0">
            <img
              src={brandLogo}
              alt=""
              aria-hidden="true"
              width="28" height="28"
              className="w-7 h-7 shrink-0 object-contain"
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
            <span className="truncate">{brandName}</span>
          </NavLink>
          <span className="text-xs text-slate-500 truncate max-w-[8rem]">
            {user?.username}
            {user?.is_superuser && <span className="ml-1 text-purple-600">◆</span>}
          </span>
        </div>
      </header>

      <main className="pb-28">
        <Outlet />
      </main>

      <PoweredByFooter />

      {menuOpen && (
        <Drawer
          user={user}
          alertCount={alertCount}
          onClose={() => setMenuOpen(false)}
          onLogout={handleLogout}
        />
      )}
    </>
  )
}

/**
 * Mention "Powered by QRtime.ch" affichée en bas de toutes les pages
 * authentifiées. `safe-bottom` ajoute le padding pour la home indicator
 * iPhone (env(safe-area-inset-bottom)). Très discret pour ne pas voler
 * la vedette au branding du client (qui peut customiser logo + couleurs).
 */
function PoweredByFooter() {
  return (
    <footer className="fixed bottom-0 left-0 right-0 pointer-events-none safe-bottom z-10">
      <div className="text-center text-[10px] tracking-wide text-slate-400 py-1.5 pointer-events-auto">
        Powered by{' '}
        <a
          href="https://qrtime.ch"
          target="_blank"
          rel="noreferrer"
          className="text-slate-500 hover:text-slate-700 transition-colors"
        >
          QRtime.ch
        </a>
      </div>
    </footer>
  )
}

function BurgerIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  )
}

function Drawer({ user, alertCount, onClose, onLogout }) {
  const linkClass = ({ isActive }) =>
    `block py-3 px-4 rounded-xl text-base ${
      isActive ? 'bg-white/60 text-slate-900 font-semibold' : 'text-slate-700 hover:bg-white/40'
    }`

  const close = () => onClose()

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-slate-900/20 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <aside className="relative glass-strong w-72 max-w-[80vw] safe-top safe-bottom p-4 rounded-r-3xl shadow-xl flex flex-col gap-1 animate-in slide-in-from-left">
        <div className="flex items-center justify-between mb-3 px-2">
          <span className="font-semibold tracking-tight">Menu</span>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg hover:bg-white/40 press"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
        <nav className="flex flex-col gap-1">
          <NavLink to="/" end onClick={close} className={linkClass}>
            Accueil
          </NavLink>
          <NavLink to="/requests" onClick={close} className={linkClass}>
            Mes demandes
          </NavLink>
          <NavLink to="/dashboard" onClick={close} className={linkClass}>
            Mes statistiques
          </NavLink>
          <NavLink to="/my-data" onClick={close} className={linkClass}>
            Mes données
          </NavLink>
          {(user?.is_manager || user?.is_superuser) && (
            <>
              <div className="text-[10px] uppercase tracking-widest text-slate-400 px-4 mt-4 mb-1">
                Manager
              </div>
              <NavLink to="/manager" onClick={close} className={linkClass}>
                <span className="inline-flex items-center gap-2">
                  Tableau manager
                  {alertCount > 0 && (
                    <span className="min-w-[20px] h-[20px] px-1.5 rounded-full bg-rose-600 text-white text-[11px] font-semibold inline-flex items-center justify-center">
                      {alertCount > 99 ? '99+' : alertCount}
                    </span>
                  )}
                </span>
              </NavLink>
            </>
          )}
          {(user?.is_mission_manager || user?.is_superuser) && (
            <>
              <div className="text-[10px] uppercase tracking-widest text-slate-400 px-4 mt-4 mb-1">
                Missions
              </div>
              <NavLink to="/mission-gestion" onClick={close} className={linkClass}>
                Gestion missions
              </NavLink>
            </>
          )}
          {user?.is_superuser && (
            <>
              <div className="text-[10px] uppercase tracking-widest text-slate-400 px-4 mt-4 mb-1">
                Administration
              </div>
              <NavLink to="/admin" onClick={close} className={linkClass}>
                Paramètres
              </NavLink>
            </>
          )}
        </nav>
        <div className="mt-auto pt-4 border-t border-white/40 space-y-1">
          <NavLink to="/privacy" onClick={close} className={linkClass}>
            Politique de confidentialité
          </NavLink>
          <button
            type="button"
            onClick={onLogout}
            className="w-full text-left py-3 px-4 rounded-xl text-red-700 hover:bg-red-50/60 press"
          >
            Déconnexion
          </button>
        </div>
      </aside>
    </div>
  )
}
