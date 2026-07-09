import { useMemo } from 'react'
import { AlertTimeline } from '../../components/AlertTimeline'
import { StatCard } from '../../components/StatCard'
import { defaultRules, type Scenario } from '../../engine'
import { formatMinutes, formatPercent } from '../../lib/format'
import { useSimulation } from '../../lib/useSimulation'

const SCENARIO: Scenario = {
  kind: 'partial-outage',
  startMin: 2 * 1440,
  durationMin: 4 * 60,
  errorRate: 0.1,
  baselineErrorRate: 0.0003,
}

export function BusyApi() {
  const rules = useMemo(() => defaultRules(), [])
  const sim = useSimulation({
    shape: 'diurnal',
    tps: 200,
    horizonDays: 5,
    scenario: SCENARIO,
    objective: 0.999,
    sloWindowDays: 30,
    rules,
  })
  const fast = sim.evaluations[0]

  return (
    <section className="lesson" id="cb-busy-api">
      <h2>
        <span className="kicker">Recipe 1 · The textbook case</span>
        High-volume user-facing API
      </h2>
      <p>
        <strong>Profile:</strong> hundreds of TPS, request/response, users notice failures
        immediately. <strong>Recommendation:</strong> take the workbook defaults verbatim — 99.9%
        over 30 days, the 14.4×/6×/1× trio — and spend your energy on the SLI definition instead
        (see SLIs &amp; Queries). This is the workload MWMBR was designed for: volume keeps ratios
        smooth, diurnal cycles don’t matter because burn rate is traffic-weighted, and every tier
        has a clear runbook meaning.
      </p>
      <div className="card">
        <AlertTimeline evaluations={sim.evaluations} minutes={sim.minutes} incident={sim.incident} />
        <div className="stat-row">
          <StatCard
            label="10% outage paged in"
            value={formatMinutes(fast.detectionMinutes)}
            tone="good"
            note={`with ${formatPercent(fast.budgetConsumedAtDetection, 1)} of budget spent`}
          />
          <StatCard label="Reset after recovery" value={formatMinutes(fast.resetMinutes)} tone="good" />
          <StatCard
            label="False pages"
            value="0"
            tone="good"
            note="baseline noise never reaches 14.4× at this volume"
          />
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', marginBottom: 0 }}>
          <strong>Pitfalls anyway:</strong> per-endpoint SLOs beat one service-wide SLO once a
          service mixes cheap reads with critical writes — a broken checkout hiding inside a
          healthy browse ratio is the classic miss. Start service-wide, split when an incident
          teaches you the split.
        </p>
      </div>
    </section>
  )
}
