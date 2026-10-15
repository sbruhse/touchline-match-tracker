import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'
import { build } from 'vite'

const projectRoot = process.cwd()
const sourcePaths = [
  'index.html',
  'vite.config.ts',
  'src/app/main.ts',
  'src/app/ui/App.vue',
]
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff2': 'font/woff2',
}

async function sourceFingerprint() {
  const entries = await Promise.all(sourcePaths.map(async (path) => {
    const contents = await readFile(join(projectRoot, path))
    return [path, createHash('sha256').update(contents).digest('hex')]
  }))
  return JSON.stringify(entries)
}

async function sendFile(request, response, outputDir, withheldResources) {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://fixture.invalid').pathname)
  } catch {
    response.writeHead(400).end()
    return
  }

  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  if (withheldResources.has(relativePath)) {
    response.writeHead(404, { 'Cache-Control': 'no-store' }).end()
    return
  }
  const filePath = resolve(outputDir, relativePath)
  if (!filePath.startsWith(`${outputDir}${sep}`)) {
    response.writeHead(404).end()
    return
  }

  try {
    const contents = await readFile(filePath)
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
    })
    response.end(contents)
  } catch {
    response.writeHead(404, { 'Cache-Control': 'no-store' }).end()
  }
}

function releaseMarkerPlugin(marker) {
  return {
    name: 'touchline-e2e-release-marker',
    enforce: 'pre',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace('<head>', `<head>\n    <meta name="touchline-e2e-release" content="${marker}">`)
      },
    },
  }
}

export async function createProductionPwaFixture({ port: requestedPort = 0 } = {}) {
  const initialFingerprint = await sourceFingerprint()
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'touchline-pwa-e2e-'))
  const releaseDirectories = new Map()
  const withheldResources = new Set()
  let activeRelease = 'A'
  let server
  let port = requestedPort || undefined

  async function buildRelease(marker) {
    if (!/^[A-Z][A-Z0-9-]*$/.test(marker)) throw new Error(`Invalid fixture release marker: ${marker}`)
    if (releaseDirectories.has(marker)) return releaseDirectories.get(marker)

    const outputDir = join(temporaryRoot, `build-${marker}`)
    await build({
      configFile: resolve(projectRoot, 'vite.config.ts'),
      root: projectRoot,
      base: '/',
      plugins: [releaseMarkerPlugin(marker)],
      build: { outDir: outputDir, emptyOutDir: true },
    })

    const html = await readFile(join(outputDir, 'index.html'), 'utf8')
    if (!html.includes(`name="touchline-e2e-release" content="${marker}"`)) {
      throw new Error(`Release marker ${marker} was not emitted in the production HTML.`)
    }
    releaseDirectories.set(marker, outputDir)
    return outputDir
  }

  async function serveRelease(marker) {
    if (!releaseDirectories.has(marker)) await buildRelease(marker)
    activeRelease = marker
    return releaseDirectories.get(marker)
  }

  async function startServer() {
    if (server?.listening) return
    const nextServer = createServer((request, response) => {
      let requestUrl
      try {
        requestUrl = new URL(request.url ?? '/', 'http://fixture.invalid')
      } catch {
        response.writeHead(400).end()
        return
      }

      if (requestUrl.pathname === '/__touchline-fixture/release') {
        const marker = requestUrl.searchParams.get('marker')
        void (async () => {
          try {
            await serveRelease(marker)
            response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' })
            response.end(JSON.stringify({ currentRelease: activeRelease }))
          } catch (error) {
            response.writeHead(400, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' })
            response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
          }
        })()
        return
      }

      if (requestUrl.pathname === '/__touchline-fixture/withhold'
        || requestUrl.pathname === '/__touchline-fixture/restore') {
        const resource = requestUrl.searchParams.get('resource')?.replace(/^\/+/, '')
        if (!resource) {
          response.writeHead(400, { 'Cache-Control': 'no-store' }).end()
          return
        }
        if (requestUrl.pathname.endsWith('/withhold')) withheldResources.add(resource)
        else withheldResources.delete(resource)
        response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ resource, withheld: withheldResources.has(resource) }))
        return
      }

      const outputDir = releaseDirectories.get(activeRelease)
      if (!outputDir) {
        response.writeHead(503, { 'Cache-Control': 'no-store' }).end()
        return
      }
      void sendFile(request, response, outputDir, withheldResources)
    })
    server = nextServer
    await new Promise((resolveServer, rejectServer) => {
      nextServer.once('error', rejectServer)
      nextServer.listen(port ?? 0, '127.0.0.1', () => {
        nextServer.off('error', rejectServer)
        const address = nextServer.address()
        if (!address || typeof address === 'string') {
          rejectServer(new Error('Production fixture server has no TCP address.'))
          return
        }
        port = address.port
        resolveServer()
      })
    })
  }

  async function stopServer() {
    if (!server?.listening) return
    const currentServer = server
    await new Promise((resolveClose, rejectClose) => {
      currentServer.close((error) => error ? rejectClose(error) : resolveClose())
    })
    server = null
  }

  try {
    await buildRelease('A')

    await startServer()

    let closed = false
    return {
      get origin() {
        return `http://127.0.0.1:${port}`
      },
      get currentRelease() {
        return activeRelease
      },
      temporaryRoot,
      get isListening() {
        return Boolean(server?.listening)
      },
      stopServer,
      startServer,
      buildRelease,
      serveRelease,
      withholdResource(path) {
        withheldResources.add(path.replace(/^\/+/, ''))
      },
      restoreResource(path) {
        withheldResources.delete(path.replace(/^\/+/, ''))
      },
      async close() {
        if (closed) return { serverStopped: true, sourcesUnchanged: true, fixtureRemoved: true }
        closed = true
        await stopServer()
        const sourcesUnchanged = await sourceFingerprint() === initialFingerprint
        await rm(temporaryRoot, { recursive: true, force: true })
        let fixtureRemoved = false
        try {
          await stat(temporaryRoot)
        } catch {
          fixtureRemoved = true
        }
        return { serverStopped: !server?.listening, sourcesUnchanged, fixtureRemoved }
      },
    }
  } catch (error) {
    if (server?.listening) {
      await new Promise((resolveClose) => server.close(() => resolveClose()))
    }
    await rm(temporaryRoot, { recursive: true, force: true })
    throw error
  }
}

export function availableFirefoxBinary() {
  if (process.env.FIREFOX_BINARY) return process.env.FIREFOX_BINARY
  return [
    '/snap/firefox/current/usr/lib/firefox/firefox',
    '/usr/lib/firefox-esr/firefox-esr',
    '/usr/lib/firefox/firefox',
  ].find((path) => {
    return existsSync(path)
  })
}
