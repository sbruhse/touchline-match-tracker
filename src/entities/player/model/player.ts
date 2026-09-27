export interface Player {
  id: string
  name: string
  archived: boolean
  createdAt: number
  updatedAt: number
}

function requiredName(value: string): string {
  const name = value.trim()
  if (!name) throw new Error('A player name is required.')
  return name
}

function requiredId(value: string): string {
  const id = value.trim()
  if (!id) throw new Error('A player ID is required.')
  return id
}

export function createPlayer(
  name: string,
  now = Date.now(),
  id: string = crypto.randomUUID(),
): Player {
  return {
    id: requiredId(id),
    name: requiredName(name),
    archived: false,
    createdAt: now,
    updatedAt: now,
  }
}

export function renamePlayer(player: Player, name: string, now = Date.now()): Player {
  return {
    ...player,
    name: requiredName(name),
    updatedAt: now,
  }
}

export function archivePlayer(player: Player, now = Date.now()): Player {
  return { ...player, archived: true, updatedAt: now }
}

export function restorePlayer(player: Player, now = Date.now()): Player {
  return { ...player, archived: false, updatedAt: now }
}
