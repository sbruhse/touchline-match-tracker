import type { DeepReadonly } from 'vue'
import {
  correctSubstitutionHistory,
  getElapsedMs,
  removeSubstitutionHistoryEvent,
  type Match,
  type MatchParticipation,
  type MatchStore,
  type SubstitutionCorrection,
  type SubstitutionEvent,
  type SubstitutionHistoryCandidateResult,
  copyMatchSnapshot,
} from '../../../entities/match'

export type SubstitutionEditResult =
  | {
    valid: true
    match: Match
    events: SubstitutionEvent[]
    calculation: Extract<SubstitutionHistoryCandidateResult, { valid: true }>
  }
  | {
    valid: false
    conflict: { eventId: string | null; reason: string }
  }

export interface CorrectionPlayerChoice {
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

function finishCandidate(
  match: DeepReadonly<Match>,
  events: SubstitutionEvent[],
  now: number,
  validation: SubstitutionHistoryCandidateResult,
): SubstitutionEditResult {
  if (!validation.valid) return { valid: false, conflict: validation.conflict }
  if (!match.participation) {
    return { valid: false, conflict: { eventId: null, reason: 'Player tracking is not configured for this match.' } }
  }
  const participation: MatchParticipation = {
    ...participationSnapshot(match.participation),
    substitutions: events.map((event) => ({ ...event })),
  }
  return {
    valid: true,
    events: events.map((event) => ({ ...event })),
    calculation: validation,
    match: Object.assign(copyMatchSnapshot(match), { updatedAt: now, participation }),
  }
}

function contextFor(match: DeepReadonly<Match>, now: number) {
  return {
    clock: match.clock,
    currentElapsedMs: getElapsedMs(match.clock, now),
    completedPeriodElapsedMs: match.completedPeriodElapsedMs,
  }
}

export function buildSubstitutionCorrectionCandidate(
  match: DeepReadonly<Match>,
  eventId: string,
  correction: SubstitutionCorrection,
  now = Date.now(),
): SubstitutionEditResult {
  if (!match.participation) {
    return { valid: false, conflict: { eventId, reason: 'Player tracking is not configured for this match.' } }
  }
  const participation = participationSnapshot(match.participation)
  const validation = correctSubstitutionHistory(
    participation,
    participation.substitutions,
    eventId,
    correction,
    contextFor(match, now),
  )
  if (!validation.valid) return { valid: false, conflict: validation.conflict }
  return finishCandidate(match, validation.events, now, validation)
}

export function buildSubstitutionRemovalCandidate(
  match: DeepReadonly<Match>,
  eventId: string,
  now = Date.now(),
): SubstitutionEditResult {
  if (!match.participation) {
    return { valid: false, conflict: { eventId, reason: 'Player tracking is not configured for this match.' } }
  }
  const participation = participationSnapshot(match.participation)
  const validation = removeSubstitutionHistoryEvent(
    participation,
    participation.substitutions,
    eventId,
    contextFor(match, now),
  )
  if (!validation.valid) return { valid: false, conflict: validation.conflict }
  return finishCandidate(match, validation.events, now, validation)
}

export async function persistSubstitutionCorrection(
  match: DeepReadonly<Match>,
  eventId: string,
  correction: SubstitutionCorrection,
  store: Pick<MatchStore, 'persist'>,
  now = Date.now(),
): Promise<SubstitutionEditResult> {
  const candidate = buildSubstitutionCorrectionCandidate(match, eventId, correction, now)
  if (!candidate.valid) return candidate
  await store.persist(candidate.match)
  return candidate
}

export async function persistSubstitutionRemoval(
  match: DeepReadonly<Match>,
  eventId: string,
  store: Pick<MatchStore, 'persist'>,
  now = Date.now(),
): Promise<SubstitutionEditResult> {
  const candidate = buildSubstitutionRemovalCandidate(match, eventId, now)
  if (!candidate.valid) return candidate
  await store.persist(candidate.match)
  return candidate
}

export function parseElapsedTimeInput(value: string): number | null {
  const match = /^(\d+):([0-5]\d)$/.exec(value.trim())
  if (!match) return null
  const minutes = Number(match[1])
  const seconds = Number(match[2])
  const elapsedMs = (minutes * 60 + seconds) * 1000
  return Number.isSafeInteger(elapsedMs) ? elapsedMs : null
}

export function formatElapsedTimeInput(elapsedMs: number): string {
  const safeElapsedMs = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0
  const totalSeconds = Math.floor(safeElapsedMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
