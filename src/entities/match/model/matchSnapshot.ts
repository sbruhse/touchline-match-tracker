import type { DeepReadonly } from 'vue'
import type { Match } from './match'

/** Create a detached plain-data snapshot of every persisted match field. */
export function copyMatchSnapshot(match: DeepReadonly<Match>): Match {
  return {
    id: match.id,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    createdAt: match.createdAt,
    updatedAt: match.updatedAt,
    clock: { ...match.clock },
    goals: match.goals.map((goal) => ({ ...goal })),
    participation: match.participation ? {
      ownSide: match.participation.ownSide,
      squad: match.participation.squad.map((player) => ({ ...player })),
      starterIds: [...match.participation.starterIds],
      substitutions: match.participation.substitutions.map((event) => ({ ...event })),
    } : null,
    firstKickoffAt: match.firstKickoffAt,
    jerseyAssignment: match.jerseyAssignment ? {
      setId: match.jerseyAssignment.setId,
      setNameSnapshot: match.jerseyAssignment.setNameSnapshot,
      rows: match.jerseyAssignment.rows.map((row) => ({
        playerId: row.playerId,
        jersey: row.jersey ? { ...row.jersey } : null,
      })),
    } : null,
    completedPeriodElapsedMs: { ...match.completedPeriodElapsedMs },
  }
}
