import { describe, expect, it } from 'vitest'
import { createMatch, type GoalEvent, type Match, type MatchParticipation } from './match'
import { aggregatePlayerGoalStatistics } from './playerGoalStatistics'

function trackedMatch(
  id: string,
  options: {
    ownSide?: 'home' | 'away'
    squad?: MatchParticipation['squad']
    starterIds?: string[]
    status?: Match['clock']['status']
    period?: Match['clock']['period']
    elapsedMs?: number
    completed?: Match['completedPeriodElapsedMs']
    goals?: GoalEvent[]
  } = {},
): Match {
  return {
    ...createMatch('North City', 'South Town', 100, id),
    clock: {
      period: options.period ?? 1,
      elapsedMs: options.elapsedMs ?? 10_000,
      status: options.status ?? 'full-time',
      startedAt: null,
    },
    participation: {
      ownSide: options.ownSide ?? 'home',
      squad: options.squad ?? [{ playerId: 'alex', nameSnapshot: 'Alex' }],
      starterIds: options.starterIds ?? ['alex'],
      substitutions: [],
    },
    completedPeriodElapsedMs: options.completed ?? { 1: 10_000, 2: null },
    goals: options.goals ?? [],
  }
}

function goal(
  id: string,
  side: 'home' | 'away',
  scorerPlayerId: string | null,
  assistPlayerId: string | null,
  scorer = '',
  assist = '',
): GoalEvent {
  return {
    id,
    side,
    period: 1,
    elapsedMs: 1_000,
    scorerPlayerId,
    scorer,
    assistPlayerId,
    assist,
    description: '',
    createdAt: 1,
  }
}

