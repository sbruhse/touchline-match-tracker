# Design

## Context

See `proposal.md` for motivation and the two delta specs for the behavior contract. This is a cross-cutting UI change across the Match page, lineup widget, and existing action features, so a design artifact is warranted.

Observed implementation:

- `MatchDetailPage.vue` stacks a tall scoreboard, a separate clock panel, squad summary, lineup, substitution panel, and timeline inside a single card.
- `MatchTimeline.vue` sorts oldest-first and mounts an open `GoalEventEditor` for every goal. Its test asserts ascending order and all editors being present.
- `ConfigureMatchSquad.vue` continues rendering saved starters and the entire squad after kickoff, duplicating the lineup widget.
- `RecordSubstitution.vue` already captures time on opening. Its form uses off/on dropdowns and its model validates exchanges against the committed history.
- `MatchLineupWidget.vue` already calculates live and final times and keeps players in squad order. `useMatchTime` manages timer lifetime.
- `App.vue` owns global save banners and substantial header/footer chrome. Store writes are serialized and only committed results update the UI.
- Integration tests protect unrelated goal drafts, failed-save retries, legacy data, clock transitions, and player statistics. Browser tests cover phone and desktop widths but rely on the current open-editor layout.

The existing Vue Composition API and Feature-Sliced Design boundaries remain applicable. No browser preview was available during planning; phone geometry and soft-keyboard behavior require implementation-time browser verification.

## Goals / Non-Goals

**Goals:**

- Make the primary recording workflow usable with one hand while supporting an occasional glance at player minutes.
- Keep score and clock context stable without consuming most of a phone screen.
- Preserve timing, persistence, retry, and draft behavior while changing presentation and interaction surfaces.
- Keep feature state out of a growing page component and make keyboard/focus behavior consistent across editors.

**Non-Goals:**

- Cards, other incident types, event filters, event deletion/undo for goals, formations, or multi-player substitutions.
- New timing rules, new participation calculations, storage migrations, cloud services, or persistent UI preferences.
- An app-wide visual redesign or a speculative generic event framework for future event types.

## Decisions

### 1. One phone workspace with two content panels

Use a compact sticky match header including a two-tab switcher, normal document scrolling for the selected panel, and a bottom event-action area during active play. Prefer document scrolling to a nested fixed-height feed to reduce scroll trapping and mobile browser height problems. Reserve space for the actual action-area height and safe-area inset so the final row remains reachable. If controls wrap because of text size or long names, the reserved space must grow with them.

```text
+----------------------------------+
| < Matches           Saved locally|
| Riverside     2 - 1     Athletic  |
|        63'  Second half          |
| [Pause clock]       [Full-time]   |
+----------------------------------+
| [ Events ]       [ Player times ]|
+----------------------------------+
| 62'  Goal - Riverside            |
|      Alex                 [Edit]|
|                                  |
| 46'  Substitution - Riverside    |
|      Sam off --> Jordan on       |
|                        [Correct]|
|                                  |
| ... scrollable page content ...  |
+----------------------------------+
| [Goal: Riverside] [Goal: Athletic]|
| [          Substitute          ]|
+----------------------------------+
```

Events is selected on opening a started/completed match and after first kickoff. Tabs are local UI state, not saved match data. Switching to Player times does not reset the clock, dismiss goal drafts, or move the recording controls. Use accessible tab semantics with selected state, roving focus, arrow-key navigation, and associated panels. Retain panel instances while switching so feature state is not destroyed; stop timers when leaving the Match page as today.

At wider widths, keep the same information architecture in a readable centered workspace instead of introducing another workflow. The action area can be constrained to the workspace width. The main app bar can scroll away; avoid stacking a second sticky app navigation bar above match context.

Alternative considered: lineup and timeline in side-by-side cards, or both in a long phone page. The former adds a different desktop interaction model; the latter puts one frequently consulted section behind too much scrolling. Tabs match the user's event-first priority with a deliberate one-tap cost to check minutes.

### 2. Phase-aware composition without changing action eligibility rules

