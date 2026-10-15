import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { Builder, Browser, By, Select, until } from 'selenium-webdriver'
import firefox from 'selenium-webdriver/firefox.js'
import {
  availableFirefoxBinary,
  createProductionPwaFixture,
} from './pwaE2eFixtures.mjs'

let fixture
const firefoxBinary = availableFirefoxBinary()
const requiredPwaResources = [
  'manifest.webmanifest',
  'pwa-assets.json',
  'icons/touchline.svg',
  'icons/pwa-64x64.png',
  'icons/pwa-192x192.png',
  'icons/pwa-512x512.png',
  'icons/maskable-icon-512x512.png',
  'icons/apple-touch-icon-180x180.png',
  'icons/favicon.ico',
  'fonts/licenses/OFL-DM-Sans.txt',
  'fonts/licenses/OFL-DM-Mono.txt',
  'fonts/licenses/OFL-Space-Grotesk.txt',
]

async function waitForPwaCacheReady(driver) {
  await driver.wait(async () => {
    try {
      return await driver.executeAsyncScript((publicResources, done) => {
        ;(async () => {
          const registration = await navigator.serviceWorker.ready
          if (registration.active?.state !== 'activated') return false
          const response = await fetch('/pwa-assets.json', { cache: 'no-store' })
          if (!response.ok) return false
          const inventory = await response.json()
          const files = new Set(['index.html', ...publicResources])
          for (const entry of Object.values(inventory)) {
            if (entry?.file) files.add(entry.file)
            for (const file of [...(entry?.css ?? []), ...(entry?.assets ?? [])]) files.add(file)
          }
          const cacheNames = (await caches.keys()).filter((name) => name.startsWith('touchline-root-precache-'))
          const cachedUrls = new Set()
          for (const name of cacheNames) {
            const cache = await caches.open(name)
            for (const request of await cache.keys()) {
              const url = new URL(request.url)
              url.searchParams.delete('__WB_REVISION__')
              url.hash = ''
              cachedUrls.add(url.href)
            }
          }
          return cacheNames.length > 0 && [...files].every((file) => cachedUrls.has(new URL(file, `${location.origin}/`).href))
        })().then(done).catch(() => done(false))
      }, requiredPwaResources)
    } catch {
      return false
    }
  }, 25_000, 'The current production release should be completely prepared in its application cache.')
}

async function readSavedMatchRecord(driver, homeTeam, awayTeam) {
  const serialized = await driver.executeAsyncScript((home, away, done) => {
    const request = indexedDB.open('touchline', 1)
    request.onerror = () => done(`IndexedDB open failed: ${request.error?.message}`)
    request.onsuccess = () => {
      const database = request.result
      const read = database.transaction('matches', 'readonly').objectStore('matches').getAll()
      read.onerror = () => {
        database.close()
        done(`IndexedDB read failed: ${read.error?.message}`)
      }
      read.onsuccess = () => {
        const match = read.result.find((record) => record.homeTeam === home && record.awayTeam === away)
        database.close()
        done(JSON.stringify(match ?? null))
      }
    }
  }, homeTeam, awayTeam)
  if (typeof serialized !== 'string' || serialized.startsWith('IndexedDB ')) {
    throw new Error(String(serialized))
  }
  return JSON.parse(serialized)
}

async function persistRunningClockSnapshot(driver, homeTeam, awayTeam, elapsedMs) {
  const result = await driver.executeAsyncScript((home, away, elapsed, done) => {
    const request = indexedDB.open('touchline', 1)
    request.onerror = () => done(`IndexedDB open failed: ${request.error?.message}`)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('matches', 'readwrite')
      const records = transaction.objectStore('matches')
      const read = records.getAll()
      read.onsuccess = () => {
        const match = read.result.find((record) => record.homeTeam === home && record.awayTeam === away)
        if (!match) {
          transaction.abort()
          return
        }
        match.clock.status = 'running'
        match.clock.elapsedMs = elapsed
        match.clock.startedAt = Date.now()
        match.updatedAt = Date.now()
        records.put(match)
      }
      transaction.oncomplete = () => {
        database.close()
        done()
      }
      transaction.onerror = () => {
        database.close()
        done(`IndexedDB write failed: ${transaction.error?.message}`)
      }
      transaction.onabort = () => {
        database.close()
        done(`IndexedDB write aborted: ${transaction.error?.message ?? 'match not found'}`)
      }
    }
  }, homeTeam, awayTeam, elapsedMs)
  if (result) throw new Error(String(result))
}

async function readPwaDomainSnapshot(driver) {
  const serialized = await driver.executeAsyncScript((done) => {
    const request = indexedDB.open('touchline', 1)
    request.onerror = () => done(`IndexedDB open failed: ${request.error?.message}`)
    request.onsuccess = () => {
      const database = request.result
      const read = database.transaction('matches', 'readonly').objectStore('matches').getAll()
      read.onerror = () => {
        database.close()
        done(`IndexedDB read failed: ${read.error?.message}`)
      }
      read.onsuccess = () => {
        const snapshot = {
          matches: read.result,
          playerPayload: localStorage.getItem('touchline.player-store'),
          jerseyPayload: localStorage.getItem('touchline.jersey-set-store'),
          legacyPayload: localStorage.getItem('touchline.match-store'),
        }
        database.close()
        done(JSON.stringify(snapshot))
      }
    }
  })
  if (typeof serialized !== 'string' || serialized.startsWith('IndexedDB ')) throw new Error(String(serialized))
  return JSON.parse(serialized)
}

async function openPreparedAppTab(driver) {
  await driver.switchTo().newWindow('tab')
  const handle = await driver.getWindowHandle()
  await driver.get(fixture.origin)
  await driver.wait(until.elementLocated(By.css('.new-match-card')), 15_000)
  await waitForPwaCacheReady(driver)
  return handle
}

async function waitForControlledWorker(driver, message = 'The app tab should be controlled by its prepared service worker.') {
  await driver.wait(async () => {
    try {
      return await driver.executeScript(() => navigator.serviceWorker.controller?.state === 'activated')
    } catch {
      return false
    }
  }, 15_000, message)
}

async function requestProductionWorkerUpdate(driver) {
  const result = await driver.executeAsyncScript((done) => {
    navigator.serviceWorker.ready.then((registration) => {
      window.__touchlineWorkerStates = []
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing
        if (!worker) return
        window.__touchlineWorkerStates.push(worker.state)
        worker.addEventListener('statechange', () => window.__touchlineWorkerStates.push(worker.state))
      })
      return registration.update()
    }).then(() => done(null)).catch((error) => done(String(error)))
  })
  assert.equal(result, null, String(result))
}

before(async () => {
  fixture = await createProductionPwaFixture()
})

after(async () => {
  if (!fixture) return
  const { origin, isListening } = fixture
  assert.equal(isListening, true, 'The fixture server should be available until teardown.')
  const result = await fixture.close()
  assert.deepEqual(result, {
    serverStopped: true,
    sourcesUnchanged: true,
    fixtureRemoved: true,
  })
  await assert.rejects(() => fetch(origin), undefined, 'The fixture should not leave an active HTTP server.')
})

