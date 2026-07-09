import { describe, expect, it } from 'vitest'
import { defaultRules } from './alerts'
import { makeRng } from './random'
import { generateIncidentSuite, scorePolicy, type PolicyScore } from './reportcard'
import { generateTraffic } from './traffic'

const DAYS_60 = 60 * 1440
const SLO_30D = 30 * 1440

function run(objective: number, tps: number, seed = 77): PolicyScore {
  const traffic = generateTraffic('steady', tps, DAYS_60, seed)
  const incidents = generateIncidentSuite(DAYS_60, makeRng(seed + 1))
  return scorePolicy({
    traffic,
    incidents,
    rules: defaultRules(),
    objective,
    sloWindowMin: SLO_30D,
    rng: makeRng(seed + 2),
  })
}

describe('generateIncidentSuite', () => {
  it('is deterministic for a seed and never overlaps', () => {
    const a = generateIncidentSuite(DAYS_60, makeRng(5))
    const b = generateIncidentSuite(DAYS_60, makeRng(5))
    expect(a).toEqual(b)
    const sorted = [...a].sort((x, y) => x.startMin - y.startMin)
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].startMin).toBeGreaterThanOrEqual(sorted[i - 1].startMin + sorted[i - 1].durationMin)
    }
    expect(a.some((i) => i.kind === 'full-outage')).toBe(true)
    expect(a.some((i) => i.kind === 'blip')).toBe(true)
  })
})

describe('scorePolicy', () => {
  it('standard policy at 99.9%/100 TPS: catches every significant incident precisely', () => {
    const score = run(0.999, 100)
    // Recall counts detection by any severity — slow burns are correctly
    // handled by the ticket, not a page.
    expect(score.recall).toBe(1)
    expect(score.precision!).toBeGreaterThan(0.8)
    expect(score.medianDetectionMin!).toBeLessThan(60)
    // Every full outage is significant at 99.9% and must be PAGED.
    for (const s of score.incidents.filter((s) => s.incident.kind === 'full-outage')) {
      expect(s.significant).toBe(true)
      expect(s.pagedAfterMin).not.toBeNull()
    }
  })

  it('very low traffic produces false pages from ordinary noise', () => {
    const score = run(0.999, 0.005)
    expect(score.falsePagesPer30d).toBeGreaterThan(0)
  })

  it('a 90% objective makes the whole page tier useless against outages', () => {
    const score = run(0.9, 100)
    // Max burn rate is 10 < 14.4: the fast page can never fire. The 6x slow
    // page can only fire on very large incidents; full outages still reach
    // it, so recall isn't zero — but the fast page contributes nothing.
    const fast = score.perRule.find((r) => r.rule.burnRate > 10)!
    expect(fast.firingMinutes).toBe(0)
  })

  it('slow burns are ticketed, not paged', () => {
    const score = run(0.999, 100)
    const burns = score.incidents.filter((s) => s.incident.kind === 'slow-burn' && s.significant)
    expect(burns.length).toBeGreaterThan(0)
    for (const b of burns) {
      expect(b.caughtBy).toContain('Ticket')
    }
    expect(score.slowBurnRecall).toBe(1)
  })
})
