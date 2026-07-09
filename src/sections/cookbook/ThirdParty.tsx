import { useMemo } from 'react'
import { Formula } from '../../components/Formula'
import { StatCard } from '../../components/StatCard'
import { TimeSeriesChart, type Band } from '../../components/TimeSeriesChart'
import { defaultRules, type Scenario } from '../../engine'
import { formatMinutes, formatPercent } from '../../lib/format'
import { useSimulation } from '../../lib/useSimulation'

const OBJECTIVE = 0.999
// A hard dependency quietly failing 0.08% of your requests, plus your own
// 0.05% bugs — and one 30-minute dependency outage.
const DEP_BASELINE = 0.0008
const OWN_BASELINE = 0.0005

export function ThirdParty() {
  const rules = useMemo(() => defaultRules(), [])
  const scenario: Scenario = useMemo(
    () => ({
      kind: 'full-outage',
      startMin: 5 * 1440,
      durationMin: 30,
      errorRate: 1,
      baselineErrorRate: DEP_BASELINE + OWN_BASELINE,
    }),
    [],
  )
  const sim = useSimulation({
    shape: 'steady',
    tps: 50,
    horizonDays: 10,
    scenario,
    objective: OBJECTIVE,
    sloWindowDays: 30,
    rules,
  })
  const fast = sim.evaluations[0]
  const ticket = sim.evaluations[2]
  const depShare = DEP_BASELINE / (1 - OBJECTIVE)
  const bands: Band[] = [
    { start: sim.incident!.startMin, end: sim.incident!.endMin, color: 'var(--ink-muted)', label: 'dependency outage (30m)' },
    ...ticket.intervals.map((iv) => ({
      start: iv.start,
      end: iv.end,
      color: 'var(--status-warning)',
      label: 'ticket firing',
    })),
  ]

  return (
    <section className="lesson" id="cb-third-party">
      <h2>
        <span className="kicker">Recipe 5 · Budget you don't control</span>
        Hard third-party dependencies
      </h2>
      <p>
        If every request traverses a dependency, their unreliability is a straight deduction from
        your budget. The feasibility check comes before any alert tuning:
      </p>
      <Formula tex="\text{objective}_{\text{feasible}} \le 1 - \sum_{\text{hard deps}} (1 - \text{SLO}_{\text{dep}}) - \text{your own failure budget}" />
      <p>
        Promising 99.9% on top of a hard dependency that itself promises 99.5% is arithmetic
        malpractice: their allowed failures are 5× your entire budget. Below, a milder case —
        a dependency actually failing just {formatPercent(DEP_BASELINE, 2)} of requests (well
        inside <em>their</em> SLO) against your 99.9%:
      </p>
      <div className="card">
        <TimeSeriesChart
          title="3-day burn rate with a dependency consuming most of the budget (log scale)"
          series={[{ id: 'b', label: '3d burn rate', color: 'var(--series-1)', data: sim.burnRates.get(3 * 1440)! }]}
          thresholds={[{ value: 1, label: '1× ticket' }]}
          bands={bands}
          yScale="log"
          height={200}
        />
        <div className="stat-row">
          <StatCard
            label="Budget eaten by the dependency"
            value={formatPercent(depShare, 0)}
            tone="bad"
            note={`${formatPercent(DEP_BASELINE, 2)} dep failures ÷ your ${formatPercent(1 - OBJECTIVE, 1)} budget`}
          />
          <StatCard
            label="Ticket alert"
            value={ticket.totalFiringMinutes > 0 ? 'fires chronically' : 'quiet'}
            tone={ticket.totalFiringMinutes > 0 ? 'warn' : 'good'}
            note="combined baseline burn > 1× — a ticket that can never be closed"
          />
          <StatCard
            label="Their 30m outage paged you in"
            value={formatMinutes(fast.detectionMinutes)}
            note="users don't care whose fault it is — but your runbook should"
          />
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', marginBottom: 0 }}>
          <strong>Recommendations:</strong> set your objective from the feasibility formula, not
          from ambition. Split the SLI by failure source (dependency vs. own) so pages route to
          the right runbook — call them, don’t debug your own code. Where the product allows it,
          convert hard dependencies to soft ones (caches, graceful degradation, hedged retries),
          which moves their failures out of your “valid event” denominator entirely. And track
          the dependency’s real performance: their <em>SLO</em> is a promise, their{' '}
          <em>history</em> is data.
        </p>
      </div>
    </section>
  )
}
