export {
  createJerseySetRepository,
  JERSEY_SET_STORAGE_KEY,
  JERSEY_SET_STORAGE_VERSION,
} from './api/jerseySetStorage'
export type {
  JerseySetRepository,
  JerseySetRepositoryOptions,
  JerseySetStorageLike,
} from './api/jerseySetStorage'
export {
  normalizeJersey,
  normalizeJerseyNumber,
  normalizeJerseyNumberPreference,
  normalizeJerseySet,
  normalizeJerseySets,
  normalizeJerseySize,
  normalizeOwnerPlayerId,
} from './model/jerseySet'
export type { Jersey, JerseyNumberPreference, JerseySet, ReadonlyJerseySet } from './model/jerseySet'
export {
  addJersey,
  addJerseySet,
  removeJersey,
  removeJerseySet,
  renameJerseySet,
  updateJersey,
  updatePlayerSetNumbers,
} from './model/jerseySetOperations'
export type { JerseyDetailsInput, PlayerSetNumberInput } from './model/jerseySetOperations'
export { createJerseyIdentityLabels, createJerseySetIdentityLabels } from './model/identityLabels'
export {
  compareAdultSizeLabels,
  getAdultSizeRank,
  isAdultSizeExactOrOneLarger,
} from './model/adultSize'
export { createJerseySetStore, provideJerseySetStore, useJerseySetStore } from './model/jerseySetStore'
export type { JerseySetStore } from './model/jerseySetStore'
