import type { RuleEvaluation } from '../engine'
import { formatSimTime } from '../lib/format'

interface Props {
  evaluations: RuleEvaluation[]
  minutes: number
  incident?: { startMin: number; endMin: number }
}

/**
 * One horizontal band per alert rule showing when it fired, with the
 * incident window shaded behind for reference.
 */
export function AlertTimeline({ evaluations, minutes, incident }: Props) {
  const W = 700
  const H = 22
  const x = (t: number) => (t / minutes) * W

  return (
    <div className="alert-timeline">
      {evaluations.map((ev) => (
        <div className="row" key={ev.rule.id}>
          <span className="name">
            {ev.rule.name} ({ev.rule.burnRate}×)
          </span>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
            <rect x={0} y={0} width={W} height={H} rx={4} fill="var(--grid)" opacity={0.5} />
            {incident && (
              <rect
                x={x(incident.startMin)}
                y={0}
                width={Math.max(1, x(incident.endMin) - x(incident.startMin))}
                height={H}
                fill="var(--ink-muted)"
                opacity={0.22}
              />
            )}
            {ev.intervals.map((iv, i) => (
              <rect
                key={i}
                x={x(iv.start)}
                y={3}
                width={Math.max(2, x(iv.end) - x(iv.start))}
                height={H - 6}
                rx={3}
                fill={ev.rule.severity === 'page' ? 'var(--status-critical)' : 'var(--status-warning)'}
              >
                <title>
                  {ev.rule.name}: firing {formatSimTime(iv.start)} → {formatSimTime(iv.end)}
                </title>
              </rect>
            ))}
            {!ev.canEverFire && (
              <text x={W / 2} y={H / 2 + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--status-critical)">
                ⚠ can never fire at this objective
              </text>
            )}
          </svg>
        </div>
      ))}
      {incident && (
        <div className="row">
          <span className="name" />
          <span style={{ fontSize: '0.72rem', color: 'var(--ink-muted)' }}>
            Gray band = incident window ({formatSimTime(incident.startMin)} →{' '}
            {formatSimTime(incident.endMin)})
          </span>
        </div>
      )}
    </div>
  )
}
