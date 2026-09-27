import { describe, expect, it } from 'vitest'
import type {
  MatchParticipation,
  MatchPeriod,
  SubstitutionEvent,
} from './match'
import {
  calculateParticipationPlayingTime,
  correctSubstitutionHistory,
  formatPlayingTime,
  removeSubstitutionHistoryEvent,
  replaySubstitutions,
  validateParticipationSetup,
} from './participation'

function setup(overrides: Partial<MatchParticipation> = {}): MatchParticipation {
  return {
    ownSide: 'home',
    squad: [
      { playerId: 'alex', nameSnapshot: 'Alex' },
      { playerId: 'sam', nameSnapshot: 'Sam' },
      { playerId: 'jordan', nameSnapshot: 'Jordan' },
      { playerId: 'casey', nameSnapshot: 'Casey' },
    ],
    starterIds: ['alex', 'sam'],
    substitutions: [],
    ...overrides,
  }
}

function event(
  id: string,
  outgoingPlayerId: string,
  incomingPlayerId: string,
  elapsedMs: number,
  sequence: number,
  period: MatchPeriod = 1,
): SubstitutionEvent {
  return { id, outgoingPlayerId, incomingPlayerId, elapsedMs, sequence, period, createdAt: sequence * 10 }
}

function context(overrides: Partial<Parameters<typeof replaySubstitutions>[2]> = {}) {
  return {
    clock: { period: 1 as const, elapsedMs: 60_000, status: 'paused' as const, startedAt: null },
    currentElapsedMs: 60_000,
    completedPeriodElapsedMs: { 1: null, 2: null },
    ...overrides,
  }
}

describe('participation setup validation', () => {
  it('accepts flexible squad sizes and repeated display names while requiring unique identities', () => {
    const onePlayerSquad = setup({
      squad: [
        { playerId: 'id-one', nameSnapshot: 'Alex' },
        { playerId: 'id-two', nameSnapshot: 'Alex' },
      ],
      starterIds: ['id-one'],
    })

    expect(validateParticipationSetup(onePlayerSquad)).toBeNull()
    expect(validateParticipationSetup(setup({
      squad: [
        { playerId: 'same-id', nameSnapshot: 'Alex' },
        { playerId: 'same-id', nameSnapshot: 'Sam' },
      ],
    }))).toBe('A player can appear only once in the match squad.')
  })

  it('rejects a missing own side, empty starters, and starters outside the squad', () => {
    expect(validateParticipationSetup(setup({ ownSide: 'opponent' as 'home' })))
      .toBe('Choose whether your team is playing at home or away.')
    expect(validateParticipationSetup(setup({ starterIds: [] }))).toBe('Choose at least one starting player.')
    expect(validateParticipationSetup(setup({ starterIds: ['not-in-squad'] })))
      .toBe('Every starting player must belong to the match squad.')
    expect(validateParticipationSetup(setup({ starterIds: ['alex', 'alex'] })))
      .toBe('A player can start only once.')
  })

  it('rejects malformed squad players without changing the candidate setup', () => {
    const candidate = setup({ squad: [{ playerId: '  ', nameSnapshot: '' }] })
    const original = structuredClone(candidate)

    expect(validateParticipationSetup(candidate)).toBe('Every squad player must have a valid player identity.')
    expect(candidate).toEqual(original)
  })
})

