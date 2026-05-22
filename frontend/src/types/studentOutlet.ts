import type { TabId } from '../pages/Settings'

/**
 * Shape of the Outlet context exposed by `StudentLayout` to its children.
 * Use with `useOutletContext<StudentOutletContext>()` in any page rendered
 * under `<Route element={<StudentLayout />}>` (also forwarded through the
 * ConsentGuard + OnboardingGuard intermediates).
 */
export interface StudentOutletContext {
  /** Opens the global SOS crisis panel. */
  openCrisis: () => void
  /**
   * Opens the global Settings modal. Optional `tab` argument deep-links to
   * a specific section ('privacy' | 'accessibility' | 'voice' | 'account'
   * | 'arco'). Replaces the legacy `navigate('/settings?tab=...')` flow.
   */
  openSettings: (tab?: TabId) => void
}
