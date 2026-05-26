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
 * autenticadas. Z-index 30: queda DEBAJO de SosButton (35) y de
 * SosPanel modal (50) — si hay crisis activa, el panel SOS prima
 * sobre la notificación de conectividad.
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
        zIndex: 30,
        background: 'var(--warn-600, #D97706)',
        color: '#FFFFFF',
        // CR-A2 (review 2026-05-26): respetar safe-area-inset para que
        // en PWA standalone con notch (iPhone 13 Pro+), el texto no
        // quede oculto detrás del Dynamic Island. El fondo naranja se
        // extiende hasta el borde superior, el padding empuja el texto
        // debajo del notch. Tokens `--safe-*` definidos en index.css
        // (CR-A10 review 2026-05-26).
        paddingTop: 'calc(8px + var(--safe-top))',
        paddingBottom: 8,
        paddingLeft: 'max(16px, var(--safe-left))',
        paddingRight: 'max(16px, var(--safe-right))',
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
