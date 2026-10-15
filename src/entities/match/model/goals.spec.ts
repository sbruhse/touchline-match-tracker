import { describe, expect, it } from 'vitest'
import { createGoalEvent } from './goals'

describe('goal factory', () => {
  it('starts with independent unknown scorer and assist identities', () => {
    const goal = createGoalEvent('home', {
      period: 1,
      elapsedMs: 12_345,
      status: 'paused',
      startedAt: null,
    }, 500)

    expect(goal).toMatchObject({
      side: 'home',
      period: 1,
      elapsedMs: 12_345,
      scorerPlayerId: null,
      scorer: '',
      assistPlayerId: null,
      assist: '',
    })
  })
})
