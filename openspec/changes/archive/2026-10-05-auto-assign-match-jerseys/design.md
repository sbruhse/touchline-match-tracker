# Design

## Context

See `proposal.md` for motivation and `specs/match-jersey-assignment/spec.md` for the allocation and review contract.

The current working tree already has independent player and jersey-set stores. `Player.jerseySize` and `Jersey.size` are trimmed free text. `Jersey` identifies a physical item by `id` and keeps `number`, `size`, and nullable `ownerPlayerId`; duplicate numbers are valid inventory. Preferred numbers are separate per-set advisory records. The existing jersey specification explicitly describes ownership as informational and does not infer fit, so its delta qualifies those statements for match preparation rather than treating the new behavior as already supported.

`MatchRecord` has a saved squad with stable player IDs and name snapshots, but no jersey distribution or permanent kickoff date. `clock.startedAt` is cleared on pause and reset on resume. Repository and store collections are sorted by `updatedAt`, which is unsuitable for identifying the last played match. Match storage currently reads record versions 1 and 2 and writes version 2; database schema version 1 and the `matches` store are independent of that record version.

The repository and store each reconstruct complete match snapshots. `configureMatchSquad.ts` and `editSubstitution.ts` also construct explicit match objects, so merely extending the interface would lose fields on existing actions. `MatchDetailPage.vue` already composes preparation before kickoff and player information in its Player times panel. Squad editing is locked after kickoff. The new distribution follows that preparation lifecycle.

## Goals / Non-Goals

**Goals:**
- Keep proposal generation pure, reproducible in tests, and independent of persistence or rendering.
- Represent inventory identities and immutable match facts separately so later stock edits cannot alter recorded numbers.
- Separate automatic eligibility from final-distribution validation: manual size and owner overrides are valid, duplicate numbers are not.
- Preserve all match fields through existing save paths and use one transaction for distribution acceptance.
- Keep the page a composition surface and put cross-entity orchestration in one action feature.

**Non-Goals:**
- Inventory checkout across concurrent matches, a lending lifecycle, goalkeeper-specific stock rules, or multiple simultaneously selected sets in one match.
- Changing the free-text profile/inventory editors into a new size-catalogue administration flow.
- Backfilling historical numbers from preferred-number fields, names, ownership, or playing-time events.
- Mid-match jersey changes, post-kickoff distribution corrections, a persistent audit of discarded proposals, or synchronization across browser profiles.

## Decisions

### 1. Store the accepted distribution in the match aggregate

Add match-owned types in `entities/match/model/` and export them through `entities/match/index.ts`:

| Data | Shape and responsibility |
| --- | --- |
| `MatchRecord.firstKickoffAt` | `number | null`; immutable time of first committed kickoff, unknown for already-started legacy matches. |
| `MatchRecord.jerseyAssignment` | `MatchJerseyAssignment | null`; null means no accepted jersey preparation. |
| `MatchJerseyAssignment` | `setId`, `setNameSnapshot`, and a row for every saved squad member. |
| Assignment row | `playerId` and `jersey: MatchJerseySnapshot | null`; null is an explicitly unassigned player. |
| `MatchJerseySnapshot` | Physical `jerseyId`, accepted `number`, `size`, and `ownerPlayerId`; all values are copied, not live inventory references. |

Use the existing participation name snapshot for wearer display. Owner identity is enough to preserve the ownership fact; current directory labels can aid selection, while unavailable references get stable identity labels. An accepted snapshot is a historical fact, not a promise that the jersey remains stocked or that the owner still has the same name.

Pure match validation checks structural values, one row per squad member, exact squad membership, unique non-null jersey IDs, and unique numbers including zero. A distribution cannot exist without participation. It does not import player or jersey-set implementations or look up current inventory. This permits old matches to remain valid after inventory removal and permits manual size/owner overrides.

Add a focused shared-within-the-slice match snapshot helper to copy the new nested data. Use it in store/repository copies and the explicit feature candidate paths being changed, rather than allowing different copies to omit fields. Factory-created matches start with both additions null.

**Alternatives:** Saving only jersey IDs would make historical numbers follow later edits or disappear on deletion. Saving assignments on inventory would conflate reusable stock with per-match usage and require coordinated writes to localStorage and IndexedDB. Adding a directory field for the last number would lose per-set chronology and drift after edits.

### 2. Define chronology from accepted assignments in started matches

The first successful `resume` from period 1 / `not-started` sets `firstKickoffAt` using the same accepted action time as the clock start in `controlMatchClock.ts`. Later resumes and other clock transitions preserve it. Legacy matches already beyond kickoff keep null; their original start cannot be reconstructed reliably. A failed kickoff publishes neither the new clock nor the timestamp, and a retry has a new action time.

