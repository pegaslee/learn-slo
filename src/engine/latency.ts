/**
 * Latency modeling for latency-based SLIs. Request latency is approximated
 * as LogNormal(ln(median), sigma) — a reasonable shape for service response
 * times: most requests cluster near the median with a long slow tail.
 */

/** Standard normal CDF via the Abramowitz–Stegun erf approximation. */
export function normCdf(zRaw: number): number {
  const z = zRaw / Math.SQRT2 // erf argument; CDF(z) = (1 + erf(z/√2)) / 2
  const t = 1 / (1 + 0.3275911 * Math.abs(z))
  const erf =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t) *
      Math.exp(-z * z)
  return 0.5 * (1 + Math.sign(z) * erf)
}

/**
 * Fraction of requests slower than `thresholdMs` when latency is
 * LogNormal(ln(medianMs), sigma). This is the "bad event" rate of a
 * threshold latency SLI.
 */
export function slowFraction(medianMs: number, sigma: number, thresholdMs: number): number {
  if (thresholdMs <= 0 || medianMs <= 0) return 1
  const z = Math.log(thresholdMs / medianMs) / sigma
  return 1 - normCdf(z)
}

/** The latency (ms) at quantile q (e.g. 0.99 → p99) of the same distribution. */
export function latencyQuantile(medianMs: number, sigma: number, q: number): number {
  // Inverse normal CDF via Acklam's rational approximation (good to ~1e-9).
  const p = Math.min(1 - 1e-12, Math.max(1e-12, q))
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924]
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857]
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878]
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742]
  const pl = 0.02425
  let z: number
  if (p < pl) {
    const q1 = Math.sqrt(-2 * Math.log(p))
    z = (((((c[0] * q1 + c[1]) * q1 + c[2]) * q1 + c[3]) * q1 + c[4]) * q1 + c[5]) / ((((d[0] * q1 + d[1]) * q1 + d[2]) * q1 + d[3]) * q1 + 1)
  } else if (p <= 1 - pl) {
    const q1 = p - 0.5
    const r = q1 * q1
    z = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q1) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  } else {
    const q1 = Math.sqrt(-2 * Math.log(1 - p))
    z = -(((((c[0] * q1 + c[1]) * q1 + c[2]) * q1 + c[3]) * q1 + c[4]) * q1 + c[5]) / ((((d[0] * q1 + d[1]) * q1 + d[2]) * q1 + d[3]) * q1 + 1)
  }
  return medianMs * Math.exp(sigma * z)
}
