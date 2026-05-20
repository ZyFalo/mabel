import { create } from 'zustand'
import apiClient from '../api/client'

interface AdminState {
  pendingReports: number
  activeSafetyEvents: number
  polling: boolean
  intervalId: number | null
  fetchOnce: () => Promise<void>
  startPolling: () => void
  stopPolling: () => void
}

const POLL_INTERVAL_MS = 60000

export const useAdminStore = create<AdminState>((set, get) => ({
  pendingReports: 0,
  activeSafetyEvents: 0,
  polling: false,
  intervalId: null,

  fetchOnce: async () => {
    try {
      const res = await apiClient.get('/admin/dashboard')
      const data = res.data ?? {}
      set({
        pendingReports: typeof data.reports_pending === 'number' ? data.reports_pending : get().pendingReports,
        activeSafetyEvents:
          typeof data.safety_events_24h === 'number' ? data.safety_events_24h : get().activeSafetyEvents,
      })
    } catch {
      // Silenced — preserve previous counts on error
    }
  },

  startPolling: () => {
    if (get().polling) return
    // Fire immediately, then on interval
    get().fetchOnce()
    const id = window.setInterval(() => {
      get().fetchOnce()
    }, POLL_INTERVAL_MS)
    set({ polling: true, intervalId: id })
  },

  stopPolling: () => {
    const id = get().intervalId
    if (id !== null) {
      window.clearInterval(id)
    }
    set({ polling: false, intervalId: null })
  },
}))
