import { useCallback, useMemo, useRef, useState } from 'react'
import { formatSimTime } from '../lib/format'

export interface ChartSeries {
  id: string
  label: string
  /** CSS color (use var(--series-N) tokens). */
  color: string
  data: (number | null)[]
  /** Render a ~10% opacity area wash under the line. */
  area?: boolean
}

export interface Threshold {
  value: number
  label: string
  color?: string
}

export interface Band {
  start: number
  end: number
  color: string
  label: string
}

interface Props {
  title: string
  series: ChartSeries[]
  /** Reference lines (e.g. burn-rate thresholds). */
  thresholds?: Threshold[]
  /** Shaded x-ranges (e.g. incident window, alert firing). */
  bands?: Band[]
  yScale?: 'linear' | 'log'
  /** Fix the y max (linear) — otherwise fits the data and thresholds. */
  yMax?: number
  height?: number
  formatValue?: (v: number) => string
  /** Show bands in the legend (deduped by label). */
  legendBands?: boolean
}

const W = 860
const MARGIN = { top: 12, right: 56, bottom: 26, left: 46 }

function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0]
  const raw = max / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => max / s <= count) ?? mag * 10
  const ticks: number[] = []
  for (let v = 0; v <= max * 1.0001; v += step) ticks.push(v)
  return ticks
}

