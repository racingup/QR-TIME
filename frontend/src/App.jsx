import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import AppLayout from './layouts/AppLayout'
import { AuthProvider, useAuth } from './hooks/useAuth'
import AdminSettingsPage from './pages/AdminSettingsPage'
import EmployeeDashboard from './pages/EmployeeDashboard'
import LoginPage from './pages/LoginPage'
import ManagerDashboard from './pages/ManagerDashboard'
import MissionFormPage from './pages/MissionFormPage'
import QRPrintPage from './pages/QRPrintPage'
import ScanPage from './pages/ScanPage'

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

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route index element={<ScanPage />} />
            <Route path="dashboard" element={<EmployeeDashboard />} />
            <Route path="missions/new" element={<MissionFormPage />} />
            <Route path="manager" element={<RequireManager><ManagerDashboard /></RequireManager>} />
            <Route path="admin" element={<RequireManager><AdminSettingsPage /></RequireManager>} />
            <Route
              path="admin/sites/:id/qr"
              element={<RequireManager><QRPrintPage /></RequireManager>}
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  )
}
