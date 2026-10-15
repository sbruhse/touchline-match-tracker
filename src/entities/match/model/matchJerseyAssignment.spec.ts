import { describe, expect, it } from 'vitest'
import type { MatchJerseyAssignment, MatchParticipation } from './match'
import {
  getAcceptedJerseyNumber,
  reconcileMatchJerseyAssignment,
  validateMatchJerseyAssignment,
} from './matchJerseyAssignment'

function participation(): MatchParticipation {
  return {
    ownSide: 'home',
    squad: [
      { playerId: 'player-alex', nameSnapshot: 'Alex' },
      { playerId: 'player-ben', nameSnapshot: 'Ben' },
    ],
    starterIds: ['player-alex'],
    substitutions: [],
  }
}

function assignment(): MatchJerseyAssignment {
  return {
    setId: 'set-blue',
    setNameSnapshot: 'Blue',
    rows: [
      {
        playerId: 'player-alex',
        jersey: { jerseyId: 'jersey-zero', number: 0, size: 'XS', ownerPlayerId: 'player-ben' },
      },
      { playerId: 'player-ben', jersey: null },
    ],
  }
}

describe('match jersey assignment model', () => {
  it('accepts complete and partial distributions using stable player and jersey identities', () => {
    expect(validateMatchJerseyAssignment(participation(), assignment())).toBeNull()

    const partial = assignment()
    partial.rows[0].jersey = null
    expect(validateMatchJerseyAssignment(participation(), partial)).toBeNull()
  })

  it('requires one row for every squad identity and rejects duplicate players', () => {
    const duplicatePlayer = assignment()
    duplicatePlayer.rows[1] = { ...duplicatePlayer.rows[0] }
    expect(validateMatchJerseyAssignment(participation(), duplicatePlayer))
      .toBe('A player can have only one jersey assignment row.')

    const missingPlayer = assignment()
    missingPlayer.rows.pop()
    expect(validateMatchJerseyAssignment(participation(), missingPlayer))
      .toBe('Jersey assignment rows must exactly match the saved match squad.')
  })

  it('rejects duplicated physical jerseys, numbers, and out-of-squad identities', () => {
    const duplicateJersey = assignment()
    duplicateJersey.rows[1] = {
      playerId: 'player-ben',
      jersey: { jerseyId: 'jersey-zero', number: 8, size: 'L', ownerPlayerId: null },
    }
    expect(validateMatchJerseyAssignment(participation(), duplicateJersey))
      .toBe('A physical jersey can be assigned only once.')

    const duplicateNumber = assignment()
    duplicateNumber.rows[1] = {
      playerId: 'player-ben',
      jersey: { jerseyId: 'jersey-eight', number: 0, size: 'L', ownerPlayerId: null },
    }
    expect(validateMatchJerseyAssignment(participation(), duplicateNumber))
      .toBe('A jersey number can be assigned only once across the match squad.')

    const wrongSquad = assignment()
    wrongSquad.rows[1] = { playerId: 'another-player', jersey: null }
    expect(validateMatchJerseyAssignment(participation(), wrongSquad))
      .toBe('Every jersey assignment row must belong to the saved match squad.')
  })

  it('accepts manual size and ownership overrides without inventory lookups', () => {
    expect(validateMatchJerseyAssignment(participation(), assignment())).toBeNull()
    expect(validateMatchJerseyAssignment(null, assignment()))
      .toBe('A jersey distribution requires a saved match squad.')
    expect(validateMatchJerseyAssignment(null, null)).toBeNull()
  })

  it('looks up accepted numbers by stable player identity and distinguishes unassigned from unprepared', () => {
    const accepted = assignment()
    const liveInventoryJersey = { id: 'jersey-zero', number: 0 }
    liveInventoryJersey.number = 99

    expect(getAcceptedJerseyNumber(accepted, 'player-alex')).toBe(0)
    expect(getAcceptedJerseyNumber(accepted, 'player-ben')).toBeNull()
    expect(getAcceptedJerseyNumber(accepted, 'missing-player')).toBeUndefined()
    expect(getAcceptedJerseyNumber(null, 'player-alex')).toBeUndefined()
    expect(liveInventoryJersey.number).toBe(99)
    expect(accepted.rows[0].jersey?.number).toBe(0)
  })

  it('reconciles assignments by stable player ID and exposes newcomers as unassigned', () => {
    const previous = assignment()
    previous.rows[1].jersey = { jerseyId: 'jersey-eight', number: 8, size: 'L', ownerPlayerId: null }
    const nextParticipation: MatchParticipation = {
      ...participation(),
      squad: [
        { playerId: 'player-ben', nameSnapshot: 'Ben renamed' },
        { playerId: 'player-casey', nameSnapshot: 'Casey' },
        { playerId: 'player-alex', nameSnapshot: 'Alex' },
      ],
    }

    const next = reconcileMatchJerseyAssignment(previous, nextParticipation)

    expect(next).toEqual({
      setId: 'set-blue',
      setNameSnapshot: 'Blue',
      rows: [
        { playerId: 'player-ben', jersey: { jerseyId: 'jersey-eight', number: 8, size: 'L', ownerPlayerId: null } },
        { playerId: 'player-casey', jersey: null },
        { playerId: 'player-alex', jersey: { jerseyId: 'jersey-zero', number: 0, size: 'XS', ownerPlayerId: 'player-ben' } },
      ],
    })
    expect(next?.rows[0].jersey).not.toBe(previous.rows[1].jersey)
    expect(previous.rows.map(({ playerId }) => playerId)).toEqual(['player-alex', 'player-ben'])
  })

  it('preserves retained rows through starter-only changes and never invents a distribution', () => {
    const changedStarters = { ...participation(), starterIds: ['player-ben'] }
    expect(reconcileMatchJerseyAssignment(assignment(), changedStarters)).toEqual(assignment())
    expect(reconcileMatchJerseyAssignment(null, participation())).toBeNull()
    expect(reconcileMatchJerseyAssignment(assignment(), null)).toBeNull()
  })
})
