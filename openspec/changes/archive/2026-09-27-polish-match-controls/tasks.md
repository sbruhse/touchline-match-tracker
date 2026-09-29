## 1. Consistent icons and clock controls

- [x] 1.1 Add the typed local SVG renderer in `src/shared/ui` and export it through `index.ts`; provide the six shapes from the design with a consistent 18px default box, inherited color, and decorative/nonfocusable semantics.
- [x] 1.2 Replace the back and clock text symbols in `MatchHeader.vue` and `MatchClockControls.vue`; give clock buttons leading icons with an explicit 8px gap, consolidate their appearance and states in the feature, and remove conflicting header overrides. Verify start, pause, resume, half-time, and full-time presentation and existing accessible names.
- [x] 1.3 Replace the goal and substitution symbols in `MatchTimeline.vue` with the shared SVG family; verify consistent alignment beside the existing event labels without changing event ordering or summary content.

## 2. Whole-button team goal actions and responsive layout

- [x] 2.1 Update `RecordGoalButton.vue` to contain a plus/Goal row and a full wrapping team-name row in the same native button. Apply the feature-owned tile styling, preserve the team-specific accessible name and committed-result contract, and keep one click handler and whole-button pending-save protection.
- [x] 2.2 Simplify `MatchActionBar.vue` to two equal-width goal tiles with no external duplicate labels; keep Substitute full-width below them on phones and alongside them at the existing wider breakpoint. Retain measured height reporting and safe-area padding, and verify wrapped names and resizing update `MatchDetailPage.vue` clearance without a fixed-height spacer.
- [x] 2.3 Correct the minimum-width constraint responsible for the observed 320px classic-scrollbar overflow, limiting the shared layout change to available-width sizing; verify the Match screen fits `document.documentElement.clientWidth` without hiding overflowing content.

## 3. Event-card action spacing

- [x] 3.1 Add page-owned action wrappers around the existing goal and substitution editor launchers in `MatchTimeline.vue`. Align their inset with summary content using the design's phone/wide spacing, preserve at least 48px targets, and verify that Add details, Edit, and Correct focus rings fit inside the card.
- [x] 3.2 Verify both editor flows still open the correct event, retain their existing close/draft behavior, and restore focus to the same launcher after the wrappers are introduced; resolve any wrapper-related regression within the page composition.

## 4. Focused regression checks and visual review

- [x] 4.1 Extend existing goal-button or Match integration coverage for activation through the visible team-name portion: one save for the correct side, no automatic editor opening or panel switch, and no additional write while the whole tile is disabled. Preserve existing accepted-time, commit, and failure assertions.
- [x] 4.2 Update `src/app/ui/App.e2e.test.mjs` with rendered-geometry checks for full visible names inside goal buttons, equal phone columns, icon-label separation, event-action insets, and the final event/player row above the expanded footer. Cover 320px/390px, long and unbroken names, enlarged text, and scrollbar-aware overflow comparisons against `clientWidth`.
- [x] 4.3 Review the Match screen with Playwright at 320px, 390px, desktop width, and short landscape height. Inspect clock phases, both panels, goal/substitution icons, hover/focus/disabled states, and font-unavailable rendering; capture the review outcome. Smoke-check archive and player screens for the shared width correction and record any unavailable physical-device safe-area validation accurately.
- [x] 4.4 Run `npm test`, `npm run build`, and `npm run test:e2e`; resolve relevant failures and record the results after the visual and interaction work is complete.

## Verification notes

- `npm test`: passed, 168 tests across 32 files.
- `npm run build`: passed (`vue-tsc -b` and Vite production build).
- `npm run test:e2e`: passed, both Selenium/Firefox browser flows.
- Playwright visual review covered 320×720, 390×844, 1280×900, and 844×390; clock start/pause/resume/half-time/full-time, both panels, goal and substitution event icons, wrapped/unbroken team names, and editor open/close/focus restoration were inspected. Local captures are in `.playwright-mcp/match-controls-*.png`.
- Google Fonts requests were blocked during fallback review; local SVG icons remained available and the 320px viewport measured `clientWidth === scrollWidth === 305` with no horizontal overflow.
- Archive and player screens were smoke-checked at narrow and desktop widths. Physical-device safe-area inset behavior was not available for validation.
