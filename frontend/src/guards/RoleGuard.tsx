import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

interface RoleGuardProps {
  role: string
}

export default function RoleGuard({ role }: RoleGuardProps) {
  const user = useAuthStore((s) => s.user)

  if (!user || user.role !== role) {
    return <Navigate to="/403" replace />
  }

  return <Outlet />
}