A pure history query in `entities/match/model/` receives the match collection, current match ID, and selected set ID. It ignores the current match, unstarted matches, unknown kickoff times, missing distributions, other set IDs, and empty rows. Sort by descending `firstKickoffAt`, then ascending stable match ID for equal timestamps; the first nonempty row for each player wins. Renames and array order are irrelevant. A zero timestamp or number is a value, not an absence.

The operational meaning of "last worn" is an accepted distribution in a match that started. It includes an equipped unused substitute, because the application records shirt allocation rather than physical clothing changes. It does not consult `appearanceCount` or change playing-time statistics. No history is synthesized for existing matches. Number preferences stored in `JerseySet.preferredNumbers` are not inputs to the resolver or allocator.

**Alternatives:** `updatedAt` would promote corrected old games, `clock.startedAt` disappears or changes, and creation dates may differ from the order games were actually played. A cached last-number field would require invalidation across multiple stores. Filtering by positive playing time would discard issued substitute jerseys and entangle independent concepts.

### 3. Compare adult size ranks without migrating stored labels

Put the domain-specific comparison helper in `entities/jersey-set/model/`, exported through its public API. It accepts a label and returns a rank or unknown; it never rewrites the saved string. Trim and uppercase for comparison. Use adjacent ranks for:

```text
... < 3XS < XXS < XS < S < M < L < XL < XXL < XXXL < 4XL < ...
```

S, M, and L are consecutive central ranks. Extended S and L labels accept repeated X notation and equivalent positive integer notation: XS/1XS, XXS/2XS, XXXS/3XS, XL/1XL, XXL/2XL, XXXL/3XL, and further safe integer extensions. Smaller S extensions descend; larger L extensions ascend. Comparison is by rank, never lexical order or position in the remaining inventory list. Combined labels such as S/M and numeric youth labels remain unranked, valid inventory that can be chosen manually.

For generation, eligible rank differences are exactly 0 and +1 for both team and private jerseys. A player's absent/unrecognized general size produces an unassigned-row error. Unranked inventory does not participate in automatic matching. This conservative comparison is a planning default for existing flexible labels, not a data cleanup or a claim about brand-specific fit.

**Alternatives:** Sorting strings misorders XL and XXL. Deriving the next size from available stock would incorrectly make XL the successor of M when L is absent. Inferring adult equivalence for youth/combined sizes would invent fit information the directory does not contain.

### 4. Allocate by explicit priority tiers with number-capacity matching

Place the pure coordinator in `features/assign-match-jerseys/model/`. It accepts immutable squad/player inputs, one set's physical jerseys, the per-player history map, and an injected random source or generation seed. It returns a row for every player, selected jersey IDs, and row-level generation errors. It imports entity APIs through their public indices; entities never import one another.

Use these rounds, reserving the resulting player IDs and numbers after each:

```text
1. Own private jerseys, exact size
                |
                v
2. Own private jerseys, one step larger
                |
                v
3. Team jerseys, exact size for remaining players
                |
                v
4. Team jerseys, one step larger for remaining players
                |
                v
5. Keep every unassigned player with a row error
```

Thus an eligible owned one-step-larger jersey retains ownership priority over a team jersey; a private jersey outside the size limit does not. Losing an ownership conflict never removes the player from later team rounds. Private jerseys belonging to absent players, unresolved other owners, or losing owners never become team stock.

Within a round, construct a bipartite candidate graph from unassigned players to unclaimed **numbers**, with eligible physical jerseys attached to each edge. Number capacity is one even when several stock items share it. Find maximum-cardinality matching. In team rounds, next maximize edges that retain the player's historical number; in private rounds, history does not elevate one equally eligible owner above another. Resolve the remaining equal choices with randomized priorities. Choose a concrete eligible physical item for each matched edge, randomizing equivalent items when necessary. This also avoids an avoidable ownership conflict when one owner has another equally eligible private jersey.

Use a small contained min-cost maximum-matching implementation (augmenting paths over a unit-capacity graph) rather than a new dependency or factorial enumeration. In team rounds, history cost must dominate the bounded total lottery cost; random tie-breaking must never override cardinality, applicable historical priority, or an earlier round. Canonicalize input identities before drawing random priorities so the same inputs and seed produce the same result irrespective of source-array order. In a simple equal-owner/equal-fit contest for one number, the lottery must be symmetric between owners even when only one previously wore that number.

The per-round maximum matters: Alex can take 7/M or 8/M while Ben can only take 7/L. The exact-fit round assigns Alex 8 and Ben 7; a greedy history-first pass could unnecessarily leave Ben without a jersey. Higher-tier assignments are deliberately not undone to improve a lower tier. Any remaining shortage is exposed for the user's manual decision.

**Alternatives:** Shuffling players and taking the first matching item is simple but allows list order or an unlucky early choice to create avoidable shortages. A single undifferentiated optimization score obscures the agreed ownership/size hierarchy. Requiring all possible global matchings to be equally likely adds complexity beyond random resolution of equal claims.

