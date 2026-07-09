import { useMemo, useState } from 'react'
import { SelectField } from '../../components/controls'
import { Formula } from '../../components/Formula'
import { StatCard } from '../../components/StatCard'
import { TimeSeriesChart, type Band } from '../../components/TimeSeriesChart'
import {
  binomial,
  BurnRateCalculator,
  evaluateRule,
  generateTraffic,
  latencyQuantile,
  makeRng,
  slowFraction,
  type AlertRule,
} from '../../engine'
import { formatMinutes, formatPercent } from '../../lib/format'

const HORIZON = 2 * 1440
const DEPLOY = { startMin: 1440, endMin: 1440 + 8 * 60 }
const BASE_MEDIAN = 120
const BAD_MEDIAN = 450
const SIGMA = 0.5
const LATENCY_OBJECTIVE = 0.99 // 99% of requests faster than the threshold
const RULE: AlertRule = {
  id: 'lat',
  name: 'Latency fast page',
  severity: 'page',
  longWindowMin: 60,
  shortWindowMin: 5,
  burnRate: 14.4,
}

export function LatencySli() {
  const [thresholdMs, setThresholdMs] = useState('500')
  const threshold = Number(thresholdMs)

  const sim = useMemo(() => {
    const traffic = generateTraffic('steady', 100, HORIZON, 31)
    const rng = makeRng(32)
    const slowGood: number[] = []
    const slowBad: number[] = []
    const errGood: number[] = []
    const errBad: number[] = []
    for (let t = 0; t < HORIZON; t++) {
      const median = t >= DEPLOY.startMin && t < DEPLOY.endMin ? BAD_MEDIAN : BASE_MEDIAN
      const pSlow = slowFraction(median, SIGMA, threshold)
      const slow = binomial(traffic[t], pSlow, rng)
      slowBad.push(slow)
      slowGood.push(traffic[t] - slow)
      // The bad deploy is slow, not broken: HTTP errors stay at baseline.
      const errs = binomial(traffic[t], 0.0002, rng)
      errBad.push(errs)
      errGood.push(traffic[t] - errs)
    }
    const latCalc = new BurnRateCalculator(slowGood, slowBad)
    const errCalc = new BurnRateCalculator(errGood, errBad)
    const evaln = evaluateRule(latCalc, RULE, LATENCY_OBJECTIVE, 30 * 1440, {
      startMin: DEPLOY.startMin,
      endMin: DEPLOY.endMin,
    })
    const errEvaln = evaluateRule(errCalc, RULE, 0.999, 30 * 1440, {
      startMin: DEPLOY.startMin,
      endMin: DEPLOY.endMin,
    })
    return {
      latBurn: latCalc.burnRateSeries(60, LATENCY_OBJECTIVE),
      errBurn: errCalc.burnRateSeries(60, 0.999),
      evaln,
      errEvaln,
      baseSlow: slowFraction(BASE_MEDIAN, SIGMA, threshold),
      badSlow: slowFraction(BAD_MEDIAN, SIGMA, threshold),
    }
  }, [threshold])

  const bands: Band[] = [
    { start: DEPLOY.startMin, end: DEPLOY.endMin, color: 'var(--ink-muted)', label: 'slow deploy (median 120→450 ms)' },
    ...sim.evaln.intervals.map((iv) => ({
      start: iv.start,
      end: iv.end,
      color: 'var(--status-critical)',
      label: 'latency SLI firing',
    })),
  ]
  const baselineOverBudget = sim.baseSlow > 1 - LATENCY_OBJECTIVE
  const p99 = latencyQuantile(BASE_MEDIAN, SIGMA, 0.99)

  return (
    <section className="lesson" id="latency-sli">
      <h2>
        <span className="kicker">3 · Beyond availability</span>
        Latency SLIs: count slow requests as bad
      </h2>
      <p>
        The instinct is to alert on a percentile: <em>“page if p99 &gt; 500 ms.”</em> Resist it.
        Percentiles don’t compose — you can’t average p99s across shards or windows, a p99 breach
        doesn’t say <em>how many</em> users were hurt, and there’s no budget arithmetic for it.
        Instead, define slowness as badness and reuse every tool from the Learn page unchanged:
      </p>
      <Formula tex="\text{SLI} = \frac{\#\{\text{requests faster than } \theta\}}{\#\{\text{valid requests}\}} \qquad \text{e.g. } 99\% \text{ of requests faster than } \theta" />
      <p>
        Below, a deploy makes the service <em>slow but not broken</em>: median latency jumps from
        120 ms to 450 ms for 8 hours. HTTP errors stay at baseline — an availability SLI sees
        nothing. The latency SLI (99% of requests faster than your chosen threshold) burns
        immediately.
      </p>
      <div className="card">
        <div className="controls">
          <SelectField
            label="Latency threshold θ"
            value={thresholdMs as '500'}
            options={[
              { id: '300', label: '300 ms' },
              { id: '500', label: '500 ms' },
              { id: '1000', label: '1000 ms' },
            ]}
            onChange={setThresholdMs}
          />
        </div>
        <TimeSeriesChart
          title="1-hour burn rate: latency SLI vs availability SLI (log scale)"
          series={[
            { id: 'lat', label: `latency SLI (θ=${threshold} ms, 99%)`, color: 'var(--series-1)', data: sim.latBurn },
            { id: 'err', label: 'availability SLI (99.9%)', color: 'var(--series-2)', data: sim.errBurn },
          ]}
          thresholds={[{ value: 14.4, label: '14.4×' }]}
          bands={bands}
          yScale="log"
          height={220}
        />
        <div className="stat-row">
          <StatCard
            label="Slow fraction (normal)"
            value={formatPercent(sim.baseSlow, 2)}
            tone={baselineOverBudget ? 'bad' : 'good'}
            note={`budget is ${formatPercent(1 - LATENCY_OBJECTIVE, 0)} — baseline must fit inside it`}
          />
          <StatCard
            label="Slow fraction (during deploy)"
            value={formatPercent(sim.badSlow, 1)}
            note={`burn rate ${(sim.badSlow / (1 - LATENCY_OBJECTIVE)).toFixed(0)}×`}
          />
          <StatCard
            label="Latency SLI paged in"
            value={sim.evaln.detectionMinutes !== null ? formatMinutes(sim.evaln.detectionMinutes) : 'never'}
            tone={sim.evaln.detectionMinutes !== null ? 'good' : 'bad'}
          />
          <StatCard
            label="Availability SLI paged in"
            value={sim.errEvaln.detectionMinutes !== null ? formatMinutes(sim.errEvaln.detectionMinutes) : 'never'}
            tone={sim.errEvaln.detectionMinutes !== null ? 'neutral' : 'bad'}
            note="the deploy returns 200s — slowly"
          />
        </div>
        {baselineOverBudget && (
          <div className="callout warn">
            <p>
              <strong>Your baseline already blows the budget.</strong> At θ = {threshold} ms,{' '}
              {formatPercent(sim.baseSlow, 1)} of <em>healthy</em> traffic is slow — more than the{' '}
              {formatPercent(1 - LATENCY_OBJECTIVE, 0)} budget. This SLO would fire constantly on
              a healthy service. Measure your real distribution first (this service’s healthy p99
              is ~{Math.round(p99)} ms), then pick a threshold-and-objective pair that your normal
              traffic actually satisfies.
            </p>
          </div>
        )}
        <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', marginBottom: 0 }}>
          Practical pattern: run two latency SLOs — a tight one at a lenient objective (“90% under
          300 ms”, user happiness) and a loose one at a strict objective (“99.9% under 2 s”,
          nothing hangs). Each gets the same MWMBR treatment.
        </p>
      </div>
    </section>
  )
}
