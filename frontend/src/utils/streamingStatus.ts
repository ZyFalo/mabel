/**
 * streamingStatusText — Mensaje progresivo según segundos transcurridos.
 *
 * Comunica al usuario lo que pasa mientras Mabel genera respuesta.
 *
 * MODO "antes del primer token" (hasFirstToken=false):
 *   0-3 s   → "Mabel está pensando…"               (warm normal)
 *   3-10 s  → "Mabel está pensando una respuesta cuidadosa…"
 *   10-25 s → "Mabel se está tomando su tiempo para entenderte mejor…"
 *   25-60 s → "Mabel está despertando del descanso (esto puede tardar
 *             ~1 minuto la primera vez)…"
 *   60+ s   → "Sigue procesando… el servidor de IA está cargando, dale
 *             unos segundos más."
 *
 * MODO "tokens fluyendo" (hasFirstToken=true):
 *   Cualquier elapsed → "Mabel está escribiendo…"
 *   Sin esta distinción, en cold start el elapsed acumulado durante
 *   el wait pre-tokens persiste cuando llegan tokens, y el indicador
 *   mostraría "despertando del descanso" mientras palabras aparecen
 *   en pantalla — contradicción visual (audit 2026-05-24).
 */
export function streamingStatusText(
  elapsedSeconds: number,
  hasFirstToken: boolean = false,
): string {
  if (hasFirstToken) return 'Mabel está escribiendo…'
  if (elapsedSeconds < 3) return 'Mabel está pensando…'
  if (elapsedSeconds < 10) return 'Mabel está pensando una respuesta cuidadosa…'
  if (elapsedSeconds < 25)
    return 'Mabel se está tomando su tiempo para entenderte mejor…'
  if (elapsedSeconds < 60)
    return 'Mabel está despertando del descanso (esto puede tardar ~1 minuto la primera vez)…'
  return 'Sigue procesando — el servidor de IA está cargando, dale unos segundos más.'
}
