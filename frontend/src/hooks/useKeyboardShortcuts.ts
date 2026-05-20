import { useEffect, useRef } from 'react'

export type Shortcut = 'cmd+b' | 'cmd+,' | 'esc'

type ShortcutMap = Partial<Record<Shortcut, () => void>>

interface UseKeyboardShortcutsOptions {
  /** When true, shortcuts fire even when typing inside an input/textarea. Default false. */
  allowInInputs?: boolean
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

function matchShortcut(e: KeyboardEvent): Shortcut | null {
  const meta = e.metaKey || e.ctrlKey
  const key = e.key.toLowerCase()
  if (meta && key === 'b') return 'cmd+b'
  if (meta && key === ',') return 'cmd+,'
  if (!meta && key === 'escape') return 'esc'
  return null
}

/**
 * useKeyboardShortcuts — register global keyboard shortcuts.
 *
 * Detects `metaKey || ctrlKey` for cmd+X bindings (cross-platform). Skips when
 * the active element is editable unless `allowInInputs: true`.
 *
 * Note: this hook is safe to call from multiple components simultaneously —
 * each component manages its own window-level listener. Only registered keys
 * will preventDefault.
 */
export function useKeyboardShortcuts(
  map: ShortcutMap,
  options: UseKeyboardShortcutsOptions = {},
): void {
  // Keep the latest map in a ref so the listener does not need to re-bind on
  // every render (handlers stay current without listener churn).
  const mapRef = useRef<ShortcutMap>(map)
  mapRef.current = map

  const allowInInputs = options.allowInInputs === true

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (!allowInInputs && isEditableTarget(e.target)) return
      const match = matchShortcut(e)
      if (!match) return
      const fn = mapRef.current[match]
      if (!fn) return
      e.preventDefault()
      fn()
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [allowInInputs])
}

export default useKeyboardShortcuts
