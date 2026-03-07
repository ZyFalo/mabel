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

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
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
