export type MatchPeriod = 1 | 2

export type MatchStatus = 'not-started' | 'running' | 'paused' | 'halftime' | 'full-time'

export type MatchSide = 'home' | 'away'

export interface MatchSquadPlayer {
  playerId: string
  nameSnapshot: string
}

export interface SubstitutionEvent {
  id: string
  outgoingPlayerId: string
  incomingPlayerId: string
  period: MatchPeriod
  elapsedMs: number
  sequence: number
  createdAt: number
}

export interface MatchParticipation {
  ownSide: MatchSide
  squad: MatchSquadPlayer[]
  starterIds: string[]
  substitutions: SubstitutionEvent[]
}

export interface MatchJerseySnapshot {
  jerseyId: string
  number: number
  size: string
  ownerPlayerId: string | null
}

export interface MatchJerseyAssignmentRow {
  playerId: string
  jersey: MatchJerseySnapshot | null
}

export interface MatchJerseyAssignment {
  setId: string
  setNameSnapshot: string
  rows: MatchJerseyAssignmentRow[]
}

export type CompletedPeriodElapsedMs = Record<MatchPeriod, number | null>

export interface ClockState {
  period: MatchPeriod
  elapsedMs: number
  status: MatchStatus
  startedAt: number | null
}

export interface GoalEvent {
  id: string
  side: MatchSide
  period: MatchPeriod
  elapsedMs: number
  scorerPlayerId: string | null
  scorer: string
  assistPlayerId: string | null
  assist: string
  description: string
  createdAt: number
}

export interface MatchRecord {
  id: string
  homeTeam: string
  awayTeam: string
  createdAt: number
  updatedAt: number
  clock: ClockState
  goals: GoalEvent[]
  participation: MatchParticipation | null
  firstKickoffAt: number | null
  jerseyAssignment: MatchJerseyAssignment | null
  completedPeriodElapsedMs: CompletedPeriodElapsedMs
}

export type Match = MatchRecord

export function createMatch(
  homeTeam: string,
  awayTeam: string,
  now = Date.now(),
  id: string = crypto.randomUUID(),
): MatchRecord {
  return {
    id,
    homeTeam: homeTeam.trim(),
    awayTeam: awayTeam.trim(),
    createdAt: now,
    updatedAt: now,
    clock: {
      period: 1,
      elapsedMs: 0,
      status: 'not-started',
      startedAt: null,
    },
    goals: [],
    participation: null,
    firstKickoffAt: null,
    jerseyAssignment: null,
    completedPeriodElapsedMs: { 1: null, 2: null },
  }
}

export function scoreFor(match: { goals: readonly GoalEvent[] }): { home: number; away: number } {
  return match.goals.reduce(
    (score, goal) => {
      score[goal.side] += 1
      return score
    },
    { home: 0, away: 0 },
  )
}