| Phase | Main presentation | Clock / recording access |
| --- | --- | --- |
| Before kickoff | Optional squad preparation and planned players | Prominent Start first half; existing goal entry remains accessible as secondary actions; no live substitution |
| Running / paused | Events by default; Player times adjacent | Persistent goal/substitution area; Pause/Resume and Half-time/Full-time with the clock |
| Half-time | Same panels; current second-half lineup | Start second half; goals and substitutions remain available |
| Full-time | Final score, Events review, final Player times | Corrections and secondary team-specific Add goal actions for missed goals; no active clock or new substitution |

Hide the duplicate squad setup/summary after kickoff, rather than changing saved participation. For goal-only matches, keep a Player times panel with a concise unavailable explanation; before kickoff, offer the existing setup path. Hide Substitute when tracking is absent. If a tracked squad has no eligible incoming player, the substitution editor explains the empty bench and cannot save.

Compatibility assumption: the existing UI permits goal entry in every phase. Preserve that behavior rather than silently adding a phase restriction. Only its prominence changes before kickoff and at full-time.

### 3. Read-only event summaries with focused editors

Sort display entries by period descending, then exact elapsed milliseconds descending. Within an exact-time group, preserve the existing goal-before-substitution tie-break, goal creation timestamp/id order, and substitution sequence/id order. Do not simply reverse the entire old array, which would reverse chained equal-time substitutions. Participation replay stays chronological and unchanged.

Remove decorative event sequence labels such as GOAL 01; show event type, team, minute, and scorer or off/on names. Use Add details for goals whose scorer, assist, and description are all blank; otherwise use Edit. Blank optional fields are valid, not a completion task.

Use a focused modal editor surface: full-screen on narrow phones and constrained on larger screens. A reusable dialog shell belongs in `shared/ui`, with a title, scrollable body, actions slot, explicit close behavior, focus containment/restoration, and a semantic modal dialog. Existing feature components own the forms and domain actions. A modal temporarily replaces access to the background header/action area, preventing overlays from fighting for space when the soft keyboard is open.

Goal drafts stay feature-owned and keyed by match/event identity. Lazily initialize a draft on first edit and retain it for the lifetime of the open match. Close/Escape hides the editor and retains the goal draft; explicit Discard changes resets it. Successful save resets that event's draft to committed data and closes the editor. Closing a new substitution draft means Cancel and discards its occurrence and choices, as today. A failed write never dismisses the editor. Existing substitution corrections retain their explicit cancel semantics and full-history validation.

Alternative considered: inline expansion. It reduces dialog machinery but makes live history jump as forms expand and leaves inputs competing with persistent phone controls. A focused surface also works better for the off/on selection flow.

### 4. Preserve one-tap goals and captured substitution times

Goal buttons keep team-specific visible and accessible names. One tap saves with the action-time occurrence; no scorer prompt is inserted. After commit, show a compact Goal saved message with Add details linked to the actual saved event identity. Propagate that identity through the recording feature's public event contract rather than relying on newest array position, which may differ after a correction or equal-time event. Keep the selected panel unchanged when recording from Player times; selecting Add details opens the matching editor from either panel.

Substitute opens one editor with two clearly labeled groups: Player off and Player on. Use native single-choice semantics with full-row touch targets, retaining stable identity disambiguation for duplicate names. Both choices and captured time are visible before Save substitution. Reuse `prepareSubstitutionOccurrence` and `recordMatchSubstitution`; moving or spending time in the editor must not recapture the occurrence. Global pending-write guards continue to protect all save operations.

### 5. Keep feedback visible where the user acts

Render one store-derived Match save-status presentation inside the persistent workspace and expose editor-local validation/errors inside open dialogs. The Match page should consume the existing store for feedback; suppress the redundant app-level Match banner while leaving app feedback for other pages intact. Keep a polite status for saving/success and an alert for errors, without duplicate announcements. Never announce success before commit or auto-dismiss an error before the user can act. Do not announce player timers every second.

Alternative considered: leaving the global banner at the top of `App.vue`. That makes save failure invisible when the user is deep in the history and can move page content when it appears.

### 6. Component ownership and state contracts

Concrete boundaries for implementation (names are proposed):

