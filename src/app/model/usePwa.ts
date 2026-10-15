import { onBeforeUnmount, onMounted, readonly, ref, watch, type DeepReadonly, type Ref } from 'vue'
import { PWA_BASE_URL, getPwaResourceUrlForApp } from '../config/pwa'
import { verifyPwaCache, type PwaCacheHealth } from '../lib/pwaCache'

export interface PwaEventTarget {
  addEventListener(type: string, listener: EventListener): void
  removeEventListener(type: string, listener: EventListener): void
  readonly controller?: PwaWorker | null
}

export interface PwaWorker extends PwaEventTarget {
  readonly state: ServiceWorkerState
  postMessage(message: unknown): void
}

export interface PwaRegistration extends PwaEventTarget {
  readonly active: PwaWorker | null
  readonly waiting: PwaWorker | null
  readonly installing: PwaWorker | null
  unregister(): Promise<boolean>
}

export interface PwaLifecycleState {
  phase: 'idle' | 'unsupported' | 'registering' | 'preparing' | 'ready' | 'recovering' | 'error'
  registered: boolean
  ready: boolean
  updateAvailable: boolean
  reloadAvailable: boolean
  applyingUpdate: boolean
  recoveryAvailable: boolean
  error: string | null
}

export interface PwaLifecycleDependencies {
  enabled: boolean
  secureContext: boolean
  container: PwaEventTarget | null
  register: () => Promise<PwaRegistration>
  verifyCache: (registration: PwaRegistration) => Promise<PwaCacheHealth>
  isOnline: () => boolean
  canReload: () => boolean
  reload: () => void
}

export interface PwaLifecycle {
  state: DeepReadonly<Ref<PwaLifecycleState>>
  mount: () => Promise<void>
  retry: () => Promise<void>
  recover: () => Promise<boolean>
  tryReload: () => boolean
  cancelUpdateRequest: () => void
  dispose: () => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected application-worker error occurred.'
}

function createBrowserDependencies(canReload: () => boolean): PwaLifecycleDependencies {
  const container = typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    ? navigator.serviceWorker
    : null

  return {
    enabled: import.meta.env.PROD,
    secureContext: typeof window !== 'undefined' && window.isSecureContext,
    container,
    register: () => {
      if (!container) return Promise.reject(new Error('Service workers are unavailable in this browser.'))
      return container.register(getPwaResourceUrlForApp('sw.js'), {
        scope: PWA_BASE_URL,
        updateViaCache: 'none',
      })
    },
    verifyCache: verifyPwaCache,
    isOnline: () => navigator.onLine,
    canReload,
    reload: () => window.location.reload(),
  }
}

