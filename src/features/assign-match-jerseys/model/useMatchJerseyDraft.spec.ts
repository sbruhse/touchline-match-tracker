import { effectScope } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import {
  copyMatchSnapshot,
  createMatchStore,
  createMatch,
  reconcileMatchJerseyAssignment,
  type Match,
  type MatchParticipation,
  type MatchRepository,
} from '../../../entities/match'
import {
  createJerseySetStore,
  type JerseySet,
  type JerseySetRepository,
} from '../../../entities/jersey-set'
import { createPlayerStore, type Player, type PlayerRepository } from '../../../entities/player'
import { useMatchJerseyDraft } from './useMatchJerseyDraft'

function fixtureMatch(): Match {
  const base = createMatch('North City', 'South Town', 100, 'draft-match')
  return {
    ...base,
    participation: {
      ownSide: 'home',
      squad: [
        { playerId: 'alex', nameSnapshot: 'Alex' },
        { playerId: 'ben', nameSnapshot: 'Ben' },
      ],
      starterIds: ['alex'],
      substitutions: [],
    },
    jerseyAssignment: {
      setId: 'set-blue',
      setNameSnapshot: 'Blue',
      rows: [
        { playerId: 'alex', jersey: { jerseyId: 'saved-alex', number: 90, size: 'M', ownerPlayerId: null } },
        { playerId: 'ben', jersey: { jerseyId: 'saved-ben', number: 91, size: 'M', ownerPlayerId: 'ben' } },
      ],
    },
  }
}

function player(id: string, name: string): Player {
  return {
    id,
    name,
    positions: [],
    jerseySize: 'M',
    archived: false,
    createdAt: 100,
    updatedAt: 100,
  }
}

function jerseySet(id: string, name: string, numberOffset = 0): JerseySet {
  return {
    id,
    name,
    jerseys: [
      { id: `${id}-seven`, number: 7 + numberOffset, size: 'M', ownerPlayerId: null },
      { id: `${id}-eight`, number: 8 + numberOffset, size: 'M', ownerPlayerId: null },
      { id: `${id}-zero-private`, number: 0, size: 'XL', ownerPlayerId: 'ben' },
      { id: `${id}-zero-team`, number: 0, size: '164', ownerPlayerId: null },
      { id: `${id}-manual`, number: 99 + numberOffset, size: '164', ownerPlayerId: 'ben' },
    ],
    preferredNumbers: [],
    createdAt: 100,
    updatedAt: 100,
  }
}

async function mountDraft(
  random?: () => number,
  players = [player('alex', 'Alex'), player('ben', 'Ben')],
  now?: () => number,
) {
  let records = [fixtureMatch()]
  const saveMatch = vi.fn(async (match: Match) => {
    records = [...records.filter((saved) => saved.id !== match.id), structuredClone(match)]
  })
  const matchRepository: MatchRepository = {
    listMatches: async () => structuredClone(records),
    getMatch: async (id) => records.find((match) => match.id === id),
    saveMatch,
    close: () => undefined,
  }
  const savePlayers = vi.fn(async () => undefined)
  const playerRepository: PlayerRepository = {
    listPlayers: async () => structuredClone(players),
    savePlayers,
    close: () => undefined,
  }
  const saveJerseySets = vi.fn(async () => undefined)
  const setRepository: JerseySetRepository = {
    listJerseySets: async () => [jerseySet('set-blue', 'Blue'), jerseySet('set-red', 'Red', 20)],
    saveJerseySets,
    close: () => undefined,
  }
  const matchStore = createMatchStore(matchRepository)
  const playerStore = createPlayerStore(playerRepository)
  const jerseySetStore = createJerseySetStore(setRepository)
  await Promise.all([matchStore.load(), playerStore.load(), jerseySetStore.load()])
  const scope = effectScope()
  const draft = scope.run(() => useMatchJerseyDraft('draft-match', {
    matchStore,
    playerStore,
    jerseySetStore,
    random,
    now,
  }))!
  return {
    draft,
    scope,
    matchStore,
    playerStore,
    jerseySetStore,
    saveMatch,
    savePlayers,
    saveJerseySets,
    dispose() {
      scope.stop()
      matchStore.dispose()
      playerStore.dispose()
      jerseySetStore.dispose()
    },
  }
}

