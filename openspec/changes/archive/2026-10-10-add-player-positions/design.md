# Design

## Context

See `proposal.md` for motivation and `specs/player-management/spec.md` for the catalogue and behavior contract.

The current `Player` model in `src/entities/player/model/player.ts` contains identity, name, archive state, and timestamps. Both `plainPlayerSnapshot()` in the store and `parsePlayer()` in the repository explicitly reconstruct those fields, so adding a property to the type alone would lose it during persistence. The repository stores the entire directory in a version-1 envelope under `touchline.player-store` and rejects other versions.

`ManagePlayers.vue` currently owns the create form, inline rename draft, filters, cards, and save errors. `MyPlayersPage.vue` is already a thin loading/composition surface. Player storage and domain tests are colocated, page tests cover directory actions, and the Selenium flow in `src/app/ui/App.e2e.test.mjs` exercises directory rename/archive alongside saved match history.

This design is needed because the change crosses the domain, persistence, and profile editor and introduces a stored-data upgrade.

## Goals / Non-Goals

**Goals:**
- Use one catalogue and one normalization rule for domain validation, storage, selection, and summaries.
- Keep profile updates immutable and publish only successfully persisted snapshots.
- Make the version-1 compatibility path explicit and testable.
- Reuse one profile form for creation and editing with a small, typed component boundary.

**Non-Goals:**
- A new storage backend, state-management library, route, or generic form framework.
- Moving player-specific concepts into shared utilities or restructuring unrelated slices.
- A general localization system. The agreed German position vocabulary is a bounded addition to the existing English interface.

## Decisions

### 1. Store a canonical set of catalogue codes on the player

Add `model/playerPositions.ts` within `entities/player`. It defines the ordered, typed catalogue with code, full label, and group metadata, plus a `PlayerPosition` union and a pure normalization function. Export the required types, catalogue, and helpers through `entities/player/index.ts`.

Store `positions: PlayerPosition[]` on every in-memory player. The stable codes are the agreed abbreviations; labels and group names are display metadata, not duplicated in each stored player. The normalizer accepts only arrays of recognized codes, rejects invalid values, removes duplicates, returns a fresh array, and sorts by catalogue order. Empty arrays are valid. Array order is presentation order, never preference.

The catalogue uses the agreed German labels and groups from the spec. Position-language markup can use `lang="de"`; existing surrounding navigation and action text stays in English. This keeps the specified TW/IV terminology intact without a localization migration.

**Alternatives:** Free text would create inconsistent positions, and a single position or primary/secondary fields would misrepresent the agreed equal-status selection. A JavaScript `Set` adds serialization and reactive-state handling without improving this twelve-value domain.

### 2. Validate name and positions as one immutable profile update

Introduce a profile input type and an `updatePlayerProfile()` domain operation that validates both fields, returns a new player, preserves identity/creation time/archive state, and updates `updatedAt` once. The update input includes both the name and positions; an empty array explicitly clears positions. Profile and lifecycle operations accept readonly player snapshots, including readonly position arrays from the injected store, and return players with their own position arrays.

Extend `createPlayer()` to accept either its existing name string or a profile input containing name and positions, preserving the existing `now` and `id` arguments. String-only creation defaults to an empty position array. This avoids changing all existing factory callers merely to supply positions. Keep `renamePlayer()` available and make it preserve the player's positions, using the same name-validation behavior.

Update `plainPlayerSnapshot()` to validate and copy positions from readonly players before persistence. Neither a form draft nor an externally retained array can mutate the committed snapshot. Archive and restore retain the complete selection. Existing typed fixtures acquire positions through the factory or explicit empty arrays as appropriate.

**Alternatives:** Saving name and positions independently could commit half of an edit. Mutating the injected store during checkbox interaction would expose unsaved changes. Replacing the existing factory signature would add unrelated caller churn.

### 3. Read version 1 and write version 2 in the existing repository

Keep the storage key and whole-directory write model. Set the current envelope version to 2 and support both versions on read:

- Version 1: missing positions normalize to `[]`; if a position field is present, validate it rather than dropping it. Existing identity, name-validation, archive-state, and timestamp checks remain applicable.
- Version 2: require the position array and validate it with the shared catalogue normalizer. Empty arrays are explicit valid values.
- Other versions, malformed arrays, non-string entries, and unknown codes are rejected without writing the payload.

Loading only normalizes in memory. The next successful `savePlayers()` writes the full normalized collection as version 2 in one `localStorage.setItem()` call, including legacy players that still have no positions. Every subsequent save retains all players' selections. A storage failure leaves the previous payload and the store's committed collection intact; the current promise-based save/error behavior remains the publication boundary.

