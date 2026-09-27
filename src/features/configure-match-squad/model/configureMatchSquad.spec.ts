import { describe, expect, it } from 'vitest'
import { createPlayer } from '../../../entities/player'
import type { MatchParticipation } from '../../../entities/match'
import { buildMatchParticipation } from './configureMatchSquad'

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
})
