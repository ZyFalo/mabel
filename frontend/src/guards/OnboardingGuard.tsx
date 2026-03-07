import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { usePreferencesStore } from '../stores/preferencesStore'

export default function OnboardingGuard() {
  const { hasPreferences, loading, loadPreferences } = usePreferencesStore()
  const location = useLocation()

  useEffect(() => {
    loadPreferences()
  }, [loadPreferences])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!hasPreferences && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }

  return <Outlet />
}
