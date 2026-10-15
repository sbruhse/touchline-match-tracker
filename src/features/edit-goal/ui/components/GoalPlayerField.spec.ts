import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { GoalPlayerDraft, GoalPlayerOption } from '../../model/goalPlayerDraft'
import GoalPlayerField from './GoalPlayerField.vue'

const players: GoalPlayerOption[] = [
  { playerId: 'alex-starter', name: 'Alex Morgan', label: '#7 Alex Morgan · starter' },
  { playerId: 'alex-bench', name: 'Alex Morgan', label: '#0 Alex Morgan · bench' },
  { playerId: 'lee-unnumbered', name: 'Lee Taylor', label: 'Lee Taylor · bench' },
]

function mountField(options: {
  role?: 'scorer' | 'assist'
  value?: GoalPlayerDraft
  hasSquadChoices?: boolean
  disabled?: boolean
  error?: string | null
} = {}) {
  return mount(GoalPlayerField, {
    props: {
      role: options.role ?? 'scorer',
      value: options.value ?? { mode: 'none' },
      players,
      hasSquadChoices: options.hasSquadChoices ?? true,
      disabled: options.disabled ?? false,
      error: options.error ?? null,
    },
  })
}

describe('GoalPlayerField', () => {
  it('renders distinct optional scorer and assist controls with independent selection IDs', () => {
    const scorer = mountField({ role: 'scorer' })
    const assist = mountField({ role: 'assist' })

    expect(scorer.get('label').text()).toContain('Scorer')
    expect(assist.get('label').text()).toContain('Assist')
    expect(scorer.get('select').attributes('id')).toBe('goal-scorer-player')
    expect(assist.get('select').attributes('id')).toBe('goal-assist-player')
    expect(scorer.get('select').attributes('name')).toBe('scorer')
    expect(assist.get('select').attributes('name')).toBe('assist')
    scorer.unmount()
    assist.unmount()
  })

  it('offers number-first starter, bench, zero, and unnumbered options and emits a stable identity', async () => {
    const wrapper = mountField()
    const options = wrapper.findAll('select option').map((option) => option.text())
    expect(options).toEqual([
      'No scorer selected',
      '#7 Alex Morgan · starter',
      '#0 Alex Morgan · bench',
      'Lee Taylor · bench',
      'Enter a name manually',
    ])

    await wrapper.get('select').setValue('alex-bench')
    expect(wrapper.emitted('update')).toEqual([[
      { mode: 'squad', playerId: 'alex-bench', name: 'Alex Morgan', label: '#0 Alex Morgan · bench' },
    ]])
  })

  it('shows the complete selected label in wrapping context', () => {
    const longLabel = '#12 Alex Morgan with an exceptionally long match-day name · bench identity'
    const wrapper = mountField({
      value: { mode: 'squad', playerId: 'long-player', name: 'Alex Morgan', label: longLabel },
    })

    expect(wrapper.get('.selected-player-label').text()).toBe(longLabel)
    expect(wrapper.get('.selected-player-label').attributes('class')).toContain('selected-player-label')
  })

  it('switches between empty, player and manual-name modes while keeping typed manual text', async () => {
    const wrapper = mountField({ value: { mode: 'manual', name: 'Typed name' } })
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('Typed name')

    await wrapper.get('select').setValue('')
    expect(wrapper.emitted('update')?.at(-1)).toEqual([{ mode: 'none' }])
    await wrapper.get('select').setValue('__manual_name__')
    expect(wrapper.emitted('update')?.at(-1)).toEqual([{ mode: 'manual', name: 'Typed name' }])
    await wrapper.get('input').setValue('Changed manually')
    expect(wrapper.emitted('update')?.at(-1)).toEqual([{ mode: 'manual', name: 'Changed manually' }])
  })

  it('renders direct manual entry without a squad selector', async () => {
    const wrapper = mountField({ hasSquadChoices: false, role: 'assist' })
    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.get('label').text()).toContain('Assist')
    expect(wrapper.get('input').attributes('aria-label')).toBe('Assist name')
    await wrapper.get('input').setValue('Opponent assist')
    expect(wrapper.emitted('update')).toEqual([[{ mode: 'manual', name: 'Opponent assist' }]])
  })

  it('associates independent errors and disabled state with its own role', () => {
    const wrapper = mountField({ role: 'assist', disabled: true, error: 'Choose a valid saved-squad player.' })
    const select = wrapper.get('select')
    expect(select.attributes('disabled')).toBeDefined()
    expect(select.attributes('aria-invalid')).toBe('true')
    expect(select.attributes('aria-describedby')).toBe('goal-assist-error')
    expect(wrapper.get('#goal-assist-error').text()).toContain('saved-squad player')
  })
})
