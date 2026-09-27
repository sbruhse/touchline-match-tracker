import { describe, expect, it } from 'vitest'
import { createMatch, scoreFor } from './match'

describe('match model', () => {
  it('creates matches without participation or completed half durations', () => {
    const match = createMatch('North City', 'South Town', 100, 'new-match')

    expect(match.participation).toBeNull()
    expect(match.completedPeriodElapsedMs).toEqual({ 1: null, 2: null })
  })

  it('continues to calculate the score from goals only', () => {
    const match = createMatch('North City', 'South Town', 100, 'score-match')
    match.goals.push(
      {
        id: 'home-goal', side: 'home', period: 1, elapsedMs: 60_000,
        scorer: '', assist: '', description: '', createdAt: 200,
      },
      {
        id: 'away-goal', side: 'away', period: 2, elapsedMs: 30_000,
        scorer: '', assist: '', description: '', createdAt: 300,
      },
    )

    expect(scoreFor(match)).toEqual({ home: 1, away: 1 })
  })
})
