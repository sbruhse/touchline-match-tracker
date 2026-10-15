# Tasks

## 1. Player model and persistent directory

- [x] 1.1 Add the ordered twelve-position catalogue, `PlayerPosition` type, and immutable normalizer in `src/entities/player/model/playerPositions.ts`; verify with colocated tests that empty/all-position sets are valid, duplicates normalize to catalogue order, unknown or malformed values are rejected, and input arrays are not mutated or retained.
- [x] 1.2 Extend the player model with positions, profile-input creation alongside the existing string factory API, and one validated profile-update operation accepting readonly snapshots; extend `player.spec.ts` to verify creation defaults, multi-position edits, clearing all positions, atomic rejection of invalid profiles, and preservation without array aliasing through rename/archive/restore.
- [x] 1.3 Update `src/entities/player/api/playerStorage.ts` to read version 1 without writing and to validate/read/write version 2; extend `playerStorage.spec.ts` with exact legacy payloads, multi-player round-trips, absent/malformed/unknown positions, unsupported versions, and a failed first upgraded save that leaves the previous raw payload intact.
- [x] 1.4 Include a validated position-array copy in the store's plain snapshots; extend `playerStore.spec.ts` to verify readonly inputs, successful reloads, independent selections for same-name players, preservation of other players during whole-directory saves, and rejection without publishing unsaved state.
- [x] 1.5 Export the new entity APIs through `src/entities/player/index.ts` and update affected typed fixtures/expectations to include empty positions; verify the entity tests with `npm test -- src/entities/player` and check that `npm run build` passes with existing factory callers.
- [x] 1.6 Document version-1 reading, lazy version-2 writes, and older-release compatibility in the README's player-storage section; verify the description against the repository's read/write behavior and migration tests.

## 2. Player profile forms and summaries

- [x] 2.1 Add the controlled `PlayerProfileForm.vue`, `PlayerDirectoryList.vue`, and `PlayerDirectoryFilters.vue` components under `src/features/manage-players/ui/components/` and compose them from `ManagePlayers.vue`; verify with focused form tests that create/edit instances expose grouped native checkboxes with full labels, unique IDs, independent drafts, and the same twelve catalogue choices.
- [x] 2.2 Wire player creation to name-and-position drafts and the new domain input; extend `src/pages/my-players/ui/MyPlayersPage.spec.ts` to verify creation with no/several positions, reset only after success, and retention of both fields after validation or persistence failure.
- [x] 2.3 Replace rename-only editing with `Edit profile` and `Save profile`, retaining `Cancel`; verify in page tests that editing loads saved selections, adds/removes/clears positions atomically with the name, supports archived players, cancels without mutation, and keeps a failed draft available for retry with an announced error.
- [x] 2.4 Render saved abbreviations in catalogue order with accessible full names on active and archived cards; verify that same-name identities remain independent, empty sets have no badges, drafts do not alter saved summaries, and archive/restore retains positions using page/component tests.
- [x] 2.5 Implement wrapping, stacked phone layouts, touch-friendly choice rows/actions, and editor focus entry/return; extend `src/app/ui/App.e2e.test.mjs` and update existing rename selectors, verifying profile selection/edit/cancel/clear/reload, keyboard checkbox operation, overflow-free narrow long-name/all-position cases, and preserved saved match history in the browser flow.
- [x] 2.6 Update the README's My players workflow with the grouped optional selection, profile editing, and card abbreviations; verify the documented actions against a create/edit/clear/archive/restore walkthrough.

## 3. Integrated acceptance checks

- [x] 3.1 Run `npm test`, `npm run build`, and `npm run test:e2e`; verify all complete successfully, including legacy directory compatibility, profile persistence, and the existing participation/history flow.
- [x] 3.2 Verify the complete player-directory flow at 320 and 390 CSS-pixel widths and desktop, including enlarged text, long names, all twelve selections, visible keyboard focus, editor save/cancel, and reachable controls with a reduced keyboard-height viewport; record the results and resolve any overflow or reachability failures.
