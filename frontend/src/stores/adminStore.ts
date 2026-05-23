import { create } from 'zustand'
import apiClient from '../api/client'

interface AdminState {
  pendingReports: number
  activeSafetyEvents: number
  polling: boolean
  intervalId: number | null
  // Mobile drawer (responsive 2026-05-23): el sidebar fijo de 220px no
  // cabe en mobile. En <768px se vuelve un drawer overlay controlado
  // por este flag. El hamburger del AdminHeader lo toggle.
  mobileNavOpen: boolean
  toggleMobileNav: () => void
  closeMobileNav: () => void
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
  mobileNavOpen: false,
  toggleMobileNav: () => set((s) => ({ mobileNavOpen: !s.mobileNavOpen })),
  closeMobileNav: () => set({ mobileNavOpen: false }),

  fetchOnce: async () => {
    try {
      const res = await apiClient.get('/admin/dashboard')
      const data = res.data ?? {}
      // `activeSafetyEvents` MUST reflect events with `status='active'` so
      // the sidebar badge actually represents pending triage work. The
      // previous mapping used `safety_events_24h` which hid older
      // unreviewed events from the admin's attention. The backend now
      // provides `safety_events_active`; we fall back to the 24h count
      // only if the new field is missing (e.g. against an older backend).
      set({
        pendingReports: typeof data.reports_pending === 'number' ? data.reports_pending : get().pendingReports,
        activeSafetyEvents:
          typeof data.safety_events_active === 'number'
            ? data.safety_events_active
            : typeof data.safety_events_24h === 'number'
              ? data.safety_events_24h
              : get().activeSafetyEvents,
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
