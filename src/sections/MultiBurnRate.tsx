import { useMemo, useState } from 'react'
import { AlertTimeline } from '../components/AlertTimeline'
import { SelectField } from '../components/controls'
import { Formula } from '../components/Formula'
import { defaultRules, type Scenario } from '../engine'
import { formatMinutes, formatPercent } from '../lib/format'
import { useSimulation } from '../lib/useSimulation'

const INCIDENTS = [
  { id: 'outage', label: 'Sharp: full outage, 2 hours' },
  { id: 'moderate', label: 'Moderate: 3% errors, 12 hours' },
  { id: 'slow', label: 'Slow burn: 0.2% errors, 5 days' },
] as const
type IncidentId = (typeof INCIDENTS)[number]['id']

const SCENARIOS: Record<IncidentId, Scenario> = {
  outage: { kind: 'full-outage', startMin: 1440, durationMin: 120, errorRate: 1, baselineErrorRate: 0 },
  moderate: { kind: 'partial-outage', startMin: 1440, durationMin: 720, errorRate: 0.03, baselineErrorRate: 0 },
  slow: { kind: 'slow-burn', startMin: 1440, durationMin: 5 * 1440, errorRate: 0.002, baselineErrorRate: 0 },
}

export function MultiBurnRate() {
  const [incident, setIncident] = useState<IncidentId>('outage')
  const rules = useMemo(() => defaultRules(), [])
  const sim = useSimulation({
    shape: 'steady',
    tps: 100,
    horizonDays: 7,
    scenario: SCENARIOS[incident],
    objective: 0.999,
    sloWindowDays: 30,
    rules,
  })

  return (
    <section className="lesson" id="multi-burn-rate">
      <h2>
        <span className="kicker">6 · Refinement two</span>
        Multi-burn-rate: match urgency to threat
      </h2>
      <p>
        One threshold can’t cover both a total outage and a slow leak. So run{' '}
        <strong>several rules in parallel</strong>, each tuned to page (or ticket) when a
        meaningful slice of budget is at stake. A rule’s burn rate and window pin down exactly how
        much budget has been spent by the time it fires:
      </p>
      <Formula tex="\text{budget consumed at detection} = \frac{\text{burn rate} \times \text{window}}{\text{SLO period}}" />
      <p>The workbook’s recommended starting point for a 30-day SLO (its Table 5-6):</p>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="rules">
          <thead>
            <tr>
              <th>Budget consumed</th>
              <th>Burn rate</th>
              <th>Long window</th>
              <th>Short window</th>
              <th>Action</th>
              <th>Catches</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>2% in 1 hour</td>
              <td>14.4×</td>
              <td>1h</td>
              <td>5m</td>
              <td><span className="severity-chip page">page</span></td>
              <td>outages, severe regressions — minutes matter</td>
            </tr>
            <tr>
              <td>5% in 6 hours</td>
              <td>6×</td>
              <td>6h</td>
              <td>30m</td>
              <td><span className="severity-chip page">page</span></td>
              <td>sustained moderate breakage</td>
            </tr>
            <tr>
              <td>10% in 3 days</td>
              <td>1×</td>
              <td>3d</td>
              <td>6h</td>
              <td><span className="severity-chip ticket">ticket</span></td>
              <td>slow burns — fix during business hours</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="controls">
          <SelectField
            label="Incident type"
            value={incident}
            options={INCIDENTS.map((i) => ({ id: i.id, label: i.label }))}
            onChange={setIncident}
          />
        </div>
        <AlertTimeline evaluations={sim.evaluations} minutes={sim.minutes} incident={sim.incident} />
        <div className="stat-row">
          {sim.evaluations.map((ev) => (
            <div className="stat-tile" key={ev.rule.id}>
              <div className="label">
                {ev.rule.name} ({ev.rule.burnRate}× / {formatMinutes(ev.rule.longWindowMin)})
              </div>
              <div className="value">
                {ev.detectionMinutes !== null ? formatMinutes(ev.detectionMinutes) : 'silent'}
              </div>
              <div className="note">
                {ev.detectionMinutes !== null
                  ? `fires with ${formatPercent(ev.budgetConsumedAtDetection, 1)} of budget spent`
                  : 'burn rate stays below this threshold'}
              </div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', marginBottom: 0 }}>
          The sharp outage trips the fast page in ~1 minute. The moderate incident is invisible to
          the 14.4× rule but pages via the 6× rule. The slow burn (a 2× burn rate) never pages
          anyone — it files a ticket, which is exactly the right response for a problem that will
          take days to matter. Each tier trades detection speed for precision, and together they
          cover the spectrum.
        </p>
      </div>
    </section>
  )
}
