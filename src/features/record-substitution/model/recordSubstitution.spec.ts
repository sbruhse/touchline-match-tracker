import { describe, expect, it } from 'vitest'
import { createMatch, type Match, type MatchParticipation } from '../../../entities/match'
import {
  buildSubstitutionCandidate,
  prepareSubstitutionOccurrence,
} from './recordSubstitution'

function trackedMatch(overrides: Partial<Match> = {}): Match {
  const base = createMatch('North City', 'South Town', 100, 'substitution-match')
  const participation: MatchParticipation = {
    ownSide: 'home',
    squad: [
      { playerId: 'alex', nameSnapshot: 'Alex' },
      { playerId: 'sam', nameSnapshot: 'Sam' },
      { playerId: 'jordan', nameSnapshot: 'Jordan' },
    ],
    starterIds: ['alex'],
    substitutions: [],
  }
  const match: Match = {
    ...base,
    clock: { period: 1, elapsedMs: 1_000, status: 'running', startedAt: 10_000 },
    participation,
    firstKickoffAt: 9_500,
    jerseyAssignment: {
      setId: 'set-blue',
      setNameSnapshot: 'Blue',
      rows: [
        { playerId: 'alex', jersey: { jerseyId: 'jersey-alex', number: 7, size: 'M', ownerPlayerId: null } },
        { playerId: 'sam', jersey: { jerseyId: 'jersey-sam', number: 8, size: 'M', ownerPlayerId: 'sam' } },
        { playerId: 'jordan', jersey: { jerseyId: 'jersey-jordan', number: 9, size: 'L', ownerPlayerId: null } },
      ],
    },
    ...overrides,
  }
  if (overrides.participation === null) match.jerseyAssignment = null
  if (overrides.clock?.status === 'not-started') match.firstKickoffAt = null
  return match
}

