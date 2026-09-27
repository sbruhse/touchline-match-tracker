# Design

## Context

See `proposal.md` for motivation and the four specification deltas for observable behavior. The application uses Vue 3, TypeScript, IndexedDB for match records, Vitest, and a Selenium/Firefox browser flow. The `touchline` database has schema version 1 and a `matches` object store keyed by match ID. Current match records contain free-text team names, one current-half clock, and goals whose scorer/assist fields are free text. There is no player directory or participation model.

The inspected clock uses millisecond elapsed time and a running wall-clock anchor, excludes manually paused time, and resets elapsed time at second-half kickoff. That transition currently discards the first half's actual duration. Displayed football minutes are ordinal (`1'` at zero elapsed and `46'` at second-half zero); those labels must not be treated as duration values.

The separate `align-app-with-fsd-architecture` change is complete and archived. Its delivered structure includes `src/entities/match/`, an app-scoped match store, page/feature slices, and colocated tests. This design targets those existing public APIs and does not duplicate its migration tasks. The subsequently completed IndexedDB storage change is also controlling: match data is read and written only through the `touchline` IndexedDB database, and legacy localStorage match payloads remain untouched.

## Goals / Non-Goals

**Goals:**
- Use a single replayable participation history to derive both lineup and playing time, avoiding separately mutable totals.
- Keep match histories independent of future directory edits, while aggregating by stable identity.
- Normalize legacy IndexedDB match records without losing goals, clock anchors, or unrelated archive entries.
- Fit new functionality into downward-only FSD dependencies and existing app-scoped reactive stores.

**Non-Goals:**
- A general event-sourcing framework, match rules engine, external database, or new state-management library.
- Replacing the existing goal record schema or deriving player identities from historical scorer text.
- Reconstructing missing participation in already-started untracked matches or editing starting lineups after kickoff.
- Competition-specific lineup sizes, player positions, dismissals, injuries without replacement, extra time, or variable-length halves.

## Decisions

### 1. Separate directory identity from match membership

Introduce `entities/player` with a player record containing an immutable generated ID, trimmed nonblank name, archived flag, and creation/update timestamps. Persist its versioned collection under `touchline.player-store`. Expose storage and per-app reactive state through the slice's public API, following the match-store pattern. Use archive/restore instead of destructive deletion so references cannot be broken by normal user actions.

A saved match squad contains `{ playerId: string, nameSnapshot: string }` entries. Match data owns these value records and does not import `entities/player`. The setup feature imports both entity public APIs and copies selected player IDs/names. Directory renames affect directory/statistics headings and future selections; saved match labels remain stable. Equal names use a short stable ID-derived disambiguator in selection/statistics, extending it if needed to remain unique among the displayed players.

Alternative: use player names as keys or dereference the directory for every historical label. Names are neither unique nor immutable, and neither approach preserves independent match history. Persisting only snapshots would lose cross-match identity, so retain both ID and snapshot.

### 2. Make tracking an explicit pre-kickoff match option

Add nullable `participation` to the match record. When present it contains `ownSide`, squad snapshots, starter IDs, and substitution events. Require at least one starter, all starters within the unique squad, and an explicit home/away selection. Do not enforce eleven players or require a nonempty bench. Store the squad separately per match; archiving a directory player does not invalidate a saved squad or their eligibility within it.

Setup remains editable while `not-started`, then becomes immutable at first kickoff. Matches can continue without this option to preserve the current low-setup workflow and compatibility. A started match without setup has no participation statistics and cannot enable them halfway through this version. The interface explains that distinction before kickoff and for historical matches.

Alternative: mandate a roster for every match or reconstruct lineups after play begins. Mandatory setup breaks existing goal-only behavior; reconstruction needs additional editing and partial-coverage semantics outside this scope.

### 3. Use atomic substitution events and replay validation

Each substitution records an ID, outgoing/incoming player IDs, period, precise period-relative `elapsedMs`, stable per-match integer sequence, and creation timestamp. Sequence is assigned monotonically on creation, retained on edits, and breaks equal-time ties independently of wall-clock timestamp collisions. Each event swaps exactly one current pitch player with one current bench player. Past participation never blocks re-entry.

Replay starts from the starter set and orders substitutions by `(period, elapsedMs, sequence)`. Validate IDs, distinct roles, nonnegative finite event times, period bounds, and pitch/bench membership immediately before each exchange. A candidate add, edit, or removal replays the complete candidate history before persistence; return the first conflicting event with a human-readable reason and leave saved state untouched on failure. This also handles stale open editors. Clock, substitution event, and lineup changes must not be persisted in separate steps; lineup is always derived.

