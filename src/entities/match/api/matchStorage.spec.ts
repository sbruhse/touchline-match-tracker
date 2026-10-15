import { reactive } from 'vue'
import { IDBObjectStore, IDBVersionChangeEvent } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'
import { createMatchStore } from '../model/matchStore'
import { createMatch } from '../model/match'
import { createIndexedDbTestFixture } from './indexedDbTestFixtures'
import { createMatchRepository } from './matchStorage'

async function withRepository<T>(
  run: (repository: ReturnType<typeof createMatchRepository>, fixture: ReturnType<typeof createIndexedDbTestFixture>) => Promise<T>,
): Promise<T> {
  const fixture = createIndexedDbTestFixture()
  const repository = createMatchRepository({
    indexedDB: fixture.factory,
    databaseName: fixture.databaseName,
  })

  try {
    return await run(repository, fixture)
  } finally {
    repository.close()
    await fixture.cleanup()
  }
}

function literalVersion1Match(
  id: string,
  clock: { period: 1 | 2; elapsedMs: number; status: string; startedAt: number | null } = {
    period: 1, elapsedMs: 0, status: 'not-started', startedAt: null,
  },
) {
  return {
    id,
    homeTeam: 'North City',
    awayTeam: 'South Town',
    createdAt: 1_699_999_000_000,
    updatedAt: 1_699_999_500_000,
    clock,
    goals: [{
      id: `${id}-goal`,
      side: 'home',
      period: 1,
      elapsedMs: 600_000,
      scorer: 'M. Striker',
      assist: '',
      description: 'A close-range finish',
      createdAt: 1_699_999_100_000,
    }],
    legacyExtension: { preserved: ['original', id] },
  }
}

function literalVersion2Match(id: string) {
  return {
    ...literalVersion1Match(id),
    recordVersion: 2,
    participation: null,
    completedPeriodElapsedMs: { 1: null, 2: null },
  }
}

function matchWithJerseyAssignment(id: string, partial = false) {
  const match = createMatch('North City', 'South Town', 100, id)
  return {
    ...match,
    clock: { period: 1 as const, elapsedMs: 0, status: 'paused' as const, startedAt: null },
    firstKickoffAt: 200,
    participation: {
      ownSide: 'home' as const,
      squad: [
        { playerId: 'player-alex', nameSnapshot: 'Alex' },
        { playerId: 'player-ben', nameSnapshot: 'Ben' },
      ],
      starterIds: ['player-alex'],
      substitutions: [],
    },
    jerseyAssignment: {
      setId: 'set-blue',
      setNameSnapshot: 'Blue',
      rows: [
        {
          playerId: 'player-alex',
          jersey: { jerseyId: 'jersey-zero', number: 0, size: '164', ownerPlayerId: 'player-ben' },
        },
        {
          playerId: 'player-ben',
          jersey: partial ? null : { jerseyId: 'jersey-eight', number: 8, size: 'XL', ownerPlayerId: null },
        },
      ],
    },
  }
}

function literalVersion3Match(id: string) {
  return {
    ...literalVersion1Match(id),
    recordVersion: 3,
    participation: null,
    completedPeriodElapsedMs: { 1: null, 2: null },
    firstKickoffAt: null,
    jerseyAssignment: null,
  }
}

function literalVersion4Match(id: string) {
  const match = matchWithJerseyAssignment(id)
  return {
    ...match,
    recordVersion: 4,
    goals: [{
      id: `${id}-linked-goal`,
      side: 'home',
      period: 1,
      elapsedMs: 30_123,
      scorerPlayerId: 'player-alex',
      scorer: 'Alex snapshot',
      assistPlayerId: null,
      assist: '',
      description: '',
      createdAt: 150,
    }],
  }
}

function writeRawRecord(database: IDBDatabase, record: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('matches', 'readwrite')
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('Fixture write was aborted.'))
    transaction.onerror = () => reject(transaction.error ?? new Error('Fixture write failed.'))
    transaction.objectStore('matches').put(record)
  })
}

function readRawRecord(database: IDBDatabase, id: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('matches', 'readonly')
    const request = transaction.objectStore('matches').get(id)
    let value: unknown
    request.onsuccess = () => { value = request.result }
    request.onerror = () => reject(request.error ?? new Error('Fixture read failed.'))
    transaction.oncomplete = () => resolve(value)
    transaction.onabort = () => reject(transaction.error ?? new Error('Fixture read was aborted.'))
  })
}