test('serves the production manifest, worker, and complete install-resource inventory', async () => {
  assert.ok(fixture)
  const documentResponse = await fetch(fixture.origin)
  assert.equal(documentResponse.status, 200)
  assert.equal(documentResponse.headers.get('cache-control'), 'no-store', 'Fixture assets must not rely on ordinary HTTP caching.')
  const html = await documentResponse.text()
  assert.match(html, /<meta name="touchline-e2e-release" content="A">/)
  assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest"/)
  assert.match(html, /apple-touch-icon/)

  const manifestResponse = await fetch(new URL('/manifest.webmanifest', fixture.origin))
  assert.equal(manifestResponse.status, 200)
  const manifest = await manifestResponse.json()
  assert.equal(manifest.name, 'Touchline — Match Tracker')
  assert.equal(manifest.start_url, './')
  assert.equal(manifest.scope, './')
  assert.deepEqual(new Set(manifest.icons.map(({ sizes, purpose }) => `${sizes}:${purpose ?? 'any'}`)), new Set([
    '192x192:any',
    '512x512:any',
    '512x512:maskable',
  ]))

  for (const icon of manifest.icons) {
    const response = await fetch(new URL(icon.src, manifestResponse.url))
    assert.equal(response.status, 200, `Manifest icon ${icon.src} should resolve.`)
    assert.match(response.headers.get('content-type'), /image\/png/)
  }

  for (const path of ['/icons/touchline.svg', '/icons/apple-touch-icon-180x180.png']) {
    assert.equal((await fetch(new URL(path, fixture.origin))).status, 200, `${path} should resolve.`)
  }

  const inventoryResponse = await fetch(new URL('/pwa-assets.json', fixture.origin))
  assert.equal(inventoryResponse.status, 200)
  const inventory = await inventoryResponse.json()
  const entry = inventory['index.html']
  assert.ok(entry?.file, 'The generated Vite inventory should include the HTML entry bundle.')
  const resources = new Set([entry.file, ...(entry.css ?? []), ...(entry.assets ?? [])])
  assert.ok(resources.size > 1, 'The inventory should include the JavaScript and CSS bundles.')
  for (const resource of resources) {
    assert.equal((await fetch(new URL(`/${resource}`, fixture.origin))).status, 200, `${resource} should resolve.`)
  }

  const cssResponse = await fetch(new URL(`/${entry.css[0]}`, fixture.origin))
  assert.equal(cssResponse.status, 200)
  const css = await cssResponse.text()
  assert.doesNotMatch(css, /https?:\/\/fonts\.(?:googleapis|gstatic)\.com/i)
  for (const family of ['DM Sans', 'DM Mono', 'Space Grotesk']) {
    assert.ok(css.includes(`font-family:${family}`), `${family} should have a local font-face declaration.`)
  }
  assert.ok(css.includes('font-weight:400 700'), 'Variable font faces should cover weights 400–700.')
  assert.ok(css.includes('font-weight:500'), 'DM Mono medium should be locally declared.')
  const fontUrls = [...css.matchAll(/url\((?:["']?)([^)'";]+\.woff2)(?:["']?)\)/g)].map((match) => match[1])
  assert.equal(fontUrls.length, 8, 'The production CSS should reference every required local WOFF2 subset.')
  for (const fontUrl of fontUrls) {
    const resolvedFontUrl = new URL(fontUrl, cssResponse.url)
    assert.equal(resolvedFontUrl.origin, new URL(fixture.origin).origin)
    const relativePath = resolvedFontUrl.pathname.replace(/^\//, '')
    assert.ok(resources.has(relativePath), `${relativePath} must appear in the generated Vite inventory.`)
    const response = await fetch(resolvedFontUrl)
    assert.equal(response.status, 200, `${relativePath} should resolve from the production fixture.`)
    assert.match(response.headers.get('content-type'), /font\/woff2/)
  }

  for (const license of ['OFL-DM-Sans.txt', 'OFL-DM-Mono.txt', 'OFL-Space-Grotesk.txt']) {
    const response = await fetch(new URL(`/fonts/licenses/${license}`, fixture.origin))
    assert.equal(response.status, 200, `${license} should be included in the production fixture.`)
    assert.match(await response.text(), /SIL OPEN FONT LICENSE Version 1\.1/)
  }

  const workerResponse = await fetch(new URL('/sw.js', fixture.origin))
  assert.equal(workerResponse.status, 200)
  const worker = await workerResponse.text()
  assert.match(worker, /precacheAndRoute/)
  assert.match(worker, /"?url"?\s*:\s*"pwa-assets\.json"/)
})

test('stops and restores the production fixture on the same fixed origin', async () => {
  const origin = fixture.origin

  await fixture.stopServer()
  assert.equal(fixture.isListening, false)
  await assert.rejects(() => fetch(origin), undefined, 'The offline fixture should deny network access while stopped.')

  await fixture.startServer()
  assert.equal(fixture.origin, origin)
  assert.equal(fixture.isListening, true)
  assert.equal((await fetch(origin)).status, 200)
})

test('serves distinct marked releases from the same fixed production origin', async () => {
  const origin = fixture.origin
  const workerA = await (await fetch(new URL('/sw.js', origin))).text()

  await fixture.buildRelease('B')
  await fixture.serveRelease('B')
  const releaseB = await (await fetch(origin)).text()
  const workerB = await (await fetch(new URL('/sw.js', origin))).text()
  assert.equal(fixture.currentRelease, 'B')
  assert.match(releaseB, /<meta name="touchline-e2e-release" content="B">/)
  assert.notEqual(workerB, workerA, 'The B marker must be part of the generated precache so its worker is a new release.')

  await fixture.serveRelease('A')
  const restoredA = await (await fetch(origin)).text()
  assert.equal(fixture.origin, origin)
  assert.equal(fixture.currentRelease, 'A')
  assert.match(restoredA, /<meta name="touchline-e2e-release" content="A">/)
})

test('opens the isolated production build in Firefox', {
  skip: firefoxBinary && existsSync(firefoxBinary) ? false : 'Firefox is not installed; HTTP production smoke test still runs.',
}, async () => {
  const options = new firefox.Options().addArguments('-headless')
  options.setBinary(firefoxBinary)
  const driver = await new Builder().forBrowser(Browser.FIREFOX).setFirefoxOptions(options).build()
  try {
    await driver.manage().window().setRect({ x: 0, y: 0, width: 1280, height: 900 })
    await driver.get(fixture.origin)
    await driver.wait(until.elementLocated(By.css('.new-match-card')), 15_000)
    assert.equal(await driver.getTitle(), 'Touchline — Match Tracker')
    assert.equal(await driver.executeScript(() => document.querySelector('link[rel="manifest"]')?.href),
      new URL('/manifest.webmanifest', fixture.origin).href)

    const fontDelivery = await driver.executeAsyncScript((done) => {
      const checks = [
        { family: 'DM Sans', weight: 400, font: '400 16px "DM Sans"', sample: 'Željko Özil Łukasz' },
        { family: 'DM Mono', weight: 400, font: '400 16px "DM Mono"', sample: 'É 10:00' },
        { family: 'DM Mono', weight: 500, font: '500 16px "DM Mono"', sample: 'Ł 12:30' },
        { family: 'Space Grotesk', weight: 700, font: '700 16px "Space Grotesk"', sample: 'Željko Özil Łukasz' },
      ]
      ;(async () => {
        const loaded = []
        for (const check of checks) {
          const faces = await document.fonts.load(check.font, check.sample)
          loaded.push({
            family: check.family,
            weight: check.weight,
            faces: faces.map((face) => ({ family: face.family.replaceAll('"', ''), status: face.status })),
          })
        }
        await document.fonts.ready
        const fontRequests = performance.getEntriesByType('resource')
          .map((entry) => entry.name)
          .filter((url) => new URL(url, location.href).pathname.endsWith('.woff2'))
        const remoteFontRequests = performance.getEntriesByType('resource')
          .map((entry) => entry.name)
          .filter((url) => /fonts\.(?:googleapis|gstatic)\.com/i.test(url))
        done({ loaded, fontRequests, remoteFontRequests })
      })().catch((error) => done({ error: String(error) }))
    })
    assert.equal(fontDelivery.error, undefined, fontDelivery.error)
    for (const check of fontDelivery.loaded) {
      assert.ok(check.faces.length > 0, `${check.family} ${check.weight} must resolve to a declared FontFace, not a system fallback.`)
      assert.ok(check.faces.some((face) => face.family === check.family && face.status === 'loaded'),
        `${check.family} ${check.weight} must finish loading from its local @font-face.`)
    }
    assert.ok(fontDelivery.fontRequests.length > 0, 'The browser should request local WOFF2 resources.')
    assert.ok(fontDelivery.fontRequests.every((url) => new URL(url, fixture.origin).origin === fixture.origin))
    assert.deepEqual(fontDelivery.remoteFontRequests, [])
  } finally {
    await driver.quit()
  }
})

test('re-prepares evicted application caches without changing local records or payloads', {
  skip: firefoxBinary && existsSync(firefoxBinary) ? false : 'Firefox is not installed; production service-worker browser tests are pending.',
}, async () => {
  const options = new firefox.Options().addArguments('-headless')
  options.setBinary(firefoxBinary)
  const driver = await new Builder().forBrowser(Browser.FIREFOX).setFirefoxOptions(options).build()
  try {
    await driver.get(fixture.origin)
    await driver.wait(until.elementLocated(By.id('home-team')), 15_000)
    await driver.wait(async () => driver.executeAsyncScript((done) => {
      navigator.serviceWorker.ready.then(async (registration) => {
        const names = await caches.keys()
        done(registration.active?.state === 'activated' && names.some((name) => name.startsWith('touchline-root-precache-')))
      }).catch(() => done(false))
    }), 20_000)

    await driver.findElement(By.id('home-team')).sendKeys('North City')
    await driver.findElement(By.id('away-team')).sendKeys('South Town')
    await driver.findElement(By.css('.new-match-card button[type="submit"]')).click()
    await driver.wait(until.elementLocated(By.css('#preparation-heading')), 10_000)
    await driver.findElement(By.css('.squad-setup > .quiet-button')).click()
    await driver.wait(until.elementLocated(By.css('#match-heading')), 10_000)

    const rawPayloads = await driver.executeScript(() => {
      const payloads = {
        'touchline.player-store': '{"version":3,"players":[]}',
        'touchline.jersey-set-store': '{"version":1,"sets":[]}',
        'touchline.match-store': '{"version":1,"matches":[{"id":"legacy-untouched"}]}',
      }
      for (const [key, value] of Object.entries(payloads)) localStorage.setItem(key, value)
      return Object.fromEntries(Object.keys(payloads).map((key) => [key, localStorage.getItem(key)]))
    })
    const readRawRecords = () => driver.executeAsyncScript((done) => {
      const request = indexedDB.open('touchline', 1)
      request.onerror = () => done(`IndexedDB open failed: ${request.error?.message}`)
      request.onsuccess = () => {
        const database = request.result
        const read = database.transaction('matches', 'readonly').objectStore('matches').getAll()
        read.onerror = () => {
          database.close()
          done(`IndexedDB read failed: ${read.error?.message}`)
        }
        read.onsuccess = () => {
          database.close()
          done(JSON.stringify(read.result))
        }
      }
    })
    const rawRecords = await readRawRecords()
    assert.equal(typeof rawRecords, 'string')
    assert.ok(JSON.parse(rawRecords).length > 0, 'The saved match should be present as a raw IndexedDB record.')

    const deletedCaches = await driver.executeAsyncScript((done) => {
      caches.open('unrelated-site-cache').then((cache) => cache.put(
        new URL('/unrelated-cache-sentinel', location.origin).href,
        new Response('keep'),
      )).then(() => caches.keys()).then((names) => Promise.all(
        names.filter((name) => name.startsWith('touchline-root-')).map((name) => caches.delete(name)),
      )).then((deleted) => done(deleted)).catch((error) => done(String(error)))
    })
    assert.ok(Array.isArray(deletedCaches) && deletedCaches.some(Boolean), 'Only the application cache namespace should be evicted.')
    assert.equal(await driver.executeAsyncScript((done) => {
      navigator.serviceWorker.getRegistration(location.href).then((registration) => done(Boolean(registration?.active)))
        .catch(() => done(false))
    }), true, 'Cache eviction should leave the registration available for explicit recovery.')

    const unregistered = await driver.executeAsyncScript((done) => {
      navigator.serviceWorker.getRegistration(location.href)
        .then((registration) => registration?.unregister() ?? false)
        .then(done)
        .catch((error) => done(String(error)))
    })
    assert.equal(unregistered, true, 'The test recovery should release only the application registration.')
    await driver.navigate().refresh()
    await driver.wait(until.elementLocated(By.css('.new-match-card')), 15_000)
    await driver.wait(async () => driver.executeAsyncScript((done) => {
      Promise.all([
        fetch('/pwa-assets.json', { cache: 'no-store' }).then((response) => response.json()),
        caches.keys(),
      ]).then(async ([inventory, names]) => {
        const files = new Set([
          'index.html',
          'manifest.webmanifest',
          'pwa-assets.json',
          'icons/touchline.svg',
          'icons/pwa-64x64.png',
          'icons/pwa-192x192.png',
          'icons/pwa-512x512.png',
          'icons/maskable-icon-512x512.png',
          'icons/apple-touch-icon-180x180.png',
          'icons/favicon.ico',
          'fonts/licenses/OFL-DM-Sans.txt',
          'fonts/licenses/OFL-DM-Mono.txt',
          'fonts/licenses/OFL-Space-Grotesk.txt',
        ])
        for (const entry of Object.values(inventory)) {
          if (entry?.file) files.add(entry.file)
          for (const file of [...(entry?.css ?? []), ...(entry?.assets ?? [])]) files.add(file)
        }
        const cachedUrls = new Set()
        for (const name of names.filter((cacheName) => cacheName.startsWith('touchline-root-precache-'))) {
          const cache = await caches.open(name)
          for (const request of await cache.keys()) {
            const url = new URL(request.url)
            url.searchParams.delete('__WB_REVISION__')
            cachedUrls.add(url.href)
          }
        }
        const complete = [...files].every((file) => cachedUrls.has(new URL(file, location.href).href))
        const unrelated = names.includes('unrelated-site-cache')
        done(complete && unrelated)
      }).catch(() => done(false))
    }), 20_000)

    assert.deepEqual(await driver.executeScript(() => Object.fromEntries([
      'touchline.player-store',
      'touchline.jersey-set-store',
      'touchline.match-store',
    ].map((key) => [key, localStorage.getItem(key)]))), rawPayloads)
    assert.equal(await readRawRecords(), rawRecords, 'Cache recovery must preserve the exact raw match records.')
  } finally {
    await driver.quit()
  }
})

test('continues a saved running match through a fresh offline launch and a second offline reload', {
  skip: firefoxBinary && existsSync(firefoxBinary) ? false : 'Firefox is not installed; production offline-continuation browser test is pending.',
}, async () => {
  const options = new firefox.Options().addArguments('-headless')
  options.setBinary(firefoxBinary)
  options.setPreference('network.http.use-cache', false)
  options.setPreference('browser.cache.disk.enable', false)
  options.setPreference('browser.cache.memory.enable', false)
  options.setPreference('browser.cache.offline.enable', false)
  const driver = await new Builder().forBrowser(Browser.FIREFOX).setFirefoxOptions(options).build()
  const homeTeam = 'Offline Home'
  const awayTeam = 'Offline Away'
  const starter = { id: 'offline-starter', name: 'Offline Starter', positions: [], jerseySize: 'M', archived: false, createdAt: 1, updatedAt: 1 }
  const substitute = { id: 'offline-substitute', name: 'Offline Substitute', positions: [], jerseySize: 'M', archived: false, createdAt: 2, updatedAt: 2 }
  let supportWindow

  try {
    await driver.manage().window().setRect({ x: 0, y: 0, width: 1280, height: 900 })
    const entryResponse = await fetch(fixture.origin)
    assert.equal(entryResponse.headers.get('cache-control'), 'no-store', 'The fixture must not rely on ordinary HTTP caching.')

    await driver.get('about:blank')
    supportWindow = await driver.getWindowHandle()
    await driver.switchTo().newWindow('tab')
    await driver.get(fixture.origin)
    await driver.wait(until.elementLocated(By.css('.new-match-card')), 15_000)
    await waitForPwaCacheReady(driver)
    await driver.executeScript((players) => {
      localStorage.setItem('touchline.player-store', JSON.stringify({ version: 3, players }))
    }, [starter, substitute])
    await driver.navigate().refresh()
    await driver.wait(until.elementLocated(By.css('.new-match-card')), 15_000)

    await driver.findElement(By.id('home-team')).sendKeys(homeTeam)
    await driver.findElement(By.id('away-team')).sendKeys(awayTeam)
    await driver.findElement(By.css('.new-match-card button[type="submit"]')).click()
    await driver.wait(until.elementLocated(By.css('#preparation-heading')), 10_000)
    await driver.findElement(By.css('[name="own-side"][value="home"]')).click()
    await driver.findElement(By.css(`[aria-label="Include ${starter.name} in match squad"]`)).click()
    await driver.findElement(By.css(`[aria-label="Include ${substitute.name} in match squad"]`)).click()
    await driver.findElement(By.css(`[aria-label="Select ${starter.name} as a starter"]`)).click()
    await driver.findElement(By.css('.squad-form button[type="submit"]')).click()
    await driver.wait(until.elementLocated(By.css('.jersey-editor')), 10_000)
    await driver.findElement(By.css('.cancel-button')).click()
    await driver.wait(until.elementLocated(By.css('#match-heading')), 10_000)
    await driver.findElement(By.css('.clock-primary')).click()
    await driver.wait(async () => await driver.findElement(By.css('.clock-status')).getText() === 'CLOCK RUNNING', 10_000)
    await persistRunningClockSnapshot(driver, homeTeam, awayTeam, 8 * 60_000)
    await waitForPwaCacheReady(driver)
    const initialRecord = await readSavedMatchRecord(driver, homeTeam, awayTeam)
    assert.equal(initialRecord.clock.status, 'running')
    assert.ok(initialRecord.clock.startedAt)
    assert.ok(initialRecord.firstKickoffAt)

    await driver.close()
    await driver.switchTo().window(supportWindow)
    await fixture.stopServer()
    assert.equal(fixture.isListening, false, 'No network server should remain for the cold offline launch.')
    await assert.rejects(fetch(fixture.origin), undefined, 'The production origin should be unreachable while offline.')

    await driver.switchTo().newWindow('tab')
    await driver.get(fixture.origin)
    await driver.wait(until.elementLocated(By.css('.new-match-card')), 15_000)
    await waitForPwaCacheReady(driver)
    await driver.findElement(By.css(`[aria-label="Open ${homeTeam} versus ${awayTeam}"]`)).click()
    await driver.wait(until.elementLocated(By.css('#match-heading')), 10_000)
    await driver.wait(async () => await driver.findElement(By.css('.clock-status')).getText() === 'CLOCK RUNNING', 10_000)
    const resumedMinute = Number.parseInt(await driver.findElement(By.css('[data-testid="match-minute"]')).getText(), 10)
    assert.ok(resumedMinute >= 8, `The persisted running clock should be reconstructed; got minute ${resumedMinute}.`)

    await driver.findElement(By.css('[aria-label="Record goal for Offline Home"]')).click()
    const goalDialog = await driver.wait(until.elementLocated(By.css('[role="dialog"]')), 10_000)
    await driver.findElement(By.css('textarea[name="description"]')).sendKeys('A finish after the offline restart')
    await driver.findElement(By.css('.save-goal-button')).click()
    await driver.wait(until.stalenessOf(goalDialog), 10_000)
    await driver.wait(until.elementLocated(By.css('.timeline-event[data-event-type="goal"]')), 10_000)

    await driver.findElement(By.css('#player-times-tab')).click()
    await driver.findElement(By.css('[data-action="start-substitution"]')).click()
    const substitutionDialog = await driver.wait(
      until.elementLocated(By.css('[role="dialog"][aria-label="Make a substitution"]')),
      10_000,
    )
    await driver.findElement(By.css(`[name="outgoingPlayer"][value="${starter.id}"]`)).click()
    await driver.findElement(By.css(`[name="incomingPlayer"][value="${substitute.id}"]`)).click()
    await driver.findElement(By.css('.save-substitution-button')).click()
    await driver.wait(until.stalenessOf(substitutionDialog), 10_000)
    await driver.wait(until.elementLocated(By.css('.timeline-event[data-event-type="substitution"]')), 10_000)

    await driver.findElement(By.css('#events-tab')).click()
    await driver.findElement(By.css('.timeline-event[data-event-type="substitution"] [aria-label^="Correct substitution"]')).click()
    const correctionDialog = await driver.wait(
      until.elementLocated(By.css('[role="dialog"][aria-label="Correct substitution"]')),
      10_000,
    )
    const correctedTime = driver.findElement(By.css('[name="correction-time"]'))
    await correctedTime.clear()
    await correctedTime.sendKeys('00:05')
    await driver.findElement(By.css('.save-correction-button')).click()
    await driver.wait(until.stalenessOf(correctionDialog), 10_000)

    await driver.findElement(By.css('.clock-primary')).click()
    await driver.wait(async () => await driver.findElement(By.css('.clock-status')).getText() === 'CLOCK PAUSED', 10_000)
    await driver.findElement(By.css('.clock-primary')).click()
    await driver.wait(async () => await driver.findElement(By.css('.clock-status')).getText() === 'CLOCK RUNNING', 10_000)
    const committedRecord = await readSavedMatchRecord(driver, homeTeam, awayTeam)
    assert.equal(committedRecord.goals.length, 1)
    assert.equal(committedRecord.goals[0].description, 'A finish after the offline restart')
    assert.equal(committedRecord.participation.substitutions.length, 1)
    assert.equal(committedRecord.participation.substitutions[0].elapsedMs, 5_000)
    assert.equal(committedRecord.clock.status, 'running')

    await driver.close()
    await driver.switchTo().window(supportWindow)
    await driver.switchTo().newWindow('tab')
    await driver.get(fixture.origin)
    await driver.wait(until.elementLocated(By.css('.new-match-card')), 15_000)
    await waitForPwaCacheReady(driver)
    await driver.findElement(By.css(`[aria-label="Open ${homeTeam} versus ${awayTeam}"]`)).click()
    await driver.wait(until.elementLocated(By.css('#match-heading')), 10_000)
    await driver.wait(async () => await driver.findElement(By.css('.clock-status')).getText() === 'CLOCK RUNNING', 10_000)
    await driver.wait(until.elementLocated(By.css('.timeline-event[data-event-type="goal"]')), 10_000)
    await driver.wait(until.elementLocated(By.css('.timeline-event[data-event-type="substitution"]')), 10_000)
    assert.equal(await driver.findElement(By.css('[data-testid="home-score"]')).getText(), '1')
    assert.deepEqual(await readSavedMatchRecord(driver, homeTeam, awayTeam), committedRecord,
      'A second cold offline launch should retain every successfully committed result.')
  } finally {
    await driver.quit()
    if (!fixture.isListening) await fixture.startServer()
  }
})

test('creates players, jersey inventory, a prepared match, and derived statistics after a cold offline launch', {
  skip: firefoxBinary && existsSync(firefoxBinary) ? false : 'Firefox is not installed; production cold-offline browser test is pending.',
}, async () => {
  const options = new firefox.Options().addArguments('-headless')
  options.setBinary(firefoxBinary)
  options.setPreference('network.http.use-cache', false)
  options.setPreference('browser.cache.disk.enable', false)
  options.setPreference('browser.cache.memory.enable', false)
  options.setPreference('browser.cache.offline.enable', false)
  const driver = await new Builder().forBrowser(Browser.FIREFOX).setFirefoxOptions(options).build()
  const homeTeam = 'Cold Offline United'
  const awayTeam = 'No Cloud Town'
  const initialStrikerName = 'Cold Offline Forward'
  const strikerName = 'Cold Offline Striker'
  const assistantName = 'Cold Offline Assistant'
  const setName = 'Cold Offline Home Kit'
  let supportWindow

  try {
    await driver.manage().window().setRect({ x: 0, y: 0, width: 1280, height: 900 })
    await driver.get('about:blank')
    supportWindow = await driver.getWindowHandle()
    await driver.switchTo().newWindow('tab')
    await driver.get(fixture.origin)
    await driver.wait(until.elementLocated(By.css('.new-match-card')), 15_000)
    await waitForPwaCacheReady(driver)

    await driver.close()
    await driver.switchTo().window(supportWindow)
    await fixture.stopServer()
    assert.equal(fixture.isListening, false, 'The cold-start workflow must run with the production server stopped.')
    await assert.rejects(fetch(fixture.origin), undefined, 'The production origin should be unreachable while offline.')

    await driver.switchTo().newWindow('tab')
    await driver.get(fixture.origin)
    await driver.wait(until.elementLocated(By.css('.new-match-card')), 15_000)
    await waitForPwaCacheReady(driver)
    assert.equal(await driver.executeScript(() => document.querySelector('input[type="password"]') === null), true,
      'Local workflows should not require an account or login form.')

    await driver.findElement(By.css('[data-nav="players"]')).click()
    await driver.wait(until.elementLocated(By.id('create-player-name')), 10_000)
    const playerStorageBeforeValidation = await driver.executeScript(() => localStorage.getItem('touchline.player-store'))
    await driver.findElement(By.css('.player-directory > .player-profile-form button[type="submit"]')).click()
    assert.equal(await driver.executeScript(() => document.querySelector('#create-player-name').validity.valueMissing), true,
      'The existing required player-name boundary should remain active offline.')
    assert.equal(await driver.executeScript(() => localStorage.getItem('touchline.player-store')), playerStorageBeforeValidation,
      'An invalid profile should not cross the local save boundary.')

    async function addPlayer(name, size) {
      await driver.findElement(By.id('create-player-name')).sendKeys(name)
      await driver.findElement(By.id('create-player-jersey-size')).sendKeys(size)
      await driver.findElement(By.css('.player-directory > .player-profile-form button[type="submit"]')).click()
      await driver.wait(async () => driver.executeScript((expectedName) => {
        const directory = JSON.parse(localStorage.getItem('touchline.player-store') ?? '{"players":[]}')
        return directory.players.some((player) => player.name === expectedName)
      }, name), 10_000)
    }

    await addPlayer(initialStrikerName, 'M')
    await addPlayer(assistantName, 'M')
    const playerIds = await driver.executeScript((names) => {
      const players = JSON.parse(localStorage.getItem('touchline.player-store')).players
      return Object.fromEntries(names.map((name) => [name, players.find((player) => player.name === name)?.id]))
    }, [initialStrikerName, assistantName])
    const strikerId = playerIds[initialStrikerName]
    const assistantId = playerIds[assistantName]
    assert.ok(strikerId && assistantId && strikerId !== assistantId)

    await driver.findElement(By.css(`[aria-label="Edit profile for ${initialStrikerName}"]`)).click()
    const strikerNameInput = driver.findElement(By.id(`edit-player-${strikerId}-name`))
    await strikerNameInput.clear()
    await strikerNameInput.sendKeys(strikerName)
    const strikerSizeInput = driver.findElement(By.id(`edit-player-${strikerId}-jersey-size`))
    await strikerSizeInput.clear()
    await strikerSizeInput.sendKeys('M')
    await driver.findElement(By.css(`[data-player-id="${strikerId}"] .player-profile-form button[type="submit"]`)).click()
    await driver.wait(until.elementLocated(By.css(`[aria-label="Archive ${strikerName}"]`)), 10_000)
    await driver.findElement(By.css(`[aria-label="Archive ${strikerName}"]`)).click()
    await driver.wait(async () => driver.executeScript((id) => {
      const players = JSON.parse(localStorage.getItem('touchline.player-store')).players
      return players.some((player) => player.id === id && player.archived)
    }, strikerId), 10_000)
    await driver.findElement(By.css('.player-filter button:nth-child(2)')).click()
    await driver.wait(until.elementLocated(By.css(`[aria-label="Restore ${strikerName}"]`)), 10_000)
    await driver.findElement(By.css(`[aria-label="Restore ${strikerName}"]`)).click()
    await driver.wait(async () => driver.executeScript((id) => {
      const players = JSON.parse(localStorage.getItem('touchline.player-store')).players
      return players.some((player) => player.id === id && !player.archived)
    }, strikerId), 10_000)
    await driver.findElement(By.css('.player-filter button:first-child')).click()

    await driver.findElement(By.css('[data-nav="jersey-sets"]')).click()
    await driver.wait(until.elementLocated(By.id('create-jersey-set-button')), 10_000)
    const jerseyStorageBeforeValidation = await driver.executeScript(() => localStorage.getItem('touchline.jersey-set-store'))
    await driver.findElement(By.id('create-jersey-set-button')).click()
    await driver.findElement(By.css('.jersey-set-form button[type="submit"]')).click()
    assert.equal(await driver.executeScript(() => document.querySelector('#create-jersey-set-name').validity.valueMissing), true,
      'The existing required jersey-set name boundary should remain active offline.')
    assert.equal(await driver.executeScript(() => localStorage.getItem('touchline.jersey-set-store')), jerseyStorageBeforeValidation,
      'An invalid set should not be saved.')
    await driver.findElement(By.id('create-jersey-set-name')).sendKeys(setName)
    await driver.findElement(By.css('.jersey-set-form button[type="submit"]')).click()
    await driver.wait(async () => driver.executeScript((name) => {
      const inventory = JSON.parse(localStorage.getItem('touchline.jersey-set-store') ?? '{"sets":[]}')
      return inventory.sets.some((set) => set.name === name)
    }, setName), 10_000)
    const setId = await driver.executeScript((name) => JSON.parse(localStorage.getItem('touchline.jersey-set-store'))
      .sets.find((set) => set.name === name).id, setName)

    async function addJersey(number, ownerId = '') {
      await driver.findElement(By.id(`add-jersey-${setId}`)).click()
      const inventoryBeforeValidation = await driver.executeScript(() => localStorage.getItem('touchline.jersey-set-store'))
      await driver.findElement(By.css('.jersey-form button[type="submit"]')).click()
      assert.equal(await driver.executeScript((id) => document.querySelector(`#create-jersey-${id}-number`).validity.valueMissing, setId), true,
        'The existing required jersey-number boundary should remain active offline.')
      assert.equal(await driver.executeScript(() => localStorage.getItem('touchline.jersey-set-store')), inventoryBeforeValidation,
        'An invalid jersey item should not be saved.')
      await driver.findElement(By.id(`create-jersey-${setId}-number`)).sendKeys(String(number))
      await driver.findElement(By.id(`create-jersey-${setId}-size`)).sendKeys('M')
      if (ownerId) {
        await new Select(await driver.findElement(By.id(`create-jersey-${setId}-owner`))).selectByValue(ownerId)
      }
      await driver.findElement(By.css('.jersey-form button[type="submit"]')).click()
      await driver.wait(async () => driver.executeScript((id, expectedCount) => {
        const inventory = JSON.parse(localStorage.getItem('touchline.jersey-set-store'))
        return inventory.sets.find((set) => set.id === id)?.jerseys.length === expectedCount
      }, setId, number === 9 ? 1 : 2), 10_000)
    }

    await addJersey(9, strikerId)
    await addJersey(10)

    await driver.findElement(By.css('[data-nav="players"]')).click()
    await driver.wait(until.elementLocated(By.id(`edit-preferred-numbers-${strikerId}`)), 10_000)
    await driver.findElement(By.id(`edit-preferred-numbers-${strikerId}`)).click()
    const preferredNumberInput = driver.findElement(By.id(`preferred-player-${strikerId}-${setId}`))
    await preferredNumberInput.sendKeys('9')
    await driver.findElement(By.css(`[data-player-id="${strikerId}"] .preferred-number-form button[type="submit"]`)).click()
    await driver.wait(async () => driver.executeScript((id, jerseySetId) => {
      const inventory = JSON.parse(localStorage.getItem('touchline.jersey-set-store'))
      return inventory.sets.find((set) => set.id === jerseySetId)?.preferredNumbers
        .some((preference) => preference.playerId === id && preference.number === 9)
    }, strikerId, setId), 10_000)

    await driver.findElement(By.css('[data-nav="matches"]')).click()
    await driver.wait(until.elementLocated(By.css('.new-match-card')), 10_000)
    assert.equal(await driver.findElement(By.css('.start-button')).isEnabled(), false,
      'Match creation should remain disabled until both team names are supplied.')
    assert.equal(await readSavedMatchRecord(driver, homeTeam, awayTeam), null)
    await driver.findElement(By.id('home-team')).sendKeys(homeTeam)
    await driver.findElement(By.id('away-team')).sendKeys(awayTeam)
    await driver.findElement(By.css('.start-button')).click()
    await driver.wait(until.elementLocated(By.css('#preparation-heading')), 10_000)
    const unpreparedMatch = await readSavedMatchRecord(driver, homeTeam, awayTeam)
    assert.equal(unpreparedMatch.clock.status, 'not-started')
    assert.equal(unpreparedMatch.firstKickoffAt, null, 'Creating the match must not start kickoff.')
    assert.equal(unpreparedMatch.participation, null)

    await driver.findElement(By.css('.squad-setup .primary-button')).click()
    await driver.findElement(By.css('.squad-form button[type="submit"]')).click()
    await driver.wait(until.elementLocated(By.css('.squad-form .squad-error[role="alert"]')), 10_000)
    assert.equal((await readSavedMatchRecord(driver, homeTeam, awayTeam)).participation, null,
      'Invalid preparation input must not commit a squad.')
    await driver.findElement(By.css('[name="own-side"][value="home"]')).click()
    await driver.findElement(By.css(`[aria-label="Include ${strikerName} in match squad"]`)).click()
    await driver.findElement(By.css(`[aria-label="Include ${assistantName} in match squad"]`)).click()
    await driver.findElement(By.css(`[aria-label="Select ${strikerName} as a starter"]`)).click()
    await driver.findElement(By.css('.squad-form button[type="submit"]')).click()
    await driver.wait(until.elementLocated(By.css('.jersey-editor')), 10_000)
    await new Select(await driver.findElement(By.id('jersey-assignment-set'))).selectByValue(setId)
    await driver.findElement(By.css('.generate-button')).click()
    await driver.wait(async () => driver.executeScript((ids) => {
      const values = ids.map((id) => document.querySelector(`#jersey-for-${id}`)?.value ?? '')
      return values.every(Boolean) && new Set(values).size === values.length
    }, [strikerId, assistantId]), 10_000)
    const acceptedJerseys = await driver.executeScript((ids) => ids.map((id) =>
      document.querySelector(`#jersey-for-${id}`).value), [strikerId, assistantId])
    await driver.findElement(By.css('.accept-button')).click()
    await driver.wait(until.elementLocated(By.css('#match-heading')), 10_000)
    let savedMatch = await readSavedMatchRecord(driver, homeTeam, awayTeam)
    assert.equal(savedMatch.firstKickoffAt, null, 'Saving squad and jersey preparation must not start kickoff.')
    assert.equal(savedMatch.clock.status, 'not-started')
    assert.equal(savedMatch.jerseyAssignment.rows.length, 2)
    assert.deepEqual(savedMatch.jerseyAssignment.rows.map(({ jersey }) => jersey?.jerseyId ?? null), acceptedJerseys)

    await driver.findElement(By.css('.clock-primary')).click()
    await driver.wait(async () => await driver.findElement(By.css('.clock-status')).getText() === 'CLOCK RUNNING', 10_000)
    await driver.findElement(By.css(`[aria-label="Record goal for ${homeTeam}"]`)).click()
    const goalDialog = await driver.wait(until.elementLocated(By.css('[role="dialog"]')), 10_000)
    await new Select(await driver.findElement(By.id('goal-scorer-player'))).selectByValue(strikerId)
    await new Select(await driver.findElement(By.id('goal-assist-player'))).selectByValue(assistantId)
    await driver.findElement(By.css('.save-goal-button')).click()
    await driver.wait(until.stalenessOf(goalDialog), 10_000)
    await driver.wait(until.elementLocated(By.css('.timeline-event[data-event-type="goal"]')), 10_000)
    await driver.findElement(By.css('.clock-primary')).click()
    await driver.wait(async () => await driver.findElement(By.css('.clock-status')).getText() === 'CLOCK PAUSED', 10_000)

    async function assertPlayerStatistics(name, goals, assists) {
      await driver.findElement(By.css(`[aria-label="View statistics for ${name}"]`)).click()
      await driver.wait(until.elementLocated(By.css('#player-statistics-heading')), 10_000)
      await driver.wait(async () => await driver.findElement(By.css('[data-testid="goal-count"]')).getText() === String(goals), 10_000)
      assert.equal(await driver.findElement(By.css('[data-testid="assist-count"]')).getText(), String(assists))
      await driver.findElement(By.css('.back-link')).click()
      await driver.wait(until.elementLocated(By.id('player-directory-heading')), 10_000)
    }

    await driver.findElement(By.css('[data-nav="players"]')).click()
    await driver.wait(until.elementLocated(By.css(`[data-player-id="${strikerId}"]`)), 10_000)
    await assertPlayerStatistics(strikerName, 1, 0)
    await assertPlayerStatistics(assistantName, 0, 1)
    savedMatch = await readSavedMatchRecord(driver, homeTeam, awayTeam)
    assert.equal(savedMatch.goals.length, 1)
    assert.deepEqual([savedMatch.goals[0].scorerPlayerId, savedMatch.goals[0].assistPlayerId], [strikerId, assistantId])

    const savedLocalPayloads = await driver.executeScript(() => ({
      players: localStorage.getItem('touchline.player-store'),
      jerseys: localStorage.getItem('touchline.jersey-set-store'),
    }))

    await driver.close()
    await driver.switchTo().window(supportWindow)
    await assert.rejects(fetch(fixture.origin), undefined, 'No production server should be running during the second launch.')
    await driver.switchTo().newWindow('tab')
    await driver.get(fixture.origin)
    await driver.wait(until.elementLocated(By.css('.new-match-card')), 15_000)
    await waitForPwaCacheReady(driver)
    assert.equal(await driver.executeScript(() => document.querySelector('input[type="password"]') === null), true)

    await driver.findElement(By.css('[data-nav="players"]')).click()
    await driver.wait(until.elementLocated(By.css(`[data-player-id="${strikerId}"] .preferred-number-list`)), 10_000)
    const strikerCard = await driver.findElement(By.css(`[data-player-id="${strikerId}"]`)).getText()
    assert.match(strikerCard, new RegExp(strikerName))
    assert.match(strikerCard, /Jersey size M/)
    assert.match(await driver.findElement(By.css(`[data-player-id="${strikerId}"] .preferred-number-list`)).getText(), /9/)
    assert.equal(await driver.findElements(By.css('.player-card')).then((cards) => cards.length), 2)

    await driver.findElement(By.css('[data-nav="jersey-sets"]')).click()
    await driver.wait(until.elementLocated(By.css(`#selected-set-${setId}`)), 10_000)
    await driver.wait(async () => await driver.findElements(By.css('.selected-set-panel .jersey-row')).then((rows) => rows.length === 2), 10_000)
    const jerseyRows = await driver.findElements(By.css('.selected-set-panel .jersey-row'))
    const jerseyText = await Promise.all(jerseyRows.map((row) => row.getText()))
    assert.match(jerseyText.join('\n'), /9/)
    assert.match(jerseyText.join('\n'), /10/)

    await driver.findElement(By.css('[data-nav="matches"]')).click()
    await driver.wait(until.elementLocated(By.css(`[aria-label="Open ${homeTeam} versus ${awayTeam}"]`)), 10_000)
    await driver.findElement(By.css(`[aria-label="Open ${homeTeam} versus ${awayTeam}"]`)).click()
    await driver.wait(until.elementLocated(By.css('#match-heading')), 10_000)
    await driver.wait(until.elementLocated(By.css('.timeline-event[data-event-type="goal"]')), 10_000)
    assert.equal(await driver.findElement(By.css('[data-testid="home-score"]')).getText(), '1')
    await driver.wait(async () => await driver.findElement(By.css('.clock-status')).getText() === 'CLOCK PAUSED', 10_000)
    await driver.findElement(By.css('[data-nav="players"]')).click()
    await driver.wait(until.elementLocated(By.css(`[data-player-id="${strikerId}"]`)), 10_000)
    await assertPlayerStatistics(strikerName, 1, 0)
    await assertPlayerStatistics(assistantName, 0, 1)

    assert.deepEqual(await driver.executeScript(() => ({
      players: localStorage.getItem('touchline.player-store'),
      jerseys: localStorage.getItem('touchline.jersey-set-store'),
    })), savedLocalPayloads, 'Player and jersey commits should be unchanged after another offline launch.')
    assert.deepEqual(await readSavedMatchRecord(driver, homeTeam, awayTeam), savedMatch,
      'The committed match and its derived statistics should survive a second offline launch unchanged.')
    const networkOrigins = await driver.executeScript(() => [...new Set(
      performance.getEntriesByType('resource')
        .map(({ name }) => {
          try { return new URL(name).origin } catch { return null }
        })
        .filter((origin) => origin && /^https?:/.test(origin)),
    )].sort())
    assert.deepEqual(networkOrigins, [fixture.origin], 'Offline workflows must not request remote services or assets.')
  } finally {
    await driver.quit()
    if (!fixture.isListening) await fixture.startServer()
  }
})

test('detects and explicitly applies release B without losing open drafts or rewriting local payloads', {
  skip: firefoxBinary && existsSync(firefoxBinary) ? false : 'Firefox is not installed; production update-browser test is pending.',
}, async () => {
  const options = new firefox.Options().addArguments('-headless')
  options.setBinary(firefoxBinary)
  options.setPreference('network.http.use-cache', false)
  options.setPreference('browser.cache.disk.enable', false)
  options.setPreference('browser.cache.memory.enable', false)
  options.setPreference('browser.cache.offline.enable', false)
  const driver = await new Builder().forBrowser(Browser.FIREFOX).setFirefoxOptions(options).build()
  const playerId = 'pwa-update-player'
  const setId = 'pwa-update-set'
  const jerseyId = 'pwa-update-jersey'
  const playerName = 'Update Draft Player'
  const goalDraft = 'Unsaved goal details stay open'
  const playerDraft = 'Uncommitted player name'
  const jerseyDraft = '99'
  const legacyPayload = JSON.stringify({
    version: 1,
    matches: [{ id: 'legacy-remains-untouched', homeTeam: 'Older data', awayTeam: 'Ignored' }],
    extension: { retain: true },
  })
  let supportWindow
  let fixtureTabs = {}

  try {
    await fixture.serveRelease('A')
    await driver.manage().window().setRect({ x: 0, y: 0, width: 1280, height: 900 })
    await driver.get('about:blank')
    supportWindow = await driver.getWindowHandle()
    const archiveTab = await openPreparedAppTab(driver)

    const seedResult = await driver.executeAsyncScript((legacy, done) => {
      const player = {
        id: 'pwa-update-player',
        name: 'Update Draft Player',
        positions: [],
        jerseySize: 'M',
        archived: false,
        createdAt: 1,
        updatedAt: 1,
      }
      const playerPayload = JSON.stringify({ version: 3, players: [player] })
      const jerseyPayload = JSON.stringify({
        version: 1,
        sets: [{
          id: 'pwa-update-set',
          name: 'Update Kit',
          jerseys: [{ id: 'pwa-update-jersey', number: 12, size: 'M', ownerPlayerId: player.id }],
          preferredNumbers: [],
          createdAt: 1,
          updatedAt: 1,
          extension: { retain: 'raw jersey payload' },
        }],
      })
      localStorage.setItem('touchline.player-store', playerPayload)
      localStorage.setItem('touchline.jersey-set-store', jerseyPayload)
      localStorage.setItem('touchline.match-store', legacy)

      const now = Date.now()
      const makeMatch = (id, version, homeTeam, awayTeam) => ({
        id,
        homeTeam,
        awayTeam,
        createdAt: now - 10_000,
        updatedAt: now - 5_000,
        clock: { period: 1, elapsedMs: 0, status: 'not-started', startedAt: null },
        goals: [{
          id: `${id}-goal`,
          side: 'home',
          period: 1,
          elapsedMs: 30_000,
          scorer: 'Saved scorer',
          assist: '',
          description: '',
          createdAt: now - 2_000,
        }],
        ...(version === 1 ? { legacyExtension: { keep: ['format-one', 'raw'] } } : {}),
        ...(version >= 2 ? {
          recordVersion: version,
          participation: null,
          completedPeriodElapsedMs: { 1: null, 2: null },
        } : {}),
        ...(version >= 3 ? { firstKickoffAt: null, jerseyAssignment: null } : {}),
      })
      const formatOne = makeMatch('pwa-format-one', 1, 'Format One Home', 'Format One Away')
      const formatTwo = makeMatch('pwa-format-two', 2, 'Format Two Home', 'Format Two Away')
      const formatThree = makeMatch('pwa-format-three', 3, 'Format Three Home', 'Format Three Away')
      const formatFour = {
        ...makeMatch('pwa-format-four', 4, 'Format Four Home', 'Format Four Away'),
        clock: { period: 1, elapsedMs: 60_000, status: 'running', startedAt: now - 60_000 },
        participation: {
          ownSide: 'home',
          squad: [{ playerId: player.id, nameSnapshot: player.name }],
          starterIds: [player.id],
          substitutions: [],
        },
        firstKickoffAt: now - 60_000,
        goals: [{
          id: 'pwa-format-four-goal',
          side: 'home',
          period: 1,
          elapsedMs: 30_000,
          scorerPlayerId: player.id,
          scorer: player.name,
          assistPlayerId: null,
          assist: '',
          description: 'Already saved',
          createdAt: now - 2_000,
        }],
      }
      const request = indexedDB.open('touchline', 1)
      request.onerror = () => done(`IndexedDB open failed: ${request.error?.message}`)
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction('matches', 'readwrite')
        const store = transaction.objectStore('matches')
        for (const record of [formatOne, formatTwo, formatThree, formatFour]) store.put(record)
        transaction.oncomplete = () => {
          database.close()
          done(JSON.stringify({ playerPayload, jerseyPayload }))
        }
        transaction.onerror = () => {
          database.close()
          done(`IndexedDB seed failed: ${transaction.error?.message}`)
        }
        transaction.onabort = () => {
          database.close()
          done(`IndexedDB seed aborted: ${transaction.error?.message}`)
        }
      }
    }, legacyPayload)
    assert.equal(typeof seedResult, 'string')
    const seededPayloads = JSON.parse(seedResult)
    await driver.navigate().refresh()
    await driver.wait(until.elementLocated(By.css('.new-match-card')), 15_000)
    await waitForPwaCacheReady(driver)
    await driver.wait(async () => driver.executeScript(() => navigator.serviceWorker.controller?.state === 'activated'),
      10_000, 'The release-A archive should be controlled before testing a waiting release.')
    await driver.wait(async () => await driver.findElements(By.css('.match-list-item')).then((items) => items.length === 4), 10_000)
    const rawBefore = await readPwaDomainSnapshot(driver)
    assert.deepEqual(rawBefore.matches.map(({ recordVersion }) => recordVersion ?? 1).sort(), [1, 2, 3, 4])
    assert.equal(rawBefore.playerPayload, seededPayloads.playerPayload)
    assert.equal(rawBefore.jerseyPayload, seededPayloads.jerseyPayload)
    assert.equal(rawBefore.legacyPayload, legacyPayload)

    fixtureTabs.match = await openPreparedAppTab(driver)
    await driver.findElement(By.css('[aria-label="Open Format Four Home versus Format Four Away"]')).click()
    await driver.wait(async () => await driver.findElement(By.css('.clock-status')).getText() === 'CLOCK RUNNING', 10_000)
    await driver.findElement(By.css('.goal-editor-launcher')).click()
    await driver.wait(until.elementLocated(By.css('[role="dialog"]')), 10_000)
    await driver.findElement(By.css('textarea[name="description"]')).sendKeys(goalDraft)

    fixtureTabs.preparation = await openPreparedAppTab(driver)
    await driver.findElement(By.css('[aria-label="Open Format Three Home versus Format Three Away"]')).click()
    await driver.wait(until.elementLocated(By.css('#match-heading')), 10_000)
    await driver.findElement(By.css('.prepare-match-button')).click()
    await driver.wait(until.elementLocated(By.css('#preparation-heading')), 10_000)
    await driver.findElement(By.css('[name="own-side"][value="home"]')).click()
    await driver.findElement(By.css(`[aria-label="Include ${playerName} in match squad"]`)).click()

    fixtureTabs.player = await openPreparedAppTab(driver)
    await driver.findElement(By.css('[data-nav="players"]')).click()
    await driver.wait(until.elementLocated(By.css(`[data-player-id="${playerId}"]`)), 10_000)
    await driver.findElement(By.css(`[aria-label="Edit profile for ${playerName}"]`)).click()
    const playerNameInput = driver.findElement(By.id(`edit-player-${playerId}-name`))
    await playerNameInput.clear()
    await playerNameInput.sendKeys(playerDraft)

    fixtureTabs.jersey = await openPreparedAppTab(driver)
    await driver.findElement(By.css('[data-nav="jersey-sets"]')).click()
    await driver.wait(until.elementLocated(By.css(`#selected-set-${setId}`)), 10_000)
    await driver.findElement(By.css(`[data-jersey-id="${jerseyId}"] button[aria-label^="Edit"]`)).click()
    const jerseyNumberInput = driver.findElement(By.id(`edit-jersey-${jerseyId}-number`))
    await jerseyNumberInput.clear()
    await jerseyNumberInput.sendKeys(jerseyDraft)

    for (const [name, handle] of Object.entries({ archive: archiveTab, ...fixtureTabs })) {
      await driver.switchTo().window(handle)
      assert.equal(await driver.executeScript(() => document.querySelector('meta[name="touchline-e2e-release"]')?.content), 'A',
        `${name} should still be displaying release A before B is published.`)
      assert.equal(await driver.executeScript(() => navigator.serviceWorker.controller?.state), 'activated',
        `${name} should be controlled by release A so B remains a waiting worker.`)
    }

    await fixture.serveRelease('B')
    await driver.switchTo().window(archiveTab)
    const updateCheckResult = await driver.executeAsyncScript((done) => {
      navigator.serviceWorker.ready
        .then((registration) => registration.update())
        .then(() => done(null))
        .catch((error) => done(String(error)))
    })
    assert.equal(updateCheckResult, null, String(updateCheckResult))
    await driver.wait(async () => driver.executeAsyncScript(async (done) => {
      const registration = await navigator.serviceWorker.getRegistration(location.href)
      done(registration?.waiting?.state === 'installed')
    }), 30_000, 'Release B should finish installation as a waiting worker.')
    await driver.wait(async () => {
      try {
        const marker = await driver.executeScript(() => document.querySelector('meta[name="touchline-e2e-release"]')?.content)
        const button = await driver.findElement(By.css('.pwa-status button.pwa-status-primary'))
        return marker === 'A' && await button.getText() === 'Update app' && await button.isEnabled()
      } catch {
        return false
      }
    }, 30_000, 'A clean archive should expose an enabled explicit update action.')

    for (const [name, handle] of Object.entries(fixtureTabs)) {
      await driver.switchTo().window(handle)
      assert.equal(await driver.executeScript(() => document.querySelector('meta[name="touchline-e2e-release"]')?.content), 'A',
        `${name} should remain on the already loaded release while B is detected.`)
      assert.equal(await driver.findElements(By.css('.pwa-status')).then((items) => items.length), 0,
        `${name} should not show archive update controls over its active work.`)
    }
    await driver.switchTo().window(fixtureTabs.match)
    assert.equal(await driver.findElement(By.css('textarea[name="description"]')).getDomProperty('value'), goalDraft)
    await driver.switchTo().window(fixtureTabs.preparation)
    assert.equal(await driver.findElement(By.css('[name="own-side"][value="home"]')).isSelected(), true)
    assert.equal(await driver.findElement(By.css(`[aria-label="Include ${playerName} in match squad"]`)).isSelected(), true)
    await driver.switchTo().window(fixtureTabs.player)
    assert.equal(await driver.findElement(By.id(`edit-player-${playerId}-name`)).getDomProperty('value'), playerDraft)
    await driver.switchTo().window(fixtureTabs.jersey)
    assert.equal(await driver.findElement(By.id(`edit-jersey-${jerseyId}-number`)).getDomProperty('value'), jerseyDraft)

    await driver.switchTo().window(archiveTab)
    await driver.findElement(By.css('.pwa-status button.pwa-status-primary')).click()
    await driver.wait(async () => await driver.executeScript(() =>
      document.querySelector('meta[name="touchline-e2e-release"]')?.content) === 'B',
    30_000, 'The requesting archive should reload into release B after its waiting worker activates.')
    await driver.wait(until.elementLocated(By.css('.new-match-card')), 10_000)
    await waitForPwaCacheReady(driver)

    for (const [name, handle] of Object.entries(fixtureTabs)) {
      await driver.switchTo().window(handle)
      assert.equal(await driver.executeScript(() => document.querySelector('meta[name="touchline-e2e-release"]')?.content), 'A',
        `${name} must not reload when another tab activates B.`)
      assert.equal(await driver.findElements(By.css('.pwa-status')).then((items) => items.length), 0)
    }
    await driver.switchTo().window(fixtureTabs.match)
    assert.equal(await driver.findElement(By.css('textarea[name="description"]')).getDomProperty('value'), goalDraft)
    await driver.switchTo().window(fixtureTabs.preparation)
    assert.equal(await driver.findElement(By.css('[name="own-side"][value="home"]')).isSelected(), true)
    assert.equal(await driver.findElement(By.css(`[aria-label="Include ${playerName} in match squad"]`)).isSelected(), true)
    await driver.switchTo().window(fixtureTabs.player)
    assert.equal(await driver.findElement(By.id(`edit-player-${playerId}-name`)).getDomProperty('value'), playerDraft)
    await driver.switchTo().window(fixtureTabs.jersey)
    assert.equal(await driver.findElement(By.id(`edit-jersey-${jerseyId}-number`)).getDomProperty('value'), jerseyDraft)

    await driver.switchTo().window(archiveTab)
    assert.equal(await driver.executeScript(() => navigator.serviceWorker.controller?.state), 'activated')
    assert.deepEqual(await readPwaDomainSnapshot(driver), rawBefore,
      'Applying the app release without domain writes must preserve all supported match formats and raw localStorage payloads.')
  } finally {
    await driver.quit()
    fixture.restoreResource('index.html')
    await fixture.serveRelease('A')
    if (!fixture.isListening) await fixture.startServer()
  }
})

test('keeps release A ready for offline launch when a required release-B asset is withheld', {
  skip: firefoxBinary && existsSync(firefoxBinary) ? false : 'Firefox is not installed; production failed-update browser test is pending.',
}, async () => {
  const options = new firefox.Options().addArguments('-headless')
  options.setBinary(firefoxBinary)
  options.setPreference('network.http.use-cache', false)
  options.setPreference('browser.cache.disk.enable', false)
  options.setPreference('browser.cache.memory.enable', false)
  options.setPreference('browser.cache.offline.enable', false)
  const driver = await new Builder().forBrowser(Browser.FIREFOX).setFirefoxOptions(options).build()
  const savedPayloads = {
    'touchline.player-store': JSON.stringify({ version: 3, players: [] }),
    'touchline.jersey-set-store': JSON.stringify({ version: 1, sets: [] }),
    'touchline.match-store': JSON.stringify({
      version: 1,
      matches: [{ id: 'failed-update-legacy-sentinel', homeTeam: 'Saved Home', awayTeam: 'Saved Away' }],
    }),
  }
  let supportWindow

  try {
    await fixture.restoreResource('index.html')
    await fixture.serveRelease('A')
    await driver.manage().window().setRect({ x: 0, y: 0, width: 1280, height: 900 })
    await driver.get('about:blank')
    supportWindow = await driver.getWindowHandle()
    await openPreparedAppTab(driver)
    await driver.navigate().refresh()
    await driver.wait(until.elementLocated(By.css('.new-match-card')), 15_000)
    await waitForPwaCacheReady(driver)
    await waitForControlledWorker(driver, 'Release A must control the page before testing a failed update.')
    assert.equal(await driver.executeScript(() => document.querySelector('meta[name="touchline-e2e-release"]')?.content), 'A')
    await driver.executeScript((payloads) => {
      for (const [key, value] of Object.entries(payloads)) localStorage.setItem(key, value)
    }, savedPayloads)

    await fixture.serveRelease('B')
    fixture.withholdResource('index.html')
    assert.equal((await fetch(new URL('/index.html', fixture.origin))).status, 404,
      'The changed required B entry document should be unavailable to the installing worker.')
    await requestProductionWorkerUpdate(driver)
    await driver.wait(async () => driver.executeScript(() => window.__touchlineWorkerStates?.includes('redundant')),
      30_000, 'The incomplete B worker should fail installation and become redundant.')

    const failedRegistration = await driver.executeAsyncScript((done) => {
      navigator.serviceWorker.getRegistration(location.href).then((registration) => done(JSON.stringify({
        active: registration?.active?.state ?? null,
        waiting: registration?.waiting?.state ?? null,
        installing: registration?.installing?.state ?? null,
        states: window.__touchlineWorkerStates,
      }))).catch((error) => done(String(error)))
    })
    assert.equal(typeof failedRegistration, 'string')
    const registrationState = JSON.parse(failedRegistration)
    assert.equal(registrationState.active, 'activated', 'The previously prepared A worker should remain active.')
    assert.equal(registrationState.waiting, null, 'A failed B install must not become an applicable update.')
    assert.ok(registrationState.states.includes('redundant'))
    assert.equal(await driver.executeScript(() => document.querySelector('meta[name="touchline-e2e-release"]')?.content), 'A')
    const failureMessage = await driver.findElement(By.css('.pwa-status-message')).getText()
    assert.match(failureMessage, /app update failed/i)
    assert.match(failureMessage, /current offline release is still ready/i)
    assert.doesNotMatch(failureMessage, /match save|could not save/i)
    assert.equal(await driver.findElements(By.css('.pwa-status button')).then((buttons) => buttons.length), 0,
      'A failed install must not offer an action that claims B is ready.')
    await waitForPwaCacheReady(driver)

    await driver.switchTo().window(supportWindow)
    await fixture.stopServer()
    await assert.rejects(fetch(fixture.origin), undefined, 'The fixture server should be unavailable for the cold launch.')
    await driver.switchTo().newWindow('tab')
    await driver.get(fixture.origin)
    await driver.wait(until.elementLocated(By.css('.new-match-card')), 15_000)
    await waitForPwaCacheReady(driver)
    assert.equal(await driver.executeScript(() => document.querySelector('meta[name="touchline-e2e-release"]')?.content), 'A',
      'A new offline tab should launch the last complete release, not incomplete B.')
    assert.match(await driver.findElement(By.css('.pwa-status-message')).getText(), /Ready to open offline/)
    assert.deepEqual(await driver.executeScript((keys) => Object.fromEntries(
      keys.map((key) => [key, localStorage.getItem(key)]),
    ), Object.keys(savedPayloads)), savedPayloads, 'A failed update must preserve all existing localStorage payloads.')
  } finally {
    await driver.quit()
    fixture.restoreResource('index.html')
    await fixture.serveRelease('A')
    if (!fixture.isListening) await fixture.startServer()
  }
})

test('keeps an active tab and its draft intact when a second tab activates release B', {
  skip: firefoxBinary && existsSync(firefoxBinary) ? false : 'Firefox is not installed; production external-activation browser test is pending.',
}, async () => {
  const options = new firefox.Options().addArguments('-headless')
  options.setBinary(firefoxBinary)
  options.setPreference('network.http.use-cache', false)
  options.setPreference('browser.cache.disk.enable', false)
  options.setPreference('browser.cache.memory.enable', false)
  options.setPreference('browser.cache.offline.enable', false)
  const driver = await new Builder().forBrowser(Browser.FIREFOX).setFirefoxOptions(options).build()
  const homeTeam = 'External Update Home'
  const awayTeam = 'External Update Away'
  const savedDescription = 'Committed before the external update'
  const goalDraft = 'Uncommitted details remain in this tab'
  let supportWindow
  let matchTab
  let archiveTab

  try {
    await fixture.restoreResource('index.html')
    await fixture.serveRelease('A')
    await driver.manage().window().setRect({ x: 0, y: 0, width: 1280, height: 900 })
    await driver.get('about:blank')
    supportWindow = await driver.getWindowHandle()
    matchTab = await openPreparedAppTab(driver)
    await driver.navigate().refresh()
    await driver.wait(until.elementLocated(By.css('.new-match-card')), 15_000)
    await waitForPwaCacheReady(driver)
    await waitForControlledWorker(driver)

    await driver.findElement(By.id('home-team')).sendKeys(homeTeam)
    await driver.findElement(By.id('away-team')).sendKeys(awayTeam)
    await driver.findElement(By.css('.new-match-card button[type="submit"]')).click()
    await driver.wait(until.elementLocated(By.css('#preparation-heading')), 10_000)
    await driver.findElement(By.css('.squad-setup > .quiet-button')).click()
    await driver.wait(until.elementLocated(By.css('#match-heading')), 10_000)
    await driver.findElement(By.css(`[aria-label="Record goal for ${homeTeam}"]`)).click()
    const recordGoalDialog = await driver.wait(until.elementLocated(By.css('[role="dialog"]')), 10_000)
    await driver.findElement(By.css('textarea[name="description"]')).sendKeys(savedDescription)
    await driver.findElement(By.css('.save-goal-button')).click()
    await driver.wait(until.stalenessOf(recordGoalDialog), 10_000)
    await driver.wait(until.elementLocated(By.css('.timeline-event[data-event-type="goal"]')), 10_000)
    const savedMatch = await readSavedMatchRecord(driver, homeTeam, awayTeam)
    assert.equal(savedMatch.goals[0].description, savedDescription)

    await driver.findElement(By.css('.goal-editor-launcher')).click()
    const editGoalDialog = await driver.wait(until.elementLocated(By.css('[role="dialog"]')), 10_000)
    await driver.findElement(By.css('textarea[name="description"]')).clear()
    await driver.findElement(By.css('textarea[name="description"]')).sendKeys(goalDraft)

    archiveTab = await openPreparedAppTab(driver)
    await waitForControlledWorker(driver)
    assert.equal(await driver.executeScript(() => document.querySelector('meta[name="touchline-e2e-release"]')?.content), 'A')

    await driver.switchTo().window(matchTab)
    await driver.executeScript(() => {
      window.__touchlineExternalControllerChanges = 0
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.__touchlineExternalControllerChanges += 1
      })
    })
    await fixture.serveRelease('B')
    await driver.switchTo().window(archiveTab)
    await requestProductionWorkerUpdate(driver)
    await driver.wait(async () => driver.executeAsyncScript(async (done) => {
      const registration = await navigator.serviceWorker.getRegistration(location.href)
      done(registration?.waiting?.state === 'installed')
    }), 30_000, 'The archive tab should detect B as a waiting worker.')
    await driver.wait(async () => {
      try {
        return await driver.findElement(By.css('.pwa-status button.pwa-status-primary')).getText() === 'Update app'
      } catch {
        return false
      }
    }, 15_000, 'The clean archive tab should be able to initiate B activation.')
    await driver.findElement(By.css('.pwa-status button.pwa-status-primary')).click()
    await driver.wait(async () => await driver.executeScript(() =>
      document.querySelector('meta[name="touchline-e2e-release"]')?.content) === 'B',
    30_000, 'The archive tab should reload into B after explicitly activating it.')
    await driver.wait(until.elementLocated(By.css('.new-match-card')), 10_000)
    await waitForPwaCacheReady(driver)

    await driver.switchTo().window(matchTab)
    await driver.wait(async () => driver.executeScript(() => window.__touchlineExternalControllerChanges > 0),
      10_000, 'The active tab should observe the external controller change without reloading.')
    assert.equal(await driver.executeScript(() => document.querySelector('meta[name="touchline-e2e-release"]')?.content), 'A')
    assert.equal(await driver.findElement(By.css('#match-heading')).isDisplayed(), true)
    assert.equal(await driver.findElement(By.css('textarea[name="description"]')).getDomProperty('value'), goalDraft)
    assert.deepEqual(await readSavedMatchRecord(driver, homeTeam, awayTeam), savedMatch,
      'No domain write should occur while the second tab activates B.')

    await driver.findElement(By.css('.discard-goal-button')).click()
    await driver.findElement(By.css('.focused-editor__close')).click()
    await driver.wait(until.stalenessOf(editGoalDialog), 10_000)
    await driver.findElement(By.css('[data-nav="matches"]')).click()
    await driver.wait(until.elementLocated(By.css('.new-match-card')), 10_000)
    await driver.wait(async () => {
      try {
        return (await driver.findElement(By.css('.pwa-status-message')).getText())
          .includes('A newer app release is active.')
      } catch {
        return false
      }
    }, 10_000, 'The active tab should offer a guarded reload from the archive.')
    const reloadButton = driver.findElement(By.css('.pwa-status button.pwa-status-primary'))
    assert.equal(await reloadButton.getText(), 'Reload app')
    assert.equal(await reloadButton.isEnabled(), true)
    assert.equal(await driver.executeScript(() => document.querySelector('meta[name="touchline-e2e-release"]')?.content), 'A',
      'The reload offer must not automatically move this tab to B.')
  } finally {
    await driver.quit()
    fixture.restoreResource('index.html')
    await fixture.serveRelease('A')
    if (!fixture.isListening) await fixture.startServer()
  }
})
