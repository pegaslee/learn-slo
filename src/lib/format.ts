/** "95m" → "1h 35m"; "3000m" → "2d 2h". Chooses the two largest units. */
export function formatMinutes(min: number | null | undefined): string {
  if (min === null || min === undefined || !isFinite(min)) return '—'
  if (min < 1) return '<1m'
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  const m = Math.round(min % 60)
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  return `${m}m`
}

/** Simulation minute → "Day 2, 14:30". */
export function formatSimTime(min: number): string {
  const day = Math.floor(min / 1440) + 1
  const h = Math.floor((min % 1440) / 60)
  const m = Math.floor(min % 60)
  const hh = String(h).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  return `Day ${day}, ${hh}:${mm}`
}

export function formatPercent(frac: number, digits = 2): string {
  // Trim trailing zeros only after a decimal point ("2.50" → "2.5", not "10" → "1").
  const s = (frac * 100).toFixed(digits).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
  return `${s}%`
}

export function formatCompact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e4) return `${(n / 1e3).toFixed(0)}K`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  if (n >= 100) return n.toFixed(0)
  if (n >= 1) return `${Math.round(n * 10) / 10}`
  return `${Math.round(n * 100) / 100}`
}

/** Objective slider works in "nines-ish" steps for a natural feel. */
export const OBJECTIVE_STOPS = [
  0.9, 0.925, 0.95, 0.97, 0.98, 0.99, 0.995, 0.998, 0.999, 0.9995, 0.9999,
]

export function formatObjective(obj: number): string {
  // Avoid float noise: 0.999 → "99.9%".
  return `${parseFloat((obj * 100).toPrecision(10))}%`
}
