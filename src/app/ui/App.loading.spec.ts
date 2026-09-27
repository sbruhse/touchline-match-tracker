import { flushPromises, mount } from '@vue/test-utils'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App.vue'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App storage readiness', () => {
  it('shows loading instead of treating an unresolved initial load as an empty archive', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    const wrapper = mount(App)

    expect(wrapper.get('[role="status"]').text()).toContain('Loading your matches')
    expect(wrapper.find('.new-match-card').exists()).toBe(false)
    expect(wrapper.find('.empty-archive').exists()).toBe(false)

    await vi.waitFor(() => expect(wrapper.find('.empty-archive').exists()).toBe(true))
    wrapper.unmount()
  })

  it('shows a recoverable load error and keeps all writes unavailable until retry succeeds', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const wrapper = mount(App)
    expect(wrapper.find('.new-match-card').exists()).toBe(false)

    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('could not be loaded')
    expect(wrapper.get('[role="alert"] button').text()).toBe('Try again')
    expect(wrapper.find('.match-list-item').exists()).toBe(false)
    expect(wrapper.find('.goal-button').exists()).toBe(false)

    await wrapper.get('.storage-retry').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('could not be loaded')
    expect(wrapper.find('.new-match-card').exists()).toBe(false)
    wrapper.unmount()
  })
})
