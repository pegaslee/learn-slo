import { useMemo } from 'react'
import {
  applyScenario,
  BurnRateCalculator,
  evaluateRule,
  type AlertRule,
  type RuleEvaluation,
  type Scenario,
  type TrafficShape,
  generateTraffic,
} from '../engine'

export interface SimulationParams {
  shape: TrafficShape
  tps: number
  horizonDays: number
  scenario: Scenario
  objective: number
  sloWindowDays: number
  rules: AlertRule[]
  seed?: number
}

export interface SimulationResult {
  minutes: number
  traffic: number[]
  good: number[]
  bad: number[]
  targetRate: number[]
  calc: BurnRateCalculator
  evaluations: RuleEvaluation[]
  incident?: { startMin: number; endMin: number }
  /** Burn-rate series keyed by "<windowMin>" for every window used by rules. */
  burnRates: Map<number, (number | null)[]>
}

/** Run the full pipeline (traffic → errors → burn rates → alerts), memoized. */
export function useSimulation(params: SimulationParams): SimulationResult {
  const { shape, tps, horizonDays, scenario, objective, sloWindowDays, rules, seed = 42 } = params
  return useMemo(() => {
    const minutes = Math.round(horizonDays * 24 * 60)
    const traffic = generateTraffic(shape, tps, minutes, seed)
    const events = applyScenario(traffic, scenario, seed + 1)
    const calc = new BurnRateCalculator(events.good, events.bad)
    const incident =
      scenario.kind === 'none'
        ? undefined
        : { startMin: scenario.startMin, endMin: Math.min(minutes, scenario.startMin + scenario.durationMin) }
    const sloWindowMin = sloWindowDays * 24 * 60
    const evaluations = rules.map((r) => evaluateRule(calc, r, objective, sloWindowMin, incident))
    const burnRates = new Map<number, (number | null)[]>()
    for (const r of rules) {
      for (const w of [r.longWindowMin, r.shortWindowMin]) {
        if (w > 0 && !burnRates.has(w)) burnRates.set(w, calc.burnRateSeries(w, objective))
      }
    }
    return { minutes, traffic, good: events.good, bad: events.bad, targetRate: events.targetRate, calc, evaluations, incident, burnRates }
  }, [shape, tps, horizonDays, scenario, objective, sloWindowDays, rules, seed])
}
