import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import {
  copyMatchSnapshot,
  createMatch,
  provideMatchStore,
  type Match,
  type MatchRepository,
  type MatchStore,
} from '../../../entities/match'
import MatchArchivePage from './MatchArchivePage.vue'

describe('MatchArchivePage', () => {
  it('emits creation separately from ordinary archive reopening', async () => {
    const archived = createMatch('Old Harbor', 'Old Valley', 100, 'archive-old-match')
    const records = [copyMatchSnapshot(archived)]
    const repository: MatchRepository = {
      listMatches: async () => records.map(copyMatchSnapshot),
      getMatch: async (id) => records.find(({ id: savedId }) => savedId === id),
      async saveMatch(candidate) {
        records.splice(0, records.length, ...records.filter(({ id }) => id !== candidate.id), copyMatchSnapshot(candidate))
      },
      close: () => undefined,
    }
    let store!: MatchStore
    let parentHasCreationDraft = false
    const Host = defineComponent({
      setup() {
        store = provideMatchStore(repository)
        return () => h(MatchArchivePage, {
          onCreationDraftChanged: (hasDraft: boolean) => { parentHasCreationDraft = hasDraft },
        })
      },
    })
    const wrapper = mount(Host)
    await store.load()
    await flushPromises()
    const archive = wrapper.getComponent(MatchArchivePage)
    let unmounted = false
    try {
      expect(parentHasCreationDraft).toBe(false)
      await wrapper.get('#home-team').setValue(' ')
      await flushPromises()
      expect(parentHasCreationDraft).toBe(true)
      await wrapper.get('#home-team').setValue('')
      await flushPromises()
      expect(parentHasCreationDraft).toBe(false)

      await wrapper.get('#home-team').setValue('North City')
      await wrapper.get('#away-team').setValue('South Town')
      await flushPromises()
      expect(parentHasCreationDraft).toBe(true)
      await wrapper.get('form').trigger('submit')
      await flushPromises()

      const created = store.matches.value.find(({ homeTeam }) => homeTeam === 'North City') as Match
      expect(archive.emitted('matchCreated')).toEqual([[created.id]])
      expect(archive.emitted('openMatch')).toBeUndefined()
      expect(created.firstKickoffAt).toBeNull()
      expect(created.clock.status).toBe('not-started')
      expect(store.matches.value).toHaveLength(2)
      expect(parentHasCreationDraft).toBe(false)

      await wrapper.get('[aria-label="Open Old Harbor versus Old Valley"]').trigger('click')
      expect(archive.emitted('openMatch')).toEqual([['archive-old-match']])
      expect(archive.emitted('matchCreated')).toHaveLength(1)
      expect(wrapper.text()).toContain('Squad and jerseys are optional after creation.')

      await wrapper.get('#home-team').setValue('Unsubmitted draft')
      await flushPromises()
      expect(parentHasCreationDraft).toBe(true)
      wrapper.unmount()
      unmounted = true
      expect(parentHasCreationDraft).toBe(false)
    } finally {
      if (!unmounted) wrapper.unmount()
    }
  })
})
