import type {
  ClockState,
  CompletedPeriodElapsedMs,
  GoalEvent,
  Match,
  MatchJerseyAssignment,
  MatchJerseySnapshot,
  MatchParticipation,
  MatchPeriod,
  MatchSide,
  MatchStatus,
  MatchSquadPlayer,
  SubstitutionEvent,
} from '../model/match'
import { copyMatchSnapshot } from '../model/matchSnapshot'
import { validateMatchJerseyAssignment } from '../model/matchJerseyAssignment'
import { validateGoalAttribution } from '../model/goalAttribution'

export const MATCH_DATABASE_NAME = 'touchline'
export const MATCH_DATABASE_VERSION = 1
export const MATCH_OBJECT_STORE = 'matches'

export interface MatchRepository {
  listMatches(): Promise<Match[]>
  getMatch(id: string): Promise<Match | undefined>
  saveMatch(match: Match): Promise<void>
  close(): void
}

export interface MatchRepositoryOptions {
  indexedDB?: IDBFactory
  databaseName?: string
}

function asError(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback, { cause: error })
}

type StoredRecord = Record<string, unknown>

function isRecord(value: unknown): value is StoredRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredRecord(value: unknown, label: string): StoredRecord {
  if (!isRecord(value)) throw new Error(`Invalid match record: ${label} must be an object.`)
  return value
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid match record: ${label} must be a finite number.`)
  }
  return value
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid match record: ${label} must be a string.`)
  return value
}

function matchPeriod(value: unknown, label: string): MatchPeriod {
  if (value !== 1 && value !== 2) throw new Error(`Invalid match record: ${label} must be 1 or 2.`)
  return value
}

function matchSide(value: unknown, label: string): MatchSide {
  if (value !== 'home' && value !== 'away') throw new Error(`Invalid match record: ${label} must be home or away.`)
  return value
}

function matchStatus(value: unknown, label: string): MatchStatus {
  if (value !== 'not-started' && value !== 'running' && value !== 'paused'
    && value !== 'halftime' && value !== 'full-time') {
    throw new Error(`Invalid match record: ${label} is not a supported match status.`)
  }
  return value
}

function parseClock(value: unknown): ClockState {
  const clock = requiredRecord(value, 'clock')
  const startedAt = clock.startedAt === null ? null : finiteNumber(clock.startedAt, 'clock.startedAt')
  return {
    period: matchPeriod(clock.period, 'clock.period'),
    elapsedMs: finiteNumber(clock.elapsedMs, 'clock.elapsedMs'),
    status: matchStatus(clock.status, 'clock.status'),
    startedAt,
  }
}

function parseGoal(value: unknown, index: number, version: number | undefined): GoalEvent {
  const label = `goals[${index}]`
  const goal = requiredRecord(value, label)
  if (version === 4 && (!Object.hasOwn(goal, 'scorerPlayerId') || !Object.hasOwn(goal, 'assistPlayerId'))) {
    throw new Error(`Invalid version-4 match record: ${label} must explicitly include scorerPlayerId and assistPlayerId.`)
  }
  return {
    id: stringValue(goal.id, `${label}.id`),
    side: matchSide(goal.side, `${label}.side`),
    period: matchPeriod(goal.period, `${label}.period`),
    elapsedMs: finiteNumber(goal.elapsedMs, `${label}.elapsedMs`),
    scorerPlayerId: version === 4
      ? goal.scorerPlayerId === null ? null : stringValue(goal.scorerPlayerId, `${label}.scorerPlayerId`)
      : null,
    scorer: stringValue(goal.scorer, `${label}.scorer`),
    assistPlayerId: version === 4
      ? goal.assistPlayerId === null ? null : stringValue(goal.assistPlayerId, `${label}.assistPlayerId`)
      : null,
    assist: stringValue(goal.assist, `${label}.assist`),
    description: stringValue(goal.description, `${label}.description`),
    createdAt: finiteNumber(goal.createdAt, `${label}.createdAt`),
  }
}

