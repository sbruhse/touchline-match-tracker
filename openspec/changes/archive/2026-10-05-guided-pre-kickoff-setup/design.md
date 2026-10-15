# Design

## Context

See `proposal.md` for motivation and the three delta specs for the behavior contract. Root `Design.md` supplies the durable phone-first, optionality, feedback, and visual principles.

Observed implementation and tests:

- `MatchArchivePage.vue` embeds `CreateMatchForm`; both successful creation and archive selection emit the same `openMatch` event. `App.vue` uses local refs for navigation, not Vue Router.
- `createAndSaveMatch` commits the match before returning its ID. `CreateMatchForm.spec.ts` and `App.spec.ts` protect retained team inputs, pending writes, and navigation only after successful creation.
- `MatchDetailPage.vue` mounts `ConfigureMatchSquad` and `AssignMatchJerseys` above the event panel before kickoff. Both editors begin behind their own launchers. The live sticky header, tabs, and fixed recording area stay present while preparing.
- `ConfigureMatchSquad` owns its draft and validates through `buildMatchParticipation` before `persistMatchParticipationSetup`. It currently exposes only `matchId`, with no committed-save event for a workflow coordinator.
- `AssignMatchJerseys` owns `useMatchJerseyDraft`, which already supports stable generated proposals, partial acceptance, source-data retries, stale selection validation, and reconciliation after committed squad edits. Its UI currently exposes preparation or summary mode, but no successful-acceptance event.
- `JerseyAssignmentSummary` renders a Saved badge even when its assignment is null. On narrow screens, `JerseyAssignmentEditor` switches its action flexbox to column layout while retaining the buttons' `11rem` flex basis.
- The approved root design and existing domain specs keep both tracking systems optional. The current football spec's creation scenario says to open live recording directly; this change explicitly replaces that transition. Existing goal availability before kickoff remains unchanged on the Match screen.

Browser exploration used demo data in the Playwright profile only. At 320×700, the preparation page had a roughly 296px sticky Match header and a 101px fixed recording area. Jersey rows were about 147px high and the acceptance/cancel buttons were each 176px high; at desktop width those buttons were 48px high. These observations guide the focused preparation surface, not a redesign of the live workspace.

## Goals / Non-Goals

**Goals:**

- Coordinate existing independently owned features through explicit public events, keeping navigation out of their domain save algorithms.
- Make optional preparation usable without a duplicate launch click for each editor or live controls occupying the editing surface.
- Preserve successful-save boundaries and saved match snapshots while handling back, skip, exit, and retry predictably.
- Reuse the same preparation surface when editing an existing unstarted match.

**Non-Goals:**

- Rebuilding the archive, player directory, or jersey inventory; inline player/jersey creation, imports, templates, or copying a previous lineup.
- Changing lineup validity, jersey allocation priorities, random tie-breaking, historical-number rules, substitution logic, clock timing, or goal availability.
- Adding a router, new dependencies, persistent wizard-step state, automatic draft saving, a new match record version, or storage migration.
- Replacing the existing squad-selection semantics with formations or a new three-role picker in this change.
- Reworking running/completed Match layouts beyond removing duplicated pre-kickoff editor composition.

## Decisions

### 1. Keep team entry and distinguish creation from reopening

The existing team-name form remains the first step and receives copy that makes the following optional preparation clear. This avoids introducing another launcher before the user can type teams. Submitting still uses `createAndSaveMatch`; the commit is the boundary between team entry and the new preparation surface. No persistent match exists before that commit, and a failed creation keeps both fields.

Add a distinct `matchCreated(matchId)` event to `MatchArchivePage`, while `openMatch(matchId)` continues to mean ordinary archive reopening. `App.vue` chooses the preparation surface for a newly created ID and the Match surface for archive/statistics selections. Use a small local view ref beside the existing selected match ID, not a new routing library. Successful preparation never creates a second match.

