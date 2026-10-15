import { describe, expect, it } from 'vitest'
import { archivePlayer, createPlayer, renamePlayer, restorePlayer, updatePlayerProfile } from './player'

describe('player model', () => {
  it('trims names, creates stable identities, and permits duplicate names', () => {
    const first = createPlayer('  Alex  ', 100, 'player-one')
    const second = createPlayer('Alex', 200, 'player-two')

    expect(first).toEqual({
      id: 'player-one', name: 'Alex', positions: [], jerseySize: null, archived: false, createdAt: 100, updatedAt: 100,
    })
    expect(second.name).toBe(first.name)
    expect(second.id).not.toBe(first.id)
  })

  it('renames without changing identity and rejects blank names without mutating the player', () => {
    const player = createPlayer('Alex', 100, 'player-one')

    expect(renamePlayer(player, '  Alex Smith  ', 200)).toEqual({
      ...player, name: 'Alex Smith', updatedAt: 200,
    })
    expect(() => renamePlayer(player, ' \t ', 300)).toThrow('A player name is required.')
    expect(player).toEqual(createPlayer('Alex', 100, 'player-one'))
    expect(() => createPlayer('  ', 400, 'invalid-player')).toThrow('A player name is required.')
  })

  it('archives and restores the same player identity', () => {
    const player = createPlayer({ name: 'Sam', positions: ['DM', 'IV'] }, 100, 'player-sam')
    const archived = archivePlayer(player, 200)
    const restored = restorePlayer(archived, 300)

    expect(archived).toMatchObject({ id: player.id, name: player.name, archived: true, createdAt: 100 })
    expect(restored).toMatchObject({ id: player.id, name: player.name, archived: false, createdAt: 100 })
    expect(restored.positions).toEqual(['IV', 'DM'])
    expect(archived.positions).not.toBe(player.positions)
    expect(restored.positions).not.toBe(archived.positions)
    expect(player.archived).toBe(false)
  })

  it('creates and updates profiles with independent, catalogue-ordered position arrays', () => {
    const selected = ['DM', 'IV', 'DM'] as const
    const created = createPlayer({ name: 'Alex', positions: selected }, 100, 'player-alex')
    const updated = updatePlayerProfile(created, { name: 'Alex Smith', positions: ['ST', 'IV'] }, 200)
    const cleared = updatePlayerProfile(updated, { name: 'Alex Smith', positions: [] }, 300)

    expect(created.positions).toEqual(['IV', 'DM'])
    expect(updated).toMatchObject({ id: created.id, name: 'Alex Smith', positions: ['IV', 'ST'], createdAt: 100, updatedAt: 200 })
    expect(cleared.positions).toEqual([])
    expect(created.positions).not.toBe(selected)
    expect(updated.positions).not.toBe(created.positions)
  })

  it('normalizes one optional free-text jersey size on creation and update', () => {
    const youth = createPlayer({ name: 'Ari', positions: [], jerseySize: '  164  ' }, 100, 'player-youth')
    const adult = createPlayer({ name: 'Bea', positions: [], jerseySize: ' M ' }, 200, 'player-adult')
    const combined = createPlayer({ name: 'Cai', positions: [], jerseySize: ' S/M ' }, 300, 'player-combined')
    const cleared = updatePlayerProfile(youth, { name: 'Ari', positions: [], jerseySize: '  ' }, 400)

    expect([youth.jerseySize, adult.jerseySize, combined.jerseySize]).toEqual(['164', 'M', 'S/M'])
    expect(createPlayer({ name: 'Dee', positions: [] }).jerseySize).toBeNull()
    expect(cleared.jerseySize).toBeNull()
    expect(updatePlayerProfile(adult, { name: 'Bea', positions: [] }).jerseySize).toBe('M')
    expect(updatePlayerProfile(adult, { name: 'Bea', positions: [], jerseySize: null }).jerseySize).toBeNull()
  })

  it('rejects invalid profile fields atomically and copies readonly snapshot arrays', () => {
    const positions = ['IV'] as const
    const player = createPlayer({ name: 'Alex', positions }, 100, 'player-alex')
    const profile = { name: 'Alex Smith', positions: ['DM', 'IV'] as const }

    expect(() => updatePlayerProfile(player, { name: '  ', positions: ['DM'] }, 200))
      .toThrow('A player name is required.')
    expect(() => updatePlayerProfile(player, { name: 'Alex Smith', positions: ['DM'], jerseySize: 4 as never }, 200))
      .toThrow('A player jersey size must be text or empty.')
    expect(() => updatePlayerProfile(player, { name: 'Alex Smith', positions: ['UNKNOWN'] as never }, 200))
      .toThrow('Unknown player position')
    expect(() => createPlayer({ name: 'Alex', positions: ['UNKNOWN'] as never }))
      .toThrow('Unknown player position')
    expect(player).toEqual({ ...createPlayer('Alex', 100, 'player-alex'), positions: ['IV'] })

    const updated = updatePlayerProfile(player, profile, 300)
    expect(updated.positions).toEqual(['IV', 'DM'])
    expect(updated.positions).not.toBe(profile.positions)
    expect(profile.positions).toEqual(['DM', 'IV'])
    expect(renamePlayer(updated, 'Alex Renamed', 400).positions).not.toBe(updated.positions)
  })

  it('preserves the same size through rename, archive, and restore', () => {
    const sizedPlayer = createPlayer({ name: 'Alex', positions: ['IV'], jerseySize: 'M' }, 100, 'player-alex')
    const renamed = renamePlayer(sizedPlayer, 'Alex Smith', 200)
    const archived = archivePlayer(renamed, 300)
    const restored = restorePlayer(archived, 400)

    expect([renamed.jerseySize, archived.jerseySize, restored.jerseySize]).toEqual(['M', 'M', 'M'])
  })
})