function parseParticipation(value: unknown): MatchParticipation | null {
  if (value === null) return null
  const participation = requiredRecord(value, 'participation')
  if (!Array.isArray(participation.squad) || !Array.isArray(participation.starterIds)
    || !Array.isArray(participation.substitutions)) {
    throw new Error('Invalid match record: participation collections must be arrays.')
  }
  const squad: MatchSquadPlayer[] = participation.squad.map((value, index) => {
    const player = requiredRecord(value, `participation.squad[${index}]`)
    return {
      playerId: stringValue(player.playerId, `participation.squad[${index}].playerId`),
      nameSnapshot: stringValue(player.nameSnapshot, `participation.squad[${index}].nameSnapshot`),
    }
  })
  const starterIds = participation.starterIds.map((value, index) =>
    stringValue(value, `participation.starterIds[${index}]`),
  )
  const substitutions: SubstitutionEvent[] = participation.substitutions.map((value, index) => {
    const label = `participation.substitutions[${index}]`
    const event = requiredRecord(value, label)
    const sequence = finiteNumber(event.sequence, `${label}.sequence`)
    if (!Number.isInteger(sequence)) throw new Error(`Invalid match record: ${label}.sequence must be an integer.`)
    return {
      id: stringValue(event.id, `${label}.id`),
      outgoingPlayerId: stringValue(event.outgoingPlayerId, `${label}.outgoingPlayerId`),
      incomingPlayerId: stringValue(event.incomingPlayerId, `${label}.incomingPlayerId`),
      period: matchPeriod(event.period, `${label}.period`),
      elapsedMs: finiteNumber(event.elapsedMs, `${label}.elapsedMs`),
      sequence,
      createdAt: finiteNumber(event.createdAt, `${label}.createdAt`),
    }
  })
  return {
    ownSide: matchSide(participation.ownSide, 'participation.ownSide'),
    squad,
    starterIds,
    substitutions,
  }
}

function parseJerseyAssignment(value: unknown): MatchJerseyAssignment | null {
  if (value === null) return null
  const assignment = requiredRecord(value, 'jerseyAssignment')
  if (!Array.isArray(assignment.rows)) {
    throw new Error('Invalid match record: jerseyAssignment.rows must be an array.')
  }
  return {
    setId: stringValue(assignment.setId, 'jerseyAssignment.setId'),
    setNameSnapshot: stringValue(assignment.setNameSnapshot, 'jerseyAssignment.setNameSnapshot'),
    rows: assignment.rows.map((value, index) => {
      const label = `jerseyAssignment.rows[${index}]`
      const row = requiredRecord(value, label)
      let jersey: MatchJerseySnapshot | null = null
      if (row.jersey !== null) {
        const storedJersey = requiredRecord(row.jersey, `${label}.jersey`)
        const number = finiteNumber(storedJersey.number, `${label}.jersey.number`)
        if (!Number.isSafeInteger(number) || number < 0) {
          throw new Error(`Invalid match record: ${label}.jersey.number must be a nonnegative whole number.`)
        }
        jersey = {
          jerseyId: stringValue(storedJersey.jerseyId, `${label}.jersey.jerseyId`),
          number,
          size: stringValue(storedJersey.size, `${label}.jersey.size`),
          ownerPlayerId: storedJersey.ownerPlayerId === null
            ? null
            : stringValue(storedJersey.ownerPlayerId, `${label}.jersey.ownerPlayerId`),
        }
      }
      return { playerId: stringValue(row.playerId, `${label}.playerId`), jersey }
    }),
  }
}

