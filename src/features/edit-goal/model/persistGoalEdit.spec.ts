import { describe, expect, it, vi } from 'vitest'
import type { DeepReadonly } from 'vue'
import { createMatch, type GoalEvent, type Match, type MatchStore } from '../../../entities/match'
import { persistGoalEdit } from './persistGoalEdit'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('persistGoalEdit', () => {
  it('copies only the selected goal and awaits the committed edit', async () => {
    const now = 2_500
    const firstGoal: GoalEvent = {
      id: 'goal-one', side: 'home', period: 1, elapsedMs: 1_000,
      scorerPlayerId: null, scorer: '', assistPlayerId: null, assist: '', description: '', createdAt: 1_000,
    }
    const otherGoal: GoalEvent = {
      id: 'goal-two', side: 'away', period: 1, elapsedMs: 2_000,
      scorerPlayerId: null, scorer: 'B. Player', assistPlayerId: null, assist: '', description: 'A header', createdAt: 2_000,
    }
    const match: Match = {
      ...createMatch('North City', 'South Town', 100, 'edited-match'),
      goals: [firstGoal, otherGoal],
      firstKickoffAt: 1_900,
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
    }
    const committed = deferred<Match>()
    let snapshot: DeepReadonly<Match> | undefined
    const persist = vi.fn((value: DeepReadonly<Match>) => {
      snapshot = value
      return committed.promise
    })
    const store = { persist } as unknown as Pick<MatchStore, 'persist'>
    const editedGoal = { ...firstGoal, side: 'away' as const, scorer: 'A. Player' }

    const action = persistGoalEdit(match, editedGoal, store, now)
    expect(snapshot).toMatchObject({
      updatedAt: now,
      firstKickoffAt: match.firstKickoffAt,
      jerseyAssignment: match.jerseyAssignment,
      goals: [editedGoal, otherGoal],
    })
    let completed = false
    void action.then(() => { completed = true })
    await Promise.resolve()
    expect(completed).toBe(false)

    committed.resolve(snapshot as Match)
    await expect(action).resolves.toBe(now)
    expect(persist).toHaveBeenCalledOnce()
  })
})
