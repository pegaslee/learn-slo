import { useMemo, useState } from 'react'
import { AlertTimeline } from '../components/AlertTimeline'
import { SelectField, Slider, StopSlider } from '../components/controls'
import { RuleEditor } from '../components/RuleEditor'
import { StatCard } from '../components/StatCard'
import { TimeSeriesChart, type Band } from '../components/TimeSeriesChart'
import {
  defaultRules,
  maxBurnRate,
  SCENARIO_KINDS,
  TRAFFIC_SHAPES,
  type AlertRule,
  type Scenario,
  type ScenarioKind,
  type TrafficShape,
} from '../engine'
import {
  formatCompact,
  formatMinutes,
  formatObjective,
  OBJECTIVE_STOPS,
} from '../lib/format'
import { useSimulation } from '../lib/useSimulation'

const TPS_STOPS = [0.01, 0.03, 0.1, 0.3, 1, 3, 10, 30, 100, 300, 1000]

interface PlaygroundState {
  shape: TrafficShape
  tps: number
  horizonDays: number
  objective: number
  sloWindowDays: number
  scenarioKind: ScenarioKind
  startHour: number
  durationHours: number
  errorRatePct: number
  baselinePct: number
  rules: AlertRule[]
}

const BASE: PlaygroundState = {
  shape: 'steady',
  tps: 100,
  horizonDays: 7,
  objective: 0.999,
  sloWindowDays: 30,
  scenarioKind: 'partial-outage',
  startHour: 48,
  durationHours: 8,
  errorRatePct: 10,
  baselinePct: 0.02,
  rules: defaultRules(),
}

const PRESETS: { id: string; label: string; blurb: string; state: PlaygroundState }[] = [
  {
    id: 'great',
    label: '✅ Great fit: busy API',
    blurb:
      '100 TPS, 99.9% objective, 10% partial outage. Plenty of traffic makes burn rates smooth; the fast page fires in minutes and clears cleanly after recovery.',
    state: { ...BASE },
  },
  {
    id: 'slow-burn',
    label: '✅ Great fit: slow burn',
    blurb:
      'A 0.5% error rate at a 99.9% objective is a 5× burn — too small to page on error spikes, but the 6h page and 3d ticket catch it while most of the budget is still intact.',
    state: {
      ...BASE,
      scenarioKind: 'slow-burn',
      errorRatePct: 0.5,
      startHour: 24,
      durationHours: 6 * 24,
      horizonDays: 7,
    },
  },
  {
    id: 'low-traffic',
    label: '⚠️ Poor fit: low traffic',
    blurb:
      '0.03 TPS (~2 requests/min). Single failures swing the short window wildly — burn rates are noise, and one unlucky request can page you. The workbook suggests synthetic traffic, aggregation, or longer windows here.',
    state: {
      ...BASE,
      tps: 0.03,
      scenarioKind: 'blips',
      errorRatePct: 100,
      startHour: 12,
      durationHours: 6 * 24,
      baselinePct: 1,
    },
  },
  {
    id: 'low-objective',
    label: '⚠️ Poor fit: low objective',
    blurb:
      'A 90% objective caps the burn rate at 10× — below the 14.4× threshold. The fast page can NEVER fire, even during this total outage. Only the slower rules ever alert.',
    state: {
      ...BASE,
      objective: 0.9,
      scenarioKind: 'full-outage',
      errorRatePct: 100,
      startHour: 48,
      durationHours: 12,
    },
  },
]

