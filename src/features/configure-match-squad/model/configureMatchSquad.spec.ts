import { describe, expect, it } from 'vitest'
import type { DeepReadonly } from 'vue'
import { createPlayer } from '../../../entities/player'
import { copyMatchSnapshot, createMatch, type Match, type MatchParticipation } from '../../../entities/match'
import { buildMatchParticipation, disableMatchParticipationSetup, persistMatchParticipationSetup } from './configureMatchSquad'

function matchWithAssignments(): Match {
  const base = createMatch('North City', 'South Town', 100, 'squad-reconcile-match')
  return {
    ...base,
    participation: {
      ownSide: 'home',
      squad: [
        { playerId: 'alex-id', nameSnapshot: 'Alex' },
        { playerId: 'sam-id', nameSnapshot: 'Sam' },
      ],
      starterIds: ['alex-id'],
      substitutions: [],
    },
    goals: [{
      id: 'preparation-goal', side: 'home', period: 1, elapsedMs: 60_000,
      scorerPlayerId: 'alex-id', scorer: 'Alex snapshot',
      assistPlayerId: 'sam-id', assist: 'Sam snapshot', description: '', createdAt: 90,
    }],
    jerseyAssignment: {
      setId: 'set-blue',
      setNameSnapshot: 'Blue',
      rows: [
        { playerId: 'alex-id', jersey: { jerseyId: 'jersey-seven', number: 7, size: 'M', ownerPlayerId: null } },
        { playerId: 'sam-id', jersey: { jerseyId: 'jersey-eight', number: 8, size: 'L', ownerPlayerId: 'sam-id' } },
      ],
    },
  }
}

