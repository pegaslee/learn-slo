import { useMemo, useState } from 'react'
import { StopSlider } from '../components/controls'
import { Formula } from '../components/Formula'
import { StatCard } from '../components/StatCard'
import { TimeSeriesChart, type Band } from '../components/TimeSeriesChart'
import {
  defaultRules,
  maxBurnRate,
  theoreticalDetectionMinutes,
  type AlertRule,
  type Scenario,
} from '../engine'
import { formatCompact, formatMinutes, formatObjective, OBJECTIVE_STOPS } from '../lib/format'
import { useSimulation } from '../lib/useSimulation'

function LowObjectiveDemo() {
  const [objective, setObjective] = useState(0.9)
  const scenario: Scenario = useMemo(
    () => ({ kind: 'full-outage', startMin: 12 * 60, durationMin: 6 * 60, errorRate: 1, baselineErrorRate: 0 }),
    [],
  )
  const rules: AlertRule[] = useMemo(
    () => [{ id: 'fast', name: 'Fast page', severity: 'page', longWindowMin: 60, shortWindowMin: 5, burnRate: 14.4 }],
    [],
  )
  const sim = useSimulation({
    shape: 'steady',
    tps: 100,
    horizonDays: 1.5,
    scenario,
    objective,
    sloWindowDays: 30,
    rules,
  })
  const ev = sim.evaluations[0]
  const mbr = maxBurnRate(objective)
  const bands: Band[] = [
    { start: sim.incident!.startMin, end: sim.incident!.endMin, color: 'var(--ink-muted)', label: 'TOTAL outage (6h)' },
    ...ev.intervals.map((iv) => ({ start: iv.start, end: iv.end, color: 'var(--status-critical)', label: 'alert firing' })),
  ]
  const minObjective = 1 - 1 / 14.4

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Interactive: watch the page go silent</h3>
      <p style={{ fontSize: '0.9rem' }}>
        A <strong>100% outage</strong> for six hours, against the standard 14.4× ⁄ 1h ⁄ 5m page.
        Lower the objective and watch the burn rate flatline <em>below</em> the threshold — during
        a total outage.
      </p>
      <div className="controls">
        <StopSlider
          label="Objective"
          stops={OBJECTIVE_STOPS}
          value={objective}
          onChange={setObjective}
          format={formatObjective}
        />
      </div>
      <TimeSeriesChart
        title="1-hour burn rate during a TOTAL outage (log scale)"
        series={[{ id: 'br', label: '1h burn rate', color: 'var(--series-1)', data: sim.burnRates.get(60)! }]}
        thresholds={[
          { value: 14.4, label: '14.4×' },
          { value: mbr, label: `max ${formatCompact(mbr)}×`, color: 'var(--ink-muted)' },
        ]}
        bands={bands}
        yScale="log"
        height={210}
      />
      <div className="stat-row">
        <StatCard
          label="Max possible burn rate"
          value={`${formatCompact(mbr)}×`}
          tone={mbr < 14.4 ? 'bad' : 'good'}
          note={`= 1 / (1 − ${formatObjective(objective)})`}
        />
        <StatCard
          label="Did the page fire?"
          value={ev.totalFiringMinutes > 0 ? `yes, after ${formatMinutes(ev.detectionMinutes)}` : 'NO — total outage, no page'}
          tone={ev.totalFiringMinutes > 0 ? 'good' : 'bad'}
          note={ev.canEverFire ? undefined : 'mathematically impossible at this objective'}
        />
        <StatCard
          label="14.4× needs objective ≥"
          value={`${(minObjective * 100).toFixed(1)}%`}
          note="1 − 1/14.4 — below this, delete or retune the rule"
        />
      </div>
    </div>
  )
}

function LowTrafficDemo() {
  const [tps, setTps] = useState(0.03)
  const scenario: Scenario = useMemo(
    () => ({ kind: 'none', startMin: 0, durationMin: 0, errorRate: 0, baselineErrorRate: 0.001 }),
    [],
  )
  const rules: AlertRule[] = useMemo(
    () => [{ id: 'fast', name: 'Fast page', severity: 'page', longWindowMin: 60, shortWindowMin: 5, burnRate: 14.4 }],
    [],
  )
  const sim = useSimulation({
    shape: 'steady',
    tps,
    horizonDays: 7,
    scenario,
    objective: 0.999,
    sloWindowDays: 30,
    rules,
  })
  const ev = sim.evaluations[0]
  const bands: Band[] = ev.intervals.map((iv) => ({
    start: iv.start,
    end: iv.end,
    color: 'var(--status-critical)',
    label: 'false page',
  }))

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Interactive: one unlucky request pages you</h3>
      <p style={{ fontSize: '0.9rem' }}>
        A healthy service — just a 0.1% background error rate, exactly on budget at 99.9% — over
        one week. Nothing here deserves a page. Slide the traffic down and watch sampling noise
        alone cross a 14.4× threshold: with two requests a minute, a single failure is 10–100% of
        a small window.
      </p>
      <div className="controls">
        <StopSlider
          label="Traffic"
          stops={[0.01, 0.03, 0.1, 0.3, 1, 3, 10, 100]}
          value={tps}
          onChange={setTps}
          format={(v) => `${v} TPS (~${formatCompact(v * 60)} req/min)`}
        />
      </div>
      <TimeSeriesChart
        title="Burn rates of a HEALTHY service (log scale)"
        series={[
          { id: 'long', label: '1h burn rate', color: 'var(--series-1)', data: sim.burnRates.get(60)! },
          { id: 'short', label: '5m burn rate', color: 'var(--series-3)', data: sim.burnRates.get(5)! },
        ]}
        thresholds={[{ value: 14.4, label: '14.4×' }]}
        bands={bands}
        yScale="log"
        height={210}
      />
      <div className="stat-row">
        <StatCard
          label="False pages this week"
          value={String(ev.intervals.length)}
          tone={ev.intervals.length > 0 ? 'bad' : 'good'}
          note="every one of these wakes someone for nothing"
        />
        <StatCard
          label="Requests per 5m window"
          value={formatCompact(tps * 300)}
          note="one failure = this fraction⁻¹ of the window"
        />
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', marginBottom: 0 }}>
        Workbook mitigations: <strong>generate synthetic traffic</strong> so windows are never
        empty, <strong>aggregate</strong> several small services into one SLO,{' '}
        <strong>lengthen windows</strong> (accepting slower detection), or accept{' '}
        <strong>lower-severity notifications</strong> instead of pages.
      </p>
    </div>
  )
}