describe('player goal statistics', () => {
  it('aggregates scorer and assist roles by explicit identity across started own-side matches', () => {
    const first = trackedMatch('first-match', {
      squad: [
        { playerId: 'alex', nameSnapshot: 'Alex' },
        { playerId: 'alex-copy', nameSnapshot: 'Alex' },
        { playerId: 'sam', nameSnapshot: 'Sam' },
      ],
      goals: [
        goal('alex-scores', 'home', 'alex', null, 'Alex'),
        goal('alex-assists', 'home', null, 'alex', '', 'Alex'),
        goal('sam-scores', 'home', 'sam', 'alex', 'Sam', 'Alex'),
        goal('opponent-goal', 'away', 'alex', 'sam', 'Alex', 'Sam'),
        goal('manual-names', 'home', null, null, 'Alex', 'Alex'),
      ],
    })
    const second = trackedMatch('second-match', {
      ownSide: 'away',
      squad: [{ playerId: 'alex', nameSnapshot: 'Alex in the match snapshot' }],
      goals: [goal('away-goal', 'away', 'alex', null, 'Renamed Alex')],
    })

    expect(aggregatePlayerGoalStatistics([first, second], 'alex')).toEqual({
      playerId: 'alex',
      goalCount: 2,
      assistCount: 2,
    })
    expect(aggregatePlayerGoalStatistics([first], 'sam')).toMatchObject({ goalCount: 1, assistCount: 0 })
    expect(aggregatePlayerGoalStatistics([first], 'alex-copy')).toMatchObject({ goalCount: 0, assistCount: 0 })
  })

  it('excludes untracked, not-started, opponent-side, out-of-squad, and manual-name-only goals', () => {
    const untracked = createMatch('Old North', 'Old South', 1, 'untracked')
    untracked.goals = [goal('untracked-goal', 'home', 'alex', 'alex', 'Alex', 'Alex')]
    const notStarted = trackedMatch('not-started', {
      status: 'not-started',
      goals: [goal('preparation-goal', 'home', 'alex', 'alex', 'Alex', 'Alex')],
    })
    const started = trackedMatch('started', {
      squad: [{ playerId: 'alex', nameSnapshot: 'Alex' }],
      goals: [
        goal('opponent-goal', 'away', 'alex', 'alex', 'Alex', 'Alex'),
        goal('outside-squad', 'home', 'absent-player', 'absent-player', 'Alex', 'Alex'),
        goal('manual-only', 'home', null, null, 'Alex', 'Alex'),
      ],
    })

    expect(aggregatePlayerGoalStatistics([untracked, notStarted, started], 'alex')).toEqual({
      playerId: 'alex',
      goalCount: 0,
      assistCount: 0,
    })
  })

  it('makes a preparation goal eligible after kickoff and does not duplicate totals on repeated reads or ticks', () => {
    const match = trackedMatch('preparation', {
      status: 'not-started',
      goals: [goal('preparation-goal', 'home', 'alex', 'sam', 'Alex', 'Sam')],
      squad: [
        { playerId: 'alex', nameSnapshot: 'Alex' },
        { playerId: 'sam', nameSnapshot: 'Sam' },
      ],
    })

    expect(aggregatePlayerGoalStatistics([match], 'alex').goalCount).toBe(0)
    match.clock = { period: 1, elapsedMs: 1_000, status: 'running', startedAt: 1_000 }
    expect(aggregatePlayerGoalStatistics([match], 'alex')).toMatchObject({ goalCount: 1, assistCount: 0 })
    expect(aggregatePlayerGoalStatistics([match], 'sam')).toMatchObject({ goalCount: 0, assistCount: 1 })

    match.clock.elapsedMs += 5_000
    expect(aggregatePlayerGoalStatistics([match], 'alex')).toMatchObject({ goalCount: 1, assistCount: 0 })
    expect(aggregatePlayerGoalStatistics([match], 'sam')).toMatchObject({ goalCount: 0, assistCount: 1 })
  })

  it('counts zero-minute squad members and contributions from matches with unknown playing-time history', () => {
    const zeroTime = trackedMatch('zero-time', {
      squad: [
        { playerId: 'alex', nameSnapshot: 'Alex' },
        { playerId: 'sam', nameSnapshot: 'Sam' },
      ],
      starterIds: ['alex'],
      goals: [goal('bench-scorer', 'home', 'sam', null, 'Sam')],
    })
    const unknownDuration = trackedMatch('unknown-duration', {
      period: 2,
      status: 'paused',
      elapsedMs: 5_000,
      completed: { 1: null, 2: null },
      goals: [goal('unknown-time-assist', 'home', null, 'alex', '', 'Alex')],
    })

    expect(aggregatePlayerGoalStatistics([zeroTime], 'sam')).toMatchObject({ goalCount: 1, assistCount: 0 })
    expect(aggregatePlayerGoalStatistics([unknownDuration], 'alex')).toMatchObject({ goalCount: 0, assistCount: 1 })
  })

  it('derives replacement, clearing, and team-correction totals from current committed goal details', () => {
    const corrected = trackedMatch('corrected', {
      squad: [
        { playerId: 'alex', nameSnapshot: 'Alex' },
        { playerId: 'sam', nameSnapshot: 'Sam' },
      ],
      goals: [goal('correctable', 'home', 'alex', 'sam', 'Alex', 'Sam')],
    })
    expect(aggregatePlayerGoalStatistics([corrected], 'alex')).toMatchObject({ goalCount: 1, assistCount: 0 })
    expect(aggregatePlayerGoalStatistics([corrected], 'sam')).toMatchObject({ goalCount: 0, assistCount: 1 })

    corrected.goals[0].scorerPlayerId = 'sam'
    corrected.goals[0].scorer = 'Sam'
    corrected.goals[0].assistPlayerId = null
    corrected.goals[0].assist = ''
    expect(aggregatePlayerGoalStatistics([corrected], 'alex')).toMatchObject({ goalCount: 0, assistCount: 0 })
    expect(aggregatePlayerGoalStatistics([corrected], 'sam')).toMatchObject({ goalCount: 1, assistCount: 0 })

    corrected.goals[0].side = 'away'
    expect(aggregatePlayerGoalStatistics([corrected], 'sam')).toMatchObject({ goalCount: 0, assistCount: 0 })
  })
})
