import { isReactive, reactive, readonly } from 'vue'
import { describe, expect, it } from 'vitest'
import { createMatch } from './match'
import { copyMatchSnapshot } from './matchSnapshot'

describe('match snapshot copier', () => {
  it('copies readonly nested jersey and participation data into detached plain objects', () => {
    const source = reactive({
      ...createMatch('North City', 'South Town', 100, 'snapshot-match'),
      firstKickoffAt: 200,
      participation: {
        ownSide: 'home' as const,
        squad: [{ playerId: 'player-1', nameSnapshot: 'Alex' }],
        starterIds: ['player-1'],
        substitutions: [],
      },
      jerseyAssignment: {
        setId: 'set-1',
        setNameSnapshot: 'Blue',
        rows: [{
          playerId: 'player-1',
          jersey: { jerseyId: 'jersey-1', number: 0, size: 'M', ownerPlayerId: 'owner-1' },
        }],
      },
      goals: [{
        id: 'goal-1', side: 'home' as const, period: 1 as const, elapsedMs: 123_456,
        scorerPlayerId: 'player-1', scorer: 'Alex Snapshot',
        assistPlayerId: 'player-2', assist: 'Sam Snapshot', description: '', createdAt: 150,
      }],
    })

    const snapshot = copyMatchSnapshot(readonly(source))
    source.jerseyAssignment.rows[0].jersey!.number = 7
    source.participation.squad[0].nameSnapshot = 'Changed'
    source.goals[0].scorer = 'Changed scorer'
    source.goals[0].scorerPlayerId = 'player-3'
    source.goals[0].assist = 'Changed assist'
    source.goals[0].assistPlayerId = 'player-4'

    expect(isReactive(snapshot)).toBe(false)
    expect(snapshot.jerseyAssignment?.rows[0].jersey?.number).toBe(0)
    expect(snapshot.participation?.squad[0].nameSnapshot).toBe('Alex')
    expect(snapshot.firstKickoffAt).toBe(200)
    expect(snapshot.goals[0]).toMatchObject({
      scorerPlayerId: 'player-1', scorer: 'Alex Snapshot',
      assistPlayerId: 'player-2', assist: 'Sam Snapshot',
    })
  })
})
