import { normalizePlayerPositions, type PlayerPosition } from './playerPositions'

export interface Player {
  id: string
  name: string
  positions: PlayerPosition[]
  jerseySize: string | null
  archived: boolean
  createdAt: number
  updatedAt: number
}

export interface PlayerProfileInput {
  name: string
  positions: readonly PlayerPosition[]
  jerseySize?: string | null
}

export type ReadonlyPlayer = Readonly<Omit<Player, 'positions'>> & {
  readonly positions: readonly PlayerPosition[]
}

function requiredName(value: string): string {
  if (typeof value !== 'string') throw new Error('A player name is required.')
  const name = value.trim()
  if (!name) throw new Error('A player name is required.')
  return name
}

function requiredId(value: string): string {
  const id = value.trim()
  if (!id) throw new Error('A player ID is required.')
  return id
}

export function normalizePlayerJerseySize(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw new Error('A player jersey size must be text or empty.')
  const size = value.trim()
  return size || null
}

export function createPlayer(
  nameOrProfile: string | PlayerProfileInput,
  now = Date.now(),
  id: string = crypto.randomUUID(),
): Player {
  const profile = typeof nameOrProfile === 'string'
    ? { name: nameOrProfile, positions: [] }
    : nameOrProfile
  return {
    id: requiredId(id),
    name: requiredName(profile.name),
    positions: normalizePlayerPositions(profile.positions),
    jerseySize: normalizePlayerJerseySize(profile.jerseySize),
    archived: false,
    createdAt: now,
    updatedAt: now,
  }
}

export function updatePlayerProfile(
  player: ReadonlyPlayer,
  profile: PlayerProfileInput,
  now = Date.now(),
): Player {
  return {
    ...player,
    name: requiredName(profile.name),
    positions: normalizePlayerPositions(profile.positions),
    jerseySize: profile.jerseySize === undefined
      ? player.jerseySize
      : normalizePlayerJerseySize(profile.jerseySize),
    updatedAt: now,
  }
}

export function renamePlayer(player: ReadonlyPlayer, name: string, now = Date.now()): Player {
  return updatePlayerProfile(player, { name, positions: player.positions }, now)
}

export function archivePlayer(player: ReadonlyPlayer, now = Date.now()): Player {
  return { ...player, positions: normalizePlayerPositions(player.positions), archived: true, updatedAt: now }
}

export function restorePlayer(player: ReadonlyPlayer, now = Date.now()): Player {
  return { ...player, positions: normalizePlayerPositions(player.positions), archived: false, updatedAt: now }
}
