# Design

## Context

See `proposal.md` for the motivation and the two delta specs for the behavior contract. This design is warranted by a new aggregate, cross-feature references, two persistence boundaries, and a player-directory format upgrade.

The inspected working tree already contains the completed `add-player-positions` implementation. `Player` has a stable ID, name, positions, archive state, and timestamps. `createPlayer()` supports a name string or profile input; `updatePlayerProfile()` handles explicit edits. `plainPlayerSnapshot()` in `model/playerStore.ts` and `parsePlayer()` in `api/playerStorage.ts` reconstruct fields explicitly, so adding a type property alone would lose it during saving or loading.

Player storage writes the complete directory as version 2 under `touchline.player-store`, reads versions 1 and 2, and publishes store snapshots only after persistence succeeds. Matches use a separate IndexedDB repository. `MatchSquadPlayer` stores only player identity and a name snapshot; inventory maintenance has no reason to extend match records.

`ManagePlayers.vue` orchestrates profile drafts, saving, archive actions, and identity labels. Its form and card list are already separate controlled components. `MyPlayersPage.vue` is a thin composition surface. `App.vue` provides stores and switches pages with an `activePage` union rather than a router. Its current compact navigation needs room for a third entry.

Existing player tests cover model lifecycle, readonly snapshots, legacy reads, failed writes, page forms, and archived profiles. `src/app/ui/App.e2e.test.mjs` is the browser entry point used by `npm run test:e2e` and already exercises narrow player forms. The main `player-management` spec contains the directory lifecycle; the completed but unarchived position change contains its additional profile requirements. This change adds new requirements alongside that baseline rather than replacing either source of behavior.

## Goals / Non-Goals

**Goals:**
- Give every physical jersey a durable identity while treating numbers as editable attributes.
- Keep one authoritative location for each datum and make every visible save action atomic within one repository.
- Resolve cross-domain identity references in features without sibling-entity imports.
- Extend the existing forms, app-scoped stores, and navigation with small, typed components.
- Preserve existing directory payloads until a successful, explicitly triggered save.

**Non-Goals:**
- A shared database migration for players, inventory, and matches, or a cross-storage transaction/rollback framework.
- A new router, state-management package, localization framework, or generic form engine.
- Synchronizing concurrently open tabs or providing an automatic downgrade of upgraded player data.

## Decisions

### 1. Represent a jersey set as an aggregate with independent item identities

Introduce `src/entities/jersey-set/` with the following conceptual records:

| Record | Stored fields |
| --- | --- |
| `JerseySet` | `id`, `name`, `jerseys`, `preferredNumbers`, `createdAt`, `updatedAt` |
| `Jersey` | `id`, `number`, `size`, `ownerPlayerId` |
| `JerseyNumberPreference` | `playerId`, `number` |
| Existing `Player` extension | `jerseySize: string \| null` |

Each jersey is nested in exactly one set. Set IDs and jersey IDs are generated independently of labels; jersey IDs are unique across the inventory. Duplicate numbers and duplicate number/size/owner combinations are valid. A set's preference array permits one entry per player ID, and any number of players can prefer the same number. A cleared preference removes that entry. `ownerPlayerId: null` explicitly means team-owned; a string identifies one directory player.

```text
Player directory                        Jersey inventory
+-----------------------+               +---------------------------+
| Player                |               | JerseySet                 |
| id, name, positions   |               | id, name                  |
| general jerseySize    |               |                           |
+-----------------------+               | preferredNumbers[]        |
           ^                            |   playerId, number -------+--+
           |                            |                           |  |
           |                            | jerseys[]                 |  |
           |                            |   id, number, size        |  |
           +----------------------------+-- ownerPlayerId           |  |
           |                            +---------------------------+  |
           +-----------------------------------------------------------+
```

The links in the diagram are stored identities, not imports between entities. `entities/jersey-set` uses strings for external player IDs and never imports `entities/player`. The two management features may consume both public APIs and resolve references. Small size validators remain with their respective domain models; there is no jersey-specific module in `shared`.

Removing a jersey mutates only its parent set. Removing a set removes its nested jerseys and preferences in the same collection update. Preference mutation operates on current committed sets, addresses them by ID, and rejects unknown set IDs instead of recreating stale sets. It changes only the submitted player/set pairs, preserving other players and unedited sets.

**Alternative:** Number-based keys or per-number quantities cannot distinguish sizes and private owners. Storing preference-to-jersey links would turn an advisory number into a specific assignment. Keeping preferences on `Player` would make set deletion span two independently saved storage keys; nesting them under sets gives their shared lifecycle one atomic write.

