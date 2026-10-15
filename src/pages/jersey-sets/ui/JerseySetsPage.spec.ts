import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { createJerseySetRepository, provideJerseySetStore, type JerseySetStorageLike } from '../../../entities/jersey-set'
import { createPlayerRepository, providePlayerStore, type PlayerStorageLike } from '../../../entities/player'
import JerseySetsPage from './JerseySetsPage.vue'

class MemoryStorage implements JerseySetStorageLike, PlayerStorageLike {
  private readonly values = new Map<string, string>()
  readonly writtenKeys: string[] = []

  getItem(key: string): string | null { return this.values.get(key) ?? null }
  setItem(key: string, value: string): void {
    this.writtenKeys.push(key)
    this.values.set(key, value)
  }
}

describe('JerseySetsPage', () => {
  it('loads each app-scoped store and presents an empty inventory without creating storage', async () => {
    const storage = new MemoryStorage()
    let jerseyStore!: ReturnType<typeof provideJerseySetStore>
    let playerStore!: ReturnType<typeof providePlayerStore>
    const Host = defineComponent({
      setup() {
        jerseyStore = provideJerseySetStore(createJerseySetRepository({ storage }))
        playerStore = providePlayerStore(createPlayerRepository({ storage }))
        return () => h(JerseySetsPage)
      },
    })
    const wrapper = mount(Host)

    try {
      await vi.waitFor(() => {
        expect(jerseyStore.ready.value).toBe(true)
        expect(playerStore.ready.value).toBe(true)
        expect(wrapper.find('#jersey-management-heading').exists()).toBe(true)
      })
      expect(wrapper.get('.empty-set-list').text()).toContain('Create one')
      expect(storage.writtenKeys).toEqual([])
      expect(storage.getItem('touchline.jersey-set-store')).toBeNull()
      expect(storage.getItem('touchline.player-store')).toBeNull()
    } finally {
      wrapper.unmount()
    }
  })

  it('shows a retryable storage error instead of treating malformed data as empty', async () => {
    const storage = new MemoryStorage()
    storage.setItem('touchline.jersey-set-store', '{invalid-json')
    storage.writtenKeys.length = 0
    let jerseyStore!: ReturnType<typeof provideJerseySetStore>
    let playerStore!: ReturnType<typeof providePlayerStore>
    const Host = defineComponent({
      setup() {
        jerseyStore = provideJerseySetStore(createJerseySetRepository({ storage }))
        playerStore = providePlayerStore(createPlayerRepository({ storage }))
        return () => h(JerseySetsPage)
      },
    })
    const wrapper = mount(Host)

    try {
      await vi.waitFor(() => expect(jerseyStore.error.value).toContain('not valid JSON'))
      expect(wrapper.find('.inventory-load-error').exists()).toBe(true)
      expect(wrapper.find('.empty-set-list').exists()).toBe(false)
      expect(wrapper.find('#create-jersey-set-button').exists()).toBe(false)
      expect(storage.writtenKeys).toEqual([])

      storage.setItem('touchline.jersey-set-store', JSON.stringify({ version: 1, sets: [] }))
      storage.writtenKeys.length = 0
      await wrapper.get('.inventory-load-error .secondary-button').trigger('click')
      await vi.waitFor(() => expect(jerseyStore.ready.value).toBe(true))
      expect(wrapper.find('.empty-set-list').exists()).toBe(true)
      expect(storage.writtenKeys).toEqual([])
      expect(playerStore.ready.value).toBe(true)
    } finally {
      wrapper.unmount()
    }
  })
})
