import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

export default function PublicRoute() {
  const { isAuthenticated, user } = useAuthStore()

  if (isAuthenticated && user) {
    const target = user.role === 'admin' ? '/admin' : '/home'
    return <Navigate to={target} replace />
  }

  return <Outlet />
}
