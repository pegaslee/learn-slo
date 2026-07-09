import { makeRng, poisson } from './random'

export type TrafficShape =
  | 'steady'
  | 'diurnal'
  | 'business-hours'
  | 'spiky'
  | 'growing'

export const TRAFFIC_SHAPES: { id: TrafficShape; label: string; blurb: string }[] = [
  { id: 'steady', label: 'Steady', blurb: 'Constant load around the clock — e.g. machine-to-machine API traffic.' },
  { id: 'diurnal', label: 'Diurnal', blurb: 'Smooth day/night cycle (~4:1 peak to trough) — a consumer service in one region.' },
  { id: 'business-hours', label: 'Business hours', blurb: 'Weekday office-hours peaks with quiet nights and weekends — an internal tool.' },
  { id: 'spiky', label: 'Spiky', blurb: 'Steady base with sudden flash spikes — launches, batch jobs, push notifications.' },
  { id: 'growing', label: 'Growing', blurb: 'Traffic ramping up over the horizon — a service being rolled out.' },
]

const MIN_PER_DAY = 24 * 60

/**
 * Generate requests-per-minute for the given shape. `baseTps` is the average
 * transactions per second. Counts are Poisson-sampled around the shape's
 * expected rate, so low-traffic services naturally show integer quantization
 * (0, 1, 2 requests per minute) while high-traffic services look smooth.
 */
export function generateTraffic(
  shape: TrafficShape,
  baseTps: number,
  minutes: number,
  seed = 42,
): number[] {
  const rng = makeRng(seed)
  const basePerMin = baseTps * 60
  const out = new Array<number>(minutes)

  // Pre-pick spike times for the spiky shape so they don't depend on
  // per-minute sampling order.
  const spikes: { at: number; magnitude: number; width: number }[] = []
  if (shape === 'spiky') {
    const spikeCount = Math.max(1, Math.round(minutes / MIN_PER_DAY) * 2)
    for (let i = 0; i < spikeCount; i++) {
      spikes.push({
        at: Math.floor(rng() * minutes),
        magnitude: 4 + rng() * 8, // 5x–13x base at the peak
        width: 10 + rng() * 30, // minutes
      })
    }
  }

  for (let t = 0; t < minutes; t++) {
    const dayFrac = (t % MIN_PER_DAY) / MIN_PER_DAY
    const dayOfWeek = Math.floor(t / MIN_PER_DAY) % 7 // day 0 = Monday
    let mult: number
    switch (shape) {
      case 'steady':
        mult = 1
        break
      case 'diurnal':
        // Peak mid-afternoon, trough pre-dawn; ~4:1 ratio, mean 1.
        mult = 1 + 0.6 * Math.sin(2 * Math.PI * (dayFrac - 0.4))
        break
      case 'business-hours': {
        const weekend = dayOfWeek >= 5
        const hour = dayFrac * 24
        const inOffice = hour >= 8 && hour < 18
        // Smooth hump over office hours.
        const hump = inOffice ? Math.sin(((hour - 8) / 10) * Math.PI) : 0
        mult = 0.08 + (weekend ? 0.1 : 2.2) * hump
        break
      }
      case 'spiky': {
        mult = 1
        for (const s of spikes) {
          const d = Math.abs(t - s.at)
          if (d < s.width) mult += s.magnitude * (1 - d / s.width)
        }
        break
      }
      case 'growing':
        mult = 0.15 + (1.7 * t) / minutes
        break
    }
    out[t] = poisson(basePerMin * mult, rng)
  }
  return out
}
