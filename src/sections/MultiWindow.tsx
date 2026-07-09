import { useMemo, useState } from 'react'
import { StatCard } from '../components/StatCard'
import { TimeSeriesChart, type Band } from '../components/TimeSeriesChart'
import type { AlertRule, Scenario } from '../engine'
import { formatMinutes } from '../lib/format'
import { useSimulation } from '../lib/useSimulation'

const OBJECTIVE = 0.999

export function MultiWindow() {
  const [useShort, setUseShort] = useState(true)

  const scenario: Scenario = useMemo(
    () => ({
      kind: 'full-outage',
      startMin: 6 * 60,
      durationMin: 40,
      errorRate: 1,
      baselineErrorRate: 0,
    }),
    [],
  )
  const rules: AlertRule[] = useMemo(
    () => [
      { id: 'long-only', name: 'Long window only', severity: 'page', longWindowMin: 60, shortWindowMin: 0, burnRate: 14.4 },
      { id: 'mw', name: 'Multiwindow', severity: 'page', longWindowMin: 60, shortWindowMin: 5, burnRate: 14.4 },
    ],
    [],
  )
  const sim = useSimulation({
    shape: 'steady',
    tps: 100,
    horizonDays: 0.5,
    scenario,
    objective: OBJECTIVE,
    sloWindowDays: 30,
    rules,
  })
  const active = sim.evaluations[useShort ? 1 : 0]
  const longOnly = sim.evaluations[0]
  const withShort = sim.evaluations[1]

  const bands: Band[] = [
    { start: sim.incident!.startMin, end: sim.incident!.endMin, color: 'var(--ink-muted)', label: 'outage (40 min)' },
    ...active.intervals.map((iv) => ({
      start: iv.start,
      end: iv.end,
      color: 'var(--status-critical)',
      label: 'alert firing',
    })),
  ]

  return (
    <section className="lesson" id="multi-window">
      <h2>
        <span className="kicker">5 · Refinement one</span>
        Multiwindow: add a short window to clear fast
      </h2>
      <p>
        After a 40-minute outage ends, a 1-hour window still contains those 40 bad minutes — for
        almost another hour. A long-window alert keeps paging people about a problem that’s{' '}
        <em>already fixed</em>. The fix: require a <strong>short window</strong> (the workbook
        suggests <sup>1</sup>⁄<sub>12</sub> of the long one) to <em>also</em> be over the
        threshold, confirming the budget is being spent <em>right now</em>:
      </p>
      <p>
        <strong>
          fire ⇔ burn rate<sub>1h</sub> ≥ 14.4 AND burn rate<sub>5m</sub> ≥ 14.4
        </strong>
      </p>

      <div className="card">
        <div className="controls">
          <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: '0.9rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={useShort} onChange={(e) => setUseShort(e.target.checked)} />
            Require the 5-minute window too (multiwindow)
          </label>
        </div>
        <TimeSeriesChart
          title="Burn rates around a 40-minute full outage (log scale)"
          series={[
            { id: 'long', label: '1h burn rate', color: 'var(--series-1)', data: sim.burnRates.get(60)! },
            { id: 'short', label: '5m burn rate', color: 'var(--series-3)', data: sim.burnRates.get(5)! },
          ]}
          thresholds={[{ value: 14.4, label: '14.4×' }]}
          bands={bands}
          yScale="log"
          height={220}
        />
        <div className="stat-row">
          <StatCard
            label="Detection time"
            value={formatMinutes(active.detectionMinutes)}
            note="both variants detect fast — the short window barely delays it"
          />
          <StatCard
            label="Reset time (long only)"
            value={formatMinutes(longOnly.resetMinutes)}
            tone="bad"
            note="keeps firing while the 1h window drains"
          />
          <StatCard
            label="Reset time (multiwindow)"
            value={formatMinutes(withShort.resetMinutes)}
            tone="good"
            note="clears as soon as the 5m window is clean"
          />
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', marginBottom: 0 }}>
          Toggle the checkbox and watch the red firing band: the yellow 5-minute burn rate
          collapses within minutes of recovery, releasing the alert, while the blue 1-hour rate
          stays elevated for the rest of the hour. Detection barely changes — the short window
          reaches 14.4× in well under a minute during a real outage.
        </p>
      </div>
    </section>
  )
}
