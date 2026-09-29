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
import MatchDetailPage from './MatchDetailPage.vue'

function fixtureMatch(id: string, status: 'running' | 'full-time'): Match {
  const match = createMatch('North City', 'South Town', 1_000, id)
  return {
    ...match,
    clock: {
      period: status === 'full-time' ? 2 : 1,
      elapsedMs: status === 'full-time' ? 1_000 : 0,
      status,
      startedAt: status === 'running' ? 100_000 : null,
    },
    participation: {
      ownSide: 'home',
      squad: [{ playerId: 'alex-id', nameSnapshot: 'Alex' }],
      starterIds: ['alex-id'],
      substitutions: [],
    },
    goals: [{
      id: 'page-goal', side: 'home', period: 1, elapsedMs: 0,
      scorer: '', assist: '', description: '', createdAt: 900,
    }],
  }
}

async function mountPage(initialMatch: Match) {
  const records = [structuredClone(initialMatch)]
  const repository: MatchRepository = {
    listMatches: async () => structuredClone(records),
    getMatch: async (id) => records.find((match) => match.id === id),
    async saveMatch(match) {
      const index = records.findIndex((saved) => saved.id === match.id)
      if (index < 0) records.push(structuredClone(match))
      else records[index] = structuredClone(match)
    },
    close: () => undefined,
  }
  let store!: MatchStore
  const Host = defineComponent({
    setup() {
      store = provideMatchStore(repository)
      return () => h(MatchDetailPage, { matchId: initialMatch.id })
    },
  })
  const wrapper = mount(Host, { attachTo: document.body })
  await store.load()
  await flushPromises()
  return { wrapper, store }
}

function setScorer(value: string): void {
  const input = document.querySelector<HTMLInputElement>('[name="scorer"]')!
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
      setScorer('Unfinished page draft')
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
      expect((document.querySelector('[name="scorer"]') as HTMLInputElement).value).toBe('Unfinished page draft')
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

  it('records a goal from Player times without switching panels and opens details only on request', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(100_000)
    const { wrapper, store } = await mountPage(fixtureMatch('goal-from-player-times', 'running'))
    try {
      await wrapper.get('#player-times-tab').trigger('click')
      await wrapper.get('.match-action-area__inner > .goal-button:first-child .goal-button__team').trigger('click')
      await vi.waitFor(() => expect(store.matches.value[0].goals).toHaveLength(2))
      expect(store.matches.value[0].goals[1].side).toBe('home')
      expect((wrapper.get('#player-times-tab').element as HTMLButtonElement).getAttribute('aria-selected')).toBe('true')
      expect(wrapper.get('.match-save-feedback').text()).toContain('Goal saved.')
      expect(document.querySelector('[role="dialog"]')).toBeNull()

      await wrapper.get('.match-save-feedback button').trigger('click')
      await flushPromises()
      expect(document.querySelector('[role="dialog"]')).not.toBeNull()
      expect((wrapper.get('#player-times-tab').element as HTMLButtonElement).getAttribute('aria-selected')).toBe('true')
      document.querySelector<HTMLButtonElement>('.focused-editor__close')?.click()
      await flushPromises()
      expect(document.activeElement).toBe(wrapper.get('#player-times-tab').element)
    } finally {
      wrapper.unmount()
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
})
