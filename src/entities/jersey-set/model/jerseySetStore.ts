import {
  inject,
  onScopeDispose,
  provide,
  readonly,
  ref,
  type DeepReadonly,
  type InjectionKey,
  type Ref,
} from 'vue'
import {
  addJersey,
  addJerseySet,
  removeJersey,
  removeJerseySet,
  renameJerseySet,
  updateJersey,
  updatePlayerSetNumbers,
  type JerseyDetailsInput,
  type PlayerSetNumberInput,
} from './jerseySetOperations'
import type { JerseySet } from './jerseySet'
import { normalizeJerseySets } from './jerseySet'
import type { JerseySetRepository } from '../api/jerseySetStorage'
import { createJerseySetRepository } from '../api/jerseySetStorage'

export interface JerseySetStore {
  sets: DeepReadonly<Ref<JerseySet[]>>
  ready: DeepReadonly<Ref<boolean>>
  loading: DeepReadonly<Ref<boolean>>
  saving: DeepReadonly<Ref<boolean>>
  saveStatus: DeepReadonly<Ref<'saving' | 'saved' | 'error' | null>>
  error: DeepReadonly<Ref<string | null>>
  load: () => Promise<void>
  createSet: (name: string) => Promise<void>
  renameSet: (setId: string, name: string) => Promise<void>
  removeSet: (setId: string) => Promise<void>
  addJersey: (setId: string, input: JerseyDetailsInput) => Promise<void>
  updateJersey: (setId: string, jerseyId: string, input: JerseyDetailsInput) => Promise<void>
  removeJersey: (setId: string, jerseyId: string) => Promise<void>
  updatePlayerNumbers: (playerId: string, updates: readonly PlayerSetNumberInput[]) => Promise<void>
  dispose: () => void
}

const jerseySetStoreKey: InjectionKey<JerseySetStore> = Symbol('jersey-set-store')

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected jersey inventory error occurred.'
}

export function createJerseySetStore(repository: JerseySetRepository = createJerseySetRepository()): JerseySetStore {
  const sets = ref<JerseySet[]>([])
  const ready = ref(false)
  const loading = ref(false)
  const saving = ref(false)
  const saveStatus = ref<'saving' | 'saved' | 'error' | null>(null)
  const error = ref<string | null>(null)
  let disposed = false

  async function load(): Promise<void> {
    if (disposed) throw new Error('Jersey-set store is disposed.')
    if (saving.value) throw new Error('A jersey inventory update is currently being saved.')
    if (loading.value) throw new Error('Jersey inventory is already loading.')

    loading.value = true
    error.value = null
    try {
      sets.value = normalizeJerseySets(await repository.listJerseySets())
      ready.value = true
    } catch (loadError) {
      error.value = messageFor(loadError)
      throw loadError
    } finally {
      loading.value = false
    }
  }

  async function commit(operation: (current: readonly JerseySet[]) => JerseySet[]): Promise<void> {
    if (disposed) throw new Error('Jersey-set store is disposed.')
    if (!ready.value || loading.value) throw new Error('Jersey-set store is not ready.')
    if (saving.value) throw new Error('Another jersey inventory update is already being saved.')

    const nextSets = normalizeJerseySets(operation(sets.value))
    saving.value = true
    saveStatus.value = 'saving'
    error.value = null
    try {
      await repository.saveJerseySets(nextSets)
      sets.value = nextSets
      saveStatus.value = 'saved'
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
    sets: readonly(sets),
    ready: readonly(ready),
    loading: readonly(loading),
    saving: readonly(saving),
    saveStatus: readonly(saveStatus),
    error: readonly(error),
    load,
    createSet: (name) => commit((current) => addJerseySet(current, name)),
    renameSet: (setId, name) => commit((current) => renameJerseySet(current, setId, name)),
    removeSet: (setId) => commit((current) => removeJerseySet(current, setId)),
    addJersey: (setId, input) => commit((current) => addJersey(current, setId, input)),
    updateJersey: (setId, jerseyId, input) => commit((current) => updateJersey(current, setId, jerseyId, input)),
    removeJersey: (setId, jerseyId) => commit((current) => removeJersey(current, setId, jerseyId)),
    updatePlayerNumbers: (playerId, updates) => commit((current) => updatePlayerSetNumbers(current, playerId, updates)),
    dispose,
  }
}

export function provideJerseySetStore(repository?: JerseySetRepository): JerseySetStore {
  const store = createJerseySetStore(repository)
  provide(jerseySetStoreKey, store)
  onScopeDispose(store.dispose)
  return store
}

export function useJerseySetStore(): JerseySetStore {
  const store = inject(jerseySetStoreKey)
  if (!store) throw new Error('Jersey-set store is not available in this application.')
  return store
}
