import { describe, expect, it } from 'vitest'
import { createPlayerIdentityLabels } from './playerIdentityLabels'

describe('player identity labels', () => {
  it('keeps unique names plain and distinguishes same names by a stable ID suffix', () => {
    const labels = createPlayerIdentityLabels([
      { id: 'player-one', name: 'Alex' },
      { id: 'player-two', name: 'Alex' },
      { id: 'player-three', name: 'Sam' },
    ])

    expect(labels.get('player-three')).toBe('Sam')
    expect(labels.get('player-one')).toBe('Alex · playero')
    expect(labels.get('player-two')).toBe('Alex · playert')
  })

  it('extends colliding short ID prefixes until same-name labels differ', () => {
    const labels = createPlayerIdentityLabels([
      { id: 'abcd-one', name: 'Alex' },
      { id: 'abcd-two', name: 'Alex' },
    ])

    expect(labels.get('abcd-one')).toBe('Alex · abcdo')
    expect(labels.get('abcd-two')).toBe('Alex · abcdt')
    expect(new Set(labels.values()).size).toBe(2)
  })

  it('falls back to original IDs when their compact forms collide completely', () => {
    const labels = createPlayerIdentityLabels([
      { id: 'id-a', name: 'Alex' },
      { id: 'ida', name: 'Alex' },
    ])

    expect(labels.get('id-a')).toBe('Alex · id-a')
    expect(labels.get('ida')).toBe('Alex · ida')
    expect(new Set(labels.values()).size).toBe(2)
  })
})
