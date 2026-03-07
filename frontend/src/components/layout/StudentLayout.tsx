import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Header from './Header'
import Sidebar from './Sidebar'
import SosFab from '../ui/SosFab'

export default function StudentLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const stored = localStorage.getItem('mabel_sidebar')
    return stored !== 'collapsed'
  })

  function toggleSidebar() {
    setSidebarOpen((prev) => {
      const next = !prev
      localStorage.setItem('mabel_sidebar', next ? 'expanded' : 'collapsed')
      return next
    })
  }

  return (
    <div className="h-screen flex flex-col">
      <Header onToggleSidebar={toggleSidebar} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar open={sidebarOpen} />
        <main className="flex-1 overflow-y-auto bg-bg-main relative">
          <Outlet />
          <SosFab />
        </main>
      </div>
    </div>
  )
}
