import { useEffect, useState } from 'react'
import apiClient from '../../api/client'

interface HotlineEntry {
  name: string
  number: string
}

interface SosPanelProps {
  open: boolean
  trigger: 'manual' | 'auto'
  sessionId?: string
  onClose: () => void
}

const FALLBACK_NUMBERS: HotlineEntry[] = [
  { name: 'Linea 106 ICBF', number: '018000112440' },
  { name: 'Linea 141 Linea de la Vida', number: '018000113113' },
]

export default function SosPanel({ open, trigger, sessionId, onClose }: SosPanelProps) {
  const [numbers, setNumbers] = useState<HotlineEntry[]>(FALLBACK_NUMBERS)
  const [registered, setRegistered] = useState(false)

  useEffect(() => {
    if (!open) return
    apiClient
      .get('/system-config/sos')
      .then((res) => {
        if (res.data.hotline_numbers?.length) {
          setNumbers(res.data.hotline_numbers)
        }
      })
      .catch(() => {})

    // Register redirect_shown event
    if (!registered) {
      apiClient
        .post('/safety-events', {
          event_type: 'redirect_shown',
          payload: {
            trigger,
            lines_shown: numbers.map((n) => n.name),
          },
          session_id: sessionId || null,
        })
        .catch(() => {})
      setRegistered(true)
    }
  }, [open, trigger, sessionId, registered, numbers])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-primary/40 hover:text-text-primary text-xl"
        >
          &times;
        </button>

        {/* Header */}
        <div className="text-center mb-5">
          <span className="text-4xl block mb-3">{'\u2764\uFE0F'}</span>
          <h2 className="text-xl font-bold text-text-primary">Estamos aqui para ayudarte</h2>
          <p className="text-sm text-text-primary/60 mt-2">
            Si estas pasando por un momento dificil, no estas solo. Hay personas capacitadas
            que pueden escucharte y orientarte ahora mismo.
          </p>
        </div>

        {/* Hotline numbers */}
        <div className="flex flex-col gap-2 mb-5">
          {numbers.map((line) => (
            <a
              key={line.number}
              href={`tel:${line.number}`}
              className="flex items-center gap-3 px-4 py-3 bg-danger/5 border border-danger/20 rounded-xl hover:bg-danger/10 transition-colors"
            >
              <svg className="w-5 h-5 text-danger shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-medium text-text-primary">{line.name}</p>
                <p className="text-xs text-text-primary/50">{line.number}</p>
              </div>
            </a>
          ))}
        </div>

        {/* External resources */}
        <p className="text-xs text-text-primary/40 text-center mb-4">
          Tambien puedes acudir al servicio de Bienestar Universitario de la UMB.
        </p>

        {/* Back button */}
        <button
          onClick={onClose}
          className="w-full py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          Volver al chat
        </button>
      </div>
    </div>
  )
}
