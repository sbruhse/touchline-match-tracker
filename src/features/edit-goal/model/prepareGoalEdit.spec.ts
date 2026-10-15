import { describe, expect, it } from 'vitest'
import { createMatch, formatMatchMinute, type GoalEvent, type Match } from '../../../entities/match'
import type { GoalEditDraftInput } from './prepareGoalEdit'
import { prepareGoalEdit } from './prepareGoalEdit'

function fixtureGoal(overrides: Partial<GoalEvent> = {}): GoalEvent {
  return {
    id: 'goal-one',
    side: 'home',
    period: 1,
    elapsedMs: 91_234,
    scorerPlayerId: null,
    scorer: '',
    assistPlayerId: null,
    assist: '',
    description: '',
    createdAt: 1_250,
    ...overrides,
  }
}

function fixtureMatch(goal = fixtureGoal()): Match {
  return {
    ...createMatch('North City', 'South Town', 100, 'goal-edit-match'),
    goals: [goal],
    participation: {
      ownSide: 'home',
      squad: [
        { playerId: 'alex-id', nameSnapshot: 'Alex match snapshot' },
        { playerId: 'sam-id', nameSnapshot: 'Sam match snapshot' },
      ],
      starterIds: ['alex-id'],
      substitutions: [],
    },
  }
}

function draftFor(goal: GoalEvent, values: Partial<GoalEditDraftInput> = {}): GoalEditDraftInput {
  const savedDisplayTime = formatMatchMinute(goal.period, goal.elapsedMs).replace('′', '')
  return {
    side: goal.side,
    time: savedDisplayTime,
    savedDisplayTime,
    scorer: { mode: 'none' },
    assist: { mode: 'none' },
    description: goal.description,
    ...values,
  }
}

describe('prepareGoalEdit', () => {
  it.each([
    { period: 1 as const, elapsedMs: 91_234 },
    { period: 2 as const, elapsedMs: 2_745_678 },
  ])('preserves exact sub-minute and stoppage time when the displayed minute is unchanged', ({ period, elapsedMs }) => {
    const original = fixtureGoal({ period, elapsedMs })
    const match = fixtureMatch(original)
    const prepared = prepareGoalEdit(match, original.id, draftFor(original, {
      time: ` ${formatMatchMinute(period, elapsedMs).replace('′', '')}′ `,
      scorer: { mode: 'manual', name: 'Typed name' },
    }))

    expect(prepared).toMatchObject({
      ok: true,
      goal: { period, elapsedMs, scorer: 'Typed name', scorerPlayerId: null },
    })
  })

  it('uses a changed minute, while retaining the saved goal identity and creation time', () => {
    const original = fixtureGoal({ id: 'stable-goal-id', createdAt: 8_765 })
    const prepared = prepareGoalEdit(fixtureMatch(original), original.id, draftFor(original, {
      time: '90+2',
      scorer: { mode: 'squad', playerId: 'alex-id', name: 'Outdated name', label: '#7 Alex' },
      assist: { mode: 'none' },
      description: '  Corrected details  ',
    }))

    expect(prepared).toMatchObject({
      ok: true,
      goal: {
        id: 'stable-goal-id',
        createdAt: 8_765,
        period: 2,
        elapsedMs: 47 * 60_000,
        scorerPlayerId: 'alex-id',
        scorer: 'Alex match snapshot',
        assistPlayerId: null,
        assist: '',
        description: 'Corrected details',
      },
    })
  })

  it('rejects malformed changed time without producing a goal candidate', () => {
    const original = fixtureGoal()
    expect(prepareGoalEdit(fixtureMatch(original), original.id, draftFor(original, { time: '44+2' }))).toEqual({
      ok: false,
      field: 'time',
      error: 'Enter a minute from 1–90, or stoppage time such as 45+2.',
    })
  })

  it('rejects stale squad selections instead of silently clearing them', () => {
    const original = fixtureGoal()
    const match = fixtureMatch(original)
    match.participation!.squad = [{ playerId: 'sam-id', nameSnapshot: 'Sam match snapshot' }]

    expect(prepareGoalEdit(match, original.id, draftFor(original, {
      scorer: { mode: 'squad', playerId: 'alex-id', name: 'Alex match snapshot', label: '#7 Alex' },
    }))).toMatchObject({
      ok: false,
      field: 'details',
      error: 'The linked scorer must belong to the saved match squad.',
    })
  })

  it('rejects a saved-squad identity on an opponent goal and keeps optional roles independent', () => {
    const original = fixtureGoal()
    const match = fixtureMatch(original)
    const invalid = prepareGoalEdit(match, original.id, draftFor(original, {
      side: 'away',
      scorer: { mode: 'squad', playerId: 'alex-id', name: 'Alex match snapshot', label: 'Alex' },
      assist: { mode: 'manual', name: '  Guest assist  ' },
    }))
    expect(invalid).toMatchObject({
      ok: false,
      field: 'details',
      error: 'Linked goal players can only be assigned to a goal for the saved own side.',
    })

    const optional = prepareGoalEdit(match, original.id, draftFor(original, {
      scorer: { mode: 'none' },
      assist: { mode: 'manual', name: ' Guest assist ' },
    }))
    expect(optional).toMatchObject({
      ok: true,
      goal: { scorerPlayerId: null, scorer: '', assistPlayerId: null, assist: 'Guest assist' },
    })
  })

  it('rejects a goal removed from the latest committed match', () => {
    const original = fixtureGoal()
    const match = fixtureMatch(original)
    match.goals = []
    expect(prepareGoalEdit(match, original.id, draftFor(original))).toMatchObject({
      ok: false,
      field: 'details',
      error: 'This goal is no longer part of the saved match. Close and reopen its details.',
    })
  })
})
