/**
 * Mabel-IA severity rubric (1-5).
 *
 * Single source of truth for severity labels and operational definitions
 * used across the admin panel (filters, threshold slider, dashboards) and
 * the student-facing report modal. Keep these strings centralized so the
 * scale stays consistent everywhere a number is shown to a human.
 *
 * Two contexts share this scale:
 *
 * 1. `safety_events.severity` — auto-calculated by guardrails:
 *      5 = any critical keyword match (suicidal ideation, self-harm)
 *      1-4 = accumulation of non-critical keyword matches, capped at 4
 *
 * 2. `message_reports.severity` — chosen by the student when reporting
 *    a message. Optional. The rubric below guides their choice.
 */

export type SeverityLevel = 1 | 2 | 3 | 4 | 5

export const SEVERITY_LABELS: Record<SeverityLevel, string> = {
  1: 'Leve',
  2: 'Baja',
  3: 'Media',
  4: 'Alta',
  5: 'Crítica',
}

export const SEVERITY_DESCRIPTIONS: Record<SeverityLevel, string> = {
  1: 'Señal aislada, no urgente.',
  2: 'Malestar acumulándose o incomodidad menor.',
  3: 'Atención requerida. Múltiples indicadores de estrés.',
  4: 'Acción correctiva pronto. Saturación de señales o contenido problemático.',
  5: 'Intervención inmediata. Ideación de daño explícita. Activa el panel SOS automáticamente.',
}

/** "N — Etiqueta" for compact lists (filters, slider markers). */
export function severityShort(n: SeverityLevel): string {
  return `${n} — ${SEVERITY_LABELS[n].toLowerCase()}`
}

/** "N — Etiqueta. Descripción operativa." for tooltips and accessible labels. */
export function severityLong(n: SeverityLevel): string {
  return `${n} — ${SEVERITY_LABELS[n]}. ${SEVERITY_DESCRIPTIONS[n]}`
}
