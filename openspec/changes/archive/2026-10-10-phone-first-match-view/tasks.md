# Tasks

## 1. Project guidance and accessible editor foundation

- [x] 1.1 Add the concise usability-first, phone-first UI guidance described in `design.md` to root `AGENTS.md`; verify the delivered section covers touch targets, readability, narrow-screen verification, and larger-screen enhancement while retaining existing architecture and test rules.
- [x] 1.2 Create a domain-neutral focused editor shell under `src/shared/ui` with open/title props, body/actions slots, close requests, focus containment/restoration, and narrow-screen full-screen styling; verify colocated interaction tests cover opening, Escape/close, keyboard focus, and return to a fallback when the launcher disappears.

## 2. Event summaries and deliberate goal editing

- [x] 2.1 Change `MatchTimeline.vue` to newest-first period/elapsed-time presentation and concise summaries, preserving goal-before-substitution and recorded-order equal-time tie-breaks; update its colocated tests to cover both halves, stoppage/half-time boundaries, chained equal-time substitutions, goal-only history, and stable reload ordering without changing replay calculations.
- [x] 2.2 Adapt `features/edit-goal` to the focused editor shell with lazy identity-keyed drafts, Close retention, explicit Discard changes, and successful-save closure; verify feature tests cover blank optional fields, close/reopen, discard, failed-save retry, and unrelated committed changes preserving a draft.
- [x] 2.3 Wire Add details/Edit launchers and saved summary updates in the timeline, including corrected event positions and focus restoration; update relevant `App.spec.ts` integration coverage to open editors explicitly and verify persisted edits, score corrections, legacy-record compatibility, and unrelated drafts.
- [x] 2.4 Extend the record-goal feature's public committed-result event to identify the saved goal and support the Goal saved / Add details shortcut; verify its model/component tests prove identity is tied to the saved event, timestamps still come from the accepted action, failures produce no success event, and no editor opens automatically.
- [x] 2.5 Update the goal portions of `App.e2e.test.mjs` for explicit editor opening and newest-first summaries, and document Add details, Close, and Discard changes in README; verify the browser flow can record, edit, retry a failed save, and reopen persisted details using the documented actions.

## 3. Phone-first match workspace and player-time access

- [x] 3.1 Refactor `MatchDetailPage.vue` into the header, panel, and action-area composition described in the design, keeping cross-slice public imports; verify colocated page tests show Events selected for started/completed matches, one-action panel switching, preserved panel state, and unchanged clock progression.
- [x] 3.2 Implement the sticky score/clock/tab header and bottom team-specific goal actions with Match-scoped mobile-first styling, safe-area support, and dynamically sufficient bottom spacing; add browser assertions at 320px and 390px widths for no horizontal overflow, at least 48px action targets, long team names, persistent controls after scrolling, and a fully reachable last event row.
- [x] 3.3 Compose the existing lineup widget in Player times with stable on-pitch/bench rows, readable elapsed times, and the own-team label; verify widget/page tests cover live advancement, paused and bench totals, final labels, duplicate/long names, untracked messaging, and goal recording from Player times without changing the selected panel.
- [x] 3.4 Make pre-kickoff setup, live tracking, half-time, and full-time presentation phase-aware; verify page/integration tests cover setup locking and removal after kickoff, goal-only kickoff, Start second half, final review/corrections, and retained secondary goal entry before kickoff and after full-time.
- [x] 3.5 Integrate a single Match save-status owner and compact app chrome in `App.vue`, with modal-local error feedback and the saved-goal shortcut accessible from either panel; adapt `App.loading.spec.ts` and affected integration tests to verify pending-write guards, commit-only feedback, visible failures, retryable inputs, and no duplicate Match announcements.
- [x] 3.6 Update README match workflow instructions for Events, Player times, persistent recording actions, and phase transitions, and adapt corresponding browser flows; verify the documented path works for both a tracked and an untracked match and that leaving the Match page still tears down live timers.

## 4. Focused substitution entry and correction

- [x] 4.1 Move the existing substitution launcher into the persistent Match action area and present `SubstitutionDraftForm.vue` in the shared editor shell with touch-sized single-choice player-off/player-on rows; adapt colocated feature tests to verify captured-time stability, duplicate-name disambiguation, empty-bench explanation, cancel, and save return to the originating panel.
- [x] 4.2 Present `SubstitutionEventEditor.vue` and its correction form in the same focused shell while retaining full-history validation and removal behavior; verify existing correction tests plus focused-editor coverage pass for second precision, half-time boundaries, returning players, conflicting removal, failed-save retained inputs, and final-time recalculation.
- [x] 4.3 Update substitution browser coverage and README wording to use Substitute and Save substitution; verify recording from both panels, frozen paused/half-time occurrence, repeated re-entry, reload restoration, and a correction after full-time through the new UI.

## 5. Cross-flow verification

- [x] 5.1 Run `npm test`, `npm run build`, and `npm run test:e2e`; resolve failures and record the command outcomes, with the existing persistence, serialized-write, timing, participation, and player-statistics checks passing alongside the redesigned flows.
- [x] 5.2 Review the integrated Match view in a browser at 320px and 390px phone widths, a short landscape viewport, and desktop width; verify long names, long histories, enlarged text, sticky-area clearance, keyboard tab/focus behavior, contrast, and that the same actions remain discoverable on larger screens.
- [x] 5.3 Verify focused goal and substitution-correction editing with a phone soft keyboard and safe-area layout, confirming fields, errors, Save, and Close/Cancel remain reachable; record the device/browser used and any unavailable validation rather than treating desktop resizing as proof of keyboard behavior.

## Verification record

- `npm test` — passed: 32 test files, 167 tests.
- `npm run build` — passed: TypeScript project build and Vite production build.
- `npm run test:e2e` — passed: both end-to-end flows, including 320px/390px, 844×390 landscape, long event history, enlarged text, focus/tab navigation, contrast, and desktop action availability.
- Browser: Mozilla Firefox 156.0.1, headless on Linux. Responsive geometry used Firefox iframe viewports rather than desktop-window resizing. Focused goal and substitution-correction checks used a 390×480 CSS viewport as a reduced-height proxy; fields and validation errors scroll within the editor, and Save plus Close/Cancel remain reachable. The editor action footer retained its CSS safe-area bottom padding.
- Unavailable validation: no physical phone was available, so the native soft keyboard, real keyboard-driven viewport resizing, and device safe-area inset values were not tested. The reduced-height browser checks are not a substitute for that device validation.
