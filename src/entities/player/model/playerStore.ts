import {
  inject,
  onScopeDispose,
  provide,
  ref,
  readonly,
  type DeepReadonly,
  type InjectionKey,
  type Ref,
} from 'vue'
import type { PlayerRepository } from '../api/playerStorage'
import { createPlayerRepository } from '../api/playerStorage'
import { normalizePlayerJerseySize, type Player } from './player'
import { normalizePlayerPositions } from './playerPositions'

export interface PlayerStore {
  players: DeepReadonly<Ref<Player[]>>
  ready: DeepReadonly<Ref<boolean>>
  loading: DeepReadonly<Ref<boolean>>
  saving: DeepReadonly<Ref<boolean>>
  saveStatus: DeepReadonly<Ref<'saving' | 'saved' | 'error' | null>>
  error: DeepReadonly<Ref<string | null>>
  load: () => Promise<void>
  persist: (player: DeepReadonly<Player>) => Promise<Player>
  dispose: () => void
}

const playerStoreKey: InjectionKey<PlayerStore> = Symbol('player-store')

function plainPlayerSnapshot(player: DeepReadonly<Player>): Player {
  const name = player.name.trim()
  if (!name) throw new Error('A player name is required.')
  if (!player.id.trim()) throw new Error('A player ID is required.')
  if (!Number.isFinite(player.createdAt) || !Number.isFinite(player.updatedAt)) {
    throw new Error('Player timestamps must be finite numbers.')
  }
  return {
    id: player.id,
    name,
    positions: normalizePlayerPositions(player.positions),
    jerseySize: normalizePlayerJerseySize(player.jerseySize),
    archived: player.archived,
    createdAt: player.createdAt,
    updatedAt: player.updatedAt,
  }
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected player storage error occurred.'
}

export function createPlayerStore(repository: PlayerRepository = createPlayerRepository()): PlayerStore {
  const players = ref<Player[]>([])
  const ready = ref(false)
  const loading = ref(false)
  const saving = ref(false)
  const saveStatus = ref<'saving' | 'saved' | 'error' | null>(null)
  const error = ref<string | null>(null)
  let disposed = false

  async function load(): Promise<void> {
    if (disposed) throw new Error('Player store is disposed.')
    if (saving.value) throw new Error('A player update is currently being saved.')
    if (loading.value) throw new Error('Player data is already loading.')

    loading.value = true
    error.value = null
    try {
      players.value = await repository.listPlayers()
      ready.value = true
    } catch (loadError) {
      error.value = messageFor(loadError)
      throw loadError
    } finally {
      loading.value = false
    }
  }

  async function persist(player: DeepReadonly<Player>): Promise<Player> {
    if (disposed) throw new Error('Player store is disposed.')
    if (!ready.value || loading.value) throw new Error('Player store is not ready.')
    if (saving.value) throw new Error('Another player update is already being saved.')

    const snapshot = plainPlayerSnapshot(player)
    const nextPlayers = players.value.some((saved) => saved.id === snapshot.id)
      ? players.value.map((saved) => saved.id === snapshot.id ? snapshot : saved)
      : [...players.value, snapshot]
    saving.value = true
    saveStatus.value = 'saving'
    error.value = null
    try {
      await repository.savePlayers(nextPlayers)
      players.value = nextPlayers
      saveStatus.value = 'saved'
      return snapshot
    } catch (saveError) {
      error.value = messageFor(saveError)
      saveStatus.value = 'error'
      throw saveError
    } finally {
      saving.value = false
    }
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    repository.close()
  }

  return {
    players: readonly(players),
    ready: readonly(ready),
    loading: readonly(loading),
    saving: readonly(saving),
    saveStatus: readonly(saveStatus),
    error: readonly(error),
    load,
    persist,
    dispose,
  }
}

export function providePlayerStore(repository?: PlayerRepository): PlayerStore {
  const store = createPlayerStore(repository)
  provide(playerStoreKey, store)
  onScopeDispose(store.dispose)
  return store
}

export function usePlayerStore(): PlayerStore {
  const store = inject(playerStoreKey)
  if (!store) throw new Error('Player store is not available in this application.')
  return store
}
