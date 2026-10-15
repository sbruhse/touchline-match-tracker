import { computed, readonly, ref, watch, type DeepReadonly } from 'vue'
import type { JerseySetStore, ReadonlyJerseySet } from '../../../entities/jersey-set'
import {
  copyMatchSnapshot,
  resolveHistoricalJerseyNumbers,
  validateMatchJerseyAssignment,
} from '../../../entities/match'
import type {
  Match,
  MatchJerseyAssignment,
  MatchJerseySnapshot,
  MatchStore,
} from '../../../entities/match'
import type { PlayerStore, ReadonlyPlayer } from '../../../entities/player'
import { allocateJerseyProposal } from './allocateJerseyProposal'

export interface MatchJerseyDraftRow {
  playerId: string
  jerseyId: string | null
  jerseySnapshot: MatchJerseySnapshot | null
  error: string | null
}

export interface MatchJerseyDraft {
  setId: string | null
  setNameSnapshot: string | null
  rows: MatchJerseyDraftRow[]
}

export interface MatchJerseyDraftSources {
  matchStore: Pick<MatchStore, 'matches' | 'ready' | 'loading' | 'saving' | 'load' | 'persist'>
  playerStore: Pick<PlayerStore, 'players' | 'ready' | 'loading' | 'saving' | 'load'>
  jerseySetStore: Pick<JerseySetStore, 'sets' | 'ready' | 'loading' | 'saving' | 'load'>
  random?: () => number
  now?: () => number
}

function editableBeforeKickoff(match: DeepReadonly<Match>): boolean {
  return match.clock.period === 1 && match.clock.status === 'not-started'
}

function snapshotFromLiveJersey(jersey: {
  id: string
  number: number
  size: string
  ownerPlayerId: string | null
}): MatchJerseySnapshot {
  return {
    jerseyId: jersey.id,
    number: jersey.number,
    size: jersey.size,
    ownerPlayerId: jersey.ownerPlayerId,
  }
}

function emptyRows(match: DeepReadonly<Match>): MatchJerseyDraftRow[] {
  return (match.participation?.squad ?? []).map(({ playerId }) => ({
    playerId,
    jerseyId: null,
    jerseySnapshot: null,
    error: 'No jersey assigned.',
  }))
}

function draftFromMatch(match: DeepReadonly<Match>): MatchJerseyDraft {
  const saved = match.jerseyAssignment
  if (!saved) return { setId: null, setNameSnapshot: null, rows: emptyRows(match) }
  return {
    setId: saved.setId,
    setNameSnapshot: saved.setNameSnapshot,
    rows: saved.rows.map((row) => ({
      playerId: row.playerId,
      jerseyId: row.jersey?.jerseyId ?? null,
      jerseySnapshot: row.jersey ? { ...row.jersey } : null,
      error: row.jersey ? null : 'No jersey assigned.',
    })),
  }
}

function getPlayerSize(players: readonly DeepReadonly<ReadonlyPlayer>[], playerId: string): string | null {
  return players.find((player) => player.id === playerId)?.jerseySize ?? null
}

function findSet(sets: readonly DeepReadonly<ReadonlyJerseySet>[], setId: string): DeepReadonly<ReadonlyJerseySet> | undefined {
  return sets.find((set) => set.id === setId)
}

