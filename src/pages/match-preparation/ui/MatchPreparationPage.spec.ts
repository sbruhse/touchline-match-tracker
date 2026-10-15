import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
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
} from '../../../entities/jersey-set'
import {
  providePlayerStore,
  type Player,
  type PlayerRepository,
} from '../../../entities/player'
import type { PreparationDestination, PreparationNavigationRequest } from '../model/usePreparationFlow'
import MatchPreparationPage from './MatchPreparationPage.vue'

const players: Player[] = ['alex-id', 'ben-id', 'chris-id'].map((id, index) => ({
  id,
  name: id === 'alex-id' ? 'Alex' : id === 'ben-id' ? 'Ben' : 'Chris',
  positions: [],
  jerseySize: 'M',
  archived: false,
  createdAt: 100 + index,
  updatedAt: 100 + index,
}))

const jerseySet: JerseySet = {
  id: 'blue-set',
  name: 'Blue kit',
  jerseys: [
    { id: 'blue-seven', number: 7, size: 'M', ownerPlayerId: null },
    { id: 'blue-eight', number: 8, size: 'M', ownerPlayerId: null },
    { id: 'blue-nine', number: 9, size: 'M', ownerPlayerId: null },
  ],
  preferredNumbers: [],
  createdAt: 100,
  updatedAt: 100,
}

function fixtureMatch(): Match {
  return {
    ...createMatch('Eastside FC', 'Westfield United', 100, 'preparation-page-match'),
    participation: {
      ownSide: 'home',
      squad: [
        { playerId: 'alex-id', nameSnapshot: 'Alex' },
        { playerId: 'ben-id', nameSnapshot: 'Ben' },
      ],
      starterIds: ['alex-id'],
      substitutions: [],
    },
    jerseyAssignment: {
      setId: 'blue-set',
      setNameSnapshot: 'Blue kit',
      rows: [
        { playerId: 'alex-id', jersey: { jerseyId: 'blue-seven', number: 7, size: 'M', ownerPlayerId: null } },
        { playerId: 'ben-id', jersey: { jerseyId: 'blue-eight', number: 8, size: 'M', ownerPlayerId: null } },
      ],
    },
  }
}

async function mountPage(
  initialMatch = fixtureMatch(),
  options: { failedWrites?: number; deferredWrites?: number } = {},
) {
  const records = [copyMatchSnapshot(initialMatch)]
  let failedWrites = options.failedWrites ?? 0
  let deferredWrites = options.deferredWrites ?? 0
  let releasePendingSave: (() => void) | null = null
  const saveMatch = vi.fn(async (candidate: Match) => {
    if (deferredWrites > 0) {
      deferredWrites -= 1
      await new Promise<void>((resolve) => { releasePendingSave = resolve })
    }
    if (failedWrites > 0) {
      failedWrites -= 1
      throw new Error('temporary match write failure')
    }
    records.splice(0, records.length, copyMatchSnapshot(candidate))
  })
  const matchRepository: MatchRepository = {
    listMatches: async () => records.map(copyMatchSnapshot),
    getMatch: async (id) => records.find(({ id: savedId }) => savedId === id),
    saveMatch,
    close: () => undefined,
  }
  const playerRepository: PlayerRepository = {
    listPlayers: async () => players.map((player) => ({ ...player })),
    savePlayers: async () => undefined,
    close: () => undefined,
  }
  const jerseyRepository: JerseySetRepository = {
    listJerseySets: async () => [structuredClone(jerseySet)],
    saveJerseySets: async () => undefined,
    close: () => undefined,
  }

  let matchStore!: MatchStore
  const navigations: string[] = []
  const navigationRequest = ref<PreparationNavigationRequest | null>(null)
  let requestId = 0
  const Host = defineComponent({
    setup() {
      matchStore = provideMatchStore(matchRepository)
      const playerStore = providePlayerStore(playerRepository)
      const jerseySetStore = provideJerseySetStore(jerseyRepository)
      void Promise.all([playerStore.load(), jerseySetStore.load()])
      return () => h(MatchPreparationPage, {
        matchId: initialMatch.id,
        navigationRequest: navigationRequest.value,
        onNavigate: (destination: string) => navigations.push(destination),
      })
    },
  })
  const wrapper = mount(Host, { attachTo: document.body })
  await matchStore.load()
  await flushPromises()
  return {
    wrapper,
    matchStore,
    saveMatch,
    navigations,
    requestNavigation(destination: PreparationDestination) {
      requestId += 1
      navigationRequest.value = { destination, requestId }
    },
    releasePendingSave() {
      releasePendingSave?.()
      releasePendingSave = null
    },
    dispose: () => wrapper.unmount(),
  }
}