describe('ordered substitution replay', () => {
  it('allows unrestricted repeated re-entry through successive spells', () => {
    const participation = setup()
    const events = [
      event('alex-off', 'alex', 'jordan', 10_000, 1),
      event('alex-back', 'jordan', 'alex', 20_000, 2),
      event('alex-off-again', 'alex', 'casey', 30_000, 3),
      event('alex-back-again', 'casey', 'alex', 40_000, 4),
    ]

    const result = replaySubstitutions(participation, events, context())

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.steps).toHaveLength(4)
      expect(result.finalLineup).toEqual(['sam', 'alex'])
      expect(result.finalBench).toEqual(['jordan', 'casey'])
    }
  })

  it('replays equal-time chained exchanges by stable sequence without mutating input order', () => {
    const participation = setup()
    const events = [
      event('sam-off', 'jordan', 'casey', 10_000, 2),
      event('alex-off', 'alex', 'jordan', 10_000, 1),
    ]
    const original = structuredClone(events)

    const result = replaySubstitutions(participation, events, context())

    expect(events).toEqual(original)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.steps.map((step) => step.event.id)).toEqual(['alex-off', 'sam-off'])
      expect(result.finalLineup).toEqual(['sam', 'casey'])
    }
  })

  it('allows second-half zero at half-time and excludes the half-time break', () => {
    const halftimeContext = context({
      clock: { period: 1, elapsedMs: 2_820_000, status: 'halftime', startedAt: null },
      currentElapsedMs: 2_820_000,
      completedPeriodElapsedMs: { 1: 2_820_000, 2: null },
    })
    const result = replaySubstitutions(
      setup(),
      [event('half-time-exchange', 'alex', 'jordan', 0, 1, 2)],
      halftimeContext,
    )

    expect(result.valid).toBe(true)
    if (result.valid) expect(result.finalLineup).toEqual(['sam', 'jordan'])
  })

  it.each([
    ['same player in both roles', event('same-role', 'alex', 'alex', 1_000, 1), 'Choose different players'],
    ['player outside the squad', event('outside', 'alex', 'visitor', 1_000, 1), 'Both substitution players must belong'],
    ['outgoing player on the bench', event('bench-off', 'jordan', 'casey', 1_000, 1), 'The OFF player is not on the pitch'],
    ['incoming player already on the pitch', event('pitch-on', 'alex', 'sam', 1_000, 1), 'The ON player is already on the pitch'],
  ])('rejects an invalid %s role without partial replay', (_label, candidate, reason) => {
    const participation = setup()
    const original = structuredClone(participation)
    const result = replaySubstitutions(participation, [candidate], context())

    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.conflict.reason).toContain(reason)
      expect(result.steps).toEqual([])
    }
    expect(participation).toEqual(original)
  })

  it('rejects event times beyond the current or completed period bounds', () => {
    const beyondCurrent = replaySubstitutions(
      setup(), [event('future-period-one', 'alex', 'jordan', 60_001, 1)], context(),
    )
    expect(beyondCurrent.valid).toBe(false)
    if (!beyondCurrent.valid) expect(beyondCurrent.conflict.reason).toContain('exceeds the recorded elapsed time')

    const halftime = context({
      clock: { period: 1, elapsedMs: 2_820_000, status: 'halftime', startedAt: null },
      currentElapsedMs: 2_820_000,
      completedPeriodElapsedMs: { 1: 2_820_000, 2: null },
    })
    const afterHalftimeBoundary = replaySubstitutions(
      setup(), [event('future-period-two', 'alex', 'jordan', 1, 1, 2)], halftime,
    )
    expect(afterHalftimeBoundary.valid).toBe(false)
    if (!afterHalftimeBoundary.valid) expect(afterHalftimeBoundary.conflict.reason).toContain('exceeds')

    const completed = context({
      clock: { period: 2, elapsedMs: 30_000, status: 'paused', startedAt: null },
      currentElapsedMs: 30_000,
      completedPeriodElapsedMs: { 1: 2_820_000, 2: null },
    })
    const beyondCompleted = replaySubstitutions(
      setup(), [event('beyond-completed', 'alex', 'jordan', 2_820_001, 1)], completed,
    )
    expect(beyondCompleted.valid).toBe(false)
    if (!beyondCompleted.valid) expect(beyondCompleted.conflict.reason).toContain('exceeds')
  })

  it('reports unknown completed-period duration instead of inventing a bound', () => {
    const periodTwo = context({
      clock: { period: 2, elapsedMs: 30_000, status: 'paused', startedAt: null },
      currentElapsedMs: 30_000,
      completedPeriodElapsedMs: { 1: null, 2: null },
    })
    const result = replaySubstitutions(
      setup(), [event('unknown-first-half', 'alex', 'jordan', 0, 1)], periodTwo,
    )

    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.conflict.reason).toContain('duration of period 1 is unknown')
  })

  it('rejects duplicate stable sequence values at an equal-time boundary', () => {
    const events = [
      event('first', 'alex', 'jordan', 1_000, 4),
      event('second', 'jordan', 'alex', 1_000, 4),
    ]
    const result = replaySubstitutions(setup(), events, context())

    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.conflict.reason).toContain('order values must be unique')
  })
})