function parseCompletedPeriods(value: unknown): CompletedPeriodElapsedMs {
  const durations = requiredRecord(value, 'completedPeriodElapsedMs')
  const parseDuration = (period: MatchPeriod): number | null => {
    const duration = durations[period]
    if (duration === null) return null
    const parsed = finiteNumber(duration, `completedPeriodElapsedMs.${period}`)
    if (parsed < 0) throw new Error(`Invalid match record: completed period ${period} cannot be negative.`)
    return parsed
  }
  return { 1: parseDuration(1), 2: parseDuration(2) }
}

function inferCompletedPeriods(clock: ClockState): CompletedPeriodElapsedMs {
  if (clock.status === 'halftime' && clock.period === 1) {
    return { 1: clock.elapsedMs, 2: null }
  }
  if (clock.status === 'full-time') {
    return clock.period === 1
      ? { 1: clock.elapsedMs, 2: null }
      : { 1: null, 2: clock.elapsedMs }
  }
  return { 1: null, 2: null }
}

function parseMatchCore(
  record: StoredRecord,
  version: number | undefined,
): Omit<Match, 'participation' | 'completedPeriodElapsedMs' | 'firstKickoffAt' | 'jerseyAssignment'> {
  if (!Array.isArray(record.goals)) throw new Error('Invalid match record: goals must be an array.')
  return {
    id: stringValue(record.id, 'id'),
    homeTeam: stringValue(record.homeTeam, 'homeTeam'),
    awayTeam: stringValue(record.awayTeam, 'awayTeam'),
    createdAt: finiteNumber(record.createdAt, 'createdAt'),
    updatedAt: finiteNumber(record.updatedAt, 'updatedAt'),
    clock: parseClock(record.clock),
    goals: record.goals.map((goal, index) => parseGoal(goal, index, version)),
  }
}

function normalizeStoredRecord(value: unknown): Match {
  const record = requiredRecord(value, 'root')
  const version = record.recordVersion
  if (version !== undefined && version !== 1 && version !== 2 && version !== 3 && version !== 4) {
    throw new Error(`Unsupported match record version: ${String(version)}.`)
  }

  const core = parseMatchCore(record, version)
  if (version === 3 || version === 4) {
    if (!Object.hasOwn(record, 'participation') || !Object.hasOwn(record, 'completedPeriodElapsedMs')
      || !Object.hasOwn(record, 'firstKickoffAt') || !Object.hasOwn(record, 'jerseyAssignment')) {
      throw new Error(`Invalid version-${version} match record: participation, completed period durations, first kickoff, and jersey assignment are required.`)
    }
    const participation = parseParticipation(record.participation)
    const firstKickoffAt = record.firstKickoffAt === null
      ? null
      : finiteNumber(record.firstKickoffAt, 'firstKickoffAt')
    if (firstKickoffAt !== null && core.clock.status === 'not-started') {
      throw new Error(`Invalid version-${version} match record: firstKickoffAt requires a match that has started.`)
    }
    const jerseyAssignment = parseJerseyAssignment(record.jerseyAssignment)
    const assignmentError = validateMatchJerseyAssignment(participation, jerseyAssignment)
    if (assignmentError) throw new Error(`Invalid version-${version} match record: ${assignmentError}`)
    if (version === 4) {
      for (const goal of core.goals) {
        const attributionError = validateGoalAttribution(goal, participation)
        if (attributionError) throw new Error(`Invalid version-4 match record: ${attributionError}`)
      }
    }
    return {
      ...core,
      participation,
      completedPeriodElapsedMs: parseCompletedPeriods(record.completedPeriodElapsedMs),
      firstKickoffAt,
      jerseyAssignment,
    }
  }
  if (version === 2) {
    if (!Object.hasOwn(record, 'participation') || !Object.hasOwn(record, 'completedPeriodElapsedMs')) {
      throw new Error('Invalid version-2 match record: participation and completed period durations are required.')
    }
    return {
      ...core,
      participation: parseParticipation(record.participation),
      firstKickoffAt: null,
      jerseyAssignment: null,
      completedPeriodElapsedMs: parseCompletedPeriods(record.completedPeriodElapsedMs),
    }
  }

  const inferred = inferCompletedPeriods(core.clock)
  let savedDurations: CompletedPeriodElapsedMs = { 1: null, 2: null }
  if (record.completedPeriodElapsedMs !== undefined && record.completedPeriodElapsedMs !== null) {
    const durations = requiredRecord(record.completedPeriodElapsedMs, 'completedPeriodElapsedMs')
    const readOptionalDuration = (period: MatchPeriod): number | null => {
      const duration = durations[period]
      if (duration === undefined || duration === null) return null
      const parsed = finiteNumber(duration, `completedPeriodElapsedMs.${period}`)
      if (parsed < 0) throw new Error(`Invalid match record: completed period ${period} cannot be negative.`)
      return parsed
    }
    savedDurations = { 1: readOptionalDuration(1), 2: readOptionalDuration(2) }
  }
  return {
    ...core,
    participation: record.participation === undefined ? null : parseParticipation(record.participation),
    firstKickoffAt: null,
    jerseyAssignment: null,
    completedPeriodElapsedMs: {
      1: savedDurations[1] ?? inferred[1],
      2: savedDurations[2] ?? inferred[2],
    },
  }
}

