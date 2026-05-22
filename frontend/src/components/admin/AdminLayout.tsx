import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import AdminHeader from './AdminHeader'
import AdminSidebar from './AdminSidebar'
import { useAdminStore } from '../../stores/adminStore'

export default function AdminLayout() {
  const startPolling = useAdminStore((s) => s.startPolling)
  const stopPolling = useAdminStore((s) => s.stopPolling)

  useEffect(() => {
    startPolling()
    return () => {
      stopPolling()
    }
  }, [startPolling, stopPolling])

  return (
    <div
      className="h-screen flex"
      style={{
        background: 'var(--ink-50)',
        fontFamily: 'var(--font-sans)',
        color: 'var(--ink-900)',
      }}
    >
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <AdminHeader />
        {/* `min-h-0` on this column AND on <main> is essential: in a flex
            column, an item with overflow-y-auto requires min-height:0 to
            actually clip its content. Without it the inner content expands
            its parent past h-screen, the document body becomes scrollable,
            and the sidebar appears to "slide up" past the viewport bottom
            when the user scrolls past the end of the main content. */}
        <main
          className="flex-1 min-h-0 overflow-y-auto"
          style={{ background: 'var(--ink-50)' }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
