import { flushPromises, mount } from '@vue/test-utils'
import { IDBObjectStore } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readonly, ref } from 'vue'
import * as jerseySetEntities from '../../entities/jersey-set'
import type { JerseySet, JerseySetRepository } from '../../entities/jersey-set'
import { createMatch, type GoalEvent, type Match, type MatchRepository } from '../../entities/match'
import * as matchEntities from '../../entities/match'
import { createPlayer } from '../../entities/player'
import type { Player, PlayerRepository } from '../../entities/player'
import * as playerEntities from '../../entities/player'
import * as pwaModule from '../model/usePwa'
import App from './App.vue'
import {
  createAppDatabaseFixture,
  listLiteralMatchRecords,
  readLiteralMatchRecord,
  writeLiteralMatchRecord,
} from './appTestFixtures'

const legacyStorageKey = 'touchline.match-store'
const playerStorageKey = 'touchline.player-store'
const jerseySetStorageKey = 'touchline.jersey-set-store'
let fixture: ReturnType<typeof createAppDatabaseFixture>
let previousLegacyValue: string | null
let previousPlayerStoreValue: string | null
let previousJerseySetStoreValue: string | null
const mountedApps: Array<{ unmount: () => void }> = []

function mountApp(attachToDocument = false) {
  const wrapper = mount(App, attachToDocument ? { attachTo: document.body } : undefined)
  mountedApps.push(wrapper)
  return wrapper
}

async function waitForReady(wrapper: ReturnType<typeof mount>) {
  await vi.waitFor(() => expect(wrapper.find('.storage-state').exists()).toBe(false))
}

