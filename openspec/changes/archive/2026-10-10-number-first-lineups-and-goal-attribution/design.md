# Design

## Context

See `proposal.md` for motivation and the four delta specs for the behavior contract. This is a targeted extension of the current guided-preparation and Match surfaces, not a replacement for those workflows.

Observed implementation and tests:

- `JerseyAssignmentRow.vue` already receives the draft jersey snapshot but renders its number only inside a long native-select option. `JerseyAssignmentSummary.vue` and `PreKickoffPreparationSummary.vue` display saved number, size, and ownership together.
- `MatchLineupWidget.vue` derives stable pitch/bench rows and playing times from match snapshots; `LineupPlayerList.vue` renders names, optional LIVE indicators, and times. `MatchDetailPage.vue` mounts an additional `AssignMatchJerseys` summary after kickoff.
- `GoalEvent` contains `scorer` and `assist` strings without player identities. `GoalEventEditor.vue` owns one editable draft and preserves it across Close and failed saves. Its opening watcher is not immediate, which matters when a newly rendered editor starts with `open: true`.
- The goal editor currently reparses the displayed football minute on every details save; formatting/parsing is not an exact millisecond round-trip, so unchanged time needs explicit preservation when automatically offering attribution on every goal.
- `recordMatchGoal` returns the committed goal ID only after `store.persist` succeeds. The page already forwards a requested goal ID into `MatchTimeline` to open that goal's existing editor without changing the selected panel. The editor is teleported through `FocusedEditorShell`.
- `parseGoal` currently copies only name fields; the repository reads record versions 1–3 and writes version 3. `copyMatchSnapshot` spreads each goal, and the repository preserves a version-1 backup on the first successful upgrade.
- `persistMatchParticipationSetup` reconciles jersey assignments in the same pre-kickoff save but does not currently reconcile goal attribution.
- `aggregatePlayerParticipation` excludes unstarted/untracked matches and invalid playing-time histories. `PlayerStatisticsPage` and `PlayerStatisticsSummary` show only minutes and appearances, with a separate existing match breakdown.
- Tests explicitly expect no automatic goal dialog and a separate live jersey summary containing sizes. README repeats both behaviors. Those are intended behavior replacements, not accidental regressions to work around.

`guided-pre-kickoff-setup` remains an active change with implemented code and one outstanding manual/responsive verification task. This proposal uses the observed implementation as its baseline, keeps its artifacts untouched, and avoids rewriting its workflow requirements. On eventual archive, sync both changes deliberately so their different football/jersey/participation requirement updates survive.

## Goals / Non-Goals

**Goals:**

- Make number-first presentation a projection of existing draft/accepted snapshots, not another allocation or identity source.
- Reuse the same goal editor for automatic and explicit opening, with a separate initial-goal commit and optional details commit.
- Keep player attribution and goal statistics owned by the match entity, independent of directory availability and playing-time calculations.
- Make compatibility and reconciliation explicit before introducing references into persisted goals.

**Non-Goals:**

- New navigation infrastructure, external selector libraries, broad component migrations, or a redesign of statistics/history.
- Storing scoring counters in directory players, inferring identity from names/numbers, or changing appearance and playing-time rules.
- Opponent squads, an own-goal event model, goal deletion, or new rules requiring credited players to be on the pitch at the goal time.
- Adding goal/assist columns to every lineup row or match-breakdown row; the requested new totals belong in the existing player-statistics summary.

## Decisions

### 1. Keep identity, number, and snapshot names as separate concepts

Add explicit nullable `scorerPlayerId` and `assistPlayerId` fields to `GoalEvent`. Keep `scorer` and `assist` as the corresponding recorded names, serving both selected-player snapshots and unlinked manual names. A fresh goal initializes both identity fields to null; either role can remain unknown independently.

When selecting a player, use the saved match squad's `nameSnapshot`, not a potentially renamed live-directory name. The jersey number is a presentation label from that match's accepted assignment and is not stored inside the name or used as an identity. Existing match snapshots therefore remain readable after directory edits and inventory removal.

