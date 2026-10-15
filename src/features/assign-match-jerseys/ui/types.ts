import type { MatchJerseySnapshot } from '../../../entities/match'

export interface JerseyAssignmentRowView {
  playerId: string
  nameSnapshot: string
  playerSize: string | null
  jerseyId: string | null
  jerseySnapshot: MatchJerseySnapshot | null
  error: string | null
}

export interface JerseyAssignmentOptionView {
  id: string
  label: string
  ownerLabel: string
}

export interface PlayerIdentityInput {
  id: string
  name: string
}
