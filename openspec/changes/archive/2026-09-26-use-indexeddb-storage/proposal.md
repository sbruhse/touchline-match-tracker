# Proposal

## Why

The user wants browser-local data stored in IndexedDB instead of localStorage, without migrating existing data. Record-level asynchronous persistence provides a better foundation for the growing match archive while keeping all match data on the device.

## What Changes

- Replace the localStorage match collection with IndexedDB records keyed by match ID, covering creation, loading, clock changes, goals, and goal edits.
- Adapt the app-scoped store and user actions to asynchronous reads and committed writes, with loading, saving, and failure feedback.
- **BREAKING**: Existing localStorage matches are not imported or displayed. Leave those keys untouched; a browser without an IndexedDB archive starts empty. Do not fall back to localStorage when IndexedDB fails.
- Preserve current match fields, scoring, clock calculations, archive ordering, and browser-local operation.
- Keep this change focused on persistence. Backend services, accounts, synchronization, export/import, persistent-storage permission requests, player features, and cross-tab synchronization are outside scope.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `football-match-tracking`: Store and reopen matches through IndexedDB, explicitly exclude legacy localStorage data, and make save completion and storage failures observable without falsely reporting success.

## Impact

- `entities/match/api`, its public API and app-scoped store; all four match-action features; app initialization and storage status in the archive/detail screens.
- Storage, store, component, and Firefox browser tests must use asynchronous IndexedDB fixtures instead of localStorage fixtures. A dev-only IndexedDB emulator is planned for Vitest; no runtime storage library is needed.
- README storage and compatibility documentation.
- Apply after `align-app-with-fsd-architecture`. Apply this storage change before `add-player-management-and-substitutions`; that pending plan's localStorage adapters and version-1 migration assumptions require a separately scoped planning update before its implementation. This change does not edit the other change's artifacts or implement player persistence.
