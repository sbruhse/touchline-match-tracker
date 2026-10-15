import { describe, expect, it } from 'vitest'
import { reconcileGoalAttributions, validateGoalAttribution } from './goalAttribution'
import type { GoalEvent, MatchParticipation } from './match'

const participation: MatchParticipation = {
  ownSide: 'home',
  squad: [
    { playerId: 'player-1', nameSnapshot: 'Alex' },
    { playerId: 'player-2', nameSnapshot: 'Alex' },
  ],
  starterIds: ['player-1'],
  substitutions: [],
}

function goal(overrides: Partial<GoalEvent> = {}): GoalEvent {
  return {
    id: 'goal-1',
    side: 'home',
    period: 1,
    elapsedMs: 60_000,
    scorerPlayerId: null,
    scorer: '',
    assistPlayerId: null,
    assist: '',
    description: '',
    createdAt: 100,
    ...overrides,
  }
}

describe('goal attribution validation', () => {
  it('allows scorer and assist roles to be independently optional', () => {
    expect(validateGoalAttribution(goal({ scorerPlayerId: 'player-1', scorer: 'Alex' }), participation)).toBeNull()
    expect(validateGoalAttribution(goal({ assistPlayerId: 'player-2', assist: 'Alex' }), participation)).toBeNull()
    expect(validateGoalAttribution(goal(), null)).toBeNull()
  })

  it('accepts saved-squad identities without requiring a live directory or positive playing time', () => {
    expect(validateGoalAttribution(goal({ scorerPlayerId: 'player-2', scorer: 'Saved Alex' }), participation)).toBeNull()
  })

  it.each([
    ['blank identity', goal({ scorerPlayerId: '  ', scorer: 'Alex' }), participation, 'valid player identity'],
    ['blank recorded name', goal({ assistPlayerId: 'player-1', assist: '  ' }), participation, 'recorded name'],
    ['outside-squad identity', goal({ scorerPlayerId: 'player-outside', scorer: 'Alex' }), participation, 'saved match squad'],
    ['opponent-side identity', goal({ side: 'away', scorerPlayerId: 'player-1', scorer: 'Alex' }), participation, 'saved own side'],
    ['identity without a saved squad', goal({ scorerPlayerId: 'player-1', scorer: 'Alex' }), null, 'saved match squad'],
  ])('rejects %s', (_label, candidate, squad, message) => {
    expect(validateGoalAttribution(candidate, squad)).toContain(message)
  })

  it('does not treat matching names or numbers as links', () => {
    const nameOnly = goal({ scorer: 'Alex', assist: 'Alex' })
    expect(validateGoalAttribution(nameOnly, participation)).toBeNull()
    expect(nameOnly.scorerPlayerId).toBeNull()
    expect(nameOnly.assistPlayerId).toBeNull()
  })

  it('retains eligible links independently of the starter selection', () => {
    const linked = goal({ scorerPlayerId: 'player-1', scorer: 'Alex', assistPlayerId: 'player-2', assist: 'Alex' })
    const changedStarters = { ...participation, starterIds: ['player-2'] }

    expect(reconcileGoalAttributions([linked], changedStarters)).toEqual([linked])
  })

  it('clears only ineligible role links and preserves both recorded names', () => {
    const linked = goal({ scorerPlayerId: 'player-1', scorer: 'Saved scorer', assistPlayerId: 'player-2', assist: 'Saved assist' })

    expect(reconcileGoalAttributions([linked], {
      ...participation,
      squad: [{ playerId: 'player-1', nameSnapshot: 'Alex' }],
    })).toMatchObject([{
      scorerPlayerId: 'player-1', scorer: 'Saved scorer',
      assistPlayerId: null, assist: 'Saved assist',
    }])
    expect(reconcileGoalAttributions([linked], { ...participation, ownSide: 'away' })).toMatchObject([{
      scorerPlayerId: null, scorer: 'Saved scorer',
      assistPlayerId: null, assist: 'Saved assist',
    }])
    expect(reconcileGoalAttributions([linked], null)).toMatchObject([{
      scorerPlayerId: null, scorer: 'Saved scorer',
      assistPlayerId: null, assist: 'Saved assist',
    }])
  })
})
