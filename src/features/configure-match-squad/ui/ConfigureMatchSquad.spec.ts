import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import {
  createMatch,
  provideMatchStore,
  resumeClock,
  type Match,
  type MatchRepository,
  type MatchStore,
} from '../../../entities/match'
import { createPlayer, createPlayerRepository, providePlayerStore, type PlayerStorageLike } from '../../../entities/player'
import ConfigureMatchSquad from './ConfigureMatchSquad.vue'
import { buildMatchParticipation, persistMatchParticipationSetup } from '../model/configureMatchSquad'

class MemoryStorage implements PlayerStorageLike {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

async function mountFeature(initialMatch: Match, players: ReturnType<typeof createPlayer>[]) {
  const records = [structuredClone(initialMatch)]
  const savedSnapshots: Match[] = []
  const matchRepository: MatchRepository = {
    listMatches: async () => structuredClone(records),
    getMatch: async (id) => records.find((match) => match.id === id),
    async saveMatch(match) {
      const snapshot = structuredClone(match)
      savedSnapshots.push(snapshot)
      const index = records.findIndex((saved) => saved.id === match.id)
      if (index < 0) records.push(snapshot)
      else records[index] = snapshot
    },
    close: () => undefined,
  }
  const storage = new MemoryStorage()
  const playerRepository = createPlayerRepository({ storage })
  await playerRepository.savePlayers(players)

  let matchStore!: MatchStore
  let playerStore!: ReturnType<typeof providePlayerStore>
  const Host = defineComponent({
    setup() {
      matchStore = provideMatchStore(matchRepository)
      playerStore = providePlayerStore(playerRepository)
      return () => h(ConfigureMatchSquad, { matchId: initialMatch.id })
    },
  })
  const wrapper = mount(Host)
  await Promise.all([matchStore.load(), playerStore.load()])
  await flushPromises()
  return { wrapper, matchStore, playerStore, records, savedSnapshots }
}

describe('ConfigureMatchSquad', () => {
  it('configures the home side with a flexible squad, starters, and a derived bench', async () => {
    const match = createMatch('North City', 'South Town', 100, 'home-squad-match')
    const players = [
      createPlayer('Alex', 100, 'alex-id'),
      createPlayer('Sam', 200, 'sam-id'),
      createPlayer('Jordan', 300, 'jordan-id'),
    ]
    const { wrapper, records, savedSnapshots } = await mountFeature(match, players)
    try {
      await wrapper.get('button').trigger('click')
      await wrapper.get('[name="own-side"][value="home"]').setValue()
      for (const player of players) {
        await wrapper.get(`[aria-label="Include ${player.name} in match squad"]`).setValue(true)
      }
      await wrapper.get('[aria-label="Select Alex as a starter"]').setValue(true)
      await wrapper.get('[aria-label="Select Sam as a starter"]').setValue(true)
      await wrapper.get('.squad-form').trigger('submit')
      await flushPromises()

      const participation = records[0].participation!
      expect(participation.ownSide).toBe('home')
      expect(participation.squad).toEqual(players.map(({ id, name }) => ({ playerId: id, nameSnapshot: name })))
      expect(participation.starterIds).toEqual(['alex-id', 'sam-id'])
      expect(participation.squad.filter((player) => !participation.starterIds.includes(player.playerId)))
        .toEqual([{ playerId: 'jordan-id', nameSnapshot: 'Jordan' }])
      expect(savedSnapshots).toHaveLength(1)
      expect(wrapper.get('[data-testid="saved-squad-summary"]').text()).toContain('North City')
      expect(wrapper.get('[data-testid="saved-squad-summary"]').text()).toContain('Alex, Sam')
    } finally {
      wrapper.unmount()
    }
  })

  it('supports selecting the away side without requiring opponent players', async () => {
    const match = createMatch('North City', 'South Town', 100, 'away-squad-match')
    const players = [createPlayer('Alex', 100, 'alex-id')]
    const { wrapper, records } = await mountFeature(match, players)
    try {
      await wrapper.get('button').trigger('click')
      await wrapper.get('[name="own-side"][value="away"]').setValue()
      await wrapper.get('[aria-label="Include Alex in match squad"]').setValue(true)
      await wrapper.get('[aria-label="Select Alex as a starter"]').setValue(true)
      await wrapper.get('.squad-form').trigger('submit')
      await flushPromises()

      expect(records[0].participation?.ownSide).toBe('away')
      expect(records[0].participation?.squad).toEqual([{ playerId: 'alex-id', nameSnapshot: 'Alex' }])
      expect(records[0].participation?.starterIds).toEqual(['alex-id'])
    } finally {
      wrapper.unmount()
    }
  })

  it('preserves saved name snapshots and permits an archived existing squad member', async () => {
    const archivedAlex = { ...createPlayer('Alex Updated', 100, 'alex-id'), archived: true }
    const sam = createPlayer('Sam', 200, 'sam-id')
    const match = {
      ...createMatch('North City', 'South Town', 100, 'archived-squad-match'),
      participation: {
        ownSide: 'home' as const,
        squad: [{ playerId: archivedAlex.id, nameSnapshot: 'Alex Match Snapshot' }],
        starterIds: [archivedAlex.id],
        substitutions: [],
      },
    }
    const { wrapper, records, playerStore } = await mountFeature(match, [archivedAlex, sam])
    try {
      expect(wrapper.get('[data-testid="saved-squad-summary"]').text()).toContain('Alex Match Snapshot')
      await wrapper.get('.saved-setup-actions .secondary-button').trigger('click')
      const archivedChoice = wrapper.get('[data-player-choice="alex-id"]')
      expect(archivedChoice.text()).toContain('Alex Match Snapshot')
      expect(archivedChoice.text()).toContain('Archived match member')
      expect((await archivedChoice.get('[type="checkbox"]').element as HTMLInputElement).checked).toBe(true)

      await playerStore.persist({ ...archivedAlex, archived: true, name: 'Renamed in directory', updatedAt: 400 })
      await wrapper.get('[aria-label="Include Sam in match squad"]').setValue(true)
      await wrapper.get('.squad-form').trigger('submit')
      await flushPromises()

      expect(records[0].participation?.squad).toEqual([
        { playerId: 'alex-id', nameSnapshot: 'Alex Match Snapshot' },
        { playerId: 'sam-id', nameSnapshot: 'Sam' },
      ])
    } finally {
      wrapper.unmount()
    }
  })

  it('shows blank-setup feedback and cannot begin an invalid or duplicate squad', async () => {
    const match = createMatch('North City', 'South Town', 100, 'invalid-squad-match')
    const alex = createPlayer('Alex', 100, 'alex-id')
    const { wrapper, records } = await mountFeature(match, [alex])
    try {
      await wrapper.get('button').trigger('click')
      await wrapper.get('[aria-label="Include Alex in match squad"]').setValue(true)
      await wrapper.get('[aria-label="Select Alex as a starter"]').setValue(true)
      await wrapper.get('.squad-form').trigger('submit')
      expect(wrapper.get('[role="alert"]').text()).toContain('Choose whether your team is playing at home or away.')
      expect(records[0].participation).toBeNull()
      expect(records[0].updatedAt).toBe(100)

      const duplicateDraft = {
        ownSide: 'home' as const,
        squadPlayerIds: ['alex-id', 'alex-id'],
        starterIds: ['alex-id'],
      }
      expect(buildMatchParticipation(duplicateDraft, [alex], null)).toMatchObject({
        valid: false,
        error: 'A player can appear only once in the match squad.',
      })
    } finally {
      wrapper.unmount()
    }
  })

  it('locks an existing setup after kickoff and keeps goal-only matches untracked and clock-usable', async () => {
    const match = createMatch('North City', 'South Town', 100, 'lock-squad-match')
    const alex = createPlayer('Alex', 100, 'alex-id')
    const { wrapper, matchStore, records } = await mountFeature(match, [alex])
    try {
      await wrapper.get('button').trigger('click')
      await wrapper.get('[name="own-side"][value="home"]').setValue()
      await wrapper.get('[aria-label="Include Alex in match squad"]').setValue(true)
      await wrapper.get('[aria-label="Select Alex as a starter"]').setValue(true)
      await wrapper.get('.squad-form').trigger('submit')
      await flushPromises()
      const configured = records[0]

      await matchStore.persist({ ...configured, clock: resumeClock(configured.clock, 500), updatedAt: 500 })
      await flushPromises()
      expect(wrapper.text()).toContain('locked after kickoff')
      expect(wrapper.find('.saved-setup-actions').exists()).toBe(false)
      const changedParticipation = { ...configured.participation!, ownSide: 'away' as const }
      await expect(persistMatchParticipationSetup(records[0], changedParticipation, matchStore, 600))
        .rejects.toThrow('Player tracking setup is locked after kickoff.')
      expect(records[0].participation?.ownSide).toBe('home')

      const goalOnly = {
        ...createMatch('Old Harbor', 'Old Valley', 700, 'goal-only-running'),
        clock: resumeClock(createMatch('Old Harbor', 'Old Valley', 700, 'goal-only-running').clock, 800),
      }
      const goalOnlyMounted = await mountFeature(goalOnly, [alex])
      try {
        expect(goalOnlyMounted.wrapper.text()).toContain('Goals and the match clock remain available.')
        expect(goalOnlyMounted.records[0].participation).toBeNull()
        expect(goalOnlyMounted.records[0].clock.status).toBe('running')
      } finally {
        goalOnlyMounted.wrapper.unmount()
      }
    } finally {
      wrapper.unmount()
    }
  })
})
