/**
 * Deterministic, seedable randomness so every simulation is reproducible:
 * the same inputs always render the same charts.
 */

/** mulberry32 PRNG — returns a function yielding floats in [0, 1). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Sample a Poisson(lambda) count. Exact (Knuth) for small lambda; normal
 * approximation for large lambda where the exact method is too slow and
 * the approximation error is negligible.
 */
export function poisson(lambda: number, rng: () => number): number {
  if (lambda <= 0) return 0
  if (lambda > 500) {
    const g = gaussian(rng)
    return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * g))
  }
  const limit = Math.exp(-lambda)
  let count = 0
  let product = rng()
  while (product > limit) {
    count++
    product *= rng()
  }
  return count
}

/**
 * Sample a Binomial(n, p) count. Exact for small n; normal approximation
 * beyond that.
 */
export function binomial(n: number, p: number, rng: () => number): number {
  if (n <= 0 || p <= 0) return 0
  if (p >= 1) return n
  if (n > 200) {
    const mean = n * p
    const sd = Math.sqrt(n * p * (1 - p))
    return Math.min(n, Math.max(0, Math.round(mean + sd * gaussian(rng))))
  }
  let count = 0
  for (let i = 0; i < n; i++) if (rng() < p) count++
  return count
}

/** Standard normal via Box–Muller. */
function gaussian(rng: () => number): number {
  const u = Math.max(rng(), 1e-12)
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
