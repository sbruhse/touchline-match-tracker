import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import {
  createJerseySetRepository,
  JERSEY_SET_STORAGE_KEY,
  provideJerseySetStore,
} from '../../../entities/jersey-set'
import type { JerseySet, JerseySetRepository } from '../../../entities/jersey-set'
import { createPlayer, createPlayerRepository, type PlayerStorageLike } from '../../../entities/player'
import { providePlayerStore } from '../../../entities/player'
import MyPlayersPage from './MyPlayersPage.vue'

class MemoryStorage implements PlayerStorageLike {
  private readonly values = new Map<string, string>()
  failNextWrite = false
  failReadForKey: string | null = null
  setItemCalls = 0
  writtenKeys: string[] = []

  getItem(key: string): string | null {
    if (this.failReadForKey === key) {
      this.failReadForKey = null
      throw new Error('Storage cannot be read.')
    }
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.setItemCalls += 1
    this.writtenKeys.push(key)
    if (this.failNextWrite) {
      this.failNextWrite = false
      throw new Error('Storage is full.')
    }
    this.values.set(key, value)
  }
}

class ControlledJerseySetRepository implements JerseySetRepository {
  payload: JerseySet[]
  saveCalls = 0
  holdNextSave: { promise: Promise<void>; release: () => void } | null = null

  constructor(initial: JerseySet[] = []) {
    this.payload = structuredClone(initial)
  }

  async listJerseySets(): Promise<JerseySet[]> {
    return structuredClone(this.payload)
  }

  async saveJerseySets(sets: readonly JerseySet[]): Promise<void> {
    this.saveCalls += 1
    const held = this.holdNextSave
    this.holdNextSave = null
    if (held) await held.promise
    this.payload = structuredClone([...sets])
  }

  close(): void {}
}