describe('IndexedDB match repository', () => {
  it('lists an empty archive for a new database', async () => {
    await withRepository(async (repository) => {
      await expect(repository.listMatches()).resolves.toEqual([])
    })
  })

  it('saves and reloads a complete match record', async () => {
    await withRepository(async (repository) => {
      const match = {
        ...createMatch('North City', 'South Town', 100, 'match-round-trip'),
        participation: {
          ownSide: 'home' as const,
          squad: [{ playerId: 'player-1', nameSnapshot: 'A. Player' }],
          starterIds: ['player-1'],
          substitutions: [{
            id: 'sub-1', outgoingPlayerId: 'player-1', incomingPlayerId: 'player-2',
            period: 1 as const, elapsedMs: 60_000, sequence: 1, createdAt: 150,
          }],
        },
        completedPeriodElapsedMs: { 1: 2_820_000, 2: null },
        goals: [
          {
            id: 'goal-1',
            side: 'home' as const,
            period: 1 as const,
            elapsedMs: 60_000,
            scorerPlayerId: null,
            scorer: 'A. Player',
            assistPlayerId: null,
            assist: 'B. Player',
            description: 'A finish',
            createdAt: 120,
          },
        ],
      }

      await repository.saveMatch(match)

      await expect(repository.getMatch(match.id)).resolves.toEqual(match)
      await expect(repository.listMatches()).resolves.toEqual([match])
    })
  })

  it.each([
    ['not-started', { period: 1 as const, elapsedMs: 0, status: 'not-started', startedAt: null }, { 1: null, 2: null }],
    ['running in period one', { period: 1 as const, elapsedMs: 2_820_000, status: 'running', startedAt: 1_699_999_600_000 }, { 1: null, 2: null }],
    ['paused in period one', { period: 1 as const, elapsedMs: 2_820_000, status: 'paused', startedAt: null }, { 1: null, 2: null }],
    ['half-time', { period: 1 as const, elapsedMs: 2_820_000, status: 'halftime', startedAt: null }, { 1: 2_820_000, 2: null }],
    ['full-time in period two', { period: 2 as const, elapsedMs: 2_880_000, status: 'full-time', startedAt: null }, { 1: null, 2: 2_880_000 }],
    ['running in period two with unknown first half', { period: 2 as const, elapsedMs: 120_000, status: 'running', startedAt: 1_699_999_600_000 }, { 1: null, 2: null }],
  ])('normalizes a literal version-1 %s record without inventing history', async (_label, clock, expectedPeriods) => {
    await withRepository(async (repository, fixture) => {
      const legacy = literalVersion1Match(`legacy-${String(_label).replaceAll(' ', '-')}`, clock)
      const database = await fixture.open()
      await writeRawRecord(database, legacy)
      database.close()

      const match = await repository.getMatch(legacy.id)

      expect(match).toMatchObject({
        id: legacy.id,
        homeTeam: legacy.homeTeam,
        awayTeam: legacy.awayTeam,
        goals: legacy.goals,
        participation: null,
        completedPeriodElapsedMs: expectedPeriods,
      })
      const inspect = await fixture.open()
      await expect(readRawRecord(inspect, legacy.id)).resolves.toEqual(legacy)
      inspect.close()
    })
  })

  it('reads version-2 records without writing and preserves or omits their original backups on upgrade', async () => {
    await withRepository(async (repository, fixture) => {
      const originalBackup = { original: ['v1', { retained: true }] }
      const backed = { ...literalVersion2Match('version-2-backed'), legacyV1Backup: originalBackup }
      const plain = literalVersion2Match('version-2-no-backup')
      const database = await fixture.open()
      await writeRawRecord(database, backed)
      await writeRawRecord(database, plain)
      database.close()

      const normalized = await repository.getMatch(backed.id)
      expect(normalized).toMatchObject({ firstKickoffAt: null, jerseyAssignment: null })
      const beforeUpgrade = await fixture.open()
      await expect(readRawRecord(beforeUpgrade, backed.id)).resolves.toEqual(backed)
      await expect(readRawRecord(beforeUpgrade, plain.id)).resolves.toEqual(plain)
      beforeUpgrade.close()

      await repository.saveMatch({ ...normalized!, awayTeam: 'East Town' })
      await repository.saveMatch({ ...(await repository.getMatch(plain.id))!, awayTeam: 'West Town' })
      const afterUpgrade = await fixture.open()
      const backedRecord = await readRawRecord(afterUpgrade, backed.id) as Record<string, unknown>
      const plainRecord = await readRawRecord(afterUpgrade, plain.id) as Record<string, unknown>
      expect(backedRecord.recordVersion).toBe(4)
      expect(backedRecord.legacyV1Backup).toEqual(originalBackup)
      expect(plainRecord.recordVersion).toBe(4)
      expect(Object.hasOwn(plainRecord, 'legacyV1Backup')).toBe(false)
      afterUpgrade.close()
    })
  })

  it('normalizes a version-3 name-only goal without inferring links or writing the record', async () => {
    await withRepository(async (repository, fixture) => {
      const legacy = literalVersion3Match('version-3-name-only')
      const database = await fixture.open()
      await writeRawRecord(database, legacy)
      database.close()

      await expect(repository.getMatch(legacy.id)).resolves.toMatchObject({
        goals: [{ scorerPlayerId: null, scorer: 'M. Striker', assistPlayerId: null, assist: '' }],
      })
      const inspect = await fixture.open()
      await expect(readRawRecord(inspect, legacy.id)).resolves.toEqual(legacy)
      inspect.close()
    })
  })

  it('preserves existing version-2, version-3, and version-4 backups on the next format-4 save', async () => {
    await withRepository(async (repository, fixture) => {
      const records = [
        { ...literalVersion2Match('backup-v2'), legacyV1Backup: { exact: ['v2', { nested: true }] } },
        { ...literalVersion3Match('backup-v3'), legacyV1Backup: { exact: ['v3', { nested: true }] } },
        { ...literalVersion4Match('backup-v4'), legacyV1Backup: { exact: ['v4', { nested: true }] } },
      ]
      const database = await fixture.open()
      for (const record of records) await writeRawRecord(database, record)
      database.close()

      for (const record of records) {
        const normalized = await repository.getMatch(record.id)
        await repository.saveMatch({ ...normalized!, updatedAt: normalized!.updatedAt + 1 })
      }

      const inspect = await fixture.open()
      for (const record of records) {
        const saved = await readRawRecord(inspect, record.id) as Record<string, unknown>
        expect(saved.recordVersion).toBe(4)
        expect(saved.legacyV1Backup).toEqual(record.legacyV1Backup)
      }
      inspect.close()
    })
  })

  it('reads valid version-4 links from saved match data without a live player directory or writing', async () => {
    await withRepository(async (repository, fixture) => {
      const linked = literalVersion4Match('version-4-linked')
      const database = await fixture.open()
      await writeRawRecord(database, linked)
      database.close()

      await expect(repository.getMatch(linked.id)).resolves.toMatchObject({
        goals: [{ scorerPlayerId: 'player-alex', scorer: 'Alex snapshot', assistPlayerId: null, assist: '' }],
      })
      const inspect = await fixture.open()
      await expect(readRawRecord(inspect, linked.id)).resolves.toEqual(linked)
      expect(inspect.version).toBe(1)
      inspect.close()
    })
  })

  it.each([
    ['missing scorer identity', (record: Record<string, unknown>) => {
      delete (record.goals as Array<Record<string, unknown>>)[0].scorerPlayerId
    }],
    ['missing assist identity', (record: Record<string, unknown>) => {
      delete (record.goals as Array<Record<string, unknown>>)[0].assistPlayerId
    }],
    ['blank scorer identity', (record: Record<string, unknown>) => {
      (record.goals as Array<Record<string, unknown>>)[0].scorerPlayerId = '  '
    }],
    ['outside-squad identity', (record: Record<string, unknown>) => {
      (record.goals as Array<Record<string, unknown>>)[0].scorerPlayerId = 'not-in-squad'
    }],
    ['opponent-side attribution', (record: Record<string, unknown>) => {
      (record.goals as Array<Record<string, unknown>>)[0].side = 'away'
    }],
  ])('rejects version-4 records with %s without changing stored data', async (_label, corrupt) => {
    await withRepository(async (repository, fixture) => {
      const record = literalVersion4Match(`invalid-v4-${String(_label)}`) as unknown as Record<string, unknown>
      corrupt(record)
      const database = await fixture.open()
      await writeRawRecord(database, record)
      database.close()

      await expect(repository.getMatch(String(record.id))).rejects.toThrow()
      const inspect = await fixture.open()
      await expect(readRawRecord(inspect, String(record.id))).resolves.toEqual(record)
      inspect.close()
    })
  })

  it('round-trips complete and partial version-4 distributions and explicit nullable goal links', async () => {
    await withRepository(async (repository, fixture) => {
      const complete = {
        ...matchWithJerseyAssignment('v4-complete'),
        goals: [{
          id: 'linked-goal', side: 'home' as const, period: 1 as const, elapsedMs: 30_123,
          scorerPlayerId: 'player-alex', scorer: 'Alex snapshot',
          assistPlayerId: null, assist: '', description: '', createdAt: 150,
        }],
      }
      const partial = { ...matchWithJerseyAssignment('v4-partial', true), firstKickoffAt: null,
        clock: { period: 1 as const, elapsedMs: 0, status: 'not-started' as const, startedAt: null } }
      await repository.saveMatch(complete)
      await repository.saveMatch(partial)

      await expect(repository.getMatch(complete.id)).resolves.toEqual(complete)
      await expect(repository.getMatch(partial.id)).resolves.toEqual(partial)
      const database = await fixture.open()
      const completeRecord = await readRawRecord(database, complete.id) as Record<string, unknown>
      const partialRecord = await readRawRecord(database, partial.id) as Record<string, unknown>
      expect(completeRecord.recordVersion).toBe(4)
      expect(Object.hasOwn(completeRecord, 'firstKickoffAt')).toBe(true)
      expect(Object.hasOwn(completeRecord, 'jerseyAssignment')).toBe(true)
      expect(completeRecord.goals).toEqual(complete.goals)
      expect(partialRecord.firstKickoffAt).toBeNull()
      expect(partialRecord.jerseyAssignment).toEqual(partial.jerseyAssignment)
      expect(database.version).toBe(1)
      expect([...database.objectStoreNames]).toEqual(['matches'])
      database.close()
    })
  })

  it.each([
    ['missing firstKickoffAt', (record: Record<string, unknown>) => { delete record.firstKickoffAt }],
    ['missing jerseyAssignment', (record: Record<string, unknown>) => { delete record.jerseyAssignment }],
    ['duplicate jersey number', (record: Record<string, unknown>) => {
      const assignment = record.jerseyAssignment as {
        rows: Array<{ jersey: { jerseyId: string; number: number; size: string; ownerPlayerId: string | null } | null }>
      }
      assignment.rows[1].jersey = { jerseyId: 'another-jersey', number: 0, size: 'L', ownerPlayerId: null }
    }],
    ['known kickoff on an unstarted match', (record: Record<string, unknown>) => { record.clock = { period: 1, elapsedMs: 0, status: 'not-started', startedAt: null } }],
  ])('rejects version-3 records with %s', async (_description, corrupt) => {
    await withRepository(async (repository, fixture) => {
      const record = { ...matchWithJerseyAssignment(`invalid-v3-${String(_description)}`), recordVersion: 3 } as unknown as Record<string, unknown>
      corrupt(record)
      const database = await fixture.open()
      await writeRawRecord(database, record)
      database.close()

      await expect(repository.getMatch(String(record.id))).rejects.toThrow()
      await expect(repository.listMatches()).rejects.toThrow()
      const inspect = await fixture.open()
      await expect(readRawRecord(inspect, String(record.id))).resolves.toEqual(record)
      inspect.close()
    })
  })

  it('lazily upgrades a version-1 record and preserves its original backup across later saves', async () => {
    await withRepository(async (repository, fixture) => {
      const legacy = literalVersion1Match('legacy-lazy-upgrade', {
        period: 2, elapsedMs: 90_000, status: 'paused', startedAt: null,
      })
      const database = await fixture.open()
      await writeRawRecord(database, legacy)
      database.close()

      const normalized = await repository.getMatch(legacy.id)
      expect(normalized?.completedPeriodElapsedMs).toEqual({ 1: null, 2: null })
      const beforeSave = await fixture.open()
      await expect(readRawRecord(beforeSave, legacy.id)).resolves.toEqual(legacy)
      beforeSave.close()

      const firstSave = { ...normalized!, awayTeam: 'East Town', updatedAt: 1_699_999_700_000 }
      await repository.saveMatch(firstSave)
      const afterFirstSave = await fixture.open()
      const firstStored = await readRawRecord(afterFirstSave, legacy.id) as Record<string, unknown>
      expect(firstStored.recordVersion).toBe(4)
      expect(firstStored.legacyV1Backup).toEqual(legacy)
      afterFirstSave.close()

      const secondSave = { ...firstSave, awayTeam: 'West Town', updatedAt: 1_699_999_800_000 }
      await repository.saveMatch(secondSave)
      const afterSecondSave = await fixture.open()
      const secondStored = await readRawRecord(afterSecondSave, legacy.id) as Record<string, unknown>
      expect(secondStored.recordVersion).toBe(4)
      expect(secondStored.legacyV1Backup).toEqual(legacy)
      afterSecondSave.close()

      await expect(repository.getMatch(legacy.id)).resolves.toEqual(secondSave)
    })
  })

  it('supports mixed version-1 through version-4 records without bulk migration', async () => {
    await withRepository(async (repository, fixture) => {
      const legacy = literalVersion1Match('legacy-mixed-record')
      const version2 = literalVersion2Match('version-2-mixed-record')
      const version3 = literalVersion3Match('version-3-mixed-record')
      const version4 = literalVersion4Match('version-4-mixed-record')
      const database = await fixture.open()
      await writeRawRecord(database, legacy)
      await writeRawRecord(database, version2)
      await writeRawRecord(database, version3)
      await writeRawRecord(database, version4)
      database.close()

      const modern = createMatch('Harbor FC', 'Valley United', 1_699_999_600_000, 'new-mixed-record')
      await repository.saveMatch(modern)
      const loaded = await repository.listMatches()
      expect(loaded).toHaveLength(5)
      expect(loaded.find(({ id }) => id === modern.id)).toEqual(modern)
      expect(loaded.find(({ id }) => id === legacy.id)).toMatchObject({
        participation: null,
        firstKickoffAt: null,
        jerseyAssignment: null,
        completedPeriodElapsedMs: { 1: null, 2: null },
      })
      expect(loaded.find(({ id }) => id === version2.id)).toMatchObject({
        participation: null,
        firstKickoffAt: null,
        jerseyAssignment: null,
      })
      expect(loaded.find(({ id }) => id === version3.id)?.goals[0]).toMatchObject({ scorerPlayerId: null })
      expect(loaded.find(({ id }) => id === version4.id)?.goals[0]).toMatchObject({
        scorerPlayerId: 'player-alex', assistPlayerId: null,
      })

      const inspect = await fixture.open()
      await expect(readRawRecord(inspect, legacy.id)).resolves.toEqual(legacy)
      await expect(readRawRecord(inspect, version2.id)).resolves.toEqual(version2)
      await expect(readRawRecord(inspect, version3.id)).resolves.toEqual(version3)
      await expect(readRawRecord(inspect, version4.id)).resolves.toEqual(version4)
      const modernStored = await readRawRecord(inspect, modern.id) as Record<string, unknown>
      expect(modernStored.recordVersion).toBe(4)
      inspect.close()
    })
  })

  it('rejects unsupported record versions without overwriting them', async () => {
    await withRepository(async (repository, fixture) => {
      const unsupported = { ...literalVersion1Match('unsupported-version', {
        period: 1, elapsedMs: 0, status: 'not-started', startedAt: null,
      }), recordVersion: 99 }
      const database = await fixture.open()
      await writeRawRecord(database, unsupported)
      database.close()

      await expect(repository.getMatch(unsupported.id)).rejects.toThrow('Unsupported match record version: 99.')
      await expect(repository.saveMatch(createMatch('Changed', 'Record', 2_000, unsupported.id)))
        .rejects.toThrow('Unsupported match record version: 99.')

      const inspect = await fixture.open()
      await expect(readRawRecord(inspect, unsupported.id)).resolves.toEqual(unsupported)
      inspect.close()
    })
  })

  it('keeps a version-1 record intact when the upgrade transaction aborts, then retries idempotently', async () => {
    await withRepository(async (repository, fixture) => {
      const legacy = literalVersion1Match('legacy-aborted-upgrade', {
        period: 1, elapsedMs: 2_820_000, status: 'halftime', startedAt: null,
      })
      const database = await fixture.open()
      await writeRawRecord(database, legacy)
      database.close()
      const normalized = await repository.getMatch(legacy.id)
      const originalPut = IDBObjectStore.prototype.put
      const abortingPut = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
        this: IDBObjectStore,
        value: unknown,
        key?: IDBValidKey,
      ) {
        const request = originalPut.call(this, value, key)
        request.addEventListener('success', () => this.transaction.abort(), { once: true })
        return request
      })

      try {
        await expect(repository.saveMatch({ ...normalized!, awayTeam: 'Failed Update' })).rejects.toThrow()
      } finally {
        abortingPut.mockRestore()
      }

      const afterFailure = await fixture.open()
      await expect(readRawRecord(afterFailure, legacy.id)).resolves.toEqual(legacy)
      afterFailure.close()

      const retry = { ...normalized!, awayTeam: 'Successful Retry' }
      await repository.saveMatch(retry)
      const afterRetry = await fixture.open()
      const saved = await readRawRecord(afterRetry, legacy.id) as Record<string, unknown>
      expect(saved.recordVersion).toBe(4)
      expect(saved.legacyV1Backup).toEqual(legacy)
      afterRetry.close()
      await expect(repository.getMatch(legacy.id)).resolves.toEqual(retry)
    })
  })

  it('keeps a version-2 record and unrelated matches intact when a distribution write aborts, then retries', async () => {
    await withRepository(async (repository, fixture) => {
      const originalBackup = { raw: 'existing-v1-backup', details: [1, 2, 3] }
      const version2 = { ...literalVersion2Match('v2-distribution-retry'), legacyV1Backup: originalBackup }
      const database = await fixture.open()
      await writeRawRecord(database, version2)
      database.close()

      const unrelated = createMatch('Harbor FC', 'Valley United', 1_700_000_000_000, 'unrelated-v3-match')
      await repository.saveMatch(unrelated)
      const store = createMatchStore(repository)
      await store.load()
      const committed = store.matches.value.find(({ id }) => id === version2.id)!
      const unrelatedBefore = await repository.getMatch(unrelated.id)
      const candidate = {
        ...committed,
        updatedAt: committed.updatedAt + 1,
        participation: {
          ownSide: 'home' as const,
          squad: [
            { playerId: 'player-alex', nameSnapshot: 'Alex' },
            { playerId: 'player-ben', nameSnapshot: 'Ben' },
          ],
          starterIds: ['player-alex'],
          substitutions: [],
        },
        jerseyAssignment: {
          setId: 'set-blue',
          setNameSnapshot: 'Blue',
          rows: [
            { playerId: 'player-alex', jersey: { jerseyId: 'jersey-zero', number: 0, size: 'M', ownerPlayerId: null } },
            { playerId: 'player-ben', jersey: null },
          ],
        },
      }
      const originalPut = IDBObjectStore.prototype.put
      const abortingPut = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
        this: IDBObjectStore,
        value: unknown,
        key?: IDBValidKey,
      ) {
        const request = originalPut.call(this, value, key)
        request.addEventListener('success', () => this.transaction.abort(), { once: true })
        return request
      })

      try {
        await expect(store.persist(candidate)).rejects.toThrow()
      } finally {
        abortingPut.mockRestore()
      }

      expect(store.matches.value.find(({ id }) => id === version2.id)).toEqual(committed)
      const afterFailure = await fixture.open()
      await expect(readRawRecord(afterFailure, version2.id)).resolves.toEqual(version2)
      afterFailure.close()
      await expect(repository.getMatch(unrelated.id)).resolves.toEqual(unrelatedBefore)

      await store.persist(candidate)
      const afterRetry = await fixture.open()
      const upgraded = await readRawRecord(afterRetry, version2.id) as Record<string, unknown>
      expect(upgraded.recordVersion).toBe(4)
      expect(upgraded.legacyV1Backup).toEqual(originalBackup)
      expect(upgraded.jerseyAssignment).toEqual(candidate.jerseyAssignment)
      await expect(readRawRecord(afterRetry, unrelated.id)).resolves.toEqual({ ...unrelated, recordVersion: 4 })
      afterRetry.close()
      store.dispose()
    })
  })

  it('does not publish a failed legacy-record save to reactive store state', async () => {
    await withRepository(async (repository, fixture) => {
      const legacy = literalVersion1Match('legacy-reactive-failure', {
        period: 2, elapsedMs: 75_000, status: 'paused', startedAt: null,
      })
      const database = await fixture.open()
      await writeRawRecord(database, legacy)
      database.close()
      const store = createMatchStore(repository)
      await store.load()
      const committedBefore = store.matches.value[0]
      const originalPut = IDBObjectStore.prototype.put
      const abortingPut = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
        this: IDBObjectStore,
        value: unknown,
        key?: IDBValidKey,
      ) {
        const request = originalPut.call(this, value, key)
        request.addEventListener('success', () => this.transaction.abort(), { once: true })
        return request
      })

      try {
        await expect(store.persist({ ...committedBefore, awayTeam: 'Uncommitted Team' })).rejects.toThrow()
      } finally {
        abortingPut.mockRestore()
      }

      expect(store.matches.value).toEqual([committedBefore])
      const inspect = await fixture.open()
      await expect(readRawRecord(inspect, legacy.id)).resolves.toEqual(legacy)
      inspect.close()
      store.dispose()
    })
  })

  it('stores a plain snapshot when given a reactive match', async () => {
    await withRepository(async (repository) => {
      const match = reactive(createMatch('North City', 'South Town', 100, 'reactive-match'))

      await repository.saveMatch(match)

      await expect(repository.getMatch(match.id)).resolves.toEqual(match)
    })
  })

  it.each([
    ['valid legacy envelope', JSON.stringify({ version: 1, matches: [{ id: 'legacy', homeTeam: 'Old', awayTeam: 'Data' }] })],
    ['malformed legacy payload', '{invalid-json'],
    ['unknown legacy version', JSON.stringify({ version: 99, matches: [] })],
  ])('ignores and leaves a %s unchanged', async (_description, legacyPayload) => {
    const storageKey = 'touchline.match-store'
    const previousValue = localStorage.getItem(storageKey)
    localStorage.setItem(storageKey, legacyPayload)

    try {
      await withRepository(async (repository) => {
        const match = createMatch('North City', 'South Town', 100, 'indexed-match')
        await repository.saveMatch(match)
        await expect(repository.listMatches()).resolves.toEqual([match])
        expect(localStorage.getItem(storageKey)).toBe(legacyPayload)
      })
    } finally {
      if (previousValue === null) localStorage.removeItem(storageKey)
      else localStorage.setItem(storageKey, previousValue)
    }
  })

  it('updates one record without changing another and sorts by updatedAt descending', async () => {
    await withRepository(async (repository) => {
      const first = createMatch('North City', 'South Town', 100, 'match-first')
      const second = createMatch('Harbor FC', 'Valley United', 200, 'match-second')
      await repository.saveMatch(first)
      await repository.saveMatch(second)

      const updatedFirst = {
        ...first,
        awayTeam: 'East Town',
        updatedAt: 300,
        goals: [...first.goals],
      }
      await repository.saveMatch(updatedFirst)

      await expect(repository.getMatch(first.id)).resolves.toEqual(updatedFirst)
      await expect(repository.getMatch(second.id)).resolves.toEqual(second)
      await expect(repository.listMatches()).resolves.toEqual([updatedFirst, second])
    })
  })

  it('rejects a save when its transaction aborts after the put request succeeds', async () => {
    await withRepository(async (repository) => {
      const original = createMatch('North City', 'South Town', 100, 'abort-match')
      await repository.saveMatch(original)
      const updated = { ...original, awayTeam: 'East Town', updatedAt: 200 }
      const originalPut = IDBObjectStore.prototype.put
      const abortingPut = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
        this: IDBObjectStore,
        value: unknown,
        key?: IDBValidKey,
      ) {
        const request = originalPut.call(this, value, key)
        request.addEventListener('success', () => this.transaction.abort(), { once: true })
        return request
      })

      try {
        await expect(repository.saveMatch(updated)).rejects.toThrow()
      } finally {
        abortingPut.mockRestore()
      }

      await expect(repository.getMatch(original.id)).resolves.toEqual(original)
    })
  })

  it('can retry a failed database open after the unexpected database is removed', async () => {
    const fixture = createIndexedDbTestFixture()
    const repository = createMatchRepository({
      indexedDB: fixture.factory,
      databaseName: fixture.databaseName,
    })

    try {
      const upgradeRequest = fixture.factory.open(fixture.databaseName, 2)
      const unexpectedDatabase = await new Promise<IDBDatabase>((resolve, reject) => {
        upgradeRequest.onupgradeneeded = () => {
          upgradeRequest.result.createObjectStore('matches', { keyPath: 'id' })
        }
        upgradeRequest.onsuccess = () => resolve(upgradeRequest.result)
        upgradeRequest.onerror = () => reject(upgradeRequest.error)
      })
      unexpectedDatabase.close()

      await expect(repository.listMatches()).rejects.toThrow()
      await fixture.cleanup()
      await expect(repository.listMatches()).resolves.toEqual([])
    } finally {
      repository.close()
      await fixture.cleanup()
    }
  })

  it('reports blocked opens and closes connections that open after their request was abandoned', async () => {
    const fixture = createIndexedDbTestFixture()
    let blockFirstOpen = true
    let resolveLateOpen!: (database: IDBDatabase) => void
    const lateOpen = new Promise<IDBDatabase>((resolve) => {
      resolveLateOpen = resolve
    })
    const indexedDB = new Proxy(fixture.factory, {
      get(target, property) {
        if (property === 'open') {
          return (...args: Parameters<IDBFactory['open']>) => {
            const request = target.open(...args)
            request.addEventListener('success', () => resolveLateOpen(request.result), { once: true })
            return new Proxy(request, {
              set(openRequest, key, value) {
                Reflect.set(openRequest, key, value, openRequest)
                if (key === 'onblocked' && blockFirstOpen && typeof value === 'function') {
                  blockFirstOpen = false
                  value.call(openRequest, new IDBVersionChangeEvent('blocked', {
                    oldVersion: 1,
                    newVersion: 1,
                  }))
                }
                return true
              },
            })
          }
        }
        const value = Reflect.get(target, property, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    }) as IDBFactory
    const repository = createMatchRepository({ indexedDB, databaseName: fixture.databaseName })

    try {
      await expect(repository.listMatches()).rejects.toThrow('Close other Touchline tabs and retry.')
      const lateDatabase = await lateOpen
      expect(() => lateDatabase.transaction('matches', 'readonly')).toThrow()
      await expect(repository.listMatches()).resolves.toEqual([])
    } finally {
      repository.close()
      await fixture.cleanup()
    }
  })

  it('closes and invalidates its connection on versionchange and disposal', async () => {
    const fixture = createIndexedDbTestFixture()
    const connections: IDBDatabase[] = []
    const indexedDB = new Proxy(fixture.factory, {
      get(target, property) {
        if (property === 'open') {
          return (...args: Parameters<IDBFactory['open']>) => {
            const request = target.open(...args)
            request.addEventListener('success', () => connections.push(request.result), { once: true })
            return request
          }
        }
        const value = Reflect.get(target, property, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    }) as IDBFactory
    const repository = createMatchRepository({ indexedDB, databaseName: fixture.databaseName })

    try {
      await repository.listMatches()
      const firstConnection = connections[0]
      expect(firstConnection).toBeDefined()
      firstConnection.dispatchEvent(new IDBVersionChangeEvent('versionchange', {
        oldVersion: 1,
        newVersion: 2,
      }))
      expect(() => firstConnection.transaction('matches', 'readonly')).toThrow()

      await expect(repository.listMatches()).resolves.toEqual([])
      expect(connections).toHaveLength(2)
      const secondConnection = connections[1]
      repository.close()
      expect(() => secondConnection.transaction('matches', 'readonly')).toThrow()
      await expect(repository.listMatches()).rejects.toThrow('Match repository is closed.')
    } finally {
      repository.close()
      await fixture.cleanup()
    }
  })
})
