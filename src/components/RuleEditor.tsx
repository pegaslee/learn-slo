import { maxBurnRate, type AlertRule } from '../engine'
import { formatPercent } from '../lib/format'

export const WINDOW_OPTIONS = [
  { min: 5, label: '5m' },
  { min: 30, label: '30m' },
  { min: 60, label: '1h' },
  { min: 120, label: '2h' },
  { min: 360, label: '6h' },
  { min: 720, label: '12h' },
  { min: 1440, label: '1d' },
  { min: 4320, label: '3d' },
]
const SHORT_WINDOW_OPTIONS = [{ min: 0, label: 'off' }, ...WINDOW_OPTIONS]

interface Props {
  rules: AlertRule[]
  objective: number
  sloWindowDays: number
  onChange: (rules: AlertRule[]) => void
}

/** Editable MWMBR rule table shared by the Playground and the Report Card. */
export function RuleEditor({ rules, objective, sloWindowDays, onChange }: Props) {
  const mbr = maxBurnRate(objective)
  const update = (idx: number, patch: Partial<AlertRule>) =>
    onChange(rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)))

  return (
    <table className="rules">
      <thead>
        <tr>
          <th>Rule</th>
          <th>Severity</th>
          <th>Long window</th>
          <th>Short window</th>
          <th>Burn rate ×</th>
          <th>Budget at detection</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rules.map((r, i) => (
          <tr key={r.id}>
            <td>{r.name}</td>
            <td>
              <span className={`severity-chip ${r.severity}`}>{r.severity}</span>
            </td>
            <td>
              <select
                value={r.longWindowMin}
                aria-label={`${r.name} long window`}
                onChange={(e) => update(i, { longWindowMin: Number(e.target.value) })}
              >
                {WINDOW_OPTIONS.map((w) => (
                  <option key={w.min} value={w.min}>
                    {w.label}
                  </option>
                ))}
              </select>
            </td>
            <td>
              <select
                value={r.shortWindowMin}
                aria-label={`${r.name} short window`}
                onChange={(e) => update(i, { shortWindowMin: Number(e.target.value) })}
              >
                {SHORT_WINDOW_OPTIONS.map((w) => (
                  <option key={w.min} value={w.min}>
                    {w.label}
                  </option>
                ))}
              </select>
            </td>
            <td>
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={r.burnRate}
                aria-label={`${r.name} burn rate threshold`}
                onChange={(e) => update(i, { burnRate: Number(e.target.value) || 0.1 })}
              />
            </td>
            <td>{formatPercent((r.burnRate * r.longWindowMin) / (sloWindowDays * 1440), 1)}</td>
            <td style={{ color: 'var(--status-critical)', fontWeight: 600, fontSize: '0.78rem' }}>
              {r.burnRate > mbr ? '⚠ never fires' : ''}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
