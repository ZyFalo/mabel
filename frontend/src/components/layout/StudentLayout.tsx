import { useCallback, useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import Header from './Header'
import StudentSidebarV3 from './StudentSidebarV3'
import SosFab from '../ui/SosFab'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { useChatStore } from '../../stores/chatStore'
import { useToastStore } from '../../stores/toastStore'

const SIDEBAR_STORAGE_KEY = 'mabel_sidebar_open'
const MOBILE_BREAKPOINT = '(max-width: 767px)'
const DESKTOP_BREAKPOINT = '(min-width: 1024px)'

/**
 * Sync read of the preferred initial state so first paint matches user choice
 * (avoids open->collapse flash on reload).
 */
function getDefaultSidebarOpen(): boolean {
  if (typeof window === 'undefined') return true
  const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY)
  if (stored !== null) return stored === 'true'
  return window.matchMedia(DESKTOP_BREAKPOINT).matches
}

function getIsMobile(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia(MOBILE_BREAKPOINT).matches
}

export default function StudentLayout() {
  const navigate = useNavigate()
  const { createSession } = useChatStore()
  const addToast = useToastStore((s) => s.addToast)

  // Sidebar open state (desktop/tablet) AND drawer visibility (mobile).
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(getDefaultSidebarOpen)
  const [isMobile, setIsMobile] = useState<boolean>(getIsMobile)

  // Sync `isMobile` with viewport changes.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(MOBILE_BREAKPOINT)
    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches)
      // When entering mobile, the drawer should start hidden regardless of
      // the persisted desktop state.
      if (e.matches) setSidebarOpen(false)
    }
    // Modern browsers
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Persist sidebar state (only the desktop/tablet preference — mobile is ephemeral).
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isMobile) return
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarOpen))
  }, [sidebarOpen, isMobile])

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev)
  }, [])

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false)
  }, [])

  // Cmd+B / Ctrl+B toggles the sidebar.
  useKeyboardShortcuts({ 'cmd+b': toggleSidebar })

  const handleNewChat = useCallback(async () => {
    try {
      const result = await createSession()
      if (result.previous_session_closed) {
        addToast({
          type: 'info',
          message: 'Sesion anterior finalizada automaticamente',
        })
      }
      if (isMobile) setSidebarOpen(false)
      if (result.checkin_opt_in) {
        navigate(`/session/${result.id}/checkin`)
      } else {
        navigate(`/session/${result.id}/chat`)
      }
    } catch {
      addToast({ type: 'error', message: 'Error al crear sesion' })
    }
  }, [createSession, addToast, navigate, isMobile])

  const handleOpenSettings = useCallback(() => {
    if (isMobile) setSidebarOpen(false)
    navigate('/settings')
  }, [navigate, isMobile])

  return (
    <div className="h-screen flex flex-col bg-[var(--bg)]">
      <Header
        onToggleSidebar={toggleSidebar}
        showHamburger={isMobile}
      />
      <div className="flex flex-1 overflow-hidden relative">
        {isMobile ? (
          <>
            {/* Backdrop */}
            {sidebarOpen && (
              <div
                className="fixed inset-0 bg-black/50 z-40 fade-in"
                onClick={closeSidebar}
                aria-hidden="true"
              />
            )}
            {/* Drawer */}
            <div
              className={`fixed inset-y-0 left-0 z-50 w-[272px] transform transition-transform duration-300 ease-out ${
                sidebarOpen ? 'translate-x-0' : '-translate-x-full'
              }`}
              role="dialog"
              aria-label="Menu de navegacion"
              aria-hidden={!sidebarOpen}
            >
              <StudentSidebarV3
                open
                mobileDrawer
                onToggle={closeSidebar}
                onNewChat={handleNewChat}
                onOpenSettings={handleOpenSettings}
              />
            </div>
          </>
        ) : (
          <StudentSidebarV3
            open={sidebarOpen}
            onToggle={toggleSidebar}
            onNewChat={handleNewChat}
            onOpenSettings={handleOpenSettings}
          />
        )}
        <main className="flex-1 overflow-y-auto bg-bg-main relative">
          <Outlet />
          <SosFab />
        </main>
      </div>
    </div>
  )
}
