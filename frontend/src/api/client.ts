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
  return AUTH_PATHS_WITHOUT_TOKEN.some((p) => url.includes(p))
}

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
    }
    return Promise.reject(error)
  }
)

export default apiClient
