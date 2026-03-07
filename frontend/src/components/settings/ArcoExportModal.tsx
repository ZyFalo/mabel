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
    if (!obj) return <p className="text-xs text-text-primary/40">Sin datos</p>
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-text-primary/70">{title}</p>
        {Object.entries(obj).map(([k, v]) => (
          <div key={k} className="flex justify-between text-xs">
            <span className="text-text-primary/50">{k}</span>
            <span className="text-text-primary">{typeof v === 'object' ? JSON.stringify(v) : String(v ?? '-')}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6 max-h-[80vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-text-primary text-center mb-2">Mis datos personales</h2>
        <p className="text-xs text-text-primary/50 text-center mb-5">
          Ley 1581 de 2012 — Derecho de acceso a datos personales
        </p>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
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
            className="flex-1 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-40"
          >
            Descargar JSON
          </button>
          <button
            onClick={downloadCsv}
            disabled={!data}
            className="flex-1 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-40"
          >
            Descargar CSV
          </button>
        </div>
        <button
          onClick={onClose}
          className="w-full py-2.5 border border-gray-200 text-sm font-medium rounded-lg text-text-primary hover:bg-gray-50 transition-colors"
        >
          Cerrar
        </button>
      </div>
    </div>
  )
}
