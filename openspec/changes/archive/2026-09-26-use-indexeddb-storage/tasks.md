# Tasks

## 1. Confirm the implementation baseline

- [x] 1.1 Confirm `align-app-with-fsd-architecture` is implemented and identify its final app, page, feature, and colocated browser-test paths; verify its implementation task status and source layout, and pause if incomplete rather than duplicating its refactor. Confirm the player-management feature has not changed this baseline; if it has, reconcile this plan before implementation.

## 2. Replace the match storage adapter

- [x] 2.1 Add dev-only `fake-indexeddb` and isolated IndexedDB test fixtures beside the match repository tests; verify a focused Vitest case can open, write, read, close, and clean up a database without leaking state between tests.
- [x] 2.2 Replace the localStorage adapter with an injectable native IndexedDB repository for database `touchline`, schema version `1`, and the `matches` object store keyed by `id`; expose promise-based list/get/save and connection cleanup through the match entity public API. Verify colocated tests cover an empty archive, record round trips, updating one match without changing another, and descending `updatedAt` ordering.
- [x] 2.3 Implement plain nested snapshots, transaction-complete resolution, request/open/abort error propagation, retryable connection initialization, blocked-open reporting, late-open cleanup, and `versionchange`/disposal cleanup; verify tests with reactive match input, a request followed by transaction abort, failed open followed by retry, and connection lifecycle cases prove that failures neither erase records nor report successful saves.
- [x] 2.4 Remove application reads/writes of the legacy localStorage envelope and retire `KeyValueStorage` and old key/version exports; replace storage-version tests with IndexedDB-only cutover cases. Verify valid, malformed, and unknown-version localStorage payloads are ignored and remain byte-for-byte unchanged after listing and saving matches.
- [x] 2.5 Update README storage architecture and compatibility documentation to identify IndexedDB, the empty initial archive without migration, same-origin/browser-profile boundaries, unsupported simultaneous multi-tab editing, and rollback visibility; verify the documented database layout and limitations match the repository contract.

## 3. Make the app-scoped store asynchronous

- [x] 3.1 Inject the async repository into the match store, make load/persist awaitable, add read-only ready/loading/saving/error state, and clean up its connection on app disposal; verify colocated store tests cover independent app state, initial load readiness, load failure with retry, and disposal.
- [x] 3.2 Guard writes synchronously while unready or busy, prevent load/save races, publish only the committed snapshot, and update/sort the in-memory collection without a second database read; verify deferred-repository tests show no pre-commit mutation, rejection of overlapping same-tick writes, unchanged state after rejection, and correct next-action state after success.
- [x] 3.3 Document the store's async completion, pending guard, and retry/error contract in README; verify documentation matches the tested API and makes clear that timer ticks do not write to storage.

## 4. Integrate asynchronous user actions and status

- [x] 4.1 Await initialization in the app shell and provide accessible loading/load-error/retry states; verify component tests distinguish an unresolved or failed load from an empty successful archive and prevent writes until ready.
- [x] 4.2 Update `create-match`, `control-match-clock`, `record-goal`, and `edit-goal` model helpers and UI handlers to await commit, catch failures, guard all write controls, and emit success only afterward; verify tests retain click-time clock/goal timestamps across delayed commits, preserve team/goal drafts after failed saves, clear creation fields/navigate only on success, and preserve unrelated goal-editor drafts.
- [x] 4.3 Replace unconditional saved feedback with saving, failure, and committed states on the relevant archive/detail UI; verify deferred-save integration cases show an accessible pending state, block cross-feature writes until commit, leave score/clock/records unchanged on failure, and allow a successful retry without an unhandled rejection.
- [x] 4.4 Convert existing app tests to isolated IndexedDB fixtures and explicit readiness/commit waits, using a literal database record for field round-trip coverage and a separate regression for ignored/untouched legacy localStorage; run those tests and verify create/reopen, running and paused clock reloads, half transitions, both teams' goals, and goal corrections retain their current behavior.
- [x] 4.5 Update the existing colocated Firefox flow to await IndexedDB fixture transactions and UI save completion, including its deterministic saved-clock helper; verify `npm run test:e2e` covers create, stoppage-time goal capture, goal editing, half/full-time transitions, reload/reopen, and a browser containing unused legacy localStorage data.
- [x] 4.6 Document loading/saving/error feedback and retry behavior in README; verify the descriptions against the rendered UI and confirm persistence in an already-loaded page works with network access disabled, recording the result without promising cold offline startup.

## 5. Verify the integrated cutover

- [x] 5.1 Audit application storage access and FSD boundaries; verify all production match persistence uses IndexedDB, no migration/fallback or server path exists, match-specific storage stays in its entity, cross-slice imports use public entry points, and tests remain colocated.
- [x] 5.2 Run `npm test`, `npm run build`, and `npm run test:e2e` on the final state, reusing already successful final-state runs; record results and verify the spec scenarios are covered across repository, store, component, and browser checks.
- [x] 5.3 Review loading, saving, retry, and retained-draft states at narrow and desktop widths; record outcomes for fresh and legacy-seeded browser profiles and confirm the UI never presents a failed or pending write as saved.
