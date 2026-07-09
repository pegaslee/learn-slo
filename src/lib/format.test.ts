import { describe, expect, it } from 'vitest'
import { formatMinutes, formatPercent } from './format'

describe('formatPercent', () => {
  it('keeps integer zeros and trims only decimal zeros', () => {
    expect(formatPercent(0.1, 0)).toBe('10%')
    expect(formatPercent(1, 0)).toBe('100%')
    expect(formatPercent(0.025, 1)).toBe('2.5%')
    expect(formatPercent(0.025, 3)).toBe('2.5%')
    expect(formatPercent(0.001, 3)).toBe('0.1%')
  })
})

describe('formatMinutes', () => {
  it('renders human units', () => {
    expect(formatMinutes(0.4)).toBe('<1m')
    expect(formatMinutes(45)).toBe('45m')
    expect(formatMinutes(95)).toBe('1h 35m')
    expect(formatMinutes(3 * 1440 + 120)).toBe('3d 2h')
    expect(formatMinutes(null)).toBe('—')
  })
})
