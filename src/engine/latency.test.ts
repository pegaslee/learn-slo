import { describe, expect, it } from 'vitest'
import { latencyQuantile, normCdf, slowFraction } from './latency'

describe('normCdf', () => {
  it('matches known values', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 4)
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3)
    expect(normCdf(-1.96)).toBeCloseTo(0.025, 3)
  })
})

describe('slowFraction', () => {
  it('is 50% at the median and falls with higher thresholds', () => {
    expect(slowFraction(120, 0.5, 120)).toBeCloseTo(0.5, 4)
    expect(slowFraction(120, 0.5, 500)).toBeLessThan(0.01)
    expect(slowFraction(450, 0.5, 500)).toBeGreaterThan(0.3)
  })

  it('quantile and slowFraction are inverses', () => {
    const p99 = latencyQuantile(120, 0.5, 0.99)
    expect(slowFraction(120, 0.5, p99)).toBeCloseTo(0.01, 3)
  })
})
