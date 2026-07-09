import { CodeBlock } from '../../components/CodeBlock'

const RECORDING_RULES = `groups:
  - name: slo_api_availability
    rules:
      # One recording rule per window. Precomputing keeps the 3d query
      # cheap and guarantees every alert reads the same SLI definition.
      - record: sli:request_errors:ratio_rate5m
        expr: |
          sum(rate(http_requests_total{job="api", code=~"5..", probe="", healthcheck=""}[5m]))
          /
          sum(rate(http_requests_total{job="api", probe="", healthcheck=""}[5m]))
      - record: sli:request_errors:ratio_rate30m
        expr: # same expression with [30m]
      - record: sli:request_errors:ratio_rate1h
        expr: # ... [1h]
      - record: sli:request_errors:ratio_rate6h
        expr: # ... [6h]
      - record: sli:request_errors:ratio_rate3d
        expr: # ... [3d]`

const ALERT_RULES = `groups:
  - name: slo_api_burn_alerts
    rules:
      # 14.4x: spends 2% of a 30d budget per hour. Page.
      - alert: ErrorBudgetBurn_Fast
        expr: |
          sli:request_errors:ratio_rate1h  > (14.4 * 0.001)
          and
          sli:request_errors:ratio_rate5m  > (14.4 * 0.001)
        labels: { severity: page }
        annotations:
          summary: "2% of 30d error budget burned in the last hour"

      # 6x: 5% of budget per 6h. Page.
      - alert: ErrorBudgetBurn_Slow
        expr: |
          sli:request_errors:ratio_rate6h  > (6 * 0.001)
          and
          sli:request_errors:ratio_rate30m > (6 * 0.001)
        labels: { severity: page }

      # 1x: 10% of budget per 3d. Ticket, not a page.
      - alert: ErrorBudgetBurn_SlowBurn
        expr: |
          sli:request_errors:ratio_rate3d  > (1 * 0.001)
          and
          sli:request_errors:ratio_rate6h  > (1 * 0.001)
        labels: { severity: ticket }`

const LATENCY_RULE = `# Latency SLI from a histogram: fraction of requests SLOWER than 500ms.
# 'le="0.5"' counts the fast ones; subtract from 1.
- record: sli:slow_requests:ratio_rate5m
  expr: |
    1 - (
      sum(rate(http_request_duration_seconds_bucket{job="api", le="0.5"}[5m]))
      /
      sum(rate(http_request_duration_seconds_count{job="api"}[5m]))
    )
# Then alert exactly like the availability SLI, with the latency budget:
#   sli:slow_requests:ratio_rate1h > (14.4 * 0.01)   # 99% objective`

export function Promql() {
  return (
    <section className="lesson" id="promql">
      <h2>
        <span className="kicker">4 · In practice</span>
        The actual PromQL
      </h2>
      <p>
        Everything this site simulates translates to a small, boring set of Prometheus rules. Two
        layers: <strong>recording rules</strong> that define the SLI once per window, and{' '}
        <strong>alert rules</strong> that compare pairs of windows against a threshold.
      </p>
      <CodeBlock title="recording rules — the SLI, one per window" code={RECORDING_RULES} />
      <p>
        Note the label filters excluding probes and health checks — that’s the “valid events”
        decision from §1 living in code. Every window uses the <em>same</em> filtered expression;
        drift between windows is a subtle way to build an alert that can never fire.
      </p>
      <CodeBlock title="alert rules — the workbook trio for a 99.9% / 30d SLO" code={ALERT_RULES} />
      <p>
        The <code>0.001</code> is <code>1 − objective</code>. For a different objective, change
        that one number — the burn-rate thresholds stay put (but remember §7 of Learn: below a
        ~93.1% objective, 14.4× is unreachable).
      </p>
      <CodeBlock title="latency SLI from a native histogram" code={LATENCY_RULE} />
      <h3>Reality taxes on detection time</h3>
      <ul>
        <li>
          <strong>Scrape + evaluation interval:</strong> a 30 s scrape and 1 m rule evaluation add
          up to ~2 minutes before Prometheus even <em>sees</em> the burn. The “&lt;1m” detection
          times in these simulations are the theoretical floor.
        </li>
        <li>
          <strong>Skip the <code>for:</code> clause</strong> (or keep it ≤ 1–2 m). The windows
          already provide smoothing; stacking <code>for: 5m</code> on top just delays every page
          by five more minutes.
        </li>
        <li>
          <strong>Notification pipeline:</strong> Alertmanager grouping (<code>group_wait</code>,{' '}
          <code>group_interval</code>) and paging-provider latency add another 1–5 minutes.
          Budget for the whole path, not just the query.
        </li>
        <li>
          <strong>Counter resets and missing scrapes</strong> during an incident bias{' '}
          <code>rate()</code> downward — exactly when you need it most. Prefer measuring at a
          vantage point that survives your outages (§2).
        </li>
      </ul>
    </section>
  )
}