Opening the live substitution form captures the precise current match time, avoiding selection delay in statistics. The form offers the current pitch for OFF and bench for ON; final replay still validates the captured-time event. Cancel discards the draft. New live recording is enabled during running, paused, and half-time states. Existing event editing/removal remains available after full-time. Goal recording retains its immediate incomplete-save behavior; substitution events require both identities before saving because an incomplete exchange cannot determine a lineup.

Alternative: store mutable `onPitch` flags and a single entry/exit time on each player. Those cannot reliably represent re-entry, historical corrections, or event ordering. Persisted interval totals would create a second source of truth; derive them instead.

### 4. Preserve period durations and model the half-time boundary explicitly

Extend matches with `completedPeriodElapsedMs`, containing nullable first- and second-half durations. End-half and full-time actions freeze the relevant elapsed value atomically with the clock update. Second-half kickoff must retain the first-half duration. Continue deriving running elapsed time from `startedAt`, not from UI interval tick counts.

All event times remain period-relative. A half-time substitution is represented at second-half elapsed zero, even while the current clock still describes completed period one. This permits lineup changes during the break without awarding time. The UI labels such an event `HT` and corrections offer an explicit half-time option; ordinary corrections use a half selector plus elapsed `mm:ss`, allowing `00:00` and stoppage-time durations beyond `45:00`. Millisecond precision from capture is preserved if the user edits only player fields. Goal time editing retains its current syntax and semantics.

During a running or paused half, only times at or before its current elapsed value are valid. Events in completed halves must not exceed the stored duration. Future periods are invalid except second-half zero during half-time. Unchanged equal-time order remains deterministic. A draft opened just before a half transition keeps its original time and is revalidated against the saved period boundary.

Alternative: treat the second half as starting at absolute minute 45. That drops first-half stoppage time. A global wall-clock interval would incorrectly include pauses and the half-time break. Keeping period identity and duration resolves both problems without changing the existing match-minute display.

### 5. Derive intervals, current lineup, and statistics from the same replay

Implement pure replay/calculation functions in `entities/match/model/participation.ts` (or closely scoped internal modules). For each period, begin with the lineup carried from the previous period, close intervals at substitutions and the period endpoint, and sum duration by player ID. Apply second-half-zero exchanges to the displayed half-time lineup but award no second-half duration until the clock starts. Split continuing spells at the half boundary; never subtract display-minute labels.

For live calculation, use the current elapsed clock value as the open period endpoint. At half-time only the first half contributes. At full-time use frozen endpoints. A non-started tracked match has a planned lineup with zero time. No negative interval or duplicated player interval is valid. Sum milliseconds first; display the floored total in elapsed minutes and seconds. Cross-match totals can use hours/minutes/seconds for readability without losing precision.

Provide match-entity aggregation over match records keyed by primitive player IDs. The statistics page joins these results with directory records using both public APIs; neither entity imports the other. Include all started tracked matches, flag ongoing contributions, and show zero-time entries for selected but unused players. Count an appearance only when total on-pitch time is strictly positive, so re-entry counts once and a zero-length spell counts zero. Recalculate from records rather than persisting counters; this local single-squad scope does not justify adding a cache/database without evidence of a performance problem.

Alternative: count selection as an appearance or include only finished matches. Positive time reflects actual participation, while live contributions align with the match view. These are planning defaults, along with inclusion of stoppage time and exclusion of clock pauses; they were not separately specified by the user.

### 6. Extend existing FSD ownership and page composition

Target additions after the architecture prerequisite:

```text
app                    initialize/provide both stores; navigation
pages/my-players       compose directory management
pages/player-statistics  compose player summary and match breakdown
pages/match-detail     compose setup, pitch/bench, timeline, clock
features/manage-players          add/edit/archive/restore actions
features/configure-match-squad   combine directory selection and match setup
features/record-substitution     capture/select/validate/save exchange
features/edit-substitution       edit/remove/validate/save history
features/control-match-clock    extend existing half-end persistence
entities/player        directory types, storage, reactive state
entities/match         roster/event values, replay, durations, statistics
```

Reusable match-only pitch/bench display can live in `entities/match/ui`; page-specific timeline layout stays in `pages/match-detail/ui`. The directory and statistics pages emit navigation requests to app rather than importing each other. Features share entity domain operations rather than importing sibling features. Public `index.ts` exports are the only cross-slice entry points. Do not add widgets or shared domain helpers merely to satisfy a directory diagram.

Keep current goal arrays and merge goals/substitutions only for timeline presentation. Order by period and elapsed time; preserve substitution sequence for equal-time exchanges, use existing goal creation ordering for equal-time goals, and a stable documented event-type tie-break for ties between types (goals first). A substitution cannot change `scoreFor`. Add persistent navigation to My players and player statistics without adding a router dependency. Maintain accessible OFF/ON labels, clear validation errors, and usable narrow-screen controls; pitch means a player list, not a formation diagram.

Alternative: rewrite all goals into a unified persistent event union or put directory/player coordination in app. A presentation union is sufficient, and feature-level coordination fits existing ownership without unrelated data migration.

