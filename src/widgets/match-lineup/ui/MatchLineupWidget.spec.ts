import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createMatch,
  provideMatchStore,
  type Match,
  type MatchParticipation,
  type MatchRepository,
  type MatchStore,
  type SubstitutionEvent,
} from '../../../entities/match'
import MatchLineupWidget from './MatchLineupWidget.vue'

function trackedMatch(
  id: string,
  clock: Match['clock'],
  participation: MatchParticipation,
  completedPeriodElapsedMs: Match['completedPeriodElapsedMs'] = { 1: null, 2: null },
): Match {
  return {
    ...createMatch('North City', 'South Town', 100, id),
    clock,
    participation,
    completedPeriodElapsedMs,
  }
}

function sub(
  id: string,
  outgoingPlayerId: string,
  incomingPlayerId: string,
  period: 1 | 2,
  elapsedMs: number,
  sequence: number,
): SubstitutionEvent {
  return { id, outgoingPlayerId, incomingPlayerId, period, elapsedMs, sequence, createdAt: sequence }
}

async function mountWidget(initialMatch: Match) {
  const records = [structuredClone(initialMatch)]
  const repository: MatchRepository = {
    listMatches: async () => structuredClone(records),
    getMatch: async (id) => records.find((match) => match.id === id),
    async saveMatch(match) {
      const index = records.findIndex((saved) => saved.id === match.id)
      if (index < 0) records.push(structuredClone(match))
      else records[index] = structuredClone(match)
    },
    close: () => undefined,
  }
  let store!: MatchStore
  const Host = defineComponent({
    setup() {
      store = provideMatchStore(repository)
      return () => h(MatchLineupWidget, { matchId: initialMatch.id })
    },
  })
  const wrapper = mount(Host)
  await store.load()
  await flushPromises()
  return { wrapper, store, records }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('MatchLineupWidget', () => {
  it('shows planned starters and a flexible bench before kickoff', async () => {
    const participation: MatchParticipation = {
      ownSide: 'home',
      squad: [
        { playerId: 'alex', nameSnapshot: 'Alex' },
        { playerId: 'sam', nameSnapshot: 'Sam' },
        { playerId: 'jordan', nameSnapshot: 'Jordan' },
      ],
      starterIds: ['alex', 'sam'],
      substitutions: [],
    }
    const { wrapper } = await mountWidget(trackedMatch(
      'planned-lineup',
      { period: 1, elapsedMs: 0, status: 'not-started', startedAt: null },
      participation,
    ))
    try {
      expect(wrapper.get('#match-lineup-heading').text()).toBe('Planned lineup')
      expect(wrapper.get('[aria-label="On the pitch"]').text()).toContain('Alex')
      expect(wrapper.get('[aria-label="On the pitch"]').text()).toContain('Sam')
      expect(wrapper.get('[aria-label="On the bench"]').text()).toContain('Jordan')
      expect(wrapper.get('[data-player-id="alex"] .player-time').text()).toBe('00:00')
      expect(wrapper.get('.lineup-live-badge').text()).toBe('READY')
    } finally {
      wrapper.unmount()
    }
  })

  it('updates the running on-pitch time and freezes it while paused', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const participation: MatchParticipation = {
      ownSide: 'away',
      squad: [
        { playerId: 'alex', nameSnapshot: 'Alex' },
        { playerId: 'sam', nameSnapshot: 'Sam' },
      ],
      starterIds: ['alex'],
      substitutions: [],
    }
    const { wrapper, store } = await mountWidget(trackedMatch(
      'live-lineup',
      { period: 1, elapsedMs: 0, status: 'running', startedAt: 10_000 },
      participation,
    ))
    try {
      await vi.advanceTimersByTimeAsync(2_000)
      await flushPromises()
      expect(wrapper.get('[data-player-id="alex"] .player-time').text()).toBe('00:02')
      expect(wrapper.get('[data-player-id="alex"] .player-name').text()).toContain('LIVE')
      expect(wrapper.get('[data-player-id="sam"] .player-time').text()).toBe('00:00')

      const current = store.matches.value[0]
      await store.persist({
        ...current,
        clock: { period: 1, elapsedMs: 2_000, status: 'paused', startedAt: null },
        updatedAt: 12_000,
      })
      await flushPromises()
      await vi.advanceTimersByTimeAsync(10_000)
      await flushPromises()
      expect(wrapper.get('[data-player-id="alex"] .player-time').text()).toBe('00:02')
      expect(wrapper.get('.lineup-live-badge').text()).toBe('PAUSED')
    } finally {
      wrapper.unmount()
    }
  })

  it('keeps squad row order stable with long duplicate names and labels the tracked team', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const longName = 'Alex Morgan with an exceptionally long match-day player name'
    const participation: MatchParticipation = {
      ownSide: 'home',
      squad: [
        { playerId: 'late-player', nameSnapshot: longName },
        { playerId: 'ongoing-player', nameSnapshot: longName },
        { playerId: 'early-player', nameSnapshot: 'Sam Kerr' },
      ],
      starterIds: ['ongoing-player', 'early-player'],
      substitutions: [sub('early-off', 'early-player', 'late-player', 1, 1_000, 0)],
    }
    const { wrapper } = await mountWidget(trackedMatch(
      'stable-long-player-rows',
      { period: 1, elapsedMs: 3_000, status: 'running', startedAt: 10_000 },
      participation,
    ))
    try {
      const pitch = wrapper.get('[aria-label="On the pitch"]')
      const initialOrder = pitch.findAll('.lineup-player').map((row) => row.attributes('data-player-id'))
      expect(initialOrder).toEqual(['late-player', 'ongoing-player'])
      expect(pitch.text()).toContain(`${longName} · late`)
      expect(pitch.text()).toContain(`${longName} · ongo`)
      expect(wrapper.get('.section-kicker').text()).toBe('Player times for North City')
      expect(wrapper.get('[data-player-id="late-player"] .player-time').text()).toBe('00:02')
      expect(wrapper.get('[data-player-id="ongoing-player"] .player-time').text()).toBe('00:03')
      expect(wrapper.get('[aria-label="On the bench"] [data-player-id="early-player"] .player-time').text()).toBe('00:01')

      await vi.advanceTimersByTimeAsync(5_000)
      await flushPromises()
      expect(wrapper.get('[aria-label="On the pitch"] .lineup-player').attributes('data-player-id')).toBe('late-player')
      expect(wrapper.get('[aria-label="On the pitch"] .lineup-player:nth-child(2)').attributes('data-player-id'))
        .toBe('ongoing-player')
      expect(wrapper.get('[data-player-id="late-player"] .player-time').text()).toBe('00:07')
      expect(wrapper.get('[data-player-id="ongoing-player"] .player-time').text()).toBe('00:08')
    } finally {
      wrapper.unmount()
    }
  })

  it('uses half-time exchanges for the next lineup and excludes the break', async () => {
    const participation: MatchParticipation = {
      ownSide: 'home',
      squad: [
        { playerId: 'alex', nameSnapshot: 'Alex' },
        { playerId: 'sam', nameSnapshot: 'Sam' },
      ],
      starterIds: ['alex'],
      substitutions: [sub('halftime-swap', 'alex', 'sam', 2, 0, 1)],
    }
    const { wrapper, store } = await mountWidget(trackedMatch(
      'halftime-lineup',
      { period: 1, elapsedMs: 47 * 60_000, status: 'halftime', startedAt: null },
      participation,
      { 1: 47 * 60_000, 2: null },
    ))
    try {
      expect(wrapper.get('[aria-label="On the pitch"]').text()).toContain('Sam')
      expect(wrapper.get('[aria-label="On the bench"]').text()).toContain('Alex')
      expect(wrapper.get('[data-player-id="alex"] .player-time').text()).toBe('47:00')
      expect(wrapper.get('[data-player-id="sam"] .player-time').text()).toBe('00:00')
      expect(wrapper.text()).toContain('the break adds no playing time')

      const halftime = store.matches.value[0]
      await store.persist({
        ...halftime,
        clock: { period: 2, elapsedMs: 10 * 60_000, status: 'paused', startedAt: null },
        completedPeriodElapsedMs: { 1: 47 * 60_000, 2: null },
        updatedAt: 20_000,
      })
      await flushPromises()
      expect(wrapper.get('[data-player-id="alex"] .player-time').text()).toBe('47:00')
      expect(wrapper.get('[data-player-id="sam"] .player-time').text()).toBe('10:00')
    } finally {
      wrapper.unmount()
    }
  })

  it('derives a final lineup and sums repeated spells without duplicate time', async () => {
    const participation: MatchParticipation = {
      ownSide: 'home',
      squad: [
        { playerId: 'alex', nameSnapshot: 'Alex' },
        { playerId: 'sam', nameSnapshot: 'Sam' },
      ],
      starterIds: ['alex'],
      substitutions: [
        sub('alex-off', 'alex', 'sam', 1, 18 * 60_000, 1),
        sub('alex-back', 'sam', 'alex', 1, 30 * 60_000, 2),
      ],
    }
    const { wrapper } = await mountWidget(trackedMatch(
      'final-lineup',
      { period: 1, elapsedMs: 47 * 60_000, status: 'full-time', startedAt: null },
      participation,
      { 1: 47 * 60_000, 2: null },
    ))
    try {
      expect(wrapper.get('#match-lineup-heading').text()).toBe('Final lineup')
      expect(wrapper.get('[data-player-id="alex"] .player-time').text()).toBe('35:00')
      expect(wrapper.get('[data-player-id="sam"] .player-time').text()).toBe('12:00')
      expect(wrapper.get('[data-player-id="alex"] .player-name').text()).not.toContain('LIVE')
    } finally {
      wrapper.unmount()
    }
  })

  it('clears its live timer on navigation and reconstructs the same result on remount', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const participation: MatchParticipation = {
      ownSide: 'home',
      squad: [{ playerId: 'alex', nameSnapshot: 'Alex' }],
      starterIds: ['alex'],
      substitutions: [],
    }
    const mounted = await mountWidget(trackedMatch(
      'navigation-lineup',
      { period: 1, elapsedMs: 0, status: 'running', startedAt: 10_000 },
      participation,
    ))
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(3_000)
    expect(mounted.wrapper.get('[data-player-id="alex"] .player-time').text()).toBe('00:03')

    const retained = structuredClone(mounted.records[0])
    mounted.wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)

    vi.setSystemTime(20_000)
    const reopened = await mountWidget(retained)
    try {
      expect(reopened.wrapper.get('[data-player-id="alex"] .player-time').text()).toBe('00:10')
    } finally {
      reopened.wrapper.unmount()
      expect(vi.getTimerCount()).toBe(0)
    }
  })
})
