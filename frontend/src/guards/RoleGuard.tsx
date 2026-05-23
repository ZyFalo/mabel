import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

interface RoleGuardProps {
  role: string
}

// Home route for each role — when the guard rejects, we send the user
// to their OWN home instead of /403. Reasons:
//  - Admin landing on /home (student area): they almost certainly want
//    /admin, not a 403 dead-end.
//  - Student landing on /admin: they hit /403, which is the right
//    "forbidden" response (security-relevant).
// Keeping the map here, not in the component, makes the policy
// explicit and lets us extend (e.g. future "researcher" role).
const ROLE_HOME: Record<string, string> = {
  admin: '/admin',
  student: '/home',
}

export default function RoleGuard({ role }: RoleGuardProps) {
  const user = useAuthStore((s) => s.user)

  if (!user) {
    return <Navigate to="/" replace />
  }

  if (user.role !== role) {
    // Wrong-role match: if the user is an admin who landed in a
    // student route, redirect to their admin home (better UX than 403).
    // If a student lands in an admin route, fall back to /403 — that's
    // a security boundary we want to make loud.
    if (user.role === 'admin' && role === 'student') {
      return <Navigate to={ROLE_HOME.admin} replace />
    }
    return <Navigate to="/403" replace />
  }

  return <Outlet />
}