function plainMatchSnapshot(match: Match): Match {
  return copyMatchSnapshot(match)
}

function version4Record(match: Match, existingValue: unknown): StoredRecord {
  const snapshot = plainMatchSnapshot(match)
  const candidate: StoredRecord = { ...snapshot, recordVersion: 4 }
  normalizeStoredRecord(candidate)
  if (existingValue === undefined) return candidate

  normalizeStoredRecord(existingValue)
  const existing = requiredRecord(existingValue, 'existing record')
  if (existing.recordVersion === undefined || existing.recordVersion === 1) {
    return { ...candidate, legacyV1Backup: structuredClone(existingValue) }
  }
  if (!Object.hasOwn(existing, 'legacyV1Backup')) return candidate
  return { ...candidate, legacyV1Backup: structuredClone(existing.legacyV1Backup) }
}

function runTransaction<T>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  requestFor: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction
    try {
      transaction = database.transaction(MATCH_OBJECT_STORE, mode)
    } catch (error) {
      reject(asError(error, 'Failed to start an IndexedDB transaction.'))
      return
    }

    let result: T
    let requestSucceeded = false
    let settled = false
    const fail = (error: unknown, message: string) => {
      if (settled) return
      settled = true
      reject(asError(error, message))
    }

    transaction.oncomplete = () => {
      if (settled) return
      if (!requestSucceeded) {
        fail(null, 'IndexedDB transaction completed without a successful request.')
        return
      }
      settled = true
      resolve(result)
    }
    transaction.onabort = () => fail(transaction.error, 'IndexedDB transaction was aborted.')
    transaction.onerror = () => fail(transaction.error, 'IndexedDB transaction failed.')

    try {
      const request = requestFor(transaction.objectStore(MATCH_OBJECT_STORE))
      request.onsuccess = () => {
        result = request.result
        requestSucceeded = true
      }
      request.onerror = () => fail(request.error, 'IndexedDB request failed.')
    } catch (error) {
      fail(error, 'IndexedDB request failed.')
      try {
        transaction.abort()
      } catch {
        // The transaction may already have completed or aborted.
      }
    }
  })
}

