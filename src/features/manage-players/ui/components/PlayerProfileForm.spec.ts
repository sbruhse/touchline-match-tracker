import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { PLAYER_POSITIONS } from '../../../../entities/player'
import PlayerProfileForm from './PlayerProfileForm.vue'

describe('PlayerProfileForm', () => {
  it('renders all grouped native position choices with full labels and unique IDs', async () => {
    const draft = { name: 'Alex', positions: ['IV'] as const, jerseySize: '164' }
    const createForm = mount(PlayerProfileForm, {
      props: {
        modelValue: draft,
        idPrefix: 'create-player',
        mode: 'create',
        disabled: false,
      },
    })
    const editForm = mount(PlayerProfileForm, {
      props: {
        modelValue: { name: 'Sam', positions: ['ST'], jerseySize: 'M' },
        idPrefix: 'edit-player-sam',
        mode: 'edit',
        disabled: false,
      },
    })

    expect(createForm.findAll('fieldset legend').map((legend) => legend.text()))
      .toEqual(['Tor', 'Abwehr', 'Mittelfeld', 'Angriff'])
    expect(createForm.findAll('input[type="checkbox"]')).toHaveLength(PLAYER_POSITIONS.length)
    for (const position of PLAYER_POSITIONS) {
      const checkbox = createForm.get(`#create-player-position-${position.code}`)
      expect(checkbox.element.tagName).toBe('INPUT')
      expect(createForm.get(`label[for="create-player-position-${position.code}"]`).text())
        .toContain(position.name)
      expect(createForm.get(`label[for="create-player-position-${position.code}"]`).text())
        .toContain(position.code)
      expect(editForm.find(`#edit-player-sam-position-${position.code}`).exists()).toBe(true)
      expect(editForm.find(`#create-player-position-${position.code}`).exists()).toBe(false)
    }

    await createForm.get('#create-player-position-DM').setValue(true)
    const updates = createForm.emitted('update:modelValue') ?? []
    expect(updates.at(-1)?.[0]).toEqual({ name: 'Alex', positions: ['IV', 'DM'], jerseySize: '164' })
    expect(draft.positions).toEqual(['IV'])
    expect((createForm.get('#create-player-jersey-size').element as HTMLInputElement).value).toBe('164')
    await createForm.get('#create-player-jersey-size').setValue(' S/M ')
    expect(createForm.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({
      name: 'Alex', positions: ['IV'], jerseySize: ' S/M ',
    })
    expect((editForm.get('#edit-player-sam-jersey-size').element as HTMLInputElement).value).toBe('M')
    expect((editForm.get('#edit-player-sam-position-ST').element as HTMLInputElement).checked).toBe(true)
    expect((editForm.get('#edit-player-sam-position-DM').element as HTMLInputElement).checked).toBe(false)
    expect(createForm.find('button[type="submit"]').text()).toBe('Add player')
    expect(editForm.find('button[type="submit"]').text()).toBe('Save profile')
    expect(editForm.find('button[type="button"]').text()).toBe('Cancel')
  })
})
