import type {
  CompletedPeriodElapsedMs,
  ClockState,
  MatchParticipation,
  MatchPeriod,
  SubstitutionEvent,
} from './match'

export interface ParticipationReplayContext {
  clock: ClockState
  currentElapsedMs: number
  completedPeriodElapsedMs: CompletedPeriodElapsedMs
}

export interface ParticipationConflict {
  eventId: string | null
  reason: string
}

export interface SubstitutionReplayStep {
  event: SubstitutionEvent
  pitchBefore: string[]
  benchBefore: string[]
  pitchAfter: string[]
  benchAfter: string[]
}

export type SubstitutionReplayResult =
  | {
    valid: true
    initialLineup: string[]
    steps: SubstitutionReplayStep[]
    finalLineup: string[]
    finalBench: string[]
  }
  | {
    valid: false
    conflict: ParticipationConflict
    initialLineup: string[]
    steps: SubstitutionReplayStep[]
  }

export interface PlayerMatchTime {
  playerId: string
  elapsedMs: number
  appearance: boolean
  onPitch: boolean
  liveContribution: boolean
}

export type ParticipationPlayingTimeResult =
  | {
    valid: true
    replay: Extract<SubstitutionReplayResult, { valid: true }>
    playerTimes: PlayerMatchTime[]
    lineup: string[]
    bench: string[]
    lineupStatus: 'planned' | 'current' | 'final'
  }
  | {
    valid: false
    conflict: ParticipationConflict
  }

export type SubstitutionCorrection = Partial<Pick<
  SubstitutionEvent,
  'outgoingPlayerId' | 'incomingPlayerId' | 'period' | 'elapsedMs'
>>

export type SubstitutionHistoryCandidateResult =
  | {
    valid: true
    events: SubstitutionEvent[]
    replay: Extract<SubstitutionReplayResult, { valid: true }>
    playingTime: Extract<ParticipationPlayingTimeResult, { valid: true }>
  }
  | {
    valid: false
    conflict: ParticipationConflict
  }

function conflict(error: string, eventId: string | null = null): ParticipationConflict {
  return { eventId, reason: error }
}

export function validateParticipationSetup(participation: MatchParticipation): string | null {
  if (!participation || (participation.ownSide !== 'home' && participation.ownSide !== 'away')) {
    return 'Choose whether your team is playing at home or away.'
  }
  if (!Array.isArray(participation.squad) || participation.squad.length === 0) {
    return 'Add at least one player to the match squad.'
  }
  const squadIds = new Set<string>()
  for (const player of participation.squad) {
    if (!player || typeof player.playerId !== 'string' || !player.playerId.trim()) {
      return 'Every squad player must have a valid player identity.'
    }
    if (squadIds.has(player.playerId)) return 'A player can appear only once in the match squad.'
    if (typeof player.nameSnapshot !== 'string' || !player.nameSnapshot.trim()) {
      return 'Every squad player must have a saved display name.'
    }
    squadIds.add(player.playerId)
  }
  if (!Array.isArray(participation.starterIds) || participation.starterIds.length === 0) {
    return 'Choose at least one starting player.'
  }
  const starterIds = new Set<string>()
  for (const starterId of participation.starterIds) {
    if (typeof starterId !== 'string' || !starterId.trim() || !squadIds.has(starterId)) {
      return 'Every starting player must belong to the match squad.'
    }
    if (starterIds.has(starterId)) return 'A player can start only once.'
    starterIds.add(starterId)
  }
  return null
}

function maximumEventElapsedMs(
  period: MatchPeriod,
  context: ParticipationReplayContext,
): { maximum: number } | { error: string } {
  const { clock, completedPeriodElapsedMs } = context
  if (clock.period === period) {
    if (clock.status === 'not-started') return { error: 'Substitutions cannot be recorded before kickoff.' }
    const currentElapsedMs = context.currentElapsedMs
    const completed = completedPeriodElapsedMs[period]
    if (clock.status === 'full-time' || (clock.status === 'halftime' && period === 1)) {
      return { maximum: completed ?? currentElapsedMs }
    }
    return { maximum: currentElapsedMs }
  }

  const completed = completedPeriodElapsedMs[period]
  if (completed !== null) return { maximum: completed }
  if (clock.period === 1 && clock.status === 'halftime' && period === 2) return { maximum: 0 }
  if (period < clock.period) return { error: `The completed duration of period ${period} is unknown.` }
  return { error: `Period ${period} has not started.` }
}

