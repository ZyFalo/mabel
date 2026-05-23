/**
 * formatApiError — coerce an Axios-style error into a human-readable
 * toast message.
 *
 * The motivating bug: FastAPI returns 422 (Pydantic validation) with
 * `detail` as a LIST of `{type, loc, msg, input, ...}` objects, not a
 * string. The default frontend pattern `error.response?.data?.detail
 * ?? fallback` then passes the array to a `<p>{message}</p>` render
 * which React turns into `[object Object]` (or crashes with "Objects
 * are not valid as a React child" depending on the toast component).
 *
 * Shapes this helper handles:
 *   - HTTP 4xx with string detail   → return the string.
 *   - HTTP 422 with array of errors → join `msg` fields with "; ".
 *   - HTTP 5xx without detail       → fallback.
 *   - Network error                 → fallback.
 *   - Anything weird                → fallback.
 *
 * Use this everywhere you currently do `error.response?.data?.detail`
 * before piping to a toast, alert, or any React text node.
 */
export function formatApiError(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })
    ?.response?.data?.detail

  if (detail == null) return fallback

  if (typeof detail === 'string') return detail

  if (Array.isArray(detail)) {
    const parts = detail
      .map((entry) => {
        if (typeof entry === 'string') return entry
        if (entry && typeof entry === 'object') {
          // FastAPI 422 entry: prefer `msg`, fall back to JSON.
          const msg = (entry as { msg?: unknown }).msg
          if (typeof msg === 'string' && msg.length > 0) return msg
          try {
            return JSON.stringify(entry)
          } catch {
            return ''
          }
        }
        return ''
      })
      .filter((s) => s.length > 0)
    return parts.length > 0 ? parts.join('; ') : fallback
  }

  // Unknown shape (object with no `msg`, etc.). Fall back rather than
  // serializing because the user-facing message should not leak random
  // internal field names.
  return fallback
}
