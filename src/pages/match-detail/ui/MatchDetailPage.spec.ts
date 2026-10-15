import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createMatch,
  provideMatchStore,
  type Match,
  type MatchRepository,
  type MatchStore,
} from '../../../entities/match'
import { provideJerseySetStore, type JerseySet, type JerseySetRepository } from '../../../entities/jersey-set'
import { providePlayerStore, type Player, type PlayerRepository } from '../../../entities/player'
import MatchDetailPage from './MatchDetailPage.vue'
import MatchTimeline from './components/MatchTimeline.vue'

function fixtureMatch(id: string, status: 'not-started' | 'running' | 'full-time', ownSide: 'home' | 'away' = 'home'): Match {
  const match = createMatch('North City', 'South Town', 1_000, id)
  return {
    ...match,
    clock: {
      period: status === 'full-time' ? 2 : 1,
      elapsedMs: status === 'full-time' ? 1_000 : 0,
      status,
      startedAt: status === 'running' ? 100_000 : null,
    },
    firstKickoffAt: status === 'not-started' ? null : 100_000,
    participation: {
      ownSide,
      squad: [{ playerId: 'alex-id', nameSnapshot: 'Alex' }],
      starterIds: ['alex-id'],
      substitutions: [],
    },
    goals: [{
      id: 'page-goal', side: 'home', period: 1, elapsedMs: 0,
      scorerPlayerId: null, scorer: '', assistPlayerId: null, assist: '', description: '', createdAt: 900,
    }],
  }
}

function fixturePlayers(): Player[] {
  return ['alex-id', 'sam-id', 'lee-id'].map((id, index) => ({
    id,
    name: id === 'alex-id' ? 'Alex' : id === 'sam-id' ? 'Sam' : 'Lee',
    positions: [],
    jerseySize: 'M',
    archived: false,
    createdAt: 100 + index,
    updatedAt: 100 + index,
  }))
}

async function mountPage(
  initialMatch: Match,
  options: { beforeSave?: (match: Match) => Promise<void> } = {},
) {
  const records = [structuredClone(initialMatch)]
  const repository: MatchRepository = {
    listMatches: async () => structuredClone(records),
    getMatch: async (id) => records.find((match) => match.id === id),
    async saveMatch(match) {
      await options.beforeSave?.(match)
      const index = records.findIndex((saved) => saved.id === match.id)
      if (index < 0) records.push(structuredClone(match))
      else records[index] = structuredClone(match)
    },
    close: () => undefined,
  }
  let store!: MatchStore
  const playerRepository: PlayerRepository = {
    listPlayers: async () => fixturePlayers(),
    savePlayers: async () => undefined,
    close: () => undefined,
  }
  const jerseyRepository: JerseySetRepository = {
    listJerseySets: async (): Promise<JerseySet[]> => [],
    saveJerseySets: async () => undefined,
    close: () => undefined,
  }
  const Host = defineComponent({
    setup() {
      store = provideMatchStore(repository)
      const players = providePlayerStore(playerRepository)
      const jerseySets = provideJerseySetStore(jerseyRepository)
      void Promise.all([players.load(), jerseySets.load()])
      return () => h(MatchDetailPage, { matchId: initialMatch.id })
    },
  })
  const wrapper = mount(Host, { attachTo: document.body })
  await store.load()
  await flushPromises()
  return { wrapper, store, records }
}

function deferred<T = void>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

