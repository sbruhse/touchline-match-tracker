import type { DeepReadonly } from 'vue'
import type { GoalEvent, MatchParticipation } from './match'

type GoalAttribution = Pick<GoalEvent,
  'side' | 'scorerPlayerId' | 'scorer' | 'assistPlayerId' | 'assist'
>

/** Validate explicit goal-role links against the saved match squad only. */
export function validateGoalAttribution(
  goal: DeepReadonly<GoalAttribution>,
  participation: DeepReadonly<MatchParticipation> | null,
): string | null {
  const linkedRoles = [
    { role: 'scorer', playerId: goal.scorerPlayerId, name: goal.scorer },
    { role: 'assist provider', playerId: goal.assistPlayerId, name: goal.assist },
  ] as const
  const linked = linkedRoles.filter(({ playerId }) => playerId !== null)
  if (linked.length === 0) return null
  if (!participation) return 'Linked goal players require a saved match squad.'
  if (goal.side !== participation.ownSide) return 'Linked goal players can only be assigned to a goal for the saved own side.'

  const squadIds = new Set(participation.squad.map(({ playerId }) => playerId))
  for (const { role, playerId, name } of linked) {
    if (typeof playerId !== 'string' || !playerId.trim()) {
      return `The linked ${role} must have a valid player identity.`
    }
    if (typeof name !== 'string' || !name.trim()) {
      return `The linked ${role} must have a recorded name.`
    }
    if (!squadIds.has(playerId)) {
      return `The linked ${role} must belong to the saved match squad.`
    }
  }
  return null
}

/** Clear links that are no longer eligible while preserving recorded role names. */
export function reconcileGoalAttributions(
  goals: readonly DeepReadonly<GoalEvent>[],
  participation: DeepReadonly<MatchParticipation> | null,
): GoalEvent[] {
  const squadIds = new Set(participation?.squad.map(({ playerId }) => playerId) ?? [])
  return goals.map((goal) => {
    const sideIsEligible = participation !== null && goal.side === participation.ownSide
    const eligibleId = (playerId: string | null): string | null =>
      sideIsEligible && playerId?.trim() && squadIds.has(playerId) ? playerId : null

    return {
      ...goal,
      scorerPlayerId: eligibleId(goal.scorerPlayerId),
      assistPlayerId: eligibleId(goal.assistPlayerId),
    }
  })
}