**Alternative:** Route every unstarted archive match straight into preparation. Rejected because optional setup would become unavoidable on each reopening and older goal-only matches would change behavior unnecessarily.

### 2. Use two focused preparation steps after the team form

The full journey is Teams → Squad → Jerseys → Match. Only Squad and Jerseys need a new post-creation workspace; finishing is a transition, not a fourth mandatory confirmation screen. The workspace initially opens squad selection, showing the team names and the current optional step. Existing saved squads are restored when preparation is reopened.

| Current step | Action | Result |
| --- | --- | --- |
| Teams | Create/continue | Commit the match, then open Squad |
| Squad | Save squad and continue | Commit a valid setup, then open Jerseys |
| Squad, saved setup | Keep squad and continue | Open Jerseys without another write |
| Squad, Jerseys previously visited | Return to jersey review | Retain both drafts; Jerseys still uses the saved squad |
| Squad, no saved setup | Skip player tracking | Open the unstarted Match; do not mount a jersey editor |
| Jerseys | Save assignments and finish | Accept the whole distribution once, then open the unstarted Match |
| Jerseys | Skip jerseys / Keep saved jerseys | Open the Match without replacing committed assignments |
| Jerseys | Back to squad | Return to Squad with in-session drafts retained |
| Either optional step | Go to match / app navigation | Leave without kickoff, subject to draft-discard confirmation |

Showing a neutral explanation that jerseys need a saved squad is sufficient when squad setup is skipped; an unusable jersey form is not another compulsory step. Partial accepted distributions remain allowed.

Already-saved preparation is not removed by skipping. Disabling player tracking remains an explicit action in squad setup, using the existing atomic disable operation that also clears its distribution. Keeping a saved step is distinct from disabling it.

**Alternative:** Put all fields into one long form or one combined atomic save. Rejected because it recreates the scrolling problem and conflates optional features with different validation and persistence boundaries.

### 3. Keep drafts feature-owned and saves authoritative

Add a workflow presentation contract to the two existing setup features. Workflow mode opens the active editor directly and uses save-and-continue/finish actions; ordinary summary behavior remains available. The features emit `saved` only after their existing async save returns successfully, not when a submit button is pressed. The preparation coordinator advances on that event.

Each feature also reports whether its current inputs differ from its latest committed baseline and emits workflow navigation intents. Skip/keep never attempts to validate or persist an incomplete draft. Keep both feature instances, keyed by match identity, for the open preparation session, showing only the active step. Mount jersey editing only once a saved squad exists; reopening a previously visited step must not call its draft initializer again or regenerate a proposal.

Back navigation and returning to an already-visited step retain drafts; these are distinct from explicitly skipping changed inputs. If squad edits remain unsaved when returning to jersey review, explain that jersey rows still use the saved squad. A saved squad change continues to reconcile jersey rows using existing stable player IDs; starter-only changes do not reroll or replace the distribution. Refresh the dirty baseline after commit, and make deliberate discard/reset an explicit input to the feature rather than reading its private refs from the page.

The coordinator checks pending match writes before any step transition or departure. A failed save stays in the same editor with exact inputs, source validation messages, and a retry action. Source loads may disable editing, but must not disable skip/keep/exit once no match write is pending.

**Alternative:** Hoist both drafts into the page and call entity persistence directly. Rejected because it would duplicate feature validation, weaken stale-data and lottery guarantees, and make a growing page responsible for domain operations.

### 4. Preserve saved preparation, not a persistent wizard session

Each successful step is already a committed local match snapshot. Leaving or reloading retains the created match and those snapshots. After reload the archive is the normal entry point; preparation reopens from committed data, without a stored step index or a promise to restore unsaved drafts.

Within the open session, back navigation preserves drafts. Before skipping a changed step or an app-controlled departure that would discard any changed preparation draft, show a confirmation with Keep editing and Discard changes. Check drafts in hidden steps too, including when successful jersey acceptance would otherwise finish immediately. This confirmation does not save or remove committed data. Confirmed skip resets that step's draft to the saved baseline; confirmed exit can unmount the whole preparation surface.

