import axios from 'axios'

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('mabel_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Session expired callback — set by App.tsx to show modal instead of hard redirect
let onSessionExpired: (() => void) | null = null
export function setOnSessionExpired(cb: () => void) {
  onSessionExpired = cb
}

// Rutas de auth donde un 401 significa "credenciales invalidas", NO
// "tu sesion expiro". Tratar estos 401 como sesion-expirada confundia
// a la usuaria: tipeaba contraseña mal y veia un modal diciendo
// "tu sesion vencio" — bug reportado 2026-05-23. Estas rutas se llaman
// SIN token previo (no hay sesion que expirar) asi que el 401 debe
// propagarse tal cual para que el form de login pinte el mensaje
// correcto ("Credenciales invalidas" / "Email o contraseña incorrectos").
const AUTH_PATHS_WITHOUT_TOKEN = [
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
]

function isAuthPathWithoutToken(url: string | undefined): boolean {
  if (!url) return false
  // Match con boundary: el path termina ahí (exact) o sigue con `/` o
  // `?`. Sin esta restricción, `/auth/login-mfa` o un futuro
  // `/auth/login/verify` (que SÍ requeriría token de pre-MFA y por
  // tanto un 401 ahí significaria "token expirado", no "credencial
  // mala") quedarían silenciados como pre-auth.
  return AUTH_PATHS_WITHOUT_TOKEN.some((p) => {
    const idx = url.indexOf(p)
    if (idx === -1) return false
    const after = url.charAt(idx + p.length)
    // Aceptamos: fin de string, query (?), o slash seguido de path
    // adicional QUE NO sea un sub-endpoint (e.g. /auth/reset-password/:token
    // sí es valido pre-auth). Para simplicidad: aceptamos `/:token` o
    // `/<algo>` que NO contenga otro segmento — match heurístico
    // específico al patrón actual del backend.
    if (after === '' || after === '?') return true
    if (p === '/auth/reset-password' && after === '/') return true
    return false
  })
}

// CR-06+07 (review 2026-05-25): flag de módulo para que un burst de
// 403s concurrentes (Home dispara 3-4 GETs en paralelo) NO encolen
// múltiples `window.location.href = ...`. El primer 403 marca el
// flag, el navigate se difiere al próximo tick para dejar que el
// callstack actual termine cleanup (SSE readers, drafts) antes de
// abandonar la página. Cualquier 403 posterior solo registra y deja
// que el navigate ya programado complete.
let consentRedirecting = false

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // No marcar sesion como expirada en endpoints pre-auth. Ahi un
      // 401 = credenciales malas, no token vencido.
      if (isAuthPathWithoutToken(error.config?.url)) {
        return Promise.reject(error)
      }
      // Preserve chat draft before clearing auth
      const chatInput = document.querySelector<HTMLTextAreaElement>('textarea[placeholder*="mensaje"]')
      if (chatInput?.value) {
        localStorage.setItem('mabel_draft', chatInput.value)
      }
      localStorage.removeItem('mabel_token')
      localStorage.removeItem('mabel_user')
      if (onSessionExpired) {
        onSessionExpired()
      } else {
        window.location.href = '/login'
      }
    } else if (error.response?.status === 403) {
      // Consent desactualizado: el backend (middleware/auth.py
      // `require_consent`) responde 403 con detail = {message,
      // consent_status} cuando el usuario tiene una version aceptada
      // distinta de la activa, o no tiene consent. Redirigir a
      // /consent-required para que re-acepte. NO limpiamos el token
      // (la sesion sigue valida, solo falta re-aceptar).
      // Otros 403 (role insuficiente "Acceso denegado", cuenta
      // deshabilitada — detail string en vez de objeto) se propagan
      // tal cual; el chequeo `typeof === 'object'` los descarta.
      const detail = error.response?.data?.detail
      const consentStatus =
        typeof detail === 'object' && detail !== null ? detail.consent_status : undefined
      if (
        consentStatus &&
        !consentRedirecting &&
        window.location.pathname !== '/consent-required'
      ) {
        consentRedirecting = true
        // setTimeout(_, 0): deja que el handler actual termine de
        // resolver/rechazar el Promise (lo que permite cleanup de
        // SSE readers en chat_service y guarda drafts) antes de
        // hard-navigate.
        setTimeout(() => {
          window.location.href = '/consent-required'
        }, 0)
        // CR-A4 (review 2026-05-26): timer de seguridad para resetear
        // el flag si la navegación nunca se completa (offline, page
        // freeze, navigation cancelada por el usuario). Sin esto, un
        // navigate fallido dejaría el flag en true para toda la vida
        // de la página y futuros 403 quedarían silenciados — el
        // usuario seguiría operando con consent stale sin ser
        // redirigido. 5s es suficiente para cualquier navigate real
        // y no enmascara cascadas legítimas (ya tenemos guard de
        // pathname para los casos donde sí se completó).
        setTimeout(() => {
          consentRedirecting = false
        }, 5000)
      }
    }
    return Promise.reject(error)
  }
)

export default apiClient
