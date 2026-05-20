import { useEffect, useState } from 'react'
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
        <p className="text-[12px]" style={{ color: 'var(--ink-400)' }}>
          Sin datos
        </p>
      )
    return (
      <div className="space-y-1">
        <p className="text-[12px] font-medium uppercase tracking-wider text-[var(--ink-400)]">
          {title}
        </p>
        <div
          className="rounded-lg p-3 space-y-1.5"
          style={{ backgroundColor: 'var(--ink-100)' }}
        >
          {Object.entries(obj).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 text-[12px]">
              <span className="text-[var(--ink-500)]">{k}</span>
              <span className="text-[var(--ink-900)] text-right break-all">
                {typeof v === 'object' ? JSON.stringify(v) : String(v ?? '-')}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-[#fff] border border-[var(--ink-200)] rounded-2xl shadow-lg max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto scale-in">
        <h2 className="text-[18px] font-display italic text-[var(--ink-900)] text-center mb-1">
          Mis datos personales
        </h2>
        <p className="text-[12px] text-[var(--ink-400)] text-center mb-5">
          Ley 1581 de 2012 — Derecho de acceso a datos personales
        </p>

        {loading ? (
          <div className="flex justify-center py-10">
            <div
              className="w-6 h-6 rounded-full animate-spin"
              style={{
                border: '2px solid var(--ink-200)',
                borderTopColor: 'var(--mabel-600)',
              }}
            />
          </div>
        ) : data ? (
          <div className="space-y-4 mb-5">
            {renderSection('Cuenta', data.account)}
            {renderSection('Consentimiento', data.consent)}
            {renderSection('Preferencias', data.preferences)}
            {renderSection('Estadisticas de uso', data.usage_stats as unknown as Record<string, unknown>)}
          </div>
        ) : null}

        <div className="flex gap-3 mb-3">
          <button
            onClick={downloadJson}
            disabled={!data}
            className="flex-1 px-5 py-2.5 bg-[var(--mabel-600)] text-white text-[13px] font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            Descargar JSON
          </button>
          <button
            onClick={downloadCsv}
            disabled={!data}
            className="flex-1 px-5 py-2.5 bg-[var(--mabel-600)] text-white text-[13px] font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            Descargar CSV
          </button>
        </div>
        <button
          onClick={onClose}
          className="w-full px-5 py-2.5 border border-[var(--ink-300)] text-[var(--ink-700)] text-[13px] font-medium rounded-lg hover:bg-[var(--ink-100)] transition-colors"
        >
          Cerrar
        </button>
      </div>
    </div>
  )
}
