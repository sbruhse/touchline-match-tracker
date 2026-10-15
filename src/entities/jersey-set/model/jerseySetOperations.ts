import {
  normalizeJersey,
  normalizeJerseyNumber,
  normalizeJerseySets,
  normalizeJerseySize,
  normalizeOwnerPlayerId,
  type Jersey,
  type JerseyNumberPreference,
  type JerseySet,
} from './jerseySet'

export interface JerseyDetailsInput {
  number: number
  size: string
  ownerPlayerId: string | null
}

export interface PlayerSetNumberInput {
  setId: string
  number: number | null
}

function requiredId(value: string, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`)
  return value.trim()
}

function setIndex(sets: readonly JerseySet[], id: string): number {
  const index = sets.findIndex((set) => set.id === id)
  if (index < 0) throw new Error(`Jersey set "${id}" no longer exists.`)
  return index
}

function jerseyIndex(set: JerseySet, id: string): number {
  const index = set.jerseys.findIndex((jersey) => jersey.id === id)
  if (index < 0) throw new Error(`Jersey "${id}" was not found in set "${set.id}".`)
  return index
}

function details(value: JerseyDetailsInput): Omit<Jersey, 'id'> {
  return {
    number: normalizeJerseyNumber(value.number),
    size: normalizeJerseySize(value.size),
    ownerPlayerId: normalizeOwnerPlayerId(value.ownerPlayerId),
  }
}

function replaceSet(sets: readonly JerseySet[], setId: string, replacement: JerseySet): JerseySet[] {
  const index = setIndex(sets, setId)
  const next = [...sets]
  next[index] = replacement
  return normalizeJerseySets(next)
}

export function addJerseySet(
  currentSets: readonly JerseySet[],
  name: string,
  now = Date.now(),
  id: string = crypto.randomUUID(),
): JerseySet[] {
  const sets = normalizeJerseySets(currentSets)
  const next: JerseySet = {
    id: requiredId(id, 'Jersey set ID'),
    name: requiredId(name, 'Jersey set name'),
    jerseys: [],
    preferredNumbers: [],
    createdAt: now,
    updatedAt: now,
  }
  return normalizeJerseySets([...sets, next])
}

export function renameJerseySet(
  currentSets: readonly JerseySet[],
  setId: string,
  name: string,
  now = Date.now(),
): JerseySet[] {
  const sets = normalizeJerseySets(currentSets)
  const index = setIndex(sets, requiredId(setId, 'Jersey set ID'))
  const set = sets[index]
  const next = [...sets]
  next[index] = { ...set, name: requiredId(name, 'Jersey set name'), updatedAt: now }
  return normalizeJerseySets(next)
}

export function removeJerseySet(currentSets: readonly JerseySet[], setId: string): JerseySet[] {
  const sets = normalizeJerseySets(currentSets)
  const index = setIndex(sets, requiredId(setId, 'Jersey set ID'))
  return normalizeJerseySets(sets.filter((_, setIndexValue) => setIndexValue !== index))
}

export function addJersey(
  currentSets: readonly JerseySet[],
  setId: string,
  input: JerseyDetailsInput,
  now = Date.now(),
  jerseyId: string = crypto.randomUUID(),
): JerseySet[] {
  const sets = normalizeJerseySets(currentSets)
  const index = setIndex(sets, requiredId(setId, 'Jersey set ID'))
  const set = sets[index]
  const jersey = normalizeJersey({ id: jerseyId, ...details(input) }, set.jerseys.length)
  return replaceSet(sets, set.id, { ...set, jerseys: [...set.jerseys, jersey], updatedAt: now })
}

export function updateJersey(
  currentSets: readonly JerseySet[],
  setId: string,
  jerseyId: string,
  input: JerseyDetailsInput,
  now = Date.now(),
): JerseySet[] {
  const sets = normalizeJerseySets(currentSets)
  const index = setIndex(sets, requiredId(setId, 'Jersey set ID'))
  const set = sets[index]
  const itemIndex = jerseyIndex(set, requiredId(jerseyId, 'Jersey ID'))
  const nextJerseys = [...set.jerseys]
  nextJerseys[itemIndex] = normalizeJersey({ id: nextJerseys[itemIndex].id, ...details(input) }, itemIndex)
  return replaceSet(sets, set.id, { ...set, jerseys: nextJerseys, updatedAt: now })
}

export function removeJersey(
  currentSets: readonly JerseySet[],
  setId: string,
  jerseyId: string,
  now = Date.now(),
): JerseySet[] {
  const sets = normalizeJerseySets(currentSets)
  const index = setIndex(sets, requiredId(setId, 'Jersey set ID'))
  const set = sets[index]
  const itemIndex = jerseyIndex(set, requiredId(jerseyId, 'Jersey ID'))
  const jerseys = set.jerseys.filter((_, jerseyIndexValue) => jerseyIndexValue !== itemIndex)
  return replaceSet(sets, set.id, { ...set, jerseys, updatedAt: now })
}

export function updatePlayerSetNumbers(
  currentSets: readonly JerseySet[],
  playerId: string,
  updates: readonly PlayerSetNumberInput[],
  now = Date.now(),
): JerseySet[] {
  const sets = normalizeJerseySets(currentSets)
  const ownerId = requiredId(playerId, 'Player ID')
  const normalizedUpdates = updates.map(({ setId, number }) => ({
    setId: requiredId(setId, 'Jersey set ID'),
    number: number === null ? null : normalizeJerseyNumber(number, 'Preferred number'),
  }))
  const updatedSetIds = new Set<string>()
  for (const update of normalizedUpdates) {
    if (updatedSetIds.has(update.setId)) throw new Error(`Duplicate preference update for jersey set "${update.setId}".`)
    updatedSetIds.add(update.setId)
    setIndex(sets, update.setId)
  }

  const bySetId = new Map(normalizedUpdates.map((update) => [update.setId, update]))
  return normalizeJerseySets(sets.map((set) => {
    const update = bySetId.get(set.id)
    if (!update) return set
    const currentPreferenceIndex = set.preferredNumbers.findIndex((preference) => preference.playerId === ownerId)
    const preferredNumbers: JerseyNumberPreference[] = [...set.preferredNumbers]
    if (update.number === null) {
      if (currentPreferenceIndex >= 0) preferredNumbers.splice(currentPreferenceIndex, 1)
    } else if (currentPreferenceIndex >= 0) {
      preferredNumbers[currentPreferenceIndex] = { playerId: ownerId, number: update.number }
    } else {
      preferredNumbers.push({ playerId: ownerId, number: update.number })
    }
    return { ...set, preferredNumbers, updatedAt: now }
  }))
}