function SlowBurnLatency() {
  const rules = defaultRules()
  const rates = [1, 0.1, 0.02, 0.005, 0.002]
  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <h3 style={{ marginTop: 0 }}>Detection is never free: time-to-fire by error rate</h3>
      <p style={{ fontSize: '0.9rem' }}>
        Theoretical time for each default rule to fire at a 99.9% objective, from the workbook’s
        detection-time formula. “—” means the burn rate never reaches that rule’s threshold.
      </p>
      <table className="rules">
        <thead>
          <tr>
            <th>Error rate</th>
            <th>Burn rate</th>
            {rules.map((r) => (
              <th key={r.id}>
                {r.name} ({r.burnRate}× / {formatMinutes(r.longWindowMin)})
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rates.map((e) => (
            <tr key={e}>
              <td>{formatCompact(e * 100)}%</td>
              <td>{formatCompact(e / 0.001)}×</td>
              {rules.map((r) => {
                const t = theoreticalDetectionMinutes(r, 0.999, e)
                return <td key={r.id}>{t === null ? '—' : formatMinutes(t)}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', marginBottom: 0 }}>
        A 0.2% error rate — double your budget’s pace — takes <strong>a day and a half</strong> to
        produce even a ticket. That’s by design (it isn’t urgent), but it means MWMBR alerting
        will never tell you about slow regressions quickly. Budget-attribution dashboards and
        periodic SLO reviews fill that gap, not more alerts.
      </p>
    </div>
  )
}

export function Limitations() {
  return (
    <section className="lesson" id="limitations">
      <h2>
        <span className="kicker">7 · Read the fine print</span>
        Limitations — when MWMBR quietly fails
      </h2>
      <p>
        MWMBR alerting is the workbook’s strongest recommendation, but it inherits hard
        constraints from the arithmetic. Three matter most in practice.
      </p>

      <h3>7a · Low objectives make high thresholds unreachable</h3>
      <p>
        Burn rate is capped at <strong>1 ⁄ (1 − objective)</strong> — the burn rate of a 100%
        outage. If a threshold exceeds that ceiling, the alert is <em>dead code</em>:
      </p>
      <Formula tex="\text{threshold} > \frac{1}{1-\text{objective}} \;\Rightarrow\; \text{alert can never fire}" />
      <p>
        At a 90% objective the ceiling is 10×, so the standard 14.4× page{' '}
        <strong>cannot fire during a full outage</strong>. Nothing warns you about this — the rule
        just sits there looking protective. Any rule with threshold ≥ 14.4 requires an objective
        of at least ~93.1%.
      </p>
      <LowObjectiveDemo />

      <div className="callout warn">
        <p>
          <strong>Rule of thumb:</strong> before shipping a burn-rate alert, check{' '}
          <em>threshold &lt; 1 ⁄ (1 − objective)</em>, with real headroom — a threshold just under
          the ceiling only fires when errors are near 100%.
        </p>
      </div>

      <h3>7b · Low traffic turns burn rates into noise</h3>
      <p>
        Burn rate is a ratio. With a handful of requests per window, a single failed request moves
        the ratio by tens of percent, so short windows produce absurd burn rates from ordinary
        bad luck — and empty windows produce no signal at all.
      </p>
      <LowTrafficDemo />

      <h3>7c · Slow burns are detected slowly — by design</h3>
      <SlowBurnLatency />

      <h3>Other caveats worth knowing</h3>
      <ul>
        <li>
          <strong>Recovering budget takes as long as burning it was fast.</strong> After a big
          incident the 3-day ticket window stays hot for days; expect a long-firing ticket tail.
        </li>
        <li>
          <strong>The math assumes request-based SLIs.</strong> Latency SLOs (“90% of requests
          faster than 500 ms”) work, but you must count slow requests as “bad” to reuse this
          machinery.
        </li>
        <li>
          <strong>Thresholds assume a specific SLO period.</strong> The 14.4/6/1 trio is tuned for
          30 days; changing the period rescales what each burn rate means in budget terms.
        </li>
        <li>
          <strong>Nulls and gaps lie.</strong> If your monitoring loses data during an outage
          (often exactly when things are worst), window ratios silently understate the damage.
        </li>
      </ul>
    </section>
  )
}
