import { describe, expect, it } from 'vitest'
import { defaultRules, evaluateRule, theoreticalDetectionMinutes } from './alerts'
import { BurnRateCalculator, maxBurnRate } from './burnrate'
import { applyScenario, scenarioErrorRate, type Scenario } from './errors'
import { generateTraffic } from './traffic'

const DAY = 24 * 60
const SLO_30D = 30 * DAY

function constantSeries(minutes: number, perMin: number): number[] {
  return new Array(minutes).fill(perMin)
}

function outage(startMin: number, durationMin: number): Scenario {
  return { kind: 'full-outage', startMin, durationMin, errorRate: 1, baselineErrorRate: 0 }
}

describe('BurnRateCalculator', () => {
  it('computes burn rate = errorRatio / (1 - objective)', () => {
    // 1% errors at a 99.9% objective → burn rate 10.
    const total = 1000
    const bad = constantSeries(120, 10)
    const good = constantSeries(120, total - 10)
    const calc = new BurnRateCalculator(good, bad)
    expect(calc.errorRatio(119, 60)).toBeCloseTo(0.01)
    expect(calc.burnRate(119, 60, 0.999)).toBeCloseTo(10)
  })

  it('caps at max burn rate during a full outage', () => {
    // 100% errors at 99.9% → burn rate 1000 = 1/(1-0.999).
    const calc = new BurnRateCalculator(constantSeries(120, 0), constantSeries(120, 500))
    expect(calc.burnRate(119, 60, 0.999)).toBeCloseTo(1000)
    expect(maxBurnRate(0.999)).toBeCloseTo(1000)
    expect(maxBurnRate(0.9)).toBeCloseTo(10)
  })

  it('returns null when the window saw no traffic', () => {
    const calc = new BurnRateCalculator(constantSeries(60, 0), constantSeries(60, 0))
    expect(calc.errorRatio(59, 30)).toBeNull()
    expect(calc.burnRate(59, 30, 0.999)).toBeNull()
  })

  it('uses a sliding window: burn rate ramps as errors enter, falls as they leave', () => {
    // 30 minutes clean, 30 minutes full outage, then clean again.
    const minutes = 180
    const good: number[] = []
    const bad: number[] = []
    for (let t = 0; t < minutes; t++) {
      const failing = t >= 30 && t < 60
      good.push(failing ? 0 : 100)
      bad.push(failing ? 100 : 0)
    }
    const calc = new BurnRateCalculator(good, bad)
    // After recovery (t=104): the last 60 minutes cover [45, 105), which
    // includes 15 bad minutes → ratio 0.25.
    expect(calc.errorRatio(104, 60)).toBeCloseTo(15 / 60)
    // Peak, right when the outage ends (t=59): 30/60.
    expect(calc.errorRatio(59, 60)).toBeCloseTo(0.5)
    // One full window after recovery (t=120): clean again.
    expect(calc.errorRatio(120, 60)).toBeCloseTo(0)
  })
})

