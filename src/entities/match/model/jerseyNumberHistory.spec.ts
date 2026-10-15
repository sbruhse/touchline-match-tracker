import { describe, expect, it } from 'vitest'
import { createMatch, type Match } from './match'
import { resolveHistoricalJerseyNumbers } from './jerseyNumberHistory'

interface AssignmentInput {
  setId?: string
  setNameSnapshot?: string
  rows: Array<{ playerId: string; number: number | null }>
}

function playedMatch(
  id: string,
  firstKickoffAt: number | null,
  assignment: AssignmentInput | null,
  updatedAt = firstKickoffAt ?? 0,
): Match {
  const match = createMatch('North City', 'South Town', 100, id)
  const squad = assignment?.rows.map(({ playerId }) => ({
    playerId,
    nameSnapshot: playerId === 'same-name-a' || playerId === 'same-name-b' ? 'Sam' : playerId,
  })) ?? []
  return {
    ...match,
    updatedAt,
    firstKickoffAt,
    clock: {
      period: firstKickoffAt === null ? 1 : 2,
      elapsedMs: 0,
      status: firstKickoffAt === null ? 'not-started' : 'full-time',
      startedAt: null,
    },
    participation: assignment ? {
      ownSide: 'home',
      squad,
      starterIds: squad.slice(0, 1).map(({ playerId }) => playerId),
      substitutions: [],
    } : null,
    jerseyAssignment: assignment ? {
      setId: assignment.setId ?? 'set-blue',
      setNameSnapshot: assignment.setNameSnapshot ?? 'Blue',
      rows: assignment.rows.map(({ playerId, number }) => ({
        playerId,
        jersey: number === null ? null : {
          jerseyId: `${id}-${playerId}`,
          number,
          size: 'M',
          ownerPlayerId: null,
        },
      })),
    } : null,
  }
}

describe('historical jersey number lookup', () => {
  it('looks past absent and unassigned players and distinguishes equal-name identities', () => {
    const older = playedMatch('older', 10, {
      rows: [
        { playerId: 'player-alex', number: 7 },
        { playerId: 'same-name-a', number: 12 },
        { playerId: 'same-name-b', number: 8 },
      ],
    })
    const unassigned = playedMatch('unassigned', 20, {
      rows: [
        { playerId: 'player-alex', number: null },
        { playerId: 'same-name-a', number: 10 },
      ],
    })
    const absent = playedMatch('absent', 30, { rows: [{ playerId: 'player-ben', number: 4 }] })

    const history = resolveHistoricalJerseyNumbers([absent, older, unassigned], 'current', 'set-blue')

    expect(history.get('player-alex')).toBe(7)
    expect(history.get('same-name-a')).toBe(10)
    expect(history.get('same-name-b')).toBe(8)
  })

  it('uses accepted manual snapshots for starters and unused substitutes, including number zero', () => {
    const match = playedMatch('manual-result', 20, {
      rows: [
        { playerId: 'starter', number: 15 },
        { playerId: 'bench-player', number: 0 },
      ],
    })
    expect(match.participation?.starterIds).toEqual(['starter'])

    const history = resolveHistoricalJerseyNumbers([match], 'next-match', 'set-blue')
    expect(history.get('starter')).toBe(15)
    expect(history.get('bench-player')).toBe(0)
  })

  it('orders by first kickoff then stable match identity, not collection order or later edits', () => {
    const tieA = playedMatch('match-a', 20, { rows: [{ playerId: 'player', number: 7 }] }, 1_000)
    const tieB = playedMatch('match-b', 20, { rows: [{ playerId: 'player', number: 8 }] }, 0)
    const later = playedMatch('later-kickoff', 30, { rows: [{ playerId: 'player', number: 9 }] }, -100)

    expect(resolveHistoricalJerseyNumbers([tieB, tieA], 'current', 'set-blue').get('player')).toBe(7)
    expect(resolveHistoricalJerseyNumbers([tieA, tieB, later], 'current', 'set-blue').get('player')).toBe(9)
  })

  it('keeps set identities separate across renames and recreated sets', () => {
    const earlier = playedMatch('blue-before-rename', 10, {
      setId: 'stable-blue-id', setNameSnapshot: 'Blue', rows: [{ playerId: 'player', number: 7 }],
    })
    const renamed = playedMatch('blue-after-rename', 20, {
      setId: 'stable-blue-id', setNameSnapshot: 'Blue Match Kit', rows: [{ playerId: 'player', number: 9 }],
    })
    const recreated = playedMatch('new-blue-set', 30, {
      setId: 'new-blue-id', setNameSnapshot: 'Blue Match Kit', rows: [{ playerId: 'player', number: 12 }],
    })

    expect(resolveHistoricalJerseyNumbers([earlier, renamed, recreated], 'current', 'stable-blue-id').get('player')).toBe(9)
    expect(resolveHistoricalJerseyNumbers([earlier, renamed, recreated], 'current', 'new-blue-id').get('player')).toBe(12)
  })

  it('excludes the current match, unstarted games, unknown kickoff history, and missing assignments', () => {
    const current = playedMatch('current', 40, { rows: [{ playerId: 'player', number: 10 }] })
    const unstarted = playedMatch('unstarted', null, { rows: [{ playerId: 'player', number: 11 }] })
    const unknownKickoff: Match = {
      ...playedMatch('unknown-kickoff', null, { rows: [{ playerId: 'player', number: 12 }] }),
      clock: { period: 2, elapsedMs: 90_000, status: 'full-time', startedAt: null },
      firstKickoffAt: null,
    }
    const noAssignment = playedMatch('no-assignment', 30, null)
    const validHistory = playedMatch('played', 20, { rows: [{ playerId: 'player', number: 0 }] })

    const history = resolveHistoricalJerseyNumbers(
      [current, unstarted, unknownKickoff, noAssignment, validHistory],
      current.id,
      'set-blue',
    )
    expect(history.get('player')).toBe(0)
  })
})
