import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import {
  createMatch,
  provideMatchStore,
  type GoalEvent,
  type Match,
  type MatchJerseyAssignment,
  type MatchParticipation,
  type MatchRepository,
  type MatchStore,
} from '../../../entities/match'
import GoalEventEditor from './GoalEventEditor.vue'

function fixtureGoal(): GoalEvent {
  return {
    id: 'goal-draft', side: 'home', period: 1, elapsedMs: 60_000,
    scorerPlayerId: null, scorer: '', assistPlayerId: null, assist: '', description: '', createdAt: 1_000,
  }
}

async function mountEditor(options: {
  failNextSave?: boolean
  openInitially?: boolean
  goal?: GoalEvent
  participation?: MatchParticipation
  jerseyAssignment?: MatchJerseyAssignment
} = {}) {
  const initial: Match = {
    ...createMatch('North City', 'South Town', 100, 'goal-draft-match'),
    goals: [options.goal ?? fixtureGoal()],
    participation: options.participation ?? null,
    jerseyAssignment: options.jerseyAssignment ?? null,
  }
  const records = [structuredClone(initial)]
  let failNextSave = options.failNextSave ?? false
  const repository: MatchRepository = {
    listMatches: async () => structuredClone(records),
    getMatch: async (id) => records.find((match) => match.id === id),
    async saveMatch(match) {
      if (failNextSave) {
        failNextSave = false
        throw new Error('Disk is temporarily unavailable.')
      }
      const snapshot = structuredClone(match)
      const index = records.findIndex((saved) => saved.id === match.id)
      if (index < 0) records.push(snapshot)
      else records[index] = snapshot
    },
    close: () => undefined,
  }

  let store!: MatchStore
  const open = ref(options.openInitially ?? false)
  const Host = defineComponent({
    setup() {
      store = provideMatchStore(repository)
      return () => h(GoalEventEditor, {
        matchId: initial.id,
        goal: store.matches.value[0]?.goals[0] ?? initial.goals[0],
        homeTeam: initial.homeTeam,
        awayTeam: initial.awayTeam,
        open: open.value,
        onOpen: () => { open.value = true },
        onClose: () => { open.value = false },
      })
    },
  })
  const wrapper = mount(Host, { attachTo: document.body })
  await store.load()
  await flushPromises()
  return { wrapper, store, records, open, failSave: () => { failNextSave = true } }
}

function submitEditor(): void {
  document.querySelector<HTMLFormElement>('#goal-edit-form')?.dispatchEvent(new Event('submit', {
    bubbles: true,
    cancelable: true,
  }))
}

function setInput(name: string, value: string): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(`[name="${name}"]`)!
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  return input
}

function setSelect(name: string, value: string): HTMLSelectElement {
  const select = document.querySelector<HTMLSelectElement>(`[name="${name}"]`)!
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
  return select
}

