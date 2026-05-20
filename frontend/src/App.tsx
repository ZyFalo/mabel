import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import ConsentGuard from './guards/ConsentGuard'
import OnboardingGuard from './guards/OnboardingGuard'
import ProtectedRoute from './guards/ProtectedRoute'
import PublicRoute from './guards/PublicRoute'
import RoleGuard from './guards/RoleGuard'
import AdminLayout from './components/admin/AdminLayout'
import AdminUsers from './pages/admin/Users'
import AdminUserDetail from './pages/admin/UserDetail'
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
import Settings from './pages/Settings'
import { useAuthStore } from './stores/authStore'

function AdminPageStub({ title }: { title: string }) {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">{title}</h1>
        <p className="text-sm text-text-primary/60 mt-1">En construccion (Fase 8)</p>
      </div>
      <div className="border border-dashed border-gray-300 rounded-lg p-10 text-center bg-white">
        <p className="text-text-primary/50 text-sm">
          Esta vista se implementara en una proxima capacidad de Fase 8.
        </p>
      </div>
    </div>
  )
}

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

        {/* Protected + ConsentGuard: student routes with sidebar layout */}
        <Route element={<ProtectedRoute />}>
          <Route element={<ConsentGuard />}>
            <Route element={<StudentLayout />}>
              {/* Onboarding: inside ConsentGuard, outside OnboardingGuard */}
              <Route path="/onboarding" element={<Onboarding />} />
              {/* All other student routes: require preferences (OnboardingGuard) */}
              <Route element={<OnboardingGuard />}>
                <Route path="/home" element={<Home />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/session/:id/checkin" element={<CheckIn />} />
                <Route path="/session/:id/chat" element={<Chat />} />
                <Route path="/session/:id/end" element={<SessionEnd />} />
                <Route path="/session/:id/detail" element={<SessionDetail />} />
              </Route>
            </Route>
          </Route>
        </Route>

        {/* Protected + RoleGuard: admin routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<RoleGuard role="admin" />}>
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<AdminPageStub title="Dashboard" />} />
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/admin/users/:id" element={<AdminUserDetail />} />
              <Route path="/admin/reports" element={<AdminPageStub title="Reportes" />} />
              <Route path="/admin/safety-events" element={<AdminPageStub title="Safety Events" />} />
              <Route path="/admin/metrics" element={<AdminPageStub title="Metricas" />} />
              <Route path="/admin/config" element={<AdminPageStub title="Configuracion" />} />
              <Route path="/admin/logs" element={<AdminPageStub title="Logs de auditoria" />} />
            </Route>
          </Route>
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