describe('evaluateRule (MWMBR)', () => {
  it('fires only when BOTH windows exceed the threshold', () => {
    // Errors stopped 20 minutes ago: long window (60m) still hot,
    // short window (5m) already clean → no alert.
    const minutes = 200
    const good: number[] = []
    const bad: number[] = []
    for (let t = 0; t < minutes; t++) {
      const failing = t >= 60 && t < 100
      good.push(failing ? 0 : 100)
      bad.push(failing ? 100 : 0)
    }
    const calc = new BurnRateCalculator(good, bad)
    const rule = { id: 'r', name: 'r', severity: 'page' as const, longWindowMin: 60, shortWindowMin: 5, burnRate: 14.4 }
    const evaln = evaluateRule(calc, rule, 0.999, SLO_30D, { startMin: 60, endMin: 100 })

    // t=119: long window covers 40 bad minutes of the last 60 → ratio .66 → BR 666 ≥ 14.4
    // but the short window (last 5m) is clean → must not fire.
    expect(evaln.firing[119]).toBe(false)
    // During the outage both windows are hot → fires.
    expect(evaln.firing[90]).toBe(true)
    // With the short window, the alert clears within ~5m of recovery.
    expect(evaln.resetMinutes).not.toBeNull()
    expect(evaln.resetMinutes!).toBeLessThanOrEqual(6)
  })

  it('long-window-only rule keeps firing long after recovery (the reset-time problem)', () => {
    const minutes = 300
    const good: number[] = []
    const bad: number[] = []
    for (let t = 0; t < minutes; t++) {
      const failing = t >= 60 && t < 100
      good.push(failing ? 0 : 100)
      bad.push(failing ? 100 : 0)
    }
    const calc = new BurnRateCalculator(good, bad)
    const noShort = { id: 'r', name: 'r', severity: 'page' as const, longWindowMin: 60, shortWindowMin: 0, burnRate: 14.4 }
    const withShort = { ...noShort, shortWindowMin: 5 }
    const incident = { startMin: 60, endMin: 100 }
    const a = evaluateRule(calc, noShort, 0.999, SLO_30D, incident)
    const b = evaluateRule(calc, withShort, 0.999, SLO_30D, incident)
    expect(a.resetMinutes!).toBeGreaterThan(30)
    expect(b.resetMinutes!).toBeLessThan(a.resetMinutes!)
  })

  it('NEVER fires a 14.4x page at a 90% objective, even during a total outage', () => {
    // The headline limitation: max burn rate at 90% is 1/(1-0.9) = 10 < 14.4.
    const traffic = generateTraffic('steady', 100, 2 * DAY, 7)
    const events = applyScenario(traffic, outage(DAY, 6 * 60), 7)
    const calc = new BurnRateCalculator(events.good, events.bad)
    const rule = defaultRules()[0] // 14.4x over 1h/5m
    const evaln = evaluateRule(calc, rule, 0.9, SLO_30D, { startMin: DAY, endMin: DAY + 6 * 60 })
    expect(evaln.canEverFire).toBe(false)
    expect(evaln.detectedAt).toBeNull()
    expect(evaln.totalFiringMinutes).toBe(0)
  })

  it('the same rule fires quickly at a 99.9% objective', () => {
    const traffic = generateTraffic('steady', 100, 2 * DAY, 7)
    const events = applyScenario(traffic, outage(DAY, 6 * 60), 7)
    const calc = new BurnRateCalculator(events.good, events.bad)
    const rule = defaultRules()[0]
    const evaln = evaluateRule(calc, rule, 0.999, SLO_30D, { startMin: DAY, endMin: DAY + 6 * 60 })
    expect(evaln.canEverFire).toBe(true)
    // Theory: 14.4 × 0.001 × 60min ≈ 0.86 min. Allow sampling slack.
    expect(evaln.detectionMinutes!).toBeLessThanOrEqual(3)
  })

  it('reports budget consumed at detection per the workbook table', () => {
    const rules = defaultRules()
    const calc = new BurnRateCalculator(constantSeries(60, 100), constantSeries(60, 0))
    // 14.4x over 1h → 2% of a 30d budget; 6x over 6h → 5%; 1x over 3d → 10%.
    expect(evaluateRule(calc, rules[0], 0.999, SLO_30D).budgetConsumedAtDetection).toBeCloseTo(0.02)
    expect(evaluateRule(calc, rules[1], 0.999, SLO_30D).budgetConsumedAtDetection).toBeCloseTo(0.05)
    expect(evaluateRule(calc, rules[2], 0.999, SLO_30D).budgetConsumedAtDetection).toBeCloseTo(0.1)
  })
})

describe('theoreticalDetectionMinutes', () => {
  it('matches the workbook formula', () => {
    const rule = defaultRules()[0] // 14.4x / 1h
    // Full outage at 99.9%: (14.4 × 0.001 / 1) × 60 ≈ 0.864 min.
    expect(theoreticalDetectionMinutes(rule, 0.999, 1)!).toBeCloseTo(0.864)
    // 10% error rate: ×10 → 8.64 min.
    expect(theoreticalDetectionMinutes(rule, 0.999, 0.1)!).toBeCloseTo(8.64)
    // Error rate below threshold × (1−SLO): never detects.
    expect(theoreticalDetectionMinutes(rule, 0.999, 0.001)).toBeNull()
    // 90% objective, full outage, 14.4x: unreachable.
    expect(theoreticalDetectionMinutes(rule, 0.9, 1)).toBeNull()
  })
})

describe('scenarios', () => {
  it('full outage fails every request in the window', () => {
    const traffic = constantSeries(100, 50)
    const events = applyScenario(traffic, outage(20, 30))
    expect(events.bad[25]).toBe(50)
    expect(events.good[25]).toBe(0)
    expect(events.bad[10]).toBe(0)
    expect(events.bad[60]).toBe(0)
  })

  it('blips produce short repeated bursts', () => {
    const s: Scenario = {
      kind: 'blips', startMin: 0, durationMin: 1000, errorRate: 1,
      baselineErrorRate: 0, blipIntervalMin: 100, blipDurationMin: 2,
    }
    expect(scenarioErrorRate(s, 0)).toBe(1)
    expect(scenarioErrorRate(s, 1)).toBe(1)
    expect(scenarioErrorRate(s, 2)).toBe(0)
    expect(scenarioErrorRate(s, 100)).toBe(1)
    expect(scenarioErrorRate(s, 150)).toBe(0)
  })

  it('sampling is deterministic for a given seed', () => {
    const t1 = generateTraffic('diurnal', 10, 500, 99)
    const t2 = generateTraffic('diurnal', 10, 500, 99)
    expect(t1).toEqual(t2)
  })

  it('low traffic yields quantized counts', () => {
    // 0.05 TPS = 3 requests/minute expected — mostly small integers with zeros.
    const t = generateTraffic('steady', 0.01, 1000, 5)
    expect(Math.min(...t)).toBe(0)
    expect(Math.max(...t)).toBeLessThan(10)
  })
})
