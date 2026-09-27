import type { DeepReadonly } from 'vue'
import {
  endFirstHalf,
  finishMatch,
  pauseClock,
  resumeClock,
  startSecondHalf,
  type Match,
  type MatchStore,
} from '../../../entities/match'

export type MatchClockAction = 'resume' | 'pause' | 'end-first-half' | 'start-second-half' | 'finish'

export async function applyMatchClockAction(
  match: DeepReadonly<Match>,
  action: MatchClockAction,
  store: Pick<MatchStore, 'persist'>,
  now = Date.now(),
): Promise<void> {
  let clock
  const completedPeriodElapsedMs = { ...match.completedPeriodElapsedMs }
  switch (action) {
    case 'resume': clock = resumeClock(match.clock, now); break
    case 'pause': clock = pauseClock(match.clock, now); break
    case 'end-first-half':
      clock = endFirstHalf(match.clock, now)
      if (clock.status === 'halftime' && clock.period === 1) {
        completedPeriodElapsedMs[1] = clock.elapsedMs
      }
      break
    case 'start-second-half': clock = startSecondHalf(match.clock, now); break
    case 'finish':
      clock = finishMatch(match.clock, now)
      if (clock.status === 'full-time' && match.clock.status !== 'full-time') {
        completedPeriodElapsedMs[match.clock.period] = clock.elapsedMs
      }
      break
  }

  await store.persist({
    ...match,
    clock,
    completedPeriodElapsedMs,
    goals: match.goals.map((goal) => ({ ...goal })),
    updatedAt: now,
  })
}
