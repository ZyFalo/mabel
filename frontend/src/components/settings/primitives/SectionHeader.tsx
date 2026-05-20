interface SectionHeaderProps {
  title: string
  desc?: string
}

/**
 * SectionHeader — title + description at the top of every settings section.
 *
 * - Title 22px bold ink-900 letter-spacing -0.015em
 * - Description 14px ink-500 line-height 1.5
 * - margin-bottom 28 to separate from first field
 */
export default function SectionHeader({ title, desc }: SectionHeaderProps) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2
        style={{
          fontSize: 22,
          fontWeight: 700,
          margin: 0,
          letterSpacing: '-0.015em',
          color: 'var(--ink-900)',
        }}
      >
        {title}
      </h2>
      {desc ? (
        <p
          style={{
            fontSize: 14,
            color: 'var(--ink-500)',
            margin: '6px 0 0',
            lineHeight: 1.5,
          }}
        >
          {desc}
        </p>
      ) : null}
    </div>
  )
}
