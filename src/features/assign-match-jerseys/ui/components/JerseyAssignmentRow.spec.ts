import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import JerseyAssignmentRow from './JerseyAssignmentRow.vue'
import type { JerseyAssignmentRowView } from '../types'

function row(overrides: Partial<JerseyAssignmentRowView> = {}): JerseyAssignmentRowView {
  return {
    playerId: 'alex',
    nameSnapshot: 'Alex with a long match-day name',
    playerSize: 'M',
    jerseyId: 'removed-jersey',
    jerseySnapshot: { jerseyId: 'removed-jersey', number: 0, size: 'M', ownerPlayerId: null },
    error: 'The selected jersey is no longer available.',
    ...overrides,
  }
}

describe('JerseyAssignmentRow', () => {
  it('shows the draft number before the name, including zero, for a stale selection', async () => {
    const wrapper = mount(JerseyAssignmentRow, {
      props: {
        row: row(),
        playerLabel: 'Alex with a long match-day name · alex',
        jerseyOptions: [{ id: 'current', label: 'Number 4, size M', ownerLabel: 'Team' }],
        disabled: false,
      },
    })

    const heading = wrapper.get('.assignment-player')
    expect(heading.text().indexOf('#0')).toBeLessThan(heading.text().indexOf('Alex with a long'))
    expect(wrapper.get('select option:disabled').text()).toContain('number 0, size M')
    expect(wrapper.get('.assignment-error').text()).toContain('no longer available')

    await wrapper.get('select').setValue('')
    expect(wrapper.emitted('selectJersey')).toEqual([[{ playerId: 'alex', jerseyId: null }]])
  })

  it('shows an explicit unassigned state without inventing a number', async () => {
    const wrapper = mount(JerseyAssignmentRow, {
      props: {
        row: row({ jerseyId: null, jerseySnapshot: null, error: 'No eligible jersey is available.' }),
        playerLabel: 'Alex with a long match-day name',
        jerseyOptions: [],
        disabled: false,
      },
    })

    expect(wrapper.get('.assignment-player').text()).toContain('Unassigned')
    expect(wrapper.get('.assignment-player').text()).toContain('Alex with a long match-day name')
    expect(wrapper.get('.assignment-player').text()).not.toContain('#')
    expect(wrapper.get('select').attributes('aria-describedby')).toBe('jersey-for-alex-error')
  })
})
