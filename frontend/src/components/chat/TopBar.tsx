interface ChatTopBarProps {
  onEndSession: () => void
  sessionInfo?: string
}

/**
 * ChatTopBar — Cap 3, minimal 48px top bar for the active chat view.
 * Left: brand label "Mabel IA" in Fraunces italic.
 * Right: "Finalizar sesion" link-style button (opens existing ConfirmModal upstream).
 */
export default function ChatTopBar({ onEndSession, sessionInfo }: ChatTopBarProps) {
  return (
    <header
      className="
        h-12 shrink-0
        flex items-center justify-between
        px-4
        border-b border-[var(--border-subtle)]
        bg-[var(--bg)]/80 backdrop-blur-sm
      "
      role="banner"
    >
      <div className="flex items-baseline gap-3 min-w-0">
        <span className="font-display italic text-[14px] text-[var(--text-strong)] tracking-tight">
          Mabel IA
        </span>
        {sessionInfo && (
          <span className="hidden sm:inline text-[11px] text-[var(--text-faint)] truncate">
            {sessionInfo}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onEndSession}
        className="
          text-[12px] text-[var(--text-faint)]
          hover:text-[var(--danger)]
          transition-colors
          px-2 py-1 rounded-md
          focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30
        "
      >
        Finalizar sesion
      </button>
    </header>
  )
}
