import { describe, expect, it } from 'vitest'
import { aggregatePlayerParticipation } from './playerStatistics'
import { createMatch, type Match, type MatchParticipation } from './match'
import type { SubstitutionEvent } from './match'

function trackedMatch(
  id: string,
  createdAt: number,
  participation: MatchParticipation,
  options: {
    clock?: Match['clock']
    completed?: Match['completedPeriodElapsedMs']
    homeTeam?: string
    awayTeam?: string
  } = {},
): Match {
  return {
    ...createMatch(options.homeTeam ?? 'North City', options.awayTeam ?? 'South Town', createdAt, id),
    clock: options.clock ?? { period: 1, elapsedMs: 0, status: 'full-time', startedAt: null },
    participation,
    completedPeriodElapsedMs: options.completed ?? { 1: 20 * 60_000, 2: null },
  }
}

function participation(
  squad: Array<{ playerId: string; nameSnapshot: string }>,
  starterIds: string[],
  substitutions: SubstitutionEvent[] = [],
  ownSide: 'home' | 'away' = 'home',
): MatchParticipation {
  return { ownSide, squad, starterIds, substitutions }
}

function substitution(
  id: string,
  outgoingPlayerId: string,
  incomingPlayerId: string,
  elapsedMs: number,
  sequence: number,
): SubstitutionEvent {
  return { id, outgoingPlayerId, incomingPlayerId, period: 1, elapsedMs, sequence, createdAt: sequence }
}

describe('cross-match player statistics', () => {
  it('aggregates one appearance per match across repeated spells and two matches', () => {
    const alexOnly = [{ playerId: 'alex', nameSnapshot: 'Alex' }]
    const first = trackedMatch(
      'first-match', 100,
      participation(
        [
          ...alexOnly,
          { playerId: 'sam', nameSnapshot: 'Sam' },
        ],
        ['alex'],
        [
          substitution('alex-off', 'alex', 'sam', 18 * 60_000, 1),
          substitution('alex-back', 'sam', 'alex', 30 * 60_000, 2),
        ],
      ),
      { completed: { 1: 47 * 60_000, 2: null } },
    )
    const second = trackedMatch(
      'second-match', 200,
      participation(alexOnly, ['alex'], [], 'away'),
      {
        homeTeam: 'East Town',
        awayTeam: 'Alex United',
        clock: { period: 1, elapsedMs: 20 * 60_000, status: 'full-time', startedAt: null },
        completed: { 1: 20 * 60_000, 2: null },
      },
    )

    const statistics = aggregatePlayerParticipation([first, second], 'alex', 500)

    expect(statistics.totalElapsedMs).toBe(55 * 60_000)
    expect(statistics.appearanceCount).toBe(2)
    expect(statistics.breakdowns).toEqual([
      {
        matchId: 'second-match', opponent: 'East Town', ownSide: 'away', date: 200,
        status: 'full-time', elapsedMs: 20 * 60_000, appearance: true, liveContribution: false,
      },
      {
        matchId: 'first-match', opponent: 'South Town', ownSide: 'home', date: 100,
        status: 'full-time', elapsedMs: 35 * 60_000, appearance: true, liveContribution: false,
      },
    ])
  })

  it('includes an unused bench selection as a zero-time breakdown without an appearance', () => {
    const match = trackedMatch(
      'unused-bench', 100,
      participation([
        { playerId: 'alex', nameSnapshot: 'Alex' },
        { playerId: 'sam', nameSnapshot: 'Sam' },
      ], ['alex']),
      { completed: { 1: 20 * 60_000, 2: null } },
    )

    const statistics = aggregatePlayerParticipation([match], 'sam', 500)

    expect(statistics).toMatchObject({ totalElapsedMs: 0, appearanceCount: 0 })
    expect(statistics.breakdowns).toEqual([expect.objectContaining({
      matchId: 'unused-bench', elapsedMs: 0, appearance: false, liveContribution: false,
    })])
  })

  it('keeps same-name player IDs and zero-time players distinct', () => {
    const match = trackedMatch(
      'same-name-match', 100,
      participation([
        { playerId: 'alex-one', nameSnapshot: 'Alex' },
        { playerId: 'alex-two', nameSnapshot: 'Alex' },
      ], ['alex-one']),
      { completed: { 1: 1_000, 2: null } },
    )

    const first = aggregatePlayerParticipation([match], 'alex-one', 500)
    const second = aggregatePlayerParticipation([match], 'alex-two', 500)

    expect(first.totalElapsedMs).toBe(1_000)
    expect(first.appearanceCount).toBe(1)
    expect(second.totalElapsedMs).toBe(0)
    expect(second.appearanceCount).toBe(0)
    expect(second.breakdowns).toHaveLength(1)
  })

  it('marks current on-pitch contributions as live and leaves the bench contribution fixed', () => {
    const match = trackedMatch(
      'live-match', 100,
      participation([
        { playerId: 'alex', nameSnapshot: 'Alex' },
        { playerId: 'sam', nameSnapshot: 'Sam' },
      ], ['alex']),
      {
        clock: { period: 1, elapsedMs: 2_000, status: 'running', startedAt: 1_000 },
        completed: { 1: null, 2: null },
      },
    )

    const alex = aggregatePlayerParticipation([match], 'alex', 6_000)
    const sam = aggregatePlayerParticipation([match], 'sam', 6_000)

    expect(alex).toMatchObject({ totalElapsedMs: 7_000, appearanceCount: 1 })
    expect(alex.breakdowns[0].liveContribution).toBe(true)
    expect(sam).toMatchObject({ totalElapsedMs: 0, appearanceCount: 0 })
    expect(sam.breakdowns[0].liveContribution).toBe(false)
  })

  it('excludes untracked and not-started matches rather than inventing zero-time appearances', () => {
    const untracked = createMatch('Old Home', 'Old Away', 100, 'untracked')
    untracked.clock = { period: 2, elapsedMs: 10_000, status: 'full-time', startedAt: null }
    const notStarted = trackedMatch(
      'not-started', 200,
      participation([{ playerId: 'alex', nameSnapshot: 'Alex' }], ['alex']),
      {
        clock: { period: 1, elapsedMs: 0, status: 'not-started', startedAt: null },
        completed: { 1: null, 2: null },
      },
    )

    const statistics = aggregatePlayerParticipation([untracked, notStarted], 'alex', 500)

    expect(statistics).toMatchObject({ totalElapsedMs: 0, appearanceCount: 0, breakdowns: [] })
    expect(statistics.excludedMatches).toEqual([
      { matchId: 'not-started', reason: 'not-started' },
      { matchId: 'untracked', reason: 'untracked' },
    ])
  })

  it('excludes a tracked match with an unknown historical half instead of making up a total', () => {
    const match = trackedMatch(
      'unknown-half', 100,
      participation([{ playerId: 'alex', nameSnapshot: 'Alex' }], ['alex']),
      {
        clock: { period: 2, elapsedMs: 10_000, status: 'paused', startedAt: null },
        completed: { 1: null, 2: null },
      },
    )

    const statistics = aggregatePlayerParticipation([match], 'alex', 500)

    expect(statistics.breakdowns).toEqual([])
    expect(statistics.excludedMatches).toEqual([expect.objectContaining({
      matchId: 'unknown-half', reason: 'invalid-history',
    })])
  })
})
