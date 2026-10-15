import { describe, expect, it } from 'vitest'
import {
  compareAdultSizeLabels,
  getAdultSizeRank,
  isAdultSizeExactOrOneLarger,
} from './adultSize'

describe('adult jersey size ranking', () => {
  it('ranks adjacent adult sizes independently of available stock', () => {
    const sizes = ['3XS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '4XL', '5XL']
    const ranks = sizes.map(getAdultSizeRank)
    expect(ranks.every((rank) => rank !== null)).toBe(true)
    expect(ranks).toEqual([...ranks].sort((left, right) => Number(left! - right!)))
    expect(compareAdultSizeLabels('M', 'L')).toBe(-1)
    expect(compareAdultSizeLabels('L', 'XL')).toBe(-1)
    expect(compareAdultSizeLabels('XXL', 'XXXL')).toBe(-1)
  })

  it('normalizes surrounding whitespace and case for comparison without changing labels', () => {
    const playerSize = '  m '
    const jerseySize = ' L  '
    expect(getAdultSizeRank(playerSize)).toBe(getAdultSizeRank('M'))
    expect(compareAdultSizeLabels(playerSize, jerseySize)).toBe(-1)
    expect(playerSize).toBe('  m ')
    expect(jerseySize).toBe(' L  ')
  })

  it('treats repeated-X and positive numeric extensions as aliases', () => {
    for (const [repeated, numeric] of [
      ['XS', '1XS'], ['XXS', '2XS'], ['XXXS', '3XS'], ['XXXXS', '4XS'],
      ['XL', '1XL'], ['XXL', '2XL'], ['XXXL', '3XL'], ['XXXXL', '4XL'],
      ['XXXXXXXXXXXXL', '12XL'],
    ]) {
      expect(compareAdultSizeLabels(repeated, numeric)).toBe(0)
    }
    expect(compareAdultSizeLabels('2XL', '3XL')).toBe(-1)
    expect(getAdultSizeRank('9007199254740992XL')).toBeNull()
  })

  it('does not guess adult ranks for youth, combined, blank, or unknown labels', () => {
    for (const label of ['164', 'S/M', '', '  ', 'XXS/XS', 'unknown', '0XL']) {
      expect(getAdultSizeRank(label)).toBeNull()
      expect(compareAdultSizeLabels(label, 'M')).toBeNull()
      expect(isAdultSizeExactOrOneLarger('M', label)).toBe(false)
    }
  })

  it('allows only an exact fit or one step larger for automatic matching', () => {
    expect(isAdultSizeExactOrOneLarger('M', 'M')).toBe(true)
    expect(isAdultSizeExactOrOneLarger('M', 'L')).toBe(true)
    expect(isAdultSizeExactOrOneLarger('M', 'S')).toBe(false)
    expect(isAdultSizeExactOrOneLarger('M', 'XL')).toBe(false)
  })
})