### 5. Keep generation, manual editing, and acceptance separate

The feature owns a local draft copied from the accepted distribution or initialized with empty rows. Selecting another set clears only the draft's selections. An explicit Generate/Regenerate action replaces the draft with one generated result; its label makes replacement of the current draft clear. Do not call the random allocator from computed properties, render functions, watchers, or retries. Persist only accepted choices, not a random seed or discarded proposal history.

Manual choices enumerate every physical item in the selected set with number, size, owner, and duplicate-disambiguating label. No size or ownership filter applies. Detect a number already used by another row and explain who holds it; never silently displace that row. Clearing the current holder frees the number, allowing deliberate transfers and swaps. Editing one row does not fill or rerandomize any other row. Manual assignments need no override flag or extra confirmation because they are explicitly authorized final decisions.

Empty rows are allowed, show errors, and can be saved as a partial distribution. They are distinct from invalid duplicate-number or stale-source submissions, which cannot be accepted. Saved empty rows show a durable generic "No jersey assigned" error; more specific generation diagnostics are draft feedback and are not stored as potentially stale facts.

Immediately before acceptance, look up the latest committed match and validate phase and current squad IDs. Resolve selections against the current loaded set and compare the displayed selected-item details with current values. A removed set/item or changed selected number, size, or owner requires refreshing/correcting the draft. Do not use a set's `updatedAt` alone to invalidate a draft because an unrelated preference edit can change it. Merge only the accepted distribution into a fresh match snapshot, preserving any goals or other changes saved while review was open.

Persist once through `MatchStore.persist()`. The store's existing pending-write guard and commit boundary remain authoritative. Loading requirements apply to the feature's generation/editing actions; snapshot-only reading requires only the match. Failure keeps the precise draft and lottery result for retry. Cancellation restores the saved summary. There is no automatic inventory, preferred-number, or profile write.

**Alternatives:** Autosaving each suggested or selected jersey would prematurely record a lottery and complicate failure recovery. Reusing automatic eligibility during acceptance would reject the authorized manual choices. Persisting the match snapshot captured when the editor opened could overwrite goals recorded during review.

### 6. Reconcile with squad edits and keep preparation optional

Use a pure match-entity reconciliation helper when `buildMatchParticipation` / `persistMatchParticipationSetup` saves a changed squad: retain rows by player ID, drop departed players, and add null rows for newcomers if a distribution already exists. Starter/bench changes do not affect jersey rows. Disabling participation clears the distribution in the same candidate match, with commit/failure semantics shared by both fields. A match without accepted jersey preparation stays null rather than gaining an empty distribution on an unrelated squad edit.

The jersey feature reacts to saved roster changes by reconciling its open draft by identity and announcing the roster change; it does not generate random new choices. Re-check membership at acceptance regardless. Kickoff closes preparation and exposes the last committed summary, so an unsaved draft never becomes history just because play began. Neither no distribution nor an incomplete one gates clock or goal actions.

The integration boundary is pre-kickoff, following the existing squad editor. After kickoff, distributions are read-only in this change. This is a chosen lifecycle boundary; future correction support would need explicit history semantics rather than using an inventory edit to rewrite a past match.

**Alternatives:** Clearing all jerseys whenever starters change creates unnecessary work. Keeping rows for departed players reserves numbers invisibly. Importing the assignment feature from the squad feature would create a same-layer dependency; both instead use the match entity's reconciliation API.

### 7. Compose a phone-first editor with explicit component contracts

Expose `AssignMatchJerseys` from the new feature's `index.ts`. The page places preparation below `ConfigureMatchSquad` before kickoff and a read-only summary in Player times after kickoff. Mount only one feature instance for a match at a time; store and draft orchestration remain outside `MatchDetailPage.vue`.

| Component/module | Responsibility and contract |
| --- | --- |
| `AssignMatchJerseys.vue` | Feature container; accepts `matchId` and preparation/summary mode, consumes the three public entity stores, and coordinates loading and saved-versus-draft presentation. |
| `useMatchJerseyDraft.ts` | Feature-local state/composable: open/reset draft, explicit generation, individual selection/clear, context reconciliation, validation, acceptance, cancellation, and errors. Exposes read-only derived views and explicit actions. |
| `JerseyAssignmentEditor.vue` | Controlled set picker, generation action, player rows, and accept/cancel footer; receives draft/view state and emits selection, generation, acceptance, and cancellation intents. |
| `JerseyAssignmentRow.vue` | One named player, general size, selected jersey, full inventory options, and row error; emits a jersey ID or null without mutating props. |
| `JerseyAssignmentSummary.vue` | Renders accepted set and player/jersey snapshots, including unassigned rows; needs no live inventory resolution. |

