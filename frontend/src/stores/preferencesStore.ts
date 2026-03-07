import { create } from 'zustand'
import apiClient from '../api/client'

export interface PreferencesData {
  user_id: string
  save_history: boolean
  ui_language: string
  tts_voice: string | null
  accessibility: Record<string, unknown> | null
  checkin_enabled: boolean
  preferred_chat_mode: 'chat' | 'avatar'
}

interface PreferencesState {
  preferences: PreferencesData | null
  loading: boolean
  hasPreferences: boolean
  loadPreferences: () => Promise<void>
  updatePreferences: (data: Partial<PreferencesData>) => Promise<PreferencesData>
  clear: () => void
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  preferences: null,
  loading: true,
  hasPreferences: false,

  loadPreferences: async () => {
    try {
      const res = await apiClient.get('/preferences/me')
      set({ preferences: res.data, hasPreferences: true, loading: false })
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404) {
        set({ preferences: null, hasPreferences: false, loading: false })
      } else {
        set({ loading: false })
      }
    }
  },

  updatePreferences: async (data) => {
    const res = await apiClient.put('/preferences', data)
    set({ preferences: res.data, hasPreferences: true })
    return res.data
  },

  clear: () => set({ preferences: null, hasPreferences: false, loading: true }),
}))
