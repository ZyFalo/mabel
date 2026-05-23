import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import ConsentGuard from './guards/ConsentGuard'
import OnboardingGuard from './guards/OnboardingGuard'
import ProtectedRoute from './guards/ProtectedRoute'
import PublicRoute from './guards/PublicRoute'
import RoleGuard from './guards/RoleGuard'
import AdminLayout from './components/admin/AdminLayout'
import AdminDashboard from './pages/admin/Dashboard'
import AdminMetrics from './pages/admin/Metrics'
import AdminEmpathyRatings from './pages/admin/EmpathyRatings'
import AdminUsers from './pages/admin/Users'
import AdminUserDetail from './pages/admin/UserDetail'
import AdminReports from './pages/admin/Reports'
import AdminSafetyEvents from './pages/admin/SafetyEvents'
import AdminConfig from './pages/admin/Config'
import AdminAuditLogs from './pages/admin/AuditLogs'
import StudentLayout from './components/layout/StudentLayout'
import SessionExpiredModal from './components/ui/SessionExpiredModal'
import ToastContainer from './components/ui/Toast'
import { setOnSessionExpired } from './api/client'
import AccessDenied from './pages/AccessDenied'
import Chat from './pages/Chat'
import CheckIn from './pages/CheckIn'
import Consent from './pages/Consent'
import ConsentRejected from './pages/ConsentRejected'
import ConsentRequired from './pages/ConsentRequired'
import ForgotPassword from './pages/ForgotPassword'
import Home from './pages/Home'
import Landing from './pages/Landing'
import Onboarding from './pages/Onboarding'
import Login from './pages/Login'
import Register from './pages/Register'
import ResetPassword from './pages/ResetPassword'
import SessionDetail from './pages/SessionDetail'
import SessionEnd from './pages/SessionEnd'
import Voice from './pages/Voice'
import { useAuthStore } from './stores/authStore'

function SessionExpiredHandler() {
  const [showExpired, setShowExpired] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    setOnSessionExpired(() => setShowExpired(true))
  }, [])

  return (
    <SessionExpiredModal
      open={showExpired}
      onLogin={() => {
        setShowExpired(false)
        navigate('/login')
      }}
    />
  )
}

export default function App() {
  const initialize = useAuthStore((s) => s.initialize)

  useEffect(() => {
    initialize()
  }, [initialize])

  return (
    <BrowserRouter>
      <ToastContainer />
      <SessionExpiredHandler />
      <Routes>
        {/* Public routes */}
        <Route element={<PublicRoute />}>
          <Route path="/" element={<Landing />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
        </Route>

        {/* Protected: consent flow (no ConsentGuard) */}
        <Route element={<ProtectedRoute />}>
          <Route path="/consent" element={<Consent />} />
          <Route path="/consent-required" element={<ConsentRequired />} />
          <Route path="/consent/rejected" element={<ConsentRejected />} />
          <Route path="/403" element={<AccessDenied />} />
        </Route>

        {/* Protected + RoleGuard(student) + ConsentGuard: student routes.
            The RoleGuard wraps the consent flow because admins should
            never see /onboarding, /home, /session/* etc. — the new
            RoleGuard sends an admin who lands here to /admin instead
            of the dead-end /403 (better UX, see RoleGuard.tsx). */}
        <Route element={<ProtectedRoute />}>
          <Route element={<RoleGuard role="student" />}>
            <Route element={<ConsentGuard />}>
              {/* Onboarding: ConsentGuard sí, pero SIN StudentLayout — el
                  flujo es full-screen guiado (3 pasos: brújula → voz →
                  accesibilidad) y mostrar el sidebar con links a /home,
                  chats activos, etc. permitiría al estudiante escaparse
                  a medio camino y nunca crear su fila en `preferences`.
                  Consistente con las pantallas hermanas pre-experiencia
                  (/login, /consent, /consent-required) que también van
                  sin sidebar. */}
              <Route path="/onboarding" element={<Onboarding />} />

              {/* All other student routes: sidebar + require preferences */}
              <Route element={<StudentLayout />}>
                <Route element={<OnboardingGuard />}>
                  <Route path="/home" element={<Home />} />
                  {/* /settings is no longer a route — Settings is a global
                      modal opened via Outlet context `openSettings(tab?)`.
                      Legacy URLs redirect to /home so bookmarked /settings
                      deeplinks at least land somewhere usable. */}
                  <Route path="/settings" element={<Navigate to="/home" replace />} />
                  {/* Lazy session creation (2026-05-23): /checkin/new
                      renderiza el formulario en modo draft — no hay
                      `id`, así que CheckIn crea la sesión + check-in
                      atómicamente al submit. "Saltar todo" vuelve al
                      Home sin crear nada. */}
                  <Route path="/checkin/new" element={<CheckIn />} />
                  <Route path="/session/:id/checkin" element={<CheckIn />} />
                  <Route path="/session/:id/chat" element={<Chat />} />
                  <Route path="/session/:id/voice" element={<Voice />} />
                  <Route path="/session/:id/end" element={<SessionEnd />} />
                  <Route path="/session/:id/detail" element={<SessionDetail />} />
                </Route>
              </Route>
            </Route>
          </Route>
        </Route>

        {/* Protected + RoleGuard: admin routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<RoleGuard role="admin" />}>
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/admin/users/:id" element={<AdminUserDetail />} />
              <Route path="/admin/reports" element={<AdminReports />} />
              <Route path="/admin/safety-events" element={<AdminSafetyEvents />} />
              <Route path="/admin/metrics" element={<AdminMetrics />} />
              <Route path="/admin/empathy-ratings" element={<AdminEmpathyRatings />} />
              <Route path="/admin/config" element={<AdminConfig />} />
              <Route path="/admin/logs" element={<AdminAuditLogs />} />
            </Route>
          </Route>
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
