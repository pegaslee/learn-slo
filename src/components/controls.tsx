import type { ReactNode } from 'react'

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  /** How the current value is displayed next to the label. */
  format?: (v: number) => string
}

export function Slider({ label, value, min, max, step = 1, onChange, format }: SliderProps) {
  return (
    <div className="field">
      <label>
        {label} — <span className="value-readout">{format ? format(value) : value}</span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
    </div>
  )
}

/** Slider over an arbitrary list of stops (e.g. objective "nines"). */
export function StopSlider({
  label,
  stops,
  value,
  onChange,
  format,
}: {
  label: string
  stops: number[]
  value: number
  onChange: (v: number) => void
  format: (v: number) => string
}) {
  const idx = Math.max(0, stops.indexOf(value))
  return (
    <div className="field">
      <label>
        {label} — <span className="value-readout">{format(value)}</span>
      </label>
      <input
        type="range"
        min={0}
        max={stops.length - 1}
        step={1}
        value={idx}
        onChange={(e) => onChange(stops[Number(e.target.value)])}
        aria-label={label}
      />
    </div>
  )
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { id: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} aria-label={label}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  )
}
