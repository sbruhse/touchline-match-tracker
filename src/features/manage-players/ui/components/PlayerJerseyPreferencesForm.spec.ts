import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { parsePreferredNumberDraft } from '../../lib/parsePreferredNumberDraft'
import PlayerJerseyPreferencesForm from './PlayerJerseyPreferencesForm.vue'

describe('PlayerJerseyPreferencesForm', () => {
  it('renders one labelled controlled field per set and preserves independent drafts', async () => {
    const draft = [
      { setId: 'blue-one', label: 'Blue · blue', value: '007' },
      { setId: 'blue-two', label: 'Blue · blue2', value: '' },
    ]
    const wrapper = mount(PlayerJerseyPreferencesForm, {
      props: {
        modelValue: draft,
        idPrefix: 'preferred-player-alex',
        disabled: false,
        saving: false,
        error: null,
        errorSetId: null,
      },
    })

    expect(wrapper.findAll('.preference-field')).toHaveLength(2)
    expect(wrapper.get('label[for="preferred-player-alex-blue-one"]').text()).toBe('Preferred number for Blue · blue')
    expect(wrapper.get('label[for="preferred-player-alex-blue-two"]').text()).toBe('Preferred number for Blue · blue2')
    expect((wrapper.get('#preferred-player-alex-blue-one').element as HTMLInputElement).value).toBe('007')
    expect((wrapper.get('#preferred-player-alex-blue-two').element as HTMLInputElement).value).toBe('')

    await wrapper.get('#preferred-player-alex-blue-one').setValue('0')
    const updated = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as typeof draft
    expect(updated).toEqual([
      { setId: 'blue-one', label: 'Blue · blue', value: '0' },
      { setId: 'blue-two', label: 'Blue · blue2', value: '' },
    ])
    expect(draft[0].value).toBe('007')
    await wrapper.get('#preferred-player-alex-blue-one').setValue('')
    expect((wrapper.emitted('update:modelValue')?.at(-1)?.[0] as typeof draft)[0].value).toBe('')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toHaveLength(1)
    await wrapper.get('.cancel-button').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('announces and associates an invalid set-specific draft', () => {
    const wrapper = mount(PlayerJerseyPreferencesForm, {
      props: {
        modelValue: [{ setId: 'home', label: 'Home', value: '1.5' }],
        idPrefix: 'preferred-player-one',
        disabled: false,
        saving: false,
        error: 'Enter a whole number using digits 0–9, or leave the field blank.',
        errorSetId: 'home',
      },
    })

    const input = wrapper.get('#preferred-player-one-home')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes('aria-describedby')).toBe('preferred-player-one-home-error')
    expect(wrapper.get('#preferred-player-one-home-error').attributes('role')).toBe('alert')
  })

  it('explains the prerequisite when no sets exist and normalizes optional decimal-digit inputs', () => {
    const wrapper = mount(PlayerJerseyPreferencesForm, {
      props: {
        modelValue: [],
        idPrefix: 'preferred-player-one',
        disabled: false,
        saving: false,
        error: null,
        errorSetId: null,
      },
    })

    expect(wrapper.get('.no-preference-sets').text()).toContain('Create a jersey set before')
    expect(wrapper.find('button[type="submit"]').exists()).toBe(false)
    expect(parsePreferredNumberDraft('')).toBeNull()
    expect(parsePreferredNumberDraft('  ')).toBeNull()
    expect(parsePreferredNumberDraft('007')).toBe(7)
    expect(parsePreferredNumberDraft('0')).toBe(0)
    for (const invalid of ['-1', '1.5', '1e2', 'seven', '9007199254740992']) {
      expect(() => parsePreferredNumberDraft(invalid)).toThrow()
    }
  })
})