export function replaySubstitutions(
  participation: MatchParticipation,
  events: readonly SubstitutionEvent[],
  context: ParticipationReplayContext,
): SubstitutionReplayResult {
  const setupError = validateParticipationSetup(participation)
  if (setupError) {
    return { valid: false, conflict: conflict(setupError), initialLineup: [], steps: [] }
  }
  if (!Number.isFinite(context.currentElapsedMs) || context.currentElapsedMs < 0) {
    return {
      valid: false,
      conflict: conflict('The current match time must be a finite, nonnegative duration.'),
      initialLineup: [...participation.starterIds],
      steps: [],
    }
  }

  const squadIds = participation.squad.map((player) => player.playerId)
  const initialLineup = [...participation.starterIds]
  const onPitch = new Set(initialLineup)
  const squad = new Set(squadIds)
  const steps: SubstitutionReplayStep[] = []
  const eventIds = new Set<string>()
  const sequences = new Set<number>()

  const orderedEvents = [...events].sort((left, right) =>
    left.period - right.period || left.elapsedMs - right.elapsedMs || left.sequence - right.sequence,
  )

  for (const event of orderedEvents) {
    const eventId = typeof event?.id === 'string' ? event.id : null
    if (!eventId?.trim()) {
      return { valid: false, conflict: conflict('Every substitution must have an event identity.', eventId), initialLineup, steps }
    }
    if (eventIds.has(eventId)) {
      return { valid: false, conflict: conflict('Substitution event identities must be unique.', eventId), initialLineup, steps }
    }
    eventIds.add(eventId)
    if (event.period !== 1 && event.period !== 2) {
      return { valid: false, conflict: conflict('Choose a valid half for the substitution.', eventId), initialLineup, steps }
    }
    if (typeof event.elapsedMs !== 'number' || !Number.isFinite(event.elapsedMs) || event.elapsedMs < 0) {
      return { valid: false, conflict: conflict('Substitution time must be a finite, nonnegative duration.', eventId), initialLineup, steps }
    }
    if (typeof event.sequence !== 'number' || !Number.isInteger(event.sequence) || event.sequence < 0) {
      return { valid: false, conflict: conflict('Substitution order must be a nonnegative integer.', eventId), initialLineup, steps }
    }
    if (sequences.has(event.sequence)) {
      return { valid: false, conflict: conflict('Substitution order values must be unique.', eventId), initialLineup, steps }
    }
    sequences.add(event.sequence)
    if (!Number.isFinite(event.createdAt)) {
      return { valid: false, conflict: conflict('Substitution creation time must be a finite timestamp.', eventId), initialLineup, steps }
    }
    if (typeof event.outgoingPlayerId !== 'string' || typeof event.incomingPlayerId !== 'string'
      || !squad.has(event.outgoingPlayerId) || !squad.has(event.incomingPlayerId)) {
      return { valid: false, conflict: conflict('Both substitution players must belong to the saved match squad.', eventId), initialLineup, steps }
    }
    if (event.outgoingPlayerId === event.incomingPlayerId) {
      return { valid: false, conflict: conflict('Choose different players for the OFF and ON roles.', eventId), initialLineup, steps }
    }

    const bound = maximumEventElapsedMs(event.period, context)
    if ('error' in bound) {
      return { valid: false, conflict: conflict(bound.error, eventId), initialLineup, steps }
    }
    if (event.elapsedMs > bound.maximum) {
      return {
        valid: false,
        conflict: conflict(`Substitution time exceeds the recorded elapsed time for period ${event.period}.`, eventId),
        initialLineup,
        steps,
      }
    }

    if (!onPitch.has(event.outgoingPlayerId)) {
      return { valid: false, conflict: conflict('The OFF player is not on the pitch at this point in the match.', eventId), initialLineup, steps }
    }
    if (onPitch.has(event.incomingPlayerId)) {
      return { valid: false, conflict: conflict('The ON player is already on the pitch at this point in the match.', eventId), initialLineup, steps }
    }

    const pitchBefore = [...onPitch]
    const benchBefore = squadIds.filter((playerId) => !onPitch.has(playerId))
    onPitch.delete(event.outgoingPlayerId)
    onPitch.add(event.incomingPlayerId)
    steps.push({
      event: { ...event },
      pitchBefore,
      benchBefore,
      pitchAfter: [...onPitch],
      benchAfter: squadIds.filter((playerId) => !onPitch.has(playerId)),
    })
  }

  return {
    valid: true,
    initialLineup,
    steps,
    finalLineup: [...onPitch],
    finalBench: squadIds.filter((playerId) => !onPitch.has(playerId)),
  }
}

function periodEndpoint(
  period: MatchPeriod,
  context: ParticipationReplayContext,
): number | null {
  const recorded = context.completedPeriodElapsedMs[period]
  if (recorded !== null) return recorded

  const { clock } = context
  if (clock.period === period) {
    if (clock.status === 'not-started') return 0
    if (clock.status === 'running' || clock.status === 'paused'
      || clock.status === 'halftime' || clock.status === 'full-time') {
      return context.currentElapsedMs
    }
  }
  if (clock.period === 1 && period === 2 && clock.status === 'halftime') return 0
  if (period > clock.period) return 0
  return null
}

function addInterval(
  totals: Map<string, number>,
  pitch: readonly string[],
  durationMs: number,
): void {
  if (durationMs <= 0) return
  for (const playerId of pitch) totals.set(playerId, (totals.get(playerId) ?? 0) + durationMs)
}

