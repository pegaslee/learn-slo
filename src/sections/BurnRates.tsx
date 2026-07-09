import { useState } from 'react'
import { Slider, StopSlider } from '../components/controls'
import { Formula } from '../components/Formula'
import { StatCard } from '../components/StatCard'
import { maxBurnRate } from '../engine'
import { formatCompact, formatMinutes, formatObjective, OBJECTIVE_STOPS } from '../lib/format'

/** Small dedicated SVG: error budget remaining vs time for several burn rates. */
function DepletionChart({ burnRate }: { burnRate: number }) {
  const W = 860
  const H = 200
  const M = { top: 12, right: 90, bottom: 26, left: 46 }
  const iw = W - M.left - M.right
  const ih = H - M.top - M.bottom
  const days = 30
  const x = (d: number) => M.left + (d / days) * iw
  const y = (frac: number) => M.top + (1 - frac) * ih

  const reference = [
    { br: 1, color: 'var(--series-2)', label: '1× (exactly on budget)' },
    { br: 6, color: 'var(--series-5)', label: '6×' },
    { br: 14.4, color: 'var(--series-3)', label: '14.4×' },
  ]
  const lines = [...reference, { br: burnRate, color: 'var(--series-1)', label: `${burnRate}× (yours)` }]

  return (
    <div className="chart">
      <p className="chart-title">Error budget remaining over a 30-day SLO window</p>
      <div className="chart-legend">
        {lines.map((l) => (
          <span className="key" key={l.label}>
            <span className="swatch-line" style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Error budget depletion at different burn rates">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={M.left} x2={W - M.right} y1={y(f)} y2={y(f)} stroke="var(--grid)" strokeWidth={1} />
            <text x={M.left - 6} y={y(f) + 3} textAnchor="end" fontSize={10} fill="var(--ink-muted)">
              {f * 100}%
            </text>
          </g>
        ))}
        {[0, 10, 20, 30].map((d) => (
          <text key={d} x={x(d)} y={H - 8} fontSize={10} fill="var(--ink-muted)" textAnchor="middle">
            {d}d
          </text>
        ))}
        <line x1={M.left} x2={W - M.right} y1={y(0)} y2={y(0)} stroke="var(--baseline)" strokeWidth={1} />
        {lines.map((l, i) => {
          const exhaustDay = Math.min(days, days / l.br)
          const pts =
            l.br <= 1.0001 && l.br >= 0.9999
              ? `M${x(0)},${y(1)} L${x(days)},${y(0)}`
              : `M${x(0)},${y(1)} L${x(exhaustDay)},${y(0)}` +
                (exhaustDay < days ? ` L${x(days)},${y(0)}` : '')
          return (
            <path
              key={i}
              d={pts}
              fill="none"
              stroke={l.color}
              strokeWidth={l.label.includes('yours') ? 3 : 2}
              strokeLinecap="round"
            />
          )
        })}
      </svg>
    </div>
  )
}

export function BurnRates() {
  const [objective, setObjective] = useState(0.999)
  const [errorPct, setErrorPct] = useState(1)
  const errorRatio = errorPct / 100
  const budget = 1 - objective
  const burnRate = errorRatio / budget
  const sloMin = 30 * 24 * 60
  const exhaustMin = sloMin / burnRate

  return (
    <section className="lesson" id="burn-rates">
      <h2>
        <span className="kicker">3 · The key idea</span>
        Burn rates
      </h2>
      <p>
        The <strong>burn rate</strong> rescales the error rate into budget language: how fast are
        we spending budget, relative to the pace that would spend exactly all of it by the end of
        the SLO window?
      </p>
      <Formula tex="\text{burn rate} = \frac{\text{observed error ratio}}{1 - \text{objective}}" />
      <p>
        A burn rate of <strong>1</strong> means you finish the window with zero budget to spare. A
        burn rate of <strong>2</strong> exhausts the budget halfway through. Because a service
        can’t fail more than 100% of its requests, the burn rate has a hard ceiling:
      </p>
      <Formula tex="\text{max burn rate} = \frac{1}{1 - \text{objective}} \qquad \text{time to exhaustion} = \frac{\text{SLO window}}{\text{burn rate}}" />

      <div className="card">
        <div className="controls">
          <Slider
            label="Observed error ratio"
            min={0.05}
            max={100}
            step={0.05}
            value={errorPct}
            onChange={setErrorPct}
            format={(v) => `${v}%`}
          />
          <StopSlider
            label="Objective"
            stops={OBJECTIVE_STOPS}
            value={objective}
            onChange={setObjective}
            format={formatObjective}
          />
        </div>
        <div className="stat-row">
          <StatCard
            label="Burn rate"
            value={`${formatCompact(burnRate)}×`}
            tone={burnRate >= 1 ? 'warn' : 'good'}
            note={`error ratio ${errorPct}% ÷ budget ${formatCompact(budget * 100)}%`}
          />
          <StatCard
            label="Budget exhausted in"
            value={burnRate >= 1 ? formatMinutes(exhaustMin) : 'never (under budget)'}
            note="if this error ratio persists"
          />
          <StatCard
            label="Max possible burn rate"
            value={`${formatCompact(maxBurnRate(objective))}×`}
            note={`at ${formatObjective(objective)} — remember this ceiling for §7`}
          />
        </div>
        <DepletionChart burnRate={burnRate} />
        <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', marginBottom: 0 }}>
          The same 1% error ratio is a 10× emergency at 99.9% but a lazy 0.1× at 90%. Burn rate is
          always relative to the objective — that’s the point, and (in §7) also the trap.
        </p>
      </div>
    </section>
  )
}
