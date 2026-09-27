import { IDBFactory } from 'fake-indexeddb'

export interface IndexedDbTestFixture {
  factory: IDBFactory
  databaseName: string
  open: () => Promise<IDBDatabase>
  cleanup: () => Promise<void>
}

export function createIndexedDbTestFixture(databaseName = 'touchline-test'): IndexedDbTestFixture {
  const factory = new IDBFactory()
  let connection: IDBDatabase | undefined

  return {
    factory,
    databaseName,
    open() {
      return new Promise((resolve, reject) => {
        const request = factory.open(databaseName, 1)
        request.onupgradeneeded = () => {
          request.result.createObjectStore('matches', { keyPath: 'id' })
        }
        request.onsuccess = () => {
          connection = request.result
          resolve(connection)
        }
        request.onerror = () => reject(request.error ?? new Error('Failed to open test database.'))
      })
    },
    cleanup() {
      connection?.close()
      return new Promise((resolve, reject) => {
        const request = factory.deleteDatabase(databaseName)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error ?? new Error('Failed to delete test database.'))
        request.onblocked = () => reject(new Error('Test database cleanup was blocked.'))
      })
    },
  }
}
