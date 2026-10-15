import { PWA_BASE_URL, PWA_CACHE_NAMESPACE, PWA_REQUIRED_RESOURCES, PWA_RESOURCE_INVENTORY_URL } from '../config/pwa'
import { getPwaResourceUrl, isPathWithinPwaScope } from '../config/pwaResources'
import type { PwaRegistration } from '../model/usePwa'

export interface PwaCache {
  keys: () => Promise<ReadonlyArray<string | { url: string }>>
}

export interface PwaCacheStorage {
  keys: () => Promise<string[]>
  open: (name: string) => Promise<PwaCache>
}

export interface PwaInventoryResponse {
  ok: boolean
  json: () => Promise<unknown>
}

export interface PwaCacheCheckDependencies {
  cacheStorage: PwaCacheStorage | null
  fetchInventory: (url: string, init: { cache: RequestCache }) => Promise<PwaInventoryResponse>
  origin: string
  base: string
  cacheNamespace: string
  inventoryUrl: string
  requiredResources: readonly string[]
}

export interface PwaCacheHealth {
  ready: boolean
  reason?: 'worker-inactive' | 'cache-storage-unavailable' | 'inventory-unavailable' | 'invalid-inventory' | 'no-app-cache' | 'out-of-scope-resource' | 'missing-resources' | 'cache-error'
  missingResources: string[]
}

type ViteInventoryEntry = {
  file?: unknown
  css?: unknown
  assets?: unknown
  imports?: unknown
  dynamicImports?: unknown
}

function emptyHealth(reason: NonNullable<PwaCacheHealth['reason']>): PwaCacheHealth {
  return { ready: false, reason, missingResources: [] }
}

function inventoryFiles(inventory: unknown): string[] | null {
  if (!inventory || typeof inventory !== 'object' || Array.isArray(inventory)) return null
  const entries = inventory as Record<string, ViteInventoryEntry>
  const htmlEntry = entries['index.html']
  if (!htmlEntry || typeof htmlEntry.file !== 'string') return null

  const files = new Set<string>(['index.html'])
  for (const entry of Object.values(entries)) {
    if (!entry || typeof entry !== 'object') return null
    for (const key of ['file', 'css', 'assets'] as const) {
      const values = entry[key]
      if (values === undefined) continue
      const list = Array.isArray(values) ? values : [values]
      for (const value of list) {
        if (typeof value !== 'string') return null
        files.add(value)
      }
    }
  }
  return [...files]
}

function normalizedResourcePath(resource: string): string | null {
  const value = resource.replace(/^\.\//, '')
  if (!value || value.startsWith('/') || value.split('/').includes('..') || /^[a-z][a-z\d+.-]*:/i.test(value)) {
    return null
  }
  return value
}

function cacheRequestUrl(key: string | { url: string }, origin: string): string | null {
  try {
    const url = new URL(typeof key === 'string' ? key : key.url, origin)
    url.searchParams.delete('__WB_REVISION__')
    url.hash = ''
    return url.href
  } catch {
    return null
  }
}

export async function inspectPwaCache(
  registration: PwaRegistration,
  dependencies: PwaCacheCheckDependencies,
): Promise<PwaCacheHealth> {
  if (!registration.active || registration.active.state !== 'activated') return emptyHealth('worker-inactive')
  if (!dependencies.cacheStorage) return emptyHealth('cache-storage-unavailable')

  let files: string[] | null
  try {
    const response = await dependencies.fetchInventory(dependencies.inventoryUrl, { cache: 'no-store' })
    if (!response.ok) return emptyHealth('inventory-unavailable')
    files = inventoryFiles(await response.json())
  } catch {
    return emptyHealth('inventory-unavailable')
  }
  if (!files) return emptyHealth('invalid-inventory')

  const required = new Set([...dependencies.requiredResources, ...files])
  const expectedUrls = new Map<string, string>()
  for (const resource of required) {
    const normalized = normalizedResourcePath(resource)
    if (!normalized) return emptyHealth('out-of-scope-resource')
    const path = getPwaResourceUrl(dependencies.base, normalized)
    const url = new URL(path, dependencies.origin)
    if (!isPathWithinPwaScope(url.pathname, dependencies.base)) return emptyHealth('out-of-scope-resource')
    expectedUrls.set(url.href, normalized)
  }

  let appCacheNames: string[]
  try {
    appCacheNames = (await dependencies.cacheStorage.keys())
      .filter((name) => name.startsWith(`${dependencies.cacheNamespace}-precache-`))
  } catch {
    return emptyHealth('cache-error')
  }
  if (appCacheNames.length === 0) return emptyHealth('no-app-cache')

  const cachedUrls = new Set<string>()
  try {
    for (const name of appCacheNames) {
      const cache = await dependencies.cacheStorage.open(name)
      for (const key of await cache.keys()) {
        const url = cacheRequestUrl(key, dependencies.origin)
        if (url) cachedUrls.add(url)
      }
    }
  } catch {
    return emptyHealth('cache-error')
  }

  const missingResources = [...expectedUrls]
    .filter(([url]) => !cachedUrls.has(url))
    .map(([, resource]) => resource)
  return missingResources.length > 0
    ? { ready: false, reason: 'missing-resources', missingResources }
    : { ready: true, missingResources: [] }
}

export async function verifyPwaCache(registration: PwaRegistration): Promise<PwaCacheHealth> {
  const cacheStorage = typeof caches === 'undefined' ? null : caches
  const health = await inspectPwaCache(registration, {
    cacheStorage,
    fetchInventory: async (url, init) => fetch(url, init),
    origin: typeof location === 'undefined' ? 'https://touchline.invalid' : location.origin,
    base: PWA_BASE_URL,
    cacheNamespace: PWA_CACHE_NAMESPACE,
    inventoryUrl: PWA_RESOURCE_INVENTORY_URL,
    requiredResources: PWA_REQUIRED_RESOURCES,
  })
  return health
}
