import { lazy, Suspense } from 'react'
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import AppLayout from './layouts/AppLayout'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { CompanyProvider } from './hooks/useCompany'
import { SummaryProvider } from './hooks/useSummary'

// Pages critiques (eager) : login + landing + consent gate.
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import ConsentGatePage from './pages/ConsentGatePage'

// Pages secondaires (lazy) : chargées à la demande. Bundle initial divisé.
//
// Bénéfice : un employé qui ne va jamais sur /admin ne télécharge pas
// les ~80 KB d'AdminSettingsPage (et ses libs : leaflet, recharts…).
const AdminSettingsPage = lazy(() => import('./pages/AdminSettingsPage'))
const CalendarPage      = lazy(() => import('./pages/CalendarPage'))
const DayDetailPage     = lazy(() => import('./pages/DayDetailPage'))
const EmployeeDashboard = lazy(() => import('./pages/EmployeeDashboard'))
const ManagerDashboard  = lazy(() => import('./pages/ManagerDashboard'))
const MissionAdminPage  = lazy(() => import('./pages/MissionAdminPage'))
const MyDataPage        = lazy(() => import('./pages/MyDataPage'))
const PrivacyPage       = lazy(() => import('./pages/PrivacyPage'))
const QRPrintPage       = lazy(() => import('./pages/QRPrintPage'))
const RequestsPage      = lazy(() => import('./pages/RequestsPage'))
const ScanPage          = lazy(() => import('./pages/ScanPage'))

function PageLoader() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <p className="text-slate-500 text-sm">Chargement…</p>
    </div>
  )
}

/** Privacy policy is publicly accessible (LPD: must be reachable without login). */
function PublicPrivacyShell() {
  return (
    <>
      <div className="app-bg" aria-hidden />
      <Suspense fallback={<PageLoader />}>
        <PrivacyPage />
      </Suspense>
    </>
  )
}

function RequireAuth({ children }) {
  const { user, loading, refreshMe } = useAuth()
  if (loading) return <p className="p-6">Chargement…</p>
  if (!user) return <Navigate to="/login" replace />
  if (user.must_accept_consent) {
    return <ConsentGatePage onAccepted={() => refreshMe()} />
  }
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
      <CompanyProvider>
      <AuthProvider>
      <SummaryProvider>
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
            <Route
              path="scan"
              element={<Suspense fallback={<PageLoader />}><ScanPage /></Suspense>}
            />
            <Route
              path="dashboard"
              element={<Suspense fallback={<PageLoader />}><EmployeeDashboard /></Suspense>}
            />
            <Route
              path="my-data"
              element={<Suspense fallback={<PageLoader />}><MyDataPage /></Suspense>}
            />
            <Route
              path="history/:date"
              element={<Suspense fallback={<PageLoader />}><DayDetailPage /></Suspense>}
            />
            <Route
              path="calendar"
              element={<Suspense fallback={<PageLoader />}><CalendarPage /></Suspense>}
            />
            <Route
              path="requests"
              element={<Suspense fallback={<PageLoader />}><RequestsPage /></Suspense>}
            />
            <Route
              path="manager"
              element={
                <RequireManager>
                  <Suspense fallback={<PageLoader />}><ManagerDashboard /></Suspense>
                </RequireManager>
              }
            />
            <Route
              path="mission-gestion"
              element={
                <RequireMissionManager>
                  <Suspense fallback={<PageLoader />}><MissionAdminPage /></Suspense>
                </RequireMissionManager>
              }
            />
            <Route
              path="admin"
              element={
                <RequireSuperUser>
                  <Suspense fallback={<PageLoader />}><AdminSettingsPage /></Suspense>
                </RequireSuperUser>
              }
            />
            <Route
              path="admin/sites/:id/qr"
              element={
                <RequireSuperUser>
                  <Suspense fallback={<PageLoader />}><QRPrintPage /></Suspense>
                </RequireSuperUser>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SummaryProvider>
      </AuthProvider>
      </CompanyProvider>
    </Router>
  )
}