/**
 * Replays the same ordered history used for lineup validation, then sums every
 * on-pitch interval in milliseconds. Period endpoints are actual elapsed
 * durations; the half-time break never appears on either period's timeline.
 */
export function calculateParticipationPlayingTime(
  participation: MatchParticipation,
  events: readonly SubstitutionEvent[],
  context: ParticipationReplayContext,
): ParticipationPlayingTimeResult {
  const replay = replaySubstitutions(participation, events, context)
  if (!replay.valid) return { valid: false, conflict: replay.conflict }

  const endpoints: Record<MatchPeriod, number | null> = {
    1: periodEndpoint(1, context),
    2: periodEndpoint(2, context),
  }
  const totals = new Map(participation.squad.map((player) => [player.playerId, 0]))
  let lineup = [...replay.initialLineup]

  for (const period of [1, 2] as const) {
    const endpoint = endpoints[period]
    if (endpoint === null) {
      return {
        valid: false,
        conflict: conflict(`The completed duration of period ${period} is unknown.`),
      }
    }

    const periodSteps = replay.steps.filter((step) => step.event.period === period)
    let elapsedCursor = 0
    for (const step of periodSteps) {
      const eventElapsedMs = step.event.elapsedMs
      if (eventElapsedMs < elapsedCursor) {
        return {
          valid: false,
          conflict: conflict('Substitution events are not in chronological order.', step.event.id),
        }
      }
      addInterval(totals, lineup, eventElapsedMs - elapsedCursor)
      elapsedCursor = eventElapsedMs
      lineup = [...step.pitchAfter]
    }
    if (endpoint < elapsedCursor) {
      const lastEvent = periodSteps.at(-1)
      return {
        valid: false,
        conflict: conflict(`Substitution time exceeds the recorded elapsed time for period ${period}.`, lastEvent?.event.id ?? null),
      }
    }
    addInterval(totals, lineup, endpoint - elapsedCursor)
  }

  const active = context.clock.status !== 'not-started' && context.clock.status !== 'full-time'
  const lineupStatus = context.clock.status === 'not-started'
    ? 'planned'
    : context.clock.status === 'full-time' ? 'final' : 'current'
  const onPitch = new Set(replay.finalLineup)
  const playerTimes = participation.squad.map(({ playerId }) => {
    const elapsedMs = totals.get(playerId) ?? 0
    const currentlyOnPitch = onPitch.has(playerId)
    return {
      playerId,
      elapsedMs,
      appearance: elapsedMs > 0,
      onPitch: currentlyOnPitch,
      liveContribution: active && (elapsedMs > 0 || currentlyOnPitch),
    }
  })

  return {
    valid: true,
    replay,
    playerTimes,
    lineup: [...replay.finalLineup],
    bench: [...replay.finalBench],
    lineupStatus,
  }
}

/** Validate a complete candidate history and calculate its derived state. */
export function validateSubstitutionHistoryCandidate(
  participation: MatchParticipation,
  candidateEvents: readonly SubstitutionEvent[],
  context: ParticipationReplayContext,
): SubstitutionHistoryCandidateResult {
  const events = candidateEvents.map((event) => ({ ...event }))
  const playingTime = calculateParticipationPlayingTime(participation, events, context)
  if (!playingTime.valid) return { valid: false, conflict: playingTime.conflict }
  return {
    valid: true,
    events,
    replay: playingTime.replay,
    playingTime,
  }
}

/** Apply a correction to a detached copy, saving nothing unless all events replay. */
export function correctSubstitutionHistory(
  participation: MatchParticipation,
  events: readonly SubstitutionEvent[],
  eventId: string,
  correction: SubstitutionCorrection,
  context: ParticipationReplayContext,
): SubstitutionHistoryCandidateResult {
  const index = events.findIndex((event) => event.id === eventId)
  if (index < 0) {
    return { valid: false, conflict: conflict('The substitution to correct no longer exists.', eventId) }
  }
  const candidate = events.map((event, eventIndex) => eventIndex === index
    ? { ...event, ...correction }
    : { ...event })
  return validateSubstitutionHistoryCandidate(participation, candidate, context)
}

/** Remove an event only when the remaining full history is still consistent. */
export function removeSubstitutionHistoryEvent(
  participation: MatchParticipation,
  events: readonly SubstitutionEvent[],
  eventId: string,
  context: ParticipationReplayContext,
): SubstitutionHistoryCandidateResult {
  if (!events.some((event) => event.id === eventId)) {
    return { valid: false, conflict: conflict('The substitution to remove no longer exists.', eventId) }
  }
  return validateSubstitutionHistoryCandidate(
    participation,
    events.filter((event) => event.id !== eventId),
    context,
  )
}

/** Format a summed elapsed duration as total minutes and whole seconds. */
export function formatPlayingTime(elapsedMs: number): string {
  const safeElapsedMs = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0
  const totalSeconds = Math.floor(safeElapsedMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
