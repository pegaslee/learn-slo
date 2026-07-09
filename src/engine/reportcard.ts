import { evaluateRule, type AlertRule, type FiringInterval } from './alerts'
import { BurnRateCalculator } from './burnrate'
import { binomial } from './random'

/**
 * Policy report card: run a rule set against a randomized-but-seeded suite
 * of incidents and quiet time, then score it the way the workbook judges
 * alerts — precision, recall, detection time, and false pages.
 */

export type SuiteIncidentKind = 'full-outage' | 'partial-outage' | 'slow-burn' | 'blip'

export interface SuiteIncident {
  id: number
  kind: SuiteIncidentKind
  startMin: number
  durationMin: number
  errorRate: number
}

const KIND_LABELS: Record<SuiteIncidentKind, string> = {
  'full-outage': 'Full outage',
  'partial-outage': 'Partial outage',
  'slow-burn': 'Slow burn',
  blip: 'Minor blip',
}

export function incidentLabel(kind: SuiteIncidentKind): string {
  return KIND_LABELS[kind]
}

/**
 * Draw a non-overlapping incident schedule over the horizon: a few sharp
 * outages, sustained partial outages, slow burns, and many minor blips
 * that a good policy should mostly ignore.
 */
export function generateIncidentSuite(minutes: number, rng: () => number): SuiteIncident[] {
  const days = minutes / 1440
  const wanted: { kind: SuiteIncidentKind; count: number; dur: () => number; rate: () => number }[] = [
    {
      kind: 'full-outage',
      count: Math.max(1, Math.round(days / 20)),
      dur: () => 30 + rng() * 330, // 30m–6h
      rate: () => 1,
    },
    {
      kind: 'partial-outage',
      count: Math.max(1, Math.round(days / 12)),
      dur: () => 60 + rng() * 660, // 1–12h
      rate: () => 0.05 + rng() * 0.45,
    },
    {
      kind: 'slow-burn',
      count: Math.max(1, Math.round(days / 30)),
      dur: () => (3 + rng() * 7) * 1440, // 3–10 days
      rate: () => 0.0015 + rng() * 0.0035,
    },
    {
      kind: 'blip',
      count: Math.round(days / 5),
      dur: () => 1 + Math.floor(rng() * 4), // 1–4 minutes
      rate: () => 0.1 + rng() * 0.3,
    },
  ]

  const placed: SuiteIncident[] = []
  const PAD = 6 * 60 // keep incidents apart so attribution is unambiguous
  let id = 1
  for (const spec of wanted) {
    for (let i = 0; i < spec.count; i++) {
      const durationMin = Math.round(spec.dur())
      for (let attempt = 0; attempt < 200; attempt++) {
        const startMin = Math.floor(rng() * (minutes - durationMin - PAD))
        const overlaps = placed.some(
          (p) => startMin < p.startMin + p.durationMin + PAD && p.startMin < startMin + durationMin + PAD,
        )
        if (!overlaps) {
          placed.push({ id: id++, kind: spec.kind, startMin, durationMin, errorRate: spec.rate() })
          break
        }
      }
    }
  }
  return placed.sort((a, b) => a.startMin - b.startMin)
}

export interface ScoredIncident {
  incident: SuiteIncident
  /** Fraction of the SLO-period error budget this incident consumed. */
  budgetConsumed: number
  significant: boolean
  /** Minutes from start to the first attributed page, or null. */
  pagedAfterMin: number | null
  /** Rule names (any severity) whose firing was attributed to this incident. */
  caughtBy: string[]
}

export interface PageEvent {
  start: number
  end: number
  /** The incident this page was attributed to, or null for pure noise. */
  incidentId: number | null
  significant: boolean
}

export interface PolicyScore {
  incidents: ScoredIncident[]
  pageEvents: PageEvent[]
  /** Fraction of page events that pointed at a significant incident. */
  precision: number | null
  /** Fraction of significant incidents detected by ANY rule (page or ticket). */
  recall: number | null
  medianDetectionMin: number | null
  falsePagesPer30d: number
  /** Fraction of significant slow burns caught by any rule (usually the ticket). */
  slowBurnRecall: number | null
  /** Total simulated minutes (for rendering timelines). */
  minutes: number
  perRule: { rule: AlertRule; intervals: FiringInterval[]; firingMinutes: number }[]
}

export interface ScoreParams {
  traffic: number[]
  incidents: SuiteIncident[]
  rules: AlertRule[]
  objective: number
  sloWindowMin: number
  baselineErrorRate?: number
  /** Budget fraction above which an incident "deserves" a page. */
  significantBudgetFrac?: number
  rng: () => number
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

function mergeIntervals(intervals: FiringInterval[]): FiringInterval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start)
  const out: FiringInterval[] = []
  for (const iv of sorted) {
    const last = out[out.length - 1]
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end)
    else out.push({ ...iv })
  }
  return out
}

