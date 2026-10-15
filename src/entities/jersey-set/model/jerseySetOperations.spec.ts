import { describe, expect, it } from 'vitest'
import {
  addJersey,
  addJerseySet,
  removeJersey,
  removeJerseySet,
  renameJerseySet,
  updateJersey,
  updatePlayerSetNumbers,
} from './jerseySetOperations'

const teamJersey = (number: number, size = 'M', ownerPlayerId: string | null = null) => ({
  number,
  size,
  ownerPlayerId,
})

describe('jersey set operations', () => {
  it('creates distinct same-name sets and renames without changing set identity or children', () => {
    const first = addJerseySet([], 'Blue', 100, 'blue-one')
    const withItem = addJersey(first, 'blue-one', teamJersey(7), 110, 'blue-jersey')
    const withPreference = updatePlayerSetNumbers(withItem, 'alex', [{ setId: 'blue-one', number: 12 }], 120)
    const both = addJerseySet(withPreference, 'Blue', 130, 'blue-two')
    const renamed = renameJerseySet(both, 'blue-one', ' Home Blue ', 140)

    expect(renamed.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'blue-one', name: 'Home Blue' },
      { id: 'blue-two', name: 'Blue' },
    ])
    expect(renamed[0]).toMatchObject({
      id: 'blue-one',
      jerseys: [{ id: 'blue-jersey', number: 7 }],
      preferredNumbers: [{ playerId: 'alex', number: 12 }],
      createdAt: 100,
      updatedAt: 140,
    })
    expect(renamed[1].id).toBe('blue-two')
  })

  it('targets repeated and otherwise identical jerseys independently by stable identity', () => {
    const one = addJerseySet([], 'Home', 100, 'home')
    const two = addJersey(one, 'home', teamJersey(7), 110, 'jersey-one')
    const three = addJersey(two, 'home', teamJersey(7), 120, 'jersey-two')
    const updated = updateJersey(three, 'home', 'jersey-two', teamJersey(7, 'L', 'alex'), 130)

    expect(updated[0].jerseys).toEqual([
      { id: 'jersey-one', number: 7, size: 'M', ownerPlayerId: null },
      { id: 'jersey-two', number: 7, size: 'L', ownerPlayerId: 'alex' },
    ])
    expect(three[0].jerseys[1]).toEqual({ id: 'jersey-two', number: 7, size: 'M', ownerPlayerId: null })
    const removed = removeJersey(updated, 'home', 'jersey-one', 140)
    expect(removed[0].jerseys).toEqual([{ id: 'jersey-two', number: 7, size: 'L', ownerPlayerId: 'alex' }])
    expect(() => updateJersey(removed, 'home', 'jersey-one', teamJersey(8))).toThrow('was not found')
    expect(() => removeJersey(removed, 'missing-set', 'jersey-two')).toThrow('no longer exists')
  })

  it('allows shared and unstocked preferences, clears only submitted pairs, and preserves unrelated data', () => {
    let sets = addJerseySet([], 'Blue', 100, 'blue')
    sets = addJerseySet(sets, 'White', 110, 'white')
    sets = addJersey(sets, 'blue', teamJersey(7), 120, 'blue-seven')
    sets = updatePlayerSetNumbers(sets, 'alex', [
      { setId: 'blue', number: 20 },
      { setId: 'white', number: 0 },
    ], 130)
    sets = updatePlayerSetNumbers(sets, 'ben', [{ setId: 'blue', number: 20 }], 140)

    expect(sets[0].preferredNumbers).toEqual([
      { playerId: 'alex', number: 20 },
      { playerId: 'ben', number: 20 },
    ])
    expect(sets[1].preferredNumbers).toEqual([{ playerId: 'alex', number: 0 }])
    const cleared = updatePlayerSetNumbers(sets, 'alex', [{ setId: 'blue', number: null }], 150)
    expect(cleared[0].preferredNumbers).toEqual([{ playerId: 'ben', number: 20 }])
    expect(cleared[1].preferredNumbers).toEqual([{ playerId: 'alex', number: 0 }])
    expect(cleared[0].jerseys).toEqual(sets[0].jerseys)
  })

  it('rejects an invalid or stale multi-set preference edit without changing the input', () => {
    let sets = addJerseySet([], 'Home', 100, 'home')
    sets = addJerseySet(sets, 'Away', 110, 'away')
    sets = updatePlayerSetNumbers(sets, 'alex', [{ setId: 'home', number: 7 }], 120)
    const before = structuredClone(sets)

    expect(() => updatePlayerSetNumbers(sets, 'alex', [
      { setId: 'home', number: 12 },
      { setId: 'removed-set', number: 20 },
    ], 130)).toThrow('no longer exists')
    expect(() => updatePlayerSetNumbers(sets, 'alex', [
      { setId: 'home', number: 12 },
      { setId: 'away', number: -1 },
    ], 130)).toThrow('nonnegative whole number')
    expect(() => updatePlayerSetNumbers(sets, 'alex', [
      { setId: 'home', number: 12 },
      { setId: 'home', number: 20 },
    ], 130)).toThrow('Duplicate preference update')
    expect(sets).toEqual(before)
    expect(sets[0].preferredNumbers).toEqual([{ playerId: 'alex', number: 7 }])
  })

  it('removes a set together with its jerseys and preferences but keeps other sets intact', () => {
    let sets = addJerseySet([], 'Home', 100, 'home')
    sets = addJerseySet(sets, 'Away', 110, 'away')
    sets = addJersey(sets, 'home', teamJersey(7), 120, 'home-seven')
    sets = updatePlayerSetNumbers(sets, 'alex', [
      { setId: 'home', number: 7 },
      { setId: 'away', number: 12 },
    ], 130)
    const removed = removeJerseySet(sets, 'home')

    expect(removed).toHaveLength(1)
    expect(removed[0]).toMatchObject({
      id: 'away',
      jerseys: [],
      preferredNumbers: [{ playerId: 'alex', number: 12 }],
    })
    expect(sets[0]).toMatchObject({ id: 'home', jerseys: [{ id: 'home-seven' }], preferredNumbers: [{ playerId: 'alex' }] })
    expect(() => removeJerseySet(removed, 'home')).toThrow('no longer exists')
  })
})
