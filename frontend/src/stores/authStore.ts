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

interface SnapshotFromStorage {
  token: string | null
  user: User | null
  isAuthenticated: boolean
}

/**
 * Type-narrow an unknown value into a `User` if it matches the expected
 * shape. We don't trust localStorage blindly: a previous build with a
 * different schema, a browser extension, or an aborted migration can
 * leave a parseable-but-malformed payload (`'{}'`, `'{"id":null}'`).
 * Accepting it would give us `isAuthenticated:true` with a broken user —
 * the app then crashes on the first call that reads `user.role` or
 * `user.id`, leaving the student in a half-logged-in state with no clear
 * recovery.
 */
function isValidUser(value: unknown): value is User {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (typeof v.id !== 'string' || v.id.length === 0) return false
  if (typeof v.email !== 'string' || v.email.length === 0) return false
  if (v.role !== 'student' && v.role !== 'admin') return false
  // display_name is nullable in the type, so we allow null or string
  if (v.display_name != null && typeof v.display_name !== 'string') return false
  return true
}

/**
 * Read auth state from localStorage synchronously. Critical that this runs
 * during the Zustand factory (before the first React render) — otherwise
 * `isAuthenticated` is briefly false on reload, ProtectedRoute redirects
 * to /login, then once initialize() hydrates auth, PublicRoute on /login
 * bounces the user to /home. Net effect: every reload of a protected
 * page is silently redirected to /home.
 */
function readSnapshotFromStorage(): SnapshotFromStorage {
  if (typeof window === 'undefined') {
    return { token: null, user: null, isAuthenticated: false }
  }
  // Defensive: localStorage access can throw in some test/sandbox envs
  // (Safari ITP, disabled storage, polyfill gaps). Wrap the whole thing.
  let token: string | null
  let userStr: string | null
  try {
    token = localStorage.getItem('mabel_token')
    userStr = localStorage.getItem('mabel_user')
  } catch {
    return { token: null, user: null, isAuthenticated: false }
  }
  if (!token || !userStr) {
    return { token: null, user: null, isAuthenticated: false }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(userStr)
  } catch {
    // Corrupted JSON: clear and start fresh
    try {
      localStorage.removeItem('mabel_token')
      localStorage.removeItem('mabel_user')
    } catch {
      /* ignore */
    }
    return { token: null, user: null, isAuthenticated: false }
  }
  if (!isValidUser(parsed)) {
    // Schema mismatch: the stored object parsed but lacks required fields
    // (id/email/role) or has wrong types. Clear and force re-login rather
    // than expose a half-logged-in state.
    try {
      localStorage.removeItem('mabel_token')
      localStorage.removeItem('mabel_user')
    } catch {
      /* ignore */
    }
    return { token: null, user: null, isAuthenticated: false }
  }
  return { token, user: parsed, isAuthenticated: true }
}

export const useAuthStore = create<AuthState>((set) => ({
  ...readSnapshotFromStorage(),

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

  /**
   * Re-read localStorage and update the store. After the factory-level
   * hydration this is mostly a no-op, but kept for the App.tsx call site
   * and for explicit re-sync scenarios (multi-tab login, OAuth callback,
   * tests).
   */
  initialize: () => {
    set(readSnapshotFromStorage())
  },
}))
