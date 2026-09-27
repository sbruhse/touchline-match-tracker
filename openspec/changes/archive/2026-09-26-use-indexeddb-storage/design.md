# Design

## Context

See `proposal.md` for motivation and scope, and the football-match-tracking delta for the behavior contract. The current `entities/match/api/matchStorage.ts` parses and rewrites a version-1 JSON collection in `touchline.match-store`. `matchStore.ts` synchronously writes and reloads that collection. Features immediately emit success events, and the creation form immediately clears its fields. The UI assumes storage is ready on mount and shows a static saved badge.

Tests currently inspect localStorage directly. App tests use jsdom and fake time for clock behavior; the Firefox flow modifies the stored clock anchor to exercise stoppage time. The in-progress FSD refactor has moved the app shell to `src/app/ui/`; its remaining work includes browser-test relocation. Implementation targets the completed FSD layout and does not duplicate that refactor.

The unimplemented player-management change assumes localStorage version-2 envelopes and a version-1 backup/migration. That design is incompatible with this explicit no-migration IndexedDB cutover. Sequence the work as FSD completion, this change, then a separately authorized revision of the player-management plan before applying that feature. No player entity exists in the inspected source.

## Goals / Non-Goals

**Goals:**
- Preserve pure match/clock/goal models while replacing the persistence boundary.
- Persist one match per transaction and publish saved reactive state only after transaction completion.
- Keep async operation ordering and failure handling explicit across all current write paths.
- Make the storage adapter independently testable with real IndexedDB semantics.

**Non-Goals:**
- A generic repository framework, normalized goal tables, speculative player tables, or a new state-management library.
- Optimistic updates, background write queues, cross-tab conflict resolution, or an offline app-shell/PWA cache.
- Any legacy localStorage import, conversion, backup, deletion, or fallback. The new database's initial schema creation is not migration of legacy application data.

## Decisions

### 1. Use a native IndexedDB match repository

Create database `touchline` at IndexedDB schema version `1`, with object store `matches` keyed by `id`. Store the existing plain match record, including clock and goals, as one structured-clone value per match. Use a read-only transaction for listing/getting and a read-write transaction with `put` for saving. Listing retains descending `updatedAt` ordering in memory; no index or pagination is needed for this change.

Keep the adapter in `entities/match/api/`, expose an asynchronous `MatchRepository` contract and factory through the entity's public `index.ts`, and inject the repository into the app-scoped store for tests. The contract provides listing, lookup, and save promises; `KeyValueStorage` and the old localStorage key/version exports cease to be the application storage API. Database schema version is distinct from the retired JSON envelope version.

Use native IndexedDB with a small internal promise adapter rather than adding a runtime wrapper dependency. There is only one entity store and three operations. A test-only `fake-indexeddb` dependency exercises transaction semantics under Vitest/jsdom. Keep match-specific database definitions inside the entity; there is no demonstrated need for a shared database slice yet. A future player change can introduce generic infrastructure when there is a second consumer.

Alternative: store the entire JSON archive in one IndexedDB value. This retains unnecessary full-archive writes and defeats the principal structural benefit of switching. Normalizing goals into another store would add coordination without a current requirement.

### 2. Treat transaction completion as the save boundary

Resolve writes only on transaction `complete`, not the individual `put` request's success. Reject on open, request, transaction error, or abort, and handle synchronous failures such as structured-clone errors through the same promise contract. Attach completion/error handlers before issuing requests. Do not hold transactions open across unrelated awaits.

Build a detached, plain snapshot of the known match fields, clock, and goal records before writing; Vue read-only/reactive proxies cannot be passed directly to IndexedDB. The snapshot used for the write is also the basis for publishing the committed record, so later reactive changes cannot alter an in-flight save. Preserve IDs, times, goal order, and all current fields.

Cache the open connection per repository instance, reset failed opens so retry is possible, and provide connection cleanup on app unmount and in tests. Close and invalidate the connection on `versionchange`. Surface blocked opens with an actionable message to close other app tabs and retry; an abandoned open request must close any connection it eventually receives instead of publishing stale success. Do not delete or recreate the database to recover from errors or unexpected schema versions.

Alternative: resolve on request success or retry into localStorage. A later transaction abort would then yield false success, and fallback creates competing archives. Both violate the storage contract.

### 3. Keep app-scoped saved state and explicit async lifecycle

Evolve `MatchStore.load()` and `persist()` to return promises and expose read-only loading/readiness, saving, and error state. Initial loading must finish before write actions become available. A load failure is distinct from an empty successful load and has an explicit retry action.

For a save, set the store-wide pending guard synchronously before the first await, capture the plain snapshot, await repository commit, then upsert that committed record in the reactive collection and restore descending archive order. Do not reread the whole database after each write: a post-commit read failure must not report a successfully committed write as failed. Loading/retrying must not race with an active save and replace newer in-memory state.

Disable all match-writing controls while saving and guard handlers/store entry points synchronously as well, since Vue's disabled DOM state updates later. A second operation is rejected as busy rather than queued or silently acknowledged; after the first settles, the next accepted action derives its candidate from the latest committed match. The busy interval ends only after reactive saved state has been published. This intentionally uses one small app-wide gate because the UI edits one match at a time.

On write failure, leave the saved collection unchanged, expose the error, release the pending state, and let the user retry the action. Feature handlers catch rejected promises so failures do not become unhandled events. Do not automatically replay a clock/goal action later with an ambiguous capture time.

Alternative: optimistic updates and a serialized command queue. These can accept more actions during slow writes, but require rollback/rebasing and pending-state reconciliation that is disproportionate to this focused change.

