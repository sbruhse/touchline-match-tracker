import { describe, expect, it } from 'vitest'
import type { JerseySet } from '../model/jerseySet'
import { createJerseySetRepository, JERSEY_SET_STORAGE_KEY, type JerseySetStorageLike } from './jerseySetStorage'

class MemoryStorage implements JerseySetStorageLike {
  private readonly values = new Map<string, string>()
  writes = 0
  readonly writtenKeys: string[] = []
  failNextWrite = false

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.writes += 1
    this.writtenKeys.push(key)
    if (this.failNextWrite) {
      this.failNextWrite = false
      throw new Error('Storage is full.')
    }
    this.values.set(key, value)
  }
}

const homeSet: JerseySet = {
  id: 'set-home',
  name: ' Home ',
  jerseys: [{ id: 'jersey-7-m', number: 7, size: ' M ', ownerPlayerId: 'missing-player-id' }],
  preferredNumbers: [{ playerId: 'also-missing-player', number: 12 }],
  createdAt: 100,
  updatedAt: 200,
}

describe('jersey-set storage adapter', () => {
  it('reads a missing key as an empty collection without writing', async () => {
    const storage = new MemoryStorage()

    await expect(createJerseySetRepository({ storage }).listJerseySets()).resolves.toEqual([])
    expect(storage.writes).toBe(0)
  })

  it('writes one version-1 aggregate and reloads all values while retaining unresolved player references', async () => {
    const storage = new MemoryStorage()
    const repository = createJerseySetRepository({ storage })
    const sets = [homeSet, {
      id: 'set-away',
      name: 'Away',
      jerseys: [
        { id: 'jersey-private', number: 0, size: '164', ownerPlayerId: 'archived-or-unavailable-player' },
        { id: 'jersey-duplicate', number: 0, size: '164', ownerPlayerId: 'archived-or-unavailable-player' },
      ],
      preferredNumbers: [],
      createdAt: 300,
      updatedAt: 400,
    }]

    await repository.saveJerseySets(sets)

    expect(storage.writes).toBe(1)
    expect(JSON.parse(storage.getItem(JERSEY_SET_STORAGE_KEY)!)).toEqual({
      version: 1,
      sets: [{
        ...homeSet,
        name: 'Home',
        jerseys: [{ ...homeSet.jerseys[0], size: 'M' }],
      }, sets[1]],
    })
    await expect(createJerseySetRepository({ storage }).listJerseySets()).resolves.toEqual([
      { ...homeSet, name: 'Home', jerseys: [{ ...homeSet.jerseys[0], size: 'M' }] },
      sets[1],
    ])
  })

  it.each([
    ['malformed JSON', '{not-json', 'not valid JSON'],
    ['unsupported version', JSON.stringify({ version: 2, sets: [] }), 'Unsupported jersey-set storage version: 2.'],
    ['malformed envelope', JSON.stringify({ version: 1, sets: {} }), 'sets must be an array'],
    ['duplicate set identity', JSON.stringify({ version: 1, sets: [homeSet, homeSet] }), 'Duplicate jersey set ID'],
  ])('rejects %s without rewriting its stored payload', async (_label, payload, expectedError) => {
    const storage = new MemoryStorage()
    storage.setItem(JERSEY_SET_STORAGE_KEY, payload)
    const before = storage.getItem(JERSEY_SET_STORAGE_KEY)
    const repository = createJerseySetRepository({ storage })

    await expect(repository.listJerseySets()).rejects.toThrow(expectedError)
    expect(storage.getItem(JERSEY_SET_STORAGE_KEY)).toBe(before)
    expect(storage.writes).toBe(1)
  })

  it('keeps the prior payload intact when the single collection write fails', async () => {
    const storage = new MemoryStorage()
    const repository = createJerseySetRepository({ storage })
    await repository.saveJerseySets([homeSet])
    const before = storage.getItem(JERSEY_SET_STORAGE_KEY)
    storage.failNextWrite = true

    await expect(repository.saveJerseySets([])).rejects.toThrow('Storage is full.')
    expect(storage.getItem(JERSEY_SET_STORAGE_KEY)).toBe(before)
    expect(storage.writes).toBe(2)
  })

  it('writes only the inventory key without changing player or match storage', async () => {
    const storage = new MemoryStorage()
    storage.setItem('touchline.player-store', 'player-directory-sentinel')
    storage.setItem('touchline.match-store', 'match-data-sentinel')
    const playerPayload = storage.getItem('touchline.player-store')
    const matchPayload = storage.getItem('touchline.match-store')
    storage.writtenKeys.length = 0

    await createJerseySetRepository({ storage }).saveJerseySets([homeSet])

    expect(storage.writtenKeys).toEqual([JERSEY_SET_STORAGE_KEY])
    expect(storage.getItem('touchline.player-store')).toBe(playerPayload)
    expect(storage.getItem('touchline.match-store')).toBe(matchPayload)
  })

  it('rejects repository operations after disposal', async () => {
    const repository = createJerseySetRepository({ storage: new MemoryStorage() })
    repository.close()
    await expect(repository.listJerseySets()).rejects.toThrow('Jersey-set repository is closed.')
    await expect(repository.saveJerseySets([])).rejects.toThrow('Jersey-set repository is closed.')
  })
})
