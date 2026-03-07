import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import apiClient from '../api/client'
import { useAuthStore } from '../stores/authStore'

interface StatusData {
  status: string
  current_version?: string
  new_version?: string
}

export default function ConsentRequired() {
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)
  const [data, setData] = useState<StatusData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiClient.get('/users/me/consent-status')
      .then((res) => {
        if (res.data.status === 'ok') navigate('/home', { replace: true })
        else setData(res.data)
      })
      .catch(() => setData({ status: 'no_consent' }))
      .finally(() => setLoading(false))
  }, [navigate])

  function handleLogout() {
    logout()
    navigate('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg-main flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        {/* Variant A — No consent */}
        {data?.status === 'no_consent' && (
          <>
            <div className="text-5xl mb-6">&#128075;</div>
            <h1 className="text-2xl font-bold text-text-primary mb-4">Bienvenido a Mabel IA</h1>
            <p className="text-text-primary/60 mb-8">
              Para continuar, necesitas revisar y aceptar el consentimiento informado.
            </p>
            <Link
              to="/consent"
              className="inline-block px-6 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              Ir al consentimiento
            </Link>
          </>
        )}

        {/* Variant B — Revoked */}
        {data?.status === 'revoked' && (
          <>
            <div className="text-5xl mb-6">&#128274;</div>
            <h1 className="text-2xl font-bold text-text-primary mb-4">Consentimiento revocado</h1>
            <p className="text-text-primary/60 mb-4">
              Tu consentimiento ha sido revocado y el acceso esta temporalmente bloqueado.
            </p>
            <p className="text-text-primary/60 mb-8">
              Puedes re-aceptar el consentimiento en cualquier momento para recuperar el acceso.
            </p>
            <div className="flex flex-col gap-3">
              <Link
                to="/consent"
                className="px-6 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors"
              >
                Re-aceptar consentimiento
              </Link>
              <button onClick={handleLogout} className="px-6 py-3 text-text-primary/60 hover:text-text-primary transition-colors">
                Cerrar sesion
              </button>
            </div>
          </>
        )}

        {/* Variant C — New version required */}
        {data?.status === 'new_version_required' && (
          <>
            <div className="text-5xl mb-6">&#128196;</div>
            <h1 className="text-2xl font-bold text-text-primary mb-4">Nueva version del consentimiento</h1>
            <p className="text-text-primary/60 mb-4">
              Hay una nueva version del consentimiento informado que debes aceptar para continuar.
            </p>
            {data.new_version && (
              <p className="text-sm text-text-primary/50 mb-8">
                Nueva version: <span className="font-medium text-primary">{data.new_version}</span>
              </p>
            )}
            <div className="flex flex-col gap-3">
              <Link
                to="/consent"
                className="px-6 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors"
              >
                Revisar nueva version
              </Link>
              <button onClick={handleLogout} className="px-6 py-3 text-text-primary/60 hover:text-text-primary transition-colors">
                Cerrar sesion
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
