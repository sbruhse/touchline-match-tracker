import { describe, expect, it } from 'vitest'
import { createIndexedDbTestFixture } from './indexedDbTestFixtures'

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
  })
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'))
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
  })
}

describe('IndexedDB test fixture', () => {
  it('opens, writes, reads, closes, and cleans an isolated database', async () => {
    const fixture = createIndexedDbTestFixture()
    let database: IDBDatabase | undefined

    try {
      database = await fixture.open()
      const record = { id: 'fixture-match', homeTeam: 'North City', awayTeam: 'South Town' }
      const writeTransaction = database.transaction('matches', 'readwrite')
      const writeComplete = transactionComplete(writeTransaction)
      const writeRequest = requestResult(writeTransaction.objectStore('matches').put(record))
      await Promise.all([writeRequest, writeComplete])

      const readTransaction = database.transaction('matches', 'readonly')
      const readComplete = transactionComplete(readTransaction)
      const readRequest = requestResult(readTransaction.objectStore('matches').get(record.id))
      expect(await readRequest).toEqual(record)
      await readComplete

      const closedDatabase = database
      database.close()
      database = undefined
      expect(() => closedDatabase.transaction('matches', 'readonly')).toThrow()
    } finally {
      database?.close()
      await fixture.cleanup()
    }
  })

  it('starts a separate fixture with no records left by another factory', async () => {
    const fixture = createIndexedDbTestFixture()
    const database = await fixture.open()

    try {
      const transaction = database.transaction('matches', 'readonly')
      const complete = transactionComplete(transaction)
      const result = await requestResult(transaction.objectStore('matches').get('fixture-match'))
      await complete
      expect(result).toBeUndefined()
    } finally {
      await fixture.cleanup()
    }
  })
})
