import type { ClockState, MatchPeriod } from './match'

export const REGULATION_HALF_MS = 45 * 60 * 1000
const MINUTE_MS = 60 * 1000

export function getElapsedMs(clock: ClockState, now = Date.now()): number {
  if (clock.status !== 'running' || clock.startedAt === null) return clock.elapsedMs
  return clock.elapsedMs + Math.max(0, now - clock.startedAt)
}

export function formatMatchMinute(period: MatchPeriod, elapsedMs: number): string {
  const safeElapsedMs = Math.max(0, elapsedMs)
  const regulationMinute = period === 1 ? 45 : 90

  if (safeElapsedMs < REGULATION_HALF_MS) {
    const currentMinute = Math.floor(safeElapsedMs / MINUTE_MS) + 1
    return `${(period - 1) * 45 + currentMinute}′`
  }

  const addedMinutes = Math.ceil((safeElapsedMs - REGULATION_HALF_MS) / MINUTE_MS)
  return `${regulationMinute}+${addedMinutes}′`
}

export function parseMatchMinute(value: string): { period: MatchPeriod; elapsedMs: number } | null {
  const normalized = value.trim().replace(/[′']/g, '')
  const match = /^(\d{1,2})(?:\s*\+\s*(\d{1,2}))?$/.exec(normalized)
  if (!match) return null

  const minute = Number(match[1])
  const addedMinutes = match[2] === undefined ? null : Number(match[2])
  if (addedMinutes !== null) {
    if (minute === 45) return { period: 1, elapsedMs: REGULATION_HALF_MS + addedMinutes * MINUTE_MS }
    if (minute === 90) return { period: 2, elapsedMs: REGULATION_HALF_MS + addedMinutes * MINUTE_MS }
    return null
  }

  if (minute >= 1 && minute <= 45) {
    return { period: 1, elapsedMs: (minute - 1) * MINUTE_MS }
  }
  if (minute >= 46 && minute <= 90) {
    return { period: 2, elapsedMs: (minute - 46) * MINUTE_MS }
  }
  return null
}

export function getMatchMinute(clock: ClockState, now = Date.now()): string {
  return formatMatchMinute(clock.period, getElapsedMs(clock, now))
}

export function resumeClock(clock: ClockState, now = Date.now()): ClockState {
  if (clock.status === 'running' || clock.status === 'halftime' || clock.status === 'full-time') {
    return clock
  }

  return { ...clock, status: 'running', startedAt: now }
}

export function pauseClock(clock: ClockState, now = Date.now()): ClockState {
  if (clock.status !== 'running') return clock

  return {
    ...clock,
    elapsedMs: getElapsedMs(clock, now),
    status: 'paused',
    startedAt: null,
  }
}

export function endFirstHalf(clock: ClockState, now = Date.now()): ClockState {
  if (clock.period !== 1 || clock.status === 'halftime' || clock.status === 'full-time') return clock

  return {
    ...clock,
    elapsedMs: getElapsedMs(clock, now),
    status: 'halftime',
    startedAt: null,
  }
}

export function startSecondHalf(clock: ClockState, now = Date.now()): ClockState {
  if (clock.period !== 1 || clock.status !== 'halftime') return clock

  return {
    period: 2,
    elapsedMs: 0,
    status: 'running',
    startedAt: now,
  }
}

export function finishMatch(clock: ClockState, now = Date.now()): ClockState {
  if (clock.status === 'full-time') return clock

  return {
    ...clock,
    elapsedMs: getElapsedMs(clock, now),
    status: 'full-time',
    startedAt: null,
  }
}
