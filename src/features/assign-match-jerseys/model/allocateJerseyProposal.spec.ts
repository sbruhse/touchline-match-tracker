import { describe, expect, it } from 'vitest'
import { allocateJerseyProposal, type JerseyAssignmentPlayer, type JerseyAssignmentStock } from './allocateJerseyProposal'

const player = (id: string, size: string | null): JerseyAssignmentPlayer => ({ id, size })
const jersey = (
  id: string,
  number: number,
  size: string,
  ownerPlayerId: string | null = null,
): JerseyAssignmentStock => ({ id, number, size, ownerPlayerId })

function resultByPlayer(
  players: readonly JerseyAssignmentPlayer[],
  jerseys: readonly JerseyAssignmentStock[],
  options: Parameters<typeof allocateJerseyProposal>[2] = {},
) {
  return new Map(allocateJerseyProposal(players, jerseys, options).map((row) => [row.playerId, row]))
}

describe('automatic jersey proposal allocator', () => {
  it('reserves eligible private stock for its owner before team stock', () => {
    const players = [player('alex', 'M'), player('ben', 'M')]
    const proposal = resultByPlayer(players, [
      jersey('alex-private-seven', 7, 'M', 'alex'),
      jersey('team-eight', 8, 'M'),
    ])

    expect(proposal.get('alex')?.jerseyId).toBe('alex-private-seven')
    expect(proposal.get('ben')?.jerseyId).toBe('team-eight')
  })

  it('does not lend absent or unresolved owners’ jerseys to the team round', () => {
    const proposal = resultByPlayer([player('alex', 'M')], [
      jersey('unavailable-private-seven', 7, 'M', 'departed-player'),
      jersey('team-eight', 8, 'M'),
    ])
    expect(proposal.get('alex')?.jerseyId).toBe('team-eight')
  })

  it('keeps an eligible private fallback ahead of exact-fit team stock', () => {
    const proposal = resultByPlayer([player('alex', 'M')], [
      jersey('alex-private-large', 7, 'L', 'alex'),
      jersey('team-medium', 8, 'M'),
    ])
    expect(proposal.get('alex')?.jerseyId).toBe('alex-private-large')
  })

  it('excludes privately owned stock outside the one-step size limit', () => {
    const proposal = resultByPlayer([player('alex', 'M')], [
      jersey('alex-private-xl', 7, 'XL', 'alex'),
      jersey('team-medium', 8, 'M'),
    ])
    expect(proposal.get('alex')?.jerseyId).toBe('team-medium')
  })

  it('returns ownership-conflict losers to team allocation', () => {
    const players = [player('alex', 'M'), player('ben', 'M')]
    const proposal = resultByPlayer(players, [
      jersey('alex-private-seven', 7, 'M', 'alex'),
      jersey('ben-private-seven', 7, 'M', 'ben'),
      jersey('team-eight', 8, 'M'),
    ])
    const rows = [...proposal.values()]
    expect(rows.filter(({ jerseyId }) => jerseyId === 'team-eight')).toHaveLength(1)
    expect(rows.filter(({ jerseyId }) => jerseyId?.endsWith('private-seven'))).toHaveLength(1)
    expect(rows.every(({ jerseyId }) => jerseyId !== null)).toBe(true)
  })

  it('prefers an exact team fit over a player’s historical number', () => {
    const proposal = resultByPlayer(
      [player('alex', 'M')],
      [jersey('fallback-seven', 7, 'L'), jersey('exact-twelve', 12, 'M')],
      { historicalNumbers: new Map([['alex', 7]]) },
    )
    expect(proposal.get('alex')?.jerseyId).toBe('exact-twelve')
  })

  it('finishes exact-fit allocation before one-step-larger fallback', () => {
    const players = [player('alex', 'M'), player('ben', 'L')]
    const proposal = resultByPlayer(players, [jersey('team-seven-large', 7, 'L')])
    expect(proposal.get('ben')?.jerseyId).toBe('team-seven-large')
    expect(proposal.get('alex')).toMatchObject({ jerseyId: null, error: expect.any(String) })
  })

  it('uses maximum-cardinality matching within a tier instead of squad or stock order', () => {
    const players = [player('alex', 'M'), player('ben', 'L')]
    const stock = [
      jersey('seven-medium', 7, 'M'),
      jersey('eight-medium', 8, 'M'),
      jersey('seven-large', 7, 'L'),
    ]
    const expected = new Map([
      ['alex', 'eight-medium'],
      ['ben', 'seven-large'],
    ])
    const first = resultByPlayer(players, stock, { seed: 'maximum-match' })
    const reversed = resultByPlayer([...players].reverse(), [...stock].reverse(), { seed: 'maximum-match' })
    for (const [playerId, jerseyId] of expected) {
      expect(first.get(playerId)?.jerseyId).toBe(jerseyId)
      expect(reversed.get(playerId)?.jerseyId).toBe(jerseyId)
    }
  })

  it('randomly resolves equal private owners independently of their number history', () => {
    const players = [player('alex', 'M'), player('ben', 'M')]
    const stock = [
      jersey('alex-private-seven', 7, 'M', 'alex'),
      jersey('ben-private-seven', 7, 'M', 'ben'),
    ]
    const history = new Map([['alex', 7]])
    const draw = (...values: number[]) => {
      let index = 0
      return () => values[index++] ?? 0.5
    }

    const alexWins = resultByPlayer(players, stock, { historicalNumbers: history, random: draw(0, 0, 1, 0) })
    const benWins = resultByPlayer(players, stock, { historicalNumbers: history, random: draw(1, 0, 0, 0) })
    expect(alexWins.get('alex')?.jerseyId).toBe('alex-private-seven')
    expect(benWins.get('ben')?.jerseyId).toBe('ben-private-seven')
  })

  it('randomly resolves equal team claims both with and without matching history', () => {
    const players = [player('alex', 'M'), player('ben', 'M')]
    const stock = [jersey('team-seven', 7, 'M'), jersey('team-eight', 8, 'M')]
    const draw = (...values: number[]) => {
      let index = 0
      return () => values[index++] ?? 0.5
    }
    const alexClaimsHistory = [0, 0, 0.5, 0, 0.9, 0, 0.1, 0]
    const benClaimsHistory = [0.9, 0, 0.1, 0, 0, 0, 0.5, 0]

    const alexHistory = resultByPlayer(players, stock, {
      historicalNumbers: new Map([['alex', 7], ['ben', 7]]),
      random: draw(...alexClaimsHistory),
    })
    const benHistory = resultByPlayer(players, stock, {
      historicalNumbers: new Map([['alex', 7], ['ben', 7]]),
      random: draw(...benClaimsHistory),
    })
    expect(alexHistory.get('alex')?.jerseyId).toBe('team-seven')
    expect(benHistory.get('ben')?.jerseyId).toBe('team-seven')

    const noHistoryAlex = resultByPlayer(players, stock, { random: draw(...alexClaimsHistory) })
    const noHistoryBen = resultByPlayer(players, stock, { random: draw(...benClaimsHistory) })
    expect(noHistoryAlex.get('alex')?.jerseyId).toBe('team-seven')
    expect(noHistoryBen.get('ben')?.jerseyId).toBe('team-seven')
  })

  it('keeps a generated lottery reproducible when input arrays are reordered', () => {
    const players = [player('alex', 'M'), player('ben', 'M'), player('casey', 'M')]
    const stock = [
      jersey('alex-private-seven', 7, 'M', 'alex'),
      jersey('ben-private-seven', 7, 'M', 'ben'),
      jersey('team-eight', 8, 'M'),
      jersey('team-nine', 9, 'M'),
    ]
    const first = resultByPlayer(players, stock, { seed: 'same-proposal' })
    const reordered = resultByPlayer([...players].reverse(), [...stock].reverse(), { seed: 'same-proposal' })
    expect([...first].map(([id, row]) => [id, row.jerseyId]).sort())
      .toEqual([...reordered].map(([id, row]) => [id, row.jerseyId]).sort())
  })

  it('never lets random priority override an earlier ownership or size round', () => {
    const privateBeforeTeam = resultByPlayer(
      [player('alex', 'M')],
      [jersey('alex-private-large', 7, 'L', 'alex'), jersey('team-exact', 8, 'M')],
      { random: () => 0.999999 },
    )
    const exactBeforeFallback = resultByPlayer(
      [player('alex', 'M')],
      [jersey('alex-exact', 7, 'M', 'alex'), jersey('alex-larger', 8, 'L', 'alex')],
      { random: () => 0.999999 },
    )
    expect(privateBeforeTeam.get('alex')?.jerseyId).toBe('alex-private-large')
    expect(exactBeforeFallback.get('alex')?.jerseyId).toBe('alex-exact')
  })

  it('treats duplicate physical variants as one number capacity and accepts zero', () => {
    const players = [player('alex', 'M'), player('ben', 'L')]
    const stock = [
      jersey('zero-medium', 0, 'M'),
      jersey('zero-large', 0, 'L'),
      jersey('eleven-medium', 11, 'M'),
    ]
    const proposal = allocateJerseyProposal(players, stock, { seed: 'duplicate-zero' })
    const numbersByJerseyId = new Map(stock.map(({ id, number }) => [id, number]))
    const assignedNumbers = proposal.flatMap(({ jerseyId }) => jerseyId ? [numbersByJerseyId.get(jerseyId)!] : [])

    expect(proposal.filter(({ jerseyId }) => jerseyId !== null)).toHaveLength(2)
    expect(assignedNumbers.filter((number) => number === 0)).toHaveLength(1)
    expect(new Set(proposal.flatMap(({ jerseyId }) => jerseyId ? [jerseyId] : [])).size).toBe(2)
  })

  it('jointly routes an owner with multiple private numbers to avoid an owner conflict', () => {
    const proposal = resultByPlayer(
      [player('alex', 'M'), player('ben', 'M')],
      [
        jersey('alex-seven', 7, 'M', 'alex'),
        jersey('alex-eight', 8, 'M', 'alex'),
        jersey('ben-seven', 7, 'M', 'ben'),
      ],
      { seed: 'private-joint-matching' },
    )
    expect(proposal.get('alex')?.jerseyId).toBe('alex-eight')
    expect(proposal.get('ben')?.jerseyId).toBe('ben-seven')
  })

  it('keeps flexible rosters visible for empty stock, unknown sizes, and limited fit', () => {
    const players = [player('alex', null), player('ben', '164'), player('casey', 'M')]
    const empty = allocateJerseyProposal(players, [])
    expect(empty).toHaveLength(3)
    expect(empty.every(({ jerseyId, error }) => jerseyId === null && Boolean(error))).toBe(true)

    const limited = resultByPlayer(
      [player('alex', 'M')],
      [jersey('too-small', 6, 'S'), jersey('two-steps-up', 8, 'XL'), jersey('unknown-size', 9, 'S/M')],
    )
    expect(limited.get('alex')?.jerseyId).toBeNull()
  })

  it('allocates complete and incomplete squads without assuming a fixed roster size', () => {
    const complete = resultByPlayer(
      [player('alex', 'S'), player('ben', 'XL')],
      [jersey('small', 1, 'S'), jersey('large', 2, 'XL'), jersey('extra-stock', 3, 'M')],
    )
    expect([...complete.values()].every(({ jerseyId }) => jerseyId !== null)).toBe(true)

    const incomplete = resultByPlayer(
      [player('alex', 'S'), player('ben', 'XL'), player('casey', 'M')],
      [jersey('only-small', 1, 'S')],
    )
    expect([...incomplete.values()].filter(({ jerseyId }) => jerseyId !== null)).toHaveLength(1)
    expect(incomplete.get('ben')?.error).toBeTruthy()
    expect(incomplete.get('casey')?.error).toBeTruthy()
  })

  it('does not mutate the players or inventory arrays it receives', () => {
    const players = [player('alex', 'M'), player('ben', 'L')]
    const stock = [jersey('seven', 7, 'M'), jersey('eight', 8, 'L')]
    const playersBefore = structuredClone(players)
    const stockBefore = structuredClone(stock)

    allocateJerseyProposal(players, stock, { seed: 'immutable-inputs' })

    expect(players).toEqual(playersBefore)
    expect(stock).toEqual(stockBefore)
  })

  it('ignores advisory preferred-number fields outside number history', () => {
    const playersWithAdvisoryNumbers = [
      { ...player('alex', 'M'), preferredNumber: 7 },
      { ...player('ben', 'M'), preferredNumber: 8 },
    ]
    const stock = [jersey('seven', 7, 'M'), jersey('eight', 8, 'M')]
    const controlledDraw = () => {
      const values = [0.9, 0, 0, 0, 0, 0, 0.9, 0]
      let index = 0
      return () => values[index++] ?? 0.5
    }

    const withAdvisories = resultByPlayer(playersWithAdvisoryNumbers, stock, { random: controlledDraw() })
    const withoutAdvisories = resultByPlayer(playersWithAdvisoryNumbers.map(({ id, size }) => ({ id, size })), stock, {
      random: controlledDraw(),
    })
    expect([...withAdvisories].map(([id, row]) => [id, row.jerseyId]))
      .toEqual([...withoutAdvisories].map(([id, row]) => [id, row.jerseyId]))
    expect(withAdvisories.get('alex')?.jerseyId).toBe('eight')
    expect(withAdvisories.get('ben')?.jerseyId).toBe('seven')
  })
})