export function TimeSeriesChart({
  title,
  series,
  thresholds = [],
  bands = [],
  yScale = 'linear',
  yMax,
  height = 230,
  formatValue = (v) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)),
  legendBands = true,
}: Props) {
  const n = series[0]?.data.length ?? 0
  const H = height
  const iw = W - MARGIN.left - MARGIN.right
  const ih = H - MARGIN.top - MARGIN.bottom
  const [hover, setHover] = useState<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const { yToPx, ticks, dataMax, logMin } = useMemo(() => {
    let max = 0
    for (const s of series) for (const v of s.data) if (v !== null && v > max) max = v
    for (const th of thresholds) max = Math.max(max, th.value)
    if (yMax !== undefined) max = yMax
    if (max <= 0) max = 1

    if (yScale === 'log') {
      // Floor two decades below the smallest threshold (or at 0.1).
      const lo = Math.max(
        0.01,
        thresholds.length ? Math.min(...thresholds.map((t) => t.value)) / 100 : 0.1,
      )
      const hi = max * 1.4
      const lmin = Math.log10(lo)
      const lmax = Math.log10(hi)
      const y = (v: number) =>
        MARGIN.top + ih - ((Math.log10(Math.max(v, lo)) - lmin) / (lmax - lmin)) * ih
      const tk: number[] = []
      for (let e = Math.ceil(lmin); 10 ** e <= hi; e++) tk.push(10 ** e)
      return { yToPx: y, ticks: tk, dataMax: hi, logMin: lo }
    }
    const top = max * 1.08
    const y = (v: number) => MARGIN.top + ih - (Math.max(v, 0) / top) * ih
    return { yToPx: y, ticks: niceTicks(max), dataMax: top, logMin: 0 }
  }, [series, thresholds, yScale, yMax, ih])

  const xToPx = useCallback((t: number) => MARGIN.left + (t / Math.max(1, n - 1)) * iw, [n, iw])

  // Long simulations are decimated for drawing (max-of-bucket, which keeps
  // short spikes visible); the tooltip still reads the raw per-minute data.
  const step = Math.max(1, Math.ceil(n / 2200))
  const paths = useMemo(
    () =>
      series.map((s) => {
        // Contiguous runs of drawable points; nulls (and non-positives on a
        // log scale) break the line into separate subpaths.
        const runs: { pts: string[]; startT: number; endT: number }[] = []
        let cur: { pts: string[]; startT: number; endT: number } | null = null
        for (let t0 = 0; t0 < n; t0 += step) {
          let v: number | null = null
          for (let t = t0; t < Math.min(n, t0 + step); t++) {
            const raw = s.data[t]
            if (raw !== null && (v === null || raw > v)) v = raw
          }
          if (v !== null && (yScale !== 'log' || v > 0)) {
            if (!cur) {
              cur = { pts: [], startT: t0, endT: t0 }
              runs.push(cur)
            }
            cur.pts.push(`${xToPx(t0).toFixed(1)},${yToPx(v).toFixed(1)}`)
            cur.endT = t0
          } else {
            cur = null
          }
        }
        const d = runs.map((r) => `M${r.pts.join(' L')}`).join(' ')
        const y0 = (MARGIN.top + ih).toFixed(1)
        const areaD = s.area
          ? runs
              .map(
                (r) =>
                  `M${r.pts.join(' L')} L${xToPx(r.endT).toFixed(1)},${y0} L${xToPx(r.startT).toFixed(1)},${y0} Z`,
              )
              .join(' ')
          : ''
        return { ...s, d, areaD }
      }),
    [series, n, step, xToPx, yToPx, yScale],
  )

  // Day ticks on the x-axis (fall back to hours for short horizons).
  const xTicks = useMemo(() => {
    const out: { t: number; label: string }[] = []
    if (n > 2 * 1440) {
      for (let t = 0; t < n; t += 1440) out.push({ t, label: `Day ${t / 1440 + 1}` })
    } else {
      const stepH = n > 720 ? 6 : n > 240 ? 2 : 1
      for (let t = 0; t < n; t += stepH * 60) out.push({ t, label: `${Math.floor(t / 60) % 24}h` })
    }
    return out
  }, [n])

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const t = Math.round(((px - MARGIN.left) / iw) * (n - 1))
    setHover(t >= 0 && t < n ? t : null)
  }

  const legendKeys = useMemo(() => {
    const seen = new Set<string>()
    return bands.filter((b) => {
      if (seen.has(b.label)) return false
      seen.add(b.label)
      return true
    })
  }, [bands])

  const tooltipLeftFrac = hover !== null ? xToPx(hover) / W : 0

  return (
    <div className="chart" ref={wrapRef}>
      <p className="chart-title">{title}</p>
      {(series.length > 1 || (legendBands && legendKeys.length > 0)) && (
        <div className="chart-legend">
          {series.map((s) => (
            <span className="key" key={s.id}>
              <span className="swatch-line" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
          {legendBands &&
            legendKeys.map((b) => (
              <span className="key" key={b.label}>
                <span className="swatch-band" style={{ background: b.color, opacity: 0.35 }} />
                {b.label}
              </span>
            ))}
        </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={title}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {/* bands */}
        {bands.map((b, i) => (
          <rect
            key={i}
            x={xToPx(b.start)}
            width={Math.max(1.5, xToPx(Math.min(b.end, n - 1)) - xToPx(b.start))}
            y={MARGIN.top}
            height={ih}
            fill={b.color}
            opacity={0.14}
          />
        ))}
        {/* gridlines + y labels */}
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={MARGIN.left}
              x2={W - MARGIN.right}
              y1={yToPx(v)}
              y2={yToPx(v)}
              stroke="var(--grid)"
              strokeWidth={1}
            />
            <text
              x={MARGIN.left - 6}
              y={yToPx(v) + 3}
              textAnchor="end"
              fontSize={10}
              fill="var(--ink-muted)"
            >
              {formatValue(v)}
            </text>
          </g>
        ))}
        {/* x ticks */}
        {xTicks.map((tk) => (
          <text
            key={tk.t}
            x={xToPx(tk.t)}
            y={H - 8}
            fontSize={10}
            fill="var(--ink-muted)"
            textAnchor="middle"
          >
            {tk.label}
          </text>
        ))}
        {/* baseline */}
        <line
          x1={MARGIN.left}
          x2={W - MARGIN.right}
          y1={MARGIN.top + ih}
          y2={MARGIN.top + ih}
          stroke="var(--baseline)"
          strokeWidth={1}
        />
        {/* thresholds */}
        {thresholds.map((th, i) => (
          <g key={i}>
            <line
              x1={MARGIN.left}
              x2={W - MARGIN.right}
              y1={yToPx(th.value)}
              y2={yToPx(th.value)}
              stroke={th.color ?? 'var(--status-critical)'}
              strokeWidth={1}
              strokeDasharray="5 4"
            />
            <text
              x={W - MARGIN.right + 4}
              y={yToPx(th.value) + 3}
              fontSize={10}
              fontWeight={600}
              fill="var(--ink-2)"
            >
              {th.label}
            </text>
          </g>
        ))}
        {/* series */}
        {paths.map((s) => (
          <g key={s.id}>
            {s.area && s.areaD && <path d={s.areaD} fill={s.color} opacity={0.1} stroke="none" />}
            <path
              d={s.d}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
        ))}
        {/* crosshair */}
        {hover !== null && (
          <g>
            <line
              x1={xToPx(hover)}
              x2={xToPx(hover)}
              y1={MARGIN.top}
              y2={MARGIN.top + ih}
              stroke="var(--ink-muted)"
              strokeWidth={1}
            />
            {series.map((s) => {
              const v = s.data[hover]
              if (v === null || (yScale === 'log' && v <= logMin)) return null
              return (
                <circle
                  key={s.id}
                  cx={xToPx(hover)}
                  cy={yToPx(Math.min(v, dataMax))}
                  r={4}
                  fill={s.color}
                  stroke="var(--surface-1)"
                  strokeWidth={2}
                />
              )
            })}
          </g>
        )}
      </svg>
      {hover !== null && (
        <div
          className="chart-tooltip"
          style={{
            left: `${Math.min(82, Math.max(2, tooltipLeftFrac * 100 + 1.5))}%`,
            top: 30,
          }}
        >
          <div className="when">{formatSimTime(hover)}</div>
          {series.map((s) => {
            const v = s.data[hover]
            return (
              <div className="row" key={s.id}>
                <span className="name">
                  <span className="swatch-line" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="val">{v === null ? 'no data' : formatValue(v)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