Define pure attribution validation/reconciliation in `entities/match/model`, exposed through the entity's `index.ts`. Non-null references require nonblank identity and recorded name, membership in the saved squad, and a goal side matching the saved own side. Validation never requires the live player directory. Do not introduce an on-pitch-at-goal-time gate or a positive-minute requirement.

Manual typing removes the corresponding reference, even if the resulting text equals a saved player's name. Changing one role leaves the other role and unrelated details unchanged. Reopening selects a player only by the persisted reference, never by text matching. Same-name players remain distinct through stable option identities and the existing distinguishing labels.

**Alternatives:** Name-only pickers are smaller but lose attribution identity and cannot support reliable totals. Storing only IDs would lose readable opponent/legacy details and become dependent on the live directory. Embedding a player's goals/assists in their profile duplicates match data and makes corrections non-atomic.

### 2. Use record format 4 and a lazy, transactional upgrade

Extend the reader to accept versions 1–4 and keep the current treatment of unversioned records as version 1. Normalize legacy goal roles to null references without matching their text names; preserve all existing clock, participation, duration, jersey, kickoff, and backup normalization behavior. Version 4 requires both nullable reference fields on every goal and validates references against the stored match squad/own side after parsing both.

Retain strict validation of version-3 required match fields; support for older records must not become a permissive path around current integrity checks. Version-4 reads and new writes reject malformed references without consulting the directory. Unknown-directory identities that still belong to the saved squad are valid historical links.

Write only format 4 on the next successful save of a match. Rename the version-specific writer/build helpers to match the new format, preserving the current read-existing/write-candidate transaction and its failure boundaries. Keep `legacyV1Backup` creation and preservation unchanged, including existing version-2/3 backups. No eager rewrite, database-schema bump, object-store change, localStorage match import, or directory/inventory migration is needed.

`copyMatchSnapshot` already copies goal properties, but add coverage ensuring the new references survive clock, goal, substitution, and jersey actions. Audit literal goal fixtures and factories so current runtime matches consistently contain explicit nulls or valid IDs.

**Alternative:** Adding optional fields to version 3 avoids a version bump but leaves older version-3 readers silently dropping attribution on a later save. A distinct format makes that compatibility boundary visible and testable.

### 3. Reconcile references at existing match-save boundaries

Goal-details saves validate against the latest committed match and reject stale/outside-squad selections without losing the draft. An intentional draft team change to the opponent clears incompatible role references while keeping their recorded names as manual values; changing the team back does not silently resurrect them. Do not silently erase a newly submitted invalid selection just to make a details save pass.

Keep a saved display-time baseline. If the minute field remains unchanged, preserve the committed goal's original `period` and `elapsedMs` rather than parsing its ordinal-minute label back into a rounded time. Only an intentional changed minute uses the existing parse/validation rules. All details edits retain the goal ID and `createdAt`. Test a non-minute-aligned instant and stoppage time as well as an explicit time correction.

Before a pre-kickoff squad change is persisted, reconcile every goal against the proposed participation snapshot:

- Retain links whose player identity remains in the squad and whose goal side still matches the own side.
- Clear references for removed players, incompatible own-side changes, and disabled participation, while preserving the recorded scorer/assist strings.
- Starter-only edits leave eligible references untouched.

Apply this alongside current jersey reconciliation in `configure-match-squad`'s match snapshot/save operation. The feature calls public match-entity helpers rather than importing another feature. Failed saves publish neither changed preparation nor cleared goal links. No separate player write or cleanup transaction is introduced.

**Alternatives:** Rejecting every preparation edit until old goals are manually fixed would obstruct optional setup. Leaving ineligible references behind would create invalid records and misleading statistics. Eagerly reacting to directory edits would rewrite historical facts and break saved identity independence.

### 4. Reuse one committed-goal opening path

