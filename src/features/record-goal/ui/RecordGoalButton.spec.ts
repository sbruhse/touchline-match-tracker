import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import {
  createMatch,
  provideMatchStore,
  type Match,
  type MatchRepository,
  type MatchStore,
} from '../../../entities/match'
import RecordGoalButton from './RecordGoalButton.vue'

async function mountButton(options: { fail?: boolean; pending?: Promise<void> } = {}) {
  const initial: Match = {
    ...createMatch('North City', 'South Town', 100, 'record-goal-button-match'),
    clock: { period: 1, elapsedMs: 500, status: 'running', startedAt: 2_000 },
  }
  const records = [structuredClone(initial)]
  let saveCalls = 0
  const repository: MatchRepository = {
    listMatches: async () => structuredClone(records),
    getMatch: async (id) => records.find((match) => match.id === id),
    async saveMatch(match) {
      saveCalls += 1
      if (options.fail) throw new Error('Goal storage failed.')
      await options.pending
      records[0] = structuredClone(match)
    },
    close: () => undefined,
  }
  let store!: MatchStore
  const Host = defineComponent({
    setup() {
      store = provideMatchStore(repository)
      return () => h(RecordGoalButton, { matchId: initial.id, side: 'home', teamName: initial.homeTeam })
    },
  })
  const wrapper = mount(Host)
  await store.load()
  await flushPromises()
  return { wrapper, records, store, getSaveCalls: () => saveCalls }
}

describe('RecordGoalButton', () => {
  it('emits the saved goal identity and accepted action time only after commit', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(2_500)
    const { wrapper, records } = await mountButton()
    try {
      await wrapper.get('.goal-button__team').trigger('click')
      await vi.waitFor(() => expect(wrapper.findComponent(RecordGoalButton).emitted('recorded')).toHaveLength(1))

      const [result] = wrapper.findComponent(RecordGoalButton).emitted('recorded')![0] as [
        { goalId: string; acceptedAt: number },
      ]
      expect(result.acceptedAt).toBe(2_500)
      expect(records[0].goals[0]).toMatchObject({ id: result.goalId, createdAt: result.acceptedAt, elapsedMs: 1_000 })
      expect(records[0].goals[0].side).toBe('home')
      expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    } finally {
      wrapper.unmount()
      vi.restoreAllMocks()
    }
  })

  it('emits no committed result when persistence fails', async () => {
    const { wrapper, records, store } = await mountButton({ fail: true })
    try {
      await wrapper.get('[aria-label="Record goal for North City"]').trigger('click')
      await vi.waitFor(() => expect(store.saveStatus.value).toBe('error'))
      expect(wrapper.findComponent(RecordGoalButton).emitted('recorded')).toBeUndefined()
      expect(records[0].goals).toEqual([])
    } finally {
      wrapper.unmount()
    }
  })

  it('disables the full team tile during a pending save and prevents a second write', async () => {
    let completeSave!: () => void
    const pending = new Promise<void>((resolve) => { completeSave = resolve })
    const { wrapper, store, getSaveCalls } = await mountButton({ pending })
    try {
      const button = wrapper.get('.goal-button')
      await wrapper.get('.goal-button__team').trigger('click')
      expect(store.saving.value).toBe(true)
      expect((button.element as HTMLButtonElement).disabled).toBe(true)

      await button.trigger('click')
      expect(getSaveCalls()).toBe(1)

      completeSave()
      await flushPromises()
      expect(getSaveCalls()).toBe(1)
    } finally {
      completeSave()
      wrapper.unmount()
    }
  })
})
