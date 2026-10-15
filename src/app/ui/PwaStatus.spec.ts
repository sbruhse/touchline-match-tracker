import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import PwaStatus from './PwaStatus.vue'
import type { PwaLifecycleState } from '../model/usePwa'

const mounted: VueWrapper[] = []

interface StatusProps {
  phase: PwaLifecycleState['phase']
  ready: boolean
  updateAvailable: boolean
  reloadAvailable: boolean
  applyingUpdate: boolean
  recoveryAvailable: boolean
  canReload: boolean
  error: string | null
}

const baseProps: StatusProps = {
  phase: 'ready',
  ready: true,
  updateAvailable: false,
  reloadAvailable: false,
  applyingUpdate: false,
  recoveryAvailable: false,
  canReload: true,
  error: null,
}

function mountStatus(props: Partial<StatusProps> = {}, attachToDocument = false) {
  const wrapper = mount(PwaStatus, {
    props: { ...baseProps, ...props },
    ...(attachToDocument ? { attachTo: document.body } : {}),
  })
  mounted.push(wrapper)
  return wrapper
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
})

describe('PwaStatus', () => {
  it('announces verified offline readiness politely without moving focus', () => {
    const wrapper = mountStatus({}, true)
    const status = wrapper.get('[role="status"]')

    expect(status.attributes('aria-live')).toBe('polite')
    expect(status.attributes('aria-atomic')).toBe('true')
    expect(status.text()).toContain('Ready to open offline in this browser.')
    expect(wrapper.findAll('button')).toHaveLength(0)
    expect(document.activeElement).toBe(document.body)
  })

  it('offers update and defer actions with touch-sized buttons and keeps focus on defer', async () => {
    const wrapper = mountStatus({ updateAvailable: true }, true)
    const update = wrapper.get('button.pwa-status-primary')
    const defer = wrapper.get('button.pwa-status-secondary')

    expect(wrapper.text()).toContain('An app update is ready')
    expect(update.text()).toBe('Update app')
    expect(update.attributes('disabled')).toBeUndefined()
    const updateButton = update.element as HTMLButtonElement
    updateButton.focus()
    expect(document.activeElement).toBe(updateButton)
    const componentSource = readFileSync(resolve(process.cwd(), 'src/app/ui/PwaStatus.vue'), 'utf8')
    expect(componentSource).toMatch(/\.pwa-status-actions button \{[^}]*min-height: 48px/s)
    expect(componentSource).toMatch(/button:focus-visible \{ outline: 3px solid/s)

    const deferButton = defer.element as HTMLButtonElement
    deferButton.focus()
    await defer.trigger('click')
    expect(wrapper.emitted('defer')).toHaveLength(1)
    expect(wrapper.text()).toContain('Update left for later')
    expect(wrapper.get('button.pwa-status-secondary').text()).toBe('Review update')
    expect(document.activeElement).toBe(deferButton)

    await wrapper.get('button.pwa-status-secondary').trigger('click')
    expect(wrapper.get('button.pwa-status-primary').text()).toBe('Update app')
  })

  it('offers a guarded reload after another tab activates a release', () => {
    const wrapper = mountStatus({ reloadAvailable: true })

    expect(wrapper.text()).toContain('A newer app release is active.')
    expect(wrapper.get('button.pwa-status-primary').text()).toBe('Reload app')
    expect(wrapper.get('button.pwa-status-primary').attributes('disabled')).toBeUndefined()
  })

  it('reports a failed update while confirming the offline release remains ready', () => {
    const wrapper = mountStatus({
      error: 'The new release could not be prepared. The current offline release is still ready.',
    })

    expect(wrapper.text()).toContain('App update failed.')
    expect(wrapper.text()).toContain('current offline release is still ready')
    expect(wrapper.text()).not.toMatch(/match save|could not save/i)
    expect(wrapper.findAll('button')).toHaveLength(0)
  })

  it('explains why update is unavailable while the archive is not reload-safe', () => {
    const wrapper = mountStatus({ updateAvailable: true, canReload: false })

    expect(wrapper.get('button.pwa-status-primary').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Finish or clear the match form')
    expect(wrapper.get('button.pwa-status-secondary').attributes('disabled')).toBeUndefined()
  })

  it('offers explicit online recovery and emits recovery intent', async () => {
    const wrapper = mountStatus({ recoveryAvailable: true, ready: false, phase: 'preparing' })

    expect(wrapper.text()).toContain('saved match data stays separate')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('recover')).toHaveLength(1)
  })

  it('keeps recovery unavailable until both the archive gate and connection are safe', async () => {
    const wrapper = mountStatus({ recoveryAvailable: true, ready: false, phase: 'preparing', canReload: false })
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('wait for local saves before recovery')

    const onlineDescriptor = Object.getOwnPropertyDescriptor(navigator, 'onLine')
    try {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
      window.dispatchEvent(new Event('offline'))
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).toContain('Connect to the internet')
      expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    } finally {
      if (onlineDescriptor) Object.defineProperty(navigator, 'onLine', onlineDescriptor)
      else Reflect.deleteProperty(navigator, 'onLine')
      window.dispatchEvent(new Event('online'))
    }
  })

  it('offers a retry after preparation failure and stays non-actionable when unsupported', async () => {
    const failed = mountStatus({ phase: 'error', ready: false, error: 'Worker install failed.' })
    expect(failed.text()).toContain('Worker install failed.')
    await failed.get('button').trigger('click')
    expect(failed.emitted('retry')).toHaveLength(1)

    const unsupported = mountStatus({ phase: 'unsupported', ready: false })
    expect(unsupported.text()).toContain('Touchline remains available in this browser.')
    expect(unsupported.findAll('button')).toHaveLength(0)
  })
})
