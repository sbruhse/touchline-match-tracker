import { isReadonly } from 'vue'
import { describe, expect, it } from 'vitest'
import type { JerseySet } from './jerseySet'
import { normalizeJerseySets } from './jerseySet'
import type { JerseySetRepository } from '../api/jerseySetStorage'
import { createJerseySetStore } from './jerseySetStore'

class MemoryRepository implements JerseySetRepository {
  payload: JerseySet[]
  saveCalls = 0
  failNextSave = false
  holdNextSave: { promise: Promise<void>; release: () => void } | null = null
  listError: Error | null = null
  closed = false

  constructor(initial: JerseySet[] = []) {
    this.payload = normalizeJerseySets(initial)
  }

  async listJerseySets(): Promise<JerseySet[]> {
    if (this.listError) throw this.listError
    return normalizeJerseySets(this.payload)
  }

  async saveJerseySets(sets: readonly JerseySet[]): Promise<void> {
    this.saveCalls += 1
    const snapshot = normalizeJerseySets(sets)
    if (this.holdNextSave) {
      const held = this.holdNextSave
      this.holdNextSave = null
      await held.promise
    }
    if (this.failNextSave) {
      this.failNextSave = false
      throw new Error('Storage is full.')
    }
    this.payload = snapshot
  }

  close(): void {
    this.closed = true
  }
}

function deferred() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}

const populatedSet: JerseySet = {
  id: 'home',
  name: 'Home',
  jerseys: [{ id: 'home-seven', number: 7, size: 'M', ownerPlayerId: 'alex' }],
  preferredNumbers: [{ playerId: 'alex', number: 7 }, { playerId: 'ben', number: 12 }],
  createdAt: 100,
  updatedAt: 200,
}

describe('app-scoped jersey-set store', () => {
  it('rejects writes before a successful load and allows retry after a load error', async () => {
    const repository = new MemoryRepository([populatedSet])
    const store = createJerseySetStore(repository)
    await expect(store.createSet('Home')).rejects.toThrow('not ready')
    repository.listError = new Error('Storage cannot be read.')
    await expect(store.load()).rejects.toThrow('Storage cannot be read.')
    expect(store.ready.value).toBe(false)
    expect(store.sets.value).toEqual([])
    expect(store.error.value).toBe('Storage cannot be read.')

    repository.listError = null
    await store.load()
    expect(store.ready.value).toBe(true)
    expect(store.sets.value).toEqual([populatedSet])
  })

  it('publishes only after a shared pending save completes and rejects an overlapping write', async () => {
    const repository = new MemoryRepository()
    const store = createJerseySetStore(repository)
    await store.load()
    const heldWrite = deferred()
    repository.holdNextSave = heldWrite

    const firstWrite = store.createSet('Home')
    expect(store.saving.value).toBe(true)
    expect(store.saveStatus.value).toBe('saving')
    expect(store.sets.value).toEqual([])
    await expect(store.createSet('Away')).rejects.toThrow('already being saved')
    expect(repository.saveCalls).toBe(1)

    heldWrite.release()
    await firstWrite
    expect(store.sets.value).toHaveLength(1)
    expect(store.sets.value[0].name).toBe('Home')
    expect(store.saving.value).toBe(false)
    expect(store.saveStatus.value).toBe('saved')
  })

  it('exposes readonly deep snapshots and does not retain submitted preference arrays', async () => {
    const repository = new MemoryRepository([populatedSet, {
      id: 'away', name: 'Away', jerseys: [], preferredNumbers: [], createdAt: 300, updatedAt: 300,
    }])
    const store = createJerseySetStore(repository)
    await store.load()
    const submitted = [
      { setId: 'home', number: 20 },
      { setId: 'away', number: 0 },
    ]
    await store.updatePlayerNumbers('cai', submitted)
    submitted[0].number = 44

    expect(isReadonly(store.sets.value)).toBe(true)
    expect(isReadonly(store.sets.value[0].jerseys)).toBe(true)
    expect(store.sets.value[0].preferredNumbers).toContainEqual({ playerId: 'cai', number: 20 })
    expect(store.sets.value[1].preferredNumbers).toContainEqual({ playerId: 'cai', number: 0 })
    expect(store.sets.value[0].preferredNumbers).not.toContainEqual({ playerId: 'cai', number: 44 })
    expect(repository.payload).toEqual(store.sets.value)
  })

  it('saves a multi-set preference edit as one atomic inventory write', async () => {
    const repository = new MemoryRepository([populatedSet, {
      id: 'away', name: 'Away', jerseys: [], preferredNumbers: [], createdAt: 300, updatedAt: 300,
    }])
    const store = createJerseySetStore(repository)
    await store.load()
    const beforeSaveCalls = repository.saveCalls

    await store.updatePlayerNumbers('alex', [
      { setId: 'home', number: 0 },
      { setId: 'away', number: 20 },
    ])

    expect(repository.saveCalls - beforeSaveCalls).toBe(1)
    expect(store.sets.value.map(({ id, preferredNumbers }) => ({ id, preferredNumbers }))).toEqual([
      { id: 'home', preferredNumbers: [{ playerId: 'alex', number: 0 }, { playerId: 'ben', number: 12 }] },
      { id: 'away', preferredNumbers: [{ playerId: 'alex', number: 20 }] },
    ])
  })

  it('keeps every committed value when populated-set deletion fails', async () => {
    const repository = new MemoryRepository([populatedSet, {
      id: 'away', name: 'Away', jerseys: [], preferredNumbers: [], createdAt: 300, updatedAt: 300,
    }])
    const store = createJerseySetStore(repository)
    await store.load()
    const committedBefore = JSON.parse(JSON.stringify(store.sets.value))
    const payloadBefore = structuredClone(repository.payload)
    repository.failNextSave = true

    await expect(store.removeSet('home')).rejects.toThrow('Storage is full.')
    expect(store.sets.value).toEqual(committedBefore)
    expect(repository.payload).toEqual(payloadBefore)
    expect(store.saveStatus.value).toBe('error')
    expect(store.error.value).toBe('Storage is full.')
  })

  it('closes its repository and rejects future operations when disposed', async () => {
    const repository = new MemoryRepository()
    const store = createJerseySetStore(repository)
    await store.load()
    store.dispose()

    expect(repository.closed).toBe(true)
    await expect(store.createSet('Home')).rejects.toThrow('disposed')
  })
})
