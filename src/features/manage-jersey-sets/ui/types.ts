export interface JerseyDraft {
  number: string
  size: string
  ownerPlayerId: string
}

export interface PlayerOwnerChoice {
  id: string
  label: string
}

export interface UnresolvedOwnerChoice extends PlayerOwnerChoice {}