describe('match jersey draft', () => {
  it('opens from the accepted snapshot, generates explicitly without saving, and edits only one row', async () => {
    const mounted = await mountDraft(() => 0.25)
    try {
      expect(mounted.draft.open()).toBe(true)
      expect(mounted.draft.draft.value?.rows.map(({ jerseyId }) => jerseyId))
        .toEqual(['saved-alex', 'saved-ben'])

      expect(mounted.draft.generate()).toBe(true)
      const generated = mounted.draft.draft.value!
      const benAssignment = generated.rows.find(({ playerId }) => playerId === 'ben')?.jerseyId
      expect(generated.rows.every(({ jerseyId }) => jerseyId !== null)).toBe(true)
      expect(mounted.saveMatch).not.toHaveBeenCalled()

      expect(mounted.draft.selectJersey('alex', 'set-blue-manual')).toBe(true)
      expect(mounted.draft.draft.value?.rows.find(({ playerId }) => playerId === 'alex')?.jerseyId)
        .toBe('set-blue-manual')
      expect(mounted.draft.draft.value?.rows.find(({ playerId }) => playerId === 'ben')?.jerseyId)
        .toBe(benAssignment)
      expect(mounted.saveMatch).not.toHaveBeenCalled()
    } finally {
      mounted.dispose()
    }
  })

  it('switches sets and regenerates by replacing only the draft, never the accepted match', async () => {
    let draw = 0
    const mounted = await mountDraft(() => {
      draw += 1
      return draw % 3 === 0 ? 0.8 : 0.2
    })
    try {
      const accepted = copyMatchSnapshot(mounted.matchStore.matches.value[0])
      expect(mounted.draft.open()).toBe(true)
      expect(mounted.draft.selectSet('set-red')).toBe(true)
      expect(mounted.draft.draft.value?.rows.map(({ jerseyId }) => jerseyId)).toEqual([null, null])

      const beforeGeneration = mounted.draft.draft.value
      expect(mounted.draft.generate('first-seed')).toBe(true)
      const firstProposal = mounted.draft.draft.value
      expect(firstProposal).not.toBe(beforeGeneration)
      expect(firstProposal?.setId).toBe('set-red')
      expect(mounted.draft.generate('second-seed')).toBe(true)
      expect(mounted.draft.draft.value).not.toBe(firstProposal)
      expect(mounted.matchStore.matches.value[0]).toEqual(accepted)
      expect(mounted.saveMatch).not.toHaveBeenCalled()
    } finally {
      mounted.dispose()
    }
  })

  it('cancels an edited draft and restores the last accepted distribution on reopen', async () => {
    const mounted = await mountDraft(() => 0.1)
    try {
      const accepted = copyMatchSnapshot(mounted.matchStore.matches.value[0]).jerseyAssignment
      expect(mounted.draft.open()).toBe(true)
      expect(mounted.draft.generate()).toBe(true)
      expect(mounted.draft.selectJersey('alex', 'set-blue-manual')).toBe(true)
      mounted.draft.cancel()

      expect(mounted.draft.isOpen.value).toBe(false)
      expect(mounted.matchStore.matches.value[0].jerseyAssignment).toEqual(accepted)
      expect(mounted.draft.open()).toBe(true)
      expect(mounted.draft.draft.value?.rows.map(({ jerseyId }) => jerseyId))
        .toEqual(['saved-alex', 'saved-ben'])
      expect(mounted.saveMatch).not.toHaveBeenCalled()
    } finally {
      mounted.dispose()
    }
  })

  it('allows manual size and owner overrides, rejects duplicate zero without displacing, and frees it on clear', async () => {
    const alex = { ...player('alex', 'Alex'), jerseySize: null }
    const mounted = await mountDraft(undefined, [alex, player('ben', 'Ben')])
    try {
      expect(mounted.draft.open()).toBe(true)
      expect(mounted.draft.selectJersey('alex', 'set-blue-zero-private')).toBe(true)
      const benBefore = mounted.draft.draft.value?.rows.find(({ playerId }) => playerId === 'ben')
      expect(mounted.draft.selectJersey('ben', 'set-blue-zero-team')).toBe(false)
      expect(mounted.draft.draft.value?.rows.find(({ playerId }) => playerId === 'alex')?.jerseyId)
        .toBe('set-blue-zero-private')
      expect(mounted.draft.draft.value?.rows.find(({ playerId }) => playerId === 'ben')?.jerseyId)
        .toBe(benBefore?.jerseyId)
      expect(mounted.draft.draft.value?.rows.find(({ playerId }) => playerId === 'ben')?.error)
        .toBe('Number 0 is already assigned to Alex.')

      expect(mounted.draft.selectJersey('alex', null)).toBe(true)
      expect(mounted.draft.selectJersey('ben', 'set-blue-zero-team')).toBe(true)
      expect(mounted.draft.draft.value?.rows.find(({ playerId }) => playerId === 'ben'))
        .toMatchObject({ jerseyId: 'set-blue-zero-team', jerseySnapshot: { number: 0 }, error: null })
      expect(mounted.saveMatch).not.toHaveBeenCalled()
    } finally {
      mounted.dispose()
    }
  })

  it('accepts a partial manual result in one match save and merges goals saved during review', async () => {
    const alex = { ...player('alex', 'Alex'), jerseySize: null }
    const mounted = await mountDraft(undefined, [alex, player('ben', 'Ben')], () => 600)
    try {
      expect(mounted.draft.open()).toBe(true)
      expect(mounted.draft.selectSet('set-blue')).toBe(true)
      expect(mounted.draft.selectJersey('alex', 'set-blue-zero-private')).toBe(true)

      const latest = copyMatchSnapshot(mounted.matchStore.matches.value[0])
      const savedGoal = {
        id: 'goal-during-jersey-review',
        side: 'home' as const,
        period: 1 as const,
        elapsedMs: 30_000,
        scorerPlayerId: 'alex',
        scorer: 'Alex',
        assistPlayerId: 'ben',
        assist: 'Ben',
        description: 'Saved while reviewing jerseys',
        createdAt: 500,
      }
      await mounted.matchStore.persist({ ...latest, goals: [savedGoal], updatedAt: 500 })
      mounted.saveMatch.mockClear()

      expect(await mounted.draft.accept()).toBe(true)
      expect(mounted.saveMatch).toHaveBeenCalledOnce()
      expect(mounted.matchStore.matches.value[0]).toMatchObject({
        updatedAt: 600,
        goals: [savedGoal],
        firstKickoffAt: null,
        participation: latest.participation,
        jerseyAssignment: {
          setId: 'set-blue',
          setNameSnapshot: 'Blue',
          rows: [
            { playerId: 'alex', jersey: { jerseyId: 'set-blue-zero-private', number: 0, size: 'XL', ownerPlayerId: 'ben' } },
            { playerId: 'ben', jersey: null },
          ],
        },
      })
      expect(mounted.draft.isOpen.value).toBe(false)
      expect(mounted.savePlayers).not.toHaveBeenCalled()
      expect(mounted.saveJerseySets).not.toHaveBeenCalled()

      const savedJersey = mounted.matchStore.matches.value[0].jerseyAssignment!.rows[0].jersey!
      const inventoryJersey = mounted.jerseySetStore.sets.value[0].jerseys.find(({ id }) => id === savedJersey.jerseyId)!
      expect(savedJersey).not.toBe(inventoryJersey)
      await mounted.jerseySetStore.updateJersey('set-blue', 'set-blue-zero-private', {
        number: 5,
        size: 'XL',
        ownerPlayerId: 'ben',
      })
      expect(mounted.matchStore.matches.value[0].jerseyAssignment!.rows[0].jersey?.number).toBe(0)
    } finally {
      mounted.dispose()
    }
  })

  it('rejects acceptance when the selected set or item details become stale', async () => {
    const renamed = await mountDraft()
    try {
      renamed.draft.open()
      renamed.draft.selectSet('set-blue')
      await renamed.jerseySetStore.renameSet('set-blue', 'Blue changed')
      expect(await renamed.draft.accept()).toBe(false)
      expect(renamed.draft.message.value).toContain('selected jersey set changed')
      expect(renamed.saveMatch).not.toHaveBeenCalled()
    } finally {
      renamed.dispose()
    }

    const changedItem = await mountDraft()
    try {
      changedItem.draft.open()
      changedItem.draft.selectSet('set-blue')
      expect(changedItem.draft.selectJersey('alex', 'set-blue-seven')).toBe(true)
      await changedItem.jerseySetStore.updateJersey('set-blue', 'set-blue-seven', {
        number: 17,
        size: 'M',
        ownerPlayerId: null,
      })
      expect(await changedItem.draft.accept()).toBe(false)
      expect(changedItem.draft.message.value).toContain('number, size, or owner changed')
      expect(changedItem.saveMatch).not.toHaveBeenCalled()
    } finally {
      changedItem.dispose()
    }
  })

  it('rejects removed sets and a match that has started since the draft opened', async () => {
    const removedSet = await mountDraft()
    try {
      removedSet.draft.open()
      removedSet.draft.selectSet('set-blue')
      await removedSet.jerseySetStore.removeSet('set-blue')
      expect(await removedSet.draft.accept()).toBe(false)
      expect(removedSet.draft.message.value).toContain('set was removed')
      expect(removedSet.saveMatch).not.toHaveBeenCalled()
    } finally {
      removedSet.dispose()
    }

    const kickedOff = await mountDraft()
    try {
      kickedOff.draft.open()
      kickedOff.draft.selectSet('set-blue')
      const latest = copyMatchSnapshot(kickedOff.matchStore.matches.value[0])
      await kickedOff.matchStore.persist({
        ...latest,
        clock: { period: 1, elapsedMs: 0, status: 'running', startedAt: 400 },
        firstKickoffAt: 400,
        updatedAt: 400,
      })
      kickedOff.saveMatch.mockClear()
      expect(await kickedOff.draft.accept()).toBe(false)
      expect(kickedOff.draft.message.value).toContain('only be prepared before kickoff')
      expect(kickedOff.matchStore.matches.value[0].jerseyAssignment).toEqual(latest.jerseyAssignment)
      expect(kickedOff.saveMatch).not.toHaveBeenCalled()
    } finally {
      kickedOff.dispose()
    }
  })

  it('retains the exact draft after a failed write and retries without rerolling', async () => {
    const random = vi.fn(() => 0.3)
    const mounted = await mountDraft(random)
    try {
      mounted.draft.open()
      mounted.draft.selectSet('set-blue')
      expect(mounted.draft.generate()).toBe(true)
      const attemptedDraft = JSON.parse(JSON.stringify(mounted.draft.draft.value))
      const committedBefore = copyMatchSnapshot(mounted.matchStore.matches.value[0])
      random.mockClear()
      mounted.saveMatch.mockRejectedValueOnce(new Error('temporary match write failure'))

      expect(await mounted.draft.accept()).toBe(false)
      expect(mounted.draft.draft.value).toEqual(attemptedDraft)
      expect(mounted.matchStore.matches.value[0]).toEqual(committedBefore)
      expect(mounted.draft.message.value).toContain('temporary match write failure')
      expect(random).not.toHaveBeenCalled()

      expect(await mounted.draft.accept()).toBe(true)
      expect(random).not.toHaveBeenCalled()
      expect(mounted.saveMatch).toHaveBeenCalledTimes(2)
      expect(mounted.matchStore.matches.value[0].jerseyAssignment?.rows.map(({ jersey }) => jersey?.jerseyId ?? null))
        .toEqual(attemptedDraft.rows.map((row: { jerseyId: string | null }) => row.jerseyId))
    } finally {
      mounted.dispose()
    }
  })

  it('reconciles an open draft after a committed roster change without rerunning allocation', async () => {
    const random = vi.fn(() => 0.3)
    const mounted = await mountDraft(random, [
      player('alex', 'Alex'),
      player('ben', 'Ben'),
      player('jordan', 'Jordan'),
    ])
    try {
      expect(mounted.draft.open()).toBe(true)
      expect(mounted.draft.selectSet('set-blue')).toBe(true)
      expect(mounted.draft.generate()).toBe(true)
      const alexJersey = mounted.draft.draft.value!.rows.find(({ playerId }) => playerId === 'alex')!.jerseySnapshot
      random.mockClear()

      const changedSquad: MatchParticipation = {
        ownSide: 'home',
        squad: [
          { playerId: 'alex', nameSnapshot: 'Alex' },
          { playerId: 'jordan', nameSnapshot: 'Jordan' },
        ],
        starterIds: ['alex'],
        substitutions: [],
      }
      const changedMatch = copyMatchSnapshot(mounted.matchStore.matches.value[0])
      changedMatch.participation = changedSquad
      changedMatch.jerseyAssignment = reconcileMatchJerseyAssignment(changedMatch.jerseyAssignment, changedSquad)
      changedMatch.updatedAt = 200
      await mounted.matchStore.persist(changedMatch)

      expect(mounted.draft.draft.value?.rows).toEqual([
        { playerId: 'alex', jerseyId: alexJersey?.jerseyId ?? null, jerseySnapshot: alexJersey, error: null },
        { playerId: 'jordan', jerseyId: null, jerseySnapshot: null, error: 'No jersey assigned.' },
      ])
      expect(mounted.draft.draft.value?.rows.some(({ playerId }) => playerId === 'ben')).toBe(false)
      expect(random).not.toHaveBeenCalled()
      expect(mounted.draft.message.value).toContain('saved match squad changed')
      expect(mounted.draft.announcement.value).toContain('without generating a new proposal')

      expect(await mounted.draft.accept()).toBe(true)
      expect(mounted.matchStore.matches.value[0].jerseyAssignment?.rows.map(({ playerId }) => playerId))
        .toEqual(['alex', 'jordan'])
    } finally {
      mounted.dispose()
    }
  })

  it('keeps the saved summary readable during unavailable source loads and retries separately from empty stock', async () => {
    let playerLoadAttempts = 0
    let inventoryLoadAttempts = 0
    const saved = fixtureMatch()
    const matchRepository: MatchRepository = {
      listMatches: async () => [copyMatchSnapshot(saved)],
      getMatch: async (id) => id === saved.id ? copyMatchSnapshot(saved) : undefined,
      saveMatch: async () => undefined,
      close: () => undefined,
    }
    const playerRepository: PlayerRepository = {
      listPlayers: async () => {
        playerLoadAttempts += 1
        if (playerLoadAttempts === 1) throw new Error('player directory temporarily unavailable')
        return [player('alex', 'Alex'), player('ben', 'Ben')]
      },
      savePlayers: async () => undefined,
      close: () => undefined,
    }
    const emptySet = { ...jerseySet('set-empty', 'Empty set'), jerseys: [] }
    const setRepository: JerseySetRepository = {
      listJerseySets: async () => {
        inventoryLoadAttempts += 1
        if (inventoryLoadAttempts === 1) throw new Error('jersey inventory temporarily unavailable')
        return [emptySet]
      },
      saveJerseySets: async () => undefined,
      close: () => undefined,
    }
    const matchStore = createMatchStore(matchRepository)
    const playerStore = createPlayerStore(playerRepository)
    const jerseySetStore = createJerseySetStore(setRepository)
    await matchStore.load()
    const scope = effectScope()
    const draft = scope.run(() => useMatchJerseyDraft('draft-match', {
      matchStore,
      playerStore,
      jerseySetStore,
    }))!
    try {
      const savedAssignment = copyMatchSnapshot(matchStore.matches.value[0]).jerseyAssignment
      expect(draft.open()).toBe(true)
      expect(draft.draft.value?.rows.map(({ jerseyId }) => jerseyId)).toEqual(['saved-alex', 'saved-ben'])
      expect(draft.generate()).toBe(false)
      expect(draft.message.value).toContain('Player sizes are unavailable')
      expect(draft.selectSet('set-empty')).toBe(false)
      expect(draft.message.value).toContain('Jersey inventory is unavailable')
      expect(matchStore.matches.value[0].jerseyAssignment).toEqual(savedAssignment)

      expect(await draft.retryData()).toBe(false)
      expect(draft.message.value).toContain('player directory and jersey inventory')
      expect(playerLoadAttempts).toBe(1)
      expect(inventoryLoadAttempts).toBe(1)

      expect(await draft.retryData()).toBe(true)
      expect(playerLoadAttempts).toBe(2)
      expect(inventoryLoadAttempts).toBe(2)
      expect(draft.selectSet('set-empty')).toBe(true)
      expect(draft.generate()).toBe(true)
      expect(draft.draft.value?.rows).toEqual([
        expect.objectContaining({ playerId: 'alex', jerseyId: null, error: 'No eligible unclaimed jersey is available for this player.' }),
        expect.objectContaining({ playerId: 'ben', jerseyId: null, error: 'No eligible unclaimed jersey is available for this player.' }),
      ])
      expect(matchStore.matches.value[0].jerseyAssignment).toEqual(savedAssignment)
    } finally {
      scope.stop()
      matchStore.dispose()
      playerStore.dispose()
      jerseySetStore.dispose()
    }
  })

  it('blocks generation and acceptance while relevant stores have pending saves', async () => {
    const mounted = await mountDraft()
    try {
      expect(mounted.draft.open()).toBe(true)
      expect(mounted.draft.selectSet('set-blue')).toBe(true)

      let finishPlayerSave!: () => void
      mounted.savePlayers.mockImplementationOnce(() => new Promise<undefined>((resolve) => {
        finishPlayerSave = () => resolve(undefined)
      }))
      const savingPlayer = mounted.playerStore.persist({
        ...mounted.playerStore.players.value[0],
        updatedAt: 200,
      })
      expect(mounted.draft.generate()).toBe(false)
      expect(mounted.draft.message.value).toContain('player or inventory changes')
      finishPlayerSave()
      await savingPlayer

      let finishInventorySave!: () => void
      mounted.saveJerseySets.mockImplementationOnce(() => new Promise<undefined>((resolve) => {
        finishInventorySave = () => resolve(undefined)
      }))
      const jersey = mounted.jerseySetStore.sets.value[0].jerseys[0]
      const savingInventory = mounted.jerseySetStore.updateJersey('set-blue', jersey.id, {
        number: jersey.number,
        size: jersey.size,
        ownerPlayerId: jersey.ownerPlayerId,
      })
      expect(mounted.draft.generate()).toBe(false)
      expect(mounted.draft.message.value).toContain('player or inventory changes')
      finishInventorySave()
      await savingInventory

      expect(mounted.draft.generate()).toBe(true)
      let finishMatchSave!: () => void
      mounted.saveMatch.mockImplementationOnce(() => new Promise<void>((resolve) => { finishMatchSave = resolve }))
      const accepting = mounted.draft.accept()
      expect(mounted.matchStore.saving.value).toBe(true)
      expect(mounted.draft.selectJersey('alex', 'set-blue-manual')).toBe(false)
      expect(mounted.draft.message.value).toContain('current match save to finish')
      finishMatchSave()
      expect(await accepting).toBe(true)
    } finally {
      mounted.dispose()
    }
  })

  it('does not treat an in-progress required load as a completed retry', async () => {
    let finishPlayerLoad!: (players: Player[]) => void
    const saved = fixtureMatch()
    const matchRepository: MatchRepository = {
      listMatches: async () => [copyMatchSnapshot(saved)],
      getMatch: async () => copyMatchSnapshot(saved),
      saveMatch: async () => undefined,
      close: () => undefined,
    }
    const playerRepository: PlayerRepository = {
      listPlayers: () => new Promise<Player[]>((resolve) => { finishPlayerLoad = resolve }),
      savePlayers: async () => undefined,
      close: () => undefined,
    }
    const setRepository: JerseySetRepository = {
      listJerseySets: async () => [jerseySet('set-blue', 'Blue')],
      saveJerseySets: async () => undefined,
      close: () => undefined,
    }
    const matchStore = createMatchStore(matchRepository)
    const playerStore = createPlayerStore(playerRepository)
    const jerseySetStore = createJerseySetStore(setRepository)
    await Promise.all([matchStore.load(), jerseySetStore.load()])
    const pendingPlayerLoad = playerStore.load()
    const scope = effectScope()
    const draft = scope.run(() => useMatchJerseyDraft('draft-match', {
      matchStore,
      playerStore,
      jerseySetStore,
    }))!
    try {
      await expect(draft.retryData()).resolves.toBe(false)
      expect(draft.message.value).toContain('still changing')
      finishPlayerLoad([player('alex', 'Alex'), player('ben', 'Ben')])
      await pendingPlayerLoad
      expect(await draft.retryData()).toBe(true)
    } finally {
      scope.stop()
      matchStore.dispose()
      playerStore.dispose()
      jerseySetStore.dispose()
    }
  })
})
