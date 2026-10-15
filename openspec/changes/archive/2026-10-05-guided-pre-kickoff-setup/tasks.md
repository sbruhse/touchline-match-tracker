# Tasks

## 1. Workflow contracts in the existing preparation features

- [x] 1.1 Add typed workflow presentation, active-step/discard inputs, committed-save, dirty-state, and navigation-intent contracts to `ConfigureMatchSquad` through its public entry point; extend colocated UI tests to verify direct editor entry, restored saved choices, no success event before commit, retained invalid/failed-save inputs, and explicit disable remaining distinct from skip.
- [x] 1.2 Add empty/unavailable directory handling and player-load retry to the squad workflow without gating skip/keep on source readiness; verify with feature tests that empty data and loading failure differ, retry works, and an existing saved squad remains intact when not edited.
- [x] 1.3 Add equivalent workflow lifecycle contracts to `AssignMatchJerseys` while retaining summary/standalone behavior and `useMatchJerseyDraft`; extend colocated tests to verify acceptance events only after commit, exact lottery/manual choices through retry, partial acceptance, no generation on entry/navigation, and skip/discard preserving accepted snapshots.
- [x] 1.4 Correct `JerseyAssignmentSummary` status so a null distribution is not labelled Saved and accepted partial rows stay explicitly unassigned; verify null, complete, and partial states with colocated summary/UI tests.

## 2. Focused preparation page and step coordination

- [x] 2.1 Add the public `pages/match-preparation` slice and a page-local `usePreparationFlow` coordinator for Squad → Jerseys → Match, keep/skip, returning to visited steps, and pending-write guards; add colocated coordinator tests covering no-squad bypass, saved-squad continuation, no extra writes for skip/keep, and navigation only after successful saves.
- [x] 2.2 Compose the existing features as stable match-keyed instances in `MatchPreparationPage`, initializing jersey review only after a saved squad exists; add page tests proving back/forward retention of both drafts, jerseys using the committed squad, and committed roster edits reconciling retained/departed/new rows without rerandomization.
- [x] 2.3 Add guarded departure requests and a discard confirmation using `FocusedEditorShell`, including changed drafts in hidden steps; verify with page tests that cancel preserves inputs, confirmed skip/exit preserves committed data, a successful jersey save does not silently discard hidden squad edits, and pending/failed saves prevent premature departure.
- [x] 2.4 Add the compact team/step header, step-local save feedback, empty/error direction, and ordinary document scrolling without Match clock/tabs/recording controls; verify page tests for the appropriate actions in each state, single visible save feedback, and keyboard focus at destination headings and confirmation cancellation.

## 3. Creation, reopening, and Match integration

- [x] 3.1 Distinguish `matchCreated` from archive `openMatch`, update team-form help/action copy for optional preparation, and route successful creation to the new page in `App.vue`; extend archive/form/app tests to verify failed creation retains names, only one match is committed, creation never sets kickoff, and archive/statistics reopening still opens Match directly.
- [x] 3.2 Replace expanded pre-kickoff setup blocks in `MatchDetailPage` with one preparation launcher and a compact committed-state summary; update page tests to verify restore/edit access before kickoff, no editor duplication, no preparation entry after kickoff, readable accepted snapshots, and unchanged pre-kickoff clock/goal eligibility.
- [x] 3.3 Route app home/topbar departures through the preparation page's navigation request contract and suppress duplicate app-level Match save feedback there; add `App.spec.ts` coverage for guarded global navigation, source failures not blocking optional completion, failed-save retries, saved preparation across remount/reload, and explicit kickoff only after returning to Match.
- [x] 3.4 Update creation/preparation helpers and entry-surface assertions in `App.e2e.test.mjs`, adding browser cases for skipping all tracking, saving a squad but skipping jerseys, accepting full/partial distributions, reopening saved preparation, and stable drafts through back/forward navigation; verify those flows pass without weakening the existing goal, clock, substitution, and history assertions.
- [x] 3.5 Update README creation, review/save, skipping, reopening, and saved-versus-unsaved recovery instructions in the same integration group; verify the documented sequence matches the UI, neither optional step is described as mandatory, and no persistent draft or automatic kickoff is promised.

## 4. Phone layout and accessibility checks

- [x] 4.1 Apply the existing `Design.md` visual foundation to the touched preparation UI, enlarge squad/side labels and action targets, and reset the jersey action flex basis for column layouts; extend relevant component/browser layout checks to verify readable wrapped names, at least 48px targets, visible focus, and content-sized mobile buttons instead of the observed 176px empty action height.
- [x] 4.2 Complete active-step focus/error announcements and suppress hidden editor focus/announcements; extend colocated UI and browser keyboard tests to verify labelled choices, associated row errors, meaningful focus after save/back/skip/finish, discard-dialog focus restoration, and no duplicate success announcements.
- [ ] 4.3 Adapt the existing responsive jersey-review browser test to the dedicated preparation surface and include 320px/390px phones, short/reduced-height views, 844×390 landscape, desktop, enlarged text, duplicate/long labels, and a realistic squad; verify no horizontal overflow, full final-row/action reachability, and the same optional workflow, then manually check soft-keyboard and safe-area behavior and record results.

> Manual device check note for 4.3: automated headless Firefox covers the requested responsive viewports, including reduced-height views, but this environment has no physical phone or on-screen keyboard. Soft-keyboard and real safe-area inset behavior remain unverified on-device.

## 5. End-to-end integration verification

- [x] 5.1 Run `npm test`, `npm run build`, and `npm run test:e2e`; verify all pass and review the diff for downward-only public-entry imports, unchanged persistence formats/allocation algorithms, preserved legacy and started-match behavior, and no unrelated directory/inventory or live-layout changes.