describe('GoalEventEditor', () => {
  it('accepts blank optional fields and retains drafts through Close until explicitly discarded', async () => {
    const { wrapper, records } = await mountEditor()
    try {
      await wrapper.get('.goal-editor-launcher').trigger('click')
      await flushPromises()
      expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Add goal details')
      expect((document.querySelector('[name="scorer"]') as HTMLInputElement).required).toBe(false)
      expect((document.querySelector('[name="assist"]') as HTMLInputElement).required).toBe(false)
      submitEditor()
      await flushPromises()
      expect(records[0].goals[0]).toMatchObject({ scorer: '', assist: '', description: '' })
      expect(document.querySelector('[role="dialog"]')).toBeNull()

      await wrapper.get('.goal-editor-launcher').trigger('click')
      await flushPromises()
      setInput('scorer', 'Uncommitted scorer')
      document.querySelector<HTMLButtonElement>('.focused-editor__close')?.click()
      await flushPromises()
      expect(document.querySelector('[role="dialog"]')).toBeNull()

      await wrapper.get('.goal-editor-launcher').trigger('click')
      await flushPromises()
      expect((document.querySelector('[name="scorer"]') as HTMLInputElement).value).toBe('Uncommitted scorer')

      document.querySelector<HTMLButtonElement>('.discard-goal-button')?.click()
      await flushPromises()
      expect((document.querySelector('[name="scorer"]') as HTMLInputElement).value).toBe('')
    } finally {
      wrapper.unmount()
    }
  })

  it('keeps a failed-save draft retryable and closes only after commit', async () => {
    const { wrapper, records } = await mountEditor({ failNextSave: true })
    try {
      await wrapper.get('.goal-editor-launcher').trigger('click')
      await flushPromises()
      setInput('scorer', 'Retry scorer')
      submitEditor()
      await flushPromises()

      expect(document.querySelector('[role="alert"]')?.textContent).toContain('Disk is temporarily unavailable')
      expect((document.querySelector('[name="scorer"]') as HTMLInputElement).value).toBe('Retry scorer')
      expect(records[0].goals[0].scorer).toBe('')

      submitEditor()
      await flushPromises()
      expect(records[0].goals[0].scorer).toBe('Retry scorer')
      expect(document.querySelector('[role="dialog"]')).toBeNull()
    } finally {
      wrapper.unmount()
    }
  })

  it('preserves a draft when an unrelated match change commits', async () => {
    const { wrapper, store, records } = await mountEditor()
    try {
      await wrapper.get('.goal-editor-launcher').trigger('click')
      await flushPromises()
      const originalGoal = records[0].goals[0]
      setInput('scorer', 'Still drafting')
      const current = store.matches.value[0]
      await store.persist({
        ...current,
        clock: { ...current.clock, elapsedMs: 90_000 },
        updatedAt: current.updatedAt + 1,
      })
      await flushPromises()

      expect((document.querySelector('[name="scorer"]') as HTMLInputElement).value).toBe('Still drafting')
      submitEditor()
      await flushPromises()
      expect(records[0].clock.elapsedMs).toBe(90_000)
      expect(records[0].goals[0]).toMatchObject({
        id: originalGoal.id,
        createdAt: originalGoal.createdAt,
        period: originalGoal.period,
        elapsedMs: originalGoal.elapsedMs,
        scorer: 'Still drafting',
      })
    } finally {
      wrapper.unmount()
    }
  })

  it('initializes saved linked and name-only roles when mounted already open', async () => {
    const participation: MatchParticipation = {
      ownSide: 'home',
      squad: [
        { playerId: 'alex-id', nameSnapshot: 'Alex Morgan' },
        { playerId: 'alex-bench-id', nameSnapshot: 'Alex Morgan' },
        { playerId: 'lee-id', nameSnapshot: 'Lee Taylor' },
      ],
      starterIds: ['alex-id'],
      substitutions: [],
    }
    const jerseyAssignment: MatchJerseyAssignment = {
      setId: 'set-id',
      setNameSnapshot: 'Match jerseys',
      rows: [
        { playerId: 'alex-id', jersey: { jerseyId: 'shirt-7', number: 7, size: 'M', ownerPlayerId: null } },
        { playerId: 'alex-bench-id', jersey: { jerseyId: 'shirt-0', number: 0, size: 'S', ownerPlayerId: null } },
        { playerId: 'lee-id', jersey: null },
      ],
    }
    const goal = {
      ...fixtureGoal(),
      scorerPlayerId: 'alex-id',
      scorer: 'Alex match snapshot',
      assist: 'Alex Morgan',
    }
    const { wrapper } = await mountEditor({
      openInitially: true,
      goal,
      participation,
      jerseyAssignment,
    })
    try {
      await flushPromises()
      expect(document.querySelector('[role="dialog"]')).not.toBeNull()
      expect((document.querySelector('[name="scorer"]') as HTMLSelectElement).value).toBe('alex-id')
      expect(document.querySelector('.selected-player-label')?.textContent).toBe('#7 Alex Morgan · alexi')
      expect((document.querySelector('[name="assist"]') as HTMLSelectElement).value).toBe('__manual_name__')
      expect((document.querySelector('#goal-assist-name') as HTMLInputElement).value).toBe('Alex Morgan')
      const options = [...document.querySelectorAll('#goal-scorer-player option')]
      expect(options.map((option) => option.textContent)).toContain('#0 Alex Morgan · alexb')
      expect(options.some((option) => option.getAttribute('value') === 'lee-id')).toBe(true)
    } finally {
      wrapper.unmount()
    }
  })

  it('clears linked roles to manual names when the goal changes to the opponent', async () => {
    const participation: MatchParticipation = {
      ownSide: 'home',
      squad: [{ playerId: 'alex-id', nameSnapshot: 'Alex Match Snapshot' }],
      starterIds: ['alex-id'],
      substitutions: [],
    }
    const goal = { ...fixtureGoal(), scorerPlayerId: 'alex-id', scorer: 'Alex Match Snapshot' }
    const { wrapper } = await mountEditor({ goal, participation })
    try {
      await wrapper.get('.goal-editor-launcher').trigger('click')
      await flushPromises()
      const side = document.querySelector<HTMLSelectElement>('[name="side"]')!
      side.value = 'away'
      side.dispatchEvent(new Event('change', { bubbles: true }))
      await flushPromises()

      const scorer = document.querySelector<HTMLInputElement>('#goal-scorer-name')
      expect(scorer?.value).toBe('Alex Match Snapshot')
      expect(document.querySelector('#goal-scorer-player')).toBeNull()
    } finally {
      wrapper.unmount()
    }
  })

  it('saves, replaces, manually converts, and clears role links from the saved squad only', async () => {
    const participation: MatchParticipation = {
      ownSide: 'home',
      squad: [
        { playerId: 'alex-id', nameSnapshot: 'Alex Morgan' },
        { playerId: 'alex-bench-id', nameSnapshot: 'Alex Morgan' },
        { playerId: 'lee-id', nameSnapshot: 'Lee Taylor' },
      ],
      starterIds: ['alex-id'],
      substitutions: [],
    }
    const { wrapper, records } = await mountEditor({ participation })
    const choose = (name: string, value: string) => {
      const select = document.querySelector<HTMLSelectElement>(`[name="${name}"]`)!
      select.value = value
      select.dispatchEvent(new Event('change', { bubbles: true }))
    }

    try {
      await wrapper.get('.goal-editor-launcher').trigger('click')
      await flushPromises()
      expect(document.querySelectorAll('#goal-scorer-player option')).toHaveLength(5)
      choose('scorer', 'alex-id')
      choose('assist', 'lee-id')
      submitEditor()
      await flushPromises()
      expect(records[0].goals[0]).toMatchObject({
        scorerPlayerId: 'alex-id', scorer: 'Alex Morgan',
        assistPlayerId: 'lee-id', assist: 'Lee Taylor',
      })

      await wrapper.get('.goal-editor-launcher').trigger('click')
      await flushPromises()
      choose('scorer', 'alex-bench-id')
      choose('assist', '__manual_name__')
      await flushPromises()
      const assistInput = document.querySelector<HTMLInputElement>('#goal-assist-name')!
      assistInput.value = 'Guest provider'
      assistInput.dispatchEvent(new Event('input', { bubbles: true }))
      submitEditor()
      await flushPromises()
      expect(records[0].goals[0]).toMatchObject({
        scorerPlayerId: 'alex-bench-id', scorer: 'Alex Morgan',
        assistPlayerId: null, assist: 'Guest provider',
      })

      await wrapper.get('.goal-editor-launcher').trigger('click')
      await flushPromises()
      choose('scorer', '')
      choose('assist', '')
      submitEditor()
      await flushPromises()
      expect(records[0].goals[0]).toMatchObject({
        scorerPlayerId: null, scorer: '', assistPlayerId: null, assist: '',
      })
    } finally {
      wrapper.unmount()
    }
  })

  it('preserves the exact committed goal time when saving details without changing its minute', async () => {
    const goal = { ...fixtureGoal(), period: 2 as const, elapsedMs: 2_846_789, createdAt: 6_543 }
    const { wrapper, records } = await mountEditor({ goal })
    try {
      await wrapper.get('.goal-editor-launcher').trigger('click')
      await flushPromises()
      setInput('scorer', 'Recorded scorer')
      submitEditor()
      await flushPromises()

      expect(records[0].goals[0]).toMatchObject({
        id: goal.id,
        createdAt: goal.createdAt,
        period: 2,
        elapsedMs: goal.elapsedMs,
        scorer: 'Recorded scorer',
      })
    } finally {
      wrapper.unmount()
    }
  })

  it('rejects a now-stale selected identity against the latest committed squad and retains it for correction', async () => {
    const participation: MatchParticipation = {
      ownSide: 'home',
      squad: [
        { playerId: 'alex-id', nameSnapshot: 'Alex Match Snapshot' },
        { playerId: 'sam-id', nameSnapshot: 'Sam Match Snapshot' },
      ],
      starterIds: ['alex-id'],
      substitutions: [],
    }
    const { wrapper, store, records } = await mountEditor({ participation })
    try {
      await wrapper.get('.goal-editor-launcher').trigger('click')
      await flushPromises()
      setSelect('scorer', 'alex-id')
      const latest = store.matches.value[0]
      await store.persist({
        ...latest,
        participation: { ...participation, squad: [participation.squad[1]], starterIds: ['sam-id'] },
        updatedAt: latest.updatedAt + 1,
      })
      await flushPromises()

      submitEditor()
      await flushPromises()
      expect(document.querySelector('[role="alert"]')?.textContent).toContain('belong to the saved match squad')
      expect((document.querySelector('[name="scorer"]') as HTMLSelectElement).value).toBe('alex-id')
      expect(records[0].goals[0].scorerPlayerId).toBeNull()
      expect(store.matches.value[0].goals[0].scorerPlayerId).toBeNull()
    } finally {
      wrapper.unmount()
    }
  })

  it('keeps exact linked selections through a failed save and publishes only after a successful retry', async () => {
    const participation: MatchParticipation = {
      ownSide: 'home',
      squad: [{ playerId: 'alex-id', nameSnapshot: 'Alex Match Snapshot' }],
      starterIds: ['alex-id'],
      substitutions: [],
    }
    const { wrapper, store, records } = await mountEditor({ failNextSave: true, participation })
    try {
      await wrapper.get('.goal-editor-launcher').trigger('click')
      await flushPromises()
      setSelect('scorer', 'alex-id')
      submitEditor()
      await flushPromises()

      expect(document.querySelector('[role="alert"]')?.textContent).toContain('Disk is temporarily unavailable')
      expect((document.querySelector('[name="scorer"]') as HTMLSelectElement).value).toBe('alex-id')
      expect(records[0].goals[0].scorerPlayerId).toBeNull()
      expect(store.matches.value[0].goals[0].scorerPlayerId).toBeNull()

      submitEditor()
      await flushPromises()
      expect(records[0].goals[0]).toMatchObject({ scorerPlayerId: 'alex-id', scorer: 'Alex Match Snapshot' })
      expect(document.querySelector('[role="dialog"]')).toBeNull()
    } finally {
      wrapper.unmount()
    }
  })
})
