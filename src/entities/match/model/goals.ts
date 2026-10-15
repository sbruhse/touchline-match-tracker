import { getElapsedMs } from './clock'
import type { ClockState, GoalEvent, MatchSide } from './match'

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function createGoalEvent(side: MatchSide, clock: ClockState, now = Date.now()): GoalEvent {
  return {
    id: createId(),
    side,
    period: clock.period,
    elapsedMs: getElapsedMs(clock, now),
    scorerPlayerId: null,
    scorer: '',
    assistPlayerId: null,
    assist: '',
    description: '',
    createdAt: now,
  }
}
