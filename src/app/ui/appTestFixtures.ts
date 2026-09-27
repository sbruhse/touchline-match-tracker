import { IDBFactory } from 'fake-indexeddb'
import type { Match } from '../../entities/match'

export function createAppDatabaseFixture(databaseName = 'touchline') {
  const factory = new IDBFactory()
  let connection: IDBDatabase | undefined
  return {
    factory,
    databaseName,
    open() {
      return new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open(databaseName, 1)
        request.onupgradeneeded = () => request.result.createObjectStore('matches', { keyPath: 'id' })
        request.onsuccess = () => {
          connection = request.result
          resolve(request.result)
        }
        request.onerror = () => reject(request.error ?? new Error('Failed to open app test database.'))
      })
    },
    cleanup() {
      connection?.close()
      return new Promise<void>((resolve, reject) => {
        const request = factory.deleteDatabase(databaseName)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error ?? new Error('Failed to delete app test database.'))
        request.onblocked = () => reject(new Error('App test database cleanup was blocked.'))
      })
    },
  }
}

export async function writeLiteralMatchRecord(database: IDBDatabase, match: Match): Promise<void> {
  const transaction = database.transaction('matches', 'readwrite')
  const complete = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'))
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
  })
  transaction.objectStore('matches').put(match)
  await complete
}

export async function readLiteralMatchRecord(database: IDBDatabase, id: string): Promise<Match | undefined> {
  const transaction = database.transaction('matches', 'readonly')
  const complete = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'))
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
  })
  const result = await new Promise<Match | undefined>((resolve, reject) => {
    const request = transaction.objectStore('matches').get(id)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
  })
  await complete
  return result
}

export async function listLiteralMatchRecords(database: IDBDatabase): Promise<Match[]> {
  const transaction = database.transaction('matches', 'readonly')
  const complete = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'))
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
  })
  const matches = await new Promise<Match[]>((resolve, reject) => {
    const request = transaction.objectStore('matches').getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
  })
  await complete
  return matches
}
