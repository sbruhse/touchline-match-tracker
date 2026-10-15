import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createMatch,
  provideMatchStore,
  type GoalEvent,
  type Match,
  type MatchParticipation,
  type MatchRepository,
  type MatchStore,
} from '../../../entities/match'
import {
  createPlayer,
  createPlayerRepository,
  providePlayerStore,
  type Player,
  type PlayerRepository,
  type PlayerStorageLike,
} from '../../../entities/player'
import PlayerStatisticsPage from './PlayerStatisticsPage.vue'

class MemoryStorage implements PlayerStorageLike {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

function trackedMatch(
  id: string,
  createdAt: number,
  participation: MatchParticipation,
  options: {
    clock?: Match['clock']
    completed?: Match['completedPeriodElapsedMs']
    homeTeam?: string
    awayTeam?: string
    goals?: GoalEvent[]
  } = {},
): Match {
  return {
    ...createMatch(options.homeTeam ?? 'North City', options.awayTeam ?? 'South Town', createdAt, id),
    clock: options.clock ?? { period: 1, elapsedMs: 47 * 60_000, status: 'full-time', startedAt: null },
    participation,
    completedPeriodElapsedMs: options.completed ?? { 1: 47 * 60_000, 2: null },
    goals: options.goals ?? [],
  }
}

function goalEvent(
  id: string,
  scorerPlayerId: string | null,
  assistPlayerId: string | null,
  side: 'home' | 'away' = 'home',
  scorer = '',
  assist = '',
): GoalEvent {
  return {
    id,
    side,
    period: 1,
    elapsedMs: 10_000,
    scorerPlayerId,
    scorer,
    assistPlayerId,
    assist,
    description: '',
    createdAt: 1,
  }
}

function participation(
  squad: Array<{ playerId: string; nameSnapshot: string }>,
  starterIds: string[],
  ownSide: 'home' | 'away' = 'home',
): MatchParticipation {
  return { ownSide, squad, starterIds, substitutions: [] }
}

async function mountStatistics(playerId: string, players: Player[], matches: Match[]) {
  const records = structuredClone(matches)
  const savedMatches: Match[] = []
  const matchRepository: MatchRepository = {
    listMatches: async () => structuredClone(records),
    getMatch: async (id) => records.find((match) => match.id === id),
    async saveMatch(match) {
      const snapshot = structuredClone(match)
      savedMatches.push(snapshot)
      const index = records.findIndex((saved) => saved.id === match.id)
      if (index < 0) records.push(snapshot)
      else records[index] = snapshot
    },
    close: () => undefined,
  }
  const playerRepository: PlayerRepository = createPlayerRepository({ storage: new MemoryStorage() })
  await playerRepository.savePlayers(players)

  let matchStore!: MatchStore
  let playerStore!: ReturnType<typeof providePlayerStore>
  let openedMatchId: string | null = null
  let returnedToDirectory = false
  const Host = defineComponent({
    setup() {
      matchStore = provideMatchStore(matchRepository)
      playerStore = providePlayerStore(playerRepository)
      return () => h(PlayerStatisticsPage, {
        playerId,
        onOpenMatch: (id: string) => { openedMatchId = id },
        onBack: () => { returnedToDirectory = true },
      })
    },
  })
  const wrapper = mount(Host)
  await Promise.all([matchStore.load(), playerStore.load()])
  await flushPromises()
  return {
    wrapper,
    matchStore,
    playerStore,
    records,
    savedMatches,
    get openedMatchId() { return openedMatchId },
    get returnedToDirectory() { return returnedToDirectory },
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('PlayerStatisticsPage', () => {
  it('shows a zero summary and clear empty-history state for a player with no matches', async () => {
    const alex = createPlayer('Alex Morgan', 100, 'alex-id')
    const { wrapper } = await mountStatistics(alex.id, [alex], [])
    try {
      expect(wrapper.get('#player-statistics-heading').text()).toBe('Alex Morgan')
      expect(wrapper.get('[data-testid="total-playing-time"]').text()).toBe('00:00')
      expect(wrapper.get('[data-testid="appearance-count"]').text()).toBe('0')
      expect(wrapper.get('[data-testid="goal-count"]').text()).toBe('0')
      expect(wrapper.get('[data-testid="assist-count"]').text()).toBe('0')
      expect(wrapper.get('[data-testid="empty-player-history"]').text()).toContain('No recorded playing time yet.')
      expect(wrapper.get('.statistics-time-note').text()).toContain('excludes manual pauses and the half-time break')
      expect(wrapper.get('.statistics-goal-note').text()).toContain('Name-only goals and unstarted matches are excluded')
      expect(wrapper.find('.breakdown-row').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it('shows an archived unused bench member with a zero-time breakdown and match navigation', async () => {
    const alex = createPlayer('Alex Morgan', 100, 'alex-id')
    const archivedSam: Player = { ...createPlayer('Sam Kerr', 200, 'sam-id'), archived: true }
    const match = trackedMatch(
      'unused-bench-match', Date.UTC(2025, 0, 2),
      participation([
        { playerId: alex.id, nameSnapshot: alex.name },
        { playerId: archivedSam.id, nameSnapshot: archivedSam.name },
      ], [alex.id], 'away'),
      {
        homeTeam: 'Valley United',
        awayTeam: 'North City',
        completed: { 1: 47 * 60_000, 2: null },
        goals: [goalEvent('archived-bench-goal', archivedSam.id, null, 'away', 'Sam match snapshot')],
      },
    )
    const page = await mountStatistics(archivedSam.id, [alex, archivedSam], [match])
    const { wrapper } = page
    try {
      expect(wrapper.get('.archived-label').text()).toContain('ARCHIVED PLAYER')
      expect(wrapper.get('[data-testid="total-playing-time"]').text()).toBe('00:00')
      expect(wrapper.get('[data-testid="appearance-count"]').text()).toBe('0')
      expect(wrapper.get('[data-testid="goal-count"]').text()).toBe('1')
      expect(wrapper.get('[data-testid="assist-count"]').text()).toBe('0')
      const row = wrapper.get('[data-match-id="unused-bench-match"]')
      expect(row.text()).toContain('vs Valley United')
      expect(row.text()).toContain('AWAY')
      expect(row.text()).toContain('Full time')
      expect(row.get('time').text()).not.toBe('')
      expect(row.get('.breakdown-time').text()).toBe('00:00')
      expect(row.text()).toContain('Unused squad member')

      await row.get('.breakdown-match-link').trigger('click')
      expect(page.openedMatchId).toBe('unused-bench-match')
      await wrapper.get('.back-link').trigger('click')
      expect(page.returnedToDirectory).toBe(true)
    } finally {
      wrapper.unmount()
    }
  })

  it('aggregates completed and live contributions by identity and keeps paused time fixed', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(50_000)
    const alex = createPlayer('Alex Morgan', 100, 'alex-id')
    const completed = trackedMatch(
      'completed-match', 100,
      participation([{ playerId: alex.id, nameSnapshot: 'Alex, match snapshot' }], [alex.id]),
      { goals: [goalEvent('completed-goal', alex.id, null, 'home', 'Alex, match snapshot')] },
    )
    const running = trackedMatch(
      'running-match', 200,
      participation([{ playerId: alex.id, nameSnapshot: 'Alex in another squad' }], [alex.id]),
      {
        clock: { period: 1, elapsedMs: 0, status: 'running', startedAt: 50_000 },
        completed: { 1: null, 2: null },
        homeTeam: 'East Town',
        awayTeam: 'West Town',
      },
    )
    const { wrapper, matchStore } = await mountStatistics(alex.id, [alex], [completed, running])
    try {
      expect(wrapper.get('[data-testid="total-playing-time"]').text()).toBe('47:00')
      expect(wrapper.get('[data-testid="goal-count"]').text()).toBe('1')
      expect(wrapper.get('[data-testid="assist-count"]').text()).toBe('0')
      await vi.advanceTimersByTimeAsync(2_000)
      await flushPromises()
      expect(wrapper.get('[data-testid="total-playing-time"]').text()).toBe('47:02')
      expect(wrapper.get('[data-testid="goal-count"]').text()).toBe('1')
      const liveRow = wrapper.get('[data-match-id="running-match"]')
      expect(liveRow.text()).toContain('vs West Town')
      expect(liveRow.text()).toContain('HOME')
      expect(liveRow.text()).toContain('Running')
      expect(liveRow.get('.live-contribution').text()).toBe('LIVE')

      const current = matchStore.matches.value.find((match) => match.id === 'running-match')!
      await matchStore.persist({
        ...current,
        clock: { period: 1, elapsedMs: 2_000, status: 'paused', startedAt: null },
        updatedAt: 52_000,
      })
      await flushPromises()
      await vi.advanceTimersByTimeAsync(5_000)
      await flushPromises()
      expect(wrapper.get('[data-testid="total-playing-time"]').text()).toBe('47:02')
      expect(wrapper.get('[data-testid="goal-count"]').text()).toBe('1')
      expect(wrapper.get('[data-match-id="running-match"] .live-contribution').text()).toBe('ONGOING')
      expect(wrapper.get('[data-testid="appearance-count"]').text()).toBe('2')
    } finally {
      wrapper.unmount()
    }
  })

  it('distinguishes same-name directory identities on their separate statistics pages', async () => {
    const longName = 'Alex Morgan With An Exceptionally Long Match Day Name'
    const first = createPlayer(longName, 100, 'identity-alex-one')
    const second = createPlayer(longName, 200, 'identity-alex-two')
    const match = trackedMatch(
      'same-name-statistics', 100,
      participation([
        { playerId: first.id, nameSnapshot: 'Alex Morgan' },
        { playerId: second.id, nameSnapshot: 'Alex Morgan' },
      ], [first.id]),
      {
        completed: { 1: 1_000, 2: null },
        goals: [goalEvent('one-identity-goal', first.id, null, 'home', longName)],
      },
    )
    const firstPage = await mountStatistics(first.id, [first, second], [match])
    const secondPage = await mountStatistics(second.id, [first, second], [match])
    try {
      const firstName = firstPage.wrapper.get('#player-statistics-heading').text()
      const secondName = secondPage.wrapper.get('#player-statistics-heading').text()
      expect(firstName).toContain(`${longName} ·`)
      expect(secondName).toContain(`${longName} ·`)
      expect(firstName).not.toBe(secondName)
      expect(firstPage.wrapper.get('[data-testid="appearance-count"]').text()).toBe('1')
      expect(secondPage.wrapper.get('[data-testid="appearance-count"]').text()).toBe('0')
      expect(firstPage.wrapper.get('[data-testid="goal-count"]').text()).toBe('1')
      expect(secondPage.wrapper.get('[data-testid="goal-count"]').text()).toBe('0')
      expect(secondPage.wrapper.get('[data-match-id="same-name-statistics"] .breakdown-time').text()).toBe('00:00')

      const renamed = await firstPage.playerStore.persist({
        ...first,
        name: 'Alexandra Morgan',
        updatedAt: 300,
      })
      await flushPromises()
      expect(firstPage.wrapper.get('#player-statistics-heading').text()).toBe('Alexandra Morgan')
      expect(firstPage.wrapper.get('[data-testid="goal-count"]').text()).toBe('1')
      await firstPage.playerStore.persist({ ...renamed, archived: true, updatedAt: 400 })
      await flushPromises()
      expect(firstPage.wrapper.get('.archived-label').text()).toContain('ARCHIVED PLAYER')
      expect(firstPage.wrapper.get('[data-testid="goal-count"]').text()).toBe('1')
    } finally {
      firstPage.wrapper.unmount()
      secondPage.wrapper.unmount()
    }
  })

  it('identifies untracked matches as unavailable and never invents their playing time', async () => {
    const alex = createPlayer('Alex Morgan', 100, 'alex-id')
    const legacy = createMatch('Old Harbor', 'Old Valley', 200, 'untracked-legacy')
    legacy.clock = { period: 2, elapsedMs: 45 * 60_000, status: 'full-time', startedAt: null }
    const { wrapper } = await mountStatistics(alex.id, [alex], [legacy])
    try {
      expect(wrapper.get('[data-testid="total-playing-time"]').text()).toBe('00:00')
      expect(wrapper.get('[data-testid="appearance-count"]').text()).toBe('0')
      expect(wrapper.get('[data-testid="goal-count"]').text()).toBe('0')
      expect(wrapper.get('[data-testid="assist-count"]').text()).toBe('0')
      expect(wrapper.find('.breakdown-row').exists()).toBe(false)
      expect(wrapper.get('.untracked-note').text()).toContain('1 match without player tracking')
      expect(wrapper.get('.untracked-note').text()).toContain('Old Harbor vs Old Valley')
      expect(wrapper.get('.untracked-note').text()).toContain('Goal names are not used to infer player history.')
    } finally {
      wrapper.unmount()
    }
  })

  it('publishes corrected goal totals only after the match details commit', async () => {
    const alex = createPlayer('Alex Morgan', 100, 'alex-id')
    const sam = createPlayer('Sam Kerr', 200, 'sam-id')
    const match = trackedMatch(
      'committed-goal-details', 100,
      participation([
        { playerId: alex.id, nameSnapshot: 'Alex match snapshot' },
        { playerId: sam.id, nameSnapshot: 'Sam match snapshot' },
      ], [alex.id]),
      { goals: [goalEvent('committed-goal', alex.id, null, 'home', 'Alex match snapshot')] },
    )
    const { wrapper, matchStore } = await mountStatistics(alex.id, [alex, sam], [match])
    try {
      expect(wrapper.get('[data-testid="goal-count"]').text()).toBe('1')
      expect(wrapper.get('[data-testid="total-playing-time"]').text()).toBe('47:00')
      expect(wrapper.get('[data-testid="appearance-count"]').text()).toBe('1')

      const draft = structuredClone(match)
      draft.goals[0].scorerPlayerId = sam.id
      draft.goals[0].scorer = 'Sam match snapshot'
      expect(wrapper.get('[data-testid="goal-count"]').text()).toBe('1')

      await matchStore.persist(draft)
      await flushPromises()
      expect(wrapper.get('[data-testid="goal-count"]').text()).toBe('0')
      expect(wrapper.get('[data-testid="total-playing-time"]').text()).toBe('47:00')
      expect(wrapper.get('[data-testid="appearance-count"]').text()).toBe('1')
      expect(wrapper.find('[data-match-id="committed-goal-details"]').exists()).toBe(true)
    } finally {
      wrapper.unmount()
    }
  })
})
