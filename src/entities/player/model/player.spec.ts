import { describe, expect, it } from 'vitest'
import { archivePlayer, createPlayer, renamePlayer, restorePlayer } from './player'

describe('player model', () => {
  it('trims names, creates stable identities, and permits duplicate names', () => {
    const first = createPlayer('  Alex  ', 100, 'player-one')
    const second = createPlayer('Alex', 200, 'player-two')

    expect(first).toEqual({
      id: 'player-one', name: 'Alex', archived: false, createdAt: 100, updatedAt: 100,
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
    const player = createPlayer('Sam', 100, 'player-sam')
    const archived = archivePlayer(player, 200)
    const restored = restorePlayer(archived, 300)

    expect(archived).toMatchObject({ id: player.id, name: player.name, archived: true, createdAt: 100 })
    expect(restored).toMatchObject({ id: player.id, name: player.name, archived: false, createdAt: 100 })
    expect(player.archived).toBe(false)
  })
})