async function setScorer(value: string): Promise<void> {
  const playerSelect = document.querySelector<HTMLSelectElement>('#goal-scorer-player')
  if (playerSelect) {
    playerSelect.value = '__manual_name__'
    playerSelect.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
  }
  const input = document.querySelector<HTMLInputElement>('#goal-scorer-name')
    ?? document.querySelector<HTMLInputElement>('[name="scorer"]')!
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

afterEach(() => {
  vi.useRealTimers()
  document.querySelectorAll('.match-ready-view').forEach((element) => element.remove())
})

describe('MatchDetailPage', () => {
  it('defaults to Events, switches panels in one action, preserves panel drafts, and keeps the live clock running', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(100_000)
    const { wrapper, store } = await mountPage(fixtureMatch('live-page-match', 'running'))
    try {
      expect((wrapper.get('#events-tab').element as HTMLButtonElement).getAttribute('aria-selected')).toBe('true')
      expect(wrapper.get('#events-panel').isVisible()).toBe(true)

      const launcher = wrapper.get('[aria-label^="Add details for North City goal"]')
      ;(launcher.element as HTMLButtonElement).focus()
      await launcher.trigger('click')
      await setScorer('Unfinished page draft')
      document.querySelector<HTMLButtonElement>('.focused-editor__close')?.click()
      await flushPromises()
      expect(document.activeElement).toBe(launcher.element)

      await wrapper.get('#player-times-tab').trigger('click')
      expect((wrapper.get('#player-times-tab').element as HTMLButtonElement).getAttribute('aria-selected')).toBe('true')
      expect(wrapper.get('#player-times-panel').isVisible()).toBe(true)
      expect(wrapper.get('.player-time').text()).toBe('00:00')
      await vi.advanceTimersByTimeAsync(5_000)
      await flushPromises()
      expect(wrapper.get('.player-time').text()).toBe('00:05')
      expect(store.matches.value[0].clock.status).toBe('running')

      await wrapper.get('#events-tab').trigger('click')
      await wrapper.get('[aria-label^="Add details for North City goal"]').trigger('click')
      await flushPromises()
      expect((document.querySelector('#goal-scorer-name') as HTMLInputElement).value).toBe('Unfinished page draft')
    } finally {
      wrapper.unmount()
    }
  })

  it('selects Events when opening a completed match and omits active clock and substitution controls', async () => {
    const { wrapper } = await mountPage(fixtureMatch('completed-page-match', 'full-time'))
    try {
      expect((wrapper.get('#events-tab').element as HTMLButtonElement).getAttribute('aria-selected')).toBe('true')
      expect(wrapper.get('.clock-status').text()).toBe('FULL TIME')
      expect(wrapper.find('.clock-actions button').exists()).toBe(false)
      expect(wrapper.find('[data-action="start-substitution"]').exists()).toBe(false)
      expect(wrapper.find('[aria-label="Record goal for North City"]').exists()).toBe(true)
    } finally {
      wrapper.unmount()
    }
  })

  it('opens the committed goal once from either panel, for either team, in each match phase', async () => {
    const cases = (['not-started', 'running', 'full-time'] as const)
      .flatMap((status) => (['home', 'away'] as const)
        .flatMap((side) => (['events', 'player-times'] as const).map((panel) => ({ status, side, panel }))))

    for (const { status, side, panel } of cases) {
      const match = fixtureMatch(`automatic-goal-${status}-${side}-${panel}`, status)
      match.goals = []
      const { wrapper, store } = await mountPage(match)
      try {
        if (panel === 'player-times') await wrapper.get('#player-times-tab').trigger('click')
        await wrapper.get(`.match-action-area__inner .goal-button[aria-label="Record goal for ${side === 'home' ? 'North City' : 'South Town'}"]`).trigger('click')
        await vi.waitFor(() => expect(store.matches.value[0].goals).toHaveLength(1))
        await flushPromises()

        const committedGoal = store.matches.value[0].goals[0]
        expect(committedGoal.side).toBe(side)
        expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
        expect(wrapper.getComponent(MatchTimeline).emitted('goalEditorOpened')).toEqual([[committedGoal.id]])
        expect((wrapper.get(`#${panel}-tab`).element as HTMLButtonElement).getAttribute('aria-selected')).toBe('true')
        expect(wrapper.find('.match-save-feedback').exists()).toBe(false)

        document.querySelector<HTMLButtonElement>('.focused-editor__close')?.click()
        await flushPromises()
        expect(document.querySelector('[role="dialog"]')).toBeNull()
        if (panel === 'events') {
          expect(document.activeElement?.closest('#events-panel')).not.toBeNull()
        } else {
          expect(document.activeElement).toBe(wrapper.get('#player-times-tab').element)
        }
        expect(wrapper.find('.match-save-feedback button').text()).toBe('Add details')
      } finally {
        wrapper.unmount()
      }
    }
  })

  it('does not open details before a delayed goal commit or after a failed initial save', async () => {
    const pendingSave = deferred<void>()
    const saveStarted = deferred<void>()
    const delayedMatch = fixtureMatch('delayed-automatic-goal', 'running')
    delayedMatch.goals = []
    const delayed = await mountPage(delayedMatch, {
      beforeSave: async (candidate) => {
        if (candidate.goals.length) {
          saveStarted.resolve()
          await pendingSave.promise
        }
      },
    })
    try {
      await delayed.wrapper.get('[aria-label="Record goal for North City"]').trigger('click')
      await saveStarted.promise
      await flushPromises()
      expect(delayed.store.matches.value[0].goals).toHaveLength(0)
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      pendingSave.resolve()
      await vi.waitFor(() => expect(delayed.store.matches.value[0].goals).toHaveLength(1))
      await flushPromises()
      expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    } finally {
      delayed.wrapper.unmount()
    }

    const failedMatch = fixtureMatch('failed-automatic-goal', 'not-started')
    failedMatch.goals = []
    const failed = await mountPage(failedMatch, {
      beforeSave: async () => { throw new Error('Initial goal write failed.') },
    })
    try {
      await failed.wrapper.get('[aria-label="Record goal for North City"]').trigger('click')
      await flushPromises()
      expect(failed.store.matches.value[0].goals).toHaveLength(0)
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      expect(failed.wrapper.get('.match-save-feedback[role="alert"]').text()).toContain('Could not save changes')
    } finally {
      failed.wrapper.unmount()
    }
  })

  it('keeps the clock running and restores visible focus and the exact goal draft across close, discard, and retry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(100_000)
    const match = { ...fixtureMatch('automatic-goal-keyboard', 'running'), participation: null }
    match.goals = []
    let failDetailsOnce = true
    const { wrapper, store, records } = await mountPage(match, {
      beforeSave: async (candidate) => {
        if (candidate.goals[0]?.scorer && failDetailsOnce) {
          failDetailsOnce = false
          throw new Error('Details write failed once.')
        }
      },
    })
    try {
      await wrapper.get('#player-times-tab').trigger('click')
      const recordButton = wrapper.get('[aria-label="Record goal for North City"]')
      ;(recordButton.element as HTMLButtonElement).focus()
      await recordButton.trigger('click')
      await vi.waitFor(() => expect(store.matches.value[0].goals).toHaveLength(1))
      await flushPromises()
      const goalId = store.matches.value[0].goals[0].id
      expect(document.querySelector('[role="dialog"]')).not.toBeNull()
      expect(document.activeElement?.className).toBe('focused-editor__close')
      expect(store.matches.value[0].clock.status).toBe('running')
      await setScorer('Draft scorer')

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await flushPromises()
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      expect(store.matches.value[0].goals).toHaveLength(1)
      expect(store.matches.value[0].goals[0].id).toBe(goalId)
      expect(['goal-button', 'player-times-tab']).toContain(
        document.activeElement instanceof HTMLElement && document.activeElement.id === 'player-times-tab'
          ? 'player-times-tab'
          : document.activeElement?.classList.contains('goal-button') ? 'goal-button' : 'other',
      )

      await wrapper.get('.match-save-feedback button').trigger('click')
      await flushPromises()
      expect((document.querySelector('#goal-scorer-name') as HTMLInputElement).value).toBe('Draft scorer')
      document.querySelector<HTMLButtonElement>('.discard-goal-button')?.click()
      await flushPromises()
      expect((document.querySelector('#goal-scorer-name') as HTMLInputElement).value).toBe('')
      await setScorer('Draft scorer')
      document.querySelector<HTMLFormElement>('#goal-edit-form')!.dispatchEvent(new Event('submit', {
        bubbles: true,
        cancelable: true,
      }))
      await vi.waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toContain('Details write failed once.'))
      expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
      expect(wrapper.find('.match-save-feedback').exists()).toBe(false)
      expect(store.matches.value[0].goals).toHaveLength(1)
      expect((document.querySelector('#goal-scorer-name') as HTMLInputElement).value).toBe('Draft scorer')

      document.querySelector<HTMLFormElement>('#goal-edit-form')!.dispatchEvent(new Event('submit', {
        bubbles: true,
        cancelable: true,
      }))
      await vi.waitFor(() => expect(records[0].goals[0].scorer).toBe('Draft scorer'))
      await flushPromises()
      expect(records[0].goals).toHaveLength(1)
      expect(records[0].goals[0].id).toBe(goalId)
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      expect(store.matches.value[0].clock.status).toBe('running')
    } finally {
      wrapper.unmount()
    }
  })

  it('does not reopen a committed goal on unrelated saves or when a match is reloaded', async () => {
    const match = fixtureMatch('no-repeat-automatic-goal', 'not-started')
    match.goals = []
    const first = await mountPage(match)
    let committed: Match
    try {
      await first.wrapper.get('[aria-label="Record goal for North City"]').trigger('click')
      await vi.waitFor(() => expect(first.store.matches.value[0].goals).toHaveLength(1))
      await flushPromises()
      committed = structuredClone(first.records[0])
      document.querySelector<HTMLButtonElement>('.focused-editor__close')?.click()
      await flushPromises()
      await first.store.persist({ ...first.store.matches.value[0], updatedAt: first.store.matches.value[0].updatedAt + 1 })
      await flushPromises()
      expect(document.querySelector('[role="dialog"]')).toBeNull()
    } finally {
      first.wrapper.unmount()
    }

    const reloaded = await mountPage(committed!)
    try {
      expect(document.querySelector('[role="dialog"]')).toBeNull()
    } finally {
      reloaded.wrapper.unmount()
    }
  })

  it('records a substitution from Player times and returns to the originating panel', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(100_000)
    const match = fixtureMatch('substitution-from-player-times', 'running')
    match.participation!.squad.push({ playerId: 'sam-id', nameSnapshot: 'Sam' })
    const { wrapper, store } = await mountPage(match)
    try {
      await wrapper.get('#player-times-tab').trigger('click')
      await wrapper.get('[data-action="start-substitution"]').trigger('click')
      expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Make a substitution')
      expect(wrapper.find('.match-save-feedback').exists()).toBe(false)

      const outgoing = document.querySelector<HTMLInputElement>('[name="outgoingPlayer"][value="alex-id"]')!
      const incoming = document.querySelector<HTMLInputElement>('[name="incomingPlayer"][value="sam-id"]')!
      outgoing.checked = true
      outgoing.dispatchEvent(new Event('change', { bubbles: true }))
      incoming.checked = true
      incoming.dispatchEvent(new Event('change', { bubbles: true }))
      document.querySelector<HTMLFormElement>('.substitution-form')!.dispatchEvent(new Event('submit', {
        bubbles: true,
        cancelable: true,
      }))

      await vi.waitFor(() => expect(store.matches.value[0].participation?.substitutions).toHaveLength(1))
      await flushPromises()
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      expect((wrapper.get('#player-times-tab').element as HTMLButtonElement).getAttribute('aria-selected')).toBe('true')
      expect(wrapper.get('#player-times-panel').isVisible()).toBe(true)
      expect(wrapper.get('.match-lineup').text()).toContain('Sam')
    } finally {
      wrapper.unmount()
    }
  })

  it('keeps correction feedback modal-local and restores Events focus after removing its launcher', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(100_000)
    const match = fixtureMatch('remove-substitution-from-match', 'running')
    match.participation!.squad.push({ playerId: 'sam-id', nameSnapshot: 'Sam' })
    match.participation!.substitutions = [{
      id: 'page-substitution',
      outgoingPlayerId: 'alex-id',
      incomingPlayerId: 'sam-id',
      period: 1,
      elapsedMs: 0,
      sequence: 0,
      createdAt: 100,
    }]
    const { wrapper, store } = await mountPage(match)
    try {
      await store.persist(store.matches.value[0])
      await flushPromises()
      expect(wrapper.get('.match-save-feedback').text()).toBe('All changes saved.')

      const correctionLauncher = wrapper.get('[aria-label="Correct substitution Alex off for Sam"]')
      ;(correctionLauncher.element as HTMLButtonElement).focus()
      await correctionLauncher.trigger('click')
      expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Correct substitution')
      expect(wrapper.find('.match-save-feedback').exists()).toBe(false)
      document.querySelector<HTMLButtonElement>('.cancel-correction-button')!.click()
      await flushPromises()
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      expect(document.activeElement).toBe(correctionLauncher.element)

      await correctionLauncher.trigger('click')
      expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Correct substitution')
      document.querySelector<HTMLButtonElement>('.remove-correction-button')!.click()

      await vi.waitFor(() => expect(store.matches.value[0].participation?.substitutions).toEqual([]))
      await flushPromises()
      await flushPromises()
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      expect(document.activeElement).toBe(wrapper.get('#events-panel').element)
      expect(wrapper.find('.match-save-feedback').text()).toBe('All changes saved.')
    } finally {
      wrapper.unmount()
    }
  })

  it('explains unavailable player times for a match that started without tracking', async () => {
    const untracked = { ...fixtureMatch('untracked-player-times', 'full-time'), participation: null }
    const { wrapper } = await mountPage(untracked)
    try {
      await wrapper.get('#player-times-tab').trigger('click')
      expect(wrapper.get('.untracked-player-times').text()).toContain('Player tracking was not enabled')
      expect(wrapper.find('.squad-setup').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it('offers one editable preparation launcher before kickoff with compact saved states and readable snapshots', async () => {
    for (const side of ['home', 'away'] as const) {
      const match = fixtureMatch(`jersey-preparation-${side}`, 'not-started', side)
      match.participation!.squad = [
        { playerId: 'alex-id', nameSnapshot: 'Alex' },
        { playerId: 'sam-id', nameSnapshot: 'Sam' },
        { playerId: 'lee-id', nameSnapshot: 'Lee' },
      ]
      match.participation!.starterIds = ['alex-id', 'sam-id']
      if (side === 'away') {
        match.jerseyAssignment = {
          setId: 'removed-blue-set',
          setNameSnapshot: 'Saved Blue kit',
          rows: [
            { playerId: 'alex-id', jersey: { jerseyId: 'snapshot-seven', number: 7, size: 'M', ownerPlayerId: null } },
            { playerId: 'sam-id', jersey: null },
            { playerId: 'lee-id', jersey: null },
          ],
        }
      }
      const { wrapper, store } = await mountPage(match)
      try {
        const summary = wrapper.get('.preparation-summary')
        expect(summary.text()).toContain(side === 'home' ? 'North City' : 'South Town')
        expect(summary.text()).toContain('2 starters / 3 players')
        expect(wrapper.findAll('.prepare-match-button')).toHaveLength(1)
        expect(wrapper.find('.squad-setup').exists()).toBe(false)
        expect(wrapper.find('.jersey-editor').exists()).toBe(false)
        expect(wrapper.findAll('.assignment-row')).toHaveLength(0)
        expect(wrapper.find('.clock-primary').exists()).toBe(true)
        expect(wrapper.findAll('.match-action-area .goal-button')).toHaveLength(2)
        if (side === 'home') {
          expect(summary.text()).toContain('Not prepared')
        } else {
          expect(summary.text()).toContain('Saved · Saved Blue kit · 1 of 3 assigned')
          await wrapper.get('.accepted-snapshots summary').trigger('click')
          const acceptedHeading = wrapper.get('.accepted-snapshots li strong').text()
          expect(acceptedHeading.indexOf('#7')).toBeLessThan(acceptedHeading.indexOf('Alex'))
          expect(summary.text()).toContain('Size M · Owned by Team')
          expect(summary.text()).toContain('No jersey assigned')
        }
        await wrapper.get('.prepare-match-button').trigger('click')
        expect(wrapper.getComponent(MatchDetailPage).emitted('prepare')).toEqual([[match.id]])

        await wrapper.get('.clock-primary').trigger('click')
        await vi.waitFor(() => expect(store.matches.value[0].clock.status).toBe('running'))
        expect(wrapper.find('.preparation-entry').exists()).toBe(false)
        expect(wrapper.find('.prepare-match-button').exists()).toBe(false)
        expect(wrapper.find('.squad-setup').exists()).toBe(false)
        expect(wrapper.find('.jersey-editor').exists()).toBe(false)
        expect(store.matches.value[0].jerseyAssignment).toEqual(match.jerseyAssignment)
        await wrapper.get('#player-times-tab').trigger('click')
        expect(wrapper.find('.untracked-player-times').exists()).toBe(false)
        expect(wrapper.find('.jersey-summary').exists()).toBe(false)
        if (side === 'home') {
          expect(wrapper.get('.match-lineup').text()).not.toContain('No jersey assigned')
          expect(store.matches.value[0].jerseyAssignment).toBeNull()
        } else {
          expect(wrapper.get('.match-lineup').text()).toContain('#7')
          expect(wrapper.get('.match-lineup').text()).toContain('No jersey assigned')
          expect(wrapper.get('.match-lineup').text()).not.toContain('Saved Blue kit')
          expect(wrapper.get('.match-lineup').text()).not.toContain('Size M')
          expect(wrapper.get('.match-lineup').text()).not.toContain('Owned by')
          expect(wrapper.findAll('.lineup-player')).toHaveLength(3)
          expect(store.matches.value[0].jerseyAssignment).toEqual(match.jerseyAssignment)
        }
      } finally {
        wrapper.unmount()
      }
    }
  })
})
