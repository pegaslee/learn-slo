import { useMemo, useState } from 'react'
import { SelectField, StopSlider } from '../components/controls'
import { RuleEditor } from '../components/RuleEditor'
import { StatCard } from '../components/StatCard'
import {
  defaultRules,
  generateIncidentSuite,
  generateTraffic,
  incidentLabel,
  makeRng,
  maxBurnRate,
  scorePolicy,
  TRAFFIC_SHAPES,
  type AlertRule,
  type TrafficShape,
} from '../engine'
import {
  formatCompact,
  formatMinutes,
  formatObjective,
  formatPercent,
  formatSimTime,
  OBJECTIVE_STOPS,
} from '../lib/format'

const HORIZON_DAYS = 60
const MINUTES = HORIZON_DAYS * 1440
const TPS_STOPS = [0.005, 0.03, 0.1, 1, 10, 100, 1000]

function Timeline({ score }: { score: ReturnType<typeof scorePolicy> }) {
  const W = 860
  const H = 64
  const x = (t: number) => (t / score.minutes) * W
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Incidents and pages over 60 days">
      <text x={0} y={10} fontSize={10} fill="var(--ink-muted)">incidents</text>
      <rect x={0} y={14} width={W} height={16} rx={4} fill="var(--grid)" opacity={0.5} />
      {score.incidents.map((s) => (
        <rect
          key={s.incident.id}
          x={x(s.incident.startMin)}
          y={14}
          width={Math.max(2, x(s.incident.durationMin))}
          height={16}
          rx={2}
          fill={s.significant ? 'var(--series-5)' : 'var(--ink-muted)'}
          opacity={s.significant ? 0.9 : 0.45}
        >
          <title>
            {incidentLabel(s.incident.kind)} · {formatSimTime(s.incident.startMin)} · {formatMinutes(s.incident.durationMin)} ·{' '}
            {formatPercent(s.budgetConsumed, 1)} of budget{s.significant ? ' (significant)' : ''}
          </title>
        </rect>
      ))}
      <text x={0} y={44} fontSize={10} fill="var(--ink-muted)">pages</text>
      <rect x={0} y={48} width={W} height={16} rx={4} fill="var(--grid)" opacity={0.5} />
      {score.pageEvents.map((p, i) => (
        <rect
          key={i}
          x={x(p.start)}
          y={48}
          width={Math.max(2, x(p.end - p.start))}
          height={16}
          rx={2}
          fill={p.significant ? 'var(--status-critical)' : 'var(--status-warning)'}
        >
          <title>
            {p.significant ? 'justified page' : 'FALSE page'} · {formatSimTime(p.start)}
          </title>
        </rect>
      ))}
    </svg>
  )
}

