import type { DeepReadonly } from 'vue'
import type { MatchJerseyAssignment, MatchJerseyAssignmentRow, MatchParticipation } from './match'

/** Return the accepted jersey number, null for an explicit unassigned row, or undefined without a row. */
export function getAcceptedJerseyNumber(
  assignment: DeepReadonly<MatchJerseyAssignment> | null,
  playerId: string,
): number | null | undefined {
  if (!assignment) return undefined
  const row = assignment.rows.find((candidate) => candidate.playerId === playerId) as
    | DeepReadonly<MatchJerseyAssignmentRow>
    | undefined
  return row?.jersey?.number ?? (row ? null : undefined)
}

/** Validate a saved match distribution without consulting the live inventory. */
export function validateMatchJerseyAssignment(
  participation: DeepReadonly<MatchParticipation> | null,
  assignment: DeepReadonly<MatchJerseyAssignment> | null,
): string | null {
  if (assignment === null) return null
  if (!participation) return 'A jersey distribution requires a saved match squad.'
  if (typeof assignment.setId !== 'string' || !assignment.setId.trim()) {
    return 'A jersey distribution must identify its jersey set.'
  }
  if (typeof assignment.setNameSnapshot !== 'string' || !assignment.setNameSnapshot.trim()) {
    return 'A jersey distribution must include its saved set name.'
  }
  if (!Array.isArray(assignment.rows)) return 'Jersey assignment rows must be a list.'

  const squadIds = new Set(participation.squad.map(({ playerId }) => playerId))
  const rowIds = new Set<string>()
  const jerseyIds = new Set<string>()
  const numbers = new Set<number>()

  for (const row of assignment.rows) {
    if (!row || typeof row.playerId !== 'string' || !row.playerId.trim()) {
      return 'Every jersey assignment row must identify a player.'
    }
    if (rowIds.has(row.playerId)) return 'A player can have only one jersey assignment row.'
    if (!squadIds.has(row.playerId)) return 'Every jersey assignment row must belong to the saved match squad.'
    rowIds.add(row.playerId)

    if (row.jersey === null) continue
    const jersey = row.jersey
    if (!jersey || typeof jersey.jerseyId !== 'string' || !jersey.jerseyId.trim()) {
      return 'Every assigned jersey must have a valid identity.'
    }
    if (jerseyIds.has(jersey.jerseyId)) return 'A physical jersey can be assigned only once.'
    jerseyIds.add(jersey.jerseyId)
    if (typeof jersey.number !== 'number' || !Number.isSafeInteger(jersey.number) || jersey.number < 0) {
      return 'Jersey numbers must be nonnegative whole numbers.'
    }
    if (numbers.has(jersey.number)) return 'A jersey number can be assigned only once across the match squad.'
    numbers.add(jersey.number)
    if (typeof jersey.size !== 'string' || !jersey.size.trim()) {
      return 'Every assigned jersey must include its saved size.'
    }
    if (jersey.ownerPlayerId !== null
      && (typeof jersey.ownerPlayerId !== 'string' || !jersey.ownerPlayerId.trim())) {
      return 'A jersey owner must be a player identity or null.'
    }
  }

  if (rowIds.size !== squadIds.size || [...squadIds].some((playerId) => !rowIds.has(playerId))) {
    return 'Jersey assignment rows must exactly match the saved match squad.'
  }
  return null
}

/** Reconcile saved rows by stable squad identity without generating replacements. */
export function reconcileMatchJerseyAssignment(
  assignment: DeepReadonly<MatchJerseyAssignment> | null,
  participation: DeepReadonly<MatchParticipation> | null,
): MatchJerseyAssignment | null {
  if (!assignment || !participation) return null
  const rowsByPlayerId = new Map(assignment.rows.map((row) => [row.playerId, row]))
  return {
    setId: assignment.setId,
    setNameSnapshot: assignment.setNameSnapshot,
    rows: participation.squad.map(({ playerId }) => {
      const previous = rowsByPlayerId.get(playerId)
      return {
        playerId,
        jersey: previous?.jersey ? { ...previous.jersey } : null,
      }
    }),
  }
}