### 2. Use flexible size labels and explicit numeric normalization

The conversation fixed one general player size and independent actual sizes on jerseys. Minor input defaults for this plan are:

- General size is optional; trim text and normalize blank input to `null`. Existing and name-only players start with `null`.
- Actual jersey size is required trimmed text. Labels such as `164`, `M`, and `S/M` are accepted without a catalogue, uppercase conversion, or automatic fit checks.
- Back numbers are nonnegative safe integers, including zero, with no competition-specific upper limit. Forms keep raw string drafts, accept decimal digits after trimming, and reject signs, fractions, exponent notation, and values outside the safe integer range. Leading zeros normalize numerically, so `07` becomes 7.
- Blank preferred-number input means no preference; blank inventory number is invalid. Explicit blank checks occur before numeric conversion so a blank never becomes zero.
- Set names are trimmed, nonblank text. Equal names are allowed and disambiguated, following the player's identity-versus-name pattern.
- A new jersey initially selects team ownership. Preferences can name unstocked numbers and are not restricted by size, ownership, or other players' preferences.

These are input and presentation defaults, not additional allocation or availability rules.

**Alternative:** A fixed size enum would prematurely exclude youth, combined, and manufacturer-specific labels. Restricting a number picker to existing jerseys would prevent recording preferences before stock is complete and make duplicate-number items unnecessarily ambiguous.

### 3. Persist inventory and preferences in one versioned browser snapshot

Add `api/jerseySetStorage.ts` under the new entity. Use the new localStorage key `touchline.jersey-set-store` and a version-1 envelope containing the full set collection. A repository read validates and returns a fresh snapshot; a write validates the proposed collection and serializes it through one `setItem()` call. A missing key reads as an empty collection without writing. Malformed payloads or unsupported versions fail without replacing the payload.

Validate required object/array shapes, finite timestamps, nonblank IDs and names, duplicate set IDs, duplicate jersey IDs, numbers, sizes, owner-reference types, and duplicate player preference entries within a set. Repeated jersey numbers are valid. The repository validates the shape of external player IDs but does not require directory data to load; an unresolved external reference is not equivalent to malformed inventory.

Expose an app-scoped store through `provideJerseySetStore()` / `useJerseySetStore()` and `entities/jersey-set/index.ts`. Follow the existing store's readonly collection and `ready`, `loading`, `saving`, `saveStatus`, `error`, retry, and disposal pattern. Domain operations create independent snapshots and are applied to the latest committed collection. Publish state only after a successful repository call. Reject writes before successful loading, during loading, while another inventory write is pending, or after disposal. Set, item, deletion, and preferred-number operations all share this write boundary.

Saving one player's preferred numbers across several sets writes one inventory snapshot. Deleting a populated set also takes one write, including removal of its preferences. Neither operation needs a player-directory write. UI drafts cannot mutate the store's nested jersey or preference arrays.

**Alternative:** Separate keys for sets, individual jerseys, and preferences permit partial deletion or partially saved multi-set edits. Adding IndexedDB stores or moving player data would expand the storage migration beyond this feature. The existing whole-directory localStorage approach is proportionate to this small team inventory and already provides the required single-key replacement behavior.

### 4. Add player size with a lazy version-3 directory upgrade

Extend `Player`, readonly snapshots, and the profile input with general size. Keep the existing name-string factory signature. Profile inputs may omit size for compatibility with current callers: creation defaults it to `null`, while an omitted size on an update preserves the current value. An explicit blank or `null` clears it. UI drafts always supply the field. Rename, archive, and restore preserve it. Include the field in both `plainPlayerSnapshot()` and `parsePlayer()`.

Keep `touchline.player-store` and the existing whole-directory write boundary:

- Version 1 retains its position-compatibility behavior; missing size becomes `null`.
- Version 2 continues to require valid positions; missing size becomes `null`.
- If an older supported record does contain a size, validate and preserve it rather than silently dropping it.
- Version 3 requires valid positions and an explicit size field containing text or `null`.
- Unsupported versions and invalid present fields fail without writing.

Only an explicit successful directory save writes version 3, including all unchanged active and archived players. A failed first save preserves the original legacy payload. Inventory-only operations never trigger this upgrade. Document that earlier releases reject version 3 and that there is no automatic downgrade after the first successful write.

**Alternative:** Keeping version 2 would let the current older parser silently discard the new size whenever it saves. Eager migration on load creates an unnecessary write and failure opportunity before any user edit.