export function ReportCardPage() {
  const [objective, setObjective] = useState(0.999)
  const [tps, setTps] = useState(100)
  const [shape, setShape] = useState<TrafficShape>('steady')
  const [sloWindowDays, setSloWindowDays] = useState('30')
  const [significance, setSignificance] = useState('0.02')
  const [seed, setSeed] = useState(77)
  const [rules, setRules] = useState<AlertRule[]>(() => defaultRules())

  const score = useMemo(() => {
    const traffic = generateTraffic(shape, tps, MINUTES, seed)
    const incidents = generateIncidentSuite(MINUTES, makeRng(seed + 1))
    return scorePolicy({
      traffic,
      incidents,
      rules,
      objective,
      sloWindowMin: Number(sloWindowDays) * 1440,
      significantBudgetFrac: Number(significance),
      rng: makeRng(seed + 2),
    })
  }, [shape, tps, seed, rules, objective, sloWindowDays, significance])

  const verdicts = useMemo(() => {
    const out: { tone: 'good' | 'warn' | 'bad'; text: string }[] = []
    const mbr = maxBurnRate(objective)
    for (const r of rules) {
      if (r.burnRate > mbr) {
        out.push({
          tone: 'bad',
          text: `"${r.name}" (${r.burnRate}×) can NEVER fire at ${formatObjective(objective)} — max possible burn is ${formatCompact(mbr)}×. It is dead code.`,
        })
      }
    }
    if (score.falsePagesPer30d > 2) {
      out.push({
        tone: 'bad',
        text: `${score.falsePagesPer30d.toFixed(1)} false pages per month is an alert-fatigue machine — on-call learns to ignore pages, then misses the real one.`,
      })
    } else if (score.falsePagesPer30d > 0.5) {
      out.push({ tone: 'warn', text: `${score.falsePagesPer30d.toFixed(1)} false pages/month — tolerable, but watch it.` })
    }
    if (score.recall !== null && score.recall < 1) {
      const missed = score.incidents.filter((s) => s.significant && s.caughtBy.length === 0)
      out.push({
        tone: 'bad',
        text: `${missed.length} significant incident${missed.length === 1 ? '' : 's'} produced no alert at all (${missed
          .map((m) => `${incidentLabel(m.incident.kind).toLowerCase()} consuming ${formatPercent(m.budgetConsumed, 0)} of budget`)
          .join('; ')}).`,
      })
    }
    if (score.medianDetectionMin !== null && score.medianDetectionMin > 60) {
      out.push({
        tone: 'warn',
        text: `Median page arrives ${formatMinutes(score.medianDetectionMin)} into an incident — check whether your fast tier's window/threshold fit your traffic.`,
      })
    }
    if (score.slowBurnRecall !== null && score.slowBurnRecall < 1) {
      out.push({ tone: 'warn', text: 'Some slow burns produced no ticket — budget is leaking with no paper trail.' })
    }
    if (out.length === 0) {
      out.push({
        tone: 'good',
        text: 'Healthy policy: every significant incident alerts, pages are precise, slow burns become tickets. Now go tune your SLI (see SLIs & Queries).',
      })
    }
    return out
  }, [score, rules, objective])

  return (
    <>
      <p className="subtitle" style={{ marginTop: 24, color: 'var(--ink-2)' }}>
        The workbook judges alert policies on precision, recall, detection time, and reset time.
        This page measures yours: 60 simulated days containing randomized outages, partial
        degradations, slow burns, harmless blips, and long quiet stretches — scored against your
        rule set.
      </p>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Service under test</h3>
        <div className="controls">
          <StopSlider label="Objective" stops={OBJECTIVE_STOPS} value={objective} onChange={setObjective} format={formatObjective} />
          <SelectField
            label="SLO window"
            value={sloWindowDays as '30'}
            options={[
              { id: '7', label: '7 days' },
              { id: '28', label: '28 days' },
              { id: '30', label: '30 days' },
              { id: '90', label: '90 days' },
            ]}
            onChange={setSloWindowDays}
          />
          <StopSlider label="Traffic" stops={TPS_STOPS} value={tps} onChange={setTps} format={(v) => `${v} TPS`} />
          <SelectField
            label="Traffic shape"
            value={shape}
            options={TRAFFIC_SHAPES.map((s) => ({ id: s.id, label: s.label }))}
            onChange={setShape}
          />
          <SelectField
            label='"Significant" = consumes ≥'
            value={significance as '0.02'}
            options={[
              { id: '0.01', label: '1% of budget' },
              { id: '0.02', label: '2% of budget' },
              { id: '0.05', label: '5% of budget' },
            ]}
            onChange={setSignificance}
          />
          <div className="field">
            <label>Incident suite</label>
            <button className="preset" onClick={() => setSeed((s) => s + 13)}>
              🎲 re-roll incidents
            </button>
          </div>
        </div>
        <h3>Alert policy</h3>
        <RuleEditor rules={rules} objective={objective} sloWindowDays={Number(sloWindowDays)} onChange={setRules} />
      </div>

      <div className="stat-row">
        <StatCard
          label="Page precision"
          value={score.precision !== null ? formatPercent(score.precision, 0) : 'no pages'}
          tone={score.precision === null ? 'neutral' : score.precision >= 0.9 ? 'good' : score.precision >= 0.7 ? 'warn' : 'bad'}
          note="pages that pointed at a significant incident"
        />
        <StatCard
          label="Recall"
          value={score.recall !== null ? formatPercent(score.recall, 0) : '—'}
          tone={score.recall === null ? 'neutral' : score.recall >= 1 ? 'good' : score.recall >= 0.8 ? 'warn' : 'bad'}
          note="significant incidents that alerted (any severity)"
        />
        <StatCard
          label="Median detection"
          value={score.medianDetectionMin !== null ? formatMinutes(score.medianDetectionMin) : '—'}
          tone={score.medianDetectionMin === null ? 'neutral' : score.medianDetectionMin <= 30 ? 'good' : 'warn'}
          note="incident start → first page"
        />
        <StatCard
          label="False pages / month"
          value={score.falsePagesPer30d.toFixed(1)}
          tone={score.falsePagesPer30d <= 0.5 ? 'good' : score.falsePagesPer30d <= 2 ? 'warn' : 'bad'}
          note="pages with no significant incident behind them"
        />
        <StatCard
          label="Slow-burn coverage"
          value={score.slowBurnRecall !== null ? formatPercent(score.slowBurnRecall, 0) : '—'}
          tone={score.slowBurnRecall === null ? 'neutral' : score.slowBurnRecall >= 1 ? 'good' : 'warn'}
          note="slow burns that produced at least a ticket"
        />
      </div>

      {verdicts.map((v, i) => (
        <div key={i} className={`callout ${v.tone === 'good' ? '' : 'warn'}`}>
          <p>
            <strong>{v.tone === 'good' ? '✓' : v.tone === 'warn' ? '⚠' : '✗'}</strong> {v.text}
          </p>
        </div>
      ))}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>60 days at a glance</h3>
        <Timeline score={score} />
        <p style={{ fontSize: '0.78rem', color: 'var(--ink-muted)', margin: '6px 0 0' }}>
          Top row: incidents (violet = significant, gray = minor). Bottom row: page events (red =
          justified, yellow = false). Hover for details.
        </p>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <h3 style={{ marginTop: 0 }}>Every incident, scored</h3>
        <table className="rules">
          <thead>
            <tr>
              <th>When</th>
              <th>What</th>
              <th>Duration</th>
              <th>Error rate</th>
              <th>Budget consumed</th>
              <th>Significant?</th>
              <th>Alerted via</th>
              <th>Paged after</th>
            </tr>
          </thead>
          <tbody>
            {score.incidents.map((s) => (
              <tr key={s.incident.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{formatSimTime(s.incident.startMin)}</td>
                <td>{incidentLabel(s.incident.kind)}</td>
                <td>{formatMinutes(s.incident.durationMin)}</td>
                <td>{formatPercent(s.incident.errorRate, 1)}</td>
                <td>{formatPercent(s.budgetConsumed, 1)}</td>
                <td>{s.significant ? 'yes' : 'no'}</td>
                <td>{s.caughtBy.length > 0 ? s.caughtBy.join(', ') : s.significant ? '⚠ NOTHING' : '—'}</td>
                <td>{s.pagedAfterMin !== null ? formatMinutes(s.pagedAfterMin) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
