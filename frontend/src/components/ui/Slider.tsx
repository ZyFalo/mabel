import { useId } from 'react'

interface SliderProps {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  step?: number
  format?: (v: number) => string
  label?: string
  disabled?: boolean
}

/**
 * Slider — custom range primitive.
 *
 * Renders a native <input type="range"> styled with a thin track,
 * accent-coloured fill, and a circular thumb with subtle glow. The current
 * value is displayed at the right in tabular-nums.
 */
export default function Slider({
  value,
  onChange,
  min = 0,
  max = 10,
  step = 1,
  format,
  label,
  disabled = false,
}: SliderProps) {
  const id = useId()
  const range = max - min === 0 ? 1 : max - min
  const pct = Math.min(100, Math.max(0, ((value - min) / range) * 100))
  const display = format ? format(value) : String(value)

  return (
    <div className="flex w-full items-center gap-3">
      <div className="relative flex-1">
        {/* Track */}
        <div
          aria-hidden="true"
          className="absolute inset-y-1/2 left-0 right-0 -translate-y-1/2 h-1.5 rounded-full"
          style={{ backgroundColor: 'var(--ink-200)' }}
        />
        {/* Fill */}
        <div
          aria-hidden="true"
          className="absolute inset-y-1/2 left-0 -translate-y-1/2 h-1.5 rounded-full"
          style={{
            width: `${pct}%`,
            backgroundColor: 'var(--mabel-600)',
            boxShadow: `0 0 0 4px var(--ring-mabel)`,
          }}
        />
        {/* Native range — fully transparent appearance, custom thumb via ::-webkit-slider-thumb */}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={display}
          className="mabel-slider relative z-10 w-full appearance-none bg-transparent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          style={{ WebkitAppearance: 'none' }}
        />
      </div>
      <span
        className="min-w-[2.5rem] text-right text-sm tabular-nums font-medium"
        style={{ color: 'var(--ink-900)' }}
      >
        {display}
      </span>
      <style>{`
        .mabel-slider {
          height: 1.5rem;
        }
        .mabel-slider::-webkit-slider-runnable-track {
          background: transparent;
          height: 1.5rem;
        }
        .mabel-slider::-moz-range-track {
          background: transparent;
          height: 1.5rem;
        }
        .mabel-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 9999px;
          background: #fff;
          border: 2px solid var(--mabel-600);
          box-shadow: 0 1px 3px rgba(0,0,0,0.10);
          cursor: pointer;
          transition: transform 150ms ease-out;
          margin-top: 0;
        }
        .mabel-slider::-webkit-slider-thumb:hover {
          transform: scale(1.12);
        }
        .mabel-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 9999px;
          background: #fff;
          border: 2px solid var(--mabel-600);
          box-shadow: 0 1px 3px rgba(0,0,0,0.10);
          cursor: pointer;
          transition: transform 150ms ease-out;
        }
        .mabel-slider:focus-visible::-webkit-slider-thumb {
          box-shadow: 0 0 0 4px var(--ring-mabel);
        }
        .mabel-slider:focus-visible::-moz-range-thumb {
          box-shadow: 0 0 0 4px var(--ring-mabel);
        }
      `}</style>
    </div>
  )
}