function deferredSave() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
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
        provideJerseySetStore(createJerseySetRepository({ storage }))
        return () => h(MyPlayersPage, {
          onViewStatistics: (playerId: string) => { requestedStatisticsPlayerId = playerId },
        })
      },
    })
    const wrapper = mount(Host)

    try {
      await vi.waitFor(() => expect(wrapper.find('#create-player-name').exists()).toBe(true))

      await wrapper.get('#create-player-name').setValue('Alex')
      await wrapper.get('.player-profile-form').trigger('submit')
      await vi.waitFor(() => expect(playerStore.players.value).toHaveLength(1))
      const firstId = playerStore.players.value[0].id
      expect(playerStore.players.value[0].positions).toEqual([])

      await wrapper.get('#create-player-name').setValue('Alex')
      await wrapper.get('.player-profile-form').trigger('submit')
      await vi.waitFor(() => expect(playerStore.players.value).toHaveLength(2))
      const secondId = playerStore.players.value[1].id
      expect(secondId).not.toBe(firstId)
      expect(wrapper.findAll('.player-card')).toHaveLength(2)
      expect(wrapper.findAll('.player-card').map((card) => card.get('.player-card-name').text()))
        .toEqual(expect.arrayContaining([expect.stringMatching(/^Alex ·/), expect.stringMatching(/^Alex ·/)]))

      await wrapper.get(`[data-player-id="${firstId}"] button[aria-label^="View statistics"]`).trigger('click')
      expect(requestedStatisticsPlayerId).toBe(firstId)

      const firstCard = wrapper.find(`[data-player-id="${firstId}"]`)
      await firstCard.get('button[aria-label^="Edit profile"]').trigger('click')
      await firstCard.get('input').setValue('Alex Smith')
      await firstCard.get('.player-profile-form').trigger('submit')
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
    const storage = new MemoryStorage()
    const repository = createPlayerRepository({ storage })
    const Host = defineComponent({
      setup() {
        providePlayerStore(repository)
        provideJerseySetStore(createJerseySetRepository({ storage }))
        return () => h(MyPlayersPage)
      },
    })
    const wrapper = mount(Host)
    try {
      await vi.waitFor(() => expect(wrapper.find('#create-player-name').exists()).toBe(true))
      await wrapper.get('#create-player-name').setValue('  ')
      await wrapper.get('.player-profile-form').trigger('submit')
      expect(wrapper.get('[role="alert"]').text()).toContain('A player name is required.')
      expect(wrapper.findAll('.player-card')).toHaveLength(0)
      expect(wrapper.get('#create-player-name').element).toHaveProperty('value', '  ')
    } finally {
      wrapper.unmount()
    }
  })

  it('saves, clears, cancels, retries, and edits general size on archived profiles', async () => {
    const storage = new MemoryStorage()
    let playerStore!: ReturnType<typeof providePlayerStore>
    const Host = defineComponent({
      setup() {
        playerStore = providePlayerStore(createPlayerRepository({ storage }))
        provideJerseySetStore(createJerseySetRepository({ storage }))
        return () => h(MyPlayersPage)
      },
    })
    const wrapper = mount(Host)

    try {
      await vi.waitFor(() => expect(wrapper.find('#create-player-name').exists()).toBe(true))
      await wrapper.get('#create-player-name').setValue('Alex')
      await wrapper.get('#create-player-jersey-size').setValue('  S/M  ')
      await wrapper.get('.player-profile-form').trigger('submit')
      await vi.waitFor(() => expect(playerStore.players.value).toHaveLength(1))
      const playerId = playerStore.players.value[0].id
      const cardSelector = `[data-player-id="${playerId}"]`
      expect(playerStore.players.value[0].jerseySize).toBe('S/M')
      expect(wrapper.get(`${cardSelector} .player-size-summary`).text()).toContain('S/M')
      expect((wrapper.get('#create-player-jersey-size').element as HTMLInputElement).value).toBe('')

      await wrapper.get(`${cardSelector} button[aria-label^="Edit profile"]`).trigger('click')
      await wrapper.get(`#edit-player-${playerId}-jersey-size`).setValue('XL')
      await wrapper.get(`${cardSelector} .player-profile-form button[type="button"]`).trigger('click')
      expect(playerStore.players.value[0].jerseySize).toBe('S/M')
      await wrapper.get(`${cardSelector} button[aria-label^="Edit profile"]`).trigger('click')
      expect((wrapper.get(`#edit-player-${playerId}-jersey-size`).element as HTMLInputElement).value).toBe('S/M')
      await wrapper.get(`#edit-player-${playerId}-jersey-size`).setValue('   ')
      await wrapper.get(`${cardSelector} .player-profile-form`).trigger('submit')
      await vi.waitFor(() => expect(playerStore.players.value[0].jerseySize).toBeNull())
      expect(wrapper.find(`${cardSelector} .player-size-summary`).exists()).toBe(false)

      await wrapper.get(`${cardSelector} button[aria-label^="Archive"]`).trigger('click')
      await wrapper.get('.player-filter button:nth-child(2)').trigger('click')
      await wrapper.get(`${cardSelector} button[aria-label^="Edit profile"]`).trigger('click')
      await wrapper.get(`#edit-player-${playerId}-jersey-size`).setValue('164')
      await wrapper.get(`${cardSelector} .player-profile-form`).trigger('submit')
      await vi.waitFor(() => expect(playerStore.players.value[0].jerseySize).toBe('164'))

      await wrapper.get(`${cardSelector} button[aria-label^="Edit profile"]`).trigger('click')
      await wrapper.get(`#edit-player-${playerId}-jersey-size`).setValue('L')
      storage.failNextWrite = true
      await wrapper.get(`${cardSelector} .player-profile-form`).trigger('submit')
      await vi.waitFor(() => expect(wrapper.get('[role="alert"]').text()).toContain('Storage is full.'))
      expect(playerStore.players.value[0].jerseySize).toBe('164')
      expect((wrapper.get(`#edit-player-${playerId}-jersey-size`).element as HTMLInputElement).value).toBe('L')
      await wrapper.get(`${cardSelector} .player-profile-form`).trigger('submit')
      await vi.waitFor(() => expect(playerStore.players.value[0].jerseySize).toBe('L'))

      await wrapper.get(`${cardSelector} button[aria-label^="Edit profile"]`).trigger('click')
      await wrapper.get(`#edit-player-${playerId}-name`).setValue('  ')
      await wrapper.get(`#edit-player-${playerId}-jersey-size`).setValue('XXL')
      await wrapper.get(`${cardSelector} .player-profile-form`).trigger('submit')
      expect(wrapper.get('[role="alert"]').text()).toContain('A player name is required.')
      expect(playerStore.players.value[0].jerseySize).toBe('L')
      expect((wrapper.get(`#edit-player-${playerId}-jersey-size`).element as HTMLInputElement).value).toBe('XXL')
    } finally {
      wrapper.unmount()
    }
  })

  it('edits saved selections atomically, cancels drafts, and supports archived profiles', async () => {
    const storage = new MemoryStorage()
    let playerStore!: ReturnType<typeof providePlayerStore>
    const Host = defineComponent({
      setup() {
        playerStore = providePlayerStore(createPlayerRepository({ storage }))
        provideJerseySetStore(createJerseySetRepository({ storage }))
        return () => h(MyPlayersPage)
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })

    try {
      await vi.waitFor(() => expect(wrapper.find('#create-player-name').exists()).toBe(true))
      await wrapper.get('#create-player-name').setValue('Alex')
      await wrapper.get('#create-player-position-IV').setValue(true)
      await wrapper.get('#create-player-position-DM').setValue(true)
      await wrapper.get('.player-profile-form').trigger('submit')
      await vi.waitFor(() => expect(playerStore.players.value).toHaveLength(1))
      await vi.waitFor(() => expect(playerStore.saving.value).toBe(false))
      const playerId = playerStore.players.value[0].id
      const cardSelector = `[data-player-id="${playerId}"]`

      await wrapper.get(`${cardSelector} button[aria-label^="Edit profile"]`).trigger('click')
      await vi.waitFor(() => expect(document.activeElement?.id).toBe(`edit-player-${playerId}-name`))
      expect((wrapper.get(`#edit-player-${playerId}-position-IV`).element as HTMLInputElement).checked).toBe(true)
      expect((wrapper.get(`#edit-player-${playerId}-position-DM`).element as HTMLInputElement).checked).toBe(true)
      await wrapper.get(`#edit-player-${playerId}-name`).setValue('Alex Smith')
      await wrapper.get(`#edit-player-${playerId}-position-DM`).setValue(false)
      await wrapper.get(`#edit-player-${playerId}-position-ST`).setValue(true)
      expect(playerStore.players.value[0]).toMatchObject({ name: 'Alex', positions: ['IV', 'DM'] })
      await wrapper.get(`${cardSelector} .player-profile-form`).trigger('submit')
      await vi.waitFor(() => expect(playerStore.players.value[0]).toMatchObject({
        name: 'Alex Smith', positions: ['IV', 'ST'], archived: false,
      }))
      await vi.waitFor(() => expect(document.activeElement?.id).toBe(`edit-profile-${playerId}`))

      await wrapper.get(`${cardSelector} button[aria-label^="Edit profile"]`).trigger('click')
      await wrapper.get(`#edit-player-${playerId}-name`).setValue('Cancelled name')
      await wrapper.get(`#edit-player-${playerId}-position-IV`).setValue(false)
      await wrapper.get(`${cardSelector} button[type="button"]`).trigger('click')
      await vi.waitFor(() => expect(document.activeElement?.id).toBe(`edit-profile-${playerId}`))
      expect(playerStore.players.value[0]).toMatchObject({ name: 'Alex Smith', positions: ['IV', 'ST'] })
      await wrapper.get(`${cardSelector} button[aria-label^="Edit profile"]`).trigger('click')
      expect((wrapper.get(`#edit-player-${playerId}-name`).element as HTMLInputElement).value).toBe('Alex Smith')
      expect((wrapper.get(`#edit-player-${playerId}-position-IV`).element as HTMLInputElement).checked).toBe(true)
      await wrapper.get(`${cardSelector} button[type="button"]`).trigger('click')

      await wrapper.get(`${cardSelector} button[aria-label^="Archive"]`).trigger('click')
      await wrapper.get('.player-filter button:nth-child(2)').trigger('click')
      await wrapper.get(`${cardSelector} button[aria-label^="Edit profile"]`).trigger('click')
      await wrapper.get(`#edit-player-${playerId}-position-IV`).setValue(false)
      await wrapper.get(`#edit-player-${playerId}-position-ST`).setValue(false)
      await wrapper.get(`${cardSelector} .player-profile-form`).trigger('submit')
      await vi.waitFor(() => expect(playerStore.players.value[0]).toMatchObject({
        name: 'Alex Smith', positions: [], archived: true,
      }))
    } finally {
      wrapper.unmount()
    }
  })

  it('announces a failed profile save and keeps the full draft available for retry', async () => {
    const storage = new MemoryStorage()
    let playerStore!: ReturnType<typeof providePlayerStore>
    const Host = defineComponent({
      setup() {
        playerStore = providePlayerStore(createPlayerRepository({ storage }))
        provideJerseySetStore(createJerseySetRepository({ storage }))
        return () => h(MyPlayersPage)
      },
    })
    const wrapper = mount(Host)

    try {
      await vi.waitFor(() => expect(wrapper.find('#create-player-name').exists()).toBe(true))
      await wrapper.get('#create-player-name').setValue('Alex')
      await wrapper.get('#create-player-position-IV').setValue(true)
      await wrapper.get('.player-profile-form').trigger('submit')
      await vi.waitFor(() => expect(playerStore.players.value).toHaveLength(1))
      const playerId = playerStore.players.value[0].id
      await wrapper.get(`[data-player-id="${playerId}"] button[aria-label^="Edit profile"]`).trigger('click')
      await wrapper.get(`#edit-player-${playerId}-name`).setValue('Alex Smith')
      await wrapper.get(`#edit-player-${playerId}-position-DM`).setValue(true)
      storage.failNextWrite = true
      await wrapper.get(`[data-player-id="${playerId}"] .player-profile-form`).trigger('submit')

      await vi.waitFor(() => expect(wrapper.get('[role="alert"]').text()).toContain('Storage is full.'))
      expect(playerStore.players.value[0]).toMatchObject({ name: 'Alex', positions: ['IV'] })
      expect((wrapper.get(`#edit-player-${playerId}-name`).element as HTMLInputElement).value).toBe('Alex Smith')
      expect((wrapper.get(`#edit-player-${playerId}-position-IV`).element as HTMLInputElement).checked).toBe(true)
      expect((wrapper.get(`#edit-player-${playerId}-position-DM`).element as HTMLInputElement).checked).toBe(true)

      await wrapper.get(`[data-player-id="${playerId}"] .player-profile-form`).trigger('submit')
      await vi.waitFor(() => expect(playerStore.players.value[0]).toMatchObject({
        name: 'Alex Smith', positions: ['IV', 'DM'],
      }))
      expect(wrapper.find(`#edit-player-${playerId}-name`).exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it('shows saved position summaries in catalogue order for independent same-name profiles', async () => {
    const storage = new MemoryStorage()
    let playerStore!: ReturnType<typeof providePlayerStore>
    const Host = defineComponent({
      setup() {
        playerStore = providePlayerStore(createPlayerRepository({ storage }))
        provideJerseySetStore(createJerseySetRepository({ storage }))
        return () => h(MyPlayersPage)
      },
    })
    const wrapper = mount(Host)

    try {
      await vi.waitFor(() => expect(wrapper.find('#create-player-name').exists()).toBe(true))
      const create = async (name: string, positions: string[]) => {
        const expectedCount = playerStore.players.value.length + 1
        await wrapper.get('#create-player-name').setValue(name)
        for (const position of positions) {
          await wrapper.get(`#create-player-position-${position}`).setValue(true)
        }
        await wrapper.get('.player-profile-form').trigger('submit')
        await vi.waitFor(() => expect(playerStore.players.value).toHaveLength(expectedCount))
      }

      await create('Alex', ['DM', 'IV'])
      const firstId = playerStore.players.value[0].id
      await create('Alex', ['ST'])
      const secondId = playerStore.players.value[1].id
      await create('Sam', [])
      const emptyId = playerStore.players.value[2].id
      const firstCardSelector = `[data-player-id="${firstId}"]`
      const secondCardSelector = `[data-player-id="${secondId}"]`
      const emptyCardSelector = `[data-player-id="${emptyId}"]`

      expect(wrapper.findAll(`${firstCardSelector} .player-position-badge`).map((badge) => badge.text()))
        .toEqual(['IV', 'DM'])
      expect(wrapper.find(`${firstCardSelector} [aria-label="Positions: Innenverteidiger, Defensives Mittelfeld"]`)
        .exists()).toBe(true)
      expect(wrapper.findAll(`${secondCardSelector} .player-position-badge`).map((badge) => badge.text())).toEqual(['ST'])
      expect(wrapper.find(`${emptyCardSelector} .player-position-summary`).exists()).toBe(false)

      await wrapper.get(`${firstCardSelector} button[aria-label^="Edit profile"]`).trigger('click')
      await wrapper.get(`#edit-player-${firstId}-position-IV`).setValue(false)
      await wrapper.get(`#edit-player-${firstId}-position-DM`).setValue(false)
      await wrapper.get(`#edit-player-${firstId}-position-ST`).setValue(true)
      expect(wrapper.findAll(`${firstCardSelector} .player-position-badge`).map((badge) => badge.text()))
        .toEqual(['IV', 'DM'])
      expect(playerStore.players.value[0].positions).toEqual(['IV', 'DM'])
      await wrapper.get(`${firstCardSelector} .player-profile-form`).trigger('submit')
      await vi.waitFor(() => expect(playerStore.players.value[0].positions).toEqual(['ST']))
      expect(playerStore.players.value[1]).toMatchObject({ id: secondId, positions: ['ST'] })

      await wrapper.get(`${firstCardSelector} button[aria-label^="Archive"]`).trigger('click')
      await wrapper.get('.player-filter button:nth-child(2)').trigger('click')
      expect(wrapper.findAll(`${firstCardSelector} .player-position-badge`).map((badge) => badge.text())).toEqual(['ST'])
      await wrapper.get(`${firstCardSelector} button[aria-label^="Restore"]`).trigger('click')
      await wrapper.get('.player-filter button:nth-child(1)').trigger('click')
      expect(wrapper.findAll(`${firstCardSelector} .player-position-badge`).map((badge) => badge.text())).toEqual(['ST'])
      expect(playerStore.players.value[0].archived).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it('creates a multi-position player and resets both creation fields only after success', async () => {
    const storage = new MemoryStorage()
    const repository = createPlayerRepository({ storage })
    let playerStore!: ReturnType<typeof providePlayerStore>
    const Host = defineComponent({
      setup() {
        playerStore = providePlayerStore(repository)
        provideJerseySetStore(createJerseySetRepository({ storage }))
        return () => h(MyPlayersPage)
      },
    })
    const wrapper = mount(Host)

    try {
      await vi.waitFor(() => expect(wrapper.find('#create-player-name').exists()).toBe(true))
      await wrapper.get('#create-player-name').setValue('Sam')
      await wrapper.get('#create-player-position-IV').setValue(true)
      await wrapper.get('#create-player-position-DM').setValue(true)
      await wrapper.get('.player-profile-form').trigger('submit')
      await vi.waitFor(() => expect(playerStore.players.value).toHaveLength(1))

      expect(playerStore.players.value[0].positions).toEqual(['IV', 'DM'])
      expect((wrapper.get('#create-player-name').element as HTMLInputElement).value).toBe('')
      expect((wrapper.get('#create-player-position-IV').element as HTMLInputElement).checked).toBe(false)
      expect((wrapper.get('#create-player-position-DM').element as HTMLInputElement).checked).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it('retains the full creation draft after a persistence failure', async () => {
    const storage = new MemoryStorage()
    const repository = createPlayerRepository({ storage })
    let playerStore!: ReturnType<typeof providePlayerStore>
    const Host = defineComponent({
      setup() {
        playerStore = providePlayerStore(repository)
        provideJerseySetStore(createJerseySetRepository({ storage }))
        return () => h(MyPlayersPage)
      },
    })
    const wrapper = mount(Host)

    try {
      await vi.waitFor(() => expect(wrapper.find('#create-player-name').exists()).toBe(true))
      await wrapper.get('#create-player-name').setValue('Sam')
      await wrapper.get('#create-player-position-IV').setValue(true)
      await wrapper.get('#create-player-position-DM').setValue(true)
      storage.failNextWrite = true
      await wrapper.get('.player-profile-form').trigger('submit')

      await vi.waitFor(() => expect(wrapper.get('[role="alert"]').text()).toContain('Storage is full.'))
      expect(playerStore.players.value).toEqual([])
      expect((wrapper.get('#create-player-name').element as HTMLInputElement).value).toBe('Sam')
      expect((wrapper.get('#create-player-position-IV').element as HTMLInputElement).checked).toBe(true)
      expect((wrapper.get('#create-player-position-DM').element as HTMLInputElement).checked).toBe(true)
    } finally {
      wrapper.unmount()
    }
  })

  it('summarizes and atomically edits one player’s preferences across sets', async () => {
    const storage = new MemoryStorage()
    let playerStore!: ReturnType<typeof providePlayerStore>
    let jerseyStore!: ReturnType<typeof provideJerseySetStore>
    const Host = defineComponent({
      setup() {
        playerStore = providePlayerStore(createPlayerRepository({ storage }))
        jerseyStore = provideJerseySetStore(createJerseySetRepository({ storage }))
        return () => h(MyPlayersPage)
      },
    })
    const wrapper = mount(Host)

    try {
      await vi.waitFor(() => expect(wrapper.find('#create-player-name').exists()).toBe(true))
      await wrapper.get('#create-player-name').setValue('Alex')
      await wrapper.get('#create-player-position-DM').setValue(true)
      await wrapper.get('#create-player-jersey-size').setValue('S/M')
      await wrapper.get('.player-profile-form').trigger('submit')
      await vi.waitFor(() => expect(playerStore.players.value).toHaveLength(1))
      const alexId = playerStore.players.value[0].id

      await wrapper.get('#create-player-name').setValue('Ben')
      await wrapper.get('.player-profile-form').trigger('submit')
      await vi.waitFor(() => expect(playerStore.players.value).toHaveLength(2))
      const benId = playerStore.players.value[1].id

      await jerseyStore.createSet('Blue')
      await jerseyStore.createSet('White')
      const blueId = jerseyStore.sets.value[0].id
      const whiteId = jerseyStore.sets.value[1].id
      await jerseyStore.addJersey(blueId, { number: 7, size: 'M', ownerPlayerId: alexId })
      await jerseyStore.updatePlayerNumbers(alexId, [
        { setId: blueId, number: 7 },
        { setId: whiteId, number: 12 },
      ])
      await jerseyStore.updatePlayerNumbers(benId, [{ setId: blueId, number: 4 }])

      const alexCard = wrapper.get(`[data-player-id="${alexId}"]`)
      expect(alexCard.findAll('.preferred-number-list li').map((item) => item.text())).toEqual(['Blue 7', 'White 12'])
      const profileBefore = { ...playerStore.players.value[0], positions: [...playerStore.players.value[0].positions] }
      const writeCountBeforePreferenceSave = storage.setItemCalls

      await alexCard.get('button[aria-label^="Edit preferred numbers"]').trigger('click')
      expect((wrapper.get(`#preferred-player-${alexId}-${blueId}`).element as HTMLInputElement).value).toBe('7')
      expect((wrapper.get(`#preferred-player-${alexId}-${whiteId}`).element as HTMLInputElement).value).toBe('12')
      await wrapper.get(`#preferred-player-${alexId}-${blueId}`).setValue('0')
      await wrapper.get(`#preferred-player-${alexId}-${whiteId}`).setValue('20')
      await wrapper.get(`[data-player-id="${alexId}"] .preferred-number-form`).trigger('submit')

      await vi.waitFor(() => expect(jerseyStore.saving.value).toBe(false))
      expect(storage.setItemCalls - writeCountBeforePreferenceSave).toBe(1)
      expect(jerseyStore.sets.value.find((set) => set.id === blueId)?.preferredNumbers).toEqual([
        { playerId: alexId, number: 0 },
        { playerId: benId, number: 4 },
      ])
      expect(jerseyStore.sets.value.find((set) => set.id === whiteId)?.preferredNumbers).toEqual([
        { playerId: alexId, number: 20 },
      ])
      expect(jerseyStore.sets.value.find((set) => set.id === blueId)?.jerseys[0].ownerPlayerId).toBe(alexId)
      expect(playerStore.players.value[0]).toEqual(profileBefore)
      expect(wrapper.get(`[data-player-id="${alexId}"] .preferred-number-list`).text()).toContain('Blue 0')
      expect(wrapper.get(`[data-player-id="${alexId}"] .preferred-number-list`).text()).toContain('White 20')
    } finally {
      wrapper.unmount()
    }
  })

  it('cancels and retries preference drafts, reopening both editors from committed data', async () => {
    const storage = new MemoryStorage()
    let playerStore!: ReturnType<typeof providePlayerStore>
    let jerseyStore!: ReturnType<typeof provideJerseySetStore>
    const Host = defineComponent({
      setup() {
        playerStore = providePlayerStore(createPlayerRepository({ storage }))
        jerseyStore = provideJerseySetStore(createJerseySetRepository({ storage }))
        return () => h(MyPlayersPage)
      },
    })
    const wrapper = mount(Host)

    try {
      await vi.waitFor(() => expect(wrapper.find('#create-player-name').exists()).toBe(true))
      await wrapper.get('#create-player-name').setValue('Alex')
      await wrapper.get('.player-profile-form').trigger('submit')
      await vi.waitFor(() => expect(playerStore.players.value).toHaveLength(1))
      const playerId = playerStore.players.value[0].id
      const cardSelector = `[data-player-id="${playerId}"]`
      await jerseyStore.createSet('Blue')
      const setId = jerseyStore.sets.value[0].id
      await jerseyStore.updatePlayerNumbers(playerId, [{ setId, number: 7 }])

      await wrapper.get(`${cardSelector} button[aria-label^="Edit preferred numbers"]`).trigger('click')
      const preferenceInput = `#preferred-player-${playerId}-${setId}`
      await wrapper.get(preferenceInput).setValue('8')
      await wrapper.get(`${cardSelector} .preferred-number-form .cancel-button`).trigger('click')
      expect(wrapper.get(`${cardSelector} .preferred-number-list`).text()).toContain('Blue 7')

      await wrapper.get(`${cardSelector} button[aria-label^="Edit preferred numbers"]`).trigger('click')
      expect((wrapper.get(preferenceInput).element as HTMLInputElement).value).toBe('7')
      await wrapper.get(preferenceInput).setValue('9')
      storage.failNextWrite = true
      await wrapper.get(`${cardSelector} .preferred-number-form`).trigger('submit')
      await vi.waitFor(() => expect(wrapper.get(`${cardSelector} .preferred-number-form [role="alert"]`).text()).toContain('Storage is full.'))
      expect(jerseyStore.sets.value[0].preferredNumbers).toEqual([{ playerId, number: 7 }])
      expect(wrapper.get(`${cardSelector} .preferred-number-list`).text()).toContain('Blue 7')
      expect((wrapper.get(preferenceInput).element as HTMLInputElement).value).toBe('9')

      await wrapper.get(`${cardSelector} .preferred-number-form`).trigger('submit')
      await vi.waitFor(() => expect(jerseyStore.sets.value[0].preferredNumbers).toEqual([{ playerId, number: 9 }]))
      await wrapper.get(`${cardSelector} button[aria-label^="Edit preferred numbers"]`).trigger('click')
      expect((wrapper.get(preferenceInput).element as HTMLInputElement).value).toBe('9')
      await wrapper.get(`${cardSelector} .preferred-number-form .cancel-button`).trigger('click')

      await wrapper.get(`${cardSelector} button[aria-label^="Edit profile"]`).trigger('click')
      await wrapper.get(`#edit-player-${playerId}-name`).setValue('Uncommitted name')
      await wrapper.get(`${cardSelector} .player-profile-form button[type="button"]`).trigger('click')
      await wrapper.get(`${cardSelector} button[aria-label^="Edit profile"]`).trigger('click')
      expect((wrapper.get(`#edit-player-${playerId}-name`).element as HTMLInputElement).value).toBe('Alex')
      await wrapper.get(`#edit-player-${playerId}-name`).setValue('Alex Smith')
      await wrapper.get(`${cardSelector} .player-profile-form`).trigger('submit')
      await vi.waitFor(() => expect(playerStore.players.value[0].name).toBe('Alex Smith'))
      await wrapper.get(`${cardSelector} button[aria-label^="Edit profile"]`).trigger('click')
      expect((wrapper.get(`#edit-player-${playerId}-name`).element as HTMLInputElement).value).toBe('Alex Smith')
    } finally {
      wrapper.unmount()
    }
  })

  it('explains that a set is needed before preferred numbers can be entered', async () => {
    const storage = new MemoryStorage()
    let playerStore!: ReturnType<typeof providePlayerStore>
    const Host = defineComponent({
      setup() {
        playerStore = providePlayerStore(createPlayerRepository({ storage }))
        provideJerseySetStore(createJerseySetRepository({ storage }))
        return () => h(MyPlayersPage)
      },
    })
    const wrapper = mount(Host)

    try {
      await vi.waitFor(() => expect(wrapper.find('#create-player-name').exists()).toBe(true))
      await wrapper.get('#create-player-name').setValue('Sam')
      await wrapper.get('.player-profile-form').trigger('submit')
      await vi.waitFor(() => expect(playerStore.players.value).toHaveLength(1))
      const playerId = playerStore.players.value[0].id
      const cardSelector = `[data-player-id="${playerId}"]`

      await wrapper.get(`${cardSelector} button[aria-label^="Edit preferred numbers"]`).trigger('click')
      expect(wrapper.get(`${cardSelector} .no-preference-sets`).text()).toContain('Create a jersey set before')
      expect(wrapper.find(`${cardSelector} .preferred-number-form button[type="submit"]`).exists()).toBe(false)
      await wrapper.get(`${cardSelector} .preferred-number-form .cancel-button`).trigger('click')
      await wrapper.get(`${cardSelector} button[aria-label^="Edit profile"]`).trigger('click')
      expect(wrapper.find(`#edit-player-${playerId}-name`).exists()).toBe(true)
    } finally {
      wrapper.unmount()
    }
  })

  it('disables the preferred-number editor during a pending save and rejects overlap', async () => {
    const storage = new MemoryStorage()
    const repository = new ControlledJerseySetRepository([{
      id: 'blue-id', name: 'Blue', jerseys: [], preferredNumbers: [], createdAt: 1, updatedAt: 1,
    }])
    let playerStore!: ReturnType<typeof providePlayerStore>
    let jerseyStore!: ReturnType<typeof provideJerseySetStore>
    const Host = defineComponent({
      setup() {
        playerStore = providePlayerStore(createPlayerRepository({ storage }))
        jerseyStore = provideJerseySetStore(repository)
        return () => h(MyPlayersPage)
      },
    })
    const wrapper = mount(Host)

    try {
      await vi.waitFor(() => expect(wrapper.find('#create-player-name').exists()).toBe(true))
      await wrapper.get('#create-player-name').setValue('Alex')
      await wrapper.get('.player-profile-form').trigger('submit')
      await vi.waitFor(() => expect(playerStore.players.value).toHaveLength(1))
      const playerId = playerStore.players.value[0].id
      const cardSelector = `[data-player-id="${playerId}"]`
      await wrapper.get(`${cardSelector} button[aria-label^="Edit preferred numbers"]`).trigger('click')
      await wrapper.get(`#preferred-player-${playerId}-blue-id`).setValue('12')

      const pendingSave = deferredSave()
      repository.holdNextSave = pendingSave
      await wrapper.get(`${cardSelector} .preferred-number-form`).trigger('submit')
      expect(jerseyStore.saving.value).toBe(true)
      expect(wrapper.get(`${cardSelector} .preferred-number-form button[type="submit"]`).attributes('disabled')).toBeDefined()
      expect(wrapper.get(`${cardSelector} .preferred-number-form .cancel-button`).attributes('disabled')).toBeDefined()
      expect(jerseyStore.sets.value[0].preferredNumbers).toEqual([])
      await expect(jerseyStore.updatePlayerNumbers(playerId, [{ setId: 'blue-id', number: 3 }]))
        .rejects.toThrow('already being saved')

      pendingSave.release()
      await vi.waitFor(() => expect(jerseyStore.saving.value).toBe(false))
      expect(jerseyStore.sets.value[0].preferredNumbers).toEqual([{ playerId, number: 12 }])
      expect(repository.saveCalls).toBe(1)
    } finally {
      wrapper.unmount()
    }
  })

  it('rejects stale set drafts without recreating the removed set', async () => {
    const storage = new MemoryStorage()
    let playerStore!: ReturnType<typeof providePlayerStore>
    let jerseyStore!: ReturnType<typeof provideJerseySetStore>
    const Host = defineComponent({
      setup() {
        playerStore = providePlayerStore(createPlayerRepository({ storage }))
        jerseyStore = provideJerseySetStore(createJerseySetRepository({ storage }))
        return () => h(MyPlayersPage)
      },
    })
    const wrapper = mount(Host)

    try {
      await vi.waitFor(() => expect(wrapper.find('#create-player-name').exists()).toBe(true))
      await wrapper.get('#create-player-name').setValue('Alex')
      await wrapper.get('.player-profile-form').trigger('submit')
      await vi.waitFor(() => expect(playerStore.players.value).toHaveLength(1))
      const playerId = playerStore.players.value[0].id
      const cardSelector = `[data-player-id="${playerId}"]`
      await jerseyStore.createSet('Blue')
      const setId = jerseyStore.sets.value[0].id
      await jerseyStore.updatePlayerNumbers(playerId, [{ setId, number: 7 }])
      await wrapper.get(`${cardSelector} button[aria-label^="Edit preferred numbers"]`).trigger('click')
      const preferenceInput = `#preferred-player-${playerId}-${setId}`
      await wrapper.get(preferenceInput).setValue('8')

      await jerseyStore.removeSet(setId)
      const writesAfterRemoval = storage.setItemCalls
      await wrapper.get(`${cardSelector} .preferred-number-form`).trigger('submit')

      await vi.waitFor(() => expect(wrapper.get(`${cardSelector} .preferred-number-form [role="alert"]`).text()).toContain('no longer exists'))
      expect(jerseyStore.sets.value).toEqual([])
      expect(storage.setItemCalls).toBe(writesAfterRemoval)
      expect((wrapper.get(preferenceInput).element as HTMLInputElement).value).toBe('8')
    } finally {
      wrapper.unmount()
    }
  })

  it('keeps profiles editable during an inventory load error and restores summaries on retry', async () => {
    const storage = new MemoryStorage()
    const player = createPlayer({ name: 'Alex', positions: ['DM'], jerseySize: 'M' }, 100, 'alex-stable')
    await createPlayerRepository({ storage }).savePlayers([player])
    const seededJerseyRepository = createJerseySetRepository({ storage })
    await seededJerseyRepository.saveJerseySets([{
      id: 'blue-id',
      name: 'Blue',
      jerseys: [],
      preferredNumbers: [{ playerId: player.id, number: 7 }],
      createdAt: 100,
      updatedAt: 100,
    }])
    seededJerseyRepository.close()
    storage.failReadForKey = JERSEY_SET_STORAGE_KEY

    let playerStore!: ReturnType<typeof providePlayerStore>
    let jerseyStore!: ReturnType<typeof provideJerseySetStore>
    const Host = defineComponent({
      setup() {
        playerStore = providePlayerStore(createPlayerRepository({ storage }))
        jerseyStore = provideJerseySetStore(createJerseySetRepository({ storage }))
        return () => h(MyPlayersPage)
      },
    })
    const wrapper = mount(Host)

    try {
      await vi.waitFor(() => expect(wrapper.find('#create-player-name').exists()).toBe(true))
      const cardSelector = `[data-player-id="${player.id}"]`
      expect(wrapper.get('.preference-storage-error').text()).toContain('Saved preferred numbers are unavailable')
      expect(wrapper.find(`${cardSelector} .preference-summary-unavailable`).exists()).toBe(true)
      expect(wrapper.get(`${cardSelector} button[aria-label^="Edit preferred numbers"]`).attributes('disabled')).toBeDefined()

      await wrapper.get(`${cardSelector} button[aria-label^="Edit profile"]`).trigger('click')
      await wrapper.get(`#edit-player-${player.id}-name`).setValue('Alex Renamed')
      await wrapper.get(`${cardSelector} .player-profile-form`).trigger('submit')
      await vi.waitFor(() => expect(playerStore.players.value[0].name).toBe('Alex Renamed'))
      expect(jerseyStore.ready.value).toBe(false)

      await wrapper.get('.preference-storage-error button').trigger('click')
      await vi.waitFor(() => expect(jerseyStore.ready.value).toBe(true))
      expect(wrapper.get(`${cardSelector} .preferred-number-list`).text()).toContain('Blue 7')
      expect(jerseyStore.sets.value[0].preferredNumbers).toEqual([{ playerId: player.id, number: 7 }])
    } finally {
      wrapper.unmount()
    }
  })
})
