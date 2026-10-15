import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import {
  createPwaLifecycle,
  type PwaLifecycleDependencies,
  type PwaRegistration,
  type PwaWorker,
} from './usePwa'
import type { PwaCacheHealth } from '../lib/pwaCache'

function cacheHealth(ready: boolean, reason?: PwaCacheHealth['reason']): PwaCacheHealth {
  return { ready, ...(reason ? { reason } : {}), missingResources: [] }
}

class TestWorker extends EventTarget implements PwaWorker {
  postMessage = vi.fn((_message: unknown) => undefined)

  constructor(public state: ServiceWorkerState) {
    super()
  }

  transition(state: ServiceWorkerState): void {
    this.state = state
    this.dispatchEvent(new Event('statechange'))
  }
}

class TestServiceWorkerContainer extends EventTarget {
  constructor(public controller: PwaWorker | null = null) {
    super()
  }
}

class TestRegistration extends EventTarget implements PwaRegistration {
  active: PwaWorker | null
  waiting: PwaWorker | null
  installing: PwaWorker | null
  unregister = vi.fn(async () => true)

  constructor({
    active = null,
    waiting = null,
    installing = null,
  }: {
    active?: PwaWorker | null
    waiting?: PwaWorker | null
    installing?: PwaWorker | null
  } = {}) {
    super()
    this.active = active
    this.waiting = waiting
    this.installing = installing
  }

  notifyUpdateFound(): void {
    this.dispatchEvent(new Event('updatefound'))
  }
}

function dependencies(overrides: Partial<PwaLifecycleDependencies> = {}): PwaLifecycleDependencies {
  const active = new TestWorker('activated')
  return {
    enabled: true,
    secureContext: true,
    container: new TestServiceWorkerContainer(active),
    register: vi.fn(async () => new TestRegistration({ active })),
    verifyCache: vi.fn(async () => cacheHealth(false, 'no-app-cache')),
    isOnline: vi.fn(() => true),
    canReload: vi.fn(() => false),
    reload: vi.fn(),
    ...overrides,
  }
}

function activateWorker(
  registration: TestRegistration,
  worker: TestWorker,
  container: TestServiceWorkerContainer,
): void {
  registration.active = worker
  registration.waiting = null
  registration.installing = null
  container.controller = worker
  worker.transition('activated')
  container.dispatchEvent(new Event('controllerchange'))
}

