import { useMemo, useState } from 'react'
import { SelectField, Slider } from '../components/controls'
import { Formula } from '../components/Formula'
import { StatCard } from '../components/StatCard'
import { TimeSeriesChart, type Band } from '../components/TimeSeriesChart'
import { theoreticalDetectionMinutes, type AlertRule, type Scenario } from '../engine'
import { formatMinutes, formatPercent } from '../lib/format'
import { useSimulation } from '../lib/useSimulation'

const OBJECTIVE = 0.999
const WINDOWS = [
  { id: '5', label: '5 minutes' },
  { id: '60', label: '1 hour' },
  { id: '360', label: '6 hours' },
  { id: '1440', label: '1 day' },
]

export function SingleWindow() {
  const [windowMin, setWindowMin] = useState('60')
  const [threshold, setThreshold] = useState(10)

  const scenario: Scenario = useMemo(
    () => ({
      kind: 'partial-outage',
      startMin: 2 * 1440,
      durationMin: 8 * 60,
      errorRate: 0.1,
      baselineErrorRate: 0.0005,
    }),
    [],
  )
  const rules: AlertRule[] = useMemo(
    () => [
      {
        id: 'single',
        name: 'Single-window alert',
        severity: 'page',
        longWindowMin: Number(windowMin),
        shortWindowMin: 0,
        burnRate: threshold,
      },
    ],
    [windowMin, threshold],
  )
  const sim = useSimulation({
    shape: 'steady',
    tps: 100,
    horizonDays: 4,
    scenario,
    objective: OBJECTIVE,
    sloWindowDays: 30,
    rules,
  })
  const ev = sim.evaluations[0]
  const bands: Band[] = [
    { start: sim.incident!.startMin, end: sim.incident!.endMin, color: 'var(--ink-muted)', label: 'incident (10% errors)' },
    ...ev.intervals.map((iv) => ({
      start: iv.start,
      end: iv.end,
      color: 'var(--status-critical)',
      label: 'alert firing',
    })),
  ]
  const theory = theoreticalDetectionMinutes(rules[0], OBJECTIVE, 0.1)

  return (
    <section className="lesson" id="single-window">
      <h2>
        <span className="kicker">4 · First attempt</span>
        Alerting on burn rate over a window
      </h2>
      <p>
        Better idea: page when the burn rate <em>measured over some window</em> crosses a
        threshold. The window is doing real work here. For a constant error ratio the alert trips
        after:
      </p>
      <Formula tex="\text{detection time} = \frac{\text{threshold} \times (1 - \text{objective})}{\text{error ratio}} \times \text{window}" />
      <p>
        The simulation below is a 100 TPS service at 99.9% suffering an 8-hour, 10%-errors partial
        outage (a 100× burn rate). Play with the window and threshold and watch the four alert
        qualities fight each other:
      </p>

      <div className="card">
        <div className="controls">
          <SelectField label="Window" value={windowMin as '60'} options={WINDOWS} onChange={setWindowMin} />
          <Slider
            label="Burn-rate threshold"
            min={1}
            max={20}
            step={0.5}
            value={threshold}
            onChange={setThreshold}
            format={(v) => `${v}×`}
          />
        </div>
        <TimeSeriesChart
          title={`Burn rate over ${formatMinutes(Number(windowMin))} (log scale)`}
          series={[
            {
              id: 'br',
              label: `${formatMinutes(Number(windowMin))} burn rate`,
              color: 'var(--series-1)',
              data: sim.burnRates.get(Number(windowMin))!,
            },
          ]}
          thresholds={[{ value: threshold, label: `${threshold}×` }]}
          bands={bands}
          yScale="log"
          height={210}
        />
        <div className="stat-row">
          <StatCard
            label="Detection time"
            value={ev.detectionMinutes !== null ? formatMinutes(ev.detectionMinutes) : 'never'}
            tone={ev.detectionMinutes === null ? 'bad' : ev.detectionMinutes > 120 ? 'warn' : 'good'}
            note={theory !== null ? `theory: ${formatMinutes(theory)}` : 'threshold above what 10% errors can reach'}
          />
          <StatCard
            label="Reset time"
            value={formatMinutes(ev.resetMinutes)}
            tone={(ev.resetMinutes ?? 0) > 60 ? 'warn' : 'neutral'}
            note="still firing after the incident is over"
          />
          <StatCard
            label="Budget consumed before firing"
            value={ev.detectionMinutes !== null ? formatPercent(ev.budgetConsumedAtDetection, 1) : '—'}
            note="threshold × window ÷ SLO period"
          />
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', marginBottom: 0 }}>
          A <strong>short window</strong> detects fast but fires on transient blips (poor
          precision) — try 5 minutes and note the background-noise spikes. A{' '}
          <strong>long window</strong> is precise but slow to fire <em>and</em> slow to clear:
          with a 6-hour window the alert keeps paging for hours after recovery. That reset-time
          problem is what the next section fixes.
        </p>
      </div>
    </section>
  )
}
