import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { createPlayerRepository, type PlayerStorageLike } from '../../../entities/player'
import { providePlayerStore } from '../../../entities/player'
import MyPlayersPage from './MyPlayersPage.vue'

class MemoryStorage implements PlayerStorageLike {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

describe('MyPlayersPage', () => {
  it('creates, distinguishes, renames, archives, filters, and restores players by stable identity', async () => {
    const storage = new MemoryStorage()
    const repository = createPlayerRepository({ storage })
    let playerStore!: ReturnType<typeof providePlayerStore>
    let requestedStatisticsPlayerId: string | null = null
    const Host = defineComponent({
      setup() {
        playerStore = providePlayerStore(repository)
        return () => h(MyPlayersPage, {
          onViewStatistics: (playerId: string) => { requestedStatisticsPlayerId = playerId },
        })
      },
    })
    const wrapper = mount(Host)

    try {
      await vi.waitFor(() => expect(wrapper.find('#new-player-name').exists()).toBe(true))

      await wrapper.get('#new-player-name').setValue('Alex')
      await wrapper.get('.player-create-form').trigger('submit')
      await vi.waitFor(() => expect(playerStore.players.value).toHaveLength(1))
      const firstId = playerStore.players.value[0].id

      await wrapper.get('#new-player-name').setValue('Alex')
      await wrapper.get('.player-create-form').trigger('submit')
      await vi.waitFor(() => expect(playerStore.players.value).toHaveLength(2))
      const secondId = playerStore.players.value[1].id
      expect(secondId).not.toBe(firstId)
      expect(wrapper.findAll('.player-card')).toHaveLength(2)
      expect(wrapper.findAll('.player-card').map((card) => card.get('.player-card-name').text()))
        .toEqual(expect.arrayContaining([expect.stringMatching(/^Alex ·/), expect.stringMatching(/^Alex ·/)]))

      await wrapper.get(`[data-player-id="${firstId}"] button[aria-label^="View statistics"]`).trigger('click')
      expect(requestedStatisticsPlayerId).toBe(firstId)

      const firstCard = wrapper.find(`[data-player-id="${firstId}"]`)
      await firstCard.get('button[aria-label^="Rename"]').trigger('click')
      await firstCard.get('input').setValue('Alex Smith')
      await firstCard.get('button').trigger('click')
      await vi.waitFor(() => expect(playerStore.players.value[0].name).toBe('Alex Smith'))
      expect(playerStore.players.value[0].id).toBe(firstId)

      const secondCard = wrapper.find(`[data-player-id="${secondId}"]`)
      await secondCard.get('button[aria-label^="Archive"]').trigger('click')
      await vi.waitFor(() => expect(wrapper.find(`[data-player-id="${secondId}"]`).exists()).toBe(false))
      expect(playerStore.players.value.find((player) => player.id === secondId)?.archived).toBe(true)

      await wrapper.get('.player-filter button:nth-child(2)').trigger('click')
      const archivedCard = wrapper.get(`[data-player-id="${secondId}"]`)
      expect(archivedCard.text()).toContain('Archived')
      await archivedCard.get('button[aria-label^="Restore"]').trigger('click')
      await vi.waitFor(() => expect(wrapper.find(`[data-player-id="${secondId}"]`).exists()).toBe(false))
      expect(playerStore.players.value.find((player) => player.id === secondId)?.archived).toBe(false)

      await wrapper.get('.player-filter button:nth-child(1)').trigger('click')
      await vi.waitFor(() => expect(wrapper.find(`[data-player-id="${secondId}"]`).exists()).toBe(true))
      const reloaded = createPlayerRepository({ storage })
      await expect(reloaded.listPlayers()).resolves.toMatchObject([
        { id: firstId, name: 'Alex Smith', archived: false },
        { id: secondId, name: 'Alex', archived: false },
      ])
    } finally {
      wrapper.unmount()
    }
  })

  it('shows an accessible validation error for a whitespace-only player name', async () => {
    const repository = createPlayerRepository({ storage: new MemoryStorage() })
    const Host = defineComponent({
      setup() {
        providePlayerStore(repository)
        return () => h(MyPlayersPage)
      },
    })
    const wrapper = mount(Host)
    try {
      await vi.waitFor(() => expect(wrapper.find('#new-player-name').exists()).toBe(true))
      await wrapper.get('#new-player-name').setValue('  ')
      await wrapper.get('.player-create-form').trigger('submit')
      expect(wrapper.get('[role="alert"]').text()).toContain('A player name is required.')
      expect(wrapper.findAll('.player-card')).toHaveLength(0)
    } finally {
      wrapper.unmount()
    }
  })
})
