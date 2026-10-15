import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import {
  createJerseySetRepository,
  provideJerseySetStore,
  type JerseySetRepository,
  type JerseySetStorageLike,
} from '../../../entities/jersey-set'
import { createPlayer, createPlayerRepository, renamePlayer, type PlayerRepository, type PlayerStorageLike } from '../../../entities/player'
import { providePlayerStore } from '../../../entities/player'
import JerseySetsPage from '../../../pages/jersey-sets/ui/JerseySetsPage.vue'

class MemoryStorage implements JerseySetStorageLike, PlayerStorageLike {
  private readonly values = new Map<string, string>()
  writes: string[] = []
  failNextWrite = false

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.writes.push(key)
    if (this.failNextWrite) {
      this.failNextWrite = false
      throw new Error('Storage is full.')
    }
    this.values.set(key, value)
  }
}

function mountPage(storage: MemoryStorage, options: {
  jerseyRepository?: JerseySetRepository
  playerRepository?: PlayerRepository
} = {}) {
  let jerseyStore!: ReturnType<typeof provideJerseySetStore>
  let playerStore!: ReturnType<typeof providePlayerStore>
  const Host = defineComponent({
    setup() {
      jerseyStore = provideJerseySetStore(options.jerseyRepository ?? createJerseySetRepository({ storage }))
      playerStore = providePlayerStore(options.playerRepository ?? createPlayerRepository({ storage }))
      return () => h(JerseySetsPage)
    },
  })
  return { wrapper: mount(Host), get jerseyStore() { return jerseyStore }, get playerStore() { return playerStore } }
}

