import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { MatchRepository } from '../../../entities/match'
import { provideMatchStore, type MatchStore } from '../../../entities/match'
import CreateMatchForm from './CreateMatchForm.vue'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('CreateMatchForm', () => {
  it('reports any raw team input as a draft until both inputs are empty', async () => {
    const repository: MatchRepository = {
      listMatches: async () => [],
      getMatch: async () => undefined,
      saveMatch: async () => undefined,
      close: () => undefined,
    }
    const Host = defineComponent({
      setup() {
        const store = provideMatchStore(repository)
        void store.load()
        return () => h(CreateMatchForm)
      },
    })
    const wrapper = mount(Host)
    await flushPromises()
    const form = wrapper.getComponent(CreateMatchForm)

    expect(form.emitted('draftChanged')?.[0]).toEqual([false])
    await wrapper.get('#home-team').setValue(' ')
    expect(form.emitted('draftChanged')?.at(-1)).toEqual([true])
    await wrapper.get('#away-team').setValue('Away Town')
    await wrapper.get('#home-team').setValue('')
    expect(form.emitted('draftChanged')?.at(-1)).toEqual([true])
    await wrapper.get('#away-team').setValue('')
    expect(form.emitted('draftChanged')?.at(-1)).toEqual([false])

    wrapper.unmount()
  })

  it('retains fields on failure and clears/emits only after a successful commit', async () => {
    const failedSave = deferred<void>()
    const savedMatches: Array<{ id: string; homeTeam: string; awayTeam: string }> = []
    const saveMatch = vi.fn(async (match) => {
      savedMatches.push(match)
      if (savedMatches.length === 1) await failedSave.promise
    })
    const repository: MatchRepository = {
      listMatches: async () => [],
      getMatch: async () => undefined,
      saveMatch,
      close: () => undefined,
    }
    let store!: MatchStore
    const Host = defineComponent({
      setup() {
        store = provideMatchStore(repository)
        void store.load()
        return () => h(CreateMatchForm)
      },
    })
    const wrapper = mount(Host)
    await flushPromises()
    const form = wrapper.findComponent(CreateMatchForm)
    await wrapper.get('#home-team').setValue('North City')
    await wrapper.get('#away-team').setValue('South Town')
    expect(form.emitted('draftChanged')?.at(-1)).toEqual([true])

    await wrapper.get('form').trigger('submit')
    expect(store.saving.value).toBe(true)
    expect(form.emitted('created')).toBeUndefined()
    expect((wrapper.get('#home-team').element as HTMLInputElement).disabled).toBe(true)

    failedSave.reject(new Error('Temporary write failure.'))
    await flushPromises()
    expect(store.matches.value).toEqual([])
    expect(store.error.value).toBe('Temporary write failure.')
    expect((wrapper.get('#home-team').element as HTMLInputElement).value).toBe('North City')
    expect((wrapper.get('#away-team').element as HTMLInputElement).value).toBe('South Town')
    expect(form.emitted('created')).toBeUndefined()
    expect(form.emitted('draftChanged')?.at(-1)).toEqual([true])

    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(store.saving.value).toBe(false)
    expect(form.emitted('created')).toEqual([[savedMatches[1].id]])
    expect((wrapper.get('#home-team').element as HTMLInputElement).value).toBe('')
    expect((wrapper.get('#away-team').element as HTMLInputElement).value).toBe('')
    expect(store.matches.value[0]).toMatchObject(savedMatches[1])
    expect(form.emitted('draftChanged')?.at(-1)).toEqual([false])
    wrapper.unmount()
  })
})