### 5. Keep directory references resolvable without conflating ownership and preference

The player directory is authoritative for names and archive status. Features build owner choices from both active and archived players; labels mark archived players and distinguish duplicate names. Extract the existing player identity-label derivation from `ManagePlayers.vue` into a focused helper in `entities/player/model/`, export it publicly, and reuse it for owner choices. This is a targeted extraction for the new consumer.

Set and otherwise identical jersey labels use stable ID suffixes from their own entity, extending the suffix when needed for uniqueness. Owner references are not copied names. A rename therefore updates displayed ownership without rewriting inventory, and archiving does not clear ownership or preferences.

If directory loading fails, or a stored referenced player is absent, show an unavailable-player label with an ID suffix. Retain the original reference. Existing unresolved owners can remain selected while an unrelated jersey field is edited; a new or changed non-null owner requires a successfully loaded directory and a known player. Switching to team ownership explicitly clears the reference. A failed directory load is never interpreted as an empty list that resets every owner.

Preferred-number editing similarly requires an existing loaded player. Preserved preferences for unresolved players are not silently pruned by unrelated saves. They are still removed with their containing set if that set is explicitly deleted.

**Alternative:** Storing names as owner keys breaks on rename and duplicate names. Resolving references inside the jersey repository would couple two entities and make otherwise valid inventory unreadable after an independent directory failure. Deriving preferences from ownership would contradict their separate meanings.

### 6. Use focused editors with one repository per visible save action

Keep normal player creation and `Edit profile` for name, positions, and general size. Add a saved-player action, `Edit preferred numbers`, with one optional numeric field per set and its own `Save preferred numbers` / `Cancel` actions. Display saved size and per-set number summaries on the player card. Creation establishes the player identity first; preferred numbers can then be edited on that card. One card has one active editing mode at a time, and draft transitions are explicit.

The size/profile save uses only the player store. The preferred-number save uses only the jersey-set store. This avoids promising a cross-storage atomic `Save profile` covering both repositories. Each editor disables relevant controls while its repository is saving, retains its complete draft on failure, and resets or closes only after success. A failed inventory load affects the number editor and its summaries, while ordinary profile editing remains usable. With no sets, the number editor explains the prerequisite rather than inventing a global number.

Add a `Jersey sets` top-level navigation entry using the existing `activePage` model. The new page composes a management feature showing the set list and the selected set's inventory. It supports creating/renaming sets and creating/editing individual jerseys through labelled forms; removal labels identify their target and, for sets, the dependent items/preferences being removed. After deletion, selection and focus move to an available set or the create-set action. User-visible copy follows the surrounding English interface.

Provide and initially load the new store from `App.vue`. Display inventory errors in the inventory page and the preferred-number area, rather than adding a new global loading gate. Page-level load-on-mount checks can reuse ready/loading flags for independently mounted page tests. The inventory page can load the player directory for owner choices while already rendering committed inventory and unresolved owner labels.

Component boundaries and contracts:

| Location/component | Responsibility and data flow |
| --- | --- |
| `app/ui/App.vue` | Provide stores, trigger loads, and compose page navigation; no inventory forms or mutation logic. |
| `pages/jersey-sets/ui/JerseySetsPage.vue` | Ensure initial loads and compose the inventory feature through its public API. |
| `features/manage-jersey-sets/ui/ManageJerseySets.vue` | Own selection, drafts, validation orchestration, and store actions; consume player and jersey-set public APIs. |
| `.../components/JerseySetList.vue` | Receive readonly sets, labels, selection, and disabled state; emit select, edit, and remove intents by set ID. |
| `.../components/JerseySetForm.vue` | Receive a controlled name draft and save/error state; emit draft updates, submit, and cancel. |
| `.../components/JerseyInventoryList.vue` | Receive readonly jerseys, identity/owner labels, and disabled state; emit edit/remove intents by item ID and host the selected item's editor via a slot. |
| `.../components/JerseyForm.vue` | Receive a controlled number/size/owner draft, owner choices, unresolved-current-owner metadata, and validation state; emit draft updates, submit, and cancel. |
| Existing `manage-players/ManagePlayers.vue` | Coordinate player and preferred-number editing modes and their independent save/error boundaries. |
| Existing `PlayerProfileForm.vue` | Extend the controlled profile model with size; retain its explicit submit/cancel contract. |
| Existing `PlayerDirectoryList.vue` | Render committed profile/preference summaries and the selected editor; emit profile or preference editing intents. |
| New `manage-players/ui/components/PlayerJerseyPreferencesForm.vue` | Receive labelled set rows, controlled raw numeric drafts, and loading/save/error state; emit draft updates, submit, and cancel. |

