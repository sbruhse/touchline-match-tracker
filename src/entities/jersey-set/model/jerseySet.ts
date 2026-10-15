export interface Jersey {
  id: string
  number: number
  size: string
  ownerPlayerId: string | null
}

export interface JerseyNumberPreference {
  playerId: string
  number: number
}

export interface JerseySet {
  id: string
  name: string
  jerseys: Jersey[]
  preferredNumbers: JerseyNumberPreference[]
  createdAt: number
  updatedAt: number
}

export type ReadonlyJerseySet = Readonly<Omit<JerseySet, 'jerseys' | 'preferredNumbers'>> & {
  readonly jerseys: readonly Readonly<Jersey>[]
  readonly preferredNumbers: readonly Readonly<JerseyNumberPreference>[]
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`)
  }
  return value as Record<string, unknown>
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`)
  return value.trim()
}

function finiteTimestamp(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`)
  }
  return value
}

export function normalizeJerseyNumber(value: unknown, label = 'Jersey number'): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative whole number.`)
  }
  return value
}

export function normalizeJerseySize(value: unknown, label = 'Jersey size'): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`)
  return value.trim()
}

export function normalizeOwnerPlayerId(value: unknown): string | null {
  if (value === null) return null
  return requiredText(value, 'Owner player ID')
}

export function normalizeJersey(value: unknown, index = 0): Jersey {
  const label = `Jersey ${index + 1}`
  const record = asRecord(value, label)
  return {
    id: requiredText(record.id, `${label} ID`),
    number: normalizeJerseyNumber(record.number, `${label} number`),
    size: normalizeJerseySize(record.size, `${label} size`),
    ownerPlayerId: normalizeOwnerPlayerId(record.ownerPlayerId),
  }
}

export function normalizeJerseyNumberPreference(value: unknown, index = 0): JerseyNumberPreference {
  const label = `Preferred number ${index + 1}`
  const record = asRecord(value, label)
  return {
    playerId: requiredText(record.playerId, `${label} player ID`),
    number: normalizeJerseyNumber(record.number, `${label} number`),
  }
}

export function normalizeJerseySet(value: unknown, index = 0): JerseySet {
  const label = `Jersey set ${index + 1}`
  const record = asRecord(value, label)
  if (!Array.isArray(record.jerseys)) throw new Error(`${label} jerseys must be an array.`)
  if (!Array.isArray(record.preferredNumbers)) throw new Error(`${label} preferred numbers must be an array.`)
  const jerseys = record.jerseys.map((jersey, jerseyIndex) => normalizeJersey(jersey, jerseyIndex))
  const preferredNumbers = record.preferredNumbers.map((preference, preferenceIndex) =>
    normalizeJerseyNumberPreference(preference, preferenceIndex))
  const preferencePlayerIds = new Set<string>()
  for (const preference of preferredNumbers) {
    if (preferencePlayerIds.has(preference.playerId)) {
      throw new Error(`${label} has duplicate preferred-number player ID "${preference.playerId}".`)
    }
    preferencePlayerIds.add(preference.playerId)
  }
  return {
    id: requiredText(record.id, `${label} ID`),
    name: requiredText(record.name, `${label} name`),
    jerseys,
    preferredNumbers,
    createdAt: finiteTimestamp(record.createdAt, `${label} createdAt`),
    updatedAt: finiteTimestamp(record.updatedAt, `${label} updatedAt`),
  }
}

export function normalizeJerseySets(value: unknown): JerseySet[] {
  if (!Array.isArray(value)) throw new Error('Jersey sets must be an array.')
  const sets = value.map((set, index) => normalizeJerseySet(set, index))
  const setIds = new Set<string>()
  const jerseyIds = new Set<string>()
  for (const set of sets) {
    if (setIds.has(set.id)) throw new Error(`Duplicate jersey set ID "${set.id}".`)
    setIds.add(set.id)
    for (const jersey of set.jerseys) {
      if (jerseyIds.has(jersey.id)) throw new Error(`Duplicate jersey ID "${jersey.id}".`)
      jerseyIds.add(jersey.id)
    }
  }
  return sets
}
