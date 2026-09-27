import type { Player } from '../model/player'

export const PLAYER_STORAGE_KEY = 'touchline.player-store'
export const PLAYER_STORAGE_VERSION = 1

export interface PlayerRepository {
  listPlayers(): Promise<Player[]>
  savePlayers(players: readonly Player[]): Promise<void>
  close(): void
}

export interface PlayerStorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface PlayerRepositoryOptions {
  storage?: PlayerStorageLike
  key?: string
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid player storage: ${label} must be an object.`)
  }
  return value as Record<string, unknown>
}

function parsePlayer(value: unknown, index: number): Player {
  const record = asRecord(value, `players[${index}]`)
  if (typeof record.id !== 'string' || !record.id.trim()) {
    throw new Error(`Invalid player storage: players[${index}].id is required.`)
  }
  if (typeof record.name !== 'string' || !record.name.trim()) {
    throw new Error(`Invalid player storage: players[${index}].name is required.`)
  }
  if (typeof record.archived !== 'boolean') {
    throw new Error(`Invalid player storage: players[${index}].archived must be a boolean.`)
  }
  if (typeof record.createdAt !== 'number' || !Number.isFinite(record.createdAt)
    || typeof record.updatedAt !== 'number' || !Number.isFinite(record.updatedAt)) {
    throw new Error(`Invalid player storage: players[${index}] timestamps must be finite numbers.`)
  }
  return {
    id: record.id,
    name: record.name.trim(),
    archived: record.archived,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

function parsePlayers(value: unknown): Player[] {
  if (!Array.isArray(value)) throw new Error('Invalid player storage: players must be an array.')
  const players = value.map(parsePlayer)
  const ids = new Set<string>()
  for (const player of players) {
    if (ids.has(player.id)) throw new Error(`Invalid player storage: duplicate player ID "${player.id}".`)
    ids.add(player.id)
  }
  return players
}

export function createPlayerRepository(options: PlayerRepositoryOptions = {}): PlayerRepository {
  const key = options.key ?? PLAYER_STORAGE_KEY
  let closed = false

  function storage(): PlayerStorageLike {
    if (closed) throw new Error('Player repository is closed.')
    const resolved = options.storage ?? globalThis.localStorage
    if (!resolved) throw new Error('Local player storage is not available in this browser.')
    return resolved
  }

  return {
    async listPlayers() {
      const payload = storage().getItem(key)
      if (payload === null) return []

      let envelope: unknown
      try {
        envelope = JSON.parse(payload)
      } catch (error) {
        throw new Error('Saved player data is not valid JSON.', { cause: error })
      }
      const record = asRecord(envelope, 'root')
      if (record.version !== PLAYER_STORAGE_VERSION) {
        throw new Error(`Unsupported player storage version: ${String(record.version)}.`)
      }
      return parsePlayers(record.players)
    },
    async savePlayers(players) {
      const snapshot = parsePlayers(players)
      storage().setItem(key, JSON.stringify({ version: PLAYER_STORAGE_VERSION, players: snapshot }))
    },
    close() {
      closed = true
    },
  }
}