### 4. Await persistence throughout the feature flow

Update the model helpers and UI handlers in `create-match`, `control-match-clock`, `record-goal`, and `edit-goal` to await the store. Sample event/clock timestamps when an available action is accepted, before waiting for IndexedDB, and retain those timestamps in the saved record. Continue deriving the running display from the clock anchor; do not persist timer ticks.

Creation clears inputs and emits its navigation event only after commit. Goal recording, goal edits, and clock controls emit success/update events only after commit. Keep draft fields on failure, prevent draft changes during their in-flight submission, and avoid resetting unrelated editor drafts merely because another record was saved. Reject overlapping writes across feature boundaries, including clock controls versus goal editing.

App initialization displays loading or a recoverable load error instead of mounting a misleading empty archive. The match view displays saving/failure/committed status in place of its unconditional saved badge. Creation failures remain visible on the archive with entered team names retained. Use accessible status/alert text and disabled controls consistent with the existing UI; there is no new settings screen.

Alternative: only replace `saveMatch` with an async implementation and leave callers unchanged. This would navigate and claim success before storage commits and permit stale records to overwrite one another.

### 5. Cut over without touching legacy data

Application initialization reads only IndexedDB; it does not even parse the old localStorage payload. Valid, malformed, or unknown-version legacy values have no effect on startup. An absent database is initialized to an empty archive. LocalStorage values remain byte-for-byte unchanged during normal operation, including saves and retries.

README documents IndexedDB's browser-profile and origin boundary, the new empty-archive behavior, and the existing limitations around clearing site data. No persistent-storage request, export/import, or server is introduced.

The current literal localStorage compatibility test must become a no-import/no-mutation regression. Preserve existing field round-trip coverage using a literal IndexedDB record instead. Keeping the old compatibility assertion would directly contradict the user's requested cutover.

### 6. Verify async failure boundaries as well as the happy path

Use an isolated IndexedDB factory/database per test and close connections before cleanup. Colocate repository tests with the adapter and store tests with `matchStore.ts`. Test record-level writes preserving unrelated matches, reload and ordering, plain snapshots from reactive input, and transaction abort leaving the old record intact. Exercise open/read failure and retry and connection lifecycle behavior.

Use an injected deferred/rejecting repository for deterministic store/UI pending-state tests: saved state and navigation must wait for commit; failures retain state and drafts; two same-tick/cross-feature actions cannot overlap. Keep IndexedDB task scheduling real while controlling `Date`/display timers in clock tests, or explicitly advance the required tasks; do not assume a single Vue tick or `flushPromises` means a transaction committed.

Update the existing full Firefox flow (at its final FSD-colocated location) to use asynchronous IndexedDB fixture operations that wait for transaction completion and close fixture connections. Wait for startup readiness and save completion through the UI before subsequent actions/reloads. Cover create, goals, edits, half transitions, running/paused reloads, reopening, and ignored legacy data in an actual browser. Scope offline verification to persistence in an already-loaded page; cold offline startup is not promised.

## Risks / Trade-offs

- [Vue proxies cause `DataCloneError`] -> Snapshot the nested record into plain values at the repository boundary and test with actual reactive input.
- [Async writes introduce stale overwrites inside one app] -> Synchronous app-wide write guard, disabled feature controls, latest committed inputs, and no optimistic saved state.
- [Blocked/version-changed connections hang or leak] -> Explicit error state, retryable opens, `versionchange` cleanup, and cleanup of late success from abandoned requests.
- [Two separate tabs edit the same match] -> Cross-tab synchronization is outside this change; document that concurrent editing is unsupported. Record-level transactions prevent partial writes but do not merge stale same-match edits.
- [Browser storage can be cleared or unavailable] -> Surface failures without fallback and retain truthful local-only documentation; IndexedDB is not a backup guarantee.
- [Other active changes assume localStorage compatibility] -> Complete the FSD refactor first and revise the player-management plan separately before implementing it; do not silently combine its migration tasks with this cutover.

## Migration Plan

There is no legacy-data migration. Deploy the IndexedDB adapter, async store/features, status UI, tests, and documentation as one coherent change after the FSD prerequisite completes. The first successful open creates the new database; existing localStorage values remain unused and untouched.

Before deployment, run `npm test`, `npm run build`, and `npm run test:e2e`, plus targeted narrow/desktop review of loading, saving, and failure states. Verify both a fresh browser and a browser seeded with legacy localStorage values.

Rollback means redeploying the previous build. It will see only its old localStorage archive, not matches saved to IndexedDB. Leave both storage systems intact rather than implementing reverse conversion or destructive cleanup; resume the IndexedDB build to access its records again.

## Implementation Verification

- `npm test`: 40 tests passed across 11 Vitest files, including repository transaction/lifecycle tests, app-store concurrency and retry tests, action pending/failure tests, and app integration coverage.
- `npm run build`: TypeScript project build and Vite production build passed.
- `npm run test:e2e`: the headless Firefox create/track/edit/half-time/full-time/reload flow passed with a seeded legacy localStorage record left untouched. The browser flow also confirmed saving feedback fits at desktop and narrow widths, a failed write remains unsaved until retry, and an already-loaded page can persist after `navigator.onLine` is false and both `fetch` and `XMLHttpRequest` are unavailable.
- The app integration suite distinguishes loading from an empty archive, confirms legacy-only profiles start empty, verifies retries preserve drafts and committed state, and checks that unrelated goal-editor drafts survive an edit. Cold offline startup was not tested or promised.