describe('PWA lifecycle', () => {
  it('registers once, observes an activated initial worker, and never reloads automatically', async () => {
    const active = new TestWorker('activated')
    const registration = new TestRegistration({ active })
    const deps = dependencies({
      register: vi.fn(async () => registration),
      verifyCache: vi.fn(async () => cacheHealth(true)),
    })
    const lifecycle = createPwaLifecycle(deps)

    await lifecycle.mount()
    await lifecycle.mount()

    expect(deps.register).toHaveBeenCalledTimes(1)
    expect(deps.verifyCache).toHaveBeenCalledWith(registration)
    expect(lifecycle.state.value).toMatchObject({ phase: 'ready', registered: true, ready: true })
    expect(deps.reload).not.toHaveBeenCalled()
    lifecycle.dispose()
  })

  it('observes initial activation without reloading the loaded page', async () => {
    const installing = new TestWorker('installing')
    const registration = new TestRegistration({ installing })
    const container = new TestServiceWorkerContainer()
    const deps = dependencies({
      container,
      register: vi.fn(async () => registration),
      verifyCache: vi.fn(async () => cacheHealth(true)),
    })
    const lifecycle = createPwaLifecycle(deps)

    await lifecycle.mount()
    expect(lifecycle.state.value.phase).toBe('preparing')
    registration.active = installing
    registration.installing = null
    container.controller = installing
    installing.transition('activated')
    await vi.waitFor(() => expect(lifecycle.state.value).toMatchObject({ phase: 'ready', ready: true }))
    container.dispatchEvent(new Event('controllerchange'))

    expect(deps.reload).not.toHaveBeenCalled()
    lifecycle.dispose()
  })

  it('reports an existing waiting worker while retaining a healthy active release', async () => {
    const registration = new TestRegistration({
      active: new TestWorker('activated'),
      waiting: new TestWorker('installed'),
    })
    const lifecycle = createPwaLifecycle(dependencies({
      register: vi.fn(async () => registration),
      verifyCache: vi.fn(async () => cacheHealth(true)),
    }))

    await lifecycle.mount()

    expect(lifecycle.state.value).toMatchObject({
      phase: 'ready',
      registered: true,
      ready: true,
      updateAvailable: true,
    })
    lifecycle.dispose()
  })

  it('does not infer readiness from connectivity or a surviving active registration alone', async () => {
    const registration = new TestRegistration({ active: new TestWorker('activated') })
    const verifyCache = vi.fn(async () => cacheHealth(false, 'no-app-cache'))
    const lifecycle = createPwaLifecycle(dependencies({
      register: vi.fn(async () => registration),
      verifyCache,
    }))
    const originalOnline = Object.getOwnPropertyDescriptor(navigator, 'onLine')
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })

    try {
      await lifecycle.mount()

      expect(verifyCache).toHaveBeenCalledWith(registration)
      expect(lifecycle.state.value).toMatchObject({
        phase: 'preparing',
        registered: true,
        ready: false,
      })
    } finally {
      lifecycle.dispose()
      if (originalOnline) Object.defineProperty(navigator, 'onLine', originalOnline)
      else Reflect.deleteProperty(navigator, 'onLine')
    }
  })

  it('fails closed when workers are unsupported, insecure, or disabled for development', async () => {
    for (const overrides of [
      { secureContext: false },
      { container: null },
    ]) {
      const deps = dependencies({ ...overrides, register: vi.fn() })
      const lifecycle = createPwaLifecycle(deps)
      await lifecycle.mount()
      expect(lifecycle.state.value.phase).toBe('unsupported')
      expect(deps.register).not.toHaveBeenCalled()
      lifecycle.dispose()
    }

    const disabled = dependencies({ enabled: false, register: vi.fn() })
    const lifecycle = createPwaLifecycle(disabled)
    await lifecycle.mount()
    expect(lifecycle.state.value.phase).toBe('idle')
    expect(disabled.register).not.toHaveBeenCalled()
    lifecycle.dispose()
  })

  it('only recovers an unusable application registration after the online reload gate allows it', async () => {
    const registration = new TestRegistration({ active: new TestWorker('activated') })
    const deps = dependencies({
      register: vi.fn(async () => registration),
      verifyCache: vi.fn(async () => cacheHealth(false, 'no-app-cache')),
      canReload: vi.fn(() => true),
    })
    const lifecycle = createPwaLifecycle(deps)

    await lifecycle.mount()
    expect(lifecycle.state.value.recoveryAvailable).toBe(true)
    expect(registration.unregister).not.toHaveBeenCalled()

    await expect(lifecycle.recover()).resolves.toBe(true)

    expect(registration.unregister).toHaveBeenCalledTimes(1)
    expect(deps.reload).toHaveBeenCalledTimes(1)
    expect(lifecycle.state.value).toMatchObject({
      registered: false,
      ready: false,
      recoveryAvailable: false,
      phase: 'preparing',
    })
    lifecycle.dispose()
  })

  it('defers recovery when the injected reload gate is unsafe', async () => {
    const registration = new TestRegistration({ active: new TestWorker('activated') })
    const deps = dependencies({
      register: vi.fn(async () => registration),
      verifyCache: vi.fn(async () => cacheHealth(false, 'missing-resources')),
      canReload: vi.fn(() => false),
    })
    const lifecycle = createPwaLifecycle(deps)

    await lifecycle.mount()
    await expect(lifecycle.recover()).resolves.toBe(false)

    expect(registration.unregister).not.toHaveBeenCalled()
    expect(deps.reload).not.toHaveBeenCalled()
    expect(lifecycle.state.value).toMatchObject({ registered: true, ready: false, recoveryAvailable: true })
    lifecycle.dispose()
  })

  it('does not unregister a healthy active release when a waiting update is incomplete', async () => {
    const registration = new TestRegistration({
      active: new TestWorker('activated'),
      waiting: new TestWorker('installed'),
    })
    const deps = dependencies({
      register: vi.fn(async () => registration),
      verifyCache: vi.fn(async () => cacheHealth(true)),
      canReload: vi.fn(() => true),
    })
    const lifecycle = createPwaLifecycle(deps)

    await lifecycle.mount()
    await expect(lifecycle.recover()).resolves.toBe(false)

    expect(registration.unregister).not.toHaveBeenCalled()
    expect(deps.reload).not.toHaveBeenCalled()
    expect(lifecycle.state.value).toMatchObject({ ready: true, updateAvailable: true, recoveryAvailable: false })
    lifecycle.dispose()
  })

  it('contains registration failures and can retry without affecting other app work', async () => {
    const registration = new TestRegistration({ active: new TestWorker('activated') })
    const register = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(registration)
    const deps = dependencies({ register, verifyCache: vi.fn(async () => cacheHealth(true)) })
    const lifecycle = createPwaLifecycle(deps)

    await expect(lifecycle.mount()).resolves.toBeUndefined()
    expect(lifecycle.state.value).toMatchObject({ phase: 'error', registered: false, ready: false, error: 'offline' })
    const localWorkflow = vi.fn(async () => 'saved locally')
    await expect(localWorkflow()).resolves.toBe('saved locally')

    await lifecycle.retry()
    expect(register).toHaveBeenCalledTimes(2)
    expect(lifecycle.state.value).toMatchObject({ phase: 'ready', registered: true, ready: true, error: null })
    lifecycle.dispose()
  })

  it('reports an update-install failure while keeping the active release ready', async () => {
    const active = new TestWorker('activated')
    const failedUpdate = new TestWorker('installing')
    const registration = new TestRegistration({ active })
    const deps = dependencies({
      container: new TestServiceWorkerContainer(active),
      register: vi.fn(async () => registration),
      verifyCache: vi.fn(async () => cacheHealth(true)),
    })
    const lifecycle = createPwaLifecycle(deps)

    await lifecycle.mount()
    registration.installing = failedUpdate
    registration.notifyUpdateFound()
    registration.installing = null
    failedUpdate.transition('redundant')

    expect(lifecycle.state.value).toMatchObject({
      phase: 'ready',
      ready: true,
      updateAvailable: false,
      error: 'The new release could not be prepared. The current offline release is still ready.',
    })
    expect(registration.active).toBe(active)
    expect(registration.waiting).toBeNull()
    expect(deps.reload).not.toHaveBeenCalled()
    lifecycle.dispose()
  })

  it('requests activation from the waiting worker and reloads only after safe controller change', async () => {
    const active = new TestWorker('activated')
    const waiting = new TestWorker('installed')
    const registration = new TestRegistration({
      active,
      waiting,
    })
    const container = new TestServiceWorkerContainer(active)
    const deps = dependencies({ container, register: vi.fn(async () => registration) })
    const lifecycle = createPwaLifecycle(deps)
    await lifecycle.mount()

    expect(lifecycle.tryReload()).toBe(false)
    expect(deps.reload).not.toHaveBeenCalled()
    vi.mocked(deps.canReload).mockReturnValue(true)
    expect(lifecycle.tryReload()).toBe(true)
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(lifecycle.state.value.applyingUpdate).toBe(true)
    expect(deps.reload).not.toHaveBeenCalled()

    activateWorker(registration, waiting, container)
    await vi.waitFor(() => expect(deps.reload).toHaveBeenCalledOnce())
    expect(lifecycle.state.value).toMatchObject({
      updateAvailable: false,
      reloadAvailable: false,
      applyingUpdate: false,
    })
    lifecycle.dispose()
  })

  it('cancels a requested reload when the gate becomes unsafe, even if it is safe again at activation', async () => {
    const active = new TestWorker('activated')
    const waiting = new TestWorker('installed')
    const registration = new TestRegistration({ active, waiting })
    const container = new TestServiceWorkerContainer(active)
    const eligible = ref(true)
    const deps = dependencies({
      container,
      register: vi.fn(async () => registration),
      canReload: () => eligible.value,
    })
    const lifecycle = createPwaLifecycle(deps)
    await lifecycle.mount()

    expect(lifecycle.tryReload()).toBe(true)
    expect(waiting.postMessage).toHaveBeenCalledOnce()
    expect(lifecycle.state.value.applyingUpdate).toBe(true)

    eligible.value = false
    expect(lifecycle.state.value.applyingUpdate).toBe(false)
    eligible.value = true
    activateWorker(registration, waiting, container)

    expect(deps.reload).not.toHaveBeenCalled()
    expect(lifecycle.state.value).toMatchObject({
      updateAvailable: false,
      reloadAvailable: true,
      applyingUpdate: false,
    })
    expect(lifecycle.tryReload()).toBe(true)
    expect(deps.reload).toHaveBeenCalledOnce()
    lifecycle.dispose()
  })

  it('records an externally activated release without reloading this tab and allows a later retry', async () => {
    const active = new TestWorker('activated')
    const waiting = new TestWorker('installed')
    const registration = new TestRegistration({ active, waiting })
    const container = new TestServiceWorkerContainer(active)
    const deps = dependencies({
      container,
      register: vi.fn(async () => registration),
      canReload: vi.fn(() => false),
    })
    const lifecycle = createPwaLifecycle(deps)
    await lifecycle.mount()

    activateWorker(registration, waiting, container)

    expect(deps.reload).not.toHaveBeenCalled()
    expect(lifecycle.state.value).toMatchObject({
      updateAvailable: false,
      reloadAvailable: true,
      applyingUpdate: false,
    })
    expect(lifecycle.tryReload()).toBe(false)
    vi.mocked(deps.canReload).mockReturnValue(true)
    expect(lifecycle.tryReload()).toBe(true)
    expect(deps.reload).toHaveBeenCalledOnce()
    lifecycle.dispose()
  })

  it('does not reload after disposal even when an activation event arrives', async () => {
    const active = new TestWorker('activated')
    const waiting = new TestWorker('installed')
    const registration = new TestRegistration({ active, waiting })
    const container = new TestServiceWorkerContainer(active)
    const deps = dependencies({ container, register: vi.fn(async () => registration), canReload: () => true })
    const lifecycle = createPwaLifecycle(deps)
    await lifecycle.mount()
    expect(lifecycle.tryReload()).toBe(true)
    lifecycle.dispose()

    activateWorker(registration, waiting, container)
    expect(deps.reload).not.toHaveBeenCalled()
  })

  it('reloads immediately only for a previously activated release awaiting this tab', async () => {
    const active = new TestWorker('activated')
    const container = new TestServiceWorkerContainer(active)
    const registration = new TestRegistration({ active })
    const deps = dependencies({
      container,
      register: vi.fn(async () => registration),
      canReload: () => true,
    })
    const lifecycle = createPwaLifecycle(deps)
    await lifecycle.mount()
    container.dispatchEvent(new Event('controllerchange'))

    expect(lifecycle.state.value.reloadAvailable).toBe(true)
    expect(lifecycle.tryReload()).toBe(true)
    expect(deps.reload).toHaveBeenCalledTimes(1)
    lifecycle.dispose()
  })

  it('detaches window, registration, and worker listeners without unregistering the release', async () => {
    const active = new TestWorker('activated')
    const waiting = new TestWorker('installed')
    const registration = new TestRegistration({ active, waiting })
    const container = new EventTarget()
    const removeContainerListener = vi.spyOn(container, 'removeEventListener')
    const removeRegistrationListener = vi.spyOn(registration, 'removeEventListener')
    const removeActiveListener = vi.spyOn(active, 'removeEventListener')
    const removeWaitingListener = vi.spyOn(waiting, 'removeEventListener')
    const lifecycle = createPwaLifecycle(dependencies({
      container,
      register: vi.fn(async () => registration),
    }))

    await lifecycle.mount()
    lifecycle.dispose()

    expect(removeContainerListener).toHaveBeenCalledWith('controllerchange', expect.any(Function))
    expect(removeRegistrationListener).toHaveBeenCalledWith('updatefound', expect.any(Function))
    expect(removeActiveListener).toHaveBeenCalledWith('statechange', expect.any(Function))
    expect(removeWaitingListener).toHaveBeenCalledWith('statechange', expect.any(Function))
    expect(lifecycle.state.value.registered).toBe(true)
  })
})