export function useMatchJerseyDraft(matchId: string, sources: MatchJerseyDraftSources) {
  const draft = ref<MatchJerseyDraft | null>(null)
  const message = ref<string | null>(null)
  const announcement = ref('')
  const match = computed(() => sources.matchStore.matches.value.find((item) => item.id === matchId) ?? null)
  const isOpen = computed(() => draft.value !== null)
  const isEditable = computed(() => Boolean(match.value && editableBeforeKickoff(match.value)))

  watch(
    () => JSON.stringify(match.value?.participation?.squad.map(({ playerId }) => playerId) ?? null),
    () => {
      if (!draft.value || !match.value) return
      const currentSquad = match.value.participation?.squad ?? []
      const existingRows = new Map(draft.value.rows.map((row) => [row.playerId, row]))
      draft.value = {
        ...draft.value,
        rows: currentSquad.map(({ playerId }) => existingRows.get(playerId)
          ? { ...existingRows.get(playerId)! }
          : { playerId, jerseyId: null, jerseySnapshot: null, error: 'No jersey assigned.' }),
      }
      message.value = 'The saved match squad changed. The draft rows were updated; generate a new proposal only if you choose to.'
      announcement.value = 'Match squad changed. Jersey rows were reconciled without generating a new proposal.'
    },
    { flush: 'sync' },
  )

  function requireMatch(): DeepReadonly<Match> | null {
    if (!sources.matchStore.ready.value || sources.matchStore.loading.value) {
      message.value = 'Match data is unavailable. Retry loading matches before preparing jerseys.'
      return null
    }
    if (sources.matchStore.saving.value) {
      message.value = 'Wait for the current match save to finish before changing jersey assignments.'
      return null
    }
    if (!match.value) {
      message.value = 'This match is no longer available.'
      return null
    }
    if (!editableBeforeKickoff(match.value)) {
      message.value = 'Jersey assignments can only be prepared before kickoff.'
      return null
    }
    if (!match.value.participation) {
      message.value = 'Save a match squad before preparing jerseys.'
      return null
    }
    return match.value
  }

  function open(): boolean {
    message.value = null
    const current = requireMatch()
    if (!current) return false
    draft.value = draftFromMatch(current)
    announcement.value = 'Jersey preparation opened.'
    return true
  }

  function reset(): boolean {
    return open()
  }

  function selectSet(setId: string): boolean {
    const current = requireMatch()
    if (!current || !draft.value) return false
    if (!sources.jerseySetStore.ready.value || sources.jerseySetStore.loading.value) {
      message.value = 'Jersey inventory is unavailable. Retry loading the inventory before selecting a set.'
      return false
    }
    if (sources.jerseySetStore.saving.value) {
      message.value = 'Wait for the current inventory save to finish before selecting a set.'
      return false
    }
    const set = findSet(sources.jerseySetStore.sets.value, setId)
    if (!set) {
      message.value = 'That jersey set is no longer available. Refresh the inventory and choose another set.'
      return false
    }
    draft.value = {
      setId: set.id,
      setNameSnapshot: set.name,
      rows: emptyRows(current),
    }
    message.value = null
    announcement.value = `${set.name} selected. All match squad rows are unassigned.`
    return true
  }

  function generate(seed?: string | number): boolean {
    const current = requireMatch()
    if (!current || !draft.value) return false
    if (!sources.playerStore.ready.value || sources.playerStore.loading.value) {
      message.value = 'Player sizes are unavailable. Retry loading the player directory before generating a proposal.'
      return false
    }
    if (!sources.jerseySetStore.ready.value || sources.jerseySetStore.loading.value) {
      message.value = 'Jersey inventory is unavailable. Retry loading the inventory before generating a proposal.'
      return false
    }
    if (sources.playerStore.saving.value || sources.jerseySetStore.saving.value) {
      message.value = 'Wait for player or inventory changes to finish saving before generating a proposal.'
      return false
    }
    if (!draft.value.setId) {
      message.value = 'Choose a jersey set before generating a proposal.'
      return false
    }
    const set = findSet(sources.jerseySetStore.sets.value, draft.value.setId)
    if (!set) {
      message.value = 'The selected jersey set is no longer available. Choose another set.'
      return false
    }

    const history = resolveHistoricalJerseyNumbers(
      sources.matchStore.matches.value,
      current.id,
      set.id,
    )
    const players = current.participation!.squad.map(({ playerId }) => ({
      id: playerId,
      size: getPlayerSize(sources.playerStore.players.value, playerId),
    }))
    const allocatorOptions = seed !== undefined
      ? { historicalNumbers: history, seed }
      : sources.random ? { historicalNumbers: history, random: sources.random } : { historicalNumbers: history }
    const proposal = allocateJerseyProposal(players, set.jerseys, allocatorOptions)
    const jerseyById = new Map(set.jerseys.map((jersey) => [jersey.id, jersey]))
    draft.value = {
      setId: set.id,
      setNameSnapshot: set.name,
      rows: proposal.map((row) => {
        const jersey = row.jerseyId ? jerseyById.get(row.jerseyId) : null
        return {
          playerId: row.playerId,
          jerseyId: row.jerseyId,
          jerseySnapshot: jersey ? snapshotFromLiveJersey(jersey) : null,
          error: row.error,
        }
      }),
    }
    message.value = null
    const unassignedCount = proposal.filter(({ jerseyId }) => jerseyId === null).length
    announcement.value = unassignedCount === 0
      ? 'Jersey proposal generated for the full match squad.'
      : `Jersey proposal generated. ${unassignedCount} ${unassignedCount === 1 ? 'player remains' : 'players remain'} unassigned.`
    return true
  }

  function selectJersey(playerId: string, jerseyId: string | null): boolean {
    const current = requireMatch()
    if (!current || !draft.value) return false
    if (!draft.value.setId) {
      message.value = 'Choose a jersey set before assigning an item.'
      return false
    }
    if (!sources.jerseySetStore.ready.value || sources.jerseySetStore.loading.value) {
      message.value = 'Jersey inventory is unavailable. Retry loading the inventory before editing assignments.'
      return false
    }
    if (sources.jerseySetStore.saving.value) {
      message.value = 'Wait for the current inventory save to finish before editing assignments.'
      return false
    }
    const rowIndex = draft.value.rows.findIndex((row) => row.playerId === playerId)
    if (rowIndex < 0) {
      message.value = 'This player is no longer in the saved match squad.'
      return false
    }
    if (jerseyId === null) {
      draft.value = {
        ...draft.value,
        rows: draft.value.rows.map((row) => row.playerId === playerId
          ? { ...row, jerseyId: null, jerseySnapshot: null, error: 'No jersey assigned.' }
          : row),
      }
      message.value = null
      return true
    }

    const set = findSet(sources.jerseySetStore.sets.value, draft.value.setId)
    const jersey = set?.jerseys.find((item) => item.id === jerseyId)
    if (!jersey) {
      message.value = 'That jersey is no longer available in the selected set. Refresh the inventory and choose again.'
      return false
    }
    const conflict = draft.value.rows.find((row) => row.playerId !== playerId
      && row.jerseySnapshot?.number === jersey.number)
    if (conflict) {
      const wearer = current.participation?.squad.find(({ playerId: id }) => id === conflict.playerId)
      const playerName = wearer?.nameSnapshot ?? conflict.playerId
      const error = `Number ${jersey.number} is already assigned to ${playerName}.`
      draft.value = {
        ...draft.value,
        rows: draft.value.rows.map((row) => row.playerId === playerId ? { ...row, error } : row),
      }
      message.value = error
      announcement.value = error
      return false
    }

    draft.value = {
      ...draft.value,
      rows: draft.value.rows.map((row) => row.playerId === playerId
        ? { ...row, jerseyId, jerseySnapshot: snapshotFromLiveJersey(jersey), error: null }
        : row),
    }
    message.value = null
    return true
  }

  async function accept(): Promise<boolean> {
    const current = requireMatch()
    if (!current || !draft.value) return false
    if (!sources.jerseySetStore.ready.value || sources.jerseySetStore.loading.value) {
      message.value = 'Jersey inventory is unavailable. Retry loading the inventory before accepting this distribution.'
      return false
    }
    if (sources.jerseySetStore.saving.value) {
      message.value = 'Wait for the current inventory save to finish before accepting jersey assignments.'
      return false
    }
    if (!draft.value.setId || !draft.value.setNameSnapshot) {
      message.value = 'Choose a jersey set before accepting assignments.'
      return false
    }
    const set = findSet(sources.jerseySetStore.sets.value, draft.value.setId)
    if (!set) {
      message.value = 'The selected jersey set was removed. Refresh the inventory and choose a set again.'
      return false
    }
    if (set.name !== draft.value.setNameSnapshot) {
      message.value = 'The selected jersey set changed while you were reviewing. Refresh the set and review the draft again.'
      return false
    }

    const squadIds = current.participation!.squad.map(({ playerId }) => playerId)
    const draftIds = draft.value.rows.map(({ playerId }) => playerId)
    if (new Set(draftIds).size !== draftIds.length || draftIds.length !== squadIds.length
      || squadIds.some((playerId) => !draftIds.includes(playerId))) {
      message.value = 'The saved match squad changed while you were reviewing. Refresh the draft before accepting.'
      return false
    }

    const stockById = new Map(set.jerseys.map((jersey) => [jersey.id, jersey]))
    const rows = []
    for (const row of draft.value.rows) {
      if (row.jerseyId === null) {
        if (row.jerseySnapshot !== null) {
          message.value = 'A selected jersey changed in the draft. Refresh the inventory and review the row again.'
          return false
        }
        rows.push({ playerId: row.playerId, jersey: null })
        continue
      }
      const jersey = stockById.get(row.jerseyId)
      const displayed = row.jerseySnapshot
      if (!jersey || !displayed) {
        message.value = 'A selected jersey was removed from the set. Refresh the inventory and correct the draft.'
        return false
      }
      if (displayed.jerseyId !== jersey.id || displayed.number !== jersey.number
        || displayed.size !== jersey.size || displayed.ownerPlayerId !== jersey.ownerPlayerId) {
        message.value = 'A selected jersey’s number, size, or owner changed during review. Refresh the inventory and review the row again.'
        return false
      }
      rows.push({
        playerId: row.playerId,
        jersey: {
          jerseyId: jersey.id,
          number: jersey.number,
          size: jersey.size,
          ownerPlayerId: jersey.ownerPlayerId,
        },
      })
    }

    const assignment: MatchJerseyAssignment = {
      setId: set.id,
      setNameSnapshot: set.name,
      rows,
    }
    const validationError = validateMatchJerseyAssignment(current.participation, assignment)
    if (validationError) {
      message.value = validationError
      return false
    }

    const candidate = copyMatchSnapshot(current)
    candidate.updatedAt = sources.now?.() ?? Date.now()
    candidate.jerseyAssignment = assignment
    try {
      await sources.matchStore.persist(candidate)
    } catch (error) {
      const detail = error instanceof Error ? ` ${error.message}` : ''
      message.value = `Could not save jersey assignments.${detail} The draft is unchanged; retry to save it again.`
      announcement.value = message.value
      return false
    }

    draft.value = null
    message.value = null
    announcement.value = 'Jersey assignments saved for this match.'
    return true
  }

  async function retryData(): Promise<boolean> {
    const requiredLoads: Array<{ label: string; load: () => Promise<void> }> = []
    if (!sources.matchStore.ready.value) {
      if (sources.matchStore.loading.value || sources.matchStore.saving.value) {
        message.value = 'Match data is still changing. Wait for it to finish before retrying.'
        return false
      }
      requiredLoads.push({ label: 'match', load: sources.matchStore.load })
    }
    if (!sources.playerStore.ready.value) {
      if (sources.playerStore.loading.value || sources.playerStore.saving.value) {
        message.value = 'Player data is still changing. Wait for it to finish before retrying.'
        return false
      }
      requiredLoads.push({ label: 'player directory', load: sources.playerStore.load })
    }
    if (!sources.jerseySetStore.ready.value) {
      if (sources.jerseySetStore.loading.value || sources.jerseySetStore.saving.value) {
        message.value = 'Jersey inventory is still changing. Wait for it to finish before retrying.'
        return false
      }
      requiredLoads.push({ label: 'jersey inventory', load: sources.jerseySetStore.load })
    }

    if (requiredLoads.length === 0) {
      message.value = null
      return true
    }
    const results = await Promise.allSettled(requiredLoads.map(({ load }) => load()))
    const failed = results.flatMap((result, index) => result.status === 'rejected'
      ? [requiredLoads[index].label]
      : [])
    if (failed.length > 0) {
      message.value = `Could not load ${failed.join(' and ')}. Retry before generating a proposal.`
      announcement.value = message.value
      return false
    }
    message.value = null
    announcement.value = 'Match, player, and jersey data loaded. You can continue preparing the draft.'
    return true
  }

  function cancel(): void {
    draft.value = null
    message.value = null
    announcement.value = 'Jersey draft cancelled. The saved distribution is unchanged.'
  }

  return {
    draft: readonly(draft),
    message: readonly(message),
    announcement: readonly(announcement),
    match,
    isOpen,
    isEditable,
    open,
    reset,
    selectSet,
    generate,
    selectJersey,
    accept,
    retryData,
    cancel,
  }
}