| Location | Responsibility and contract |
| --- | --- |
| `pages/match-detail/ui/MatchDetailPage.vue` | Thin composition: resolve match, own selected panel, compose header/panels/action area; coordinate saved-goal identity to the correct editor. No write algorithms. |
| `pages/match-detail/ui/components/MatchHeader.vue` | Present team names, score, phase, and time from props; compose the clock feature through its public entry point. |
| `pages/match-detail/ui/components/MatchActionBar.vue` | Compose existing goal and substitution features using matchId/team props; emit committed goal identity/time upward. No persistence state duplication. |
| `pages/match-detail/ui/components/MatchTimeline.vue` | Derive display order and summaries, launch feature editors by stable event ID, and accept a requested goal-editor ID from the page. |
| `features/edit-goal/ui` and `model` | Own lazy event-keyed goal drafts and focused editor lifecycle; emit saved/closed events and preserve unrelated drafts. Export needed contracts only through `index.ts`. |
| `features/record-substitution/ui` | Own Substitute launcher, captured occurrence, player selection, and save/cancel lifecycle; restyle its form with labeled selectable rows. |
| `features/edit-substitution/ui` | Place the existing correction form/validation in the shared editor shell; retain second precision, half-time boundary, removal, and first-conflict messages. |
| `widgets/match-lineup/ui` | Present the tracked team, current/final groups, stable player labels, and formatted times; keep its existing entity-derived calculation. |
| `features/configure-match-squad/ui` | Remain the pre-kickoff setup action; page composition controls when setup occupies the workspace. |
| `shared/ui` | Domain-neutral modal shell with open/title props, close request event, body/actions slots, and focus behavior. No match imports. |
| `app/ui/App.vue` | Keep navigation and initialization; scope compact Match chrome and suppress redundant Match save feedback. |

Components import across slices only through public entry points. Page-local composition can import multiple features; features must not import their sibling features. Extract page-local coordination into a small composable if needed rather than moving match logic to shared code.

### 7. Legibility and project guidance

Retain the existing green identity with deliberate restraint: white surface `#FFFFFF`, pale background `#F2F4EF`, primary ink `#17251D`, readable secondary text `#526156`, action green `#204D38`, and separators `#E4E8E0`. Verify actual contrast of all applied combinations. Use existing DM Sans for readable body and controls and Space Grotesk for the compact score; remove tiny uppercase monospace labels from functional content. Start with 16px body/form text, 14px secondary text, tabular player-time numerals, and at least 48px action targets. Align names left and playing durations right. Avoid decorative monograms, nested cards, and motion that distracts from recording.

Add a short UI guidance section to root `AGENTS.md` during implementation with these durable principles:

- Prioritize usability, clear information hierarchy, and few-step workflows over visual decoration.
- Design and implement phone layouts first, then enhance for larger screens.
- Keep primary actions touch-friendly and reachable; use readable text, sufficient contrast, and visible focus.
- Check narrow widths, long content, safe areas, and keyboard/editor behavior when changing responsive flows.
- Keep desktop use functional without introducing a separate interaction model unnecessarily.

These are project guidance, not a mandate to retrofit unrelated pages in this change. Retain the existing architecture and testing rules.

## Risks / Trade-offs

- Persistent header and bottom actions consume vertical space -> Keep both compact, avoid repeated app chrome, and verify 320px/390px widths, short landscape viewports, and enlarged text.
- Mobile browser chrome, safe areas, and keyboards can hide actions -> Reserve real action-area space, use dynamic viewport sizing for dialogs, and manually verify soft-keyboard editing as well as automated geometry checks.
- One-tap player-time access hides minutes while reading history -> Keep the tab prominent and preserve recording controls in both panels; this is the chosen event-first tradeoff.
- Newest-first display can be confused with replay order -> Change only presentation and add mixed/equal-time ordering coverage plus existing re-entry regression checks.
- Unmounting tab content or editors can discard drafts or reset timers -> Retain panel/feature instances and key drafts by identity; test panel switching, unrelated saves, close/reopen, and teardown on navigation.
- Generic save feedback can duplicate editor alerts -> Assign one visible status owner per surface and verify assistive-technology announcement behavior.
- Current end-to-end tests assert old CSS and automatic forms -> Adapt tests to explicit editing and visible behavior while retaining persistence and failure-path assertions.

## Migration Plan

Implement and verify the UI within existing data contracts, update `AGENTS.md` and README usage notes, then deploy through the normal frontend build. Run `npm test`, `npm run build`, and `npm run test:e2e`; validate phone geometry and focused editor behavior in a browser. No record or database migration is required. Reverting the UI and documentation changes restores the previous layout without transforming saved match data.