export function createPwaLifecycle(dependencies: PwaLifecycleDependencies): PwaLifecycle {
  const mutableState = ref<PwaLifecycleState>({
    phase: 'idle',
    registered: false,
    ready: false,
    updateAvailable: false,
    reloadAvailable: false,
    applyingUpdate: false,
    recoveryAvailable: false,
    error: null,
  })
  let registration: PwaRegistration | null = null
  let mounted = false
  let disposed = false
  let containerListening = false
  let hasControlledThisTab = Boolean(dependencies.container?.controller)
  let reloadIntent = false
  const workerListeners = new Map<PwaWorker, EventListener>()
  const observedUpdateWorkers = new WeakSet<PwaWorker>()

  function cacheNeedsRecovery(health: PwaCacheHealth): boolean {
    return !health.ready && (health.reason === 'no-app-cache' || health.reason === 'missing-resources')
  }

  function detachContainerListener(): void {
    if (!containerListening || !dependencies.container) return
    dependencies.container.removeEventListener('controllerchange', onControllerChange)
    containerListening = false
  }

  function detachRegistrationListener(): void {
    if (!registration) return
    registration.removeEventListener('updatefound', onUpdateFound)
    for (const [worker, listener] of workerListeners) worker.removeEventListener('statechange', listener)
    workerListeners.clear()
  }

  function observeWorker(worker: PwaWorker | null): void {
    if (!worker || workerListeners.has(worker)) return
    const listener: EventListener = () => handleWorkerState(worker)
    workerListeners.set(worker, listener)
    worker.addEventListener('statechange', listener)
  }

  async function refreshReadiness(): Promise<void> {
    const currentRegistration = registration
    if (!currentRegistration || disposed) return
    const active = currentRegistration.active
    if (!active || active.state !== 'activated') {
      mutableState.value.ready = false
      mutableState.value.recoveryAvailable = false
      mutableState.value.phase = 'preparing'
      return
    }

    mutableState.value.phase = 'preparing'
    try {
      const health = await dependencies.verifyCache(currentRegistration)
      if (disposed || registration !== currentRegistration) return
      mutableState.value.ready = health.ready
      mutableState.value.recoveryAvailable = cacheNeedsRecovery(health)
      mutableState.value.phase = health.ready ? 'ready' : 'preparing'
      mutableState.value.error = null
    } catch (error) {
      if (disposed || registration !== currentRegistration) return
      mutableState.value.ready = false
      mutableState.value.recoveryAvailable = false
      mutableState.value.phase = 'error'
      mutableState.value.error = errorMessage(error)
    }
  }

  function handleWorkerState(worker: PwaWorker): void {
    if (disposed || !registration) return
    if (worker.state === 'installed') {
      observedUpdateWorkers.delete(worker)
      mutableState.value.updateAvailable = registration.waiting === worker
      if (mutableState.value.updateAvailable) mutableState.value.error = null
      void refreshReadiness()
    } else if (worker.state === 'activated') {
      observedUpdateWorkers.delete(worker)
      mutableState.value.updateAvailable = false
      mutableState.value.error = null
      if (registration.active === worker && hasControlledThisTab && !reloadIntent) {
        mutableState.value.reloadAvailable = true
      }
      void refreshReadiness()
    } else if (worker.state === 'redundant') {
      if (registration.waiting === worker) {
        mutableState.value.updateAvailable = false
      } else if (observedUpdateWorkers.has(worker)) {
        observedUpdateWorkers.delete(worker)
        mutableState.value.updateAvailable = false
        if (registration.active?.state === 'activated') {
          mutableState.value.error = 'The new release could not be prepared. The current offline release is still ready.'
        }
      }
    }
  }

  function onUpdateFound(): void {
    if (!registration || disposed) return
    const installing = registration.installing
    if (!installing) return
    observedUpdateWorkers.add(installing)
    mutableState.value.error = null
    observeWorker(installing)
    handleWorkerState(installing)
  }

  function onControllerChange(): void {
    if (disposed) return
    const wasAlreadyControlled = hasControlledThisTab
    hasControlledThisTab = true
    mutableState.value.error = null
    const currentRegistration = registration
    if (currentRegistration?.waiting === null) mutableState.value.updateAvailable = false

    if (reloadIntent) {
      reloadIntent = false
      mutableState.value.applyingUpdate = false
      if (isReloadSafe()) {
        mutableState.value.reloadAvailable = false
        try {
          dependencies.reload()
        } catch (error) {
          mutableState.value.reloadAvailable = true
          mutableState.value.error = errorMessage(error)
        }
      } else {
        mutableState.value.reloadAvailable = true
      }
    } else if (wasAlreadyControlled && currentRegistration?.active?.state === 'activated') {
      // Another tab may have activated this release. Keep this page and its drafts intact.
      mutableState.value.reloadAvailable = true
    }
    void refreshReadiness()
  }

  async function register(): Promise<void> {
    if (disposed || !dependencies.enabled) return
    if (!dependencies.secureContext || !dependencies.container) {
      mutableState.value.phase = 'unsupported'
      mutableState.value.registered = false
      mutableState.value.ready = false
      mutableState.value.recoveryAvailable = false
      mutableState.value.error = null
      return
    }

    mutableState.value.phase = 'registering'
    mutableState.value.error = null
    dependencies.container.addEventListener('controllerchange', onControllerChange)
    containerListening = true

    try {
      const nextRegistration = await dependencies.register()
      if (disposed) return
      registration = nextRegistration
      mutableState.value.registered = true
      mutableState.value.updateAvailable = Boolean(nextRegistration.waiting)
      mutableState.value.reloadAvailable = false
      mutableState.value.applyingUpdate = false
      nextRegistration.addEventListener('updatefound', onUpdateFound)
      observeWorker(nextRegistration.installing)
      observeWorker(nextRegistration.active)
      observeWorker(nextRegistration.waiting)
      await refreshReadiness()
    } catch (error) {
      detachContainerListener()
      mutableState.value.phase = 'error'
      mutableState.value.registered = false
      mutableState.value.ready = false
      mutableState.value.recoveryAvailable = false
      mutableState.value.error = errorMessage(error)
    }
  }

  async function mount(): Promise<void> {
    if (mounted || disposed) return
    mounted = true
    if (!dependencies.enabled) return
    await register()
  }

  async function retry(): Promise<void> {
    if (disposed || !dependencies.enabled) return
    if (registration) {
      await refreshReadiness()
      return
    }
    await register()
  }

  function recoveryIsSafe(): boolean {
    try {
      return dependencies.isOnline() && dependencies.canReload()
    } catch {
      return false
    }
  }

  async function recover(): Promise<boolean> {
    const currentRegistration = registration
    if (disposed || !currentRegistration || !mutableState.value.recoveryAvailable || !recoveryIsSafe()) return false

    try {
      const health = await dependencies.verifyCache(currentRegistration)
      if (disposed || registration !== currentRegistration) return false
      mutableState.value.ready = health.ready
      mutableState.value.recoveryAvailable = cacheNeedsRecovery(health)
      mutableState.value.phase = health.ready ? 'ready' : 'preparing'
      mutableState.value.error = null
      if (!cacheNeedsRecovery(health) || !recoveryIsSafe()) return false

      mutableState.value.phase = 'recovering'
      const unregistered = await currentRegistration.unregister()
      if (!unregistered) {
        mutableState.value.phase = 'error'
        mutableState.value.error = 'Could not reset the application cache registration.'
        return false
      }

      detachRegistrationListener()
      registration = null
      mutableState.value.registered = false
      mutableState.value.ready = false
      mutableState.value.recoveryAvailable = false
      mutableState.value.updateAvailable = false
      mutableState.value.phase = 'preparing'

      if (disposed || !recoveryIsSafe()) return false
      dependencies.reload()
      return true
    } catch (error) {
      if (!disposed && registration === currentRegistration) {
        mutableState.value.phase = 'error'
        mutableState.value.error = errorMessage(error)
      }
      return false
    }
  }

  function tryReload(): boolean {
    if (disposed) return false
    if (!isReloadSafe()) return false

    const waiting = registration?.waiting
    if (waiting) {
      reloadIntent = true
      mutableState.value.applyingUpdate = true
      try {
        waiting.postMessage({ type: 'SKIP_WAITING' })
        return true
      } catch (error) {
        reloadIntent = false
        mutableState.value.applyingUpdate = false
        mutableState.value.error = errorMessage(error)
        return false
      }
    }

    if (!mutableState.value.reloadAvailable) return false
    if (!isReloadSafe()) return false
    mutableState.value.reloadAvailable = false
    try {
      dependencies.reload()
      return true
    } catch (error) {
      mutableState.value.reloadAvailable = true
      mutableState.value.error = errorMessage(error)
      return false
    }
  }

  function isReloadSafe(): boolean {
    try {
      return dependencies.canReload()
    } catch {
      return false
    }
  }

  function cancelUpdateRequest(): void {
    if (!reloadIntent) return
    reloadIntent = false
    mutableState.value.applyingUpdate = false
  }

  const stopEligibilityWatch = watch(
    isReloadSafe,
    (eligible) => {
      if (!eligible) cancelUpdateRequest()
    },
    { flush: 'sync' },
  )

  function dispose(): void {
    if (disposed) return
    disposed = true
    stopEligibilityWatch()
    reloadIntent = false
    detachContainerListener()
    detachRegistrationListener()
  }

  return {
    state: readonly(mutableState),
    mount,
    retry,
    recover,
    tryReload,
    cancelUpdateRequest,
    dispose,
  }
}

export function usePwa(canReload: () => boolean = () => false): PwaLifecycle {
  const lifecycle = createPwaLifecycle(createBrowserDependencies(canReload))
  onMounted(() => { void lifecycle.mount() })
  onBeforeUnmount(lifecycle.dispose)
  return lifecycle
}
