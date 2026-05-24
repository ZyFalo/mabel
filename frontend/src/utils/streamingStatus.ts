/**
 * streamingStatusText — Mensaje progresivo según segundos transcurridos.
 *
 * Comunica al usuario lo que pasa mientras Mabel genera respuesta:
 *
 *   0-3 s   → "Mabel está pensando…"           (warm normal)
 *   3-10 s  → "Mabel está pensando una respuesta cuidadosa…"
 *   10-25 s → "Mabel se está tomando su tiempo para entenderte mejor…"
 *   25-60 s → "Mabel está despertando del descanso (esto puede tardar
 *             ~1 minuto la primera vez)…"
 *   60+ s   → "Sigue procesando… el servidor de IA está cargando, dale
 *             unos segundos más."
 *
 * El usuario ve que algo cambia → entiende que el sistema está vivo,
 * no congelado.
 */
export function streamingStatusText(elapsedSeconds: number): string {
  if (elapsedSeconds < 3) return 'Mabel está pensando…'
  if (elapsedSeconds < 10) return 'Mabel está pensando una respuesta cuidadosa…'
  if (elapsedSeconds < 25)
    return 'Mabel se está tomando su tiempo para entenderte mejor…'
  if (elapsedSeconds < 60)
    return 'Mabel está despertando del descanso (esto puede tardar ~1 minuto la primera vez)…'
  return 'Sigue procesando — el servidor de IA está cargando, dale unos segundos más.'
}