**Alternatives:** Keeping version 1 with optional positions is smaller, but the current older parser silently removes unknown player fields whenever it saves. Version 2 makes older releases reject the new format instead of silently discarding positions. Eager migration during load introduces an unnecessary write and can fail before the user edits anything. Moving player data to IndexedDB is unrelated to this profile extension.

### 4. Use a controlled profile form inside the existing directory

Replace the visible `Rename` action with `Edit profile`, and `Save name` with `Save profile`. Profile editing expands within the player card. Both the create form and editor use the same name/position fields, with grouped native checkboxes and a visible indication that positions are optional. The creation action remains `Add player`; the editor provides `Save profile` and `Cancel`.

Keep UI internals within `src/features/manage-players/ui/components/`:

| Component | Responsibility and contract |
| --- | --- |
| `ManagePlayers.vue` | Orchestrate the injected store, creation/edit drafts, errors, identity labels, and directory actions; retain the public `viewStatistics(playerId)` event. |
| `PlayerProfileForm.vue` | Render the name and grouped position fields. Accept a typed controlled draft model, an ID prefix, create/edit mode, saving state, and relevant validation state; emit `submit` and edit-mode `cancel`. |
| `PlayerDirectoryList.vue` | Render saved cards and the selected card's profile form. Receive readonly players, identity labels, editing ID/draft, saving/error state; emit edit, draft update, save, cancel, archive/restore, and statistics actions. |
| `PlayerDirectoryFilters.vue` | Render the existing Active/Archived choice through a typed controlled boolean and disabled state. |

Use Composition API with `<script setup lang="ts">`. The form emits fresh draft objects/arrays rather than mutating readonly player props. Its parent owns reset behavior: successful creation clears both fields, successful editing closes the editor, cancellation drops the edit draft, and a failed save retains it. Pending saves disable form submission and edits that could race the submitted snapshot. Derived summaries and filtered lists come from saved data.

Native fieldsets and legends identify the four groups; every checkbox has a unique ID and an associated full-name label. Both simultaneously mounted forms use distinct ID prefixes. Editing focuses the name field, and successful save/cancel returns focus to the player's edit action. Errors remain announced with the existing alert/status conventions.

**Alternatives:** A native multi-select requires unfamiliar modifier-key behavior on desktop and has inconsistent mobile presentation. A custom dropdown needs additional popup and keyboard behavior for only twelve choices. A new profile page or modal adds navigation and draft-lifecycle work to an existing inline edit flow.

### 5. Render saved summaries with phone-first layout

Place a compact wrapping row of position abbreviations beneath the saved player name. Use catalogue order and provide full names as accessible text, rather than relying only on a hover tooltip. Empty selections render no badges; archived cards use the same summary.

The expanded form stacks fields, group choices, and actions at narrow widths. Checkbox labels and primary form actions have at least 44 CSS-pixel hit areas, full labels and long names can wrap, and the form remains in normal vertical document flow. Larger screens can use columns within the same form. Keep the existing directory visual styling and focus treatments, with no fixed overlay or footer that could cover controls when the software keyboard opens.

**Alternatives:** Placing twelve labels in the existing horizontal rename row would overflow on phones. Showing only a count such as "+8" would hide profile information that comfortably fits on wrapped lines.

## Risks / Trade-offs

- [An explicit field-copy path drops positions] -> Cover model updates, readonly store snapshots, repository round-trips, and archive/restore with multi-position players.
- [An edited checkbox mutates saved state before save] -> Copy selections into controlled drafts and test cancel and rejected persistence against both rendered and stored values.
- [An upgrade loses legacy profiles or rewrites data on read] -> Seed exact version-1 payloads, compare raw storage after load and failed saves, and verify all players after the first successful version-2 save.
- [A later save drops another player's positions] -> Test whole-directory updates with two independently populated profiles.
- [Twelve long labels make the inline editor tall] -> Group the choices, keep actions in reachable document flow, and verify 320-390 CSS-pixel widths, enlarged text, and keyboard interaction.
- [Older releases cannot load version-2 directories] -> Document the one-way save upgrade and use forward fixes after a version-2 write; do not attempt an automatic lossy downgrade.

## Migration Plan

1. Ship the catalogue, model/store changes, dual-version reader, version-2 writer, and forms together.
2. On first open, normalize legacy players to empty selections in memory only.
3. Upgrade the collection on its first successful directory save. A failed save preserves the previous payload and remains retryable.
4. Before any version-2 save, rollback remains compatible with the existing version-1 payload. After a version-2 save, prefer a forward fix; an older release cannot read the upgraded directory, and restoring an independently preserved pre-upgrade payload would lose subsequent edits. This change does not add an automatic downgrade or backup mechanism.
5. Document the profile workflow and storage compatibility in `README.md`. Verify domain/storage/page tests, the browser profile flow, and the production type-check/build before release.
