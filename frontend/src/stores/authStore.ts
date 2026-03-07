import { create } from 'zustand'

interface User {
  id: string
  email: string
  display_name: string | null
  role: 'student' | 'admin'
}

interface AuthState {
  token: string | null
  user: User | null
  isAuthenticated: boolean
  login: (token: string, user: User) => void
  logout: () => void
  initialize: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,

  login: (token, user) => {
    localStorage.setItem('mabel_token', token)
    localStorage.setItem('mabel_user', JSON.stringify(user))
    set({ token, user, isAuthenticated: true })
  },

  logout: () => {
    localStorage.removeItem('mabel_token')
    localStorage.removeItem('mabel_user')
    set({ token: null, user: null, isAuthenticated: false })
  },

  initialize: () => {
    const token = localStorage.getItem('mabel_token')
    const userStr = localStorage.getItem('mabel_user')
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr)
        set({ token, user, isAuthenticated: true })
      } catch {
        localStorage.removeItem('mabel_token')
        localStorage.removeItem('mabel_user')
      }
    }
  },
}))
