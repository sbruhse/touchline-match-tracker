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

async function mountFeature(
  initialMatch: Match,
  players: ReturnType<typeof createPlayer>[],
  options: { presentation?: 'standalone' | 'workflow'; failedWrites?: number; failedPlayerLoads?: number } = {},
) {
  const records = [structuredClone(initialMatch)]
  const savedSnapshots: Match[] = []
  let failedWrites = options.failedWrites ?? 0
  let failedPlayerLoads = options.failedPlayerLoads ?? 0
  const matchRepository: MatchRepository = {
    listMatches: async () => structuredClone(records),
    getMatch: async (id) => records.find((match) => match.id === id),
    async saveMatch(match) {
      if (failedWrites > 0) {
        failedWrites -= 1
        throw new Error('temporary match write failure')
      }
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
  const listPlayers = playerRepository.listPlayers.bind(playerRepository)
  playerRepository.listPlayers = async () => {
    if (failedPlayerLoads > 0) {
      failedPlayerLoads -= 1
      throw new Error('player directory temporarily unavailable')
    }
    return listPlayers()
  }

  let matchStore!: MatchStore
  let playerStore!: ReturnType<typeof providePlayerStore>
  const Host = defineComponent({
    setup() {
      matchStore = provideMatchStore(matchRepository)
      playerStore = providePlayerStore(playerRepository)
       return () => h(ConfigureMatchSquad, {
         matchId: initialMatch.id,
         presentation: options.presentation ?? 'standalone',
       })
    },
  })
  const wrapper = mount(Host)
  await Promise.allSettled([matchStore.load(), playerStore.load()])
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

  it('opens directly in workflow mode, restores committed choices, and emits saved only after a successful commit', async () => {
    const match = {
      ...createMatch('North City', 'South Town', 100, 'workflow-squad-match'),
      participation: {
        ownSide: 'away' as const,
        squad: [{ playerId: 'alex-id', nameSnapshot: 'Alex Match Snapshot' }],
        starterIds: ['alex-id'],
        substitutions: [],
      },
    }
    const alex = createPlayer('Alex', 100, 'alex-id')
    const { wrapper, savedSnapshots } = await mountFeature(match, [alex], { presentation: 'workflow', failedWrites: 1 })
    try {
      const feature = wrapper.getComponent(ConfigureMatchSquad)
      expect(wrapper.find('.squad-form').exists()).toBe(true)
      expect((wrapper.get('[name="own-side"][value="away"]').element as HTMLInputElement).checked).toBe(true)
      expect((wrapper.get('[aria-label="Include Alex Match Snapshot in match squad"]').element as HTMLInputElement).checked).toBe(true)
      expect((wrapper.get('[aria-label="Select Alex Match Snapshot as a starter"]').element as HTMLInputElement).checked).toBe(true)
      expect(feature.emitted('saved')).toBeUndefined()

      await wrapper.get('[name="own-side"][value="home"]').setValue()
      await wrapper.get('.squad-form').trigger('submit')
      await flushPromises()
      expect(wrapper.text()).toContain('temporary match write failure')
      expect((wrapper.get('[aria-label="Select Alex Match Snapshot as a starter"]').element as HTMLInputElement).checked).toBe(true)
      expect(savedSnapshots).toHaveLength(0)
      expect(feature.emitted('saved')).toBeUndefined()

      await wrapper.get('.squad-form').trigger('submit')
      await flushPromises()
      expect(savedSnapshots).toHaveLength(1)
      expect(feature.emitted('saved')).toEqual([[match.id]])
      expect(wrapper.find('.squad-form').exists()).toBe(true)
    } finally {
      wrapper.unmount()
    }
  })

  it('keeps skip/keep distinct from the explicit committed disable action', async () => {
    const match = {
      ...createMatch('North City', 'South Town', 100, 'workflow-disable-match'),
      participation: {
        ownSide: 'home' as const,
        squad: [{ playerId: 'alex-id', nameSnapshot: 'Alex' }],
        starterIds: ['alex-id'],
        substitutions: [],
      },
    }
    const { wrapper, records, savedSnapshots } = await mountFeature(
      match,
      [createPlayer('Alex', 100, 'alex-id')],
      { presentation: 'workflow' },
    )
    try {
      const feature = wrapper.getComponent(ConfigureMatchSquad)
      await wrapper.get('.squad-form .quiet-button').trigger('click')
      expect(feature.emitted('navigationIntent')).toEqual([['keep']])
      expect(savedSnapshots).toHaveLength(0)
      expect(records[0].participation).not.toBeNull()

      await wrapper.get('.workflow-squad-actions button').trigger('click')
      await flushPromises()
      expect(savedSnapshots).toHaveLength(1)
      expect(records[0].participation).toBeNull()
      expect(feature.emitted('saved')).toEqual([[match.id]])
    } finally {
      wrapper.unmount()
    }
  })

  it('distinguishes an empty directory from a load failure, retries, and keeps saved squads usable without source data', async () => {
    const empty = await mountFeature(
      createMatch('North City', 'South Town', 100, 'empty-workflow-directory'),
      [],
      { presentation: 'workflow' },
    )
    try {
      expect(empty.wrapper.text()).toContain('No players are registered yet.')
      expect(empty.wrapper.text()).toContain('Add players in My players')
      expect(empty.wrapper.find('.squad-form').exists()).toBe(false)
      expect(empty.wrapper.findAll('button').some((button) => button.text() === 'Skip player tracking')).toBe(true)
      expect(empty.wrapper.text()).not.toContain('directory is unavailable')
    } finally {
      empty.wrapper.unmount()
    }

    const retry = await mountFeature(
      createMatch('North City', 'South Town', 100, 'retry-workflow-directory'),
      [createPlayer('Alex', 100, 'alex-id')],
      { presentation: 'workflow', failedPlayerLoads: 1 },
    )
    try {
      expect(retry.wrapper.text()).toContain('player directory is unavailable')
      expect(retry.wrapper.text()).not.toContain('No players are registered yet.')
      expect(retry.wrapper.findAll('button').some((button) => button.text() === 'Skip player tracking')).toBe(true)
      await retry.wrapper.get('.squad-setup button.secondary-button').trigger('click')
      await flushPromises()
      expect(retry.playerStore.ready.value).toBe(true)
      expect(retry.wrapper.find('.squad-form').exists()).toBe(true)
      expect(retry.wrapper.get('[aria-label="Include Alex in match squad"]')).toBeTruthy()
    } finally {
      retry.wrapper.unmount()
    }

    const savedSetup: Match = {
      ...createMatch('North City', 'South Town', 100, 'saved-workflow-without-directory'),
      participation: {
        ownSide: 'home',
        squad: [{ playerId: 'alex-id', nameSnapshot: 'Alex Snapshot' }],
        starterIds: ['alex-id'],
        substitutions: [],
      },
    }
    const saved = await mountFeature(savedSetup, [], { presentation: 'workflow', failedPlayerLoads: 1 })
    try {
      expect(saved.wrapper.text()).toContain('Saved squad choices remain available')
      expect(saved.wrapper.get('[aria-label="Include Alex Snapshot in match squad"]')).toBeTruthy()
      await saved.wrapper.get('.squad-form .quiet-button').trigger('click')
      expect(saved.savedSnapshots).toHaveLength(0)
      expect(saved.records[0].participation).toEqual(savedSetup.participation)
      expect(saved.wrapper.getComponent(ConfigureMatchSquad).emitted('navigationIntent')).toEqual([['keep']])
    } finally {
      saved.wrapper.unmount()
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
