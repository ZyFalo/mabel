import { useEffect, useState } from 'react'

/**
 * Banner persistente que aparece cuando el navegador detecta pérdida
 * de conexión (`navigator.onLine === false` o eventos `offline`).
 *
 * Visible mientras el usuario está offline; se oculta automáticamente
 * al reconectar. Útil en modo PWA instalada donde el usuario abre la
 * app sin red — el SW sirve el shell desde cache y este banner explica
 * qué se puede y qué no:
 *
 *   - SÍ: navegar el sidebar, revisar historial visitado previamente
 *     (cache NetworkFirst de `/api/v1/sessions`), abrir Settings.
 *   - NO: enviar mensajes nuevos al chat (SSE no cacheable), grabar
 *     voz nueva, hacer login/registro.
 *
 * Se monta en el root layout (App.tsx) para cubrir todas las rutas
 * autenticadas. No interfiere con el SOS FAB (z-index inferior).
 */
export default function OfflineBanner() {
  const [offline, setOffline] = useState<boolean>(() => {
    if (typeof navigator === 'undefined') return false
    return !navigator.onLine
  })

  useEffect(() => {
    function onOnline() {
      setOffline(false)
    }
    function onOffline() {
      setOffline(true)
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  if (!offline) return null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: 'var(--warn-600, #D97706)',
        color: '#FFFFFF',
        padding: '8px 16px',
        textAlign: 'center',
        fontSize: 13,
        fontWeight: 600,
        fontFamily: 'var(--font-sans)',
        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
      }}
    >
      Sin conexión — puedes revisar tu historial. Para hablar con Mabel
      necesitas reconectarte.
    </div>
  )
}
