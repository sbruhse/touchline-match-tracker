import { describe, expect, it, vi } from 'vitest'
import type { DeepReadonly } from 'vue'
import { createMatch, type Match, type MatchStore } from '../../../entities/match'
import { recordMatchGoal } from './recordMatchGoal'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('recordMatchGoal', () => {
  it('keeps the click-time goal timestamp and awaits the committed snapshot', async () => {
    const now = 2_500
    const match: Match = {
      ...createMatch('North City', 'South Town', 100, 'goal-action'),
      clock: { period: 1, elapsedMs: 500, status: 'running', startedAt: 2_000 },
      firstKickoffAt: 1_900,
      participation: {
        ownSide: 'home',
        squad: [{ playerId: 'player-alex', nameSnapshot: 'Alex' }],
        starterIds: ['player-alex'],
        substitutions: [],
      },
      goals: [{
        id: 'older-attributed-goal', side: 'home', period: 1, elapsedMs: 80_000,
        scorerPlayerId: 'player-alex', scorer: 'Alex snapshot',
        assistPlayerId: null, assist: '', description: '', createdAt: 1_800,
      }],
      jerseyAssignment: {
        setId: 'set-blue',
        setNameSnapshot: 'Blue',
        rows: [{
          playerId: 'player-alex',
          jersey: { jerseyId: 'jersey-zero', number: 0, size: 'M', ownerPlayerId: null },
        }],
      },
    }
    const commit = deferred<Match>()
    let savedSnapshot: DeepReadonly<Match> | undefined
    const persist = vi.fn((snapshot: DeepReadonly<Match>) => {
      savedSnapshot = snapshot
      return commit.promise
    })
    const store = { persist } as unknown as Pick<MatchStore, 'persist'>

    const action = recordMatchGoal(match, 'home', store, now)
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      updatedAt: now,
      firstKickoffAt: 1_900,
      participation: match.participation,
      jerseyAssignment: match.jerseyAssignment,
      goals: [match.goals[0], expect.objectContaining({
        side: 'home',
        period: 1,
        elapsedMs: 1_000,
        createdAt: now,
      })],
    }))

    let completed = false
    void action.then(() => { completed = true })
    await Promise.resolve()
    expect(completed).toBe(false)

    commit.resolve(savedSnapshot as Match)
    const result = await action
    expect(result.acceptedAt).toBe(now)
    expect(savedSnapshot?.goals[0]).toEqual(match.goals[0])
    expect(result.goalId).toBe(savedSnapshot?.goals.at(-1)?.id)
    expect(result.goalId).toBeTruthy()
  })

  it('does not return a committed goal result when persistence fails', async () => {
    const match = createMatch('North City', 'South Town', 100, 'failed-goal-action')
    const store = { persist: vi.fn(async () => { throw new Error('write failed') }) } as unknown as Pick<MatchStore, 'persist'>

    await expect(recordMatchGoal(match, 'home', store, 2_500)).rejects.toThrow('write failed')
  })
})
