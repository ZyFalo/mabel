import type { ReactNode } from 'react'

interface MarkdownProps {
  text: string
}

const SAFE_URL_RE = /^(https?:\/\/|mailto:)/i

// Inline tokenizer: handles **bold**, `code`, and [text](url).
// Returns a ReactNode array. Defensive against unmatched delimiters.
function renderInline(input: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  // Token regex: bold, code, link.
  const re = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(input)) !== null) {
    if (m.index > last) {
      out.push(input.slice(last, m.index))
    }
    if (m[1]) {
      out.push(
        <strong key={`${keyBase}-b-${i}`} style={{ color: 'var(--text-strong)' }}>
          {m[2]}
        </strong>,
      )
    } else if (m[3]) {
      out.push(
        <code
          key={`${keyBase}-c-${i}`}
          className="rounded px-1.5 py-0.5 text-[0.9em] font-mono"
          style={{ backgroundColor: 'var(--bg-code)', color: 'var(--accent)' }}
        >
          {m[4]}
        </code>,
      )
    } else if (m[5]) {
      const label = m[6]
      const href = m[7]
      if (SAFE_URL_RE.test(href)) {
        out.push(
          <a
            key={`${keyBase}-l-${i}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
            style={{ color: 'var(--accent)' }}
          >
            {label}
          </a>,
        )
      } else {
        out.push(label)
      }
    }
    last = re.lastIndex
    i++
  }
  if (last < input.length) out.push(input.slice(last))
  return out
}

/**
 * Markdown — minimal renderer (no external dependency).
 *
 * Supported: **bold**, `code`, [text](url) (http/https/mailto only),
 * numbered lists (`1. `), bulleted lists (`- `), paragraphs (blank lines).
 */
export default function Markdown({ text }: MarkdownProps) {
  const blocks: ReactNode[] = []
  // Normalise line endings; split on blank lines for paragraphs.
  const paragraphs = text.replace(/\r\n/g, '\n').split(/\n{2,}/)

  paragraphs.forEach((para, pIdx) => {
    const lines = para.split('\n')
    const ordered = lines.every((l) => /^\d+\.\s+/.test(l.trim())) && lines.length > 0 && /^\d+\.\s+/.test(lines[0].trim())
    const unordered = lines.every((l) => /^-\s+/.test(l.trim())) && lines.length > 0 && /^-\s+/.test(lines[0].trim())

    if (ordered) {
      blocks.push(
        <ol key={`p-${pIdx}`} className="space-y-1.5">
          {lines.map((l, i) => {
            const match = l.trim().match(/^(\d+)\.\s+(.*)$/)
            const num = match ? match[1] : String(i + 1)
            const body = match ? match[2] : l
            return (
              <li key={`p-${pIdx}-li-${i}`} className="flex gap-3">
                <span
                  className="shrink-0 tabular-nums font-medium"
                  style={{ color: 'var(--accent)' }}
                >
                  {num}.
                </span>
                <span>{renderInline(body, `p-${pIdx}-li-${i}`)}</span>
              </li>
            )
          })}
        </ol>,
      )
    } else if (unordered) {
      blocks.push(
        <ul key={`p-${pIdx}`} className="space-y-1.5">
          {lines.map((l, i) => {
            const body = l.trim().replace(/^-\s+/, '')
            return (
              <li key={`p-${pIdx}-li-${i}`} className="flex gap-3">
                <span aria-hidden="true" className="shrink-0" style={{ color: 'var(--accent)' }}>
                  •
                </span>
                <span>{renderInline(body, `p-${pIdx}-li-${i}`)}</span>
              </li>
            )
          })}
        </ul>,
      )
    } else {
      // Plain paragraph; preserve single line breaks as <br>.
      blocks.push(
        <p key={`p-${pIdx}`} className="leading-relaxed">
          {lines.map((l, i) => (
            <span key={`p-${pIdx}-ln-${i}`}>
              {renderInline(l, `p-${pIdx}-ln-${i}`)}
              {i < lines.length - 1 ? <br /> : null}
            </span>
          ))}
        </p>,
      )
    }
  })

  return <div className="space-y-3">{blocks}</div>
}
