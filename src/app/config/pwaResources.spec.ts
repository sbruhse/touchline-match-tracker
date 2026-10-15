// @vitest-environment node
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  getPwaCacheNamespace,
  isPathWithinPwaScope,
  normalizePwaBasePath,
  PWA_PUBLIC_RESOURCES,
} from './pwaResources'

const origin = 'https://touchline.test'
const projectRoot = process.cwd()
const configFile = resolve(projectRoot, 'vite.config.ts')
const fixtureRootPromise = mkdtemp(join(tmpdir(), 'touchline-pwa-build-'))

type BuildFixture = {
  base: string
  outDir: string
  manifest: Record<string, unknown>
  html: string
  worker: string
  precacheUrls: string[]
  inventory: Record<string, { file?: string; css?: string[]; assets?: string[] }>
}

async function buildFixture(base: string, outDir: string): Promise<BuildFixture> {
  await build({
    configFile,
    root: projectRoot,
    base,
    build: { outDir, emptyOutDir: true },
  })

  const [manifestText, html, worker, inventoryText] = await Promise.all([
    readFile(join(outDir, 'manifest.webmanifest'), 'utf8'),
    readFile(join(outDir, 'index.html'), 'utf8'),
    readFile(join(outDir, 'sw.js'), 'utf8'),
    readFile(join(outDir, 'pwa-assets.json'), 'utf8'),
  ])
  const precacheMatch = worker.match(/precacheAndRoute\(\s*(\[[\s\S]*?\])\s*,/)
  if (!precacheMatch) throw new Error('Generated worker has no precache manifest')
  const precache = JSON.parse(precacheMatch[1]) as Array<{ url: string }>

  return {
    base,
    outDir,
    manifest: JSON.parse(manifestText) as Record<string, unknown>,
    html,
    worker,
    precacheUrls: precache.map((entry) => entry.url),
    inventory: JSON.parse(inventoryText) as BuildFixture['inventory'],
  }
}

describe('PWA resource configuration', () => {
  let fixtureRoot: string
  let fixtures: BuildFixture[]

  beforeAll(async () => {
    fixtureRoot = await fixtureRootPromise
    fixtures = await Promise.all([
      buildFixture('/', join(fixtureRoot, 'root')),
      buildFixture('/touchline/', join(fixtureRoot, 'subdirectory')),
    ])
  }, 30_000)

  afterAll(async () => {
    if (fixtureRoot) await rm(fixtureRoot, { recursive: true, force: true })
  })

  it('gives each configured base its own application cache namespace', () => {
    expect(getPwaCacheNamespace('/')).toBe('touchline-root')
    expect(getPwaCacheNamespace('/touchline/')).toBe('touchline-touchline')
    expect(getPwaCacheNamespace('/club/touchline/')).toBe('touchline-club-touchline')
  })

  it('normalizes scope paths and excludes unrelated paths for a subdirectory deployment', () => {
    expect(normalizePwaBasePath('/touchline')).toBe('/touchline/')
    expect(isPathWithinPwaScope('/touchline/matches', '/touchline/')).toBe(true)
    expect(isPathWithinPwaScope('/touchline', '/touchline/')).toBe(true)
    expect(isPathWithinPwaScope('/unrelated/site', '/touchline/')).toBe(false)
  })

  it.each(['/', '/touchline/'])('precaches the complete %s build within its configured base', async (base) => {
    const fixture = fixtures.find((item) => item.base === base)
    expect(fixture).toBeDefined()
    if (!fixture) return

    const manifestUrl = new URL('manifest.webmanifest', new URL(base, origin))
    const manifest = fixture.manifest as {
      id: string
      start_url: string
      scope: string
      icons: Array<{ src: string; sizes: string; purpose?: string }>
    }
    const expectedRoot = new URL(base, origin).pathname

    expect(new URL(manifest.id, manifestUrl).pathname).toBe(expectedRoot)
    expect(new URL(manifest.start_url, manifestUrl).pathname).toBe(expectedRoot)
    expect(new URL(manifest.scope, manifestUrl).pathname).toBe(expectedRoot)

    for (const icon of manifest.icons) {
      const iconUrl = new URL(icon.src, manifestUrl)
      expect(iconUrl.pathname.startsWith(expectedRoot)).toBe(true)
      const relativePath = iconUrl.pathname.slice(expectedRoot.length)
      await expect(stat(join(fixture.outDir, relativePath))).resolves.toBeDefined()
    }

    expect(manifest.icons).toContainEqual(expect.objectContaining({ sizes: '192x192', purpose: 'any' }))
    expect(manifest.icons).toContainEqual(expect.objectContaining({ sizes: '512x512', purpose: 'any' }))
    expect(manifest.icons).toContainEqual(expect.objectContaining({ sizes: '512x512', purpose: 'maskable' }))

    const entry = fixture.inventory['index.html']
    expect(entry?.file).toBeTruthy()
    expect(fixture.html).toContain(`href="${base}manifest.webmanifest"`)
    expect(fixture.html).toContain(`href="${base}icons/touchline.svg"`)
    expect(fixture.html).toContain(`href="${base}icons/apple-touch-icon-180x180.png"`)
    expect(fixture.html).toContain('viewport-fit=cover')
    expect(fixture.html).toContain('name="apple-mobile-web-app-capable" content="yes"')
    expect(fixture.html).toContain(`src="${base}${entry?.file}"`)
    for (const cssFile of entry?.css ?? []) expect(fixture.html).toContain(`href="${base}${cssFile}"`)
    const emittedAssets = new Set(
      Object.values(fixture.inventory).flatMap((item) => [item.file, ...(item.css ?? []), ...(item.assets ?? [])])
        .filter((file): file is string => Boolean(file)),
    )
    expect(emittedAssets.size).toBeGreaterThan(0)
    const fontAssets = [...emittedAssets].filter((file) => file.endsWith('.woff2'))
    expect(fontAssets).toHaveLength(8)

    const cssFiles = entry?.css ?? []
    const css = (await Promise.all(cssFiles.map((file) => readFile(join(fixture.outDir, file), 'utf8')))).join('\n')
    expect(css).not.toMatch(/https?:\/\/fonts\.(?:googleapis|gstatic)\.com/i)
    expect(css).toContain('font-family:DM Sans')
    expect(css).toContain('font-family:DM Mono')
    expect(css).toContain('font-family:Space Grotesk')
    expect(css).toContain('font-weight:400 700')
    expect(css).toContain('font-weight:500')
    for (const fontAsset of fontAssets) expect(css).toContain(fontAsset.split('/').at(-1))

    for (const resource of ['index.html', ...PWA_PUBLIC_RESOURCES, ...emittedAssets]) {
      await expect(stat(join(fixture.outDir, resource))).resolves.toBeDefined()
      expect(fixture.precacheUrls).toContain(resource)
    }

    expect(fixture.worker).toContain('createHandlerBoundToURL("index.html")')
    expect(fixture.precacheUrls.every((url) => !/^(?:https?:)?\/\//.test(url))).toBe(true)
    expect(fixture.worker).toContain(getPwaCacheNamespace(base))
  })
})
