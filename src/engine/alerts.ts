import { BurnRateCalculator, maxBurnRate } from './burnrate'

export type Severity = 'page' | 'ticket'

export interface AlertRule {
  id: string
  name: string
  severity: Severity
  /** Long window in minutes — controls detection quality. */
  longWindowMin: number
  /** Short window in minutes — controls reset time. 0 disables it. */
  shortWindowMin: number
  /** Burn-rate threshold both windows must exceed. */
  burnRate: number
}

/**
 * The SRE Workbook's recommended starting point (Table 5-6, 30-day SLO):
 * 2% of budget in 1h and 5% in 6h page; 10% in 3d opens a ticket.
 */
export function defaultRules(): AlertRule[] {
  return [
    { id: 'fast-page', name: 'Fast page', severity: 'page', longWindowMin: 60, shortWindowMin: 5, burnRate: 14.4 },
    { id: 'slow-page', name: 'Slow page', severity: 'page', longWindowMin: 360, shortWindowMin: 30, burnRate: 6 },
    { id: 'ticket', name: 'Ticket', severity: 'ticket', longWindowMin: 3 * 24 * 60, shortWindowMin: 360, burnRate: 1 },
  ]
}

export interface FiringInterval {
  start: number
  /** Exclusive end minute. */
  end: number
}

export interface RuleEvaluation {
  rule: AlertRule
  firing: boolean[]
  intervals: FiringInterval[]
  /** Minute the rule first fired at/after the incident start, or null. */
  detectedAt: number | null
  /** Minutes from incident start to first firing, or null if never fired. */
  detectionMinutes: number | null
  /** Minutes the alert kept firing after the incident ended, or null. */
  resetMinutes: number | null
  /** Total minutes spent firing. */
  totalFiringMinutes: number
  /** False when threshold > 1/(1−objective): unreachable even at 100% errors. */
  canEverFire: boolean
  /** Fraction of the SLO-period error budget consumed by the time it fires. */
  budgetConsumedAtDetection: number
}

/**
 * Evaluate one MWMBR rule over the whole simulation. The rule fires at
 * minute t iff BOTH the long- and short-window burn rates are ≥ threshold.
 */
export function evaluateRule(
  calc: BurnRateCalculator,
  rule: AlertRule,
  objective: number,
  sloWindowMin: number,
  incident?: { startMin: number; endMin: number },
): RuleEvaluation {
  const n = calc.minutes
  const firing = new Array<boolean>(n)
  for (let t = 0; t < n; t++) {
    const long = calc.burnRate(t, rule.longWindowMin, objective)
    const short = rule.shortWindowMin > 0 ? calc.burnRate(t, rule.shortWindowMin, objective) : long
    firing[t] = long !== null && short !== null && long >= rule.burnRate && short >= rule.burnRate
  }

  const intervals: FiringInterval[] = []
  for (let t = 0; t < n; t++) {
    if (firing[t] && (t === 0 || !firing[t - 1])) intervals.push({ start: t, end: t + 1 })
    else if (firing[t]) intervals[intervals.length - 1].end = t + 1
  }

  let detectedAt: number | null = null
  let detectionMinutes: number | null = null
  let resetMinutes: number | null = null
  if (incident) {
    for (const iv of intervals) {
      if (iv.end > incident.startMin) {
        detectedAt = Math.max(iv.start, incident.startMin)
        detectionMinutes = detectedAt - incident.startMin
        break
      }
    }
    let lastFiring = -1
    for (const iv of intervals) {
      if (iv.start >= incident.startMin) lastFiring = Math.max(lastFiring, iv.end)
    }
    if (lastFiring > incident.endMin) resetMinutes = lastFiring - incident.endMin
    else if (lastFiring > 0) resetMinutes = 0
  }

  return {
    rule,
    firing,
    intervals,
    detectedAt,
    detectionMinutes,
    resetMinutes,
    totalFiringMinutes: firing.reduce((acc, f) => acc + (f ? 1 : 0), 0),
    canEverFire: rule.burnRate <= maxBurnRate(objective),
    budgetConsumedAtDetection: (rule.burnRate * rule.longWindowMin) / sloWindowMin,
  }
}

/**
 * Theoretical detection time for a constant error rate `errorRate` starting
 * from a clean slate (Workbook: detection time = ((1−SLO)/error ratio) ×
 * window × burn rate). Returns null when the error rate can never push the
 * long window past the threshold.
 */
export function theoreticalDetectionMinutes(
  rule: AlertRule,
  objective: number,
  errorRate: number,
): number | null {
  if (errorRate <= 0) return null
  const needed = rule.burnRate * (1 - objective)
  if (errorRate < needed) return null
  return (needed / errorRate) * rule.longWindowMin
}
