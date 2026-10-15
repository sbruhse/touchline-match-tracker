import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PlayerStatisticsSummary from './PlayerStatisticsSummary.vue'

describe('PlayerStatisticsSummary', () => {
  it('labels all four metrics and explains goal-credit coverage', () => {
    const wrapper = mount(PlayerStatisticsSummary, {
      props: { totalElapsedMs: 0, appearanceCount: 0, goalCount: 0, assistCount: 0 },
    })

    expect(wrapper.get('[aria-label="Player totals"]').text()).toContain('Playing time')
    expect(wrapper.get('[aria-label="Player totals"]').text()).toContain('Appearances')
    expect(wrapper.get('[aria-label="Player totals"]').text()).toContain('Goals')
    expect(wrapper.get('[aria-label="Player totals"]').text()).toContain('Assists')
    expect(wrapper.get('[data-testid="total-playing-time"]').text()).toBe('00:00')
    expect(wrapper.get('[data-testid="appearance-count"]').text()).toBe('0')
    expect(wrapper.get('[data-testid="goal-count"]').text()).toBe('0')
    expect(wrapper.get('[data-testid="assist-count"]').text()).toBe('0')
    expect(wrapper.get('.statistics-goal-note').text()).toContain('explicit player links')
    expect(wrapper.get('.statistics-goal-note').text()).toContain('Name-only goals and unstarted matches are excluded')
  })
})
