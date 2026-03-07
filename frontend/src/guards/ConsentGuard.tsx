import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import apiClient from '../api/client'

export default function ConsentGuard() {
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiClient
      .get('/users/me/consent-status')
      .then((res) => setStatus(res.data.status))
      .catch(() => setStatus('error'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (status !== 'ok') {
    return <Navigate to="/consent-required" replace />
  }

  return <Outlet />
}
