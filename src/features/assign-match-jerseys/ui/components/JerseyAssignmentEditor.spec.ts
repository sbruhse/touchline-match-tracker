import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { MatchJerseyAssignment } from '../../../../entities/match'
import type { Jersey, JerseySet } from '../../../../entities/jersey-set'
import JerseyAssignmentEditor from './JerseyAssignmentEditor.vue'
import JerseyAssignmentSummary from './JerseyAssignmentSummary.vue'
import type { JerseyAssignmentRowView } from '../types'

const sets: Pick<JerseySet, 'id' | 'name'>[] = [
  { id: 'blue-one', name: 'Blue kit' },
  { id: 'blue-two', name: 'Blue kit' },
]

const jerseys: Jersey[] = [
  { id: 'stock-seven-a', number: 7, size: 'M', ownerPlayerId: null },
  { id: 'stock-seven-b', number: 7, size: 'M', ownerPlayerId: null },
  { id: 'manual-xl', number: 99, size: '164', ownerPlayerId: 'ben' },
]

const rows: JerseyAssignmentRowView[] = [
  {
    playerId: 'alex-a',
    nameSnapshot: 'Alex with a name long enough to wrap across a narrow phone screen',
    playerSize: 'M',
    jerseyId: null,
    jerseySnapshot: null,
    error: 'No eligible unclaimed jersey is available for this player.',
  },
  {
    playerId: 'alex-b',
    nameSnapshot: 'Alex with a name long enough to wrap across a narrow phone screen',
    playerSize: 'M',
    jerseyId: 'stock-seven-a',
    jerseySnapshot: { jerseyId: 'stock-seven-a', number: 7, size: 'M', ownerPlayerId: null },
    error: null,
  },
]

function editorProps() {
  return {
    sets,
    selectedSetId: 'blue-one',
    rows,
    jerseys,
    ownerPlayers: [
      { id: 'ben', name: 'Ben' },
      { id: 'alex-a', name: rows[0].nameSnapshot },
      { id: 'alex-b', name: rows[1].nameSnapshot },
    ],
    proposalExists: true,
    disabled: false,
    navigationDisabled: false,
    activeStep: true,
    saveLabel: 'Accept assignments',
    cancelLabel: 'Cancel',
    dataUnavailable: false,
    message: null,
  }
}

describe('jersey assignment editor components', () => {
  it('labels sets, players and physical jerseys, offers manual overrides, and emits explicit actions', async () => {
    const wrapper = mount(JerseyAssignmentEditor, { props: editorProps() })

    expect(wrapper.text()).toContain('Draft · not saved')
    expect(wrapper.text()).toContain('Replace draft with a new proposal')
    expect(wrapper.findAll('.assignment-player').map((legend) => legend.text())).toEqual([
      expect.stringContaining('Alex with a name long enough to wrap across a narrow phone screen'),
      expect.stringContaining('Alex with a name long enough to wrap across a narrow phone screen'),
    ])
    expect(wrapper.findAll('.assignment-player')[0].text()).not.toBe(wrapper.findAll('.assignment-player')[1].text())

    const setPicker = wrapper.get('#jersey-assignment-set')
    expect(setPicker.element.getAttribute('aria-label')).toBeNull()
    expect(wrapper.find('label[for="jersey-assignment-set"]').text()).toBe('Jersey set')
    expect(wrapper.findAll('#jersey-assignment-set option').map((option) => option.text())).toEqual([
      'Select a set',
      expect.stringContaining('Blue kit ·'),
      expect.stringContaining('Blue kit ·'),
    ])
    await setPicker.setValue('blue-two')
    expect(wrapper.emitted('selectSet')).toEqual([['blue-two']])

    const alexSelect = wrapper.get('#jersey-for-alex-a')
    expect(alexSelect.attributes('aria-invalid')).toBe('true')
    expect(alexSelect.attributes('aria-describedby')).toBe('jersey-for-alex-a-error')
    expect(wrapper.get('#jersey-for-alex-a-error').text()).toContain('No eligible unclaimed jersey')
    const options = wrapper.findAll('#jersey-for-alex-a option').map((option) => option.text())
    expect(options).toContain('No jersey selected')
    expect(options.filter((label) => label.includes('Number 7, size M'))).toHaveLength(2)
    expect(new Set(options.filter((label) => label.includes('Number 7, size M')).map((label) => label.split(' — ')[0])).size)
      .toBe(2)
    expect(options).toContain('Number 99, size 164 — Owned by Ben')

    await alexSelect.setValue('manual-xl')
    expect(wrapper.emitted('selectJersey')).toEqual([[{ playerId: 'alex-a', jerseyId: 'manual-xl' }]])
    await wrapper.get('button.generate-button').trigger('click')
    await wrapper.get('button.accept-button').trigger('click')
    await wrapper.get('button.cancel-button').trigger('click')
    expect(wrapper.emitted('generate')).toHaveLength(1)
    expect(wrapper.emitted('accept')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('renders accepted snapshots and partial rows without needing live inventory', () => {
    const assignment: MatchJerseyAssignment = {
      setId: 'removed-set',
      setNameSnapshot: 'A saved set name that remains visible after inventory removal',
      rows: [
        {
          playerId: 'alex-a',
          jersey: { jerseyId: 'removed-shirt', number: 0, size: 'XL', ownerPlayerId: 'missing-owner' },
        },
        { playerId: 'alex-b', jersey: null },
      ],
    }
    const wrapper = mount(JerseyAssignmentSummary, {
      props: {
        assignment,
        squad: rows.map(({ playerId, nameSnapshot }) => ({ playerId, nameSnapshot })),
        ownerPlayers: [],
      },
    })

    expect(wrapper.get('.saved-state').text()).toBe('Saved')
    expect(wrapper.text()).toContain(assignment.setNameSnapshot)
    expect(wrapper.findAll('.wearer-name')).toHaveLength(2)
    expect(wrapper.findAll('.wearer-name')[0].text()).not.toBe(wrapper.findAll('.wearer-name')[1].text())
    const firstWearerHeading = wrapper.findAll('.wearer-name')[0].text()
    expect(firstWearerHeading.indexOf('#0')).toBeLessThan(firstWearerHeading.indexOf('Alex with a name'))
    expect(wrapper.text()).toContain('Size XL · Owned by Unavailable player')
    expect(wrapper.text()).toContain('No jersey assigned')

    const noAssignment = mount(JerseyAssignmentSummary, {
      props: { assignment: null, squad: [], ownerPlayers: [] },
    })
    expect(noAssignment.text()).toContain('No jersey distribution was accepted for this match.')
    expect(noAssignment.find('.saved-state').exists()).toBe(false)

    const completeAssignment: MatchJerseyAssignment = {
      ...assignment,
      rows: assignment.rows.map((row) => ({
        ...row,
        jersey: row.jersey ?? { jerseyId: `completed-${row.playerId}`, number: 12, size: 'M', ownerPlayerId: null },
      })),
    }
    const completeSummary = mount(JerseyAssignmentSummary, {
      props: {
        assignment: completeAssignment,
        squad: rows.map(({ playerId, nameSnapshot }) => ({ playerId, nameSnapshot })),
        ownerPlayers: [],
      },
    })
    expect(completeSummary.get('.saved-state').text()).toBe('Saved')
    expect(completeSummary.text()).not.toContain('No jersey assigned')
  })
})
