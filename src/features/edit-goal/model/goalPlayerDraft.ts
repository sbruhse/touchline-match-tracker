export type GoalPlayerDraft =
  | { mode: 'none' }
  | { mode: 'squad'; playerId: string; name: string; label: string }
  | { mode: 'manual'; name: string }

export interface GoalPlayerOption {
  playerId: string
  name: string
  label: string
}