`RecordGoalButton` and `recordMatchGoal` keep their current immediate-recording responsibility. In `MatchDetailPage.handleGoalRecorded`, use the returned committed ID to request opening through the existing `requestedGoalId`/`MatchTimeline` mechanism. A successful recording opens the editor once for that ID, whether Events or Player times is selected and whether the goal is before kickoff, during play, or after full-time. Opponent/untracked goals also open details, with manual-name fields rather than own-squad selectors.

Do not watch the goal array or store save status to trigger opening: those also change during details edits, clock actions, load, and retries. A failed initial save emits no committed result and opens no editor. A details failure keeps the already saved goal and exact attribution draft retryable rather than recording another goal.

Initialize `GoalEventEditor` from saved values even when it first mounts with `open: true`; load names, references, time, side, and description before the visible form is used. Existing explicit timeline Add details/Edit and the success-feedback Add details request remain valid paths into this same editor. Closing automatic details can leave the last-recorded goal shortcut available; suppress page feedback while the editor owns feedback rather than losing the committed goal ID merely because it opened.

Keep the selected panel unchanged behind the teleported editor and the clock running. Close/Escape retains an in-session draft, Discard changes resets to saved values, and a successful details save commits and closes. Preserve meaningful focus restoration to the recording action or active panel, never to a launcher hidden in the other panel. Ignore stale opening requests if their originating match is no longer the displayed match.

**Alternatives:** Asking for players before creating a goal changes the recording-time boundary and risks losing the goal when dismissed. A second dedicated post-goal wizard duplicates drafts and correction behavior. Opening from all store updates causes repeated/unrelated dialogs.

### 5. Make role selection feature-local and usable without inventory

Extract a small `features/edit-goal/ui/components/GoalPlayerField.vue` for the repeated scorer/assist field presentation. Each role has a typed draft mode: none, squad player with ID/name snapshot, or manual name. The parent editor owns those role drafts together with side/time/description; validation belongs in the feature model using match-entity invariants.

For own-side goals with a saved squad, the native selector offers an empty value, every saved squad member, and an explicit manual-name option. A manual value reveals the existing text-entry capability. For opponent or untracked goals, render manual text entry directly. Saved name-only goals reopen in manual mode even when matching names exist. Choosing a player hides manual input for that role and records its ID/name; clearing a choice clears that role.

Build labels from saved squad identities and accepted number snapshots: `#7 Alex Morgan`, `#0 Sam Taylor`, or the distinguishing name when no jersey exists. Keep the full saved squad, including the bench, rather than infer historical eligibility from the current lineup. Missing live inventory/directory data does not prevent selecting a saved squad player. If a retained draft's player no longer belongs to the current saved squad, show its previous selection as stale and reject acceptance with an actionable error.

Use native keyboard/touch behavior and existing focus containment. Long native-select labels can be truncated by platforms, so show the selected option's complete label in wrapping adjacent text when needed; do not depend on closed-select clipping for identification. The two roles have unique form/error IDs and clear labels. No jersey sizes/owners enter these selectors.

```text
+--------------------------------------+
| Goal saved                    Close  |
| Scorer [#7 Alex Morgan             v] |
| Assist [#12 Sam Taylor             v] |
| Team [North City                  v] |
| Minute [23]                          |
| Description [optional text]          |
| [Discard changes] [Save details]     |
+--------------------------------------+
```

**Alternative:** A full-directory picker exposes players not in this match and ties historical editing to directory availability. An autocomplete library/custom list adds interaction and accessibility complexity that native controls do not require here.

### 6. Project number-first rows without changing jersey assignment logic

Use the draft row's `jerseySnapshot.number` for proposal headings and accepted `match.jerseyAssignment` rows keyed by `playerId` for lineups and goal-choice labels. A small public match-entity number lookup can share accepted-number retrieval; player label formatting stays in the existing player-identity helper or local presentation code, not an entity-to-entity import.

