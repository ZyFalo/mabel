import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Header from '../layout/Header'
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
    <div className="h-screen flex flex-col">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <AdminSidebar />
        <main className="flex-1 overflow-y-auto bg-bg-main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
