import { describe, expect, it } from 'vitest'
import { createJerseyIdentityLabels, createJerseySetIdentityLabels } from './identityLabels'

describe('jersey inventory identity labels', () => {
  it('distinguishes same-name sets when their short IDs collide', () => {
    const labels = createJerseySetIdentityLabels([
      { id: 'abcd-home', name: 'Home' },
      { id: 'abcd-away', name: 'Home' },
      { id: 'white', name: 'Away' },
    ])

    expect(labels.get('white')).toBe('Away')
    expect(labels.get('abcd-home')).toBe('Home · abcdh')
    expect(labels.get('abcd-away')).toBe('Home · abcda')
    expect(new Set(labels.values()).size).toBe(3)
  })

  it('gives otherwise identical jerseys distinct stable labels', () => {
    const labels = createJerseyIdentityLabels([
      { id: 'jersey-one', number: 7, size: 'M' },
      { id: 'jersey-two', number: 7, size: 'M' },
      { id: 'jersey-three', number: 7, size: 'L' },
    ])

    expect(labels.get('jersey-three')).toBe('Number 7, size L')
    expect(labels.get('jersey-one')).toBe('Number 7, size M · jerseyo')
    expect(labels.get('jersey-two')).toBe('Number 7, size M · jerseyt')
    expect(new Set(labels.values()).size).toBe(3)
  })

  it('uses complete original IDs when compact ID candidates are identical', () => {
    const labels = createJerseySetIdentityLabels([
      { id: 'a-b', name: 'Home' },
      { id: 'ab', name: 'Home' },
    ])

    expect(labels.get('a-b')).toBe('Home · a-b')
    expect(labels.get('ab')).toBe('Home · ab')
  })
})
