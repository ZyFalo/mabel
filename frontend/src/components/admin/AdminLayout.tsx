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
      <div className="flex-1 flex flex-col min-w-0">
        <AdminHeader />
        <main
          className="flex-1 overflow-y-auto"
          style={{ background: 'var(--ink-50)' }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
