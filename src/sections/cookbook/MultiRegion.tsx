import { useMemo, useState } from 'react'
import { SelectField, Slider } from '../../components/controls'
import { StatCard } from '../../components/StatCard'
import { TimeSeriesChart, type Band } from '../../components/TimeSeriesChart'
import { defaultRules, maxBurnRate, type Scenario } from '../../engine'
import { formatCompact, formatMinutes, formatObjective } from '../../lib/format'
import { useSimulation } from '../../lib/useSimulation'

const TPS = 300
const OUTAGE = { startHour: 30, durationHours: 3 }

export function MultiRegion() {
  const [sharePct, setSharePct] = useState(5)
  const [objective, setObjective] = useState('0.999')
  const obj = Number(objective)
  const rules = useMemo(() => defaultRules(), [])

  // Global SLO: the dead region shows up as a partial outage at its share.
  const globalScenario: Scenario = useMemo(
    () => ({
      kind: 'partial-outage',
      startMin: OUTAGE.startHour * 60,
      durationMin: OUTAGE.durationHours * 60,
      errorRate: sharePct / 100,
      baselineErrorRate: 0.0002,
    }),
    [sharePct],
  )
  const globalSim = useSimulation({
    shape: 'steady',
    tps: TPS,
    horizonDays: 3,
    scenario: globalScenario,
    objective: obj,
    sloWindowDays: 30,
    rules,
  })

  // Per-region SLO: the region's own SLI sees a total outage on its own traffic.
  const regionScenario: Scenario = useMemo(
    () => ({
      kind: 'full-outage',
      startMin: OUTAGE.startHour * 60,
      durationMin: OUTAGE.durationHours * 60,
      errorRate: 1,
      baselineErrorRate: 0.0002,
    }),
    [],
  )
  const regionSim = useSimulation({
    shape: 'steady',
    tps: (TPS * sharePct) / 100,
    horizonDays: 3,
    scenario: regionScenario,
    objective: obj,
    sloWindowDays: 30,
    rules,
  })

  const globalFast = globalSim.evaluations[0]
  const regionFast = regionSim.evaluations[0]
  const anyGlobalPage = globalSim.evaluations.filter((e) => e.rule.severity === 'page' && e.detectionMinutes !== null)
  const outageBurn = sharePct / 100 / (1 - obj)
  const bands: Band[] = [
    {
      start: globalSim.incident!.startMin,
      end: globalSim.incident!.endMin,
      color: 'var(--ink-muted)',
      label: `region (${sharePct}% of traffic) fully down`,
    },
  ]

  return (
    <section className="lesson" id="cb-multi-region">
      <h2>
        <span className="kicker">Recipe 2 · The dilution trap</span>
        Multi-region services
      </h2>
      <p>
        A region dies completely. Users there see a <em>total outage</em>. But your global SLI
        averages them against every healthy region: a region carrying {sharePct}% of traffic
        produces only a {sharePct}% global error rate — a burn of{' '}
        <strong>{formatCompact(outageBurn)}×</strong> at {formatObjective(obj)}. Whether anyone
        gets paged depends entirely on how big the dead region is.
      </p>
      <div className="card">
        <div className="controls">
          <Slider
            label="Dead region's share of traffic"
            min={1}
            max={50}
            value={sharePct}
            onChange={setSharePct}
            format={(v) => `${v}%`}
          />
          <SelectField
            label="Objective"
            value={objective as '0.999'}
            options={[
              { id: '0.999', label: '99.9%' },
              { id: '0.99', label: '99%' },
            ]}
            onChange={setObjective}
          />
        </div>
        <TimeSeriesChart
          title="GLOBAL 1-hour burn rate during a total regional outage (log scale)"
          series={[
            { id: 'g', label: 'global burn rate', color: 'var(--series-1)', data: globalSim.burnRates.get(60)! },
            { id: 'r', label: "dead region's own burn rate", color: 'var(--series-6)', data: regionSim.burnRates.get(60)! },
          ]}
          thresholds={[
            { value: 14.4, label: '14.4×' },
            { value: maxBurnRate(obj), label: `max ${formatCompact(maxBurnRate(obj))}×`, color: 'var(--ink-muted)' },
          ]}
          bands={bands}
          yScale="log"
          height={220}
        />
        <div className="stat-row">
          <StatCard
            label="Global SLO: fast page"
            value={globalFast.detectionMinutes !== null ? `fired in ${formatMinutes(globalFast.detectionMinutes)}` : 'silent'}
            tone={globalFast.detectionMinutes !== null ? 'good' : 'bad'}
            note={`outage burns ${formatCompact(outageBurn)}× vs 14.4× needed`}
          />
          <StatCard
            label="Global SLO: any page at all"
            value={anyGlobalPage.length > 0 ? `yes (${anyGlobalPage.map((e) => e.rule.name).join(', ')})` : 'no page'}
            tone={anyGlobalPage.length > 0 ? 'neutral' : 'bad'}
          />
          <StatCard
            label="Per-region SLO: fast page"
            value={regionFast.detectionMinutes !== null ? `fired in ${formatMinutes(regionFast.detectionMinutes)}` : 'silent'}
            tone={regionFast.detectionMinutes !== null ? 'good' : 'warn'}
            note="a dead region always burns at max rate — against its own SLI"
          />
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', marginBottom: 0 }}>
          <strong>Recommendation:</strong> keep the global SLO as the product truth, but run{' '}
          <em>per-region burn-rate alerts</em> for detection — a dead region is always a max-rate
          burn against its own SLI, regardless of size. Costs: N× the rules (generate them), and
          small regions inherit the low-traffic noise problem (Recipe 4). Slide the share to ~1%
          and note that even the 6× and 1× global tiers eventually miss it at 99%.
        </p>
      </div>
    </section>
  )
}
