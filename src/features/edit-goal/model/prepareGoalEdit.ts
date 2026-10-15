import type { DeepReadonly } from 'vue'
import { parseMatchMinute, validateGoalAttribution } from '../../../entities/match'
import type { GoalEvent, Match, MatchSide } from '../../../entities/match'
import type { GoalPlayerDraft } from './goalPlayerDraft'

export interface GoalEditDraftInput {
  side: MatchSide
  time: string
  savedDisplayTime: string
  scorer: GoalPlayerDraft
  assist: GoalPlayerDraft
  description: string
}

export type PrepareGoalEditResult =
  | { ok: true; goal: GoalEvent }
  | { ok: false; field: 'time' | 'details'; error: string }

function normalizedMinute(value: string): string {
  return value.trim().replace(/[′']/g, '').replace(/\s+/g, '')
}

function roleValues(
  role: GoalPlayerDraft,
  match: DeepReadonly<Match>,
): { playerId: string | null; name: string } {
  if (role.mode === 'none') return { playerId: null, name: '' }
  if (role.mode === 'manual') return { playerId: null, name: role.name.trim() }

  const savedPlayer = match.participation?.squad.find(({ playerId }) => playerId === role.playerId)
  return {
    playerId: role.playerId,
    name: savedPlayer?.nameSnapshot ?? role.name.trim(),
  }
}

/** Build goal details from the latest committed match, without rounding an unchanged display minute. */
export function prepareGoalEdit(
  match: DeepReadonly<Match>,
  goalId: string,
  draft: GoalEditDraftInput,
): PrepareGoalEditResult {
  const currentGoal = match.goals.find(({ id }) => id === goalId)
  if (!currentGoal) {
    return { ok: false, field: 'details', error: 'This goal is no longer part of the saved match. Close and reopen its details.' }
  }

  let period = currentGoal.period
  let elapsedMs = currentGoal.elapsedMs
  if (normalizedMinute(draft.time) !== normalizedMinute(draft.savedDisplayTime)) {
    const parsedTime = parseMatchMinute(draft.time)
    if (!parsedTime) {
      return { ok: false, field: 'time', error: 'Enter a minute from 1–90, or stoppage time such as 45+2.' }
    }
    period = parsedTime.period
    elapsedMs = parsedTime.elapsedMs
  }

  const scorer = roleValues(draft.scorer, match)
  const assist = roleValues(draft.assist, match)
  const goal: GoalEvent = {
    ...currentGoal,
    side: draft.side,
    period,
    elapsedMs,
    scorerPlayerId: scorer.playerId,
    scorer: scorer.name,
    assistPlayerId: assist.playerId,
    assist: assist.name,
    description: draft.description.trim(),
  }
  const attributionError = validateGoalAttribution(goal, match.participation)
  if (attributionError) return { ok: false, field: 'details', error: attributionError }
  return { ok: true, goal }
}
