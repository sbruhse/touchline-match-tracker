import { describe, expect, it } from 'vitest'
import { createPlayer } from '../model/player'
import { createPlayerRepository, PLAYER_STORAGE_KEY, type PlayerStorageLike } from './playerStorage'

class MemoryStorage implements PlayerStorageLike {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

describe('player storage adapter', () => {
  it('writes a versioned player collection that reloads with stable identities', async () => {
    const storage = new MemoryStorage()
    const player = createPlayer('Alex', 100, 'player-alex')
    const repository = createPlayerRepository({ storage })

    await repository.savePlayers([player])

    expect(JSON.parse(storage.getItem(PLAYER_STORAGE_KEY)!)).toEqual({ version: 1, players: [player] })
    const reloadedRepository = createPlayerRepository({ storage })
    await expect(reloadedRepository.listPlayers()).resolves.toEqual([player])
  })

  it.each([
    ['malformed JSON', '{invalid-json', 'valid JSON'],
    ['unsupported version', JSON.stringify({ version: 9, players: [] }), 'Unsupported player storage version: 9.'],
    ['duplicate identities', JSON.stringify({
      version: 1,
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
