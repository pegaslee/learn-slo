import { useMemo } from 'react'
import { StatCard } from '../../components/StatCard'
import { TimeSeriesChart, type Band } from '../../components/TimeSeriesChart'
import { BurnRateCalculator, evaluateRule, makeRng, type AlertRule } from '../../engine'
import { formatMinutes, formatPercent } from '../../lib/format'

const HORIZON = 7 * 1440
const RUN_EVERY = 60 // pipeline cadence, minutes
const FRESH_LIMIT = 120 // SLO: data no staler than this
const OBJECTIVE = 0.99 // 99% of minutes fresh, 30d window
const BAD_PATCH_START = 3 * 1440 // six consecutive failed runs
const BAD_PATCH_RUNS = 6
const RULE: AlertRule = {
  id: 'fresh-page',
  name: 'Freshness page',
  severity: 'page',
  longWindowMin: 60,
  shortWindowMin: 5,
  burnRate: 14.4,
}

function simulate() {
  const rng = makeRng(41)
  // Which runs fail: a couple of random one-off failures plus the bad patch.
  const failedRuns = new Set<number>()
  for (let run = 1; run * RUN_EVERY < HORIZON; run++) {
    if (rng() < 0.02) failedRuns.add(run)
  }
  const firstBadRun = Math.ceil(BAD_PATCH_START / RUN_EVERY)
  for (let i = 0; i < BAD_PATCH_RUNS; i++) failedRuns.add(firstBadRun + i)

  const freshness: number[] = []
  const good: number[] = []
  const bad: number[] = []
  let lastSuccess = 0
  for (let t = 0; t < HORIZON; t++) {
    if (t > 0 && t % RUN_EVERY === 0 && !failedRuns.has(t / RUN_EVERY)) lastSuccess = t
    const f = t - lastSuccess
    freshness.push(f)
    const fresh = f <= FRESH_LIMIT
    good.push(fresh ? 1 : 0) // one event per minute: a time-based SLI
    bad.push(fresh ? 0 : 1)
  }
  const calc = new BurnRateCalculator(good, bad)
  const breachStart = BAD_PATCH_START + FRESH_LIMIT
  const breachEnd = (firstBadRun + BAD_PATCH_RUNS) * RUN_EVERY
  const evaln = evaluateRule(calc, RULE, OBJECTIVE, 30 * 1440, {
    startMin: breachStart,
    endMin: breachEnd,
  })
  const breachMinutes = bad.reduce((a, b) => a + b, 0)
  return { freshness, burn: calc.burnRateSeries(60, OBJECTIVE), evaln, breachStart, breachEnd, breachMinutes }
}

export function Freshness() {
  const sim = useMemo(simulate, [])
  const monthlyBudgetMin = (1 - OBJECTIVE) * 30 * 1440
  const bands: Band[] = [
    { start: BAD_PATCH_START, end: sim.breachEnd, color: 'var(--ink-muted)', label: '6 consecutive failed runs' },
    ...sim.evaln.intervals.map((iv) => ({
      start: iv.start,
      end: iv.end,
      color: 'var(--status-critical)',
      label: 'burn alert firing',
    })),
  ]

  return (
    <section className="lesson" id="cb-freshness">
      <h2>
        <span className="kicker">Recipe 3 · Lumpy by nature</span>
        Batch pipelines &amp; freshness SLOs
      </h2>
      <p>
        <strong>Profile:</strong> a pipeline refreshes data every hour; the SLO is{' '}
        <em>“99% of minutes, data is no staler than 2 hours.”</em> This is a{' '}
        <strong>time-based SLI</strong> — each minute is one event, good if fresh — and the burn
        math still works. But the <em>signal</em> is nothing like request errors: it’s binary,
        arrives in lumps at run cadence, and is invisible until the freshness limit is crossed.
      </p>
      <div className="card">
        <TimeSeriesChart
          title="Data staleness (minutes) — one failed run is harmless by construction"
          series={[{ id: 'f', label: 'staleness', color: 'var(--series-1)', data: sim.freshness, area: true }]}
          thresholds={[{ value: FRESH_LIMIT, label: '2h limit' }]}
          bands={bands.slice(0, 1)}
          formatValue={(v) => formatMinutes(v)}
          height={180}
        />
        <TimeSeriesChart
          title="1-hour burn rate of the freshness SLI (log scale) — binary: zero, then huge"
          series={[{ id: 'b', label: '1h burn rate', color: 'var(--series-5)', data: sim.burn }]}
          thresholds={[{ value: RULE.burnRate, label: '14.4×' }]}
          bands={bands}
          yScale="log"
          height={180}
        />
        <div className="stat-row">
          <StatCard
            label="Single failed run"
            value="0 breach minutes"
            tone="good"
            note="staleness peaks at 119m < 2h limit — the limit being 2× cadence is the design"
          />
          <StatCard
            label="Bad patch breach"
            value={formatMinutes(sim.breachMinutes)}
            tone="bad"
            note={`${formatPercent(sim.breachMinutes / monthlyBudgetMin, 0)} of the monthly budget in one incident`}
          />
          <StatCard
            label="Burn alert fired"
            value={
              sim.evaln.detectionMinutes !== null
                ? `${formatMinutes(sim.evaln.detectionMinutes)} after breach`
                : 'never'
            }
            note={`i.e. ${formatMinutes(FRESH_LIMIT + (sim.evaln.detectionMinutes ?? 0))} after the first failure`}
          />
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', marginBottom: 0 }}>
          <strong>Recommendations:</strong> windows shorter than the run cadence add nothing — the
          SLI can’t change between runs. Burn thresholds between 1× and max are near-equivalent
          because the burn is binary. Most importantly, the budget alert fires only <em>after</em>{' '}
          users have stale data; pair it with an <strong>operational alert on the cause</strong>{' '}
          (N consecutive run failures, or staleness &gt; 90m — before the limit) and keep the burn
          alert as the user-impact backstop and ticket generator.
        </p>
      </div>
    </section>
  )
}
