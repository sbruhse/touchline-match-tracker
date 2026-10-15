import { defineComponent, h, onMounted, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import {
  copyMatchSnapshot,
  createMatch,
  provideMatchStore,
  type Match,
  type MatchRepository,
  type MatchStore,
} from '../../../entities/match'
import {
  provideJerseySetStore,
  type JerseySet,
  type JerseySetRepository,
  type JerseySetStore,
} from '../../../entities/jersey-set'
import {
  providePlayerStore,
  type Player,
  type PlayerRepository,
  type PlayerStore,
} from '../../../entities/player'
import { AssignMatchJerseys } from '../index'

function fixtureMatch(): Match {
  return {
    ...createMatch('North City', 'South Town', 100, 'assignment-ui-match'),
    participation: {
      ownSide: 'home',
      squad: [
        { playerId: 'alex-id', nameSnapshot: 'Alex' },
        { playerId: 'ben-id', nameSnapshot: 'Ben' },
      ],
      starterIds: ['alex-id'],
      substitutions: [],
    },
  }
}

function fixturePlayers(): Player[] {
  return [
    {
      id: 'alex-id', name: 'Alex', positions: [], jerseySize: 'M', archived: false,
      createdAt: 100, updatedAt: 100,
    },
    {
      id: 'ben-id', name: 'Ben', positions: [], jerseySize: null, archived: false,
      createdAt: 100, updatedAt: 100,
    },
  ]
}

function fixtureSet(): JerseySet {
  return {
    id: 'blue-set',
    name: 'Blue kit',
    jerseys: [
      { id: 'blue-seven', number: 7, size: 'M', ownerPlayerId: null },
      { id: 'blue-eight', number: 8, size: 'M', ownerPlayerId: null },
      { id: 'private-ninety-nine', number: 99, size: 'XL', ownerPlayerId: 'ben-id' },
    ],
    preferredNumbers: [],
    createdAt: 100,
    updatedAt: 100,
  }
}

interface FeatureHarnessOptions {
  mode?: 'prepare' | 'summary'
  presentation?: 'standalone' | 'workflow'
  initialMatch?: Match
  loadPlayers?: boolean
  loadInventory?: boolean
  failedPlayerLoads?: number
  failedInventoryLoads?: number
  failedMatchWrites?: number
}

async function mountFeature(options: FeatureHarnessOptions = {}) {
  const mode = options.mode ?? 'prepare'
  const presentation = options.presentation ?? 'standalone'
  const loadPlayers = options.loadPlayers ?? true
  const loadInventory = options.loadInventory ?? true
  let matches = [copyMatchSnapshot(options.initialMatch ?? fixtureMatch())]
  let failedPlayerLoads = options.failedPlayerLoads ?? 0
  let failedInventoryLoads = options.failedInventoryLoads ?? 0
  let failedMatchWrites = options.failedMatchWrites ?? 0
  const saveMatch = vi.fn(async (candidate: Match) => {
    if (failedMatchWrites > 0) {
      failedMatchWrites -= 1
      throw new Error('temporary match write failure')
    }
    matches = [...matches.filter(({ id }) => id !== candidate.id), copyMatchSnapshot(candidate)]
  })
  const matchRepository: MatchRepository = {
    listMatches: async () => matches.map(copyMatchSnapshot),
    getMatch: async (id) => matches.find((match) => match.id === id),
    saveMatch,
    close: () => undefined,
  }
  const playerRepository: PlayerRepository = {
    listPlayers: async () => {
      if (failedPlayerLoads > 0) {
        failedPlayerLoads -= 1
        throw new Error('player directory is temporarily unavailable')
      }
      return fixturePlayers()
    },
    savePlayers: async () => undefined,
    close: () => undefined,
  }
  const jerseyRepository: JerseySetRepository = {
    listJerseySets: async () => {
      if (failedInventoryLoads > 0) {
        failedInventoryLoads -= 1
        throw new Error('jersey inventory is temporarily unavailable')
      }
      return [fixtureSet()]
    },
    saveJerseySets: async () => undefined,
    close: () => undefined,
  }

  let matchStore!: MatchStore
  let playerStore!: PlayerStore
  let jerseySetStore!: JerseySetStore
  let setDiscardDraftToken!: (token: number) => void
  const Host = defineComponent({
    setup() {
      const discardDraftToken = ref(0)
      setDiscardDraftToken = (token) => { discardDraftToken.value = token }
      matchStore = provideMatchStore(matchRepository)
      playerStore = providePlayerStore(playerRepository)
      jerseySetStore = provideJerseySetStore(jerseyRepository)
      onMounted(() => {
        const loads = [matchStore.load()]
        if (loadPlayers) loads.push(playerStore.load())
        if (loadInventory) loads.push(jerseySetStore.load())
        void Promise.allSettled(loads)
      })
      return () => h(AssignMatchJerseys, {
        matchId: matches[0].id,
        mode,
        presentation,
        discardDraftToken: discardDraftToken.value,
      })
    },
  })
  const wrapper = mount(Host, { attachTo: document.body })
  await flushPromises()
  return {
    wrapper,
    matchStore: () => matchStore,
    playerStore: () => playerStore,
    jerseySetStore: () => jerseySetStore,
    saveMatch,
    setDiscardDraftToken,
    dispose: () => wrapper.unmount(),
    retryOptions(next: Partial<Pick<FeatureHarnessOptions, 'failedPlayerLoads' | 'failedInventoryLoads' | 'failedMatchWrites'>>) {
      if (next.failedPlayerLoads !== undefined) failedPlayerLoads = next.failedPlayerLoads
      if (next.failedInventoryLoads !== undefined) failedInventoryLoads = next.failedInventoryLoads
      if (next.failedMatchWrites !== undefined) failedMatchWrites = next.failedMatchWrites
    },
  }
}

describe('AssignMatchJerseys feature integration', () => {
  it('generates, reviews manual overrides, rejects duplicate numbers, and accepts one complete distribution', async () => {
    const harness = await mountFeature()
    try {
      const wrapper = harness.wrapper
      await wrapper.get('button.open-editor-button').trigger('click')
      await flushPromises()
      expect(document.activeElement).toBe(wrapper.get('#jersey-assignment-set').element)
      await wrapper.get('#jersey-assignment-set').setValue('blue-set')
      await wrapper.get('button.generate-button').trigger('click')
      await flushPromises()

      expect(wrapper.text()).toContain('Player size is missing or is not a recognized adult size.')
      expect(wrapper.get('#jersey-for-ben-id').attributes('aria-describedby')).toBe('jersey-for-ben-id-error')

      await wrapper.get('#jersey-for-alex-id').setValue('private-ninety-nine')
      const alexHeading = wrapper.get('#jersey-for-alex-id-player').text()
      expect(alexHeading.indexOf('#99')).toBeLessThan(alexHeading.indexOf('Alex'))
      await wrapper.get('#jersey-for-alex-id').setValue('')
      expect(wrapper.get('#jersey-for-alex-id-player').text()).toContain('Unassigned')
      expect(wrapper.get('#jersey-for-alex-id-player').text()).not.toContain('#')
      await wrapper.get('#jersey-for-alex-id').setValue('private-ninety-nine')
      await wrapper.get('#jersey-for-ben-id').setValue('private-ninety-nine')
      await flushPromises()
      expect(wrapper.text()).toContain('Number 99 is already assigned to Alex.')
      expect(wrapper.get('#jersey-for-alex-id').element).toHaveProperty('value', 'private-ninety-nine')

      await wrapper.get('#jersey-for-ben-id').setValue('blue-seven')
      await wrapper.get('button.accept-button').trigger('click')
      await flushPromises()

      expect(harness.saveMatch).toHaveBeenCalledOnce()
      expect(harness.matchStore().matches.value[0].jerseyAssignment?.rows).toEqual([
        { playerId: 'alex-id', jersey: { jerseyId: 'private-ninety-nine', number: 99, size: 'XL', ownerPlayerId: 'ben-id' } },
        { playerId: 'ben-id', jersey: { jerseyId: 'blue-seven', number: 7, size: 'M', ownerPlayerId: null } },
      ])
      expect(harness.playerStore().players.value.map(({ jerseySize }) => jerseySize)).toEqual(['M', null])
      expect(harness.jerseySetStore().sets.value[0].jerseys[2].ownerPlayerId).toBe('ben-id')
      expect(wrapper.text()).toContain('Saved')
      expect(wrapper.get('.wearer-name').text()).toContain('#99')
      expect(wrapper.text()).toContain('Size XL · Owned by Ben')
      expect(wrapper.find('.visually-hidden[role="status"]').text()).toBe('Jersey assignments saved for this match.')
      expect(document.activeElement).toBe(wrapper.get('button.open-editor-button').element)

      await wrapper.get('button.open-editor-button').trigger('click')
      await wrapper.get('#jersey-assignment-set').setValue('blue-set')
      await wrapper.get('button.cancel-button').trigger('click')
      await flushPromises()
      expect(wrapper.get('.wearer-name').text()).toContain('#99')
      expect(wrapper.text()).toContain('Size XL · Owned by Ben')
      expect(harness.saveMatch).toHaveBeenCalledOnce()
      expect(document.activeElement).toBe(wrapper.get('button.open-editor-button').element)
    } finally {
      harness.dispose()
    }
  })

  it('keeps a partial proposal unchanged through failed-save retry and stores durable empty rows', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.35)
    const harness = await mountFeature({ presentation: 'workflow', failedMatchWrites: 1 })
    try {
      const wrapper = harness.wrapper
      const feature = wrapper.getComponent(AssignMatchJerseys)
      expect(wrapper.find('button.open-editor-button').exists()).toBe(false)
      expect(wrapper.find('.jersey-editor').exists()).toBe(true)
      expect(wrapper.text()).not.toContain('Replace draft with a new proposal')
      expect(feature.emitted('saved')).toBeUndefined()
      expect(harness.saveMatch).not.toHaveBeenCalled()
      await wrapper.get('#jersey-assignment-set').setValue('blue-set')
      await wrapper.get('button.generate-button').trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('Player size is missing or is not a recognized adult size.')
      await wrapper.get('#jersey-for-alex-id').setValue('blue-eight')
      const manuallySelectedJersey = (wrapper.get('#jersey-for-alex-id').element as HTMLSelectElement).value
      const proposal = harness.matchStore().matches.value[0].jerseyAssignment
      const drawCount = random.mock.calls.length

      await wrapper.get('button.accept-button').trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('temporary match write failure')
      expect(harness.matchStore().matches.value[0].jerseyAssignment).toEqual(proposal)
      expect((wrapper.get('#jersey-for-alex-id').element as HTMLSelectElement).value).toBe(manuallySelectedJersey)
      expect(feature.emitted('saved')).toBeUndefined()
      expect(random).toHaveBeenCalledTimes(drawCount)

      await wrapper.get('button.accept-button').trigger('click')
      await flushPromises()
      expect(harness.saveMatch).toHaveBeenCalledTimes(2)
      expect(random).toHaveBeenCalledTimes(drawCount)
      expect(wrapper.text()).toContain('No jersey assigned')
      expect(feature.emitted('saved')).toEqual([['assignment-ui-match']])
      expect(harness.matchStore().matches.value[0].jerseyAssignment?.rows[1]).toEqual({ playerId: 'ben-id', jersey: null })
      expect(harness.matchStore().matches.value[0].jerseyAssignment?.rows[0].jersey?.jerseyId).toBe('blue-eight')
    } finally {
      random.mockRestore()
      harness.dispose()
    }
  })

  it('keeps accepted jersey snapshots through skip and explicit workflow draft discard without generating a proposal', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.2)
    const acceptedMatch: Match = {
      ...fixtureMatch(),
      jerseyAssignment: {
        setId: 'blue-set',
        setNameSnapshot: 'Blue kit',
        rows: [
          { playerId: 'alex-id', jersey: { jerseyId: 'blue-seven', number: 7, size: 'M', ownerPlayerId: null } },
          { playerId: 'ben-id', jersey: null },
        ],
      },
    }
    const harness = await mountFeature({ presentation: 'workflow', initialMatch: acceptedMatch })
    try {
      const wrapper = harness.wrapper
      const feature = wrapper.getComponent(AssignMatchJerseys)
      expect(wrapper.find('.jersey-editor').exists()).toBe(true)
      expect(wrapper.find('button.open-editor-button').exists()).toBe(false)
      expect((wrapper.get('#jersey-for-alex-id').element as HTMLSelectElement).value).toBe('blue-seven')
      expect(random).not.toHaveBeenCalled()

      await wrapper.get('#jersey-for-alex-id').setValue('blue-eight')
      expect(feature.emitted('dirtyChange')?.at(-1)).toEqual([true])
      await wrapper.get('button.cancel-button').trigger('click')
      expect(feature.emitted('navigationIntent')).toEqual([['keep']])
      expect(harness.saveMatch).not.toHaveBeenCalled()
      expect(harness.matchStore().matches.value[0].jerseyAssignment).toEqual(acceptedMatch.jerseyAssignment)
      expect(random).not.toHaveBeenCalled()

      harness.setDiscardDraftToken(1)
      await flushPromises()
      expect((wrapper.get('#jersey-for-alex-id').element as HTMLSelectElement).value).toBe('blue-seven')
      expect(feature.emitted('dirtyChange')?.at(-1)).toEqual([false])
      expect(harness.saveMatch).not.toHaveBeenCalled()
      expect(harness.matchStore().matches.value[0].jerseyAssignment).toEqual(acceptedMatch.jerseyAssignment)
    } finally {
      random.mockRestore()
      harness.dispose()
    }
  })

  it('retries unavailable player and inventory data, while saved summaries need neither source', async () => {
    const unavailable = await mountFeature({ failedPlayerLoads: 1, failedInventoryLoads: 1 })
    try {
      const wrapper = unavailable.wrapper
      await wrapper.get('button.open-editor-button').trigger('click')
      expect(wrapper.text()).toContain('Player or jersey data is unavailable')
      expect(wrapper.findAll('button').some((button) => button.text() === 'Try again')).toBe(true)
      await wrapper.get('.source-unavailable button').trigger('click')
      await flushPromises()
      expect(unavailable.playerStore().ready.value).toBe(true)
      expect(unavailable.jerseySetStore().ready.value).toBe(true)
      expect(wrapper.text()).not.toContain('Player or jersey data is unavailable')
      expect(wrapper.get('#jersey-assignment-set')).toBeTruthy()
    } finally {
      unavailable.dispose()
    }

    const snapshotOnly = await mountFeature({ mode: 'summary', loadPlayers: false, loadInventory: false })
    try {
      expect(snapshotOnly.wrapper.text()).toContain('Jersey assignments')
      expect(snapshotOnly.wrapper.text()).toContain('No jersey distribution was accepted for this match.')
      expect(snapshotOnly.wrapper.find('.saved-state').exists()).toBe(false)
      expect(snapshotOnly.playerStore().ready.value).toBe(false)
      expect(snapshotOnly.jerseySetStore().ready.value).toBe(false)
      expect(snapshotOnly.saveMatch).not.toHaveBeenCalled()
    } finally {
      snapshotOnly.dispose()
    }
  })
})
