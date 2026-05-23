/**
 * Catálogos compartidos del check-in inicial.
 *
 * Una única fuente de verdad para que el formulario (CheckIn.tsx),
 * el popover de contexto en el chat (CheckinContextPopover.tsx) y la
 * vista de sesión cerrada (SessionDetail.tsx) hablen el mismo idioma
 * (mismas etiquetas, mismos colores, mismos iconos).
 *
 * Convención: `value` es el string que se persiste en BD (sin tildes,
 * estable contra cambios de copy). `label` es la cadena visible para
 * el estudiante.
 */
import {
  BookOpen,
  Users,
  Heart,
  HeartPulse,
  Wallet,
  CircleEllipsis,
  HeartHandshake,
  Compass,
  Frown,
  Annoyed,
  Meh,
  Smile,
  Laugh,
  type LucideIcon,
} from 'lucide-react'

export interface FocusOption {
  value: string
  label: string
  icon: LucideIcon
  color: string
}

export const FOCUS_OPTIONS: FocusOption[] = [
  { value: 'Academico', label: 'Académico', icon: BookOpen, color: 'var(--info-600)' },
  { value: 'Social', label: 'Social', icon: Users, color: 'var(--mabel-600)' },
  { value: 'Familiar', label: 'Familiar', icon: Heart, color: 'var(--warn-600)' },
  { value: 'Pareja', label: 'Pareja', icon: HeartHandshake, color: 'var(--mabel-700)' },
  { value: 'Salud', label: 'Salud', icon: HeartPulse, color: 'var(--success-600)' },
  { value: 'Economico', label: 'Económico', icon: Wallet, color: 'var(--ink-700)' },
  { value: 'Futuro', label: 'Futuro', icon: Compass, color: 'var(--info-700)' },
  { value: 'Otro', label: 'Otro', icon: CircleEllipsis, color: 'var(--ink-500)' },
]

export const FOCUS_LABEL_MAP: Record<string, string> = FOCUS_OPTIONS.reduce(
  (acc, o) => ({ ...acc, [o.value]: o.label }),
  {},
)

export const FOCUS_COLOR_MAP: Record<string, string> = FOCUS_OPTIONS.reduce(
  (acc, o) => ({ ...acc, [o.value]: o.color }),
  {},
)

/**
 * Niveles de estado de ánimo. El backend persiste 0-10 (escala
 * antigua); el formulario expone 5 caritas. Mapeamos cada carita a
 * un punto de la escala 0-10 para no romper analytics existentes ni
 * el system prompt.
 *
 * Usamos iconos de Lucide (no emojis nativos) para que el render sea
 * tintable con la paleta UMB. Emojis nativos cambian por SO (Apple
 * brillantes 3D, Google planos, Windows otros) y rompen la coherencia
 * visual; iconos monocolor se ven idénticos y aceptan `--mabel-600`.
 *
 * Mantenemos `color` semántico (rojo→verde) solo para usos analíticos
 * en otros componentes (no para el render del formulario, donde el
 * único color es `--mabel-600` cuando está seleccionado).
 */
export interface MoodLevel {
  value: number // 0-10, lo que se persiste
  icon: LucideIcon
  label: string
  color: string // tono semántico para usos no-formulario
}

export const MOOD_LEVELS: MoodLevel[] = [
  { value: 0, icon: Frown, label: 'Muy mal', color: 'var(--danger-700)' },
  { value: 2, icon: Annoyed, label: 'Mal', color: 'rgb(194,65,12)' },
  { value: 5, icon: Meh, label: 'Neutral', color: 'var(--warn-700)' },
  { value: 8, icon: Smile, label: 'Bien', color: 'var(--success-600)' },
  { value: 10, icon: Laugh, label: 'Excelente', color: 'var(--success-700)' },
]

/**
 * Calidad de sueño percibida (reemplaza al input numérico crudo
 * según recomendación del agente research-analytics). SHAWQ y
 * literatura de sleep-mental-health muestran que la calidad
 * subjetiva predice mejor que las horas absolutas (Frontiers in
 * Sleep 2023; Tandfonline 2016). Las horas exactas se mantienen
 * como campo plegable opcional para quien quiera precisión.
 */
export interface SleepQualityLevel {
  value: 'mal' | 'regular' | 'bien' | 'muy_bien'
  label: string
}

export const SLEEP_QUALITY_LEVELS: SleepQualityLevel[] = [
  { value: 'mal', label: 'Mal' },
  { value: 'regular', label: 'Regular' },
  { value: 'bien', label: 'Bien' },
  { value: 'muy_bien', label: 'Muy bien' },
]

/**
 * Escala genérica de 4 puntos para los segmented sliders nuevos.
 * Cada uno tiene su par (label_low → label_high) y se persiste un
 * número entero 1-4 en BD. Mantenemos `value: number` para que
 * el system prompt en backend pueda interpretar fácilmente.
 */
export interface SegmentedLevel {
  value: 1 | 2 | 3 | 4
  label: string
}

/**
 * Estrés percibido (último día) — derivado del PSS-4 (Cohen),
 * validado en universitarios colombianos (medRxiv 2023). El ítem
 * se reformula al español-CO conversacional: "¿Qué tanto te has
 * sentido abrumada/o hoy?".
 */
export const STRESS_LEVELS: SegmentedLevel[] = [
  { value: 1, label: 'Nada' },
  { value: 2, label: 'Un poco' },
  { value: 3, label: 'Bastante' },
  { value: 4, label: 'Muchísimo' },
]

/**
 * Conexión / soledad — single-item adaptado del UCLA-3 / short
 * form (Hughes et al., 2004). Pregunta: "Hoy, ¿qué tan
 * acompañada/o te sientes?".
 */
export const LONELINESS_LEVELS: SegmentedLevel[] = [
  { value: 1, label: 'Muy sola/o' },
  { value: 2, label: 'Algo sola/o' },
  { value: 3, label: 'Acompañada/o' },
  { value: 4, label: 'Muy acompañada/o' },
]

/**
 * Energía / recursos para el día — proxy de anhedonia/fatiga del
 * PHQ-2 sin lenguaje clínico. Permite a Mabel distinguir "ánimo
 * bajo + energía OK" (más activa) de "ánimo bajo + sin batería"
 * (Mabel desacelera, normaliza descanso, evita "deberías").
 */
export const ENERGY_LEVELS: SegmentedLevel[] = [
  { value: 1, label: 'Sin batería' },
  { value: 2, label: 'Baja' },
  { value: 3, label: 'Suficiente' },
  { value: 4, label: 'Con todo' },
]

/**
 * Devuelve el MoodLevel más cercano al valor 0-10 persistido.
 * Útil para mostrar la carita correcta de check-ins antiguos hechos
 * con el slider 0-10.
 */
export function moodLevelFromValue(value: number | null | undefined): MoodLevel | null {
  if (value == null || Number.isNaN(value)) return null
  let best = MOOD_LEVELS[0]
  let bestDelta = Math.abs(value - best.value)
  for (const lvl of MOOD_LEVELS.slice(1)) {
    const d = Math.abs(value - lvl.value)
    if (d < bestDelta) {
      best = lvl
      bestDelta = d
    }
  }
  return best
}

/**
 * Normaliza `focus` que puede venir como string (formato legacy) o
 * array (formato actual) en una lista. Usar en componentes de display
 * para no tener que ramificar por tipo.
 */
export function normalizeFocus(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === 'string' && x.length > 0)
  }
  if (typeof raw === 'string' && raw.length > 0) {
    return [raw]
  }
  return []
}
