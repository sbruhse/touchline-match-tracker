import { describe, expect, it, vi } from 'vitest'
import type { PwaRegistration, PwaWorker } from '../model/usePwa'
import { inspectPwaCache, type PwaCacheCheckDependencies } from './pwaCache'

const origin = 'https://touchline.test'
const base = '/touchline/'
const cacheNamespace = 'touchline-touchline'
const inventoryUrl = `${base}pwa-assets.json`
const requiredResources = [
  'index.html',
  'manifest.webmanifest',
  'pwa-assets.json',
  'icons/pwa-192x192.png',
]
const inventory: Record<string, { file: string; css?: string[]; assets?: string[] }> = {
  'index.html': {
    file: 'index.html',
    css: ['assets/app.css'],
    assets: ['assets/brand.svg'],
  },
  'src/main.ts': {
    file: 'assets/app.js',
    assets: ['assets/font.woff2'],
  },
}

function makeRegistration(
  overrides: Partial<Pick<PwaRegistration, 'active' | 'waiting' | 'installing'>> = {},
): PwaRegistration {
  return {
    addEventListener() {},
    removeEventListener() {},
    unregister: async () => true,
    active: { state: 'activated' } as PwaWorker,
    waiting: null,
    installing: null,
    ...overrides,
  }
}

function resourceUrls(): string[] {
  return [...requiredResources, ...Object.values(inventory).flatMap((entry) => [
    entry.file,
    ...(entry.css ?? []),
    ...(entry.assets ?? []),
  ])]
}

function makeDependencies(
  cachedResources: readonly string[],
  overrides: Partial<PwaCacheCheckDependencies> = {},
): PwaCacheCheckDependencies {
  const cache = {
    keys: vi.fn(async () => cachedResources.map((resource) => ({
      url: `${origin}${base}${resource}?__WB_REVISION__=revision-${resource.replaceAll('/', '-')}`,
    }))),
  }
  const cacheStorage = {
    keys: vi.fn(async () => [`${cacheNamespace}-precache-v1`]),
    open: vi.fn(async () => cache),
  }

  return {
    cacheStorage,
    fetchInventory: vi.fn(async () => ({ ok: true, json: async () => inventory })),
    origin,
    base,
    cacheNamespace,
    inventoryUrl,
    requiredResources,
    ...overrides,
  }
}

describe('PWA cache health', () => {
  it('matches revisioned Workbox cache keys against the current inventory', async () => {
    const dependencies = makeDependencies(resourceUrls())

    await expect(inspectPwaCache(makeRegistration(), dependencies)).resolves.toEqual({
      ready: true,
      missingResources: [],
    })
    expect(dependencies.fetchInventory).toHaveBeenCalledWith(inventoryUrl, { cache: 'no-store' })
    expect(dependencies.cacheStorage?.open).toHaveBeenCalledWith(`${cacheNamespace}-precache-v1`)
  })

  it('reports inventory and required public files that are missing from the application cache', async () => {
    const dependencies = makeDependencies(resourceUrls().filter((resource) => resource !== 'assets/app.css'))

    await expect(inspectPwaCache(makeRegistration(), dependencies)).resolves.toEqual({
      ready: false,
      reason: 'missing-resources',
      missingResources: ['assets/app.css'],
    })
  })

  it('does not treat cache-only eviction as offline readiness', async () => {
    const dependencies = makeDependencies(resourceUrls(), {
      cacheStorage: {
        keys: vi.fn(async () => ['unrelated-site-cache-v1']),
        open: vi.fn(),
      },
    })

    await expect(inspectPwaCache(makeRegistration(), dependencies)).resolves.toEqual({
      ready: false,
      reason: 'no-app-cache',
      missingResources: [],
    })
    expect(dependencies.cacheStorage?.open).not.toHaveBeenCalled()
  })

  it('keeps verifying the healthy active release while a new worker is still installing', async () => {
    const dependencies = makeDependencies(resourceUrls())
    const registration = makeRegistration({ installing: { state: 'installing' } as ServiceWorker })

    await expect(inspectPwaCache(registration, dependencies)).resolves.toEqual({
      ready: true,
      missingResources: [],
    })
  })
})