In `JerseyAssignmentRow`, put the prominent number before the name outside the select; keep player size, physical-shirt choices, ownership, and errors secondary. Changing selection updates this header from the existing draft, including a stale saved snapshot with its accompanying unavailable-selection error. Number 0 must use null checks, not truthiness. Update saved preparation summary headings consistently to number first while retaining their secondary snapshot details.

Add nullable number/partial-unassigned information to `LineupPlayerRow` and keep the existing stable row order, live indicator, playing time, and duplicate-name suffixes. A player explicitly unassigned in an accepted distribution gets a compact `No jersey assigned` indication. A match with no distribution stays neutral and does not label every player as an error.

Remove the post-kickoff `AssignMatchJerseys` summary composition from `MatchDetailPage`; keep `PreKickoffPreparationSummary` and its saved-snapshot disclosure available before kickoff. The accepted numbers in the widget replace the live distribution list. Do not add jersey sizes or ownership to widget rows, and do not rewrite accepted snapshots or allocation code.

```text
+--------------------------------------+
| Jersey review: draft                 |
| #7  Alex Morgan                      |
| Player size M                        |
| Jersey [Number 7, size M ...       v] |
+--------------------------------------+

+--------------------------------------+
| On the pitch                         |
| #7  Alex Morgan        LIVE   23:14   |
| #12 Sam Taylor                23:14   |
| On the bench                         |
| Lee Taylor                    00:00   |
| No jersey assigned                   |
+--------------------------------------+
```

Keep the current palette/type roles. Use readable tabular numbers and a quiet number prefix/badge rather than decorative kit artwork. Allow names and unassigned notes to wrap; never trade readable times or 48px targets for density.

**Alternatives:** Enlarging only select text still buries the number among shirt logistics. Keeping a second live roster duplicates information and scroll effort. Reading live inventory instead of accepted match numbers changes history after kit edits.

### 7. Derive scoring totals separately from participation validity

Add a pure `aggregatePlayerGoalStatistics` operation in the match entity, exposed through its public API. It returns goal and assist counts from committed matches and player IDs, without accessing the directory or persisting counters. `PlayerStatisticsPage` composes its result with the existing `aggregatePlayerParticipation` result and passes both sets of values into `PlayerStatisticsSummary`.

Use the current statistics convention of started tracked matches (`clock.status !== 'not-started'`), not a non-null first-kickoff timestamp, since historical started records can lack that timestamp. Count only references linked to the saved own side/squad. A goal contributes once per recorded role; re-entry, clock refreshes, reloads, and unrelated saves never add increments. Assist credit is independent of scorer credit.

Do not reuse participation `breakdowns` or its valid-duration/history gate to decide whether a valid goal link counts. Unknown playing-time history can prevent reliable minutes without making an explicitly saved scorer unknown. Similarly, credited goals do not create a positive-time appearance. An attributed pre-kickoff goal is durable but excluded until the match starts. These are proposed defaults aligned with existing started-match statistics and explicit attribution, not a new minimum-minutes rule.

Show four labelled values in the existing summary: Playing time, Appearances, Goals, Assists. Add a concise coverage note that name-only goals and unstarted matches are excluded. Retain existing match breakdown/navigation and archived-player access; do not add new profile counter storage, leaderboards, or per-match scoring columns in this change.

**Alternatives:** Increment/decrement profile counters creates cross-store atomicity and retry problems. Counting names misattributes equal/renamed players. Extending the existing participation aggregation's early exits to scoring would wrongly lose valid goals when only playing-time history is unavailable.

### 8. Keep the component and layer boundaries explicit

