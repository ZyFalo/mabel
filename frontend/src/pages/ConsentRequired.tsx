import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FileText, Hand, Lock } from 'lucide-react'
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
    apiClient
      .get('/users/me/consent-status')
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
      <div className="min-h-screen w-full bg-[var(--bg)] flex items-center justify-center">
        <div
          className="w-8 h-8 rounded-full animate-spin"
          style={{
            border: '4px solid var(--border)',
            borderTopColor: 'var(--accent)',
          }}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full bg-[var(--bg)] flex items-center justify-center px-4 py-12 fade-in">
      <div className="w-full max-w-2xl bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl shadow-sm px-6 py-8 md:px-10 md:py-10 scale-in text-center">
        {/* Variant A — No consent */}
        {data?.status === 'no_consent' && (
          <>
            <div className="flex justify-center mb-5">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'var(--bg-hover)' }}
              >
                <Hand size={28} style={{ color: 'var(--accent)' }} />
              </div>
            </div>
            <h1 className="text-[24px] font-display italic text-[var(--text-strong)] mb-3">
              Bienvenido a Mabel IA
            </h1>
            <p className="text-[14px] text-[var(--text-muted)] mb-8 leading-relaxed">
              Para continuar, necesitas revisar y aceptar el consentimiento informado.
            </p>
            <Link
              to="/consent"
              className="inline-block px-5 py-2.5 bg-[var(--accent)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              Ir al consentimiento
            </Link>
          </>
        )}

        {/* Variant B — Revoked */}
        {data?.status === 'revoked' && (
          <>
            <div className="flex justify-center mb-5">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'var(--bg-hover)' }}
              >
                <Lock size={28} style={{ color: 'var(--warning)' }} />
              </div>
            </div>
            <h1 className="text-[24px] font-display italic text-[var(--text-strong)] mb-3">
              Consentimiento revocado
            </h1>
            <p className="text-[14px] text-[var(--text-muted)] mb-3 leading-relaxed">
              Tu consentimiento ha sido revocado y el acceso esta temporalmente bloqueado.
            </p>
            <p className="text-[14px] text-[var(--text-muted)] mb-8 leading-relaxed">
              Puedes re-aceptar el consentimiento en cualquier momento para recuperar el acceso.
            </p>
            <div className="flex flex-col gap-3">
              <Link
                to="/consent"
                className="w-full px-5 py-2.5 bg-[var(--accent)] text-white rounded-lg font-medium text-center hover:opacity-90 transition-opacity"
              >
                Re-aceptar consentimiento
              </Link>
              <button
                onClick={handleLogout}
                className="w-full px-5 py-2.5 border border-[var(--border-strong)] text-[var(--text)] rounded-lg font-medium hover:bg-[var(--bg-hover)] transition-colors"
              >
                Cerrar sesion
              </button>
            </div>
          </>
        )}

        {/* Variant C — New version required */}
        {data?.status === 'new_version_required' && (
          <>
            <div className="flex justify-center mb-5">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'var(--bg-hover)' }}
              >
                <FileText size={28} style={{ color: 'var(--accent)' }} />
              </div>
            </div>
            <h1 className="text-[24px] font-display italic text-[var(--text-strong)] mb-3">
              Nueva version del consentimiento
            </h1>
            <p className="text-[14px] text-[var(--text-muted)] mb-3 leading-relaxed">
              Hay una nueva version del consentimiento informado que debes aceptar para continuar.
            </p>
            {data.new_version && (
              <p className="text-[13px] text-[var(--text-muted)] mb-8">
                Nueva version:{' '}
                <span className="font-medium" style={{ color: 'var(--accent)' }}>
                  {data.new_version}
                </span>
              </p>
            )}
            <div className="flex flex-col gap-3">
              <Link
                to="/consent"
                className="w-full px-5 py-2.5 bg-[var(--accent)] text-white rounded-lg font-medium text-center hover:opacity-90 transition-opacity"
              >
                Revisar nueva version
              </Link>
              <button
                onClick={handleLogout}
                className="w-full px-5 py-2.5 border border-[var(--border-strong)] text-[var(--text)] rounded-lg font-medium hover:bg-[var(--bg-hover)] transition-colors"
              >
                Cerrar sesion
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
