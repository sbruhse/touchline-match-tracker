import type { DeepReadonly } from 'vue'
import {
  validateParticipationSetup,
  type Match,
  type MatchParticipation,
  type MatchSide,
  type MatchStore,
  copyMatchSnapshot,
  reconcileGoalAttributions,
  reconcileMatchJerseyAssignment,
  validateMatchJerseyAssignment,
} from '../../../entities/match'
import type { ReadonlyPlayer } from '../../../entities/player'

export interface MatchSquadDraft {
  ownSide: MatchSide | ''
  squadPlayerIds: string[]
  starterIds: string[]
}

export interface MatchSquadPlayerChoice {
  id: string
  name: string
  label: string
  archived: boolean
}

export type BuildMatchParticipationResult =
  | { valid: true; participation: MatchParticipation }
  | { valid: false; error: string }

export function buildMatchParticipation(
  draft: MatchSquadDraft,
  directoryPlayers: readonly ReadonlyPlayer[],
  previous: DeepReadonly<MatchParticipation> | null,
): BuildMatchParticipationResult {
  if (draft.ownSide !== 'home' && draft.ownSide !== 'away') {
    return { valid: false, error: 'Choose whether your team is playing at home or away.' }
  }
  if (!Array.isArray(draft.squadPlayerIds) || draft.squadPlayerIds.length === 0) {
    return { valid: false, error: 'Select at least one player for the match squad.' }
  }
  if (new Set(draft.squadPlayerIds).size !== draft.squadPlayerIds.length) {
    return { valid: false, error: 'A player can appear only once in the match squad.' }
  }

  const directoryById = new Map(directoryPlayers.map((player) => [player.id, player]))
  const previousById = new Map(previous?.squad.map((player) => [player.playerId, player]) ?? [])
  const squad = []
  for (const playerId of draft.squadPlayerIds) {
    const previousSnapshot = previousById.get(playerId)
    const directoryPlayer = directoryById.get(playerId)
    if (!previousSnapshot && (!directoryPlayer || directoryPlayer.archived)) {
      return { valid: false, error: 'Choose an active directory player for each new squad place.' }
    }
    squad.push({
      playerId,
      nameSnapshot: previousSnapshot?.nameSnapshot ?? directoryPlayer!.name,
    })
  }

  const participation: MatchParticipation = {
    ownSide: draft.ownSide,
    squad,
    starterIds: [...draft.starterIds],
    substitutions: previous?.substitutions.map((event) => ({ ...event })) ?? [],
  }
  const validationError = validateParticipationSetup(participation)
  if (validationError) return { valid: false, error: validationError }
  return { valid: true, participation }
}

function editableBeforeKickoff(match: DeepReadonly<Match>): boolean {
  return match.clock.period === 1 && match.clock.status === 'not-started'
}

function matchSnapshotWithParticipation(
  match: DeepReadonly<Match>,
  participation: MatchParticipation | null,
  now: number,
): Match {
  const snapshot = copyMatchSnapshot(match)
  snapshot.updatedAt = now
  snapshot.participation = participation ? {
    ownSide: participation.ownSide,
    squad: participation.squad.map((player) => ({ ...player })),
    starterIds: [...participation.starterIds],
    substitutions: participation.substitutions.map((event) => ({ ...event })),
  } : null
  snapshot.jerseyAssignment = reconcileMatchJerseyAssignment(match.jerseyAssignment, snapshot.participation)
  snapshot.goals = reconcileGoalAttributions(snapshot.goals, snapshot.participation)
  const assignmentError = validateMatchJerseyAssignment(snapshot.participation, snapshot.jerseyAssignment)
  if (assignmentError) throw new Error(assignmentError)
  return snapshot
}

export async function persistMatchParticipationSetup(
  match: DeepReadonly<Match>,
  participation: MatchParticipation,
  store: Pick<MatchStore, 'persist'>,
  now = Date.now(),
): Promise<Match> {
  if (!editableBeforeKickoff(match)) {
    throw new Error('Player tracking setup is locked after kickoff.')
  }
  const validationError = validateParticipationSetup(participation)
  if (validationError) throw new Error(validationError)
  return store.persist(matchSnapshotWithParticipation(match, participation, now))
}

export async function disableMatchParticipationSetup(
  match: DeepReadonly<Match>,
  store: Pick<MatchStore, 'persist'>,
  now = Date.now(),
): Promise<Match> {
  if (!editableBeforeKickoff(match)) {
    throw new Error('Player tracking setup is locked after kickoff.')
  }
  return store.persist(matchSnapshotWithParticipation(match, null, now))
}
