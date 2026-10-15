export interface PlayerIdentityLabelInput {
  id: string
  name: string
}

function stableId(playerId: string): string {
  return playerId.replace(/[^a-z0-9]/gi, '') || playerId
}

function distinguishingSuffix(playerId: string, group: readonly PlayerIdentityLabelInput[]): string {
  const compactId = stableId(playerId)
  let length = Math.min(4, compactId.length)
  while (length < compactId.length && group.some((other) =>
    other.id !== playerId && stableId(other.id).slice(0, length).toLowerCase() === compactId.slice(0, length).toLowerCase(),
  )) {
    length += 1
  }
  if (group.some((other) => other.id !== playerId && stableId(other.id) === compactId)) return playerId
  return compactId.slice(0, length)
}

export function createPlayerIdentityLabels(
  players: readonly PlayerIdentityLabelInput[],
): ReadonlyMap<string, string> {
  const groups = new Map<string, PlayerIdentityLabelInput[]>()
  for (const player of players) {
    const key = player.name.trim().toLocaleLowerCase()
    groups.set(key, [...(groups.get(key) ?? []), player])
  }

  const labels = new Map<string, string>()
  for (const group of groups.values()) {
    if (group.length === 1) {
      labels.set(group[0].id, group[0].name)
      continue
    }
    for (const player of group) {
      labels.set(player.id, `${player.name} · ${distinguishingSuffix(player.id, group)}`)
    }
  }
  return labels
}
