import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import {
  createMatch,
  provideMatchStore,
  scoreFor,
  type Match,
  type MatchParticipation,
  type MatchRepository,
  type MatchStore,
  type SubstitutionEvent,
} from '../../../../entities/match'
import MatchTimeline from './MatchTimeline.vue'

function event(
  id: string,
  outgoingPlayerId: string,
  incomingPlayerId: string,
  period: 1 | 2,
  elapsedMs: number,
  sequence: number,
): SubstitutionEvent {
  return { id, outgoingPlayerId, incomingPlayerId, period, elapsedMs, sequence, createdAt: sequence }
}

function fixtureMatch(): Match {
  const base = createMatch('North City', 'South Town', 100, 'combined-timeline')
  const participation: MatchParticipation = {
    ownSide: 'home',
    squad: [
      { playerId: 'alex', nameSnapshot: 'Alex' },
      { playerId: 'sam', nameSnapshot: 'Sam' },
      { playerId: 'jordan', nameSnapshot: 'Jordan' },
    ],
    starterIds: ['alex'],
    // Deliberately store equal-time events in reverse array order; sequence is authoritative.
    substitutions: [
      event('halftime-exchange', 'jordan', 'alex', 2, 0, 3),
      event('third-at-same-time', 'jordan', 'alex', 1, 20_000, 2),
      event('second-at-same-time', 'sam', 'jordan', 1, 20_000, 1),
      event('first-exchange', 'alex', 'sam', 1, 10_000, 0),
    ],
  }
  return {
    ...base,
    clock: { period: 2, elapsedMs: 48 * 60_000, status: 'full-time', startedAt: null },
    completedPeriodElapsedMs: { 1: 47 * 60_000, 2: 48 * 60_000 },
    participation,
    goals: [
      {
        id: 'late-goal', side: 'away', period: 1, elapsedMs: 35_000,
        scorerPlayerId: null, scorer: '', assistPlayerId: null, assist: '', description: '', createdAt: 200,
      },
      {
        id: 'stoppage-goal', side: 'away', period: 1, elapsedMs: 47 * 60_000,
        scorerPlayerId: null, scorer: '', assistPlayerId: null, assist: '', description: '', createdAt: 250,
      },
      {
        id: 'second-half-goal', side: 'home', period: 2, elapsedMs: 60_000,
        scorerPlayerId: null, scorer: 'Jordan', assistPlayerId: null, assist: '', description: '', createdAt: 300,
      },
      {
        id: 'earlier-tied-goal', side: 'away', period: 1, elapsedMs: 20_000,
        scorerPlayerId: null, scorer: '', assistPlayerId: null, assist: '', description: '', createdAt: 140,
      },
      {
        id: 'tied-goal', side: 'home', period: 1, elapsedMs: 20_000,
        scorerPlayerId: null, scorer: '', assistPlayerId: null, assist: '', description: '', createdAt: 150,
      },
      {
        id: 'opening-goal', side: 'home', period: 1, elapsedMs: 10_000,
        scorerPlayerId: null, scorer: '', assistPlayerId: null, assist: '', description: '', createdAt: 100,
      },
    ],
  }
}

async function mountTimeline(initialMatch: Match) {
  const records = [structuredClone(initialMatch)]
  const repository: MatchRepository = {
    listMatches: async () => structuredClone(records),
    getMatch: async (id) => records.find((match) => match.id === id),
    async saveMatch(match) {
      const snapshot = structuredClone(match)
      const index = records.findIndex((saved) => saved.id === match.id)
      if (index < 0) records.push(snapshot)
      else records[index] = snapshot
    },
    close: () => undefined,
  }
  let store!: MatchStore
  const Host = defineComponent({
    setup() {
      store = provideMatchStore(repository)
      return () => h(MatchTimeline, { matchId: initialMatch.id })
    },
  })
  const wrapper = mount(Host)
  await store.load()
  await flushPromises()
  return { wrapper, store, records }
}

describe('MatchTimeline', () => {
  it('shows newest-first events with deterministic equal-time and half-time ordering', async () => {
    const match = fixtureMatch()
    const { wrapper, records } = await mountTimeline(match)
    try {
      const rows = wrapper.findAll('.timeline-event')
      expect(rows.map((row) => `${row.attributes('data-event-type')}:${row.attributes('data-event-id')}`))
        .toEqual([
          'goal:second-half-goal',
          'substitution:halftime-exchange',
          'goal:stoppage-goal',
          'goal:late-goal',
          'goal:earlier-tied-goal',
          'goal:tied-goal',
          'substitution:second-at-same-time',
          'substitution:third-at-same-time',
          'goal:opening-goal',
          'substitution:first-exchange',
        ])
      expect(rows[1].get('.timeline-event-time').text()).toBe('HT')
      expect(rows[1].get('.timeline-event-time').attributes('aria-label')).toBe('Half-time, second half 00:00')
      expect(rows[2].get('.timeline-event-time').attributes('aria-label')).toBe('First half 45+2′')
      expect(rows[0].text()).toContain('Jordan')
      expect(rows[6].get('.exchange-players').text()).toBe('Sam off · Jordan on')
      expect(rows[7].get('.exchange-players').text()).toBe('Jordan off · Alex on')
      expect(rows[1].text()).toContain('North City')
      expect(rows[0].text()).toContain('Goal')
      expect(rows[0].text()).not.toContain('GOAL 01')
      expect(wrapper.get('.timeline-count').text()).toContain('06 GOALS · 04 EXCHANGES')
      expect(scoreFor(records[0])).toEqual({ home: 3, away: 3 })
    } finally {
      wrapper.unmount()
    }
  })

  it('reconstructs the complete newest-first ordering after reload', async () => {
    const original = fixtureMatch()
    const first = await mountTimeline(original)
    const firstOrder = first.wrapper.findAll('[data-event-type="substitution"]')
      .map((row) => row.attributes('data-event-id'))
    const persistedRecord = structuredClone(first.records[0])
    first.wrapper.unmount()

    const reloaded = await mountTimeline(persistedRecord)
    try {
      const reloadedOrder = reloaded.wrapper.findAll('[data-event-type="substitution"]')
        .map((row) => row.attributes('data-event-id'))
      expect(firstOrder).toEqual(['halftime-exchange', 'second-at-same-time', 'third-at-same-time', 'first-exchange'])
      expect(reloadedOrder).toEqual(firstOrder)
      expect(first.wrapper.findAll('.timeline-event').map((row) => row.attributes('data-event-id')))
        .toEqual(reloaded.wrapper.findAll('.timeline-event').map((row) => row.attributes('data-event-id')))
    } finally {
      reloaded.wrapper.unmount()
    }
  })

  it('shows goal-only history newest first', async () => {
    const match = {
      ...fixtureMatch(),
      id: 'goal-only-timeline',
      participation: null,
    }
    const { wrapper } = await mountTimeline(match)
    try {
      expect(wrapper.findAll('.timeline-event').map((row) => row.attributes('data-event-id')))
        .toEqual(['second-half-goal', 'stoppage-goal', 'late-goal', 'earlier-tied-goal', 'tied-goal', 'opening-goal'])
      expect(wrapper.findAll('[data-event-type="substitution"]')).toHaveLength(0)
    } finally {
      wrapper.unmount()
    }
  })
})
