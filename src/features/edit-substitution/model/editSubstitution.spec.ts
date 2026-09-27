import { describe, expect, it } from 'vitest'
import { createMatch, type Match, type MatchParticipation } from '../../../entities/match'
import {
  buildSubstitutionCorrectionCandidate,
  buildSubstitutionRemovalCandidate,
  formatElapsedTimeInput,
  parseElapsedTimeInput,
} from './editSubstitution'

function finishedMatch(
  events: MatchParticipation['substitutions'],
  firstHalfMs = 60_000,
): Match {
  return {
    ...createMatch('North City', 'South Town', 100, 'edit-substitution-model'),
    clock: { period: 1, elapsedMs: firstHalfMs, status: 'full-time', startedAt: null },
    completedPeriodElapsedMs: { 1: firstHalfMs, 2: null },
    participation: {
      ownSide: 'home',
      squad: [
        { playerId: 'alex', nameSnapshot: 'Alex' },
        { playerId: 'sam', nameSnapshot: 'Sam' },
        { playerId: 'jordan', nameSnapshot: 'Jordan' },
      ],
      starterIds: ['alex'],
      substitutions: events,
    },
  }
}

const event = (
  id: string,
  outgoingPlayerId: string,
  incomingPlayerId: string,
  elapsedMs: number,
  sequence: number,
) => ({
  id, outgoingPlayerId, incomingPlayerId, period: 1 as const, elapsedMs, sequence, createdAt: sequence,
})

describe('edit-substitution model', () => {
  it('parses mm:ss durations and formats sub-second values without changing stored precision', () => {
    expect(parseElapsedTimeInput('47:00')).toBe(47 * 60_000)
    expect(parseElapsedTimeInput('0:09')).toBe(9_000)
    expect(parseElapsedTimeInput('1:60')).toBeNull()
    expect(parseElapsedTimeInput('-1:00')).toBeNull()
    expect(parseElapsedTimeInput('1:2')).toBeNull()
    expect(formatElapsedTimeInput(90_725)).toBe('01:30')
  })

  it('preserves the original milliseconds for a player-only correction', () => {
    const match = finishedMatch([event('millisecond-event', 'alex', 'sam', 1_500, 1)])
    const original = structuredClone(match)
    const result = buildSubstitutionCorrectionCandidate(
      match,
      'millisecond-event',
      { incomingPlayerId: 'jordan' },
      500,
    )

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.events[0]).toMatchObject({ incomingPlayerId: 'jordan', elapsedMs: 1_500 })
      expect(result.match.updatedAt).toBe(500)
    }
    expect(match).toEqual(original)
  })

  it('allows a valid time correction after full-time and recomputes the candidate result', () => {
    const match = finishedMatch([event('first', 'alex', 'sam', 10_000, 1)])
    const result = buildSubstitutionCorrectionCandidate(
      match,
      'first',
      { elapsedMs: 20_000 },
      2_000,
    )

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.events[0].elapsedMs).toBe(20_000)
      expect(result.calculation.playingTime.playerTimes.map(({ playerId, elapsedMs }) => [playerId, elapsedMs]))
        .toEqual([['alex', 20_000], ['sam', 40_000], ['jordan', 0]])
    }
  })

  it('rejects an out-of-range correction with no candidate match', () => {
    const match = finishedMatch([event('future', 'alex', 'sam', 10_000, 1)])
    const result = buildSubstitutionCorrectionCandidate(match, 'future', { elapsedMs: 60_001 }, 2_000)

    expect(result).toMatchObject({ valid: false, conflict: { eventId: 'future' } })
    if (!result.valid) expect(result.conflict.reason).toContain('exceeds the recorded elapsed time')
    expect(match.participation?.substitutions[0].elapsedMs).toBe(10_000)
  })

  it('allows removal only when the remaining complete history is valid', () => {
    const independent = finishedMatch([event('independent', 'alex', 'sam', 10_000, 1)])
    const removed = buildSubstitutionRemovalCandidate(independent, 'independent', 2_000)
    expect(removed.valid).toBe(true)
    if (removed.valid) expect(removed.events).toEqual([])

    const chained = finishedMatch([
      event('first', 'alex', 'sam', 10_000, 1),
      event('return', 'sam', 'alex', 20_000, 2),
    ])
    const invalidRemoval = buildSubstitutionRemovalCandidate(chained, 'first', 2_000)
    expect(invalidRemoval).toMatchObject({ valid: false, conflict: { eventId: 'return' } })
    expect(chained.participation?.substitutions).toHaveLength(2)
  })

  it('rejects a correction that reorders a valid event before its required player enters', () => {
    const match = finishedMatch([
      event('first', 'alex', 'sam', 10_000, 1),
      event('later', 'sam', 'jordan', 20_000, 2),
    ])
    const original = structuredClone(match.participation?.substitutions)
    const result = buildSubstitutionCorrectionCandidate(match, 'first', { elapsedMs: 30_000 }, 2_000)

    expect(result).toMatchObject({ valid: false, conflict: { eventId: 'later' } })
    expect(match.participation?.substitutions).toEqual(original)
  })
})
