import { useState } from 'react'
import { useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import SosButton from '../components/ui/SosButton'
import type { StudentOutletContext } from '../types/studentOutlet'
import apiClient from '../api/client'
import { useToastStore } from '../stores/toastStore'

const FOCUS_CATEGORIES = ['Academico', 'Social', 'Familiar', 'Salud', 'Economico', 'Otro']

const MOOD_LABELS = ['Muy mal', '', '', '', '', 'Neutral', '', '', '', '', 'Excelente']

export default function CheckIn() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { openCrisis } = useOutletContext<StudentOutletContext>()
  const addToast = useToastStore((s) => s.addToast)
  // Forward the pendingMessage (if any) so Chat.tsx can send it as the
  // user's first message after the check-in is recorded.
  const forwardState = (location.state as { pendingMessage?: string } | null)
    ?.pendingMessage
    ? { pendingMessage: (location.state as { pendingMessage: string }).pendingMessage }
    : undefined

  const [mood, setMood] = useState<number | null>(null)
  const [sleep, setSleep] = useState('')
  const [focus, setFocus] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (mood === null) return
    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = { mood }
      if (sleep !== '') payload.sleep = parseFloat(sleep)
      if (focus) payload.focus = focus
      if (note.trim()) payload.note = note.trim()

      await apiClient.patch(`/sessions/${id}`, { checkin_payload: payload })
      navigate(`/session/${id}/chat`, { state: forwardState })
    } catch {
      addToast({ type: 'error', message: 'Error al guardar check-in' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-md mx-auto py-8 px-4">
      <SosButton variant="floating" onClick={openCrisis} />
      <h1 className="text-xl font-bold text-text-primary mb-1">¿Cómo te sientes hoy?</h1>
      <p className="text-sm text-text-primary/60 mb-6">
        Un breve check-in antes de comenzar. Es completamente opcional.
      </p>

      {/* Mood slider */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-text-primary mb-2">
          Estado de animo <span className="text-danger">*</span>
        </label>
        <input
          type="range"
          min={0}
          max={10}
          value={mood ?? 5}
          onChange={(e) => setMood(parseInt(e.target.value))}
          className="w-full accent-primary"
        />
        <div className="flex justify-between text-xs text-text-primary/40 mt-1">
          <span>{MOOD_LABELS[0]}</span>
          <span>{mood !== null ? mood : '-'}</span>
          <span>{MOOD_LABELS[10]}</span>
        </div>
      </div>

      {/* Sleep */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-text-primary mb-2">
          Horas de sueno (opcional)
        </label>
        <input
          type="number"
          min={0}
          max={24}
          step={0.5}
          value={sleep}
          onChange={(e) => setSleep(e.target.value)}
          placeholder="Ej: 7"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Focus categories */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-text-primary mb-2">
          Foco de preocupacion (opcional)
        </label>
        <div className="flex flex-wrap gap-2">
          {FOCUS_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setFocus(focus === cat ? null : cat)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                focus === cat
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-text-primary/60 border-gray-300 hover:border-primary/30'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-text-primary mb-2">
          Notas adicionales (opcional)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 500))}
          maxLength={500}
          rows={3}
          placeholder="Algo que quieras compartir..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <p className="text-xs text-text-primary/40 text-right mt-1">{note.length}/500</p>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleSubmit}
          disabled={mood === null || submitting}
          className="flex-1 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Guardando...' : 'Continuar'}
        </button>
        <button
          onClick={() => navigate(`/session/${id}/chat`, { state: forwardState })}
          className="px-4 py-2.5 text-sm text-text-primary/60 hover:text-text-primary transition-colors"
        >
          Omitir
        </button>
      </div>
    </div>
  )
}