### 7. Version match records within the existing IndexedDB boundary

Keep the existing `touchline` database at IndexedDB schema version 1 and keep the `matches` object store keyed by match ID. Do not import, read, mutate, or fall back to the legacy `touchline.match-store` localStorage key; it is outside the active persistence contract. Version match values independently of the IndexedDB schema: an existing record without `recordVersion` (or explicitly tagged version 1) is a version-1 record, while every new or successfully upgraded write has `recordVersion: 2`. These adapter-owned fields are removed during normalization and are not part of the match domain model.

Normalize version-1 records on read without writing them. Preserve IDs, teams, timestamps, goals, and exact clock fields; add `participation: null` and nullable completed-period durations. Infer a completed duration only when the stored clock proves it: a first-half half-time state establishes the first-half duration, and a full-time state establishes the final duration of its active period. A version-1 record already in period two has no recoverable first-half duration, so retain null rather than substituting 45 minutes. Running or paused periods have no completed endpoint yet. These records have no participation setup and are excluded from statistics. A not-started legacy record can still configure tracking normally.

Upgrade records lazily: only the next successful save of a version-1 match writes its version-2 form. In the same version-2 IndexedDB value, retain the exact original version-1 record once as `legacyV1Backup`; preserve that backup on every later save. The repository reads the current value and writes the version-2 value in one read-write transaction, so a failed transaction leaves the original record intact and the app-scoped store publishes no uncommitted state. Reads normalize mixed version-1/version-2 collections. Unsupported record versions or invalid required fields fail without overwriting stored data. Reopening or retrying is idempotent, and merely inspecting a legacy record does not migrate it.

The player directory remains an independent local store; creating or archiving a player never rewrites match records. Save a player before selecting it into a match. Existing goal-name strings are not matched to player records.

Alternative: bulk-rewrite the archive, add a second database/object store, or restore the old localStorage envelope. A per-record discriminator and same-record backup use the existing transaction boundary, preserve mixed collections, and avoid a database schema upgrade or prohibited legacy localStorage migration. Records remain independently writable as established by the IndexedDB storage change.

## Risks / Trade-offs

- [Concurrent FSD work changes file paths and APIs] -> Apply this feature after `align-app-with-fsd-architecture` is complete; rebase onto its delivered public APIs rather than duplicating extraction work.
- [A late event edit makes later re-entry impossible] -> Replay the entire candidate sequence, identify the conflict, and save nothing on failure. The user can remove dependent mistaken events in reverse order.
- [Ordinary match-minute labels introduce off-by-one duration errors] -> Store elapsed milliseconds; use explicit elapsed half time in substitution corrections and elapsed duration formatting in statistics.
- [Running totals drift across reloads or half transitions] -> Use persisted clock anchors and frozen period endpoints, with deterministic time-driven tests.
- [One-for-one events cannot represent a temporarily short-handed side] -> Keep this scope explicit; cards, unpaired departures, and temporary exits require a later participation-event extension.
- [Directory edits rewrite the meaning of past matches] -> Stable IDs plus match-local name snapshots and non-destructive archiving.
- [Older builds ignore new fields and can drop them if they save a version-2 record] -> Retain the original version-1 record backup, document that rollback does not preserve participation edits, and prefer a forward fix once tracking data is recorded.
- [Locked starter setup makes post-kickoff setup mistakes harder to fix] -> Provide a clear pre-kickoff lineup review. Retrospective initial-lineup editing is outside this change; substitution corrections are supported.

## Migration Plan

1. Verify the completed FSD and IndexedDB storage boundaries before implementing this feature.
2. Add per-record version-1 read normalization and version-2 writes in the existing IndexedDB object store, duration retention, the independent player directory adapter, and pure participation calculations with colocated tests.
3. Compose the directory, pre-match setup, substitution, timeline, and statistics interfaces using the existing app-scoped store pattern.
4. Exercise literal version-1 IndexedDB fixtures (not created through the new factory), running/paused/full-time reloads, migration backup/retry/failure cases, and the entire own-team workflow in Firefox. Confirm legacy localStorage values remain untouched. Complete `npm test`, `npm run build`, and `npm run test:e2e`, plus narrow/desktop UI and import-boundary review.
5. Deploy the coherent feature. Each legacy IndexedDB record is upgraded on its first successful save; merely inspecting it does not rewrite storage.

Rollback before any version-2 write is a normal prior-build redeploy. Older builds can open the unchanged IndexedDB schema but do not understand participation fields and may drop them when saving; the embedded version-1 backup is for recovery, not an automatic downgrade. Preserve the version-2 database before deliberate recovery and prefer a forward fix after participation data is recorded. Legacy localStorage remains separate and is not a rollback source for IndexedDB records. No automatic destructive downgrade is planned.