describe('ManageJerseySets', () => {
  it('starts empty, validates set names, and keeps same-name sets independently editable', async () => {
    const storage = new MemoryStorage()
    const { wrapper, jerseyStore } = mountPage(storage)

    try {
      await vi.waitFor(() => expect(wrapper.find('#create-jersey-set-button').exists()).toBe(true))
      expect(wrapper.get('.empty-set-list').text()).toContain('Create one')
      expect(wrapper.get('.selected-set-empty').text()).toContain('Create a named set')

      await wrapper.get('#create-jersey-set-button').trigger('click')
      await wrapper.get('#create-jersey-set-name').setValue('   ')
      await wrapper.get('.jersey-set-form').trigger('submit')
      expect(wrapper.get('.jersey-set-form [role="alert"]').text()).toBe('A jersey set name is required.')
      expect(jerseyStore.sets.value).toEqual([])

      await wrapper.get('#create-jersey-set-name').setValue('Blue')
      await wrapper.get('.jersey-set-form').trigger('submit')
      await vi.waitFor(() => expect(jerseyStore.sets.value).toHaveLength(1))
      const firstId = jerseyStore.sets.value[0].id
      await wrapper.get('#create-jersey-set-button').trigger('click')
      await wrapper.get('#create-jersey-set-name').setValue(' Blue ')
      await wrapper.get('.jersey-set-form').trigger('submit')
      await vi.waitFor(() => expect(jerseyStore.sets.value).toHaveLength(2))
      const secondId = jerseyStore.sets.value[1].id
      const labels = wrapper.findAll('.jersey-set-row .set-select').map((button) => button.attributes('aria-label'))
      expect(labels).toEqual(expect.arrayContaining([
        expect.stringMatching(/^Select Blue · /),
        expect.stringMatching(/^Select Blue · /),
      ]))
      expect(new Set(labels).size).toBe(2)

      await wrapper.get(`#rename-jersey-set-${firstId}`).trigger('click')
      await wrapper.get(`#edit-jersey-set-${firstId}-name`).setValue('Home Blue')
      await wrapper.get('.jersey-set-form').trigger('submit')
      await vi.waitFor(() => expect(jerseyStore.sets.value[0].name).toBe('Home Blue'))
      expect(jerseyStore.sets.value.map(({ id }) => id)).toEqual([firstId, secondId])
      expect(jerseyStore.sets.value[1].name).toBe('Blue')
    } finally {
      wrapper.unmount()
    }
  })

  it('validates and targets duplicate jersey rows independently for create, edit, and remove', async () => {
    const storage = new MemoryStorage()
    const { wrapper, jerseyStore } = mountPage(storage)

    try {
      await vi.waitFor(() => expect(wrapper.find('#create-jersey-set-button').exists()).toBe(true))
      await wrapper.get('#create-jersey-set-button').trigger('click')
      await wrapper.get('#create-jersey-set-name').setValue('Home')
      await wrapper.get('.jersey-set-form').trigger('submit')
      await vi.waitFor(() => expect(jerseyStore.sets.value).toHaveLength(1))
      const setId = jerseyStore.sets.value[0].id
      const addButton = `#add-jersey-${setId}`

      await wrapper.get(addButton).trigger('click')
      await wrapper.get(`#create-jersey-${setId}-number`).setValue('-1')
      await wrapper.get(`#create-jersey-${setId}-size`).setValue('M')
      await wrapper.get('.jersey-form').trigger('submit')
      expect(wrapper.get('.jersey-form [role="alert"]').text()).toContain('whole number')
      expect(jerseyStore.sets.value[0].jerseys).toEqual([])

      await wrapper.get(`#create-jersey-${setId}-number`).setValue('00')
      await wrapper.get('.jersey-form').trigger('submit')
      await vi.waitFor(() => expect(jerseyStore.sets.value[0].jerseys).toHaveLength(1))
      const firstJerseyId = jerseyStore.sets.value[0].jerseys[0].id
      expect(jerseyStore.sets.value[0].jerseys[0]).toMatchObject({ number: 0, size: 'M', ownerPlayerId: null })

      await wrapper.get(addButton).trigger('click')
      await wrapper.get(`#create-jersey-${setId}-number`).setValue('0')
      await wrapper.get(`#create-jersey-${setId}-size`).setValue('M')
      await wrapper.get('.jersey-form').trigger('submit')
      await vi.waitFor(() => expect(jerseyStore.sets.value[0].jerseys).toHaveLength(2))
      const secondJerseyId = jerseyStore.sets.value[0].jerseys[1].id
      const itemLabels = wrapper.findAll('.jersey-row .jersey-row-copy strong').map((item) => item.text())
      expect(new Set(itemLabels).size).toBe(2)

      await wrapper.get(`#edit-jersey-${secondJerseyId}`).trigger('click')
      await wrapper.get(`#edit-jersey-${secondJerseyId}-number`).setValue('7')
      await wrapper.get(`#edit-jersey-${secondJerseyId}-size`).setValue('L')
      await wrapper.get(`[data-jersey-id="${secondJerseyId}"] .jersey-form`).trigger('submit')
      await vi.waitFor(() => expect(jerseyStore.sets.value[0].jerseys[1]).toMatchObject({ number: 7, size: 'L' }))
      expect(jerseyStore.sets.value[0].jerseys[0]).toMatchObject({ id: firstJerseyId, number: 0, size: 'M' })

      await wrapper.get(`[data-jersey-id="${firstJerseyId}"] button[aria-label^="Remove"]`).trigger('click')
      await vi.waitFor(() => expect(jerseyStore.sets.value[0].jerseys).toHaveLength(1))
      expect(jerseyStore.sets.value[0].jerseys[0]).toMatchObject({ id: secondJerseyId, number: 7, size: 'L' })
    } finally {
      wrapper.unmount()
    }
  })

  it('keeps set and jersey drafts out of saved summaries until explicit save', async () => {
    const storage = new MemoryStorage()
    const { wrapper, jerseyStore } = mountPage(storage)

    try {
      await vi.waitFor(() => expect(wrapper.find('#create-jersey-set-button').exists()).toBe(true))
      await wrapper.get('#create-jersey-set-button').trigger('click')
      await wrapper.get('#create-jersey-set-name').setValue('Home')
      expect(wrapper.findAll('.jersey-set-row')).toHaveLength(0)
      await wrapper.get('.jersey-set-form button[type="button"]').trigger('click')
      expect(jerseyStore.sets.value).toEqual([])

      await wrapper.get('#create-jersey-set-button').trigger('click')
      await wrapper.get('#create-jersey-set-name').setValue('Home')
      await wrapper.get('.jersey-set-form').trigger('submit')
      await vi.waitFor(() => expect(jerseyStore.sets.value).toHaveLength(1))
      const setId = jerseyStore.sets.value[0].id

      await wrapper.get(`#add-jersey-${setId}`).trigger('click')
      await wrapper.get(`#create-jersey-${setId}-number`).setValue('9')
      await wrapper.get(`#create-jersey-${setId}-size`).setValue('L')
      expect(wrapper.findAll('.jersey-row')).toHaveLength(0)
      await wrapper.get('.jersey-form button[type="button"]').trigger('click')
      expect(jerseyStore.sets.value[0].jerseys).toEqual([])
      expect(wrapper.findAll('.jersey-row')).toHaveLength(0)
    } finally {
      wrapper.unmount()
    }
  })

  it('confirms aggregate removal and retains all dependent data after a failed save for retry', async () => {
    const storage = new MemoryStorage()
    const home = {
      id: 'home', name: 'Home',
      jerseys: [{ id: 'home-seven', number: 7, size: 'M', ownerPlayerId: 'alex' }],
      preferredNumbers: [{ playerId: 'alex', number: 7 }], createdAt: 100, updatedAt: 200,
    }
    const away = {
      id: 'away', name: 'Away',
      jerseys: [{ id: 'away-twelve', number: 12, size: 'L', ownerPlayerId: null }],
      preferredNumbers: [{ playerId: 'ben', number: 12 }], createdAt: 300, updatedAt: 400,
    }
    const jerseyRepository = createJerseySetRepository({ storage })
    await jerseyRepository.saveJerseySets([home, away])
    await createPlayerRepository({ storage }).savePlayers([createPlayer('Alex', 500, 'alex')])
    const payloadBefore = storage.getItem('touchline.jersey-set-store')
    const { wrapper, jerseyStore, playerStore } = mountPage(storage)

    try {
      await vi.waitFor(() => expect(jerseyStore.ready.value && playerStore.ready.value).toBe(true))
      await wrapper.get('#remove-jersey-set-home').trigger('click')
      expect(wrapper.get('[role="alertdialog"]').text()).toContain('1 jersey')
      expect(wrapper.get('[role="alertdialog"]').text()).toContain('1 player preference')
      await wrapper.get('[role="alertdialog"] .cancel-button').trigger('click')
      expect(jerseyStore.sets.value).toHaveLength(2)

      await wrapper.get('#remove-jersey-set-home').trigger('click')
      storage.failNextWrite = true
      await wrapper.get('[role="alertdialog"] .danger-button').trigger('click')
      await vi.waitFor(() => expect(wrapper.get('[role="alert"]').text()).toContain('Storage is full.'))
      expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true)
      expect(jerseyStore.sets.value).toEqual([home, away])
      expect(storage.getItem('touchline.jersey-set-store')).toBe(payloadBefore)
      expect(playerStore.players.value).toHaveLength(1)

      await wrapper.get('[role="alertdialog"] .danger-button').trigger('click')
      await vi.waitFor(() => expect(jerseyStore.sets.value).toHaveLength(1))
      expect(jerseyStore.sets.value[0]).toMatchObject(away)
      expect(jerseyStore.sets.value[0].preferredNumbers).toEqual([{ playerId: 'ben', number: 12 }])
      expect(playerStore.players.value).toHaveLength(1)
      expect(JSON.parse(storage.getItem('touchline.jersey-set-store')!).sets).toHaveLength(1)
    } finally {
      wrapper.unmount()
    }
  })

  it('keeps committed summaries unchanged and disables actions during a pending inventory write', async () => {
    const storage = new MemoryStorage()
    let releaseSave!: () => void
    const saved = new Promise<void>((resolve) => { releaseSave = resolve })
    let firstWrite = true
    const repository: JerseySetRepository = {
      async listJerseySets() { return [] },
      async saveJerseySets() {
        if (!firstWrite) return
        firstWrite = false
        await saved
      },
      close() {},
    }
    const { wrapper, jerseyStore } = mountPage(storage, { jerseyRepository: repository })

    try {
      await vi.waitFor(() => expect(jerseyStore.ready.value).toBe(true))
      await wrapper.get('#create-jersey-set-button').trigger('click')
      await wrapper.get('#create-jersey-set-name').setValue('Pending')
      await wrapper.get('.jersey-set-form').trigger('submit')
      await vi.waitFor(() => expect(jerseyStore.saving.value).toBe(true))
      expect(wrapper.get('.inventory-saving').text()).toContain('Saving')
      expect(jerseyStore.sets.value).toEqual([])
      expect(wrapper.findAll('.jersey-set-row')).toHaveLength(0)
      expect((wrapper.get('.jersey-set-form button[type="submit"]').element as HTMLButtonElement).disabled).toBe(true)

      releaseSave()
      await vi.waitFor(() => expect(jerseyStore.sets.value).toHaveLength(1))
      expect(jerseyStore.sets.value[0].name).toBe('Pending')
    } finally {
      releaseSave()
      wrapper.unmount()
    }
  })

  it('resolves active and archived owners by stable player identity and follows renames', async () => {
    const storage = new MemoryStorage()
    const active = createPlayer({ name: 'Alex', positions: [], jerseySize: 'M' }, 100, 'alex-active')
    const archived = { ...createPlayer({ name: 'Alex', positions: [], jerseySize: 'XL' }, 200, 'alex-archived'), archived: true }
    await createPlayerRepository({ storage }).savePlayers([active, archived])
    const { wrapper, jerseyStore, playerStore } = mountPage(storage)

    try {
      await vi.waitFor(() => expect(playerStore.ready.value).toBe(true))
      await wrapper.get('#create-jersey-set-button').trigger('click')
      await wrapper.get('#create-jersey-set-name').setValue('Home')
      await wrapper.get('.jersey-set-form').trigger('submit')
      await vi.waitFor(() => expect(jerseyStore.sets.value).toHaveLength(1))
      const setId = jerseyStore.sets.value[0].id
      await jerseyStore.updatePlayerNumbers(archived.id, [{ setId, number: 12 }])

      await wrapper.get(`#add-jersey-${setId}`).trigger('click')
      await wrapper.get(`#create-jersey-${setId}-number`).setValue('7')
      await wrapper.get(`#create-jersey-${setId}-size`).setValue('M')
      const owner = wrapper.get(`#create-jersey-${setId}-owner`)
      expect(owner.text()).toContain('Alex · alexac')
      expect(owner.text()).toContain('Alex · alexar (Archived)')
      const unknownOption = document.createElement('option')
      unknownOption.value = 'not-in-directory'
      unknownOption.textContent = 'Unknown player'
      ;(owner.element as HTMLSelectElement).add(unknownOption)
      await owner.setValue('not-in-directory')
      await wrapper.get('.jersey-form').trigger('submit')
      expect(wrapper.get('.jersey-form [role="alert"]').text()).toContain('Choose a player from the loaded directory')
      expect(jerseyStore.sets.value[0].jerseys).toEqual([])

      await owner.setValue(archived.id)
      await wrapper.get('.jersey-form').trigger('submit')
      await vi.waitFor(() => expect(jerseyStore.sets.value[0].jerseys[0]).toMatchObject({
        ownerPlayerId: archived.id, size: 'M',
      }))
      expect(playerStore.players.value.map(({ id, jerseySize }) => ({ id, jerseySize }))).toEqual([
        { id: active.id, jerseySize: 'M' },
        { id: archived.id, jerseySize: 'XL' },
      ])
      expect(jerseyStore.sets.value[0].preferredNumbers).toEqual([{ playerId: archived.id, number: 12 }])
      expect(wrapper.get('.jersey-row-copy span').text()).toBe('Owned by Alex · alexar (Archived)')

      await playerStore.persist(renamePlayer(playerStore.players.value.find((player) => player.id === archived.id)!, 'Alex Renamed'))
      await vi.waitFor(() => expect(wrapper.get('.jersey-row-copy span').text()).toBe('Owned by Alex Renamed (Archived)'))
      expect(jerseyStore.sets.value[0].preferredNumbers).toEqual([{ playerId: archived.id, number: 12 }])
    } finally {
      wrapper.unmount()
    }
  })

  it('preserves unresolved owners during unrelated edits and permits an explicit team transfer', async () => {
    const storage = new MemoryStorage()
    await createJerseySetRepository({ storage }).saveJerseySets([{
      id: 'home', name: 'Home',
      jerseys: [{ id: 'unresolved-jersey', number: 7, size: 'M', ownerPlayerId: 'missing-player' }],
      preferredNumbers: [], createdAt: 100, updatedAt: 100,
    }])
    const unavailablePlayers: PlayerRepository = {
      async listPlayers() { throw new Error('Player directory unavailable.') },
      async savePlayers() { throw new Error('Player directory unavailable.') },
      close() {},
    }
    const { wrapper, jerseyStore } = mountPage(storage, { playerRepository: unavailablePlayers })

    try {
      await vi.waitFor(() => expect(jerseyStore.ready.value).toBe(true))
      await vi.waitFor(() => expect(wrapper.get('.owner-directory-note').text()).toContain('Existing owners are kept'))
      expect(wrapper.get('.jersey-row-copy span').text()).toContain('Unavailable player · miss')
      await wrapper.get('#edit-jersey-unresolved-jersey').trigger('click')
      expect((wrapper.get('#edit-jersey-unresolved-jersey-owner').element as HTMLSelectElement).value).toBe('missing-player')
      expect(wrapper.get('#edit-jersey-unresolved-jersey-owner').text()).toContain('Unavailable player · miss')
      await wrapper.get('#edit-jersey-unresolved-jersey-number').setValue('12')
      await wrapper.get('[data-jersey-id="unresolved-jersey"] .jersey-form').trigger('submit')
      await vi.waitFor(() => expect(jerseyStore.sets.value[0].jerseys[0]).toMatchObject({
        id: 'unresolved-jersey', number: 12, ownerPlayerId: 'missing-player',
      }))

      await wrapper.get('#edit-jersey-unresolved-jersey').trigger('click')
      await wrapper.get('#edit-jersey-unresolved-jersey-owner').setValue('')
      await wrapper.get('[data-jersey-id="unresolved-jersey"] .jersey-form').trigger('submit')
      await vi.waitFor(() => expect(jerseyStore.sets.value[0].jerseys[0].ownerPlayerId).toBeNull())
    } finally {
      wrapper.unmount()
    }
  })
})
