import type { JerseySet } from '../model/jerseySet'
import { normalizeJerseySets } from '../model/jerseySet'

export const JERSEY_SET_STORAGE_KEY = 'touchline.jersey-set-store'
export const JERSEY_SET_STORAGE_VERSION = 1

export interface JerseySetRepository {
  listJerseySets(): Promise<JerseySet[]>
  saveJerseySets(sets: readonly JerseySet[]): Promise<void>
  close(): void
}

export interface JerseySetStorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface JerseySetRepositoryOptions {
  storage?: JerseySetStorageLike
  key?: string
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid jersey-set storage: ${label} must be an object.`)
  }
  return value as Record<string, unknown>
}

export function createJerseySetRepository(options: JerseySetRepositoryOptions = {}): JerseySetRepository {
  const key = options.key ?? JERSEY_SET_STORAGE_KEY
  let closed = false

  function storage(): JerseySetStorageLike {
    if (closed) throw new Error('Jersey-set repository is closed.')
    const resolved = options.storage ?? globalThis.localStorage
    if (!resolved) throw new Error('Local jersey-set storage is not available in this browser.')
    return resolved
  }

  return {
    async listJerseySets() {
      const payload = storage().getItem(key)
      if (payload === null) return []

      let envelope: unknown
      try {
        envelope = JSON.parse(payload)
      } catch (error) {
        throw new Error('Saved jersey-set data is not valid JSON.', { cause: error })
      }
      const record = asRecord(envelope, 'root')
      if (record.version !== JERSEY_SET_STORAGE_VERSION) {
        throw new Error(`Unsupported jersey-set storage version: ${String(record.version)}.`)
      }
      try {
        return normalizeJerseySets(record.sets)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The saved set collection is malformed.'
        throw new Error(`Invalid jersey-set storage: ${message}`, { cause: error })
      }
    },
    async saveJerseySets(sets) {
      const snapshot = normalizeJerseySets(sets)
      storage().setItem(key, JSON.stringify({ version: JERSEY_SET_STORAGE_VERSION, sets: snapshot }))
    },
    close() {
      closed = true
    },
  }
}
