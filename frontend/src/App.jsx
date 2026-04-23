import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import AppLayout from './layouts/AppLayout'
import { AuthProvider, useAuth } from './hooks/useAuth'
import AdminSettingsPage from './pages/AdminSettingsPage'
import CalendarPage from './pages/CalendarPage'
import DayDetailPage from './pages/DayDetailPage'
import EmployeeDashboard from './pages/EmployeeDashboard'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import ManagerDashboard from './pages/ManagerDashboard'
import MissionAdminPage from './pages/MissionAdminPage'
import MyDataPage from './pages/MyDataPage'
import PrivacyPage from './pages/PrivacyPage'
import QRPrintPage from './pages/QRPrintPage'
import RequestsPage from './pages/RequestsPage'
import ScanPage from './pages/ScanPage'

/** Privacy policy is publicly accessible (LPD: must be reachable without login). */
function PublicPrivacyShell() {
  return (
    <>
      <div className="app-bg" aria-hidden />
      <PrivacyPage />
    </>
  )
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="p-6">Chargement…</p>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function RequireManager({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="p-6">Chargement…</p>
  if (!user) return <Navigate to="/login" replace />
  if (!user.is_manager && !user.is_superuser) return <Navigate to="/" replace />
  return children
}

function RequireSuperUser({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="p-6">Chargement…</p>
  if (!user) return <Navigate to="/login" replace />
  if (!user.is_superuser) return <Navigate to="/" replace />
  return children
}

function RequireMissionManager({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="p-6">Chargement…</p>
  if (!user) return <Navigate to="/login" replace />
  if (!user.is_mission_manager && !user.is_superuser) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/privacy" element={<PublicPrivacyShell />} />
          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route index element={<HomePage />} />
            <Route path="scan" element={<ScanPage />} />
            <Route path="dashboard" element={<EmployeeDashboard />} />
            <Route path="my-data" element={<MyDataPage />} />
            <Route path="history/:date" element={<DayDetailPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="requests" element={<RequestsPage />} />
            <Route path="manager" element={<RequireManager><ManagerDashboard /></RequireManager>} />
            <Route
              path="mission-gestion"
              element={<RequireMissionManager><MissionAdminPage /></RequireMissionManager>}
            />
            <Route path="admin" element={<RequireSuperUser><AdminSettingsPage /></RequireSuperUser>} />
            <Route
              path="admin/sites/:id/qr"
              element={<RequireSuperUser><QRPrintPage /></RequireSuperUser>}
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  )
}
