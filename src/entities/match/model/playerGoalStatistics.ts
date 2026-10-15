import type { DeepReadonly } from 'vue'
import type { Match } from './match'

export interface PlayerGoalStatistics {
  playerId: string
  goalCount: number
  assistCount: number
}

/** Derive committed goal-role totals from explicit identities in started tracked matches. */
export function aggregatePlayerGoalStatistics(
  matches: readonly DeepReadonly<Match>[],
  playerId: string,
): PlayerGoalStatistics {
  let goalCount = 0
  let assistCount = 0

  for (const match of matches) {
    const participation = match.participation
    if (!participation || match.clock.status === 'not-started') continue

    const squadIds = new Set(participation.squad.map((player) => player.playerId))
    if (!squadIds.has(playerId)) continue

    for (const goal of match.goals) {
      if (goal.side !== participation.ownSide) continue
      if (goal.scorerPlayerId === playerId && squadIds.has(goal.scorerPlayerId)) goalCount += 1
      if (goal.assistPlayerId === playerId && squadIds.has(goal.assistPlayerId)) assistCount += 1
    }
  }

  return { playerId, goalCount, assistCount }
}
