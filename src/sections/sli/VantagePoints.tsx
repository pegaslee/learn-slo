import { useMemo } from 'react'
import { StatCard } from '../../components/StatCard'
import { TimeSeriesChart, type Band } from '../../components/TimeSeriesChart'
import {
  binomial,
  BurnRateCalculator,
  evaluateRule,
  generateTraffic,
  makeRng,
  poisson,
  type AlertRule,
} from '../../engine'
import { formatMinutes } from '../../lib/format'

const OBJECTIVE = 0.999
const HORIZON = 12 * 60
const OUTAGE = { startMin: 6 * 60, endMin: 6 * 60 + 30 }
const RULE: AlertRule = {
  id: 'fast',
  name: 'Fast page',
  severity: 'page',
  longWindowMin: 60,
  shortWindowMin: 5,
  burnRate: 14.4,
}

/**
 * One 30-minute total crash of every server, observed from three vantage
 * points. Each produces a different good/bad series from the same reality.
 */
function simulate() {
  const traffic = generateTraffic('steady', 100, HORIZON, 21)
  const rng = makeRng(22)
  const down = (t: number) => t >= OUTAGE.startMin && t < OUTAGE.endMin

  // Server-side metrics: crashed processes export nothing. Outside the
  // outage a 0.05% app-error baseline; during it, zero requests recorded.
  const server = { good: [] as number[], bad: [] as number[] }
  // Load balancer: sees every attempt; timeouts to dead backends are 5xx.
  const lb = { good: [] as number[], bad: [] as number[] }
  // Synthetic prober: one request every 5 minutes, 0.3% flake rate.
  const probe = { good: [] as number[], bad: [] as number[] }

  for (let t = 0; t < HORIZON; t++) {
    const appErrors = binomial(traffic[t], 0.0005, rng)
    if (down(t)) {
      server.good.push(0)
      server.bad.push(0) // nobody home to report an error
      lb.good.push(0)
      lb.bad.push(traffic[t])
    } else {
      server.good.push(traffic[t] - appErrors)
      server.bad.push(appErrors)
      lb.good.push(traffic[t] - appErrors)
      lb.bad.push(appErrors)
    }
    const probes = t % 5 === 2 ? Math.max(1, poisson(1, rng)) : 0
    const probeFails = down(t) ? probes : binomial(probes, 0.003, rng)
    probe.good.push(probes - probeFails)
    probe.bad.push(probeFails)
  }

  const views = [
    { id: 'server', label: 'Server-side metrics', color: 'var(--series-2)', ...server },
    { id: 'lb', label: 'Load balancer logs', color: 'var(--series-1)', ...lb },
    { id: 'probe', label: 'Synthetic prober (1 req / 5 min)', color: 'var(--series-5)', ...probe },
  ].map((v) => {
    const calc = new BurnRateCalculator(v.good, v.bad)
    const evaln = evaluateRule(calc, RULE, OBJECTIVE, 30 * 1440, {
      startMin: OUTAGE.startMin,
      endMin: OUTAGE.endMin,
    })
    return { ...v, burn: calc.burnRateSeries(60, OBJECTIVE), evaln }
  })
  return views
}

export function VantagePoints() {
  const views = useMemo(simulate, [])
  const bands: Band[] = [
    { start: OUTAGE.startMin, end: OUTAGE.endMin, color: 'var(--ink-muted)', label: 'every server crashed (30 min)' },
  ]
  const notes: Record<string, string> = {
    server: 'crashed servers export no metrics — the outage is invisible',
    lb: 'timeouts count as errors — sees the outage instantly',
    probe: 'catches it, but one probe per 5 minutes is slow and flaky',
  }

  return (
    <section className="lesson" id="vantage">
      <h2>
        <span className="kicker">2 · Where you measure</span>
        Same outage, three monitors
      </h2>
      <p>
        This is the trap that has bitten nearly every team once:{' '}
        <strong>a crashed server serves no 500s.</strong> If your SLI is computed from metrics the
        application itself exports, your worst outage — every process down — is the moment your
        error rate reads <em>zero</em>. Below, the identical 30-minute total crash as seen by
        three different measurement points, each feeding the same 14.4× ⁄ 1h ⁄ 5m page at 99.9%.
      </p>
      <div className="card">
        <TimeSeriesChart
          title="1-hour burn rate of the same outage, per vantage point (log scale)"
          series={views.map((v) => ({ id: v.id, label: v.label, color: v.color, data: v.burn }))}
          thresholds={[{ value: 14.4, label: '14.4×' }]}
          bands={bands}
          yScale="log"
          height={220}
        />
        <div className="stat-row">
          {views.map((v) => (
            <StatCard
              key={v.id}
              label={v.label}
              value={
                v.evaln.detectionMinutes !== null
                  ? `paged in ${formatMinutes(v.evaln.detectionMinutes)}`
                  : 'NEVER paged'
              }
              tone={v.evaln.detectionMinutes !== null ? (v.id === 'probe' ? 'warn' : 'good') : 'bad'}
              note={notes[v.id]}
            />
          ))}
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', marginBottom: 0 }}>
          The green server-side line actually <em>improves</em> during the outage — the only
          errors it ever saw were app errors from live processes. Measure as close to the user as
          you can afford: LB or edge logs beat server metrics; real client telemetry beats both
          (but brings its own noise: client networks fail without your service being down).
          Synthetic probes are the safety net, not the primary SLI.
        </p>
      </div>
    </section>
  )
}
