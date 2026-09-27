import { describe, expect, it } from 'vitest'
import {
  createMatch,
  createMatchStore,
  formatMatchMinute,
  getElapsedMs,
  type Match,
  type MatchRepository,
} from '../../../entities/match'
import { applyMatchClockAction, type MatchClockAction } from './controlMatchClock'

describe('match clock persistence', () => {
  it('freezes actual half durations, excludes pauses, and preserves a running anchor after reload', async () => {
    let records: Match[] = [createMatch('North City', 'South Town', 100, 'period-endpoints')]
    const repository: MatchRepository = {
      listMatches: async () => records.map((match) => ({
        ...match,
        clock: { ...match.clock },
        goals: match.goals.map((goal) => ({ ...goal })),
        completedPeriodElapsedMs: { ...match.completedPeriodElapsedMs },
      })),
      getMatch: async (id) => records.find((match) => match.id === id),
      async saveMatch(match) {
        records = [...records.filter((saved) => saved.id !== match.id), {
          ...match,
          clock: { ...match.clock },
          goals: match.goals.map((goal) => ({ ...goal })),
          completedPeriodElapsedMs: { ...match.completedPeriodElapsedMs },
        }]
      },
      close: () => undefined,
    }

    const store = createMatchStore(repository)
    await store.load()
    const act = (action: MatchClockAction, now: number, currentStore = store) =>
      applyMatchClockAction(currentStore.matches.value[0], action, currentStore, now)

    const firstKickoffAt = 10_000
    await act('resume', firstKickoffAt)
    await act('end-first-half', firstKickoffAt + 47 * 60_000)
    expect(store.matches.value[0].completedPeriodElapsedMs).toEqual({ 1: 47 * 60_000, 2: null })
    expect(store.matches.value[0].clock).toMatchObject({
      period: 1,
      elapsedMs: 47 * 60_000,
      status: 'halftime',
      startedAt: null,
    })

    const secondKickoffAt = firstKickoffAt + 47 * 60_000 + 20 * 60_000
    await act('start-second-half', secondKickoffAt)
    expect(store.matches.value[0].completedPeriodElapsedMs).toEqual({ 1: 47 * 60_000, 2: null })
    expect(store.matches.value[0].clock).toMatchObject({
      period: 2, elapsedMs: 0, status: 'running', startedAt: secondKickoffAt,
    })

    const pauseAt = secondKickoffAt + 5 * 60_000
    await act('pause', pauseAt)
    expect(store.matches.value[0].clock).toMatchObject({
      elapsedMs: 5 * 60_000, status: 'paused', startedAt: null,
    })
    expect(store.matches.value[0].completedPeriodElapsedMs).toEqual({ 1: 47 * 60_000, 2: null })

    const resumeAt = pauseAt + 30 * 60_000
    await act('resume', resumeAt)
    const savedRunningClock = { ...store.matches.value[0].clock }
    const reloadedStore = createMatchStore(repository)
    await reloadedStore.load()
    expect(reloadedStore.matches.value[0].clock).toEqual(savedRunningClock)
    expect(reloadedStore.matches.value[0].clock.startedAt).toBe(resumeAt)

    await act('finish', resumeAt + 43 * 60_000, reloadedStore)
    const fullTime = reloadedStore.matches.value[0]
    expect(fullTime.clock).toMatchObject({
      period: 2, elapsedMs: 48 * 60_000, status: 'full-time', startedAt: null,
    })
    expect(fullTime.completedPeriodElapsedMs).toEqual({ 1: 47 * 60_000, 2: 48 * 60_000 })
    expect(getElapsedMs(fullTime.clock, resumeAt + 24 * 60 * 60_000)).toBe(48 * 60_000)
    expect(formatMatchMinute(1, fullTime.completedPeriodElapsedMs[1]!)).toBe('45+2′')
    expect(formatMatchMinute(2, fullTime.completedPeriodElapsedMs[2]!)).toBe('90+3′')
  })
})