describe('participation playing time', () => {
  it('sums repeated spells to 35:00 and 12:00 from the same replayed history', () => {
    const participation = setup({
      squad: [
        { playerId: 'alex', nameSnapshot: 'Alex' },
        { playerId: 'sam', nameSnapshot: 'Sam' },
        { playerId: 'jordan', nameSnapshot: 'Jordan' },
      ],
      starterIds: ['alex'],
    })
    const events = [
      event('alex-off', 'alex', 'sam', 18 * 60_000, 1),
      event('alex-back', 'sam', 'alex', 30 * 60_000, 2),
    ]
    const result = calculateParticipationPlayingTime(
      participation,
      events,
      context({
        clock: { period: 1, elapsedMs: 47 * 60_000, status: 'full-time', startedAt: null },
        currentElapsedMs: 47 * 60_000,
        completedPeriodElapsedMs: { 1: 47 * 60_000, 2: null },
      }),
    )

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.playerTimes).toEqual([
        { playerId: 'alex', elapsedMs: 35 * 60_000, appearance: true, onPitch: true, liveContribution: false },
        { playerId: 'sam', elapsedMs: 12 * 60_000, appearance: true, onPitch: false, liveContribution: false },
        { playerId: 'jordan', elapsedMs: 0, appearance: false, onPitch: false, liveContribution: false },
      ])
      expect(result.lineup).toEqual(['alex'])
      expect(result.bench).toEqual(['sam', 'jordan'])
      expect(result.lineupStatus).toBe('final')
    }
  })

  it('adds actual period durations to 95:00 without counting the half-time break', () => {
    const participation = setup({
      squad: [{ playerId: 'alex', nameSnapshot: 'Alex' }],
      starterIds: ['alex'],
    })
    const result = calculateParticipationPlayingTime(
      participation,
      [],
      context({
        clock: { period: 2, elapsedMs: 48 * 60_000, status: 'full-time', startedAt: null },
        currentElapsedMs: 48 * 60_000,
        completedPeriodElapsedMs: { 1: 47 * 60_000, 2: 48 * 60_000 },
      }),
    )

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.playerTimes[0].elapsedMs).toBe(95 * 60_000)
      expect(formatPlayingTime(result.playerTimes[0].elapsedMs)).toBe('95:00')
      expect(result.lineupStatus).toBe('final')
    }
  })

  it('gives a half-time replacement 10:00 while the starter retains 47:00', () => {
    const participation = setup({
      squad: [
        { playerId: 'alex', nameSnapshot: 'Alex' },
        { playerId: 'sam', nameSnapshot: 'Sam' },
      ],
      starterIds: ['alex'],
    })
    const result = calculateParticipationPlayingTime(
      participation,
      [event('half-time-swap', 'alex', 'sam', 0, 1, 2)],
      context({
        clock: { period: 2, elapsedMs: 10 * 60_000, status: 'running', startedAt: 50_000 },
        currentElapsedMs: 10 * 60_000,
        completedPeriodElapsedMs: { 1: 47 * 60_000, 2: null },
      }),
    )

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.playerTimes.map(({ playerId, elapsedMs }) => [playerId, elapsedMs]))
        .toEqual([['alex', 47 * 60_000], ['sam', 10 * 60_000]])
      expect(result.lineup).toEqual(['sam'])
      expect(result.bench).toEqual(['alex'])
    }
  })

  it('uses a frozen paused endpoint and includes unused bench entries and zero-length spells', () => {
    const participation = setup({
      squad: [
        { playerId: 'alex', nameSnapshot: 'Alex' },
        { playerId: 'sam', nameSnapshot: 'Sam' },
        { playerId: 'jordan', nameSnapshot: 'Jordan' },
      ],
      starterIds: ['alex'],
    })
    const result = calculateParticipationPlayingTime(
      participation,
      [
        event('sam-enters-at-pause', 'alex', 'sam', 5 * 60_000, 1),
        event('sam-leaves-at-pause', 'sam', 'alex', 5 * 60_000, 2),
      ],
      context({
        clock: { period: 1, elapsedMs: 5 * 60_000, status: 'paused', startedAt: null },
        currentElapsedMs: 5 * 60_000,
      }),
    )

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.playerTimes.map(({ playerId, elapsedMs, appearance }) => [playerId, elapsedMs, appearance]))
        .toEqual([
          ['alex', 5 * 60_000, true],
          ['sam', 0, false],
          ['jordan', 0, false],
        ])
      expect(result.playerTimes[1].onPitch).toBe(false)
      expect(result.playerTimes[2].onPitch).toBe(false)
      expect(result.lineupStatus).toBe('current')
    }
  })

  it('sums milliseconds before formatting and rounds only the final displayed total down to seconds', () => {
    const participation = setup({
      squad: [
        { playerId: 'alex', nameSnapshot: 'Alex' },
        { playerId: 'sam', nameSnapshot: 'Sam' },
      ],
      starterIds: ['alex'],
    })
    const result = calculateParticipationPlayingTime(
      participation,
      [
        event('first-spell-end', 'alex', 'sam', 700, 1),
        event('second-spell-start', 'sam', 'alex', 1_300, 2),
        event('second-spell-end', 'alex', 'sam', 2_100, 3),
      ],
      context({
        clock: { period: 1, elapsedMs: 3_000, status: 'full-time', startedAt: null },
        currentElapsedMs: 3_000,
        completedPeriodElapsedMs: { 1: 3_000, 2: null },
      }),
    )

    expect(result.valid).toBe(true)
    if (result.valid) {
      const alex = result.playerTimes.find((player) => player.playerId === 'alex')!
      expect(alex.elapsedMs).toBe(1_500)
      expect(formatPlayingTime(alex.elapsedMs)).toBe('00:01')
      expect(formatPlayingTime(59_999)).toBe('00:59')
      expect(formatPlayingTime(3_600_000)).toBe('60:00')
    }
  })

  it('derives live and fixed full-time endpoints from match status', () => {
    const participation = setup({
      squad: [{ playerId: 'alex', nameSnapshot: 'Alex' }],
      starterIds: ['alex'],
    })
    const live = calculateParticipationPlayingTime(participation, [], context({
      clock: { period: 1, elapsedMs: 1_000, status: 'running', startedAt: 100 },
      currentElapsedMs: 5_000,
    }))
    expect(live.valid).toBe(true)
    if (live.valid) {
      expect(live.playerTimes[0]).toMatchObject({ elapsedMs: 5_000, appearance: true, onPitch: true, liveContribution: true })
    }

    const finished = calculateParticipationPlayingTime(participation, [], context({
      clock: { period: 1, elapsedMs: 5_000, status: 'full-time', startedAt: null },
      currentElapsedMs: 5_000,
      completedPeriodElapsedMs: { 1: 5_000, 2: null },
    }))
    expect(finished.valid).toBe(true)
    if (finished.valid) {
      expect(finished.playerTimes[0]).toMatchObject({ elapsedMs: 5_000, liveContribution: false })
    }
  })

  it('refuses to calculate periods whose historical duration is unknown', () => {
    const participation = setup({
      squad: [{ playerId: 'alex', nameSnapshot: 'Alex' }],
      starterIds: ['alex'],
    })
    const result = calculateParticipationPlayingTime(
      participation,
      [],
      context({
        clock: { period: 2, elapsedMs: 10_000, status: 'paused', startedAt: null },
        currentElapsedMs: 10_000,
        completedPeriodElapsedMs: { 1: null, 2: null },
      }),
    )
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.conflict.reason).toContain('duration of period 1 is unknown')
  })
})