Global app navigation must pass through the same preparation departure handling instead of directly clearing the selected match ID. `App.vue` sends a typed navigation request to the preparation page; that page decides whether to confirm or wait for a write, then emits the approved destination. Use the existing `FocusedEditorShell` for the small discard dialog, with focus containment/restoration. Do not wrap the entire workflow in an editor modal.

**Alternative:** Persist unfinished drafts or reserve a special draft-match record. Rejected for this iteration: the approved requirement is optional preparation, and existing saved steps give recoverability without a storage-format change. Browser reload/tab closure can lose unsaved inputs; do not claim otherwise in UI copy.

### 5. Establish explicit component boundaries

Use Vue Composition API and `<script setup lang="ts">`. Names below are proposed implementation names; keep imports between slices on public `index.ts` entry points.

| Location | Responsibility and public contract |
| --- | --- |
| `app/ui/App.vue` | Select archive, preparation, or detail; distinguish creation from opening; forward global departure requests and accept approved navigation. No squad/assignment save logic. |
| `pages/match-archive` | Compose existing team entry and archive list; emit distinct `matchCreated(id)` and `openMatch(id)` events. |
| `features/create-match` | Own team fields and match creation; retain `created(id)` after commit. Update relevant labels/help and phone input sizing only. |
| `pages/match-preparation/ui/MatchPreparationPage.vue` | Resolve `matchId`, compose the step header and features, accept a typed `navigationRequest`, and emit approved `navigate(destination)`. |
| `pages/match-preparation/model/usePreparationFlow.ts` | Own current step, departure intent, discard confirmation, and feature-reported dirty state; derive saved/setup eligibility from stores. No duplicate drafts or domain writes. |
| `pages/match-preparation/ui/components` | Small step-header and discard-dialog presentation components: labels/state in, navigation/confirmation events out. |
| `features/configure-match-squad` | Keep validation and draft ownership; add workflow presentation, active-step/discard inputs, and typed `saved`, `dirtyChange`, and navigation-intent events. Add retry for unavailable player data. |
| `features/assign-match-jerseys` | Keep `useMatchJerseyDraft` and explicit generation/acceptance; add equivalent workflow lifecycle inputs/events while retaining summary mode. |
| `pages/match-detail` | Replace expanded pre-kickoff setup blocks with a compact saved-state summary and `prepare(matchId)` event. Compose started/completed screens as today. |
| `shared/ui` | Reuse `FocusedEditorShell` and local icons only. No match-specific wizard framework. |

Page slices never import one another: App responds to their events. The two features never import one another: the preparation page coordinates them. Keep a single rendered instance of each editor/summary heading so existing form IDs remain unique. Keep generic helpers generic; do not move preparation state into `shared`.

**Alternative:** Implement the entire workflow in `App.vue` or as a feature that imports both existing features. Rejected because the former expands root responsibilities and the latter violates same-layer slice dependencies.

### 6. Give preparation its own compact phone layout and honest feedback

Use the existing `Design.md` palette and type roles. One compact team-context header and current-step label lead the active form. Do not mount `MatchHeader`, the Match tablist, timeline, clock actions, or `MatchActionBar` here. Once the user finishes or exits to Match, existing recording eligibility, including pre-kickoff goals, is unchanged.

```text
+--------------------------------------+
| < Go to match                        |
| Eastside FC vs Westfield United      |
| Squad — optional                     |
+--------------------------------------+
| Your side: [Home] [Away]              |
| Squad and starter choices            |
| ... document scroll ...              |
| [Save squad and continue]            |
| [Skip player tracking]               |
+--------------------------------------+

+--------------------------------------+
| < Back to squad       Go to match    |
| Eastside FC vs Westfield United      |
| Jerseys — optional                   |
+--------------------------------------+
| Set [Blue kit] [Generate proposal]    |
| Draft — not saved                    |
| Alex Morgan    #12, M                |
| ... every starter and substitute ... |
| [Save assignments and finish]        |
| [Skip jerseys / Keep saved jerseys]  |
+--------------------------------------+
```