export function scorePolicy(params: ScoreParams): PolicyScore {
  const {
    traffic,
    incidents,
    rules,
    objective,
    sloWindowMin,
    baselineErrorRate = 0.0005,
    significantBudgetFrac = 0.02,
    rng,
  } = params
  const minutes = traffic.length

  // Build the bad-event series: baseline noise plus each incident's rate.
  const rate = new Float64Array(minutes).fill(baselineErrorRate)
  for (const inc of incidents) {
    for (let t = inc.startMin; t < Math.min(minutes, inc.startMin + inc.durationMin); t++) {
      rate[t] = Math.max(rate[t], inc.errorRate)
    }
  }
  const good = new Array<number>(minutes)
  const bad = new Array<number>(minutes)
  for (let t = 0; t < minutes; t++) {
    const b = rate[t] >= 1 ? traffic[t] : binomial(traffic[t], rate[t], rng)
    bad[t] = b
    good[t] = traffic[t] - b
  }
  const calc = new BurnRateCalculator(good, bad)

  // Budget consumed per incident, from the actually-sampled failures.
  const meanTraffic = traffic.reduce((a, b) => a + b, 0) / minutes
  const budgetEvents = (1 - objective) * meanTraffic * sloWindowMin
  const cumBad: number[] = [0]
  for (let t = 0; t < minutes; t++) cumBad.push(cumBad[t] + bad[t])
  const budgetOf = (inc: SuiteIncident) => {
    const end = Math.min(minutes, inc.startMin + inc.durationMin)
    return (cumBad[end] - cumBad[inc.startMin]) / budgetEvents
  }

  // Evaluate every rule once over the whole horizon.
  const perRule = rules.map((rule) => {
    const evaln = evaluateRule(calc, rule, objective, sloWindowMin)
    return { rule, intervals: evaln.intervals, firingMinutes: evaln.totalFiringMinutes }
  })

  const attributionPad = (severity: 'page' | 'ticket') =>
    Math.max(60, ...rules.filter((r) => r.severity === severity).map((r) => r.longWindowMin))

  // Attribute a firing interval to the incident whose influence window
  // ([start, end + longWindow]) contains the firing start; latest wins.
  const attribute = (start: number, pad: number): SuiteIncident | null => {
    let best: SuiteIncident | null = null
    for (const inc of incidents) {
      if (start >= inc.startMin && start <= inc.startMin + inc.durationMin + pad) {
        if (!best || inc.startMin > best.startMin) best = inc
      }
    }
    return best
  }

  const scored: ScoredIncident[] = incidents.map((incident) => {
    const budgetConsumed = budgetOf(incident)
    return {
      incident,
      budgetConsumed,
      significant: budgetConsumed >= significantBudgetFrac,
      pagedAfterMin: null,
      caughtBy: [],
    }
  })
  const byId = new Map(scored.map((s) => [s.incident.id, s]))

  // Any-severity attribution for "caught by" and slow-burn recall.
  for (const { rule, intervals } of perRule) {
    const pad = attributionPad(rule.severity)
    for (const iv of intervals) {
      const inc = attribute(iv.start, pad)
      if (inc) {
        const s = byId.get(inc.id)!
        if (!s.caughtBy.includes(rule.name)) s.caughtBy.push(rule.name)
      }
    }
  }

  // Page events: merged union of page-severity firings.
  const pagePad = attributionPad('page')
  const pageEvents: PageEvent[] = mergeIntervals(
    perRule.filter((r) => r.rule.severity === 'page').flatMap((r) => r.intervals),
  ).map((iv) => {
    const inc = attribute(iv.start, pagePad)
    const s = inc ? byId.get(inc.id)! : null
    if (s && iv.start >= s.incident.startMin) {
      const detection = iv.start - s.incident.startMin
      if (s.pagedAfterMin === null || detection < s.pagedAfterMin) s.pagedAfterMin = detection
    }
    return { start: iv.start, end: iv.end, incidentId: inc?.id ?? null, significant: s?.significant ?? false }
  })

  const significant = scored.filter((s) => s.significant)
  const detected = significant.filter((s) => s.caughtBy.length > 0)
  const paged = significant.filter((s) => s.pagedAfterMin !== null)
  const falsePages = pageEvents.filter((p) => !p.significant)
  const slowBurns = significant.filter((s) => s.incident.kind === 'slow-burn')

  return {
    incidents: scored,
    pageEvents,
    precision: pageEvents.length > 0 ? (pageEvents.length - falsePages.length) / pageEvents.length : null,
    recall: significant.length > 0 ? detected.length / significant.length : null,
    medianDetectionMin: median(paged.map((s) => s.pagedAfterMin!)),
    falsePagesPer30d: (falsePages.length / minutes) * 30 * 1440,
    slowBurnRecall:
      slowBurns.length > 0 ? slowBurns.filter((s) => s.caughtBy.length > 0).length / slowBurns.length : null,
    minutes,
    perRule,
  }
}
