import { useState } from 'react'
import { StopSlider } from '../components/controls'
import { Formula } from '../components/Formula'
import { StatCard } from '../components/StatCard'
import {
  formatCompact,
  formatMinutes,
  formatObjective,
  formatPercent,
  OBJECTIVE_STOPS,
} from '../lib/format'

export function Intro() {
  const [objective, setObjective] = useState(0.999)
  const [tps, setTps] = useState(100)
  const budget = 1 - objective
  const sloMin = 30 * 24 * 60

  return (
    <section className="lesson" id="intro">
      <h2>
        <span className="kicker">1 · Foundations</span>
        SLOs and error budgets
      </h2>
      <p>
        A <strong>service level objective (SLO)</strong> is a target for how reliable a service
        should be, measured over a window — for example, <em>“99.9% of requests succeed over a
        rolling 30 days.”</em> Whatever reliability the objective doesn’t demand is yours to spend:
        the <strong>error budget</strong>.
      </p>
      <Formula tex="\text{error budget} = 1 - \text{objective}" />
      <p>
        The budget is the total unreliability you can afford in the SLO window. At 99.9% over 30
        days you may fail 0.1% of requests — equivalently, about 43 minutes of total outage. This
        entire guide is about one question: <strong>when should spending that budget wake a
        human?</strong>
      </p>

      <div className="card">
        <div className="controls">
          <StopSlider
            label="Objective (30-day window)"
            stops={OBJECTIVE_STOPS}
            value={objective}
            onChange={setObjective}
            format={formatObjective}
          />
          <StopSlider
            label="Traffic"
            stops={[0.1, 1, 10, 100, 1000]}
            value={tps}
            onChange={setTps}
            format={(v) => `${v} TPS`}
          />
        </div>
        <div className="stat-row">
          <StatCard
            label="Error budget"
            value={formatPercent(budget, 3)}
            note="fraction of requests allowed to fail"
          />
          <StatCard
            label="As full-outage time"
            value={formatMinutes(budget * sloMin)}
            note="total downtime allowed per 30 days"
          />
          <StatCard
            label="As failed requests"
            value={formatCompact(budget * tps * 86400 * 30)}
            note={`out of ${formatCompact(tps * 86400 * 30)} requests / 30 days`}
          />
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', marginBottom: 0 }}>
          Notice how fast the budget shrinks as you add nines — and how much room a 90% objective
          leaves. Both extremes will matter later.
        </p>
      </div>
    </section>
  )
}
