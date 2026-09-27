import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createMatch,
  provideMatchStore,
  type Match,
  type MatchParticipation,
  type MatchRepository,
  type MatchStore,
} from '../../../entities/match'
import RecordSubstitution from './RecordSubstitution.vue'

function trackedMatch(
  id: string,
  clock: Match['clock'] = { period: 1, elapsedMs: 1_000, status: 'running', startedAt: 10_000 },
): Match {
  const participation: MatchParticipation = {
    ownSide: 'home',
    squad: [
      { playerId: 'alex', nameSnapshot: 'Alex' },
      { playerId: 'sam', nameSnapshot: 'Sam' },
      { playerId: 'jordan', nameSnapshot: 'Jordan' },
    ],
    starterIds: ['alex'],
    substitutions: [],
  }
  return { ...createMatch('North City', 'South Town', 100, id), clock, participation }
}

async function mountFeature(initialMatch: Match) {
  const records = [structuredClone(initialMatch)]
  const saves: Match[] = []
  const repository: MatchRepository = {
    listMatches: async () => structuredClone(records),
    getMatch: async (id) => records.find((match) => match.id === id),
    async saveMatch(match) {
      const snapshot = structuredClone(match)
      saves.push(snapshot)
      const index = records.findIndex((saved) => saved.id === match.id)
      if (index < 0) records.push(snapshot)
      else records[index] = snapshot
    },
    close: () => undefined,
  }
  let store!: MatchStore
  const Host = defineComponent({
    setup() {
      store = provideMatchStore(repository)
      return () => h(RecordSubstitution, { matchId: initialMatch.id })
    },
  })
  const wrapper = mount(Host, { attachTo: document.body })
  await store.load()
  await flushPromises()
  return { wrapper, store, records, saves }
}

afterEach(() => vi.restoreAllMocks())

function editorElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Focused substitution editor element not found: ${selector}`)
  return element
}

function choosePlayer(name: 'outgoingPlayer' | 'incomingPlayer', playerId: string): void {
  const input = editorElement<HTMLInputElement>(`input[name="${name}"][value="${playerId}"]`)
  input.checked = true
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function submitDraft(): void {
  editorElement<HTMLFormElement>('.substitution-form').dispatchEvent(new Event('submit', {
    bubbles: true,
    cancelable: true,
  }))
}

describe('RecordSubstitution', () => {
  it('keeps the occurrence time captured before delayed player selection', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(12_000)
    const { wrapper, records } = await mountFeature(trackedMatch('delayed-substitution'))
    try {
      await wrapper.get('[data-action="start-substitution"]').trigger('click')
      expect(editorElement('.captured-time').textContent).toContain('First half · 1′')
      now.mockReturnValue(60_000)
      choosePlayer('outgoingPlayer', 'alex')
      choosePlayer('incomingPlayer', 'sam')
      submitDraft()
      await vi.waitFor(() => expect(records[0].participation?.substitutions).toHaveLength(1))
      await flushPromises()

      expect(records[0].participation?.substitutions[0]).toMatchObject({
        outgoingPlayerId: 'alex',
        incomingPlayerId: 'sam',
        period: 1,
        elapsedMs: 3_000,
        createdAt: 12_000,
        sequence: 0,
      })
      expect(document.querySelector('.substitution-form')).toBeNull()
    } finally {
      wrapper.unmount()
    }
  })

  it('captures the frozen time while paused and period-two zero at half-time', async () => {
    const pausedNow = vi.spyOn(Date, 'now').mockReturnValue(100_000)
    const paused = await mountFeature(trackedMatch('paused-substitution', {
      period: 1, elapsedMs: 9_250, status: 'paused', startedAt: null,
    }))
    try {
      await paused.wrapper.get('[data-action="start-substitution"]').trigger('click')
      expect(editorElement('.captured-time').textContent).toContain('First half · 1′')
      choosePlayer('outgoingPlayer', 'alex')
      choosePlayer('incomingPlayer', 'sam')
      submitDraft()
      await vi.waitFor(() => expect(paused.records[0].participation?.substitutions).toHaveLength(1))
      expect(paused.records[0].participation?.substitutions[0].elapsedMs).toBe(9_250)
    } finally {
      paused.wrapper.unmount()
      pausedNow.mockRestore()
    }

    const halftimeNow = vi.spyOn(Date, 'now').mockReturnValue(200_000)
    const halftime = await mountFeature(trackedMatch('halftime-substitution', {
      period: 1, elapsedMs: 47 * 60_000, status: 'halftime', startedAt: null,
    }))
    try {
      await halftime.wrapper.get('[data-action="start-substitution"]').trigger('click')
      expect(editorElement('.captured-time').textContent).toContain('Half-time · second half starts at 00:00')
      choosePlayer('outgoingPlayer', 'alex')
      choosePlayer('incomingPlayer', 'sam')
      submitDraft()
      await vi.waitFor(() => expect(halftime.records[0].participation?.substitutions).toHaveLength(1))
      expect(halftime.records[0].participation?.substitutions[0]).toMatchObject({ period: 2, elapsedMs: 0 })
    } finally {
      halftime.wrapper.unmount()
      halftimeNow.mockRestore()
    }
  })

  it('rejects a draft made stale by another committed match action', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(12_000)
    const { wrapper, store, records, saves } = await mountFeature(trackedMatch('stale-substitution'))
    try {
      await wrapper.get('[data-action="start-substitution"]').trigger('click')
      now.mockReturnValue(20_000)
      const current = store.matches.value[0]
      await store.persist({
        ...current,
        clock: { period: 1, elapsedMs: 11_000, status: 'paused', startedAt: null },
        updatedAt: 20_000,
      })
      await flushPromises()

      choosePlayer('outgoingPlayer', 'alex')
      choosePlayer('incomingPlayer', 'sam')
      submitDraft()
      await flushPromises()
      expect(editorElement('[role="alert"]').textContent).toContain('draft is out of date')
      expect(records[0].participation?.substitutions).toEqual([])
      expect(saves).toHaveLength(1)
    } finally {
      wrapper.unmount()
    }
  })

  it('cancels without saving a draft event', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(12_000)
    const { wrapper, records, saves } = await mountFeature(trackedMatch('cancel-substitution'))
    try {
      const launcher = wrapper.get('[data-action="start-substitution"]').element as HTMLButtonElement
      launcher.focus()
      await wrapper.get('[data-action="start-substitution"]').trigger('click')
      choosePlayer('outgoingPlayer', 'alex')
      choosePlayer('incomingPlayer', 'sam')
      editorElement<HTMLButtonElement>('.cancel-substitution-button').click()
      await flushPromises()

      expect(document.querySelector('.substitution-form')).toBeNull()
      expect(records[0].participation?.substitutions).toEqual([])
      expect(saves).toEqual([])
      expect(document.activeElement).toBe(launcher)
    } finally {
      wrapper.unmount()
    }
  })

  it('does not render a live action before kickoff or after full-time', async () => {
    const beforeKickoff = await mountFeature(trackedMatch('pre-kickoff-substitution', {
      period: 1, elapsedMs: 0, status: 'not-started', startedAt: null,
    }))
    expect(beforeKickoff.wrapper.find('[data-action="start-substitution"]').exists()).toBe(true)
    expect((beforeKickoff.wrapper.get('[data-action="start-substitution"]').element as HTMLButtonElement).disabled).toBe(true)
    expect(beforeKickoff.wrapper.text()).toContain('Substitutions become available after kickoff.')
    beforeKickoff.wrapper.unmount()

    const fullTime = await mountFeature(trackedMatch('fulltime-substitution', {
      period: 2, elapsedMs: 1_000, status: 'full-time', startedAt: null,
    }))
    expect(fullTime.wrapper.find('[data-action="start-substitution"]').exists()).toBe(true)
    expect((fullTime.wrapper.get('[data-action="start-substitution"]').element as HTMLButtonElement).disabled).toBe(true)
    expect(fullTime.wrapper.text()).toContain('No new live substitutions can be recorded after full-time.')
    fullTime.wrapper.unmount()
  })

  it('disambiguates duplicate names and explains an empty bench without offering an invalid save', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(12_000)
    const duplicateNames = trackedMatch('duplicate-substitution-names')
    duplicateNames.participation!.squad[1].nameSnapshot = 'Alex'
    const duplicate = await mountFeature(duplicateNames)
    try {
      await duplicate.wrapper.get('[data-action="start-substitution"]').trigger('click')
      const incomingNames = [...document.querySelectorAll('label.player-choice')]
        .map((label) => label.textContent?.trim() ?? '')
      expect(incomingNames).toContain('Alex · sam')
      expect(incomingNames).toContain('Alex · alex')
      editorElement<HTMLButtonElement>('.cancel-substitution-button').click()
    } finally {
      duplicate.wrapper.unmount()
    }

    const noBenchMatch = trackedMatch('empty-substitution-bench')
    noBenchMatch.participation!.starterIds = ['alex', 'sam', 'jordan']
    const noBench = await mountFeature(noBenchMatch)
    try {
      await noBench.wrapper.get('[data-action="start-substitution"]').trigger('click')
      expect(editorElement('.choice-empty').textContent).toContain('no eligible player on the bench')
      expect((editorElement('.save-substitution-button') as HTMLButtonElement).disabled).toBe(true)
      expect(noBench.records[0].participation?.substitutions).toEqual([])
    } finally {
      noBench.wrapper.unmount()
    }
  })
})
