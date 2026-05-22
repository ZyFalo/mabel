import { useEffect, useState } from 'react'
import { Navigate, Outlet, useOutletContext } from 'react-router-dom'
import apiClient from '../api/client'

export default function ConsentGuard() {
  // Forward whatever context the parent layout passes (e.g. StudentLayout's
  // `openCrisis`) so deeper children can still consume it via
  // `useOutletContext`. Without this, the intermediate <Outlet /> drops it.
  const parentContext = useOutletContext()
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

  return <Outlet context={parentContext} />
}
