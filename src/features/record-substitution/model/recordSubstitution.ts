import type { DeepReadonly } from 'vue'
import {
  calculateParticipationPlayingTime,
  getElapsedMs,
  type Match,
  type MatchParticipation,
  type MatchStore,
  type MatchPeriod,
  type SubstitutionEvent,
  validateSubstitutionHistoryCandidate,
} from '../../../entities/match'

export interface SubstitutionOccurrence {
  period: MatchPeriod
  elapsedMs: number
  capturedAt: number
  expectedUpdatedAt: number
  atHalfTime: boolean
}

export interface SubstitutionLineupChoice {
  id: string
  label: string
}

function participationSnapshot(participation: DeepReadonly<MatchParticipation>): MatchParticipation {
  return {
    ownSide: participation.ownSide,
    squad: participation.squad.map((player) => ({ ...player })),
    starterIds: [...participation.starterIds],
    substitutions: participation.substitutions.map((event) => ({ ...event })),
  }
}

export type PrepareSubstitutionResult =
  | {
    valid: true
    occurrence: SubstitutionOccurrence
    lineup: string[]
    bench: string[]
  }
  | { valid: false; error: string }

export type BuildSubstitutionResult =
  | {
    valid: true
    match: Match
    event: SubstitutionEvent
  }
  | { valid: false; error: string; eventId: string | null }

export function prepareSubstitutionOccurrence(
  match: DeepReadonly<Match>,
  now = Date.now(),
): PrepareSubstitutionResult {
  if (!match.participation) return { valid: false, error: 'Player tracking is not configured for this match.' }
  if (match.clock.status !== 'running' && match.clock.status !== 'paused' && match.clock.status !== 'halftime') {
    return { valid: false, error: 'Substitutions can only be started during an active match.' }
  }

  const elapsedMs = match.clock.status === 'halftime' ? 0 : getElapsedMs(match.clock, now)
  const period: MatchPeriod = match.clock.status === 'halftime' ? 2 : match.clock.period
  const calculation = calculateParticipationPlayingTime(
    participationSnapshot(match.participation),
    match.participation.substitutions,
    {
      clock: match.clock,
      currentElapsedMs: match.clock.status === 'halftime' ? match.clock.elapsedMs : elapsedMs,
      completedPeriodElapsedMs: match.completedPeriodElapsedMs,
    },
  )
  if (!calculation.valid) return { valid: false, error: calculation.conflict.reason }

  return {
    valid: true,
    occurrence: {
      period,
      elapsedMs,
      capturedAt: now,
      expectedUpdatedAt: match.updatedAt,
      atHalfTime: match.clock.status === 'halftime',
    },
    lineup: calculation.lineup,
    bench: calculation.bench,
  }
}

export function buildSubstitutionCandidate(
  match: DeepReadonly<Match>,
  occurrence: SubstitutionOccurrence,
  outgoingPlayerId: string,
  incomingPlayerId: string,
  now = Date.now(),
  id: string = crypto.randomUUID(),
): BuildSubstitutionResult {
  if (!match.participation) {
    return { valid: false, error: 'Player tracking is not configured for this match.', eventId: null }
  }
  if (match.updatedAt !== occurrence.expectedUpdatedAt) {
    return {
      valid: false,
      error: 'This substitution draft is out of date because the match changed. Cancel it and start again.',
      eventId: null,
    }
  }
  if (match.clock.status !== 'running' && match.clock.status !== 'paused' && match.clock.status !== 'halftime') {
    return { valid: false, error: 'Substitutions can only be saved during an active match.', eventId: null }
  }

  const event: SubstitutionEvent = {
    id,
    outgoingPlayerId,
    incomingPlayerId,
    period: occurrence.period,
    elapsedMs: occurrence.elapsedMs,
    sequence: Math.max(-1, ...match.participation.substitutions.map((item) => item.sequence)) + 1,
    createdAt: occurrence.capturedAt,
  }
  const candidateEvents = [...match.participation.substitutions.map((item) => ({ ...item })), event]
  const validation = validateSubstitutionHistoryCandidate(
    participationSnapshot(match.participation),
    candidateEvents,
    {
      clock: match.clock,
      currentElapsedMs: getElapsedMs(match.clock, now),
      completedPeriodElapsedMs: match.completedPeriodElapsedMs,
    },
  )
  if (!validation.valid) {
    return {
      valid: false,
      error: validation.conflict.reason,
      eventId: validation.conflict.eventId,
    }
  }

  const nextParticipation: MatchParticipation = {
    ownSide: match.participation.ownSide,
    squad: match.participation.squad.map((player) => ({ ...player })),
    starterIds: [...match.participation.starterIds],
    substitutions: validation.events,
  }
  const nextMatch: Match = {
    id: match.id,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    createdAt: match.createdAt,
    updatedAt: now,
    clock: { ...match.clock },
    goals: match.goals.map((goal) => ({ ...goal })),
    participation: nextParticipation,
    completedPeriodElapsedMs: { ...match.completedPeriodElapsedMs },
  }
  return { valid: true, match: nextMatch, event }
}

export async function recordMatchSubstitution(
  match: DeepReadonly<Match>,
  occurrence: SubstitutionOccurrence,
  outgoingPlayerId: string,
  incomingPlayerId: string,
  store: Pick<MatchStore, 'persist'>,
  now = Date.now(),
): Promise<SubstitutionEvent> {
  const candidate = buildSubstitutionCandidate(
    match,
    occurrence,
    outgoingPlayerId,
    incomingPlayerId,
    now,
  )
  if (!candidate.valid) throw new Error(candidate.error)
  await store.persist(candidate.match)
  return candidate.event
}
