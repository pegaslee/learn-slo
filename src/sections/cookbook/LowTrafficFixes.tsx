import { useMemo, useState } from 'react'
import { Slider } from '../../components/controls'
import { StatCard } from '../../components/StatCard'
import { TimeSeriesChart, type Band } from '../../components/TimeSeriesChart'
import {
  binomial,
  BurnRateCalculator,
  evaluateRule,
  generateTraffic,
  makeRng,
  type AlertRule,
} from '../../engine'
import { formatMinutes } from '../../lib/format'

const HORIZON = 28 * 1440
const OBJECTIVE = 0.999
const REAL_TPS = 0.005 // ~1 request every 3 minutes
const BASELINE_ERR = 0.0005
const OUTAGE = { startMin: 14 * 1440, endMin: 14 * 1440 + 120 }
const RULE: AlertRule = {
  id: 'fast',
  name: 'Fast page',
  severity: 'page',
  longWindowMin: 60,
  shortWindowMin: 5,
  burnRate: 14.4,
}

export function LowTrafficFixes() {
  const [probesPerMin, setProbesPerMin] = useState(0)

  const sim = useMemo(() => {
    const real = generateTraffic('steady', REAL_TPS, HORIZON, 51)
    const rng = makeRng(52)
    const good: number[] = []
    const bad: number[] = []
    for (let t = 0; t < HORIZON; t++) {
      const down = t >= OUTAGE.startMin && t < OUTAGE.endMin
      // Probes exercise the real request path, so they fail when it's down.
      const total = real[t] + probesPerMin
      const failures = down ? total : binomial(real[t], BASELINE_ERR, rng)
      bad.push(failures)
      good.push(total - failures)
    }
    const calc = new BurnRateCalculator(good, bad)
    const evaln = evaluateRule(calc, RULE, OBJECTIVE, 30 * 1440, OUTAGE)
    const falsePages = evaln.intervals.filter(
      (iv) => iv.end <= OUTAGE.startMin || iv.start >= OUTAGE.endMin + 60,
    )
    return { burn: calc.burnRateSeries(60, OBJECTIVE), evaln, falsePages }
  }, [probesPerMin])

  const bands: Band[] = [
    { start: OUTAGE.startMin, end: OUTAGE.endMin, color: 'var(--ink-muted)', label: 'real outage (2h)' },
    ...sim.falsePages.map((iv) => ({
      start: iv.start,
      end: iv.end,
      color: 'var(--status-critical)',
      label: 'false page',
    })),
  ]

  return (
    <section className="lesson" id="cb-low-traffic">
      <h2>
        <span className="kicker">Recipe 4 · The fixes, working</span>
        Low-traffic services: synthetic traffic
      </h2>
      <p>
        Learn §7b showed the disease: at ~1 request every 3 minutes, every ordinary baseline
        failure <em>is</em> a page, because one bad request dominates any short window. Here is
        the standard cure — <strong>synthetic probe traffic</strong> that exercises the real
        request path — applied to a month of an internal tool’s life with one genuine 2-hour
        outage in the middle.
      </p>
      <div className="card">
        <div className="controls">
          <Slider
            label="Synthetic probes"
            min={0}
            max={10}
            value={probesPerMin}
            onChange={setProbesPerMin}
            format={(v) => (v === 0 ? 'none' : `${v} / minute`)}
          />
        </div>
        <TimeSeriesChart
          title="1-hour burn rate over 4 weeks (log scale)"
          series={[{ id: 'b', label: '1h burn rate', color: 'var(--series-1)', data: sim.burn }]}
          thresholds={[{ value: RULE.burnRate, label: '14.4×' }]}
          bands={bands}
          yScale="log"
          height={200}
        />
        <div className="stat-row">
          <StatCard
            label="False pages in 4 weeks"
            value={String(sim.falsePages.length)}
            tone={sim.falsePages.length === 0 ? 'good' : 'bad'}
            note={
              probesPerMin === 0
                ? 'every organic hiccup pages someone'
                : 'probes swell the denominator; one failure no longer moves it'
            }
          />
          <StatCard
            label="Real outage detected in"
            value={
              sim.evaln.detectionMinutes !== null ? formatMinutes(sim.evaln.detectionMinutes) : 'missed'
            }
            tone={sim.evaln.detectionMinutes !== null && sim.evaln.detectionMinutes <= 5 ? 'good' : 'warn'}
            note={probesPerMin === 0 ? 'must wait for a real request to arrive and fail' : 'probes guarantee signal every minute'}
          />
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', marginBottom: 0 }}>
          <strong>Cautions:</strong> probes must exercise the same path users take (a `/healthz`
          that skips auth and the database proves nothing) and flaky probes re-import the noise
          problem — budget probe reliability like production code. If probes are impractical:
          aggregate several small services into one SLO, stretch the windows (slower detection,
          honestly traded), or demote pages to tickets for services where hours of response time
          is genuinely fine.
        </p>
      </div>
    </section>
  )
}
