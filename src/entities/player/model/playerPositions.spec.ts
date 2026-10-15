import { describe, expect, it } from 'vitest'
import { normalizePlayerPositions, PLAYER_POSITIONS } from './playerPositions'

describe('player positions', () => {
  it('accepts empty and complete selections', () => {
    expect(normalizePlayerPositions([])).toEqual([])
    expect(normalizePlayerPositions(PLAYER_POSITIONS.map(({ code }) => code)))
      .toEqual(PLAYER_POSITIONS.map(({ code }) => code))
  })

  it('deduplicates and returns selections in catalogue order without changing input', () => {
    const input = ['DM', 'IV', 'DM']

    const normalized = normalizePlayerPositions(input)

    expect(normalized).toEqual(['IV', 'DM'])
    expect(normalized).not.toBe(input)
    expect(input).toEqual(['DM', 'IV', 'DM'])
    expect(normalizePlayerPositions(input)).not.toBe(normalized)
  })

  it.each([
    null,
    'IV',
    ['INVALID'],
    ['IV', 4],
    [{}],
  ])('rejects malformed or unknown selections: %j', (input) => {
    expect(() => normalizePlayerPositions(input)).toThrow()
  })
})