function writeVersion4Record(database: IDBDatabase, match: Match): Promise<void> {
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction
    try {
      transaction = database.transaction(MATCH_OBJECT_STORE, 'readwrite')
    } catch (error) {
      reject(asError(error, 'Failed to start an IndexedDB transaction.'))
      return
    }

    let failure: Error | undefined
    let putRequested = false
    const abort = (error: unknown, fallback: string) => {
      failure = asError(error, fallback)
      try {
        transaction.abort()
      } catch {
        // The transaction may already have completed or aborted.
      }
    }

    transaction.oncomplete = () => {
      if (failure) reject(failure)
      else if (!putRequested) reject(new Error('IndexedDB transaction completed without writing a match.'))
      else resolve()
    }
    transaction.onabort = () => reject(failure ?? asError(transaction.error, 'IndexedDB transaction was aborted.'))
    transaction.onerror = () => {
      failure ??= asError(transaction.error, 'IndexedDB transaction failed.')
    }

    try {
      const store = transaction.objectStore(MATCH_OBJECT_STORE)
      const getRequest = store.get(match.id)
      getRequest.onerror = () => {
        failure ??= asError(getRequest.error, 'Failed to read the existing match before saving.')
      }
      getRequest.onsuccess = () => {
        try {
          const record = version4Record(match, getRequest.result)
          const putRequest = store.put(record)
          putRequested = true
          putRequest.onerror = () => {
            failure ??= asError(putRequest.error, 'Failed to save the match record.')
          }
        } catch (error) {
          abort(error, 'Failed to prepare the versioned match record.')
        }
      }
    } catch (error) {
      abort(error, 'Failed to save the match record.')
    }
  })
}

export function createMatchRepository(options: MatchRepositoryOptions = {}): MatchRepository {
  const databaseName = options.databaseName ?? MATCH_DATABASE_NAME
  let connection: IDBDatabase | undefined
  let opening: Promise<IDBDatabase> | undefined
  let closed = false

  function openDatabase(): Promise<IDBDatabase> {
    if (closed) return Promise.reject(new Error('Match repository is closed.'))
    if (connection) return Promise.resolve(connection)
    if (opening) return opening

    const factory = options.indexedDB ?? globalThis.indexedDB
    if (!factory) return Promise.reject(new Error('IndexedDB is not available in this browser.'))

    let request: IDBOpenDBRequest
    try {
      request = factory.open(databaseName, MATCH_DATABASE_VERSION)
    } catch (error) {
      return Promise.reject(asError(error, 'Failed to open the match database.'))
    }

    let abandoned = false
    const openPromise = new Promise<IDBDatabase>((resolve, reject) => {
      let settled = false
      const fail = (error: unknown, message: string) => {
        abandoned = true
        if (settled) return
        settled = true
        reject(asError(error, message))
      }

      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(MATCH_OBJECT_STORE)) {
          database.createObjectStore(MATCH_OBJECT_STORE, { keyPath: 'id' })
        }
      }
      request.onblocked = () => fail(
        null,
        'Opening the match database is blocked. Close other Touchline tabs and retry.',
      )
      request.onerror = () => fail(request.error, 'Failed to open the match database.')
      request.onsuccess = () => {
        const database = request.result
        if (abandoned || closed) {
          database.close()
          fail(null, 'The match database opened after its request was abandoned.')
          return
        }

        database.onversionchange = () => {
          database.close()
          if (connection === database) connection = undefined
        }
        connection = database
        if (settled) {
          database.close()
          if (connection === database) connection = undefined
          return
        }
        settled = true
        resolve(database)
      }
    })

    opening = openPromise
    const clearOpening = () => {
      if (opening === openPromise) opening = undefined
    }
    void openPromise.then(clearOpening, clearOpening)
    return openPromise
  }

  return {
    async listMatches() {
      const database = await openDatabase()
      const records = await runTransaction<unknown[]>(database, 'readonly', (store) => store.getAll())
      const matches = records.map(normalizeStoredRecord)
      return matches.sort((a, b) => b.updatedAt - a.updatedAt)
    },
    async getMatch(id) {
      const database = await openDatabase()
      const record = await runTransaction<unknown>(database, 'readonly', (store) => store.get(id))
      return record === undefined ? undefined : normalizeStoredRecord(record)
    },
    async saveMatch(match) {
      const database = await openDatabase()
      await writeVersion4Record(database, plainMatchSnapshot(match))
    },
    close() {
      closed = true
      connection?.close()
      connection = undefined
    },
  }
}