describe('MatchPreparationPage', () => {
  it('keeps both feature drafts across back/forward and reconciles committed squad edits without rerandomizing', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.45)
    const harness = await mountPage()
    try {
      const wrapper = harness.wrapper
      expect(wrapper.get('#preparation-heading').text()).toBe('Match squad')
      expect(wrapper.text()).toContain('Eastside FC')
      expect(wrapper.text()).toContain('Westfield United')

      await wrapper.get('[name="own-side"][value="away"]').setValue()
      await wrapper.get('button.preparation-step[data-step="jerseys"]').trigger('click')
      expect(document.activeElement).toBe(wrapper.get('#preparation-heading').element)
      expect(wrapper.find('.match-header').exists()).toBe(false)
      expect(wrapper.find('.match-tabs').exists()).toBe(false)
      expect(wrapper.find('.match-action-bar').exists()).toBe(false)
      expect(wrapper.get('.match-preparation').attributes('style')).toBeUndefined()
      expect(wrapper.findAll('.assignment-row')).toHaveLength(2)
      expect(wrapper.findAll('.assignment-player').map((row) => row.text())).not.toContain('Chris')
      expect(random).not.toHaveBeenCalled()

      await wrapper.get('button.generate-button').trigger('click')
      await flushPromises()
      const benJersey = (wrapper.get('#jersey-for-ben-id').element as HTMLSelectElement).value
      const alexSelect = wrapper.get('#jersey-for-alex-id').element as HTMLSelectElement
      const alexJersey = alexSelect.value
      const available = Array.from(alexSelect.options)
        .map((option) => option.value)
        .filter((jerseyId) => jerseyId && jerseyId !== benJersey && jerseyId !== alexJersey)
      const manualChoice = available[0]
      expect(manualChoice).toBeTruthy()
      await wrapper.get('#jersey-for-alex-id').setValue(manualChoice)
      const drawCount = random.mock.calls.length

      await wrapper.get('button[data-step="squad"]').trigger('click')
      expect(document.activeElement).toBe(wrapper.get('#preparation-heading').element)
      expect((wrapper.get('[name="own-side"][value="away"]').element as HTMLInputElement).checked).toBe(true)
      await wrapper.get('button.preparation-step[data-step="jerseys"]').trigger('click')
      expect(document.activeElement).toBe(wrapper.get('#preparation-heading').element)
      expect((wrapper.get('#jersey-for-alex-id').element as HTMLSelectElement).value).toBe(manualChoice)
      expect(random).toHaveBeenCalledTimes(drawCount)
      expect(wrapper.findAll('.assignment-row')).toHaveLength(2)
      expect(wrapper.findAll('.assignment-player').map((row) => row.text())).not.toContain('Chris')

      await wrapper.get('button[data-step="squad"]').trigger('click')
      await wrapper.get('[aria-label="Include Ben in match squad"]').setValue(false)
      await wrapper.get('[aria-label="Include Chris in match squad"]').setValue(true)
      await wrapper.get('.squad-form').trigger('submit')
      await flushPromises()

      expect(harness.matchStore.matches.value[0].participation?.squad.map(({ playerId }) => playerId))
        .toEqual(['alex-id', 'chris-id'])
      expect(harness.matchStore.matches.value[0].jerseyAssignment?.rows).toEqual([
        { playerId: 'alex-id', jersey: { jerseyId: 'blue-seven', number: 7, size: 'M', ownerPlayerId: null } },
        { playerId: 'chris-id', jersey: null },
      ])
      expect(wrapper.findAll('.assignment-row')).toHaveLength(2)
      expect(wrapper.find('#jersey-for-ben-id').exists()).toBe(false)
      expect((wrapper.get('#jersey-for-alex-id').element as HTMLSelectElement).value).toBe(manualChoice)
      expect((wrapper.get('#jersey-for-chris-id').element as HTMLSelectElement).value).toBe('')
      expect(random).toHaveBeenCalledTimes(drawCount)
      expect(harness.saveMatch).toHaveBeenCalledTimes(1)
      expect(wrapper.get('.step-save-feedback').text()).toBe('Match squad saved.')
      expect(wrapper.find('.app-save-feedback').exists()).toBe(false)
    } finally {
      random.mockRestore()
      harness.dispose()
    }
  })

  it('offers only optional squad actions when no squad is saved and keeps preparation free of live match controls', async () => {
    const withoutSquad = createMatch('North City', 'South Town', 100, 'no-squad-preparation')
    const harness = await mountPage(withoutSquad)
    try {
      const wrapper = harness.wrapper
      expect(wrapper.get('#preparation-heading').text()).toBe('Match squad')
      expect(wrapper.find('.preparation-step--unavailable').text()).toContain('save a squad first')
      expect(wrapper.find('button[data-step="jerseys"]').exists()).toBe(false)
      expect(wrapper.find('.jersey-editor').exists()).toBe(false)
      expect(wrapper.find('.match-header').exists()).toBe(false)
      expect(wrapper.find('.match-tabs').exists()).toBe(false)
      expect(wrapper.find('.match-action-bar').exists()).toBe(false)

      await wrapper.get('.squad-form .quiet-button').trigger('click')
      expect(harness.navigations).toEqual(['match'])
      expect(harness.saveMatch).not.toHaveBeenCalled()
    } finally {
      harness.dispose()
    }
  })

  it('confirms dirty app departures, preserves inputs on cancel, and keeps committed match data on discard', async () => {
    const initial = fixtureMatch()
    const harness = await mountPage(initial)
    try {
      const wrapper = harness.wrapper
      await wrapper.get('[name="own-side"][value="away"]').setValue()
      const goToMatch = wrapper.get('.go-to-match')
      ;(goToMatch.element as HTMLButtonElement).focus()
      await goToMatch.trigger('click')
      await flushPromises()
      expect(document.querySelector('[role="dialog"]')).not.toBeNull()
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Only unsaved changes')

      document.querySelector<HTMLButtonElement>('.keep-editing')?.click()
      await flushPromises()
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      expect(harness.navigations).toEqual([])
      expect(document.activeElement).toBe(goToMatch.element)
      expect((wrapper.get('[name="own-side"][value="away"]').element as HTMLInputElement).checked).toBe(true)

      harness.requestNavigation('players')
      await flushPromises()
      expect(document.querySelector('[role="dialog"]')).not.toBeNull()
      document.querySelector<HTMLButtonElement>('.discard-changes')?.click()
      await flushPromises()

      expect(harness.navigations).toEqual(['players'])
      expect(harness.matchStore.matches.value[0].participation).toEqual(initial.participation)
      expect(harness.matchStore.matches.value[0].jerseyAssignment).toEqual(initial.jerseyAssignment)
      expect(harness.saveMatch).not.toHaveBeenCalled()
    } finally {
      harness.dispose()
    }
  })

  it('does not silently discard a hidden squad draft after jersey acceptance', async () => {
    const initial = fixtureMatch()
    const harness = await mountPage(initial)
    try {
      const wrapper = harness.wrapper
      await wrapper.get('[name="own-side"][value="away"]').setValue()
      await wrapper.get('button.preparation-step[data-step="jerseys"]').trigger('click')
      await wrapper.get('#jersey-assignment-set').setValue('blue-set')
      await wrapper.get('#jersey-for-alex-id').setValue('blue-nine')
      await wrapper.get('button.accept-button').trigger('click')
      await flushPromises()

      expect(harness.saveMatch).toHaveBeenCalledTimes(1)
      expect(document.querySelector('[role="dialog"]')).not.toBeNull()
      expect(harness.navigations).toEqual([])
      expect(harness.matchStore.matches.value[0].participation?.ownSide).toBe('home')
      expect(harness.matchStore.matches.value[0].jerseyAssignment?.rows[0].jersey?.jerseyId).toBe('blue-nine')

      document.querySelector<HTMLButtonElement>('.keep-editing')?.click()
      await flushPromises()
      await wrapper.get('button[data-step="squad"]').trigger('click')
      expect((wrapper.get('[name="own-side"][value="away"]').element as HTMLInputElement).checked).toBe(true)
      expect(harness.matchStore.matches.value[0].participation?.ownSide).toBe('home')
      expect(harness.navigations).toEqual([])
    } finally {
      harness.dispose()
    }
  })

  it('blocks pending writes and retains an exact failed squad draft until a successful retry', async () => {
    const initial = fixtureMatch()
    const harness = await mountPage(initial, { deferredWrites: 1, failedWrites: 1 })
    try {
      const wrapper = harness.wrapper
      await wrapper.get('[name="own-side"][value="away"]').setValue()
      await wrapper.get('.squad-form').trigger('submit')
      expect(harness.matchStore.saving.value).toBe(true)

      harness.requestNavigation('players')
      await flushPromises()
      expect(harness.navigations).toEqual([])
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      expect(harness.matchStore.matches.value[0].participation?.ownSide).toBe('home')

      harness.releasePendingSave()
      await flushPromises()
      expect(harness.matchStore.saving.value).toBe(false)
      expect(wrapper.get('.squad-form [role="alert"]').text()).toContain('temporary match write failure')
      expect((wrapper.get('[name="own-side"][value="away"]').element as HTMLInputElement).checked).toBe(true)
      expect(harness.navigations).toEqual([])

      await wrapper.get('.squad-form').trigger('submit')
      await flushPromises()
      expect(harness.matchStore.matches.value[0].participation?.ownSide).toBe('away')
      expect(harness.matchStore.saving.value).toBe(false)
      expect(harness.navigations).toEqual([])
      expect(wrapper.get('#preparation-heading').text()).toBe('Jersey assignments')
    } finally {
      harness.releasePendingSave()
      harness.dispose()
    }
  })
})
