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
    const initial = createMatch('North City', 'South Town', 100, 'period-endpoints')
    let records: Match[] = [{
      ...initial,
      goals: [{
        id: 'attributed-goal', side: 'home', period: 1, elapsedMs: 123_456,
        scorerPlayerId: 'player-alex', scorer: 'Alex snapshot',
        assistPlayerId: 'player-sam', assist: 'Sam snapshot', description: '', createdAt: 150,
      }],
      participation: {
        ownSide: 'home',
        squad: [{ playerId: 'player-alex', nameSnapshot: 'Alex' }],
        starterIds: ['player-alex'],
        substitutions: [],
      },
      jerseyAssignment: {
        setId: 'set-blue',
        setNameSnapshot: 'Blue',
        rows: [{
          playerId: 'player-alex',
          jersey: { jerseyId: 'jersey-zero', number: 0, size: 'M', ownerPlayerId: null },
        }],
      },
    }]
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
    expect(store.matches.value[0].firstKickoffAt).toBe(firstKickoffAt)
    await act('end-first-half', firstKickoffAt + 47 * 60_000)
    expect(store.matches.value[0].firstKickoffAt).toBe(firstKickoffAt)
    expect(store.matches.value[0].completedPeriodElapsedMs).toEqual({ 1: 47 * 60_000, 2: null })
    expect(store.matches.value[0].clock).toMatchObject({
      period: 1,
      elapsedMs: 47 * 60_000,
      status: 'halftime',
      startedAt: null,
    })

    const secondKickoffAt = firstKickoffAt + 47 * 60_000 + 20 * 60_000
    await act('start-second-half', secondKickoffAt)
    expect(store.matches.value[0].firstKickoffAt).toBe(firstKickoffAt)
    expect(store.matches.value[0].completedPeriodElapsedMs).toEqual({ 1: 47 * 60_000, 2: null })
    expect(store.matches.value[0].clock).toMatchObject({
      period: 2, elapsedMs: 0, status: 'running', startedAt: secondKickoffAt,
    })

    const pauseAt = secondKickoffAt + 5 * 60_000
    await act('pause', pauseAt)
    expect(store.matches.value[0].firstKickoffAt).toBe(firstKickoffAt)
    expect(store.matches.value[0].clock).toMatchObject({
      elapsedMs: 5 * 60_000, status: 'paused', startedAt: null,
    })
    expect(store.matches.value[0].completedPeriodElapsedMs).toEqual({ 1: 47 * 60_000, 2: null })

    const resumeAt = pauseAt + 30 * 60_000
    await act('resume', resumeAt)
    expect(store.matches.value[0].firstKickoffAt).toBe(firstKickoffAt)
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
    expect(fullTime.firstKickoffAt).toBe(firstKickoffAt)
    expect(fullTime.jerseyAssignment).toEqual(records[0].jerseyAssignment)
    expect(fullTime.goals).toEqual(records[0].goals)
    expect(fullTime.participation).toEqual(records[0].participation)
    expect(getElapsedMs(fullTime.clock, resumeAt + 24 * 60 * 60_000)).toBe(48 * 60_000)
    expect(formatMatchMinute(1, fullTime.completedPeriodElapsedMs[1]!)).toBe('45+2′')
    expect(formatMatchMinute(2, fullTime.completedPeriodElapsedMs[2]!)).toBe('90+3′')
  })

  it('uses the accepted kickoff time even when its save completes later', async () => {
    let resolveSave!: () => void
    const saveDelay = new Promise<void>((resolve) => { resolveSave = resolve })
    let savedCandidate: Match | undefined
    const original = createMatch('North City', 'South Town', 100, 'delayed-first-kickoff')
    const repository: MatchRepository = {
      listMatches: async () => [original],
      getMatch: async () => original,
      async saveMatch(match) {
        savedCandidate = match
        await saveDelay
      },
      close: () => undefined,
    }
    const store = createMatchStore(repository)
    await store.load()

    const kickoffAt = 12_345
    const saving = applyMatchClockAction(store.matches.value[0], 'resume', store, kickoffAt)
    expect(savedCandidate?.firstKickoffAt).toBe(kickoffAt)
    expect(store.matches.value[0].firstKickoffAt).toBeNull()
    resolveSave()
    await saving
    expect(store.matches.value[0].firstKickoffAt).toBe(kickoffAt)
  })

  it('keeps a failed first start uncommitted and uses the retry action time', async () => {
    let records: Match[] = [createMatch('North City', 'South Town', 100, 'retry-first-kickoff')]
    let failFirstSave = true
    const repository: MatchRepository = {
      listMatches: async () => records.map((match) => structuredClone(match)),
      getMatch: async (id) => records.find((match) => match.id === id),
      async saveMatch(match) {
        if (failFirstSave) {
          failFirstSave = false
          throw new Error('Temporary write failure.')
        }
        records = [structuredClone(match)]
      },
      close: () => undefined,
    }
    const store = createMatchStore(repository)
    await store.load()

    await expect(applyMatchClockAction(store.matches.value[0], 'resume', store, 1_000))
      .rejects.toThrow('Temporary write failure.')
    expect(store.matches.value[0].clock.status).toBe('not-started')
    expect(store.matches.value[0].firstKickoffAt).toBeNull()

    await applyMatchClockAction(store.matches.value[0], 'resume', store, 2_000)
    expect(store.matches.value[0].clock.startedAt).toBe(2_000)
    expect(store.matches.value[0].firstKickoffAt).toBe(2_000)
  })

  it('does not infer kickoff chronology when resuming a legacy already-started match', async () => {
    const legacyStarted: Match = {
      ...createMatch('North City', 'South Town', 100, 'legacy-started-match'),
      clock: { period: 1, elapsedMs: 90_000, status: 'paused', startedAt: null },
      firstKickoffAt: null,
    }
    const repository: MatchRepository = {
      listMatches: async () => [legacyStarted],
      getMatch: async () => legacyStarted,
      saveMatch: async () => undefined,
      close: () => undefined,
    }
    const store = createMatchStore(repository)
    await store.load()

    await applyMatchClockAction(store.matches.value[0], 'resume', store, 5_000)
    expect(store.matches.value[0].clock.startedAt).toBe(5_000)
    expect(store.matches.value[0].firstKickoffAt).toBeNull()
    await applyMatchClockAction(store.matches.value[0], 'pause', store, 8_000)
    await applyMatchClockAction(store.matches.value[0], 'resume', store, 20_000)
    expect(store.matches.value[0].firstKickoffAt).toBeNull()
  })
})
