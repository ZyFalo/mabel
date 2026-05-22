import { useState } from 'react'
import { Download } from 'lucide-react'
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
  variant = 'primary',
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
      onError?.('No se pudo exportar el CSV.')
    } finally {
      setLoading(false)
    }
  }

  const isPrimary = variant === 'primary'

  const baseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    borderRadius: 9999,
    fontSize: 12.5,
    fontWeight: 600,
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer',
    transition:
      'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',
    border: '1px solid transparent',
    opacity: disabled || loading ? 0.55 : 1,
  } as const

  const variantStyle: React.CSSProperties = isPrimary
    ? {
        background: 'var(--ink-900)',
        color: 'var(--white)',
        borderColor: 'var(--ink-900)',
      }
    : {
        background: 'var(--white)',
        color: 'var(--ink-700)',
        borderColor: 'var(--ink-200)',
      }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      style={{ ...baseStyle, ...variantStyle }}
      onMouseEnter={(e) => {
        if (disabled || loading) return
        if (isPrimary) {
          ;(e.currentTarget as HTMLElement).style.background = 'var(--ink-700)'
          ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--ink-700)'
        } else {
          ;(e.currentTarget as HTMLElement).style.background = 'var(--ink-50)'
          ;(e.currentTarget as HTMLElement).style.color = 'var(--mabel-700)'
        }
      }}
      onMouseLeave={(e) => {
        if (isPrimary) {
          ;(e.currentTarget as HTMLElement).style.background = 'var(--ink-900)'
          ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--ink-900)'
        } else {
          ;(e.currentTarget as HTMLElement).style.background = 'var(--white)'
          ;(e.currentTarget as HTMLElement).style.color = 'var(--ink-700)'
        }
      }}
    >
      <Download size={14} aria-hidden="true" />
      <span>{loading ? 'Exportando…' : label}</span>
    </button>
  )
}
