import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import { createPlayerRepository, type PlayerStorageLike } from '../api/playerStorage'
import {
  archivePlayer,
  createPlayer,
  renamePlayer,
  restorePlayer,
  updatePlayerProfile,
  type Player,
} from './player'
import type { PlayerPosition } from './playerPositions'
import { createPlayerStore, providePlayerStore, usePlayerStore, type PlayerStore } from './playerStore'

class MemoryStorage implements PlayerStorageLike {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

describe('app-scoped player store', () => {
  it('creates, renames, archives, restores, and reloads one stable identity', async () => {
    const storage = new MemoryStorage()
    const store = createPlayerStore(createPlayerRepository({ storage }))
    await store.load()

    const created = await store.persist(createPlayer(' Alex ', 100, 'player-alex'))
    expect(store.players.value).toEqual([created])

    const reloaded = createPlayerStore(createPlayerRepository({ storage }))
    await reloaded.load()
    expect(reloaded.players.value).toEqual([created])

    const renamed = await reloaded.persist(renamePlayer(reloaded.players.value[0], 'Alex Smith', 200))
    expect(renamed).toMatchObject({ id: created.id, name: 'Alex Smith', createdAt: 100, updatedAt: 200 })

    const archived = await reloaded.persist(archivePlayer(renamed, 300))
    expect(archived).toMatchObject({ id: created.id, archived: true })
    const archiveReload = createPlayerStore(createPlayerRepository({ storage }))
    await archiveReload.load()
    expect(archiveReload.players.value).toEqual([archived])

    const restored = await archiveReload.persist(restorePlayer(archiveReload.players.value[0], 400))
    expect(restored).toMatchObject({ id: created.id, archived: false })

    const afterReload = createPlayerStore(createPlayerRepository({ storage }))
    await afterReload.load()
    expect(afterReload.players.value).toEqual([restored])
  })

  it('keeps same-name players distinct and rejects blank persisted names', async () => {
    const storage = new MemoryStorage()
    const store = createPlayerStore(createPlayerRepository({ storage }))
    await store.load()
    const first = createPlayer('Alex', 100, 'alex-one')
    const second = createPlayer('Alex', 200, 'alex-two')

    await store.persist(first)
    await store.persist(second)
    expect(store.players.value.map((player) => player.id)).toEqual(['alex-one', 'alex-two'])
    const duplicateNameReload = createPlayerStore(createPlayerRepository({ storage }))
    await duplicateNameReload.load()
    expect(duplicateNameReload.players.value).toEqual([first, second])

    await expect(store.persist({ ...first, name: '  ' })).rejects.toThrow('A player name is required.')
    expect(store.players.value).toEqual([first, second])
    expect((await createPlayerRepository({ storage }).listPlayers())).toEqual([first, second])
  })

  it('copies readonly position snapshots and preserves independent same-name profiles across saves', async () => {
    const storage = new MemoryStorage()
    const store = createPlayerStore(createPlayerRepository({ storage }))
    await store.load()
    const retainedPositions: PlayerPosition[] = ['DM', 'IV']
    const readonlyPositions: readonly PlayerPosition[] = retainedPositions
    const first = {
      ...createPlayer({ name: 'Alex', positions: [], jerseySize: 'M' }, 100, 'alex-one'),
      positions: readonlyPositions,
    }
    const second = createPlayer({ name: 'Alex', positions: ['ST'], jerseySize: 'L' }, 200, 'alex-two')

    await store.persist(first)
    await store.persist(second)
    retainedPositions.push('TW')
    expect(store.players.value.map(({ id, positions, jerseySize }) => ({ id, positions, jerseySize }))).toEqual([
      { id: 'alex-one', positions: ['IV', 'DM'], jerseySize: 'M' },
      { id: 'alex-two', positions: ['ST'], jerseySize: 'L' },
    ])

    const edited = updatePlayerProfile(store.players.value[0], { name: 'Alex Smith', positions: ['OM'] }, 300)
    await store.persist(edited)
    expect(store.players.value.map(({ id, positions, jerseySize }) => ({ id, positions, jerseySize }))).toEqual([
      { id: 'alex-one', positions: ['OM'], jerseySize: 'M' },
      { id: 'alex-two', positions: ['ST'], jerseySize: 'L' },
    ])

    const reloaded = createPlayerStore(createPlayerRepository({ storage }))
    await reloaded.load()
    expect(reloaded.players.value).toEqual(store.players.value)
  })

  it('rejects malformed positions without publishing or saving the invalid snapshot', async () => {
    const storage = new MemoryStorage()
    const store = createPlayerStore(createPlayerRepository({ storage }))
    await store.load()
    const saved = createPlayer({ name: 'Alex', positions: ['IV'] }, 100, 'alex-one')
    await store.persist(saved)
    const rawBefore = storage.getItem('touchline.player-store')

    await expect(store.persist({ ...saved, positions: ['XYZ'] as never })).rejects.toThrow('Unknown player position')
    expect(store.players.value).toEqual([saved])
    expect(storage.getItem('touchline.player-store')).toBe(rawBefore)
  })

  it('provides isolated stores to independently mounted app roots', async () => {
    let firstProvided!: PlayerStore
    let firstConsumed!: PlayerStore
    let secondProvided!: PlayerStore
    let secondConsumed!: PlayerStore
    const firstRepository = createPlayerRepository({ storage: new MemoryStorage() })
    const secondRepository = createPlayerRepository({ storage: new MemoryStorage() })

    function appRoot(repository: typeof firstRepository, capture: (store: PlayerStore) => void, captureUse: (store: PlayerStore) => void) {
      const Consumer = defineComponent({
        setup() {
          const store = usePlayerStore()
          captureUse(store)
          return () => h('span', store.players.value.length)
        },
      })
      return defineComponent({
        setup() {
          capture(providePlayerStore(repository))
          return () => h(Consumer)
        },
      })
    }

    const firstApp = mount(appRoot(firstRepository, (store) => { firstProvided = store }, (store) => { firstConsumed = store }))
    const secondApp = mount(appRoot(secondRepository, (store) => { secondProvided = store }, (store) => { secondConsumed = store }))
    try {
      expect(firstConsumed).toBe(firstProvided)
      expect(secondConsumed).toBe(secondProvided)
      expect(firstProvided).not.toBe(secondProvided)
      await Promise.all([firstProvided.load(), secondProvided.load()])

      const firstPlayer: Player = createPlayer('Alex', 100, 'first-app-player')
      await firstProvided.persist(firstPlayer)
      expect(firstProvided.players.value.map((player) => player.id)).toEqual([firstPlayer.id])
      expect(secondProvided.players.value).toEqual([])
      expect(firstApp.text()).toBe('1')
      expect(secondApp.text()).toBe('0')
    } finally {
      firstApp.unmount()
      secondApp.unmount()
    }
  })
})