Use Vue Composition API with typed `<script setup>` components, typed props/emits, derived number-usage and label maps, and native labelled controls. Reuse existing `createJerseySetIdentityLabels`, `createJerseyIdentityLabels`, and player identity-label behavior. Current UI text is predominantly English; reuse its vocabulary rather than adding a localization subsystem.

```text
Jerseys                             Saved / Draft
[ Selected set                             v ]
[ Generate proposal                          ]

Alex                         Player size: M
[ 7 / M / Alex                             v ]

Ben                          Player size: L
[ No jersey selected                       v ]
Error: No eligible jersey available

[ Accept assignments ]  [ Cancel ]
```

Keep the existing green/neutral visual language and restrained card treatment. Stack controls at narrow widths, allow long names/labels to wrap, use 48px hit targets, and associate errors through accessible descriptions plus a concise live summary. The form stays in normal flow; reuse the page's dynamic bottom recording-area clearance rather than adding another fixed footer. Focus the set control on opening, announce proposal and acceptance outcomes, and restore focus to the edit launcher on close. Desktop can use additional columns without changing the interaction.

**Alternatives:** A separate management page or modal adds navigation and keyboard-height complexity for one preparation action. Adding allocator logic to the page would mix screen composition, domain arbitration, and persistence. A custom drag-and-drop distributor would need a second keyboard interaction model.

### 8. Upgrade match records lazily to version 3

Keep database `touchline`, database version 1, object store `matches`, and the existing transaction model. Update readers to support record versions 1, 2, and 3. Versions 1/2 normalize the new fields to null without writing. Version 3 requires explicit `firstKickoffAt` and `jerseyAssignment` fields, each nullable, and validates any distribution against the saved squad and its own immutable snapshots. A null kickoff time remains valid for already-started legacy matches; known dates must be finite values consistent with a started match.

Every successful new or updated match save writes record version 3. Retain the existing version-1 participation/duration normalization. For a direct v1-to-v3 upgrade, save the exact original record once in `legacyV1Backup`. For v2/v3 records carrying that backup, preserve it exactly. An ordinary v2 record does not need an invented v1 backup. Read existing records and publish replacements in the same transaction; malformed or unsupported records are rejected, not overwritten.

Update the snapshot paths in the repository, store, squad setup, and substitution correction. Use representative saved distributions in clock, goal, substitution, and correction tests to catch accidental field loss rather than merely testing the new editor in isolation. Preserve the existing load error/retry behavior if any stored record is malformed.

**Alternatives:** Extending version 2 silently would let an older application discard assignment fields on its next save. A database schema upgrade is unnecessary because the object store layout does not change. Bulk migration on load would introduce writes before the user takes an action.

## Risks / Trade-offs

- [Lottery or historical-number preference masks a better same-tier distribution] -> Match players to number capacity jointly; verify constrained-size counterexamples and strict lexicographic priority with controlled random inputs.
- [A higher-priority private allocation still leaves another player unassigned] -> Preserve the agreed priority, keep the affected row and error visible, and allow the user's explicit manual override.
- [Free-text legacy sizes cannot be ranked] -> Preserve the data, report unknown fit for automatic proposals, and keep every item manually selectable.
- [An existing save path drops the new data] -> Reuse match snapshot copying and add persistence-preservation tests for existing match actions, including substitution correction.
- [Source inventory or the squad changes during review] -> Reconcile roster IDs, compare selected snapshots at acceptance, merge into the latest match, and retain retryable drafts on rejection.
- [Unstarted proposals accidentally become history] -> Require accepted snapshots plus a known first kickoff and ignore the current match; test manual corrections and unstarted future preparations.
- [An upgrade or failed write loses historical data] -> Exercise mixed versions, transaction aborts, exact legacy backup preservation, malformed v3 records, and commit-only publication.
- [Review becomes too tall or obscured on phones] -> Keep player rows in document flow and verify the last row and actions at narrow widths, enlarged text, safe-area spacing, and reduced viewport height.

## Migration Plan

1. Ship match types, snapshot/validation helpers, v1/v2/v3 reader, v3 writer, and preservation changes together. Extend the clock action to record first kickoff only on a new first start.
2. Add the size comparator, history resolver, and pure allocation feature with deterministic verification of priority and uniqueness cases.
3. Compose the review UI and squad reconciliation; document eligibility, partial results, manual overrides, and explicit acceptance.
4. Existing data is read-only on load. The first successful save upgrades only the affected match; old started games retain unknown first kickoff and no invented jersey history.
5. Document match-record version 3 separately from the player-directory and jersey-inventory format versions. Rollback to an older application is compatible only before v3 records have been saved; after that, use an updated release. Retained v1 backups preserve original records but are not an automatic downgrade of later participation or jersey data.
6. Verify the colocated tests, production build, full-app browser flow, and the required narrow/desktop review cases before implementation is considered complete.
