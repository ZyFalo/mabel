import { useEffect, useState } from 'react'

/**
 * Detecta si la app corre en modo PWA standalone (instalada en el
 * dispositivo) vs como pestaña normal del navegador.
 *
 * Combina dos APIs porque ningún navegador soporta ambas:
 * - `matchMedia('(display-mode: standalone)')` → Chrome / Edge / Firefox
 *   y Safari moderno (iOS 16.4+).
 * - `navigator.standalone` → iOS Safari legacy (versión propia de Apple,
 *   no estándar, pero la única señal disponible antes de iOS 16.4).
 *
 * Usado por:
 * - `Login.tsx` → forzar `remember_me=true` cuando es PWA (F4: JWT
 *   de 7 días en lugar de 24 h, mejor UX de "no me deslogues al
 *   cerrar").
 * - `OfflineBanner.tsx` (futuro) → ajustar el copy según contexto.
 */
export function useIsPWA(): boolean {
  // Evaluación síncrona en SSR-safe (frontend es CSR, pero por hábito):
  // el matchMedia inicial devuelve correctamente en mount.
  const [isPWA, setIsPWA] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return detectPWA()
  })

  useEffect(() => {
    // Si el usuario instala la app durante la sesión actual (raro pero
    // posible: muchos browsers muestran banner "Instalar" sin recargar),
    // el media query cambia. Subscribirse para reaccionar.
    const mql = window.matchMedia('(display-mode: standalone)')
    function handler() {
      // CR-A5 (review 2026-05-26): leer mql.matches directo en vez
      // de re-invocar detectPWA() que vuelve a llamar matchMedia(),
      // ahorra una query duplicada. Para iOS legacy (navigator.standalone),
      // el evento change del MQ no dispara — pero ese caso no necesita
      // reactividad porque iOS legacy nunca permite "instalar" sin
      // navigate completo (siempre reload tras add-to-home-screen).
      const nav = window.navigator as Navigator & { standalone?: boolean }
      setIsPWA(mql.matches || nav.standalone === true)
    }
    // Safari < 14 usa addListener legacy. Cast via `unknown` para que
    // TypeScript no se queje de la API obsoleta.
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler)
      return () => mql.removeEventListener('change', handler)
    }
    const legacy = mql as unknown as {
      addListener?: (cb: () => void) => void
      removeListener?: (cb: () => void) => void
    }
    if (typeof legacy.addListener === 'function') {
      legacy.addListener(handler)
      return () => legacy.removeListener?.(handler)
    }
    // No-op cleanup explícito para satisfacer reglas de hooks (todas
    // las ramas del effect devuelven function o undefined consistente).
    return undefined
  }, [])

  return isPWA
}

function detectPWA(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  // iOS Safari legacy.
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true
}
