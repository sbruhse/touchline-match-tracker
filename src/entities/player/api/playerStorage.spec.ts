import { describe, expect, it } from 'vitest'
import { createPlayer } from '../model/player'
import {
  createPlayerRepository,
  PLAYER_STORAGE_KEY,
  PLAYER_STORAGE_VERSION,
  type PlayerStorageLike,
} from './playerStorage'

class MemoryStorage implements PlayerStorageLike {
  private readonly values = new Map<string, string>()
  failNextWrite = false

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (this.failNextWrite) {
      this.failNextWrite = false
      throw new Error('Storage is full.')
    }
    this.values.set(key, value)
  }
}

describe('player storage adapter', () => {
  it('writes version 3 and reloads multiple players with stable identities, positions, and sizes', async () => {
    const storage = new MemoryStorage()
    const players = [
      createPlayer({ name: 'Alex', positions: ['DM', 'IV'], jerseySize: 'M' }, 100, 'player-alex'),
      createPlayer({ name: 'Sam', positions: ['ST'] }, 200, 'player-sam'),
    ]
    const repository = createPlayerRepository({ storage })

    await repository.savePlayers(players)

    expect(PLAYER_STORAGE_VERSION).toBe(3)
    expect(JSON.parse(storage.getItem(PLAYER_STORAGE_KEY)!)).toEqual({ version: 3, players })
    const reloadedRepository = createPlayerRepository({ storage })
    await expect(reloadedRepository.listPlayers()).resolves.toEqual(players)
  })

  it('reads exact version-1 payloads as empty position sets without rewriting them', async () => {
    const storage = new MemoryStorage()
    const legacyPayload = JSON.stringify({
      version: 1,
      players: [{
        id: 'legacy-alex', name: ' Alex ', archived: false, createdAt: 100, updatedAt: 150,
      }],
    })
    storage.setItem(PLAYER_STORAGE_KEY, legacyPayload)
    const repository = createPlayerRepository({ storage })

    await expect(repository.listPlayers()).resolves.toEqual([{
      id: 'legacy-alex', name: 'Alex', positions: [], jerseySize: null, archived: false, createdAt: 100, updatedAt: 150,
    }])
    expect(storage.getItem(PLAYER_STORAGE_KEY)).toBe(legacyPayload)
  })

  it('reads version-2 directories without rewriting them and preserves any existing size field', async () => {
    const storage = new MemoryStorage()
    const legacyPayload = JSON.stringify({
      version: 2,
      players: [
        { id: 'legacy-no-size', name: 'Alex', positions: ['IV'], archived: false, createdAt: 100, updatedAt: 150 },
        { id: 'legacy-with-size', name: 'Sam', positions: ['ST'], jerseySize: ' S/M ', archived: true, createdAt: 200, updatedAt: 250 },
      ],
    })
    storage.setItem(PLAYER_STORAGE_KEY, legacyPayload)

    await expect(createPlayerRepository({ storage }).listPlayers()).resolves.toEqual([
      { id: 'legacy-no-size', name: 'Alex', positions: ['IV'], jerseySize: null, archived: false, createdAt: 100, updatedAt: 150 },
      { id: 'legacy-with-size', name: 'Sam', positions: ['ST'], jerseySize: 'S/M', archived: true, createdAt: 200, updatedAt: 250 },
    ])
    expect(storage.getItem(PLAYER_STORAGE_KEY)).toBe(legacyPayload)
  })

  it('normalizes valid stored position fields but rejects absent, malformed, and unknown version-2 data', async () => {
    const validLegacy = JSON.stringify({
      version: 1,
      players: [{
        id: 'legacy-player', name: 'Alex', archived: true, createdAt: 100, updatedAt: 150,
        positions: ['DM', 'IV', 'DM'],
      }],
    })
    const storage = new MemoryStorage()
    storage.setItem(PLAYER_STORAGE_KEY, validLegacy)
    await expect(createPlayerRepository({ storage }).listPlayers()).resolves.toMatchObject([
      { positions: ['IV', 'DM'] },
    ])

    for (const player of [
      { id: 'missing-positions', name: 'Alex', archived: false, createdAt: 1, updatedAt: 1 },
      { ...createPlayer('Alex', 1, 'malformed-positions'), positions: 'IV' },
      { ...createPlayer('Alex', 1, 'unknown-position'), positions: ['XYZ'] },
      { ...createPlayer('Alex', 1, 'non-string-position'), positions: ['IV', 4] },
    ]) {
      const payload = JSON.stringify({ version: 2, players: [player] })
      storage.setItem(PLAYER_STORAGE_KEY, payload)
      await expect(createPlayerRepository({ storage }).listPlayers()).rejects.toThrow('positions')
      expect(storage.getItem(PLAYER_STORAGE_KEY)).toBe(payload)
    }

    const malformedLegacyPayload = JSON.stringify({
      version: 1,
      players: [{ ...createPlayer('Alex', 1, 'legacy-unknown'), positions: ['XYZ'] }],
    })
    storage.setItem(PLAYER_STORAGE_KEY, malformedLegacyPayload)
    await expect(createPlayerRepository({ storage }).listPlayers()).rejects.toThrow('positions')
    expect(storage.getItem(PLAYER_STORAGE_KEY)).toBe(malformedLegacyPayload)
  })

  it('requires explicit normalized profile fields in version 3', async () => {
    const storage = new MemoryStorage()
    const valid = createPlayer({ name: 'Alex', positions: ['IV'], jerseySize: 'M' }, 100, 'valid-current')
    const invalidPlayers = [
      { ...valid, jerseySize: undefined },
      { ...valid, jerseySize: 7 },
      { ...valid, positions: undefined },
      { ...valid, positions: ['UNKNOWN'] },
    ]

    for (const player of invalidPlayers) {
      const payload = JSON.stringify({ version: 3, players: [player] })
      storage.setItem(PLAYER_STORAGE_KEY, payload)
      await expect(createPlayerRepository({ storage }).listPlayers()).rejects.toThrow()
      expect(storage.getItem(PLAYER_STORAGE_KEY)).toBe(payload)
    }
  })

  it('preserves a legacy payload when the first version-3 save fails', async () => {
    const storage = new MemoryStorage()
    const legacyPayload = JSON.stringify({
      version: 1,
      players: [{
        id: 'legacy-alex', name: 'Alex', archived: false, createdAt: 100, updatedAt: 100,
      }],
    })
    storage.setItem(PLAYER_STORAGE_KEY, legacyPayload)
    const repository = createPlayerRepository({ storage })
    const players = await repository.listPlayers()
    storage.failNextWrite = true

    await expect(repository.savePlayers([{
      ...players[0], positions: ['IV'], updatedAt: 200,
    }])).rejects.toThrow('Storage is full.')
    expect(storage.getItem(PLAYER_STORAGE_KEY)).toBe(legacyPayload)
  })

  it.each([
    ['malformed JSON', '{invalid-json', 'valid JSON'],
    ['unsupported version', JSON.stringify({ version: 9, players: [] }), 'Unsupported player storage version: 9.'],
    ['duplicate identities', JSON.stringify({
      version: 2,
      players: [
        createPlayer('Alex', 100, 'duplicate'),
        createPlayer('Sam', 200, 'duplicate'),
      ],
    }), 'duplicate player ID'],
  ])('rejects %s without rewriting the stored payload', async (_label, payload, error) => {
    const storage = new MemoryStorage()
    storage.setItem(PLAYER_STORAGE_KEY, payload)
    const repository = createPlayerRepository({ storage })

    await expect(repository.listPlayers()).rejects.toThrow(error)
    expect(storage.getItem(PLAYER_STORAGE_KEY)).toBe(payload)
  })
})
