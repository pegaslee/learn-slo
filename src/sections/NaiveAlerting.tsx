import { useMemo, useState } from 'react'
import { Slider } from '../components/controls'
import { StatCard } from '../components/StatCard'
import { TimeSeriesChart, type Band } from '../components/TimeSeriesChart'
import { binomial, BurnRateCalculator, generateTraffic, makeRng } from '../engine'
import { formatMinutes, formatPercent } from '../lib/format'

const DAY = 1440
const HORIZON = 3 * DAY
const TPS = 100
const OBJECTIVE = 0.999
const BLIP_AT = 12 * 60 // hour 12: one bad minute, 50% errors
const SLOW_BURN_FROM = DAY // from day 2 onward: 0.3% errors
const SLOW_BURN_RATE = 0.003

export function NaiveAlerting() {
  const [thresholdPct, setThresholdPct] = useState(1)

  const sim = useMemo(() => {
    const traffic = generateTraffic('steady', TPS, HORIZON, 11)
    const rng = makeRng(12)
    const good: number[] = []
    const bad: number[] = []
    for (let t = 0; t < HORIZON; t++) {
      const rate = t === BLIP_AT ? 0.5 : t >= SLOW_BURN_FROM ? SLOW_BURN_RATE : 0
      const b = binomial(traffic[t], rate, rng)
      bad.push(b)
      good.push(traffic[t] - b)
    }
    const calc = new BurnRateCalculator(good, bad)
    const errPct = calc.errorRatioSeries(10).map((v) => (v === null ? null : v * 100))
    const blipFailures = bad[BLIP_AT]
    const slowBurnFailures = bad.slice(SLOW_BURN_FROM).reduce((a, b) => a + b, 0)
    const monthlyBudget = (1 - OBJECTIVE) * TPS * 60 * 30 * DAY // failed requests allowed / 30d
    return { errPct, blipFailures, slowBurnFailures, monthlyBudget }
  }, [])

  const firing = useMemo(() => {
    const bands: Band[] = []
    let start = -1
    sim.errPct.forEach((v, t) => {
      const on = v !== null && v >= thresholdPct
      if (on && start < 0) start = t
      if (!on && start >= 0) {
        bands.push({ start, end: t, color: 'var(--status-critical)', label: 'naive alert firing' })
        start = -1
      }
    })
    if (start >= 0)
      bands.push({ start, end: HORIZON, color: 'var(--status-critical)', label: 'naive alert firing' })
    return bands
  }, [sim, thresholdPct])

  const firingMinutes = firing.reduce((a, b) => a + (b.end - b.start), 0)
  const caughtBlip = firing.some((b) => b.start <= BLIP_AT + 10 && b.end > BLIP_AT)
  const caughtSlowBurn = firing.some((b) => b.end > SLOW_BURN_FROM + 10)
  const slowBurnDailyBudget = (SLOW_BURN_RATE * TPS * 60 * DAY) / sim.monthlyBudget

  return (
    <section className="lesson" id="naive">
      <h2>
        <span className="kicker">2 · The problem</span>
        Why “error rate &gt; X%” alerting fails
      </h2>
      <p>
        The obvious alert — <em>“page me if the error rate over the last 10 minutes exceeds
        X%”</em> — ignores how much error budget an incident actually costs. The workbook judges
        alerts on four axes: <strong>precision</strong> (what fraction of alerts were significant),{' '}
        <strong>recall</strong> (what fraction of significant events alerted),{' '}
        <strong>detection time</strong>, and <strong>reset time</strong>. Simple thresholds trade
        these off badly.
      </p>
      <p>
        This simulation has a steady 100 TPS service at a 99.9% objective, with two very different
        events: a <strong>1-minute blip of 50% errors</strong> at hour 12 (it costs about{' '}
        {formatPercent(sim.blipFailures / sim.monthlyBudget, 1)} of the monthly budget — nobody
        should be woken for that) and a <strong>continuous 0.3% slow burn</strong> from day 2
        onward, which silently eats ~{formatPercent(slowBurnDailyBudget, 0)} of the monthly budget{' '}
        <em>per day</em> — the whole budget in ~10 days.
      </p>

      <div className="card">
        <div className="controls">
          <Slider
            label="Naive alert: 10-minute error rate ≥"
            min={0.1}
            max={6}
            step={0.1}
            value={thresholdPct}
            onChange={setThresholdPct}
            format={(v) => `${v}%`}
          />
        </div>
        <TimeSeriesChart
          title="Error rate over trailing 10 minutes (%)"
          series={[{ id: 'err', label: '10m error %', color: 'var(--series-6)', data: sim.errPct, area: true }]}
          thresholds={[{ value: thresholdPct, label: `${thresholdPct}%` }]}
          bands={firing}
          formatValue={(v) => `${v.toFixed(2)}%`}
          height={200}
        />
        <div className="stat-row">
          <StatCard
            label="Paged on the harmless blip?"
            value={caughtBlip ? 'Yes — false page' : 'No'}
            tone={caughtBlip ? 'bad' : 'good'}
            note={`the blip cost only ${formatPercent(sim.blipFailures / sim.monthlyBudget, 1)} of budget`}
          />
          <StatCard
            label="Caught the slow burn?"
            value={caughtSlowBurn ? 'Yes' : 'No — silent budget loss'}
            tone={caughtSlowBurn ? 'good' : 'bad'}
            note={`0.3% errors ≈ ${formatPercent(slowBurnDailyBudget, 0)} of monthly budget per day`}
          />
          <StatCard
            label="Time spent firing"
            value={formatMinutes(firingMinutes)}
            note={caughtSlowBurn ? 'a permanently-firing alert trains people to ignore it' : 'over 3 days'}
          />
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', marginBottom: 0 }}>
          Try to pick a threshold that skips the blip <em>and</em> catches the slow burn. There
          isn’t one: above 0.3% you never see the slow burn; below it the alert fires forever. The
          threshold is measuring the wrong thing — it should measure{' '}
          <strong>budget consumption</strong>, not instantaneous error rate.
        </p>
      </div>
    </section>
  )
}