describe('substitution history candidates', () => {
  const fullTimeContext = context({
    clock: { period: 2, elapsedMs: 48 * 60_000, status: 'full-time', startedAt: null },
    currentElapsedMs: 48 * 60_000,
    completedPeriodElapsedMs: { 1: 47 * 60_000, 2: 48 * 60_000 },
  })

  it('accepts a valid past-time correction and recalculates full-time totals', () => {
    const participation = setup({
      squad: [
        { playerId: 'alex', nameSnapshot: 'Alex' },
        { playerId: 'sam', nameSnapshot: 'Sam' },
      ],
      starterIds: ['alex'],
    })
    const events = [
      event('alex-off', 'alex', 'sam', 18 * 60_000, 1),
      event('alex-back', 'sam', 'alex', 30 * 60_000, 2),
    ]
    const original = structuredClone(events)
    const result = correctSubstitutionHistory(
      participation,
      events,
      'alex-off',
      { elapsedMs: 20 * 60_000 },
      fullTimeContext,
    )

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.events[0].elapsedMs).toBe(20 * 60_000)
      expect(result.playingTime.playerTimes.map(({ playerId, elapsedMs }) => [playerId, elapsedMs]))
        .toEqual([['alex', 85 * 60_000], ['sam', 10 * 60_000]])
    }
    expect(events).toEqual(original)
  })

  it('accepts a player-only correction while preserving the exact event time', () => {
    const participation = setup({
      squad: [
        { playerId: 'alex', nameSnapshot: 'Alex' },
        { playerId: 'sam', nameSnapshot: 'Sam' },
        { playerId: 'jordan', nameSnapshot: 'Jordan' },
      ],
      starterIds: ['alex'],
    })
    const events = [event('correction', 'alex', 'sam', 18 * 60_000 + 725, 1)]
    const original = structuredClone(events)
    const result = correctSubstitutionHistory(
      participation,
      events,
      'correction',
      { incomingPlayerId: 'jordan' },
      fullTimeContext,
    )

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.events[0]).toMatchObject({
        id: 'correction', incomingPlayerId: 'jordan', elapsedMs: 18 * 60_000 + 725,
      })
      expect(result.playingTime.playerTimes.map(({ playerId, elapsedMs }) => [playerId, elapsedMs]))
        .toEqual([
          ['alex', 18 * 60_000 + 725],
          ['sam', 0],
          ['jordan', 47 * 60_000 - (18 * 60_000 + 725) + 48 * 60_000],
        ])
    }
    expect(events).toEqual(original)
  })

  it('allows deleting an independent exchange when the remaining history is valid', () => {
    const participation = setup({
      squad: [
        { playerId: 'alex', nameSnapshot: 'Alex' },
        { playerId: 'sam', nameSnapshot: 'Sam' },
      ],
      starterIds: ['alex'],
    })
    const events = [event('independent', 'alex', 'sam', 10_000, 1)]
    const original = structuredClone(events)
    const result = removeSubstitutionHistoryEvent(participation, events, 'independent', fullTimeContext)

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.events).toEqual([])
      expect(result.playingTime.playerTimes.map(({ playerId, elapsedMs }) => [playerId, elapsedMs]))
        .toEqual([['alex', 95 * 60_000], ['sam', 0]])
    }
    expect(events).toEqual(original)
  })

  it('rejects deletion that breaks a later re-entry and reports the first conflicting event', () => {
    const participation = setup({
      squad: [
        { playerId: 'alex', nameSnapshot: 'Alex' },
        { playerId: 'sam', nameSnapshot: 'Sam' },
      ],
      starterIds: ['alex'],
    })
    const events = [
      event('first-exchange', 'alex', 'sam', 10_000, 1),
      event('return-exchange', 'sam', 'alex', 20_000, 2),
    ]
    const original = structuredClone(events)
    const result = removeSubstitutionHistoryEvent(participation, events, 'first-exchange', fullTimeContext)

    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.conflict).toMatchObject({ eventId: 'return-exchange' })
      expect(result.conflict.reason).toContain('OFF player is not on the pitch')
    }
    expect(events).toEqual(original)
  })

  it('rejects a time correction that reorders later re-entry into an invalid history', () => {
    const participation = setup({
      squad: [
        { playerId: 'alex', nameSnapshot: 'Alex' },
        { playerId: 'sam', nameSnapshot: 'Sam' },
      ],
      starterIds: ['alex'],
    })
    const events = [
      event('first-exchange', 'alex', 'sam', 10_000, 1),
      event('return-exchange', 'sam', 'alex', 20_000, 2),
    ]
    const original = structuredClone(events)
    const result = correctSubstitutionHistory(
      participation,
      events,
      'first-exchange',
      { elapsedMs: 30_000 },
      fullTimeContext,
    )

    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.conflict.eventId).toBe('return-exchange')
    expect(events).toEqual(original)
  })

  it('does not return a partially updated full-time candidate when any later exchange conflicts', () => {
    const participation = setup({
      squad: [
        { playerId: 'alex', nameSnapshot: 'Alex' },
        { playerId: 'sam', nameSnapshot: 'Sam' },
        { playerId: 'jordan', nameSnapshot: 'Jordan' },
      ],
      starterIds: ['alex'],
    })
    const events = [
      event('first-exchange', 'alex', 'sam', 10_000, 1),
      event('second-exchange', 'sam', 'jordan', 20_000, 2),
    ]
    const original = structuredClone(events)
    const result = correctSubstitutionHistory(
      participation,
      events,
      'first-exchange',
      { outgoingPlayerId: 'jordan' },
      fullTimeContext,
    )

    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.conflict.eventId).toBe('first-exchange')
    expect(events).toEqual(original)
  })
})