Use Composition API with typed `<script setup>`, props down/events up, and computed saved summaries. Keep the new entity, feature, and page public entry points in `index.ts`. Features do not import one another; pages do not import other pages. Existing profile components remain internal to their feature.

**Alternative:** A single combined editor needs cross-key transactional behavior or a larger persistence redesign. Editing preferences only on the inventory page makes a player's different set numbers harder to review together. A separate routing or modal framework adds no benefit to these small explicit-save forms.

### 7. Extend the phone-first flow and validate meaningful boundaries

Stack set selection, inventory, and forms on phones. Give number, size, and owner fields visible labels; use numeric input mode for numbers, normal text entry for sizes, and a native owner selector. Wrap long names and summaries. Ensure forms remain in document flow, have at least 44px touch targets and visible focus, and stay reachable with enlarged text, safe areas, and a reduced keyboard-height viewport. Let the three-entry navigation wrap or reflow at narrow widths rather than shrinking its targets. Desktop retains the same actions and save model.

Editor opening focuses an appropriate field; successful save or cancel returns focus to the launcher. Validation errors are announced and associated with fields; failed saves retain focus and draft values. Duplicate jersey rows and owner choices must be distinguishable in accessible names, not merely through visual position.

Verification targets are the risky boundaries, not a test per helper: duplicate physical items, advisory preferences, independent ownership, complete snapshot saves, cross-domain reference retention, legacy payload equality on load/failure, no partial publication, and saved match isolation. Extend existing player and app tests, add colocated jersey entity/feature/page tests, and extend the existing Selenium entry point. App tests must isolate and restore the new localStorage key as they already do for player storage. Browser checks cover 320px/390px and desktop, long names, keyboard editing, reloading, storage failure/retry, and an already-loaded offline session.

**Alternative:** Relying only on form tests would miss migration and reference loss; relying only on browser tests makes failure-boundary checks slower and less precise. The existing layered suite supports both responsibilities without adding a test runner.

## Risks / Trade-offs

- [An explicit player copy drops size] -> Update model, store, and repository copy paths together; verify rename/archive/restore and legacy round-trips.
- [Set removal leaves hidden player preferences] -> Store preferences within their set and remove the aggregate in one snapshot save.
- [Duplicate numbers target the wrong jersey] -> Address actions by stable item ID and verify identical-number/size/owner rows with distinct accessible labels.
- [A missing player becomes implicit team ownership] -> Preserve unresolved IDs and display an explicit unavailable-player label; validate only new or changed external links against loaded directory data.
- [Two independent save boundaries confuse users] -> Use separate profile and preferred-number editing modes with specific save labels and field-specific feedback.
- [A form replaces another player's preferences or leaks draft arrays] -> Transform the latest committed collection, scope updates by player/set IDs, clone nested records, and test with multiple populated players and sets.
- [Free-text sizes differ in spelling] -> Trim labels and preserve the entered vocabulary; do not introduce a misleading automatic fit algorithm.
- [The extra navigation entry or owner selector overflows] -> Check narrow layouts with long names, enlarged text, native keyboard operation, and keyboard-height viewport reduction.
- [Position work is not yet synchronized to main specs] -> Treat its current implementation as the baseline and keep this delta additive; do not revert its profile or version-2 behavior during implementation.
- [Older application releases cannot read upgraded directories] -> Document the lazy version-3 transition and use a forward fix after a successful upgrade.

## Migration Plan

1. Implement the player-size reader/writer, inventory aggregate/store, and associated UI together. Retain the current position feature and its compatibility tests.
2. On first load, read older player directories into in-memory profiles with unknown size and read a missing inventory key as empty. Neither read writes storage.
3. The first explicit successful directory mutation writes version 3. The first successful inventory mutation creates its independent version-1 payload. Each failed write leaves its previous payload untouched.
4. Update documentation with the two save scopes, flexible size labels, advisory numbers, ownership semantics, deletion behavior, and storage keys/versions. Existing IndexedDB match data and legacy match-localStorage values are not migrated by this change.
5. Before any version-3 directory save, an older release can still read the legacy player payload and simply ignores the new inventory key. After an upgrade, prefer a forward fix; restoring a separately preserved pre-upgrade directory would lose later profile edits. No automatic rollback of user data is introduced.
6. Complete the colocated and app tests, production build, Firefox browser flow, and responsive/keyboard checks listed in `tasks.md` before considering implementation complete.
