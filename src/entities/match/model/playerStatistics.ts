import type { DeepReadonly } from 'vue'
import { getElapsedMs } from './clock'
import type { Match, MatchParticipation, MatchStatus } from './match'
import { calculateParticipationPlayingTime } from './participation'

export interface PlayerMatchBreakdown {
  matchId: string
  opponent: string
  ownSide: MatchParticipation['ownSide']
  date: number
  status: MatchStatus
  elapsedMs: number
  appearance: boolean
  liveContribution: boolean
}

export type ExcludedMatchReason = 'untracked' | 'not-started' | 'not-in-squad' | 'invalid-history'

export interface ExcludedPlayerMatch {
  matchId: string
  reason: ExcludedMatchReason
  detail?: string
}

export interface PlayerParticipationStatistics {
  playerId: string
  totalElapsedMs: number
  appearanceCount: number
  breakdowns: PlayerMatchBreakdown[]
  excludedMatches: ExcludedPlayerMatch[]
}

function participationSnapshot(participation: DeepReadonly<MatchParticipation>): MatchParticipation {
  return {
    ownSide: participation.ownSide,
    squad: participation.squad.map((player) => ({ ...player })),
    starterIds: [...participation.starterIds],
    substitutions: participation.substitutions.map((event) => ({ ...event })),
  }
}

/** Aggregate one stable player identity across saved matches without directory dependencies. */
export function aggregatePlayerParticipation(
  matches: readonly DeepReadonly<Match>[],
  playerId: string,
  now = Date.now(),
): PlayerParticipationStatistics {
  const breakdowns: PlayerMatchBreakdown[] = []
  const excludedMatches: ExcludedPlayerMatch[] = []

  for (const match of matches) {
    const participation = match.participation
    if (!participation) {
      excludedMatches.push({ matchId: match.id, reason: 'untracked' })
      continue
    }
    if (match.clock.status === 'not-started') {
      excludedMatches.push({ matchId: match.id, reason: 'not-started' })
      continue
    }
    const playerSnapshot = participation.squad.find((player) => player.playerId === playerId)
    if (!playerSnapshot) {
      excludedMatches.push({ matchId: match.id, reason: 'not-in-squad' })
      continue
    }

    const calculation = calculateParticipationPlayingTime(
      participationSnapshot(participation),
      participation.substitutions,
      {
        clock: match.clock,
        currentElapsedMs: getElapsedMs(match.clock, now),
        completedPeriodElapsedMs: match.completedPeriodElapsedMs,
      },
    )
    if (!calculation.valid) {
      excludedMatches.push({
        matchId: match.id,
        reason: 'invalid-history',
        detail: calculation.conflict.reason,
      })
      continue
    }

    const playerTime = calculation.playerTimes.find((time) => time.playerId === playerId)
    if (!playerTime) {
      excludedMatches.push({ matchId: match.id, reason: 'not-in-squad' })
      continue
    }
    breakdowns.push({
      matchId: match.id,
      opponent: participation.ownSide === 'home' ? match.awayTeam : match.homeTeam,
      ownSide: participation.ownSide,
      date: match.createdAt,
      status: match.clock.status,
      elapsedMs: playerTime.elapsedMs,
      appearance: playerTime.appearance,
      liveContribution: playerTime.liveContribution,
    })
  }

  breakdowns.sort((left, right) => right.date - left.date || left.matchId.localeCompare(right.matchId))
  excludedMatches.sort((left, right) => {
    const leftMatch = matches.find((match) => match.id === left.matchId)
    const rightMatch = matches.find((match) => match.id === right.matchId)
    return (rightMatch?.createdAt ?? 0) - (leftMatch?.createdAt ?? 0)
      || left.matchId.localeCompare(right.matchId)
  })

  return {
    playerId,
    totalElapsedMs: breakdowns.reduce((total, breakdown) => total + breakdown.elapsedMs, 0),
    appearanceCount: breakdowns.filter((breakdown) => breakdown.appearance).length,
    breakdowns,
    excludedMatches,
  }
}
