import { flushPromises, mount } from '@vue/test-utils'
import { IDBObjectStore } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMatch, type Match } from '../../entities/match'
import { createPlayer } from '../../entities/player'
import App from './App.vue'
import {
  createAppDatabaseFixture,
  listLiteralMatchRecords,
  readLiteralMatchRecord,
  writeLiteralMatchRecord,
} from './appTestFixtures'

const legacyStorageKey = 'touchline.match-store'
const playerStorageKey = 'touchline.player-store'
let fixture: ReturnType<typeof createAppDatabaseFixture>
let previousLegacyValue: string | null
let previousPlayerStoreValue: string | null
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

function setEditorField(name: string, value: string): void {
  const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#goal-edit-form [name="${name}"]`)
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
  localStorage.removeItem(legacyStorageKey)
  localStorage.removeItem(playerStorageKey)
})

afterEach(async () => {
  for (const wrapper of mountedApps.splice(0)) wrapper.unmount()
  vi.useRealTimers()
  vi.restoreAllMocks()
  if (previousLegacyValue === null) localStorage.removeItem(legacyStorageKey)
  else localStorage.setItem(legacyStorageKey, previousLegacyValue)
  if (previousPlayerStoreValue === null) localStorage.removeItem(playerStorageKey)
  else localStorage.setItem(playerStorageKey, previousPlayerStoreValue)
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

    await vi.waitFor(() => expect(wrapper.get('#match-heading').text()).toBe('North City'))
    expect(wrapper.text()).toContain('South Town')
    await waitForSaved(wrapper)
    const database = await fixture.open()
    const savedMatches = await listLiteralMatchRecords(database)
    database.close()
    const savedMatch = savedMatches[0]
    expect(savedMatch).toBeDefined()

    await wrapper.get('.back-button').trigger('click')
    expect(wrapper.get('#archive-heading').text()).toBe('Match archive')
    expect(wrapper.find('.match-list-item').exists()).toBe(true)

    const reloaded = mountApp()
    await waitForReady(reloaded)
    await reloaded.get(`[aria-label="Open North City versus South Town"]`).trigger('click')
    expect(reloaded.get('#match-heading').text()).toBe('North City')
    expect(reloaded.text()).toContain('South Town')
  })

  it('navigates to My players and uses the app-scoped persistent player store', async () => {
    const wrapper = mountApp()
    await waitForReady(wrapper)
    await wrapper.get('[data-nav="players"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('#new-player-name').exists()).toBe(true))

    await wrapper.get('#new-player-name').setValue('Alex Morgan')
    await wrapper.get('.player-create-form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="player-card"]').exists()).toBe(true))
    expect(JSON.parse(localStorage.getItem(playerStorageKey)!)).toMatchObject({
      version: 1,
      players: [expect.objectContaining({ name: 'Alex Morgan', archived: false })],
    })

    await wrapper.get('[data-nav="matches"]').trigger('click')
    expect(wrapper.get('#archive-heading').text()).toBe('Match archive')
    await wrapper.get('[data-nav="players"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.get('[data-testid="player-card"]').text()).toContain('Alex Morgan'))
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
    await alexCard.get(`[aria-label="Rename Alex Morgan"]`).trigger('click')
    await alexCard.get('input').setValue('Alex Renamed')
    await alexCard.get('button').trigger('click')
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
    await vi.waitFor(() => expect(wrapper.find('#new-player-name').exists()).toBe(true))
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

    await wrapper.get('#home-team').setValue('North City')
    await wrapper.get('#away-team').setValue('South Town')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('#match-heading').exists()).toBe(true))
    await waitForSaved(wrapper)

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
    await wrapper.get('#home-team').setValue('North City')
    await wrapper.get('#away-team').setValue('South Town')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('#match-heading').exists()).toBe(true))
    await waitForSaved(wrapper)
    expect(wrapper.find('.squad-setup').exists()).toBe(true)
    expect(wrapper.findAll('.match-action-area .goal-button')).toHaveLength(2)

    await wrapper.get('.clock-primary').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('.clock-status').text()).toBe('CLOCK RUNNING'))
    await waitForSaved(wrapper)
    expect(wrapper.find('.squad-setup').exists()).toBe(false)
    expect(wrapper.find('.saved-squad-summary').exists()).toBe(false)
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
    await wrapper.get('#home-team').setValue('North City')
    await wrapper.get('#away-team').setValue('South Town')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('#match-heading').exists()).toBe(true))
    await waitForSaved(wrapper)

    await wrapper.get('[aria-label="Record goal for North City"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.get('[data-testid="home-score"]').text()).toBe('1'))
    expect(wrapper.get('.match-save-feedback').text()).toContain('Goal saved.')
    expect(wrapper.get('.match-save-feedback button').text()).toBe('Add details')
    expect(wrapper.find('.app-save-feedback').exists()).toBe(false)
    expect(wrapper.findAll('.match-save-feedback')).toHaveLength(1)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(wrapper.findAll('.match-save-feedback[role="status"]')).toHaveLength(1)
    await wrapper.get('[aria-label="Record goal for South Town"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.get('[data-testid="away-score"]').text()).toBe('1'))
    expect(wrapper.get('.match-save-feedback').text()).toContain('Goal saved.')
    await wrapper.get('.match-save-feedback button').trigger('click')
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
    await wrapper.get('#home-team').setValue('North City')
    await wrapper.get('#away-team').setValue('South Town')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('#match-heading').exists()).toBe(true))
    await waitForSaved(wrapper)

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
    expect(wrapper.get('.match-save-feedback').text()).toContain('Goal saved.')
    expect(wrapper.find('.app-save-feedback').exists()).toBe(false)

    const database = await fixture.open()
    const [saved] = await listLiteralMatchRecords(database)
    database.close()
    expect(saved?.participation).toBeNull()
    expect(saved?.clock.status).toBe('running')
    expect(saved?.goals).toHaveLength(1)
  })

  it('opens goal editors deliberately, retains unrelated drafts, and restores committed details', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(2_000_000)
    const wrapper = mountApp(true)
    await waitForReady(wrapper)
    await wrapper.get('#home-team').setValue('North City')
    await wrapper.get('#away-team').setValue('South Town')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('#match-heading').exists()).toBe(true))
    await waitForSaved(wrapper)

    await wrapper.get('[aria-label="Record goal for North City"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.findAll('.goal-editor-launcher')).toHaveLength(1))
    expect(wrapper.get('#timeline-heading').text()).toBe('Match timeline')
    expect(wrapper.findAll('[data-event-type="goal"]')).toHaveLength(1)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    await vi.waitFor(() => expect(wrapper.get('.match-save-feedback').text()).toContain('Goal saved.'))
    now.mockReturnValue(2_001_000)
    await wrapper.get('[aria-label="Record goal for South Town"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.findAll('.goal-editor-launcher')).toHaveLength(2))
    expect(wrapper.findAll('[data-event-type="goal"]')).toHaveLength(2)
    await vi.waitFor(() => expect(wrapper.get('.match-save-feedback').text()).toContain('Goal saved.'))

    await wrapper.get('[aria-label^="Add details for South Town goal"]').trigger('click')
    setEditorField('scorer', 'Unrelated Draft')
    document.querySelector<HTMLButtonElement>('.focused-editor__close')?.click()
    await flushPromises()
    expect(document.querySelector('[role="dialog"]')).toBeNull()

    const homeLauncher = wrapper.get('[aria-label^="Add details for North City goal"]')
    const homeLauncherElement = homeLauncher.element as HTMLElement
    const homeGoalId = homeLauncherElement.closest('.timeline-event')?.getAttribute('data-event-id')
    homeLauncherElement.focus()
    homeLauncherElement.click()
    await flushPromises()
    setEditorField('scorer', 'A. Player')
    setEditorField('time', '45+2')
    setEditorSelect('side', 'away')
    setEditorField('description', 'A finish from the edge of the box')
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
      completedPeriodElapsedMs: { 1: null, 2: null },
      goals: [{
        id: 'literal-indexeddb-goal',
        side: 'home',
        period: 1,
        elapsedMs: 600_000,
        scorer: 'M. Striker',
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
    setEditorField('assist', 'J. Midfielder')
    setEditorField('description', 'A first-touch finish')
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

    await wrapper.get('#home-team').setValue('North City')
    await wrapper.get('#away-team').setValue('South Town')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('#match-heading').exists()).toBe(true))
    await waitForSaved(wrapper)
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
    expect((wrapper.get('#home-team').element as HTMLInputElement).value).toBe('North City')
    expect((wrapper.get('#away-team').element as HTMLInputElement).value).toBe('South Town')
    expect(wrapper.find('.empty-archive').exists()).toBe(true)

    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('#match-heading').exists()).toBe(true))
    await waitForSaved(wrapper)
    expect(wrapper.text()).toContain('North City')
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
      completedPeriodElapsedMs: { 1: null, 2: null },
      goals: [{
        id: 'goal-edit-retry-event',
        side: 'home',
        period: 1,
        elapsedMs: 60_000,
        scorer: 'Original Scorer',
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
    setEditorField('scorer', 'Edited Scorer')
    setEditorField('description', 'Edited details')
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
      await vi.waitFor(() => expect(wrapper.get('.match-save-feedback').text()).toContain('Goal saved.'))
      expect(wrapper.findAll('.match-save-feedback[role="status"]')).toHaveLength(1)
      expect(wrapper.get('.clock-status').text()).toBe('CLOCK RUNNING')
    } finally {
      releaseWrite = true
    }
  })
})