describe('record-substitution model', () => {
  it('captures running elapsed time before player selection', () => {
    const match = trackedMatch()
    const prepared = prepareSubstitutionOccurrence(match, 12_500)

    expect(prepared.valid).toBe(true)
    if (prepared.valid) {
      expect(prepared.occurrence).toEqual({
        period: 1,
        elapsedMs: 3_500,
        capturedAt: 12_500,
        expectedUpdatedAt: 100,
        atHalfTime: false,
      })
      expect(prepared.lineup).toEqual(['alex'])
      expect(prepared.bench).toEqual(['sam', 'jordan'])
    }
  })

  it('captures frozen paused time and second-half zero at half-time', () => {
    const paused = trackedMatch({
      clock: { period: 1, elapsedMs: 9_250, status: 'paused', startedAt: null },
    })
    const pausedDraft = prepareSubstitutionOccurrence(paused, 200_000)
    expect(pausedDraft.valid).toBe(true)
    if (pausedDraft.valid) expect(pausedDraft.occurrence).toMatchObject({ period: 1, elapsedMs: 9_250 })

    const halftime = trackedMatch({
      clock: { period: 1, elapsedMs: 47 * 60_000, status: 'halftime', startedAt: null },
      completedPeriodElapsedMs: { 1: 47 * 60_000, 2: null },
    })
    const halfTimeDraft = prepareSubstitutionOccurrence(halftime, 300_000)
    expect(halfTimeDraft.valid).toBe(true)
    if (halfTimeDraft.valid) {
      expect(halfTimeDraft.occurrence).toMatchObject({ period: 2, elapsedMs: 0, atHalfTime: true })
      expect(halfTimeDraft.lineup).toEqual(['alex'])
    }
  })

  it('does not offer capture before kickoff, after full-time, or without tracked setup', () => {
    const notStarted = trackedMatch({
      clock: { period: 1, elapsedMs: 0, status: 'not-started', startedAt: null },
    })
    const fullTime = trackedMatch({
      clock: { period: 2, elapsedMs: 100_000, status: 'full-time', startedAt: null },
    })
    const goalOnly = { ...trackedMatch(), participation: null }

    expect(prepareSubstitutionOccurrence(notStarted, 100)).toMatchObject({ valid: false })
    expect(prepareSubstitutionOccurrence(fullTime, 100)).toMatchObject({ valid: false })
    expect(prepareSubstitutionOccurrence(goalOnly, 100)).toMatchObject({ valid: false })
  })

  it('preserves the captured time, assigns stable sequence, and permits re-entry', () => {
    const attributedGoal = {
      id: 'attributed-goal', side: 'home' as const, period: 1 as const, elapsedMs: 123_456,
      scorerPlayerId: 'alex', scorer: 'Alex snapshot',
      assistPlayerId: 'sam', assist: 'Sam snapshot', description: '', createdAt: 100,
    }
    const match = trackedMatch({ goals: [attributedGoal] })
    const firstOccurrence = prepareSubstitutionOccurrence(match, 12_000)
    expect(firstOccurrence.valid).toBe(true)
    if (!firstOccurrence.valid) return

    const first = buildSubstitutionCandidate(match, firstOccurrence.occurrence, 'alex', 'sam', 30_000, 'first')
    expect(first.valid).toBe(true)
    if (!first.valid) return
    expect(first.event).toMatchObject({ period: 1, elapsedMs: 3_000, createdAt: 12_000, sequence: 0 })
    expect(match.participation?.substitutions).toEqual([])

    const afterFirst = first.match
    expect(afterFirst.firstKickoffAt).toBe(match.firstKickoffAt)
    expect(afterFirst.jerseyAssignment).toEqual(match.jerseyAssignment)
    expect(afterFirst.goals).toEqual([attributedGoal])
    expect(afterFirst.participation).toMatchObject({
      ownSide: match.participation?.ownSide,
      squad: match.participation?.squad,
      starterIds: match.participation?.starterIds,
      substitutions: [{ id: 'first' }],
    })
    const secondOccurrence = prepareSubstitutionOccurrence(afterFirst, 40_000)
    expect(secondOccurrence.valid).toBe(true)
    if (!secondOccurrence.valid) return
    const second = buildSubstitutionCandidate(afterFirst, secondOccurrence.occurrence, 'sam', 'alex', 40_000, 'second')
    expect(second.valid).toBe(true)
    if (second.valid) {
      expect(second.event.sequence).toBe(1)
      expect(second.match.participation?.substitutions.map((event) => event.id)).toEqual(['first', 'second'])
      expect(second.match.firstKickoffAt).toBe(match.firstKickoffAt)
      expect(second.match.jerseyAssignment).toEqual(match.jerseyAssignment)
      expect(second.match.goals).toEqual([attributedGoal])
    }
  })

  it('rejects a stale draft after the committed match changes without appending an event', () => {
    const match = trackedMatch()
    const prepared = prepareSubstitutionOccurrence(match, 12_000)
    expect(prepared.valid).toBe(true)
    if (!prepared.valid) return
    const changedMatch = {
      ...match,
      updatedAt: 20_000,
      clock: { period: 1 as const, elapsedMs: 11_000, status: 'paused' as const, startedAt: null },
    }
    const candidate = buildSubstitutionCandidate(
      changedMatch,
      prepared.occurrence,
      'alex',
      'sam',
      25_000,
      'stale-event',
    )

    expect(candidate).toMatchObject({
      valid: false,
      eventId: null,
      error: 'This substitution draft is out of date because the match changed. Cancel it and start again.',
    })
    expect(changedMatch.participation?.substitutions).toEqual([])
  })

  it('validates the entire event history before producing a candidate', () => {
    const match = trackedMatch()
    const prepared = prepareSubstitutionOccurrence(match, 12_000)
    expect(prepared.valid).toBe(true)
    if (!prepared.valid) return
    const invalid = buildSubstitutionCandidate(match, prepared.occurrence, 'alex', 'alex', 15_000, 'invalid')

    expect(invalid).toMatchObject({ valid: false, eventId: 'invalid' })
    expect(match.participation?.substitutions).toEqual([])
  })
})
