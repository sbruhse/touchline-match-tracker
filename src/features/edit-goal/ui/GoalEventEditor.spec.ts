import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import {
  createMatch,
  provideMatchStore,
  type GoalEvent,
  type Match,
  type MatchRepository,
  type MatchStore,
} from '../../../entities/match'
import GoalEventEditor from './GoalEventEditor.vue'

function fixtureGoal(): GoalEvent {
  return {
    id: 'goal-draft', side: 'home', period: 1, elapsedMs: 60_000,
    scorer: '', assist: '', description: '', createdAt: 1_000,
  }
}

async function mountEditor(options: { failNextSave?: boolean } = {}) {
  const initial: Match = { ...createMatch('North City', 'South Town', 100, 'goal-draft-match'), goals: [fixtureGoal()] }
  const records = [structuredClone(initial)]
  let failNextSave = options.failNextSave ?? false
  const repository: MatchRepository = {
    listMatches: async () => structuredClone(records),
    getMatch: async (id) => records.find((match) => match.id === id),
    async saveMatch(match) {
      if (failNextSave) {
        failNextSave = false
        throw new Error('Disk is temporarily unavailable.')
      }
      const snapshot = structuredClone(match)
      const index = records.findIndex((saved) => saved.id === match.id)
      if (index < 0) records.push(snapshot)
      else records[index] = snapshot
    },
    close: () => undefined,
  }

  let store!: MatchStore
  const open = ref(false)
  const Host = defineComponent({
    setup() {
      store = provideMatchStore(repository)
      return () => h(GoalEventEditor, {
        matchId: initial.id,
        goal: store.matches.value[0]?.goals[0] ?? initial.goals[0],
        homeTeam: initial.homeTeam,
        awayTeam: initial.awayTeam,
        open: open.value,
        onOpen: () => { open.value = true },
        onClose: () => { open.value = false },
      })
    },
  })
  const wrapper = mount(Host, { attachTo: document.body })
  await store.load()
  await flushPromises()
  return { wrapper, store, records, open, failSave: () => { failNextSave = true } }
}

function submitEditor(): void {
  document.querySelector<HTMLFormElement>('#goal-edit-form')?.dispatchEvent(new Event('submit', {
    bubbles: true,
    cancelable: true,
  }))
}

function setInput(name: string, value: string): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(`[name="${name}"]`)!
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  return input
}

describe('GoalEventEditor', () => {
  it('accepts blank optional fields and retains drafts through Close until explicitly discarded', async () => {
    const { wrapper, records } = await mountEditor()
    try {
      await wrapper.get('.goal-editor-launcher').trigger('click')
      await flushPromises()
      expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Add goal details')
      expect((document.querySelector('[name="scorer"]') as HTMLInputElement).required).toBe(false)
      expect((document.querySelector('[name="assist"]') as HTMLInputElement).required).toBe(false)
      submitEditor()
      await flushPromises()
      expect(records[0].goals[0]).toMatchObject({ scorer: '', assist: '', description: '' })
      expect(document.querySelector('[role="dialog"]')).toBeNull()

      await wrapper.get('.goal-editor-launcher').trigger('click')
      await flushPromises()
      setInput('scorer', 'Uncommitted scorer')
      document.querySelector<HTMLButtonElement>('.focused-editor__close')?.click()
      await flushPromises()
      expect(document.querySelector('[role="dialog"]')).toBeNull()

      await wrapper.get('.goal-editor-launcher').trigger('click')
      await flushPromises()
      expect((document.querySelector('[name="scorer"]') as HTMLInputElement).value).toBe('Uncommitted scorer')

      document.querySelector<HTMLButtonElement>('.discard-goal-button')?.click()
      await flushPromises()
      expect((document.querySelector('[name="scorer"]') as HTMLInputElement).value).toBe('')
    } finally {
      wrapper.unmount()
    }
  })

  it('keeps a failed-save draft retryable and closes only after commit', async () => {
    const { wrapper, records } = await mountEditor({ failNextSave: true })
    try {
      await wrapper.get('.goal-editor-launcher').trigger('click')
      await flushPromises()
      setInput('scorer', 'Retry scorer')
      submitEditor()
      await flushPromises()

      expect(document.querySelector('[role="alert"]')?.textContent).toContain('Disk is temporarily unavailable')
      expect((document.querySelector('[name="scorer"]') as HTMLInputElement).value).toBe('Retry scorer')
      expect(records[0].goals[0].scorer).toBe('')

      submitEditor()
      await flushPromises()
      expect(records[0].goals[0].scorer).toBe('Retry scorer')
      expect(document.querySelector('[role="dialog"]')).toBeNull()
    } finally {
      wrapper.unmount()
    }
  })

  it('preserves a draft when an unrelated match change commits', async () => {
    const { wrapper, store } = await mountEditor()
    try {
      await wrapper.get('.goal-editor-launcher').trigger('click')
      await flushPromises()
      setInput('scorer', 'Still drafting')
      const current = store.matches.value[0]
      await store.persist({
        ...current,
        clock: { ...current.clock, elapsedMs: 90_000 },
        updatedAt: current.updatedAt + 1,
      })
      await flushPromises()

      expect((document.querySelector('[name="scorer"]') as HTMLInputElement).value).toBe('Still drafting')
    } finally {
      wrapper.unmount()
    }
  })
})
