import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import {
  createMatch,
  provideMatchStore,
  type Match,
  type MatchParticipation,
  type MatchRepository,
  type MatchStore,
  type SubstitutionEvent,
} from '../../../../entities/match'
import SubstitutionEventEditor from './SubstitutionEventEditor.vue'

function matchWithEvents(events: SubstitutionEvent[], bothHalves = false): Match {
  const base = createMatch('North City', 'South Town', 100, 'edit-history-match')
  const clock: Match['clock'] = bothHalves
    ? { period: 2, elapsedMs: 48 * 60_000, status: 'full-time', startedAt: null }
    : { period: 1, elapsedMs: 60_000, status: 'full-time', startedAt: null }
  const participation: MatchParticipation = {
    ownSide: 'home',
    squad: [
      { playerId: 'alex', nameSnapshot: 'Alex' },
      { playerId: 'sam', nameSnapshot: 'Sam' },
      { playerId: 'jordan', nameSnapshot: 'Jordan' },
    ],
    starterIds: ['alex'],
    substitutions: events,
  }
  return {
    ...base,
    clock,
    participation,
    completedPeriodElapsedMs: bothHalves
      ? { 1: 47 * 60_000, 2: 48 * 60_000 }
      : { 1: 60_000, 2: null },
  }
}

function event(
  id: string,
  outgoingPlayerId: string,
  incomingPlayerId: string,
  elapsedMs: number,
  sequence: number,
  period: 1 | 2 = 1,
): SubstitutionEvent {
  return { id, outgoingPlayerId, incomingPlayerId, elapsedMs, sequence, period, createdAt: sequence }
}

async function mountFeature(initialMatch: Match) {
  const records = [structuredClone(initialMatch)]
  const saves: Match[] = []
  let failNextSave = false
  const repository: MatchRepository = {
    listMatches: async () => structuredClone(records),
    getMatch: async (id) => records.find((match) => match.id === id),
    async saveMatch(match) {
      if (failNextSave) {
        failNextSave = false
        throw new Error('Substitution write failed.')
      }
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
      return () => h(SubstitutionEventEditor, {
        matchId: initialMatch.id,
        eventId: initialMatch.participation?.substitutions[0]?.id ?? '',
      })
    },
  })
  const wrapper = mount(Host, { attachTo: document.body })
  await store.load()
  await flushPromises()
  return { wrapper, store, records, saves, failSaveOnce: () => { failNextSave = true } }
}

function editorElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Focused correction editor element not found: ${selector}`)
  return element
}

function setInputValue(selector: string, value: string): void {
  const field = editorElement<HTMLInputElement | HTMLSelectElement>(selector)
  field.value = value
  field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
}

function submitCorrection(): void {
  editorElement<HTMLFormElement>('.correction-form').dispatchEvent(new Event('submit', {
    bubbles: true,
    cancelable: true,
  }))
}

describe('SubstitutionEventEditor', () => {
  it('corrects an elapsed mm:ss time after full-time and persists the recalculated event', async () => {
    const { wrapper, records, saves } = await mountFeature(matchWithEvents([
      event('first', 'alex', 'sam', 10_000, 1),
    ]))
    try {
      await wrapper.get('[aria-label="Correct substitution Alex off for Sam"]').trigger('click')
      setInputValue('[name="correction-time"]', '00:20')
      setInputValue('[name="correction-period"]', '1')
      submitCorrection()
      await vi.waitFor(() => expect(records[0].participation?.substitutions[0].elapsedMs).toBe(20_000))
      await flushPromises()

      expect(saves).toHaveLength(1)
      expect(records[0].clock.status).toBe('full-time')
      expect(document.querySelector('.correction-form')).toBeNull()
    } finally {
      wrapper.unmount()
    }
  })

  it('preserves sub-second milliseconds when only correcting player identities', async () => {
    const { wrapper, records } = await mountFeature(matchWithEvents([
      event('millisecond', 'alex', 'sam', 10_725, 1),
    ]))
    try {
      await wrapper.get('[aria-label="Correct substitution Alex off for Sam"]').trigger('click')
      setInputValue('[name="correction-incoming"]', 'jordan')
      submitCorrection()
      await vi.waitFor(() => expect(records[0].participation?.substitutions[0].incomingPlayerId).toBe('jordan'))

      expect(records[0].participation?.substitutions[0].elapsedMs).toBe(10_725)
    } finally {
      wrapper.unmount()
    }
  })

  it('supports setting a correction at the half-time boundary', async () => {
    const { wrapper, records } = await mountFeature(matchWithEvents([
      event('half-time-edit', 'alex', 'sam', 10_000, 1),
    ], true))
    try {
      await wrapper.get('[aria-label="Correct substitution Alex off for Sam"]').trigger('click')
      editorElement<HTMLButtonElement>('.half-time-button').click()
      await flushPromises()
      expect((editorElement('[name="correction-period"]') as HTMLSelectElement).value).toBe('2')
      expect((editorElement('[name="correction-time"]') as HTMLInputElement).value).toBe('00:00')
      submitCorrection()
      await vi.waitFor(() => expect(records[0].participation?.substitutions[0].period).toBe(2))
      expect(records[0].participation?.substitutions[0].elapsedMs).toBe(0)
    } finally {
      wrapper.unmount()
    }
  })

  it('shows an out-of-range error and leaves committed history unchanged', async () => {
    const original = event('future', 'alex', 'sam', 10_000, 1)
    const { wrapper, records, saves } = await mountFeature(matchWithEvents([original]))
    try {
      await wrapper.get('[aria-label="Correct substitution Alex off for Sam"]').trigger('click')
      setInputValue('[name="correction-time"]', '02:00')
      submitCorrection()
      await flushPromises()

      expect(editorElement('.correction-error[role="alert"]').textContent).toContain('exceeds the recorded elapsed time')
      expect(records[0].participation?.substitutions).toEqual([original])
      expect(saves).toEqual([])
    } finally {
      wrapper.unmount()
    }
  })

  it('rejects an edit whose later event becomes invalid without partially saving', async () => {
    const original = [
      event('first', 'alex', 'sam', 10_000, 1),
      event('later', 'sam', 'jordan', 20_000, 2),
    ]
    const { wrapper, records, saves } = await mountFeature(matchWithEvents(original))
    try {
      await wrapper.get('[aria-label="Correct substitution Alex off for Sam"]').trigger('click')
      setInputValue('[name="correction-time"]', '00:30')
      submitCorrection()
      await flushPromises()

      expect(editorElement('.correction-error[role="alert"]').textContent).toContain('OFF player is not on the pitch')
      expect(editorElement('.correction-error[role="alert"]').textContent).toContain('First conflict: Sam off for Jordan')
      expect(records[0].participation?.substitutions).toEqual(original)
      expect(saves).toEqual([])
    } finally {
      wrapper.unmount()
    }
  })

  it('removes an independent event but rejects removal that breaks later re-entry', async () => {
    const independent = event('independent', 'alex', 'sam', 10_000, 1)
    const removable = await mountFeature(matchWithEvents([independent]))
    try {
      await removable.wrapper.get('[aria-label="Correct substitution Alex off for Sam"]').trigger('click')
      editorElement<HTMLButtonElement>('.remove-correction-button').click()
      await vi.waitFor(() => expect(removable.records[0].participation?.substitutions).toEqual([]))
      expect(removable.saves).toHaveLength(1)
    } finally {
      removable.wrapper.unmount()
    }

    const chained = [
      event('first', 'alex', 'sam', 10_000, 1),
      event('return', 'sam', 'alex', 20_000, 2),
    ]
    const rejected = await mountFeature(matchWithEvents(chained))
    try {
      await rejected.wrapper.get('[aria-label="Correct substitution Alex off for Sam"]').trigger('click')
      editorElement<HTMLButtonElement>('.remove-correction-button').click()
      await flushPromises()
      expect(editorElement('.correction-error[role="alert"]').textContent).toContain('OFF player is not on the pitch')
      expect(rejected.records[0].participation?.substitutions).toEqual(chained)
      expect(rejected.saves).toEqual([])
    } finally {
      rejected.wrapper.unmount()
    }
  })

  it('keeps correction inputs and the focused editor after a failed save, then retries successfully', async () => {
    const original = event('retry-correction', 'alex', 'sam', 10_000, 1)
    const { wrapper, records, saves, failSaveOnce } = await mountFeature(matchWithEvents([original]))
    try {
      await wrapper.get('[aria-label="Correct substitution Alex off for Sam"]').trigger('click')
      setInputValue('[name="correction-time"]', '00:20')
      failSaveOnce()
      submitCorrection()

      await vi.waitFor(() => expect(editorElement('.correction-error[role="alert"]').textContent).toContain('Substitution write failed.'))
      expect(document.querySelector('[role="dialog"]')).not.toBeNull()
      expect((editorElement('[name="correction-time"]') as HTMLInputElement).value).toBe('00:20')
      expect(records[0].participation?.substitutions).toEqual([original])
      expect(saves).toEqual([])

      submitCorrection()
      await vi.waitFor(() => expect(records[0].participation?.substitutions[0].elapsedMs).toBe(20_000))
      await flushPromises()
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      expect(saves).toHaveLength(1)
    } finally {
      wrapper.unmount()
    }
  })

  it('cancels a correction without changing history and returns focus to its launcher', async () => {
    const original = event('cancel-correction', 'alex', 'sam', 10_000, 1)
    const { wrapper, records, saves } = await mountFeature(matchWithEvents([original]))
    try {
      const launcher = wrapper.get('[aria-label="Correct substitution Alex off for Sam"]').element as HTMLButtonElement
      launcher.focus()
      await wrapper.get('[aria-label="Correct substitution Alex off for Sam"]').trigger('click')
      setInputValue('[name="correction-time"]', '00:20')
      editorElement<HTMLButtonElement>('.cancel-correction-button').click()
      await flushPromises()

      expect(document.querySelector('[role="dialog"]')).toBeNull()
      expect(records[0].participation?.substitutions).toEqual([original])
      expect(saves).toEqual([])
      expect(document.activeElement).toBe(launcher)
    } finally {
      wrapper.unmount()
    }
  })
})
