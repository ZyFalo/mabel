import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import ConsentGuard from './guards/ConsentGuard'
import ProtectedRoute from './guards/ProtectedRoute'
import PublicRoute from './guards/PublicRoute'
import RoleGuard from './guards/RoleGuard'
import StudentLayout from './components/layout/StudentLayout'
import ToastContainer from './components/ui/Toast'
import AccessDenied from './pages/AccessDenied'
import Chat from './pages/Chat'
import CheckIn from './pages/CheckIn'
import Consent from './pages/Consent'
import ConsentRejected from './pages/ConsentRejected'
import ConsentRequired from './pages/ConsentRequired'
import ForgotPassword from './pages/ForgotPassword'
import Home from './pages/Home'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import ResetPassword from './pages/ResetPassword'
import SessionDetail from './pages/SessionDetail'
import SessionEnd from './pages/SessionEnd'
import { useAuthStore } from './stores/authStore'

function AdminPlaceholder() {
  return (
    <div className="min-h-screen bg-bg-main flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-primary mb-4">Panel Admin</h1>
        <p className="text-lg text-text-primary">En construccion (Fase 8)</p>
      </div>
    </div>
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
              <Route path="/home" element={<Home />} />
              <Route path="/session/:id/checkin" element={<CheckIn />} />
              <Route path="/session/:id/chat" element={<Chat />} />
              <Route path="/session/:id/end" element={<SessionEnd />} />
              <Route path="/session/:id/detail" element={<SessionDetail />} />
            </Route>
          </Route>
        </Route>

        {/* Protected + RoleGuard: admin routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<RoleGuard role="admin" />}>
            <Route path="/admin" element={<AdminPlaceholder />} />
          </Route>
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
