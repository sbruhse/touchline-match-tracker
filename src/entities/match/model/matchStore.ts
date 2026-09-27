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
import { createMatchRepository, type MatchRepository } from '../api/matchStorage'
import type { Match } from './match'

export interface MatchStore {
  matches: DeepReadonly<Ref<Match[]>>
  ready: DeepReadonly<Ref<boolean>>
  loading: DeepReadonly<Ref<boolean>>
  saving: DeepReadonly<Ref<boolean>>
  saveStatus: DeepReadonly<Ref<'saving' | 'saved' | 'error' | null>>
  error: DeepReadonly<Ref<string | null>>
  load: () => Promise<void>
  persist: (match: DeepReadonly<Match>) => Promise<Match>
  dispose: () => void
}

const matchStoreKey: InjectionKey<MatchStore> = Symbol('match-store')

function plainMatchSnapshot(match: DeepReadonly<Match>): Match {
  return {
    id: match.id,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    createdAt: match.createdAt,
    updatedAt: match.updatedAt,
    clock: {
      period: match.clock.period,
      elapsedMs: match.clock.elapsedMs,
      status: match.clock.status,
      startedAt: match.clock.startedAt,
    },
    goals: match.goals.map((goal) => ({ ...goal })),
    participation: match.participation ? {
      ownSide: match.participation.ownSide,
      squad: match.participation.squad.map((player) => ({ ...player })),
      starterIds: [...match.participation.starterIds],
      substitutions: match.participation.substitutions.map((event) => ({ ...event })),
    } : null,
    completedPeriodElapsedMs: { ...match.completedPeriodElapsedMs },
  }
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected storage error occurred.'
}

export function createMatchStore(repository: MatchRepository = createMatchRepository()): MatchStore {
  const matches = ref<Match[]>([])
  const ready = ref(false)
  const loading = ref(false)
  const saving = ref(false)
  const saveStatus = ref<'saving' | 'saved' | 'error' | null>(null)
  const error = ref<string | null>(null)
  let disposed = false

  async function load(): Promise<void> {
    if (disposed) throw new Error('Match store is disposed.')
    if (saving.value) throw new Error('A match update is currently being saved.')
    if (loading.value) throw new Error('Match data is already loading.')

    loading.value = true
    error.value = null
    try {
      const loadedMatches = await repository.listMatches()
      matches.value = [...loadedMatches].sort((a, b) => b.updatedAt - a.updatedAt)
      ready.value = true
    } catch (loadError) {
      error.value = messageFor(loadError)
      throw loadError
    } finally {
      loading.value = false
    }
  }

  async function persist(match: DeepReadonly<Match>): Promise<Match> {
    if (disposed) throw new Error('Match store is disposed.')
    if (!ready.value || loading.value) throw new Error('Match store is not ready.')
    if (saving.value) throw new Error('Another match update is already being saved.')

    const snapshot = plainMatchSnapshot(match)
    saving.value = true
    saveStatus.value = 'saving'
    error.value = null
    try {
      await repository.saveMatch(snapshot)
      matches.value = [
        ...matches.value.filter((savedMatch) => savedMatch.id !== snapshot.id),
        snapshot,
      ].sort((a, b) => b.updatedAt - a.updatedAt)
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
    matches: readonly(matches),
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

export function provideMatchStore(repository?: MatchRepository): MatchStore {
  const store = createMatchStore(repository)
  provide(matchStoreKey, store)
  onScopeDispose(store.dispose)
  return store
}

export function useMatchStore(): MatchStore {
  const store = inject(matchStoreKey)
  if (!store) throw new Error('Match store is not available in this application.')
  return store
}