Prefer normal document scrolling with actions at the end of the step, not another fixed footer. At short heights the small header can scroll away; no nested fixed-height list or sticky app bar is needed. Give fields readable text, at least 48px control targets, wrapping names, and safe-area padding. Retain current inclusion/starter controls but increase their usable label targets and show clear starter/bench context. Avoid nested cards and decorative labels that shrink the remaining content width.

Fix the mobile action flex sizing by resetting the desktop flex basis when the action layout becomes a column; preserve the 48px minimum and allow height growth for genuinely wrapped labels, not arbitrary empty space. Keep jersey number, size, and owner distinctions readable in narrow selectors/adjacent summaries without changing item identity or manual-choice eligibility.

Show one visible match save-status owner in preparation and local actionable errors at the relevant editor. Suppress the duplicate app-level Match save banner for this surface, as the live page already does. Distinguish Not prepared, Draft, and Saved; a null distribution never gets a Saved badge. A saved partial result remains Saved with explicit unassigned rows. Do not store a skipped/completed flag merely to produce status labels.

Focus the new step heading after navigation, move focus to the first invalid field or associated error on failed validation, and restore meaningful Match focus after finish or departure. The discard dialog restores focus when cancelled. When a feature remains mounted behind a hidden step, it must not steal focus or announce hidden status. Desktop can widen the workspace and use additional columns, but retains the same step order and actions.

**Alternative:** Reuse the live sticky header and recording bar, or build a full-screen wizard modal. Rejected because both retain space/focus competition that the exploration identified; a dedicated page is simpler for navigation and long lists.

## Risks / Trade-offs

- Saving teams before optional setup leaves an unstarted match in the archive if the user leaves → Treat it as an ordinary reusable match; never silently delete it or create a replacement when preparation resumes.
- Retained hidden editors may reset drafts, duplicate IDs, steal focus, or announce background messages → Key by match, initialize once per session, keep IDs unique, and gate focus/announcements on active-step state.
- A saved squad edit can invalidate jersey rows → Reuse existing reconciliation and source validation; preserve retained identities and never auto-generate a replacement proposal.
- Global navigation can bypass dirty-draft confirmation → Route topbar/home navigation through the same preparation departure request; cover it in app integration tests.
- Without persistent drafts, reload loses uncommitted inputs → State the saved-step boundary honestly; restore only committed snapshots and keep pending/failed-save drafts while the page stays open.
- Mobile inputs, wrapped buttons, and large squads can still need substantial scrolling → Use the full focused surface, meaningful compact rows, normal scrolling, and geometry/keyboard tests rather than assuming a wizard alone solves sizing.
- Many browser tests currently expect immediate Match opening and inline editors → Add creation/preparation helpers and change only assertions that depend on the old entry surface; keep clock, goals, history, and storage regression coverage.

## Migration Plan

No record, database, player-directory, or inventory migration is required. Implement behind the existing creation and opening events, then replace pre-kickoff editor composition only once the preparation page and feature contracts are covered. Update README creation/preparation/reopening instructions.

Run `npm test`, `npm run build`, and `npm run test:e2e`. Verify 320px and 390px widths, 844×390 landscape, desktop, enlarged text, long/duplicate names, a realistic squad, and manual soft-keyboard behavior. Test the creation/acceptance commit boundary, every skip combination, source-loading failures, failed-save retries, dirty departures, back navigation, reload, squad reconciliation, and post-kickoff locks.

Rollback is a presentation/navigation rollback only: restore the previous entry and inline setup UI without transforming or discarding saved matches or accepted preparation.
