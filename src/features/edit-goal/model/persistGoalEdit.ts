import type { DeepReadonly } from 'vue'
import type { GoalEvent, Match, MatchStore } from '../../../entities/match'

export async function persistGoalEdit(
  match: DeepReadonly<Match>,
  editedGoal: GoalEvent,
  store: Pick<MatchStore, 'persist'>,
  now = Date.now(),
): Promise<number> {
  await store.persist({
    ...match,
    goals: match.goals.map((goal) => goal.id === editedGoal.id ? { ...editedGoal } : { ...goal }),
    updatedAt: now,
  })
  return now
}