async function waitForSaved(wrapper: ReturnType<typeof mount>) {
  await vi.waitFor(() => expect(wrapper.find('.save-feedback').text()).toBe('All changes saved.'))
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function capturePwaReloadGate(initialState: Partial<pwaModule.PwaLifecycleState> = {}) {
  let canReload = () => false
  const reload = vi.fn()
  const baseLifecycle = pwaModule.createPwaLifecycle({
    enabled: false,
    secureContext: false,
    container: null,
    register: async () => { throw new Error('Service workers are disabled in this test.') },
    verifyCache: async () => ({ ready: false, reason: 'worker-inactive', missingResources: [] }),
    isOnline: () => true,
    canReload: () => canReload(),
    reload,
  })
  const lifecycle = {
    ...baseLifecycle,
    state: readonly(ref({ ...baseLifecycle.state.value, ...initialState })),
  } satisfies pwaModule.PwaLifecycle
  vi.spyOn(pwaModule, 'usePwa').mockImplementation((eligibility) => {
    canReload = eligibility ?? (() => false)
    return lifecycle
  })
  return { eligible: () => canReload(), lifecycle, reload }
}

function mockAppRepositories(repositories: {
  match: MatchRepository
  player: PlayerRepository
  jerseySet: JerseySetRepository
}): void {
  const provideMatchStore = matchEntities.provideMatchStore
  const providePlayerStore = playerEntities.providePlayerStore
  const provideJerseySetStore = jerseySetEntities.provideJerseySetStore
  vi.spyOn(matchEntities, 'provideMatchStore').mockImplementation(() => provideMatchStore(repositories.match))
  vi.spyOn(playerEntities, 'providePlayerStore').mockImplementation(() => providePlayerStore(repositories.player))
  vi.spyOn(jerseySetEntities, 'provideJerseySetStore').mockImplementation(() => provideJerseySetStore(repositories.jerseySet))
}

async function createMatchToPreparation(
  wrapper: ReturnType<typeof mount>,
  homeTeam = 'North City',
  awayTeam = 'South Town',
): Promise<void> {
  await wrapper.get('#home-team').setValue(homeTeam)
  await wrapper.get('#away-team').setValue(awayTeam)
  await wrapper.get('form').trigger('submit')
  await vi.waitFor(() => expect(wrapper.find('#preparation-heading').exists()).toBe(true))
}

async function createAndSkipOptionalPreparation(
  wrapper: ReturnType<typeof mount>,
  homeTeam = 'North City',
  awayTeam = 'South Town',
): Promise<void> {
  await createMatchToPreparation(wrapper, homeTeam, awayTeam)
  const skipButton = wrapper.findAll('button').find((button) => button.text().trim() === 'Skip player tracking')
  if (!skipButton) throw new Error('The optional squad skip action was not available.')
  await skipButton.trigger('click')
  await vi.waitFor(() => expect(wrapper.find('#match-heading').exists()).toBe(true))
  await waitForSaved(wrapper)
}

async function setEditorField(name: string, value: string): Promise<void> {
  const playerSelect = name === 'scorer' || name === 'assist'
    ? document.querySelector<HTMLSelectElement>(`#goal-${name}-player`)
    : null
  if (playerSelect) {
    playerSelect.value = '__manual_name__'
    playerSelect.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
  }
  const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#goal-${name}-name`)
    ?? document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#goal-edit-form [name="${name}"]`)
  if (!field) throw new Error(`Goal editor field ${name} was not found.`)
  field.value = value
  field.dispatchEvent(new Event('input', { bubbles: true }))
}

function setEditorSelect(name: string, value: string): void {
  const field = document.querySelector<HTMLSelectElement>(`#goal-edit-form [name="${name}"]`)
  if (!field) throw new Error(`Goal editor field ${name} was not found.`)
  field.value = value
  field.dispatchEvent(new Event('change', { bubbles: true }))
}

function setGoalPlayerSelection(role: 'scorer' | 'assist', playerId: string): void {
  const field = document.querySelector<HTMLSelectElement>(`#goal-${role}-player`)
  if (!field) throw new Error(`Goal editor ${role} selector was not found.`)
  field.value = playerId
  field.dispatchEvent(new Event('change', { bubbles: true }))
}

function submitGoalEditor(): void {
  document.querySelector<HTMLFormElement>('#goal-edit-form')?.dispatchEvent(new Event('submit', {
    bubbles: true,
    cancelable: true,
  }))
}

async function readSavedMatch(id: string): Promise<Match | undefined> {
  const database = await fixture.open()
  try {
    return await readLiteralMatchRecord(database, id)
  } finally {
    database.close()
  }
}

beforeEach(() => {
  fixture = createAppDatabaseFixture('touchline')
  vi.stubGlobal('indexedDB', fixture.factory)
  previousLegacyValue = localStorage.getItem(legacyStorageKey)
  previousPlayerStoreValue = localStorage.getItem(playerStorageKey)
  previousJerseySetStoreValue = localStorage.getItem(jerseySetStorageKey)
  localStorage.removeItem(legacyStorageKey)
  localStorage.removeItem(playerStorageKey)
  localStorage.removeItem(jerseySetStorageKey)
})

afterEach(async () => {
  for (const wrapper of mountedApps.splice(0)) wrapper.unmount()
  vi.useRealTimers()
  vi.restoreAllMocks()
  if (previousLegacyValue === null) localStorage.removeItem(legacyStorageKey)
  else localStorage.setItem(legacyStorageKey, previousLegacyValue)
  if (previousPlayerStoreValue === null) localStorage.removeItem(playerStorageKey)
  else localStorage.setItem(playerStorageKey, previousPlayerStoreValue)
  if (previousJerseySetStoreValue === null) localStorage.removeItem(jerseySetStorageKey)
  else localStorage.setItem(jerseySetStorageKey, previousJerseySetStoreValue)
  vi.unstubAllGlobals()
  await fixture.cleanup()
})

describe('App', () => {
  it('creates, saves, and reopens a match from the IndexedDB archive', async () => {
    const wrapper = mountApp()
    await waitForReady(wrapper)

    await wrapper.get('#home-team').setValue('North City')
    await wrapper.get('#away-team').setValue('South Town')
    await wrapper.get('form').trigger('submit')

    await vi.waitFor(() => expect(wrapper.get('#preparation-heading').text()).toBe('Match squad'))
    expect(wrapper.text()).toContain('North City')
    expect(wrapper.text()).toContain('South Town')
    expect(wrapper.find('#match-heading').exists()).toBe(false)
    expect(wrapper.find('.match-sticky-header').exists()).toBe(false)
    const database = await fixture.open()
    const savedMatches = await listLiteralMatchRecords(database)
    database.close()
    const savedMatch = savedMatches[0]
    expect(savedMatch).toBeDefined()
    expect(savedMatches).toHaveLength(1)
    expect(savedMatch?.clock.status).toBe('not-started')
    expect(savedMatch?.firstKickoffAt).toBeNull()

    await wrapper.get('.squad-setup > .quiet-button').trigger('click')
    await vi.waitFor(() => expect(wrapper.get('#match-heading').text()).toBe('North City'))
    await waitForSaved(wrapper)

    await wrapper.get('.back-button').trigger('click')
    expect(wrapper.get('#archive-heading').text()).toBe('Match archive')
    expect(wrapper.find('.match-list-item').exists()).toBe(true)

    const reloaded = mountApp()
    await waitForReady(reloaded)
    await reloaded.get(`[aria-label="Open North City versus South Town"]`).trigger('click')
    expect(reloaded.get('#match-heading').text()).toBe('North City')
    expect(reloaded.text()).toContain('South Town')
    expect(reloaded.find('#preparation-heading').exists()).toBe(false)
  })

  it('keeps ordinary local workflows available when PWA registration fails', async () => {
    const pwa = pwaModule.createPwaLifecycle({
      enabled: true,
      secureContext: true,
      container: new EventTarget(),
      register: async () => { throw new Error('Service worker registration failed.') },
      verifyCache: async () => ({ ready: false, reason: 'no-app-cache', missingResources: [] }),
      isOnline: () => true,
      canReload: () => false,
      reload: () => undefined,
    })
    await pwa.mount()
    expect(pwa.state.value.error).toBe('Service worker registration failed.')
    vi.spyOn(pwaModule, 'usePwa').mockReturnValue(pwa)

    const wrapper = mountApp()
    await waitForReady(wrapper)
    expect(wrapper.find('.storage-error').exists()).toBe(false)
    expect(wrapper.find('.new-match-card').exists()).toBe(true)

    await createMatchToPreparation(wrapper)
    expect(wrapper.get('#preparation-heading').text()).toBe('Match squad')
    expect(wrapper.text()).not.toContain('Service worker registration failed.')
    expect(pwa.state.value.error).toBe('Service worker registration failed.')
    pwa.dispose()
  })

  it('allows a PWA reload only from a clean archive and never queues an ineligible request', async () => {
    const alex = createPlayer('Alex Morgan', 100, 'pwa-gate-alex')
    localStorage.setItem(playerStorageKey, JSON.stringify({ version: 3, players: [alex] }))
    const pwa = capturePwaReloadGate()
    const wrapper = mountApp()

    try {
      await waitForReady(wrapper)
      await vi.waitFor(() => expect(pwa.eligible()).toBe(true))

      await wrapper.get('#home-team').setValue(' ')
      expect(pwa.eligible()).toBe(false)
      expect(pwa.lifecycle.tryReload()).toBe(false)
      await wrapper.get('#away-team').setValue('Away Town')
      await wrapper.get('#home-team').setValue('')
      expect(pwa.eligible()).toBe(false)
      await wrapper.get('#away-team').setValue('')
      await flushPromises()
      expect(pwa.eligible()).toBe(true)
      expect(pwa.reload).not.toHaveBeenCalled()

      await wrapper.get('[data-nav="players"]').trigger('click')
      await vi.waitFor(() => expect(wrapper.find('[aria-label="View statistics for Alex Morgan"]').exists()).toBe(true))
      expect(pwa.eligible()).toBe(false)
      expect(pwa.lifecycle.tryReload()).toBe(false)
      await wrapper.get('[aria-label="View statistics for Alex Morgan"]').trigger('click')
      await vi.waitFor(() => expect(wrapper.find('#player-statistics-heading').exists()).toBe(true))
      expect(pwa.eligible()).toBe(false)
      await wrapper.get('.back-link').trigger('click')
      await wrapper.get('[data-nav="jersey-sets"]').trigger('click')
      expect(wrapper.find('#jersey-management-heading').exists()).toBe(true)
      expect(pwa.eligible()).toBe(false)
      await wrapper.get('[data-nav="matches"]').trigger('click')
      await vi.waitFor(() => expect(wrapper.find('#archive-heading').exists()).toBe(true))
      expect(pwa.eligible()).toBe(true)

      await createMatchToPreparation(wrapper, 'Gate Home', 'Gate Away')
      expect(pwa.eligible()).toBe(false)
      await wrapper.get('.squad-setup .quiet-button').trigger('click')
      await vi.waitFor(() => expect(wrapper.find('#match-heading').exists()).toBe(true))
      expect(pwa.eligible()).toBe(false)
      await wrapper.get('.back-button').trigger('click')
      await vi.waitFor(() => expect(wrapper.find('.new-match-card').exists()).toBe(true))
      expect(pwa.eligible()).toBe(true)

      await wrapper.get('#home-team').setValue('Unmounted archive draft')
      expect(pwa.eligible()).toBe(false)
      await wrapper.get('[data-nav="players"]').trigger('click')
      await vi.waitFor(() => expect(wrapper.find('#create-player-name').exists()).toBe(true))
      await wrapper.get('[data-nav="matches"]').trigger('click')
      await vi.waitFor(() => expect(wrapper.find('#archive-heading').exists()).toBe(true))
      expect(pwa.eligible()).toBe(true)
      expect(pwa.reload).not.toHaveBeenCalled()
    } finally {
      wrapper.unmount()
      pwa.lifecycle.dispose()
    }
  })

  it('waits for each local store load and save before enabling a PWA reload', async () => {
    const matchesLoad = deferred<Match[]>()
    const playersLoad = deferred<Player[]>()
    const jerseySetsLoad = deferred<JerseySet[]>()
    const playerSave = deferred<void>()
    const jerseySetSave = deferred<void>()
    const matchSave = deferred<void>()
    const savedMatch = createMatch('Saved Home', 'Saved Away', 100, 'pwa-pending-match')
    const matchRepository: MatchRepository = {
      listMatches: () => matchesLoad.promise,
      getMatch: async () => savedMatch,
      saveMatch: vi.fn(() => matchSave.promise),
      close: () => undefined,
    }
    const playerRepository: PlayerRepository = {
      listPlayers: () => playersLoad.promise,
      savePlayers: vi.fn(() => playerSave.promise),
      close: () => undefined,
    }
    const jerseySetRepository: JerseySetRepository = {
      listJerseySets: () => jerseySetsLoad.promise,
      saveJerseySets: vi.fn(() => jerseySetSave.promise),
      close: () => undefined,
    }
    mockAppRepositories({ match: matchRepository, player: playerRepository, jerseySet: jerseySetRepository })
    const pwa = capturePwaReloadGate()
    const wrapper = mountApp()

    try {
      expect(pwa.eligible()).toBe(false)
      matchesLoad.resolve([savedMatch])
      await flushPromises()
      expect(wrapper.find('.new-match-card').exists()).toBe(true)
      expect(pwa.eligible()).toBe(false)
      playersLoad.resolve([])
      await flushPromises()
      expect(pwa.eligible()).toBe(false)
      jerseySetsLoad.resolve([])
      await waitForReady(wrapper)
      await vi.waitFor(() => expect(pwa.eligible()).toBe(true))

      await wrapper.get('[data-nav="players"]').trigger('click')
      await wrapper.get('#create-player-name').setValue('Pending Player')
      await wrapper.get('.player-profile-form').trigger('submit')
      await vi.waitFor(() => expect(playerRepository.savePlayers).toHaveBeenCalledOnce())
      await wrapper.get('[data-nav="matches"]').trigger('click')
      await vi.waitFor(() => expect(wrapper.find('.new-match-card').exists()).toBe(true))
      expect(pwa.eligible()).toBe(false)
      expect(pwa.lifecycle.tryReload()).toBe(false)
      playerSave.resolve()
      await vi.waitFor(() => expect(pwa.eligible()).toBe(true))
      expect(pwa.reload).not.toHaveBeenCalled()

      await wrapper.get('[data-nav="jersey-sets"]').trigger('click')
      await wrapper.get('#create-jersey-set-button').trigger('click')
      await wrapper.get('#create-jersey-set-name').setValue('Pending Set')
      await wrapper.get('.jersey-set-form').trigger('submit')
      await vi.waitFor(() => expect(jerseySetRepository.saveJerseySets).toHaveBeenCalledOnce())
      await wrapper.get('[data-nav="matches"]').trigger('click')
      await vi.waitFor(() => expect(wrapper.find('.new-match-card').exists()).toBe(true))
      expect(pwa.eligible()).toBe(false)
      expect(pwa.lifecycle.tryReload()).toBe(false)
      jerseySetSave.resolve()
      await vi.waitFor(() => expect(pwa.eligible()).toBe(true))
      expect(pwa.reload).not.toHaveBeenCalled()

      await wrapper.get('[aria-label="Open Saved Home versus Saved Away"]').trigger('click')
      await wrapper.get('.clock-primary').trigger('click')
      await vi.waitFor(() => expect(matchRepository.saveMatch).toHaveBeenCalledOnce())
      await wrapper.get('[data-nav="matches"]').trigger('click')
      await vi.waitFor(() => expect(wrapper.find('.new-match-card').exists()).toBe(true))
      expect(pwa.eligible()).toBe(false)
      expect(pwa.lifecycle.tryReload()).toBe(false)
      matchSave.resolve()
      await vi.waitFor(() => expect(pwa.eligible()).toBe(true))
      expect(pwa.reload).not.toHaveBeenCalled()
    } finally {
      matchesLoad.resolve([savedMatch])
      playersLoad.resolve([])
      jerseySetsLoad.resolve([])
      playerSave.resolve()
      jerseySetSave.resolve()
      matchSave.resolve()
      wrapper.unmount()
      pwa.lifecycle.dispose()
    }
  })

  it('keeps actionable PWA update controls on the archive, away from live screens and editors', async () => {
    const match = {
      ...createMatch('Update Home', 'Update Away', 100, 'pwa-status-match'),
      goals: [{
        id: 'pwa-status-goal',
        side: 'home' as const,
        period: 1 as const,
        elapsedMs: 1_000,
        scorerPlayerId: null,
        scorer: '',
        assistPlayerId: null,
        assist: '',
        description: '',
        createdAt: 200,
      }],
    }
    const database = await fixture.open()
    await writeLiteralMatchRecord(database, { ...match, recordVersion: 4 } as Match)
    database.close()

    const pwa = capturePwaReloadGate({
      phase: 'ready',
      registered: true,
      ready: true,
      updateAvailable: true,
    })
    const wrapper = mountApp()

    try {
      await waitForReady(wrapper)
      await vi.waitFor(() => expect(pwa.eligible()).toBe(true))
      expect(wrapper.find('.pwa-status').exists()).toBe(true)
      expect(wrapper.find('button.pwa-status-primary').text()).toBe('Update app')

      await wrapper.get('[data-nav="players"]').trigger('click')
      await vi.waitFor(() => expect(wrapper.find('#create-player-name').exists()).toBe(true))
      expect(wrapper.find('.pwa-status').exists()).toBe(false)

      await wrapper.get('[data-nav="matches"]').trigger('click')
      await wrapper.get('[aria-label="Open Update Home versus Update Away"]').trigger('click')
      await vi.waitFor(() => expect(wrapper.find('#match-heading').exists()).toBe(true))
      expect(wrapper.find('.pwa-status').exists()).toBe(false)
      await wrapper.get('[aria-label^="Add details for Update Home goal"]').trigger('click')
      await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull())
      expect(wrapper.find('.pwa-status').exists()).toBe(false)
      expect(pwa.reload).not.toHaveBeenCalled()
    } finally {
      wrapper.unmount()
      pwa.lifecycle.dispose()
    }
  })

  it('navigates to My players and uses the app-scoped persistent player store', async () => {
    const wrapper = mountApp()
    await waitForReady(wrapper)
    await wrapper.get('[data-nav="players"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('#create-player-name').exists()).toBe(true))

    await wrapper.get('#create-player-name').setValue('Alex Morgan')
    await wrapper.get('.player-profile-form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="player-card"]').exists()).toBe(true))
    expect(JSON.parse(localStorage.getItem(playerStorageKey)!)).toMatchObject({
      version: 3,
      players: [expect.objectContaining({ name: 'Alex Morgan', archived: false })],
    })

    await wrapper.get('[data-nav="matches"]').trigger('click')
    expect(wrapper.get('#archive-heading').text()).toBe('Match archive')
    await wrapper.get('[data-nav="players"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.get('[data-testid="player-card"]').text()).toContain('Alex Morgan'))
  })

  it('navigates to Jersey sets and saves the inventory independently in the same session', async () => {
    const wrapper = mountApp()
    await waitForReady(wrapper)
    await wrapper.get('[data-nav="jersey-sets"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.get('#jersey-management-heading').text()).toBe('Jersey sets'))

    await wrapper.get('#create-jersey-set-button').trigger('click')
    await wrapper.get('#create-jersey-set-name').setValue('Home')
    await wrapper.get('.jersey-set-form').trigger('submit')
    await vi.waitFor(() => expect(JSON.parse(localStorage.getItem(jerseySetStorageKey) ?? '{"sets":[]}').sets).toHaveLength(1))
    const savedSetId = JSON.parse(localStorage.getItem(jerseySetStorageKey)!).sets[0].id as string

    await wrapper.get(`#add-jersey-${savedSetId}`).trigger('click')
    await wrapper.get(`#create-jersey-${savedSetId}-number`).setValue('7')
    await wrapper.get(`#create-jersey-${savedSetId}-size`).setValue('M')
    await wrapper.get('.jersey-form').trigger('submit')
    await vi.waitFor(() => expect(JSON.parse(localStorage.getItem(jerseySetStorageKey)!).sets[0].jerseys).toHaveLength(1))
    expect(JSON.parse(localStorage.getItem(jerseySetStorageKey)!)).toMatchObject({
      version: 1,
      sets: [{ id: savedSetId, name: 'Home', jerseys: [{ number: 7, size: 'M', ownerPlayerId: null }] }],
    })
    expect(localStorage.getItem(playerStorageKey)).toBeNull()
    expect(localStorage.getItem(legacyStorageKey)).toBeNull()
    const database = await fixture.open()
    expect(await listLiteralMatchRecords(database)).toEqual([])
    database.close()

    await wrapper.get('[data-nav="matches"]').trigger('click')
    await wrapper.get('[data-nav="jersey-sets"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.get('.jersey-row-copy strong').text()).toBe('Number 7, size M'))
  })

  it('keeps match and player pages available when jersey inventory storage fails', async () => {
    localStorage.setItem(jerseySetStorageKey, '{invalid-json')
    const wrapper = mountApp()
    await waitForReady(wrapper)
    expect(wrapper.find('.empty-archive').exists()).toBe(true)

    await wrapper.get('[data-nav="jersey-sets"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.get('.inventory-load-error').text()).toContain('could not be loaded'))
    expect(wrapper.find('.empty-set-list').exists()).toBe(false)

    await wrapper.get('[data-nav="players"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('#create-player-name').exists()).toBe(true))
    await wrapper.get('[data-nav="matches"]').trigger('click')
    expect(wrapper.get('#archive-heading').text()).toBe('Match archive')
    expect(wrapper.find('.new-match-card').exists()).toBe(true)
  })

  it('preserves same-name player preferences, ownership, sizes, and match data through jersey lifecycles', async () => {
    const alex = createPlayer({ name: 'Alex', positions: ['DM'], jerseySize: 'M' }, 100, 'lifecycle-alex')
    const otherAlex = createPlayer({ name: 'Alex', positions: ['ST'], jerseySize: 'L' }, 200, 'lifecycle-other-alex')
    localStorage.setItem(playerStorageKey, JSON.stringify({ version: 3, players: [alex, otherAlex] }))
    localStorage.setItem(jerseySetStorageKey, JSON.stringify({
      version: 1,
      sets: [
        {
          id: 'blue-set',
          name: 'Blue',
          jerseys: [{ id: 'blue-seven', number: 7, size: 'M', ownerPlayerId: alex.id }],
          preferredNumbers: [
            { playerId: alex.id, number: 20 },
            { playerId: otherAlex.id, number: 20 },
          ],
          createdAt: 100,
          updatedAt: 100,
        },
        {
          id: 'white-set',
          name: 'White',
          jerseys: [],
          preferredNumbers: [{ playerId: alex.id, number: 12 }],
          createdAt: 200,
          updatedAt: 200,
        },
      ],
    }))
    const match: Match = {
      ...createMatch('North City', 'South Town', 300, 'jersey-lifecycle-match'),
      clock: { period: 1, elapsedMs: 10_000, status: 'full-time', startedAt: null },
      completedPeriodElapsedMs: { 1: 10_000, 2: null },
      participation: {
        ownSide: 'home',
        squad: [{ playerId: alex.id, nameSnapshot: 'Alex Match Snapshot' }],
        starterIds: [alex.id],
        substitutions: [],
      },
    }
    const database = await fixture.open()
    await writeLiteralMatchRecord(database, { ...match, recordVersion: 2 } as Match)
    database.close()

    const wrapper = mountApp()
    await waitForReady(wrapper)
    await wrapper.get('[data-nav="players"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.findAll('.player-card')).toHaveLength(2))
    const alexCard = `[data-player-id="${alex.id}"]`
    const otherAlexCard = `[data-player-id="${otherAlex.id}"]`
    expect(wrapper.get(alexCard).get('.player-card-name').text()).toMatch(/^Alex ·/)
    expect(wrapper.get(otherAlexCard).get('.player-card-name').text()).toMatch(/^Alex ·/)
    expect(wrapper.get(alexCard).findAll('.preferred-number-list li').map((item) => item.text()))
      .toEqual(['Blue 20', 'White 12'])
    expect(wrapper.get(otherAlexCard).get('.preferred-number-list').text()).toBe('Blue 20')

    await wrapper.get(`${alexCard} button[aria-label^="Edit profile"]`).trigger('click')
    await wrapper.get(`#edit-player-${alex.id}-name`).setValue('Alex Renamed')
    await wrapper.get(`#edit-player-${alex.id}-jersey-size`).setValue('L')
    await wrapper.get(`${alexCard} .player-profile-form`).trigger('submit')
    await vi.waitFor(() => expect(wrapper.get(alexCard).get('.player-card-name').text()).toContain('Alex Renamed'))
    expect(wrapper.get(alexCard).get('.player-size-summary').text()).toContain('L')
    expect(wrapper.get(alexCard).get('.preferred-number-list').text()).toContain('Blue 20')
    expect(wrapper.get(otherAlexCard).get('.preferred-number-list').text()).toBe('Blue 20')

    await wrapper.get(`${alexCard} button[aria-label^="Archive"]`).trigger('click')
    await vi.waitFor(() => expect(wrapper.find(alexCard).exists()).toBe(false))
    await wrapper.get('.player-filter button:nth-child(2)').trigger('click')
    expect(wrapper.get(alexCard).text()).toContain('Archived')
    expect(wrapper.get(alexCard).get('.preferred-number-list').text()).toContain('White 12')
    await wrapper.get(`${alexCard} button[aria-label^="Restore"]`).trigger('click')
    await vi.waitFor(() => expect(wrapper.find(alexCard).exists()).toBe(false))
    await wrapper.get('.player-filter button:nth-child(1)').trigger('click')

    await wrapper.get('[data-nav="jersey-sets"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('#jersey-management-heading').exists()).toBe(true))
    expect(wrapper.get('[data-jersey-id="blue-seven"] .jersey-row-copy span').text()).toBe('Owned by Alex Renamed')
    expect(wrapper.get('[data-jersey-id="blue-seven"] .jersey-row-copy strong').text()).toBe('Number 7, size M')
    await wrapper.get('[data-jersey-id="blue-seven"] button[aria-label^="Remove Number 7, size M"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-jersey-id="blue-seven"]').exists()).toBe(false))

    await wrapper.get('[data-nav="players"]').trigger('click')
    expect(wrapper.get(alexCard).get('.preferred-number-list').text()).toContain('Blue 20')
    await wrapper.get('[data-nav="jersey-sets"]').trigger('click')
    await wrapper.get('#remove-jersey-set-blue-set').trigger('click')
    expect(wrapper.get('[role="alertdialog"]').text()).toContain('2 player preferences')
    await wrapper.get('[role="alertdialog"] .danger-button').trigger('click')
    await vi.waitFor(() => expect(JSON.parse(localStorage.getItem(jerseySetStorageKey)!).sets).toHaveLength(1))

    await wrapper.get('[data-nav="players"]').trigger('click')
    expect(wrapper.get(alexCard).get('.preferred-number-list').text()).toBe('White 12')
    expect(wrapper.get(otherAlexCard).get('.player-preference-summary').text()).toContain('None saved')
    await wrapper.get(`${alexCard} button[aria-label^="View statistics"]`).trigger('click')
    await vi.waitFor(() => expect(wrapper.get('#player-statistics-heading').text()).toBe('Alex Renamed'))
    expect(wrapper.get('[data-testid="total-playing-time"]').text()).toBe('00:10')
    expect(await readSavedMatch(match.id)).toMatchObject({
      id: match.id,
      participation: match.participation,
      clock: match.clock,
      goals: match.goals,
    })
  })

  it('navigates from a directory identity to its statistics and from a breakdown to the match', async () => {
    const alex = createPlayer('Alex Morgan', 100, 'alex-statistics-id')
    localStorage.setItem(playerStorageKey, JSON.stringify({ version: 1, players: [alex] }))
    const match: Match = {
      ...createMatch('North City', 'South Town', 200, 'statistics-navigation-match'),
      clock: { period: 1, elapsedMs: 10_000, status: 'full-time', startedAt: null },
      completedPeriodElapsedMs: { 1: 10_000, 2: null },
      participation: {
        ownSide: 'home',
        squad: [{ playerId: alex.id, nameSnapshot: 'Alex Match Snapshot' }],
        starterIds: [alex.id],
        substitutions: [],
      },
    }
    const database = await fixture.open()
    await writeLiteralMatchRecord(database, { ...match, recordVersion: 2 } as Match)
    database.close()

    const wrapper = mountApp()
    await waitForReady(wrapper)
    await wrapper.get('[data-nav="players"]').trigger('click')
    await wrapper.get(`[aria-label="View statistics for Alex Morgan"]`).trigger('click')
    await vi.waitFor(() => expect(wrapper.get('#player-statistics-heading').text()).toBe('Alex Morgan'))
    expect(wrapper.get('[data-testid="total-playing-time"]').text()).toBe('00:10')
    expect(wrapper.get('[data-match-id="statistics-navigation-match"]').text()).toContain('vs South Town')

    await wrapper.get('[data-match-id="statistics-navigation-match"] .breakdown-match-link').trigger('click')
    expect(wrapper.get('#match-heading').text()).toBe('North City')
    expect((wrapper.get('#events-tab').element as HTMLButtonElement).getAttribute('aria-selected')).toBe('true')
    await wrapper.get('#player-times-tab').trigger('click')
    expect(wrapper.get('#player-times-panel').text()).toContain('Alex Match Snapshot')
  })

  it('shows format-4 scorer and assist totals in App and updates them after a goal correction', async () => {
    const alex = createPlayer('Alex Morgan', 100, 'goal-statistics-alex')
    const sam = createPlayer('Sam Kerr', 200, 'goal-statistics-sam')
    localStorage.setItem(playerStorageKey, JSON.stringify({ version: 3, players: [alex, sam] }))
    const linkedGoal: GoalEvent = {
      id: 'goal-statistics-event',
      side: 'home',
      period: 1,
      elapsedMs: 20 * 60_000,
      scorerPlayerId: alex.id,
      scorer: 'Alex Match Snapshot',
      assistPlayerId: sam.id,
      assist: 'Sam Match Snapshot',
      description: '',
      createdAt: 500,
    }
    const match: Match = {
      ...createMatch('North City', 'South Town', 200, 'goal-statistics-match'),
      clock: { period: 1, elapsedMs: 20 * 60_000, status: 'full-time', startedAt: null },
      firstKickoffAt: 400,
      completedPeriodElapsedMs: { 1: 20 * 60_000, 2: null },
      participation: {
        ownSide: 'home',
        squad: [
          { playerId: alex.id, nameSnapshot: 'Alex Match Snapshot' },
          { playerId: sam.id, nameSnapshot: 'Sam Match Snapshot' },
        ],
        starterIds: [alex.id],
        substitutions: [],
      },
      goals: [linkedGoal],
    }
    const database = await fixture.open()
    await writeLiteralMatchRecord(database, { ...match, recordVersion: 4 } as Match)
    database.close()

    const wrapper = mountApp()
    await waitForReady(wrapper)
    await wrapper.get('[data-nav="players"]').trigger('click')
    await wrapper.get(`[aria-label="View statistics for ${alex.name}"]`).trigger('click')
    await vi.waitFor(() => expect(wrapper.get('[data-testid="goal-count"]').text()).toBe('1'))
    expect(wrapper.get('[data-testid="assist-count"]').text()).toBe('0')
    expect(wrapper.get('[data-testid="total-playing-time"]').text()).toBe('20:00')
    expect(wrapper.get('[data-testid="appearance-count"]').text()).toBe('1')

    await wrapper.get('.back-link').trigger('click')
    await wrapper.get(`[aria-label="View statistics for ${sam.name}"]`).trigger('click')
    await vi.waitFor(() => expect(wrapper.get('[data-testid="assist-count"]').text()).toBe('1'))
    expect(wrapper.get('[data-testid="goal-count"]').text()).toBe('0')
    expect(wrapper.get('[data-testid="total-playing-time"]').text()).toBe('00:00')
    expect(wrapper.get('[data-testid="appearance-count"]').text()).toBe('0')

    await wrapper.get('[data-nav="matches"]').trigger('click')
    await wrapper.get('[aria-label="Open North City versus South Town"]').trigger('click')
    await wrapper.get('[aria-label^="Edit details for North City goal"]').trigger('click')
    setGoalPlayerSelection('scorer', sam.id)
    setGoalPlayerSelection('assist', '')
    submitGoalEditor()
    await vi.waitFor(() => expect(wrapper.find('[role="dialog"]').exists()).toBe(false))
    await waitForSaved(wrapper)

    const saved = await readSavedMatch(match.id)
    expect(saved).toMatchObject({ recordVersion: 4 })
    expect(saved?.goals).toHaveLength(1)
    expect(saved?.goals[0]).toMatchObject({
      id: linkedGoal.id,
      scorerPlayerId: sam.id,
      scorer: 'Sam Match Snapshot',
      assistPlayerId: null,
      assist: '',
    })

    await wrapper.get('[data-nav="players"]').trigger('click')
    await wrapper.get(`[aria-label="View statistics for ${alex.name}"]`).trigger('click')
    await vi.waitFor(() => expect(wrapper.get('[data-testid="goal-count"]').text()).toBe('0'))
    await wrapper.get('.back-link').trigger('click')
    await wrapper.get(`[aria-label="View statistics for ${sam.name}"]`).trigger('click')
    await vi.waitFor(() => expect(wrapper.get('[data-testid="goal-count"]').text()).toBe('1'))
    expect(wrapper.get('[data-testid="assist-count"]').text()).toBe('0')
  })

  it('keeps match snapshots when renamed and updates match and player totals after a valid correction', async () => {
    const alex = createPlayer('Alex Morgan', 100, 'alex-correction-id')
    const sam = createPlayer('Sam Kerr', 200, 'sam-correction-id')
    localStorage.setItem(playerStorageKey, JSON.stringify({ version: 1, players: [alex, sam] }))
    const match: Match = {
      ...createMatch('North City', 'South Town', 200, 'statistics-correction-match'),
      clock: { period: 1, elapsedMs: 60 * 60_000, status: 'full-time', startedAt: null },
      completedPeriodElapsedMs: { 1: 60 * 60_000, 2: null },
      participation: {
        ownSide: 'home',
        squad: [
          { playerId: alex.id, nameSnapshot: 'Alex Snapshot' },
          { playerId: sam.id, nameSnapshot: 'Sam Snapshot' },
        ],
        starterIds: [alex.id],
        substitutions: [{
          id: 'alex-off', outgoingPlayerId: alex.id, incomingPlayerId: sam.id,
          period: 1, elapsedMs: 10 * 60_000, sequence: 0, createdAt: 300,
        }],
      },
    }
    const database = await fixture.open()
    await writeLiteralMatchRecord(database, { ...match, recordVersion: 2 } as Match)
    database.close()

    const wrapper = mountApp()
    await waitForReady(wrapper)
    await wrapper.get('[data-nav="players"]').trigger('click')
    await wrapper.get(`[aria-label="View statistics for Alex Morgan"]`).trigger('click')
    await vi.waitFor(() => expect(wrapper.get('[data-testid="total-playing-time"]').text()).toBe('10:00'))

    await wrapper.get('.back-link').trigger('click')
    const alexCard = wrapper.get(`[data-player-id="${alex.id}"]`)
    await alexCard.get(`[aria-label="Edit profile for Alex Morgan"]`).trigger('click')
    await alexCard.get('input').setValue('Alex Renamed')
    await alexCard.get('.player-profile-form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.get(`[data-player-id="${alex.id}"]`).text()).toContain('Alex Renamed'))
    await wrapper.get(`[aria-label="View statistics for Alex Renamed"]`).trigger('click')
    await vi.waitFor(() => expect(wrapper.get('#player-statistics-heading').text()).toBe('Alex Renamed'))
    expect(wrapper.get('[data-testid="total-playing-time"]').text()).toBe('10:00')

    await wrapper.get('[data-match-id="statistics-correction-match"] .breakdown-match-link').trigger('click')
    await wrapper.get('#player-times-tab').trigger('click')
    expect(wrapper.get('#player-times-panel').text()).toContain('Alex Snapshot')
    await wrapper.get('#events-tab').trigger('click')
    await wrapper.get('[aria-label="Correct substitution Alex Snapshot off for Sam Snapshot"]').trigger('click')
    const correctionTime = document.querySelector<HTMLInputElement>('[name="correction-time"]')!
    correctionTime.value = '20:00'
    correctionTime.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector<HTMLFormElement>('.correction-form')!.dispatchEvent(new Event('submit', {
      bubbles: true,
      cancelable: true,
    }))
    await vi.waitFor(() => expect(wrapper.get('[data-player-id="alex-correction-id"] .player-time').text()).toBe('20:00'))
    await waitForSaved(wrapper)
    expect(wrapper.get('[data-player-id="sam-correction-id"] .player-time').text()).toBe('40:00')

    await wrapper.get('[data-nav="players"]').trigger('click')
    await wrapper.get(`[aria-label="View statistics for Alex Renamed"]`).trigger('click')
    await vi.waitFor(() => expect(wrapper.get('[data-testid="total-playing-time"]').text()).toBe('20:00'))
    expect(wrapper.get('[data-testid="appearance-count"]').text()).toBe('1')

    const saved = await readSavedMatch('statistics-correction-match')
    expect(saved?.participation?.squad).toEqual([
      { playerId: alex.id, nameSnapshot: 'Alex Snapshot' },
      { playerId: sam.id, nameSnapshot: 'Sam Snapshot' },
    ])
    expect(saved?.participation?.substitutions[0].elapsedMs).toBe(20 * 60_000)
  })

  it('tears down match and player-statistics live timers when navigating away', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(1_000)
    const alex = createPlayer('Alex Morgan', 100, 'alex-timer-id')
    localStorage.setItem(playerStorageKey, JSON.stringify({ version: 1, players: [alex] }))
    const match: Match = {
      ...createMatch('North City', 'South Town', 200, 'statistics-timer-match'),
      clock: { period: 1, elapsedMs: 0, status: 'running', startedAt: 1_000 },
      participation: {
        ownSide: 'home',
        squad: [{ playerId: alex.id, nameSnapshot: alex.name }],
        starterIds: [alex.id],
        substitutions: [],
      },
    }
    const database = await fixture.open()
    await writeLiteralMatchRecord(database, { ...match, recordVersion: 2 } as Match)
    database.close()

    const wrapper = mountApp()
    await waitForReady(wrapper)
    await wrapper.get('[aria-label="Open North City versus South Town"]').trigger('click')
    expect(vi.getTimerCount()).toBe(2)
    await vi.advanceTimersByTimeAsync(2_000)
    await vi.waitFor(() => expect(wrapper.get('[data-player-id="alex-timer-id"] .player-time').text()).toBe('00:02'))

    await wrapper.get('[data-nav="players"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('#create-player-name').exists()).toBe(true))
    expect(vi.getTimerCount()).toBe(0)

    await wrapper.get('[aria-label="View statistics for Alex Morgan"]').trigger('click')
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(3_000)
    await flushPromises()
    expect(wrapper.get('[data-testid="total-playing-time"]').text()).toBe('00:05')

    await wrapper.get('.back-link').trigger('click')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('restores a running clock after reload and keeps it stopped while paused', async () => {
    const kickoff = 1_790_323_200_000
    const now = vi.spyOn(Date, 'now').mockReturnValue(kickoff)
    const wrapper = mountApp()
    await waitForReady(wrapper)

    await createAndSkipOptionalPreparation(wrapper)

    await wrapper.get('.clock-primary').trigger('click')
    await vi.waitFor(() => expect(wrapper.get('.clock-status').text()).toBe('CLOCK RUNNING'))
    await waitForSaved(wrapper)
    const database = await fixture.open()
    const [runningMatch] = await listLiteralMatchRecords(database)
    database.close()
    expect(runningMatch?.clock).toMatchObject({ status: 'running', startedAt: kickoff })
    wrapper.unmount()

    now.mockReturnValue(kickoff + 60_000)
    const reloaded = mountApp()
    await waitForReady(reloaded)
    await reloaded.get('[aria-label="Open North City versus South Town"]').trigger('click')
    await vi.waitFor(() => expect(reloaded.get('[data-testid="match-minute"]').text().trim()).toBe('2′'))

    await reloaded.get('.clock-primary').trigger('click')
    await vi.waitFor(() => expect(reloaded.find('.clock-status').text()).toBe('CLOCK PAUSED'))
    await waitForSaved(reloaded)
    now.mockReturnValue(kickoff + 5 * 60_000)
    await new Promise((resolve) => setTimeout(resolve, 1_100))
    expect(reloaded.get('[data-testid="match-minute"]').text().trim()).toBe('2′')
  })

  it('supports half-time, second-half, and full-time controls after each save commits', async () => {
    const wrapper = mountApp()
    await waitForReady(wrapper)
    await createAndSkipOptionalPreparation(wrapper)
    expect(wrapper.find('.preparation-entry').exists()).toBe(true)
    expect(wrapper.find('.prepare-match-button').exists()).toBe(true)
    expect(wrapper.findAll('.match-action-area .goal-button')).toHaveLength(2)

    await wrapper.get('.clock-primary').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('.clock-status').text()).toBe('CLOCK RUNNING'))
    await waitForSaved(wrapper)
    expect(wrapper.find('.preparation-entry').exists()).toBe(false)
    expect(wrapper.find('.prepare-match-button').exists()).toBe(false)
    await wrapper.get('button.secondary-button').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('.clock-status').text()).toBe('HALF TIME'))
    await waitForSaved(wrapper)
    expect(wrapper.get('.clock-primary').text()).toContain('Start second half')
    await wrapper.get('.clock-primary').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('.clock-period').text()).toBe('SECOND HALF'))
    await waitForSaved(wrapper)
    await wrapper.get('button.secondary-button').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('.clock-status').text()).toBe('FULL TIME'))
    await waitForSaved(wrapper)
    expect(wrapper.find('.clock-actions button').exists()).toBe(false)
    expect(wrapper.find('[data-action="start-substitution"]').exists()).toBe(false)
    expect(wrapper.findAll('.match-action-area .goal-button')).toHaveLength(2)
  })

  it('records goals for both teams and persists the committed scores', async () => {
    const wrapper = mountApp()
    await waitForReady(wrapper)
    await createAndSkipOptionalPreparation(wrapper)

    await wrapper.get('[aria-label="Record goal for North City"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.get('[data-testid="home-score"]').text()).toBe('1'))
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Add goal details'))
    expect(wrapper.find('.match-save-feedback').exists()).toBe(false)
    expect(wrapper.find('.match-save-feedback').exists()).toBe(false)
    expect(wrapper.find('.app-save-feedback').exists()).toBe(false)
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    document.querySelector<HTMLButtonElement>('.focused-editor__close')?.click()
    await flushPromises()
    expect(wrapper.get('.match-save-feedback button').text()).toBe('Add details')
    await wrapper.get('[aria-label="Record goal for South Town"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.get('[data-testid="away-score"]').text()).toBe('1'))
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Add goal details'))
    expect(document.querySelector('[name="scorer"]')).toBeTruthy()
    expect((document.querySelector('[name="side"]') as HTMLSelectElement).value).toBe('away')

    const database = await fixture.open()
    const [saved] = await listLiteralMatchRecords(database)
    database.close()
    expect(saved?.goals).toHaveLength(2)
    expect(saved?.goals.map((goal) => goal.side)).toEqual(['home', 'away'])
  })

  it('keeps goal-only matches clock- and goal-usable after kickoff', async () => {
    const wrapper = mountApp()
    await waitForReady(wrapper)
    await createAndSkipOptionalPreparation(wrapper)

    await wrapper.get('.clock-primary').trigger('click')
    await vi.waitFor(() => expect(wrapper.get('.clock-status').text()).toBe('CLOCK RUNNING'))
    await waitForSaved(wrapper)
    expect(wrapper.get('.untracked-player-times').text().toLowerCase()).toContain('player tracking was not enabled')
    expect(wrapper.find('.squad-setup').exists()).toBe(false)
    await wrapper.get('#player-times-tab').trigger('click')
    expect(wrapper.get('#player-times-panel').text()).toContain('Player tracking was not enabled')
    await wrapper.get('#events-tab').trigger('click')

    const goalButton = wrapper.get('[aria-label="Record goal for North City"]')
    expect((goalButton.element as HTMLButtonElement).disabled).toBe(false)
    await goalButton.trigger('click')
    await vi.waitFor(() => expect(wrapper.get('[data-testid="home-score"]').text()).toBe('1'))
    expect(wrapper.find('.match-save-feedback').exists()).toBe(false)
    expect(wrapper.find('.app-save-feedback').exists()).toBe(false)
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()

    const database = await fixture.open()
    const [saved] = await listLiteralMatchRecords(database)
    database.close()
    expect(saved?.participation).toBeNull()
    expect(saved?.clock.status).toBe('running')
    expect(saved?.goals).toHaveLength(1)
  })

  it('opens details after each committed goal and retains explicit edits and corrections', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(2_000_000)
    const wrapper = mountApp(true)
    await waitForReady(wrapper)
    await createAndSkipOptionalPreparation(wrapper)

    await wrapper.get('[aria-label="Record goal for North City"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.findAll('.goal-editor-launcher')).toHaveLength(1))
    expect(wrapper.get('#timeline-heading').text()).toBe('Match timeline')
    expect(wrapper.findAll('[data-event-type="goal"]')).toHaveLength(1)
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(wrapper.find('.match-save-feedback').exists()).toBe(false)
    document.querySelector<HTMLButtonElement>('.focused-editor__close')?.click()
    await flushPromises()
    expect(wrapper.get('.match-save-feedback button').text()).toBe('Add details')
    now.mockReturnValue(2_001_000)
    await wrapper.get('[aria-label="Record goal for South Town"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.findAll('.goal-editor-launcher')).toHaveLength(2))
    expect(wrapper.findAll('[data-event-type="goal"]')).toHaveLength(2)
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    document.querySelector<HTMLButtonElement>('.focused-editor__close')?.click()
    await flushPromises()

    await wrapper.get('[aria-label^="Add details for South Town goal"]').trigger('click')
    await setEditorField('scorer', 'Unrelated Draft')
    document.querySelector<HTMLButtonElement>('.focused-editor__close')?.click()
    await flushPromises()
    expect(document.querySelector('[role="dialog"]')).toBeNull()

    const homeLauncher = wrapper.get('[aria-label^="Add details for North City goal"]')
    const homeLauncherElement = homeLauncher.element as HTMLElement
    const homeGoalId = homeLauncherElement.closest('.timeline-event')?.getAttribute('data-event-id')
    homeLauncherElement.focus()
    homeLauncherElement.click()
    await flushPromises()
    await setEditorField('scorer', 'A. Player')
    await setEditorField('time', '45+2')
    setEditorSelect('side', 'away')
    await setEditorField('description', 'A finish from the edge of the box')
    submitGoalEditor()
    await vi.waitFor(() => expect(wrapper.findAll('.goal-event-time').map((time) => time.text())).toContain('45+2′'))
    await waitForSaved(wrapper)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(wrapper.findAll('.timeline-event')[0].attributes('data-event-id')).toBe(homeGoalId)
    expect(document.activeElement).toBe(homeLauncherElement)

    await wrapper.get('[aria-label^="Add details for South Town goal"]').trigger('click')
    expect((document.querySelector('[name="scorer"]') as HTMLInputElement).value).toBe('Unrelated Draft')
    expect(wrapper.get('[data-testid="home-score"]').text()).toBe('0')
    expect(wrapper.get('[data-testid="away-score"]').text()).toBe('2')
    document.querySelector<HTMLButtonElement>('.focused-editor__close')?.click()

    const database = await fixture.open()
    const [saved] = await listLiteralMatchRecords(database)
    database.close()
    expect(saved?.goals[0]).toMatchObject({
      side: 'away',
      period: 1,
      elapsedMs: 47 * 60_000,
      scorer: 'A. Player',
      description: 'A finish from the edge of the box',
    })
    wrapper.unmount()

    const reloaded = mountApp()
    await waitForReady(reloaded)
    await reloaded.get('[aria-label="Open North City versus South Town"]').trigger('click')
    await reloaded.get('[aria-label^="Edit details for South Town goal"]').trigger('click')
    await flushPromises()
    expect((document.querySelector('[name="scorer"]') as HTMLInputElement).value).toBe('A. Player')
    expect((document.querySelector('[name="time"]') as HTMLInputElement).value).toBe('45+2')
    expect((document.querySelector('[name="description"]') as HTMLTextAreaElement).value)
      .toBe('A finish from the edge of the box')
  })

  it('opens a literal IndexedDB record and writes edits back with its match fields intact', async () => {
    const literalMatch: Match = {
      id: 'literal-indexeddb-match',
      homeTeam: 'Harbor FC',
      awayTeam: 'Valley United',
      createdAt: 1_699_999_000_000,
      updatedAt: 1_699_999_500_000,
      clock: { period: 2, elapsedMs: 75_000, status: 'paused', startedAt: null },
      participation: null,
      firstKickoffAt: null,
      jerseyAssignment: null,
      completedPeriodElapsedMs: { 1: null, 2: null },
      goals: [{
        id: 'literal-indexeddb-goal',
        side: 'home',
        period: 1,
        elapsedMs: 600_000,
        scorerPlayerId: null,
        scorer: 'M. Striker',
        assistPlayerId: null,
        assist: '',
        description: 'A close-range finish',
        createdAt: 1_699_999_100_000,
      }],
    }
    const database = await fixture.open()
    await writeLiteralMatchRecord(database, literalMatch)
    database.close()

    const wrapper = mountApp()
    await waitForReady(wrapper)
    await wrapper.get('[aria-label="Open Harbor FC versus Valley United"]').trigger('click')
    expect(wrapper.get('#match-heading').text()).toBe('Harbor FC')
    expect(wrapper.get('[data-testid="home-score"]').text()).toBe('1')
    expect(wrapper.get('[data-testid="match-minute"]').text().trim()).toBe('47′')
    expect(document.querySelector('[role="dialog"]')).toBeNull()

    await wrapper.get('[aria-label^="Edit details for Harbor FC goal"]').trigger('click')
    await flushPromises()
    expect((document.querySelector('[name="scorer"]') as HTMLInputElement).value).toBe('M. Striker')
    await setEditorField('assist', 'J. Midfielder')
    await setEditorField('description', 'A first-touch finish')
    submitGoalEditor()
    await waitForSaved(wrapper)

    const saved = await readSavedMatch(literalMatch.id)
    expect(saved).toMatchObject({
      id: literalMatch.id,
      homeTeam: literalMatch.homeTeam,
      awayTeam: literalMatch.awayTeam,
      createdAt: literalMatch.createdAt,
      clock: literalMatch.clock,
      goals: [{ ...literalMatch.goals[0], assist: 'J. Midfielder', description: 'A first-touch finish' }],
    })
    expect(saved?.updatedAt).toBeGreaterThan(literalMatch.updatedAt)
  })

  it('leaves valid legacy localStorage data untouched and does not show it in the IndexedDB archive', async () => {
    const legacyPayload = JSON.stringify({
      version: 1,
      matches: [{ id: 'legacy-match', homeTeam: 'Old Harbor', awayTeam: 'Old Valley' }],
    })
    localStorage.setItem(legacyStorageKey, legacyPayload)

    const wrapper = mountApp()
    await waitForReady(wrapper)
    expect(wrapper.find('.empty-archive').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Old Harbor')

    await createAndSkipOptionalPreparation(wrapper)
    expect(localStorage.getItem(legacyStorageKey)).toBe(legacyPayload)
    const database = await fixture.open()
    const saved = await listLiteralMatchRecords(database)
    expect(saved.map((match) => match.homeTeam)).toEqual(['North City'])
    database.close()
  })

  it('shows a failed creation without clearing the draft and succeeds on retry', async () => {
    const originalPut = IDBObjectStore.prototype.put
    let failNextWrite = true
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      const request = originalPut.call(this, value, key)
      if (failNextWrite) {
        failNextWrite = false
        request.addEventListener('success', () => this.transaction.abort(), { once: true })
      }
      return request
    })

    const wrapper = mountApp()
    await waitForReady(wrapper)
    await wrapper.get('#home-team').setValue('North City')
    await wrapper.get('#away-team').setValue('South Town')
    await wrapper.get('form').trigger('submit')

    await vi.waitFor(() => expect(wrapper.find('.save-feedback[role="alert"]').text()).toContain('Could not save changes'))
    expect(wrapper.find('#match-heading').exists()).toBe(false)
    expect(wrapper.find('#preparation-heading').exists()).toBe(false)
    expect((wrapper.get('#home-team').element as HTMLInputElement).value).toBe('North City')
    expect((wrapper.get('#away-team').element as HTMLInputElement).value).toBe('South Town')
    expect(wrapper.find('.empty-archive').exists()).toBe(true)

    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('#preparation-heading').exists()).toBe(true))
    expect(wrapper.find('#preparation-heading').text()).toBe('Match squad')
    expect(wrapper.text()).toContain('North City')
    const database = await fixture.open()
    const created = await listLiteralMatchRecords(database)
    database.close()
    expect(created).toHaveLength(1)
    expect(created[0]?.homeTeam).toBe('North City')
    expect(created[0]?.firstKickoffAt).toBeNull()
  })

  it('guards global navigation from dirty preparation and preserves committed data when confirmed', async () => {
    const alex = createPlayer('Alex Morgan', 100, 'preparation-nav-alex')
    localStorage.setItem(playerStorageKey, JSON.stringify({ version: 1, players: [alex] }))
    const wrapper = mountApp(true)
    await waitForReady(wrapper)
    await createMatchToPreparation(wrapper)
    expect(wrapper.find('.app-save-feedback').exists()).toBe(false)

    await wrapper.get('[name="own-side"][value="home"]').setValue()
    const playersNavigation = wrapper.get('[data-nav="players"]')
    ;(playersNavigation.element as HTMLButtonElement).focus()
    await playersNavigation.trigger('click')
    await flushPromises()
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(wrapper.find('#preparation-heading').exists()).toBe(true)

    document.querySelector<HTMLButtonElement>('.keep-editing')?.click()
    await flushPromises()
    expect(document.activeElement).toBe(playersNavigation.element)
    expect((wrapper.get('[name="own-side"][value="home"]').element as HTMLInputElement).checked).toBe(true)

    await playersNavigation.trigger('click')
    await flushPromises()
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    document.querySelector<HTMLButtonElement>('.discard-changes')?.click()
    await vi.waitFor(() => expect(wrapper.find('#create-player-name').exists()).toBe(true))
    expect(wrapper.find('#preparation-heading').exists()).toBe(false)

    const database = await fixture.open()
    const saved = await listLiteralMatchRecords(database)
    database.close()
    expect(saved).toHaveLength(1)
    expect(saved[0]?.participation).toBeNull()
  })

  it('allows optional completion when jersey inventory cannot load', async () => {
    const alex = createPlayer('Alex Morgan', 100, 'source-failure-alex')
    localStorage.setItem(playerStorageKey, JSON.stringify({ version: 1, players: [alex] }))
    localStorage.setItem(jerseySetStorageKey, '{invalid-json')
    const wrapper = mountApp()
    await waitForReady(wrapper)
    await createMatchToPreparation(wrapper)

    await wrapper.get('[name="own-side"][value="home"]').setValue()
    await wrapper.get('[aria-label="Include Alex Morgan in match squad"]').setValue(true)
    await wrapper.get('[aria-label="Select Alex Morgan as a starter"]').setValue(true)
    await wrapper.get('.squad-form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.get('#preparation-heading').text()).toBe('Jersey assignments'))
    expect(wrapper.text()).toContain('Player or jersey data is unavailable')
    expect((wrapper.get('.cancel-button').element as HTMLButtonElement).disabled).toBe(false)
    expect(wrapper.get('.cancel-button').text()).toBe('Skip jerseys')
    await wrapper.get('.cancel-button').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('#match-heading').exists()).toBe(true))

    const database = await fixture.open()
    const [saved] = await listLiteralMatchRecords(database)
    database.close()
    expect(saved?.participation?.squad.map(({ playerId }) => playerId)).toEqual([alex.id])
    expect(saved?.jerseyAssignment).toBeNull()
    expect(saved?.clock.status).toBe('not-started')
  })

  it('retains failed squad inputs for retry and advances only after the match write commits', async () => {
    const alex = createPlayer('Alex Morgan', 100, 'retry-preparation-alex')
    localStorage.setItem(playerStorageKey, JSON.stringify({ version: 1, players: [alex] }))
    const originalPut = IDBObjectStore.prototype.put
    let failNextWrite = false
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      const request = originalPut.call(this, value, key)
      if (failNextWrite) {
        failNextWrite = false
        request.addEventListener('success', () => this.transaction.abort(), { once: true })
      }
      return request
    })

    const wrapper = mountApp()
    await waitForReady(wrapper)
    await createMatchToPreparation(wrapper)
    await wrapper.get('[name="own-side"][value="home"]').setValue()
    await wrapper.get('[aria-label="Include Alex Morgan in match squad"]').setValue(true)
    await wrapper.get('[aria-label="Select Alex Morgan as a starter"]').setValue(true)
    failNextWrite = true
    await wrapper.get('.squad-form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('.squad-form [role="alert"]').exists()).toBe(true))
    expect(wrapper.find('.squad-form [role="alert"]').text().trim()).not.toBe('')
    expect(wrapper.get('#preparation-heading').text()).toBe('Match squad')
    expect((wrapper.get('[aria-label="Select Alex Morgan as a starter"]').element as HTMLInputElement).checked).toBe(true)

    const databaseBeforeRetry = await fixture.open()
    const beforeRetry = await listLiteralMatchRecords(databaseBeforeRetry)
    databaseBeforeRetry.close()
    expect(beforeRetry).toHaveLength(1)
    expect(beforeRetry[0]?.participation).toBeNull()

    await wrapper.get('.squad-form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.get('#preparation-heading').text()).toBe('Jersey assignments'))
    const databaseAfterRetry = await fixture.open()
    const afterRetry = await listLiteralMatchRecords(databaseAfterRetry)
    databaseAfterRetry.close()
    expect(afterRetry).toHaveLength(1)
    expect(afterRetry[0]?.participation?.starterIds).toEqual([alex.id])
  })

  it('reopens saved preparation after reload and starts the clock only after returning to Match', async () => {
    const alex = createPlayer('Alex Morgan', 100, 'reload-preparation-alex')
    localStorage.setItem(playerStorageKey, JSON.stringify({ version: 1, players: [alex] }))
    const wrapper = mountApp()
    await waitForReady(wrapper)
    await createMatchToPreparation(wrapper)
    await wrapper.get('[name="own-side"][value="home"]').setValue()
    await wrapper.get('[aria-label="Include Alex Morgan in match squad"]').setValue(true)
    await wrapper.get('[aria-label="Select Alex Morgan as a starter"]').setValue(true)
    await wrapper.get('.squad-form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.get('#preparation-heading').text()).toBe('Jersey assignments'))
    await wrapper.get('.cancel-button').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('#match-heading').exists()).toBe(true))
    expect(wrapper.get('.clock-status').text()).toBe('READY FOR KICKOFF')
    expect(wrapper.find('.prepare-match-button').exists()).toBe(true)

    await wrapper.get('.prepare-match-button').trigger('click')
    await vi.waitFor(() => expect(wrapper.get('#preparation-heading').text()).toBe('Match squad'))
    expect((wrapper.get('[name="own-side"][value="home"]').element as HTMLInputElement).checked).toBe(true)
    expect((wrapper.get('[aria-label="Select Alex Morgan as a starter"]').element as HTMLInputElement).checked).toBe(true)
    await wrapper.get('.squad-form .quiet-button').trigger('click')
    await vi.waitFor(() => expect(wrapper.get('#preparation-heading').text()).toBe('Jersey assignments'))
    await wrapper.get('.cancel-button').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('#match-heading').exists()).toBe(true))
    expect(wrapper.get('.clock-status').text()).toBe('READY FOR KICKOFF')

    const database = await fixture.open()
    const beforeKickoff = await listLiteralMatchRecords(database)
    database.close()
    expect(beforeKickoff).toHaveLength(1)
    expect(beforeKickoff[0]?.firstKickoffAt).toBeNull()

    await wrapper.get('.clock-primary').trigger('click')
    await vi.waitFor(() => expect(wrapper.get('.clock-status').text()).toBe('CLOCK RUNNING'))
    expect(wrapper.find('.prepare-match-button').exists()).toBe(false)
    wrapper.unmount()

    const reloaded = mountApp()
    await waitForReady(reloaded)
    await reloaded.get('[aria-label="Open North City versus South Town"]').trigger('click')
    expect(reloaded.get('#match-heading').text()).toBe('North City')
    expect(reloaded.find('#preparation-heading').exists()).toBe(false)
    expect(reloaded.find('.prepare-match-button').exists()).toBe(false)
    expect(reloaded.get('.clock-status').text()).toBe('CLOCK RUNNING')
  })

  it('keeps a failed goal edit draft and committed match unchanged, then saves on retry', async () => {
    const original: Match = {
      id: 'goal-edit-retry',
      homeTeam: 'North City',
      awayTeam: 'South Town',
      createdAt: 1_000,
      updatedAt: 2_000,
      clock: { period: 2, elapsedMs: 90_000, status: 'paused', startedAt: null },
      participation: null,
      firstKickoffAt: null,
      jerseyAssignment: null,
      completedPeriodElapsedMs: { 1: null, 2: null },
      goals: [{
        id: 'goal-edit-retry-event',
        side: 'home',
        period: 1,
        elapsedMs: 60_000,
        scorerPlayerId: null,
        scorer: 'Original Scorer',
        assistPlayerId: null,
        assist: '',
        description: 'Original details',
        createdAt: 1_500,
      }],
    }
    const database = await fixture.open()
    await writeLiteralMatchRecord(database, original)
    database.close()

    const originalPut = IDBObjectStore.prototype.put
    let holdFirstWrite = true
    let releaseFirstWrite = false
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      const request = originalPut.call(this, value, key)
      if (holdFirstWrite) {
        holdFirstWrite = false
        const keepTransactionActive = () => {
          if (releaseFirstWrite) {
            this.transaction.abort()
            return
          }
          const keepAliveRequest = this.get('__keep-transaction-active__')
          keepAliveRequest.onsuccess = keepTransactionActive
        }
        keepTransactionActive()
      }
      return request
    })

    const wrapper = mountApp()
    await waitForReady(wrapper)
    await wrapper.get('[aria-label="Open North City versus South Town"]').trigger('click')
    await wrapper.get('[aria-label^="Edit details for North City goal"]').trigger('click')
    await flushPromises()
    await setEditorField('scorer', 'Edited Scorer')
    await setEditorField('description', 'Edited details')
    submitGoalEditor()

    await vi.waitFor(() => expect(document.querySelector('.goal-editor .editor-saving[role="status"]')?.textContent).toContain('Saving goal details'))
    expect(wrapper.find('.match-save-feedback').exists()).toBe(false)
    expect(wrapper.find('.app-save-feedback').exists()).toBe(false)
    expect((document.querySelector('.save-goal-button') as HTMLButtonElement).disabled).toBe(true)
    releaseFirstWrite = true
    await vi.waitFor(() => expect(document.querySelector('.goal-editor .editor-error[role="alert"]')).not.toBeNull())
    expect(wrapper.find('.match-save-feedback').exists()).toBe(false)
    expect(wrapper.find('.app-save-feedback').exists()).toBe(false)
    expect((document.querySelector('[name="scorer"]') as HTMLInputElement).value)
      .toBe('Edited Scorer')
    expect((document.querySelector('[name="description"]') as HTMLTextAreaElement).value)
      .toBe('Edited details')
    expect(wrapper.get('[data-testid="home-score"]').text()).toBe('1')
    expect(wrapper.get('.clock-status').text()).toBe('CLOCK PAUSED')
    expect(await readSavedMatch(original.id)).toEqual(original)

    submitGoalEditor()
    await waitForSaved(wrapper)
    expect(await readSavedMatch(original.id)).toMatchObject({
      id: original.id,
      homeTeam: original.homeTeam,
      awayTeam: original.awayTeam,
      createdAt: original.createdAt,
      clock: original.clock,
      goals: [{ ...original.goals[0], scorer: 'Edited Scorer', description: 'Edited details' }],
    })
  })

  it('announces pending saves and blocks other match actions until the IndexedDB commit', async () => {
    const match: Match = {
      ...createMatch('North City', 'South Town', 1_000, 'pending-write-match'),
      clock: { period: 1, elapsedMs: 500, status: 'running', startedAt: 2_000 },
    }
    const database = await fixture.open()
    await writeLiteralMatchRecord(database, match)
    database.close()

    const originalPut = IDBObjectStore.prototype.put
    let holdNextWrite = true
    let releaseWrite = false
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      const request = originalPut.call(this, value, key)
      if (holdNextWrite) {
        holdNextWrite = false
        const keepTransactionActive = () => {
          if (releaseWrite) return
          const keepAliveRequest = this.get('__keep-transaction-active__')
          keepAliveRequest.onsuccess = keepTransactionActive
        }
        keepTransactionActive()
      }
      return request
    })

    const wrapper = mountApp()
    await waitForReady(wrapper)
    await wrapper.get('[aria-label="Open North City versus South Town"]').trigger('click')

    try {
      await wrapper.get('[aria-label="Record goal for North City"]').trigger('click')
      await vi.waitFor(() => expect(wrapper.get('.match-save-feedback').text()).toBe('Saving changes…'))
      expect(wrapper.find('.app-save-feedback').exists()).toBe(false)
      expect(wrapper.findAll('.match-save-feedback[role="status"]')).toHaveLength(1)
      expect(wrapper.get('[data-testid="home-score"]').text()).toBe('0')
      expect((wrapper.get('[aria-label="Record goal for South Town"]').element as HTMLButtonElement).disabled).toBe(true)
      expect((wrapper.get('.clock-primary').element as HTMLButtonElement).disabled).toBe(true)
      expect(document.querySelector('[role="dialog"]')).toBeNull()

      await wrapper.get('.clock-primary').trigger('click')
      await vi.waitFor(() => expect(put).toHaveBeenCalledOnce())

      releaseWrite = true
      await vi.waitFor(() => expect(wrapper.get('[data-testid="home-score"]').text()).toBe('1'))
      await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Add goal details'))
      expect(wrapper.find('.match-save-feedback').exists()).toBe(false)
      expect(wrapper.get('.clock-status').text()).toBe('CLOCK RUNNING')
    } finally {
      releaseWrite = true
    }
  })
})
