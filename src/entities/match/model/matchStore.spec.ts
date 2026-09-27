import { describe, expect, it, vi } from 'vitest'
import { createMatch } from './match'
import { createMatchStore } from './matchStore'
import type { Match } from './match'
import type { MatchRepository } from '../api/matchStorage'

function repository(overrides: Partial<MatchRepository> = {}): MatchRepository {
  return {
    listMatches: async () => [],
    getMatch: async () => undefined,
    saveMatch: async () => undefined,
    close: () => undefined,
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('app-scoped match store', () => {
  it('distinguishes a pending initial load from a ready empty archive', async () => {
    const pendingLoad = deferred<Match[]>()
    const store = createMatchStore(repository({ listMatches: () => pendingLoad.promise }))

    const loading = store.load()
    expect(store.loading.value).toBe(true)
    expect(store.ready.value).toBe(false)
    expect(store.matches.value).toEqual([])

    const match = createMatch('North City', 'South Town', 100, 'loaded-match')
    pendingLoad.resolve([match])
    await loading

    expect(store.loading.value).toBe(false)
    expect(store.ready.value).toBe(true)
    expect(store.matches.value).toEqual([match])
  })

  it('keeps independently mounted stores and their saved state isolated', async () => {
    const first = createMatch('North City', 'South Town', 100, 'first-store')
    const second = createMatch('Harbor FC', 'Valley United', 200, 'second-store')
    const firstStore = createMatchStore(repository({ listMatches: async () => [first] }))
    const secondStore = createMatchStore(repository({ listMatches: async () => [second] }))

    await Promise.all([firstStore.load(), secondStore.load()])

    expect(firstStore.matches.value).toEqual([first])
    expect(secondStore.matches.value).toEqual([second])
  })

  it('reports a load error and can retry successfully', async () => {
    const match = createMatch('North City', 'South Town', 100, 'retry-match')
    const listMatches = vi.fn()
      .mockRejectedValueOnce(new Error('Database is temporarily unavailable.'))
      .mockResolvedValueOnce([match])
    const store = createMatchStore(repository({ listMatches }))

    await expect(store.load()).rejects.toThrow('Database is temporarily unavailable.')
    expect(store.loading.value).toBe(false)
    expect(store.ready.value).toBe(false)
    expect(store.error.value).toBe('Database is temporarily unavailable.')

    await store.load()
    expect(store.ready.value).toBe(true)
    expect(store.error.value).toBeNull()
    expect(store.matches.value).toEqual([match])
    expect(listMatches).toHaveBeenCalledTimes(2)
  })

  it('closes its repository on disposal and rejects later work', async () => {
    const close = vi.fn()
    const listMatches = vi.fn(async () => [])
    const store = createMatchStore(repository({ close, listMatches }))
    await store.load()

    store.dispose()

    expect(close).toHaveBeenCalledOnce()
    await expect(store.load()).rejects.toThrow('Match store is disposed.')
    expect(listMatches).toHaveBeenCalledOnce()
  })

  it('guards overlapping writes synchronously and publishes only committed snapshots', async () => {
    const original = createMatch('North City', 'South Town', 100, 'guarded-match')
    const pendingSave = deferred<void>()
    const saveMatch = vi.fn()
      .mockImplementationOnce(() => pendingSave.promise)
      .mockResolvedValue(undefined)
    const listMatches = vi.fn(async () => [original])
    const store = createMatchStore(repository({ listMatches, saveMatch }))
    await store.load()

    const firstUpdate = { ...original, awayTeam: 'East Town', updatedAt: 200 }
    const firstWrite = store.persist(firstUpdate)
    expect(store.saving.value).toBe(true)
    expect(store.matches.value).toEqual([original])

    await expect(store.persist({ ...firstUpdate, homeTeam: 'Rejected Update' }))
      .rejects.toThrow('Another match update is already being saved.')
    expect(saveMatch).toHaveBeenCalledOnce()

    pendingSave.resolve()
    await firstWrite
    expect(store.saving.value).toBe(false)
    expect(store.matches.value).toEqual([firstUpdate])
    expect(listMatches).toHaveBeenCalledOnce()

    const nextUpdate = {
      ...store.matches.value[0],
      homeTeam: 'Latest Committed Team',
      updatedAt: 300,
      goals: [...store.matches.value[0].goals],
    }
    await store.persist(nextUpdate)
    expect(saveMatch).toHaveBeenLastCalledWith(nextUpdate)
    expect(store.matches.value).toEqual([nextUpdate])
    expect(listMatches).toHaveBeenCalledOnce()
  })

  it('retains committed state after a rejected write and allows a retry', async () => {
    const original = createMatch('North City', 'South Town', 100, 'retry-save')
    const saveMatch = vi.fn()
      .mockRejectedValueOnce(new Error('Transaction aborted.'))
      .mockResolvedValueOnce(undefined)
    const store = createMatchStore(repository({ listMatches: async () => [original], saveMatch }))
    await store.load()

    const rejectedUpdate = { ...original, awayTeam: 'Failed Change', updatedAt: 200 }
    await expect(store.persist(rejectedUpdate)).rejects.toThrow('Transaction aborted.')
    expect(store.saving.value).toBe(false)
    expect(store.error.value).toBe('Transaction aborted.')
    expect(store.matches.value).toEqual([original])

    const retry = { ...store.matches.value[0], awayTeam: 'Successful Retry', updatedAt: 300 }
    await store.persist(retry)
    expect(store.error.value).toBeNull()
    expect(store.matches.value).toEqual([retry])
    expect(saveMatch).toHaveBeenCalledTimes(2)
  })

  it('keeps participation snapshots and completed period durations when persisting', async () => {
    const match: Match = {
      ...createMatch('North City', 'South Town', 100, 'participation-store'),
      participation: {
        ownSide: 'away',
        squad: [{ playerId: 'player-1', nameSnapshot: 'A. Player' }],
        starterIds: ['player-1'],
        substitutions: [{
          id: 'sub-1', outgoingPlayerId: 'player-1', incomingPlayerId: 'player-2',
          period: 1, elapsedMs: 60_000, sequence: 1, createdAt: 150,
        }],
      },
      completedPeriodElapsedMs: { 1: 2_820_000, 2: null },
    }
    const saveMatch = vi.fn(async () => undefined)
    const store = createMatchStore(repository({ saveMatch }))
    await store.load()

    await store.persist(match)

    expect(saveMatch).toHaveBeenCalledWith(match)
    expect(store.matches.value).toEqual([match])
  })
})
