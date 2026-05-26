import { useCallback, useEffect, useState } from 'react'
import { Outlet, useNavigate, useParams } from 'react-router-dom'
import { Menu } from 'lucide-react'
import StudentSidebarV3 from './StudentSidebarV3'
import SosPanel from '../sos/SosPanel'
import Settings, { type TabId as SettingsTabId } from '../../pages/Settings'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
// NOTE: previously imported `useChatStore` and `useToastStore` to create a
// session synchronously on "Nueva sesión" click. That eager-create flow was
// replaced by lazy-create — see `handleNewChat` below.

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
  const params = useParams()

  // Sidebar open state (desktop/tablet) AND drawer visibility (mobile).
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(getDefaultSidebarOpen)
  const [isMobile, setIsMobile] = useState<boolean>(getIsMobile)

  // Crisis overlay state — shared between the SosFab (bottom-right) and the
  // sidebar "Linea de crisis SOS" button. Both routes register a manual
  // safety_event on open (handled inside `SosPanel`).
  const [crisisOpen, setCrisisOpen] = useState(false)
  const openCrisis = useCallback(() => setCrisisOpen(true), [])
  const closeCrisis = useCallback(() => setCrisisOpen(false), [])

  // Settings — modal triggered by state (like SosPanel/ReportModal) rather
  // than a separate route. Lets the underlying page (chat, home, …) stay
  // rendered behind the backdrop instead of being unmounted.
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTabId | undefined>(undefined)
  const openSettings = useCallback((tab?: SettingsTabId) => {
    setSettingsTab(tab)
    setSettingsOpen(true)
  }, [])
  const closeSettings = useCallback(() => setSettingsOpen(false), [])

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

  // Lazy-create — match ChatGPT/Claude/Gemini behavior: clicking "Nueva
  // sesión" does NOT create a session on the backend. It just sends the user
  // to the home/landing screen with the empty composer. The session is
  // created on the first send (or on check-in submit) inside Home.tsx, which
  // forwards the user's text as `pendingMessage` via router state. This
  // prevents the historical "empty sessions every click" basura.
  const handleNewChat = useCallback(() => {
    if (isMobile) setSidebarOpen(false)
    navigate('/home')
  }, [navigate, isMobile])

  const handleOpenSettings = useCallback(
    (tab?: SettingsTabId) => {
      if (isMobile) setSidebarOpen(false)
      openSettings(tab)
    },
    [openSettings, isMobile],
  )

  return (
    <div className="h-screen flex flex-col bg-[var(--ink-50)]">
      {/* Mini-banda brand para cubrir el área del notch en PWA mobile.
          StudentLayout NO renderiza Header.tsx en mobile (usa solo el
          FAB hamburger flotante), así que sin esta banda el área del
          notch quedaría con el fondo claro del body y el status bar
          de iOS (black-translucent) se vería con texto oscuro sobre
          blanco — mal contraste y sin separación visual del header.
          Solo visible en mobile + cuando hay safe-area (iPhone notch).
          Bug reportado 2026-05-26 captura Home mobile. */}
      {isMobile && (
        <div
          aria-hidden
          className="fixed top-0 left-0 right-0 z-20"
          style={{
            height: 'var(--safe-top)',
            background:
              'linear-gradient(160deg, var(--mabel-700) 0%, var(--mabel-600) 60%, var(--mabel-800) 100%)',
          }}
        />
      )}
      {/* Mobile floating hamburger — solo cuando el sidebar esta cerrado en mobile.
          Desktop/tablet usan el toggle propio del sidebar; admin mantiene su header.
          `top: calc(12px + var(--safe-top))` posiciona el botón DEBAJO del notch,
          alineado con el área visible (sin el botón quedaría tapado por
          la mini-banda brand). */}
      {isMobile && !sidebarOpen && (
        <button
          onClick={toggleSidebar}
          aria-label="Abrir menu"
          title="Abrir menu"
          className="fixed left-3 z-30 p-2 rounded-lg shadow-sm transition-opacity hover:opacity-80"
          style={{
            top: 'calc(12px + var(--safe-top))',
            backgroundColor: '#fff',
            color: 'var(--ink-900)',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: 'var(--ink-200)',
          }}
        >
          <Menu className="w-5 h-5" />
        </button>
      )}
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
                onOpenCrisis={openCrisis}
              />
            </div>
          </>
        ) : (
          <StudentSidebarV3
            open={sidebarOpen}
            onToggle={toggleSidebar}
            onNewChat={handleNewChat}
            onOpenSettings={handleOpenSettings}
            onOpenCrisis={openCrisis}
          />
        )}
        <main className="flex-1 overflow-y-auto bg-bg-main relative flex flex-col">
          {/* SOS access moved from the floating bottom-right FAB into each
              page's top bar (see SosButton + useOutletContext below). The
              SosPanel modal stays here because it's overlay-level. */}
          <Outlet context={{ openCrisis, openSettings }} />
        </main>
      </div>
      <SosPanel
        open={crisisOpen}
        trigger="manual"
        sessionId={params.id}
        onClose={closeCrisis}
      />
      {/* Settings — global modal triggered by `openSettings` via Outlet
          context. Lives at the layout level so the underlying page (chat,
          home, …) stays mounted behind the backdrop. */}
      <Settings open={settingsOpen} onClose={closeSettings} initialTab={settingsTab} />
    </div>
  )
}
