import { binomial, makeRng } from './random'

export type ScenarioKind =
  | 'none'
  | 'full-outage'
  | 'partial-outage'
  | 'slow-burn'
  | 'blips'
  | 'bad-deploy'

export interface Scenario {
  kind: ScenarioKind
  /** Minute at which the incident begins. */
  startMin: number
  /** Incident duration in minutes (ignored for 'none'). */
  durationMin: number
  /** Error fraction during the incident (forced to 1 for full-outage). */
  errorRate: number
  /** Constant background error fraction outside the incident. */
  baselineErrorRate: number
  /** For 'blips': gap between blip starts, and length of each blip. */
  blipIntervalMin?: number
  blipDurationMin?: number
}

export const SCENARIO_KINDS: { id: ScenarioKind; label: string; blurb: string }[] = [
  { id: 'none', label: 'No incident', blurb: 'Only the background error rate.' },
  { id: 'full-outage', label: 'Full outage', blurb: '100% of requests fail for the duration.' },
  { id: 'partial-outage', label: 'Partial outage', blurb: 'A fixed fraction of requests fail for the duration.' },
  { id: 'slow-burn', label: 'Slow burn', blurb: 'A small elevated error rate that quietly eats budget for a long time.' },
  { id: 'blips', label: 'Intermittent blips', blurb: 'Short repeated bursts of errors — flaky dependency, restart loops.' },
  { id: 'bad-deploy', label: 'Bad deploy', blurb: 'Errors jump at rollout, then fall away linearly as it is rolled back.' },
]

/** Target error fraction at minute t under the scenario. */
export function scenarioErrorRate(scenario: Scenario, t: number): number {
  const { kind, startMin, durationMin, baselineErrorRate } = scenario
  const inWindow = t >= startMin && t < startMin + durationMin
  let rate = baselineErrorRate
  switch (kind) {
    case 'none':
      break
    case 'full-outage':
      if (inWindow) rate = 1
      break
    case 'partial-outage':
    case 'slow-burn':
      if (inWindow) rate = Math.max(rate, scenario.errorRate)
      break
    case 'blips': {
      const interval = scenario.blipIntervalMin ?? 240
      const blipLen = scenario.blipDurationMin ?? 2
      if (inWindow && (t - startMin) % interval < blipLen) {
        rate = Math.max(rate, scenario.errorRate)
      }
      break
    }
    case 'bad-deploy': {
      if (inWindow) {
        // Full impact for the first third, then linear rollback.
        const elapsed = t - startMin
        const rampStart = durationMin / 3
        const frac = elapsed < rampStart ? 1 : 1 - (elapsed - rampStart) / (durationMin - rampStart)
        rate = Math.max(rate, scenario.errorRate * frac)
      }
      break
    }
  }
  return Math.min(1, Math.max(0, rate))
}

export interface EventSeries {
  /** Successful requests per minute. */
  good: number[]
  /** Failed requests per minute. */
  bad: number[]
  /** The scenario's target error fraction per minute (before sampling). */
  targetRate: number[]
}

/**
 * Split a traffic series into good/bad counts per minute. Failures are
 * binomially sampled from the target rate, so sparse traffic shows the
 * quantization noise that makes burn-rate alerting hard at low volume.
 */
export function applyScenario(traffic: number[], scenario: Scenario, seed = 1337): EventSeries {
  const rng = makeRng(seed)
  const n = traffic.length
  const good = new Array<number>(n)
  const bad = new Array<number>(n)
  const targetRate = new Array<number>(n)
  for (let t = 0; t < n; t++) {
    const rate = scenarioErrorRate(scenario, t)
    targetRate[t] = rate
    const failures = rate >= 1 ? traffic[t] : binomial(traffic[t], rate, rng)
    bad[t] = failures
    good[t] = traffic[t] - failures
  }
  return { good, bad, targetRate }
}