export function Playground() {
  const [state, setState] = useState<PlaygroundState>(PRESETS[0].state)
  const [activePreset, setActivePreset] = useState<string | null>('great')

  const set = <K extends keyof PlaygroundState>(key: K, value: PlaygroundState[K]) => {
    setActivePreset(null)
    setState((s) => ({ ...s, [key]: value }))
  }

  const scenario: Scenario = useMemo(
    () => ({
      kind: state.scenarioKind,
      startMin: Math.round(state.startHour * 60),
      durationMin: Math.round(state.durationHours * 60),
      errorRate: state.errorRatePct / 100,
      baselineErrorRate: state.baselinePct / 100,
      blipIntervalMin: 240,
      blipDurationMin: 3,
    }),
    [state.scenarioKind, state.startHour, state.durationHours, state.errorRatePct, state.baselinePct],
  )

  const sim = useSimulation({
    shape: state.shape,
    tps: state.tps,
    horizonDays: state.horizonDays,
    scenario,
    objective: state.objective,
    sloWindowDays: state.sloWindowDays,
    rules: state.rules,
  })

  const mbr = maxBurnRate(state.objective)
  const errorRatioPct = useMemo(
    () => sim.calc.errorRatioSeries(30).map((v) => (v === null ? null : v * 100)),
    [sim.calc],
  )
  const incidentBands: Band[] = sim.incident
    ? [{ start: sim.incident.startMin, end: sim.incident.endMin, color: 'var(--ink-muted)', label: 'incident' }]
    : []

  const seriesColors = ['var(--series-1)', 'var(--series-2)', 'var(--series-5)', 'var(--series-4)']

  const preset = PRESETS.find((p) => p.id === activePreset)

  return (
    <section className="lesson" id="playground">
      <h2>
        <span className="kicker">Playground</span>
        Try it yourself
      </h2>
      <p>
        Everything unlocked: pick a traffic shape and volume, break the service however you like,
        and tune the alert policy. Presets highlight where MWMBR alerting shines — and where it
        quietly fails you.
      </p>

      <div className="card">
        <div className="controls" style={{ marginBottom: 16 }}>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className={`preset ${activePreset === p.id ? 'active' : ''}`}
              onClick={() => {
                setState(p.state)
                setActivePreset(p.id)
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset && (
          <p style={{ fontSize: '0.88rem', marginTop: 0 }}>
            {preset.blurb}
          </p>
        )}

        <h3 style={{ marginTop: 8 }}>Service &amp; SLO</h3>
        <div className="controls">
          <SelectField
            label="Traffic shape"
            value={state.shape}
            options={TRAFFIC_SHAPES.map((s) => ({ id: s.id, label: s.label }))}
            onChange={(v) => set('shape', v)}
          />
          <StopSlider
            label="Traffic volume"
            stops={TPS_STOPS}
            value={state.tps}
            onChange={(v) => set('tps', v)}
            format={(v) => `${v} TPS (${formatCompact(v * 60)}/min)`}
          />
          <StopSlider
            label="Objective"
            stops={OBJECTIVE_STOPS}
            value={state.objective}
            onChange={(v) => set('objective', v)}
            format={formatObjective}
          />
          <SelectField
            label="SLO window"
            value={String(state.sloWindowDays) as '7' | '28' | '30' | '90'}
            options={[
              { id: '7', label: '7 days' },
              { id: '28', label: '28 days' },
              { id: '30', label: '30 days' },
              { id: '90', label: '90 days' },
            ]}
            onChange={(v) => set('sloWindowDays', Number(v))}
          />
          <Slider
            label="Simulation length"
            min={2}
            max={14}
            value={state.horizonDays}
            onChange={(v) => set('horizonDays', v)}
            format={(v) => `${v} days`}
          />
        </div>
        <p style={{ fontSize: '0.82rem', color: 'var(--ink-muted)' }}>
          {TRAFFIC_SHAPES.find((s) => s.id === state.shape)?.blurb} Max possible burn rate at{' '}
          {formatObjective(state.objective)}: <strong>{formatCompact(mbr)}×</strong>.
        </p>

        <h3>Incident</h3>
        <div className="controls">
          <SelectField
            label="Scenario"
            value={state.scenarioKind}
            options={SCENARIO_KINDS.map((s) => ({ id: s.id, label: s.label }))}
            onChange={(v) => set('scenarioKind', v)}
          />
          {state.scenarioKind !== 'none' && (
            <>
              <Slider
                label="Starts at"
                min={1}
                max={state.horizonDays * 24 - 1}
                value={state.startHour}
                onChange={(v) => set('startHour', v)}
                format={(v) => `hour ${v}`}
              />
              <Slider
                label="Duration"
                min={1}
                max={state.horizonDays * 24}
                value={state.durationHours}
                onChange={(v) => set('durationHours', v)}
                format={(v) => formatMinutes(v * 60)}
              />
              {state.scenarioKind !== 'full-outage' && (
                <Slider
                  label="Error rate during incident"
                  min={0.1}
                  max={100}
                  step={0.1}
                  value={state.errorRatePct}
                  onChange={(v) => set('errorRatePct', v)}
                  format={(v) => `${v}%`}
                />
              )}
            </>
          )}
          <Slider
            label="Background error rate"
            min={0}
            max={2}
            step={0.01}
            value={state.baselinePct}
            onChange={(v) => set('baselinePct', v)}
            format={(v) => `${v}%`}
          />
        </div>
        <p style={{ fontSize: '0.82rem', color: 'var(--ink-muted)' }}>
          {SCENARIO_KINDS.find((s) => s.id === state.scenarioKind)?.blurb}
        </p>

        <h3>Alert rules</h3>
        <RuleEditor
          rules={state.rules}
          objective={state.objective}
          sloWindowDays={state.sloWindowDays}
          onChange={(rules) => set('rules', rules)}
        />
      </div>

      <TimeSeriesChart
        title="Traffic (requests/min)"
        series={[
          { id: 'traffic', label: 'requests/min', color: 'var(--series-1)', data: sim.traffic, area: true },
        ]}
        bands={incidentBands}
        formatValue={formatCompact}
        height={170}
      />
      <TimeSeriesChart
        title="Observed error rate, 30-minute window (%)"
        series={[{ id: 'err', label: 'error %', color: 'var(--series-6)', data: errorRatioPct, area: true }]}
        bands={incidentBands}
        formatValue={(v) => `${v >= 10 ? v.toFixed(0) : v.toFixed(2)}%`}
        height={170}
      />

      {state.rules.map((r, i) => {
        const ev = sim.evaluations[i]
        const firingBands: Band[] = ev.intervals.map((iv) => ({
          start: iv.start,
          end: iv.end,
          color: 'var(--status-critical)',
          label: 'alert firing',
        }))
        return (
          <div key={r.id} className="card">
            <TimeSeriesChart
              title={`${r.name} — burn rate over ${formatMinutes(r.longWindowMin)}${
                r.shortWindowMin ? ` and ${formatMinutes(r.shortWindowMin)}` : ''
              } (threshold ${r.burnRate}×, log scale)`}
              series={[
                {
                  id: 'long',
                  label: `${formatMinutes(r.longWindowMin)} burn rate`,
                  color: seriesColors[i % seriesColors.length],
                  data: sim.burnRates.get(r.longWindowMin)!,
                },
                ...(r.shortWindowMin > 0
                  ? [
                      {
                        id: 'short',
                        label: `${formatMinutes(r.shortWindowMin)} burn rate`,
                        color: 'var(--series-3)',
                        data: sim.burnRates.get(r.shortWindowMin)!,
                      },
                    ]
                  : []),
              ]}
              thresholds={[
                { value: r.burnRate, label: `${r.burnRate}×` },
                { value: mbr, label: `max ${formatCompact(mbr)}×`, color: 'var(--ink-muted)' },
              ]}
              bands={[...incidentBands, ...firingBands]}
              yScale="log"
              height={210}
            />
            <div className="stat-row">
              <StatCard
                label="Can it ever fire?"
                value={ev.canEverFire ? 'Yes' : 'Never'}
                tone={ev.canEverFire ? 'good' : 'bad'}
                note={
                  ev.canEverFire
                    ? `threshold ${r.burnRate}× ≤ max ${formatCompact(mbr)}×`
                    : `threshold ${r.burnRate}× > max ${formatCompact(mbr)}× at ${formatObjective(state.objective)}`
                }
              />
              <StatCard
                label="Detection time"
                value={ev.detectionMinutes !== null ? formatMinutes(ev.detectionMinutes) : 'not detected'}
                tone={ev.detectionMinutes !== null ? 'neutral' : sim.incident ? 'warn' : 'neutral'}
                note={sim.incident ? 'from incident start to first firing' : 'no incident configured'}
              />
              <StatCard
                label="Reset time"
                value={ev.resetMinutes !== null ? formatMinutes(ev.resetMinutes) : '—'}
                note="firing after incident ended"
              />
              <StatCard
                label="Time spent firing"
                value={formatMinutes(ev.totalFiringMinutes)}
                note={`${ev.intervals.length} interval${ev.intervals.length === 1 ? '' : 's'}`}
              />
            </div>
          </div>
        )
      })}

      <h3>Alert firing timeline</h3>
      <AlertTimeline evaluations={sim.evaluations} minutes={sim.minutes} incident={sim.incident} />
    </section>
  )
}
