import type { DeepReadonly } from 'vue'
import { createGoalEvent, type Match, type MatchSide, type MatchStore } from '../../../entities/match'

export interface CommittedGoalResult {
  goalId: string
  acceptedAt: number
}

export async function recordMatchGoal(
  match: DeepReadonly<Match>,
  side: MatchSide,
  store: Pick<MatchStore, 'persist'>,
  now = Date.now(),
): Promise<CommittedGoalResult> {
  const goal = createGoalEvent(side, match.clock, now)
  await store.persist({
    ...match,
    goals: [...match.goals.map((savedGoal) => ({ ...savedGoal })), goal],
    updatedAt: now,
  })
  return { goalId: goal.id, acceptedAt: now }
}
