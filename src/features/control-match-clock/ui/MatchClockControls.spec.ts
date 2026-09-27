import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { createMatch, provideMatchStore, type Match, type MatchRepository, type MatchStore } from '../../../entities/match'
import MatchClockControls from './MatchClockControls.vue'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('MatchClockControls', () => {
  it('uses the click-time clock timestamp and emits success only after commit', async () => {
    const original: Match = {
      ...createMatch('North City', 'South Town', 100, 'running-match'),
      clock: { period: 1, elapsedMs: 1_000, status: 'running', startedAt: 2_000 },
    }
    const pendingSave = deferred<void>()
    let savedMatch: Match | undefined
    const repository: MatchRepository = {
      listMatches: async () => [original],
      getMatch: async () => original,
      async saveMatch(match) {
        savedMatch = match
        await pendingSave.promise
      },
      close: () => undefined,
    }
    let store!: MatchStore
    const Host = defineComponent({
      setup() {
        store = provideMatchStore(repository)
        void store.load()
        return () => h(MatchClockControls, {
          matchId: original.id,
          onUpdated: (now: number) => updatedTimes.push(now),
        })
      },
    })
    const updatedTimes: number[] = []
    const wrapper = mount(Host)
    const now = vi.spyOn(Date, 'now').mockReturnValue(2_500)
    try {
      await flushPromises()
      await wrapper.get('button').trigger('click')

      expect(store.saving.value).toBe(true)
      expect(store.matches.value).toEqual([original])
      expect(savedMatch).toMatchObject({
        updatedAt: 2_500,
        clock: { status: 'paused', elapsedMs: 1_500, startedAt: null },
      })
      expect(updatedTimes).toEqual([])
      expect((wrapper.get('button').element as HTMLButtonElement).disabled).toBe(true)

      now.mockReturnValue(9_000)
      pendingSave.resolve()
      await flushPromises()

      expect(store.matches.value[0]).toEqual(savedMatch)
      expect(updatedTimes).toEqual([2_500])
    } finally {
      now.mockRestore()
      wrapper.unmount()
    }
  })
})
