import type { DeepReadonly } from 'vue'
import type { Match } from './match'

function compareMatchIdentity(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

/** Resolve each player's last accepted number in one set before this match. */
export function resolveHistoricalJerseyNumbers(
  matches: readonly DeepReadonly<Match>[],
  currentMatchId: string,
  setId: string,
): ReadonlyMap<string, number> {
  const history = matches
    .filter((match) => match.id !== currentMatchId
      && match.clock.status !== 'not-started'
      && match.firstKickoffAt !== null
      && match.jerseyAssignment?.setId === setId)
    .sort((left, right) => {
      const leftKickoff = left.firstKickoffAt!
      const rightKickoff = right.firstKickoffAt!
      if (leftKickoff !== rightKickoff) return leftKickoff > rightKickoff ? -1 : 1
      return compareMatchIdentity(left.id, right.id)
    })

  const result = new Map<string, number>()
  for (const match of history) {
    for (const row of match.jerseyAssignment!.rows) {
      if (row.jersey !== null && !result.has(row.playerId)) {
        result.set(row.playerId, row.jersey.number)
      }
    }
  }
  return result
}
