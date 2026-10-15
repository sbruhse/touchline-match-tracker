export const PLAYER_POSITIONS = [
  { code: 'TW', name: 'Torwart', group: 'Tor' },
  { code: 'IV', name: 'Innenverteidiger', group: 'Abwehr' },
  { code: 'LV', name: 'Linksverteidiger', group: 'Abwehr' },
  { code: 'RV', name: 'Rechtsverteidiger', group: 'Abwehr' },
  { code: 'DM', name: 'Defensives Mittelfeld', group: 'Mittelfeld' },
  { code: 'ZM', name: 'Zentrales Mittelfeld', group: 'Mittelfeld' },
  { code: 'OM', name: 'Offensives Mittelfeld', group: 'Mittelfeld' },
  { code: 'LM', name: 'Linkes Mittelfeld', group: 'Mittelfeld' },
  { code: 'RM', name: 'Rechtes Mittelfeld', group: 'Mittelfeld' },
  { code: 'LA', name: 'Linksaußen', group: 'Angriff' },
  { code: 'RA', name: 'Rechtsaußen', group: 'Angriff' },
  { code: 'ST', name: 'Stürmer', group: 'Angriff' },
] as const

export type PlayerPosition = (typeof PLAYER_POSITIONS)[number]['code']

export function normalizePlayerPositions(value: unknown): PlayerPosition[] {
  if (!Array.isArray(value)) {
    throw new Error('Player positions must be an array.')
  }

  const selected = new Set<PlayerPosition>()
  for (const position of value) {
    if (typeof position !== 'string' || !PLAYER_POSITIONS.some(({ code }) => code === position)) {
      throw new Error(`Unknown player position: ${String(position)}.`)
    }
    selected.add(position as PlayerPosition)
  }

  return PLAYER_POSITIONS
    .filter(({ code }) => selected.has(code))
    .map(({ code }) => code)
}
