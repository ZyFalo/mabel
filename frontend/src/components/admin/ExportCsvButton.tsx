import { useState } from 'react'
import apiClient from '../../api/client'

interface ExportCsvButtonProps {
  url: string
  params?: Record<string, string | number | boolean | undefined>
  filename?: string
  label?: string
  variant?: 'primary' | 'secondary'
  disabled?: boolean
  onError?: (message: string) => void
}

function deriveFilename(url: string): string {
  // Strip query/extension, take last segment
  const cleanPath = url.split('?')[0].replace(/\.csv$/i, '')
  const segments = cleanPath.split('/').filter(Boolean)
  const last = segments[segments.length - 1] || 'export'
  const date = new Date().toISOString().slice(0, 10)
  return `${last}-${date}.csv`
}

function sanitizeParams(
  params?: Record<string, string | number | boolean | undefined>,
): Record<string, string | number | boolean> | undefined {
  if (!params) return undefined
  const out: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      out[k] = v
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export default function ExportCsvButton({
  url,
  params,
  filename,
  label = 'Exportar CSV',
  variant = 'secondary',
  disabled,
  onError,
}: ExportCsvButtonProps) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      const res = await apiClient.get(url, {
        params: sanitizeParams(params),
        responseType: 'blob',
      })
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' })
      const blobUrl = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = blobUrl
      anchor.download = filename || deriveFilename(url)
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      window.URL.revokeObjectURL(blobUrl)
    } catch {
      onError?.('No se pudo exportar el CSV')
    } finally {
      setLoading(false)
    }
  }

  const classes =
    variant === 'primary'
      ? 'bg-primary text-white hover:bg-primary/90'
      : 'bg-white border border-gray-300 text-text-primary hover:bg-gray-50'

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      className={[
        'inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        classes,
      ].join(' ')}
    >
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M8 2v8m0 0L4.5 6.5M8 10l3.5-3.5M3 13h10"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {loading ? 'Exportando...' : label}
    </button>
  )
}
