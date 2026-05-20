import { useEffect, useState } from 'react'
import { X, Download } from 'lucide-react'
import apiClient from '../../api/client'
import { useToastStore } from '../../stores/toastStore'

interface ArcoExportModalProps {
  open: boolean
  onClose: () => void
}

interface ExportData {
  account: Record<string, unknown>
  consent: Record<string, unknown> | null
  preferences: Record<string, unknown> | null
  usage_stats: { total_sessions: number; total_messages: number; total_reports: number }
}

export default function ArcoExportModal({ open, onClose }: ArcoExportModalProps) {
  const addToast = useToastStore((s) => s.addToast)
  const [data, setData] = useState<ExportData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    apiClient
      .get('/users/me/export', { params: { format: 'json' } })
      .then((res) => setData(res.data))
      .catch(() => addToast({ type: 'error', message: 'Error al cargar datos' }))
      .finally(() => setLoading(false))
  }, [open, addToast])

  if (!open) return null

  function downloadJson() {
    if (!data) return
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'mabel-datos.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function downloadCsv() {
    try {
      const res = await apiClient.get('/users/me/export', {
        params: { format: 'csv' },
        responseType: 'blob',
      })
      const blob = new Blob([res.data], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'mabel-datos.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      addToast({ type: 'error', message: 'Error al descargar CSV' })
    }
  }

  function renderSection(title: string, obj: Record<string, unknown> | null) {
    if (!obj)
      return (
        <p style={{ fontSize: 12, color: 'var(--ink-400)' }}>Sin datos</p>
      )
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--ink-400)',
            margin: 0,
          }}
        >
          {title}
        </p>
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: 'var(--ink-50)',
            border: '1px solid var(--ink-100)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {Object.entries(obj).map(([k, v]) => (
            <div
              key={k}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                fontSize: 12,
              }}
            >
              <span style={{ color: 'var(--ink-500)' }}>{k}</span>
              <span style={{ color: 'var(--ink-900)', textAlign: 'right', wordBreak: 'break-all' }}>
                {typeof v === 'object' ? JSON.stringify(v) : String(v ?? '-')}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      className="fade-in"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(26,17,16,0.32)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{ position: 'absolute', inset: 0 }} onClick={onClose} aria-hidden />
      <div
        className="scale-in"
        style={{
          position: 'relative',
          background: '#fff',
          border: '1px solid var(--ink-200)',
          borderRadius: 18,
          boxShadow: 'var(--shadow-xl)',
          width: 'min(100%, 560px)',
          maxHeight: '90vh',
          overflow: 'auto',
          padding: '24px 26px',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Cerrar"
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'transparent',
            border: 'none',
            color: 'var(--ink-500)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ink-100)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <X size={16} />
        </button>

        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--ink-900)',
            margin: '0 0 4px',
            textAlign: 'center',
            fontFamily: 'var(--font-sans)',
            letterSpacing: '-0.015em',
          }}
        >
          Mis datos personales
        </h2>
        <p
          style={{
            fontSize: 12,
            color: 'var(--ink-400)',
            textAlign: 'center',
            margin: '0 0 20px',
          }}
        >
          Ley 1581 de 2012 - Derecho de acceso a datos personales
        </p>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 36 }}>
            <div
              className="animate-spin"
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                border: '3px solid var(--ink-200)',
                borderTopColor: 'var(--mabel-600)',
              }}
            />
          </div>
        ) : data ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
            {renderSection('Cuenta', data.account)}
            {renderSection('Consentimiento', data.consent)}
            {renderSection('Preferencias', data.preferences)}
            {renderSection('Estadisticas de uso', data.usage_stats as unknown as Record<string, unknown>)}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <button
            onClick={downloadJson}
            disabled={!data}
            style={{
              flex: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '11px 18px',
              background: !data ? 'var(--ink-200)' : 'var(--mabel-600)',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: 13.5,
              fontWeight: 600,
              cursor: !data ? 'not-allowed' : 'pointer',
              opacity: !data ? 0.6 : 1,
              fontFamily: 'var(--font-sans)',
              boxShadow: !data ? 'none' : 'var(--shadow-sm)',
            }}
          >
            <Download size={14} />
            Descargar JSON
          </button>
          <button
            onClick={downloadCsv}
            disabled={!data}
            style={{
              flex: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '11px 18px',
              background: !data ? 'var(--ink-200)' : 'var(--mabel-600)',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: 13.5,
              fontWeight: 600,
              cursor: !data ? 'not-allowed' : 'pointer',
              opacity: !data ? 0.6 : 1,
              fontFamily: 'var(--font-sans)',
              boxShadow: !data ? 'none' : 'var(--shadow-sm)',
            }}
          >
            <Download size={14} />
            Descargar CSV
          </button>
        </div>
        <button
          onClick={onClose}
          style={{
            width: '100%',
            padding: '11px',
            background: 'transparent',
            color: 'var(--ink-700)',
            border: '1px solid var(--ink-300)',
            borderRadius: 10,
            fontSize: 13.5,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ink-100)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          Cerrar
        </button>
      </div>
    </div>
  )
}
