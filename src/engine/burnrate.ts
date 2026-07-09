/**
 * Sliding-window error-ratio and burn-rate math over per-minute good/bad
 * counts, backed by prefix sums so any window query is O(1).
 *
 *   errorRatio(t, w) = bad(t−w..t] / total(t−w..t]
 *   burnRate(t, w)   = errorRatio(t, w) / (1 − objective)
 *
 * A burn rate of 1 consumes exactly the whole error budget over the SLO
 * period; the maximum possible burn rate (100% errors) is 1 / (1 − objective).
 */
export class BurnRateCalculator {
  private readonly cumBad: Float64Array
  private readonly cumTotal: Float64Array
  readonly minutes: number

  constructor(good: number[], bad: number[]) {
    this.minutes = good.length
    this.cumBad = new Float64Array(this.minutes + 1)
    this.cumTotal = new Float64Array(this.minutes + 1)
    for (let t = 0; t < this.minutes; t++) {
      this.cumBad[t + 1] = this.cumBad[t] + bad[t]
      this.cumTotal[t + 1] = this.cumTotal[t] + good[t] + bad[t]
    }
  }

  /**
   * Error ratio over the window of `windowMin` minutes ending at (and
   * including) minute t. Before the simulation has `windowMin` minutes of
   * history the window is truncated at 0 — like a freshly created alert with
   * no lookback data. Returns null when the window saw no traffic at all.
   */
  errorRatio(t: number, windowMin: number): number | null {
    const end = Math.min(t + 1, this.minutes)
    const start = Math.max(0, end - windowMin)
    const total = this.cumTotal[end] - this.cumTotal[start]
    if (total <= 0) return null
    return (this.cumBad[end] - this.cumBad[start]) / total
  }

  burnRate(t: number, windowMin: number, objective: number): number | null {
    const ratio = this.errorRatio(t, windowMin)
    if (ratio === null) return null
    return ratio / (1 - objective)
  }

  burnRateSeries(windowMin: number, objective: number): (number | null)[] {
    const out = new Array<number | null>(this.minutes)
    for (let t = 0; t < this.minutes; t++) out[t] = this.burnRate(t, windowMin, objective)
    return out
  }

  errorRatioSeries(windowMin: number): (number | null)[] {
    const out = new Array<number | null>(this.minutes)
    for (let t = 0; t < this.minutes; t++) out[t] = this.errorRatio(t, windowMin)
    return out
  }
}

/** The highest burn rate any service can produce: 100% errors. */
export function maxBurnRate(objective: number): number {
  return 1 / (1 - objective)
}
