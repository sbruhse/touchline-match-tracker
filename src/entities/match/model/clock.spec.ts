import { describe, expect, it } from 'vitest'
import { formatMatchMinute, getElapsedMs, parseMatchMinute, pauseClock, resumeClock, REGULATION_HALF_MS } from './clock'
import type { ClockState } from './match'

const clock = (overrides: Partial<ClockState> = {}): ClockState => ({
  period: 1,
  elapsedMs: 0,
  status: 'not-started',
  startedAt: null,
  ...overrides,
})

describe('match clock', () => {
  it('formats ordinary minutes and first-half stoppage time', () => {
    expect(formatMatchMinute(1, 0)).toBe('1′')
    expect(formatMatchMinute(1, 16 * 60_000 + 1)).toBe('17′')
    expect(formatMatchMinute(1, REGULATION_HALF_MS)).toBe('45+0′')
    expect(formatMatchMinute(1, REGULATION_HALF_MS + 1)).toBe('45+1′')
    expect(formatMatchMinute(1, REGULATION_HALF_MS + 60_001)).toBe('45+2′')
  })

  it('formats second-half minutes and second-half stoppage time', () => {
    expect(formatMatchMinute(2, 0)).toBe('46′')
    expect(formatMatchMinute(2, 17 * 60_000)).toBe('63′')
    expect(formatMatchMinute(2, REGULATION_HALF_MS)).toBe('90+0′')
    expect(formatMatchMinute(2, REGULATION_HALF_MS + 60_001)).toBe('90+2′')
  })

  it('parses ordinary and stoppage-time entries for goal corrections', () => {
    expect(parseMatchMinute('23')).toEqual({ period: 1, elapsedMs: 22 * 60_000 })
    expect(parseMatchMinute('45+3')).toEqual({ period: 1, elapsedMs: 48 * 60_000 })
    expect(parseMatchMinute('72')).toEqual({ period: 2, elapsedMs: 26 * 60_000 })
    expect(parseMatchMinute('90+2')).toEqual({ period: 2, elapsedMs: 47 * 60_000 })
    expect(parseMatchMinute('91')).toBeNull()
    expect(parseMatchMinute('45 + 3′')).toEqual({ period: 1, elapsedMs: 48 * 60_000 })
  })

  it('restores a running clock from its saved start point and holds during pauses', () => {
    const running = clock({ status: 'running', elapsedMs: 2 * 60_000, startedAt: 1_000 })
    expect(getElapsedMs(running, 61_000)).toBe(3 * 60_000)

    const paused = pauseClock(running, 121_000)
    expect(paused).toMatchObject({ elapsedMs: 4 * 60_000, status: 'paused', startedAt: null })
    expect(getElapsedMs(paused, 999_000)).toBe(4 * 60_000)

    const resumed = resumeClock(paused, 500_000)
    expect(getElapsedMs(resumed, 501_000)).toBe(4 * 60_000 + 1_000)
  })
})
