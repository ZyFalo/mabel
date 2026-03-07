import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'

interface HeaderProps {
  onToggleSidebar?: () => void
}

export default function Header({ onToggleSidebar }: HeaderProps) {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  if (!user) return null

  const isAdmin = user.role === 'admin'
  const homeLink = isAdmin ? '/admin' : '/home'

  return (
    <header className="h-14 bg-primary flex items-center px-4 justify-between shrink-0">
      <div className="flex items-center gap-3">
        {/* Student: hamburger for sidebar toggle */}
        {!isAdmin && onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="text-white p-1 hover:bg-white/10 rounded"
            aria-label="Toggle sidebar"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}

        {/* Logo */}
        <button onClick={() => navigate(homeLink)} className="text-white font-bold text-lg hover:opacity-90">
          Mabel IA
        </button>
      </div>

      <div className="flex items-center gap-3">
        {/* Admin badges placeholder */}
        {isAdmin && (
          <span className="px-2 py-0.5 bg-white/20 text-white text-xs rounded font-medium">Admin</span>
        )}

        {/* User name */}
        <span className="text-white/80 text-sm hidden sm:inline">{user.display_name || user.email}</span>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="text-white/70 hover:text-white text-sm transition-colors"
        >
          Salir
        </button>
      </div>
    </header>
  )
}