| Location | Responsibility / contract |
| --- | --- |
| `entities/match/model/match.ts`, `goals.ts` | Goal identity fields and explicit-null factory defaults. |
| `entities/match/model/goalAttribution.ts` | Proposed pure validation and pre-kickoff reconciliation; match data in, validated/preserved or cleared reference data out. No directory/UI dependencies. |
| `entities/match/model/playerGoalStatistics.ts` | Proposed pure ID-based goal/assist aggregation independent of playing-time history. |
| `entities/match/api/matchStorage.ts` | Version-aware read normalization, integrity validation, format-4 writer and backup preservation. |
| `features/configure-match-squad/model` | Compose goal-reference and jersey reconciliation within its existing successful-save boundary. |
| `features/edit-goal/ui/GoalEventEditor.vue` | Own the complete goal-details draft and open/close/save behavior; delegate repeated role presentation. |
| `features/edit-goal/ui/components/GoalPlayerField.vue` | Labelled role selector/manual input; role draft, options, and disabled/error state in; typed role update out. |
| `features/edit-goal/model` | Convert/validate the submitted draft against the latest match and persist through the existing save operation. |
| `features/assign-match-jerseys/ui/components` | Draft/saved number-first shirt review with secondary logistics; no allocation changes. |
| `widgets/match-lineup/ui` | Join accepted numbers onto existing time rows and render pitch/bench lists. |
| `pages/match-detail/ui` | Compose compact lineup and automatic committed-goal editor request; no player attribution persistence algorithm. |
| `pages/player-statistics/ui` | Compose participation/scoring projections and render four summary metrics; preserve breakdown/navigation. |

All new cross-slice imports go through public `index.ts` files. Entities do not import each other, pages do not import each other, and features do not import sibling features. Do not create a generic shared match-player picker or move goal-specific logic into `shared`.

## Risks / Trade-offs

- Automatically opening details interrupts the previous uninterrupted recording flow -> Keep one-tap goal persistence, optional fields, prominent Close, and the originating panel; do not delay timestamp capture or pause the clock.
- A just-added goal editor can mount already open and show an uninitialized draft -> Explicitly initialize this state and test it separately from reopening existing editors.
- Native selectors can clip long labels or shrink the usable viewport -> Provide wrapping selected-label context, at least 48px targets, and browser geometry/focus tests with long/equal names and reduced height.
- Format 4 cannot be read by older app releases -> Document the upgrade boundary, retain prior formats/backups on read and failed saves, and use a forward fix rather than an implicit downgrade.
- Pre-kickoff roster edits or side corrections can strand references -> Reconcile them atomically while preserving name text and reject stale details selections before publication.
- Independent goal totals and unavailable playing-time totals can seem inconsistent -> Explain explicit-link coverage and keep scoring eligibility separate from appearance/minutes eligibility in tests and UI copy.
- Existing browser helpers assume goal actions leave no dialog and look for a separate jersey summary -> Update shared recording helpers to deliberately close or complete automatic details, then replace obsolete assertions without weakening goal-save/timestamp/clock regressions.
- Multiple active changes touch nearby requirements/code -> Keep this plan scoped, implement against the current guided workflow, and preserve unrelated user changes and earlier change artifacts during apply/archive.

## Migration Plan

1. Implement the goal-reference types, validation/reconciliation, and version-4 reader/writer first, with repository/domain coverage for formats 1–4 and exact version-1 backup preservation.
2. Add feature-owned player selection and atomic attribution reconciliation, then wire only committed recording results into the existing editor-opening path.
3. Add number-first draft/lineup projection and remove the redundant live jersey composition without deleting saved preparation/snapshots.
4. Add derived scoring totals to the existing statistics summary and document coverage, automatic details, and the version boundary in README.
5. Verify unit/component coverage with `npm test`, type/build checks with `npm run build`, and browser flows with `npm run test:e2e`. Include 320px/390px, enlarged text, short/reduced-height views, desktop, keyboard focus, saved-vs-draft errors, both goal teams, both match panels, rename/archive, partial kits, reload, and lazy upgrade.

There is no eager data migration at deployment. Rollback before any format-4 save is a code rollback with old data untouched. After a successful format-4 save, older releases are unsupported; retain the database and prefer a forward fix. Any deliberate recovery from a prior backup must explicitly acknowledge losing later attribution rather than silently stripping it.

Real-device soft-keyboard and safe-area behavior cannot be proven by headless viewport tests. Record an on-device check when available, or clearly mark it unverified without claiming complete device coverage.
