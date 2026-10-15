import { describe, expect, it } from 'vitest'
import {
  normalizeJersey,
  normalizeJerseyNumber,
  normalizeJerseyNumberPreference,
  normalizeJerseySet,
  normalizeJerseySets,
  normalizeOwnerPlayerId,
  normalizeJerseySize,
  type JerseySet,
} from './jerseySet'

function jerseySet(overrides: Partial<JerseySet> = {}): JerseySet {
  return {
    id: 'set-home',
    name: ' Home ',
    jerseys: [],
    preferredNumbers: [],
    createdAt: 100,
    updatedAt: 200,
    ...overrides,
  }
}

describe('jersey set validators', () => {
  it('accepts zero, flexible trimmed sizes, team ownership, and independently identified duplicate jerseys', () => {
    const jerseys = [
      { id: 'jersey-one', number: 0, size: ' 164 ', ownerPlayerId: null },
      { id: 'jersey-two', number: 0, size: '164', ownerPlayerId: null },
      { id: 'jersey-three', number: 7, size: ' S/M ', ownerPlayerId: 'player-alex' },
    ]
    const sets = normalizeJerseySets([jerseySet({ jerseys })])

    expect(normalizeJerseyNumber(0)).toBe(0)
    expect(normalizeJerseySize('  M  ')).toBe('M')
    expect(normalizeOwnerPlayerId(null)).toBeNull()
    expect(sets[0]).toMatchObject({ id: 'set-home', name: 'Home' })
    expect(sets[0].jerseys).toEqual([
      { id: 'jersey-one', number: 0, size: '164', ownerPlayerId: null },
      { id: 'jersey-two', number: 0, size: '164', ownerPlayerId: null },
      { id: 'jersey-three', number: 7, size: 'S/M', ownerPlayerId: 'player-alex' },
    ])
    expect(new Set(sets[0].jerseys.map(({ id }) => id)).size).toBe(3)
  })

  it('normalizes preference values and rejects invalid numbers, sizes, and owner IDs', () => {
    expect(normalizeJerseyNumberPreference({ playerId: ' player-one ', number: 0 }))
      .toEqual({ playerId: 'player-one', number: 0 })
    expect(normalizeJersey({ id: ' jersey ', number: 7, size: ' L ', ownerPlayerId: ' player-one ' }))
      .toEqual({ id: 'jersey', number: 7, size: 'L', ownerPlayerId: 'player-one' })

    for (const number of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '7', null]) {
      expect(() => normalizeJerseyNumber(number)).toThrow('nonnegative whole number')
    }
    expect(() => normalizeJerseySize('  ')).toThrow('Jersey size is required')
    expect(() => normalizeOwnerPlayerId('  ')).toThrow('Owner player ID is required')
    expect(() => normalizeOwnerPlayerId(4)).toThrow('Owner player ID is required')
    expect(() => normalizeJersey({ id: 'one', number: 7, size: 'M' })).toThrow('Owner player ID is required')
  })

  it('rejects malformed aggregate fields and duplicate set, jersey, and preference identities', () => {
    expect(() => normalizeJerseySets({})).toThrow('Jersey sets must be an array')
    expect(() => normalizeJerseySets([jerseySet(), jerseySet()])).toThrow('Duplicate jersey set ID')
    expect(() => normalizeJerseySets([jerseySet({ jerseys: [
      { id: 'same', number: 7, size: 'M', ownerPlayerId: null },
    ] }), jerseySet({ id: 'other-set', jerseys: [
      { id: 'same', number: 8, size: 'L', ownerPlayerId: null },
    ] })])).toThrow('Duplicate jersey ID')
    expect(() => normalizeJerseySet({
      ...jerseySet(),
      preferredNumbers: [
        { playerId: 'same-player', number: 7 },
        { playerId: 'same-player', number: 12 },
      ],
    })).toThrow('duplicate preferred-number player ID')
    expect(() => normalizeJerseySets([jerseySet({ createdAt: Number.NaN })])).toThrow('createdAt must be a finite number')
    expect(() => normalizeJerseySets([jerseySet({ jerseys: 'not an array' as never })])).toThrow('jerseys must be an array')
    expect(() => normalizeJerseySets([jerseySet({ name: '  ' })])).toThrow('name is required')
  })

  it('copies the aggregate, nested items, and preferences instead of retaining caller arrays', () => {
    const jersey = { id: 'jersey-one', number: 7, size: 'M', ownerPlayerId: null }
    const preference = { playerId: 'player-one', number: 7 }
    const jerseys = [jersey]
    const preferences = [preference]
    const input = jerseySet({ jerseys, preferredNumbers: preferences })
    const normalized = normalizeJerseySets([input])[0]

    expect(normalized).not.toBe(input)
    expect(normalized.jerseys).not.toBe(jerseys)
    expect(normalized.jerseys[0]).not.toBe(jersey)
    expect(normalized.preferredNumbers).not.toBe(preferences)
    expect(normalized.preferredNumbers[0]).not.toBe(preference)
    jerseys[0].number = 12
    preferences[0].number = 12
    expect(normalized.jerseys[0].number).toBe(7)
    expect(normalized.preferredNumbers[0].number).toBe(7)
  })
})