describe('buildMatchParticipation', () => {
  it('snapshots active names, preserves existing snapshots, and accepts flexible squads', () => {
    const alex = createPlayer('Alex Morgan', 100, 'alex-id')
    const sam = createPlayer('Sam Kerr', 200, 'sam-id')
    const previous: MatchParticipation = {
      ownSide: 'home',
      squad: [{ playerId: alex.id, nameSnapshot: 'Alex (match-day name)' }],
      starterIds: [alex.id],
      substitutions: [],
    }
    const result = buildMatchParticipation({
      ownSide: 'away',
      squadPlayerIds: [alex.id, sam.id],
      starterIds: [sam.id],
    }, [alex, sam], previous)

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.participation).toEqual({
        ownSide: 'away',
        squad: [
          { playerId: alex.id, nameSnapshot: 'Alex (match-day name)' },
          { playerId: sam.id, nameSnapshot: 'Sam Kerr' },
        ],
        starterIds: [sam.id],
        substitutions: [],
      })
    }
  })

  it('rejects blank side, an empty squad, an empty starter subset, and duplicate identities', () => {
    const alex = createPlayer('Alex', 100, 'alex-id')
    const players = [alex]

    expect(buildMatchParticipation({ ownSide: '', squadPlayerIds: [alex.id], starterIds: [alex.id] }, players, null))
      .toMatchObject({ valid: false, error: 'Choose whether your team is playing at home or away.' })
    expect(buildMatchParticipation({ ownSide: 'home', squadPlayerIds: [], starterIds: [] }, players, null))
      .toMatchObject({ valid: false, error: 'Select at least one player for the match squad.' })
    expect(buildMatchParticipation({ ownSide: 'home', squadPlayerIds: [alex.id], starterIds: [] }, players, null))
      .toMatchObject({ valid: false, error: 'Choose at least one starting player.' })
    expect(buildMatchParticipation({
      ownSide: 'home', squadPlayerIds: [alex.id, alex.id], starterIds: [alex.id],
    }, players, null)).toMatchObject({ valid: false, error: 'A player can appear only once in the match squad.' })
  })

  it('does not add archived players to a new squad but retains archived existing members', () => {
    const archivedAlex = { ...createPlayer('Alex', 100, 'alex-id'), archived: true }
    const existing: MatchParticipation = {
      ownSide: 'home',
      squad: [{ playerId: archivedAlex.id, nameSnapshot: 'Alex before archive' }],
      starterIds: [archivedAlex.id],
      substitutions: [],
    }

    expect(buildMatchParticipation({
      ownSide: 'home', squadPlayerIds: [archivedAlex.id], starterIds: [archivedAlex.id],
    }, [archivedAlex], null)).toMatchObject({
      valid: false,
      error: 'Choose an active directory player for each new squad place.',
    })

    const retained = buildMatchParticipation({
      ownSide: 'home', squadPlayerIds: [archivedAlex.id], starterIds: [archivedAlex.id],
    }, [archivedAlex], existing)
    expect(retained.valid).toBe(true)
    if (retained.valid) expect(retained.participation.squad[0].nameSnapshot).toBe('Alex before archive')
  })

  it('reconciles rows by player identity while adding and removing squad members', async () => {
    const match = matchWithAssignments()
    const players = [
      createPlayer('Alex', 100, 'alex-id'),
      createPlayer('Sam', 200, 'sam-id'),
      createPlayer('Jordan', 300, 'jordan-id'),
    ]
    const built = buildMatchParticipation({
      ownSide: 'home',
      squadPlayerIds: ['alex-id', 'jordan-id'],
      starterIds: ['jordan-id'],
    }, players, match.participation)
    expect(built.valid).toBe(true)
    if (!built.valid) return

    const persist = async (snapshot: DeepReadonly<Match>) => copyMatchSnapshot(snapshot)
    const reconciled = await persistMatchParticipationSetup(match, built.participation, { persist }, 200)

    expect(reconciled.jerseyAssignment).toEqual({
      setId: 'set-blue',
      setNameSnapshot: 'Blue',
      rows: [
        { playerId: 'alex-id', jersey: { jerseyId: 'jersey-seven', number: 7, size: 'M', ownerPlayerId: null } },
        { playerId: 'jordan-id', jersey: null },
      ],
    })
    expect(reconciled.jerseyAssignment?.rows.some(({ playerId }) => playerId === 'sam-id')).toBe(false)
    expect(reconciled.goals).toMatchObject([{
      scorerPlayerId: 'alex-id', scorer: 'Alex snapshot',
      assistPlayerId: null, assist: 'Sam snapshot',
    }])
    expect(match.jerseyAssignment?.rows[1].jersey?.number).toBe(8)
  })

  it('preserves every assignment when only the starter subset changes and clears both fields on disable', async () => {
    const match = matchWithAssignments()
    const changedStarters = { ...match.participation!, starterIds: ['sam-id'] }
    const snapshots: Match[] = []
    const persist = async (snapshot: DeepReadonly<Match>) => {
      snapshots.push(copyMatchSnapshot(snapshot))
      return copyMatchSnapshot(snapshot)
    }

    await persistMatchParticipationSetup(match, changedStarters, { persist }, 200)
    expect(snapshots[0].jerseyAssignment).toEqual(match.jerseyAssignment)
    expect(snapshots[0].goals).toEqual(match.goals)

    const disabled = await disableMatchParticipationSetup(match, { persist }, 300)
    expect(snapshots).toHaveLength(2)
    expect(disabled.participation).toBeNull()
    expect(disabled.jerseyAssignment).toBeNull()
    expect(disabled.goals).toMatchObject([{
      scorerPlayerId: null, scorer: 'Alex snapshot',
      assistPlayerId: null, assist: 'Sam snapshot',
    }])
    expect(match.participation).not.toBeNull()
    expect(match.jerseyAssignment).not.toBeNull()
  })

  it('keeps the previous squad and distribution intact when disabling fails to save', async () => {
    const match = matchWithAssignments()
    const original = copyMatchSnapshot(match)
    const persist = async () => { throw new Error('squad write failed') }

    await expect(disableMatchParticipationSetup(match, { persist }, 300)).rejects.toThrow('squad write failed')
    expect(match).toEqual(original)
  })

  it('clears links when the saved own side changes and publishes changes only after a successful retry', async () => {
    const match = matchWithAssignments()
    const changedSide = { ...match.participation!, ownSide: 'away' as const }
    let shouldFail = true
    let attempted: Match | undefined
    const persist = async (snapshot: DeepReadonly<Match>) => {
      attempted = copyMatchSnapshot(snapshot)
      if (shouldFail) {
        shouldFail = false
        throw new Error('temporary preparation failure')
      }
      return copyMatchSnapshot(snapshot)
    }

    await expect(persistMatchParticipationSetup(match, changedSide, { persist }, 200))
      .rejects.toThrow('temporary preparation failure')
    expect(attempted?.goals).toMatchObject([{
      scorerPlayerId: null, scorer: 'Alex snapshot',
      assistPlayerId: null, assist: 'Sam snapshot',
    }])
    expect(match.goals[0]).toMatchObject({ scorerPlayerId: 'alex-id', assistPlayerId: 'sam-id' })
    expect(match.participation?.ownSide).toBe('home')

    const retried = await persistMatchParticipationSetup(match, changedSide, { persist }, 300)
    expect(retried.goals).toMatchObject([{
      scorerPlayerId: null, scorer: 'Alex snapshot',
      assistPlayerId: null, assist: 'Sam snapshot',
    }])
    expect(match.goals[0].scorerPlayerId).toBe('alex-id')
  })
})
