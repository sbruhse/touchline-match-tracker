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
      goals: [expect.objectContaining({
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
    expect(result.goalId).toBe(savedSnapshot?.goals[0].id)
    expect(result.goalId).toBeTruthy()
  })

  it('does not return a committed goal result when persistence fails', async () => {
    const match = createMatch('North City', 'South Town', 100, 'failed-goal-action')
    const store = { persist: vi.fn(async () => { throw new Error('write failed') }) } as unknown as Pick<MatchStore, 'persist'>

    await expect(recordMatchGoal(match, 'home', store, 2_500)).rejects.toThrow('write failed')
  })
})
