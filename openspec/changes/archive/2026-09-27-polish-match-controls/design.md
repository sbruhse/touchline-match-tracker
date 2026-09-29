## Context

This is a presentation follow-up to the implemented `phone-first-match-view` change. Its delta requirements are still in the active change rather than the main specs. This change adds distinct requirements under `football-match-tracking` and preserves that implementation's phase rules, newest-first events, editor lifecycle, and persistence behavior. It does not replace either change's existing requirements.

Playwright inspection at 320px, 390px, and 1280px identified:

| Location | Observed cause |
| --- | --- |
| `features/record-goal/ui/RecordGoalButton.vue` | The full-width plus character renders as a missing glyph in the inspection browser. The button only contains the short Goal label. |
| `features/control-match-clock/ui/MatchClockControls.vue` and `pages/match-detail/ui/components/MatchHeader.vue` | Text-character play/pause symbols have no explicit gap. Header overrides remove the old minimum width, so `space-between` has no spare space to distribute. Old lime hover styling still wins over the compact header's pale-green resting style. |
| `pages/match-detail/ui/components/MatchTimeline.vue` | The football character also renders as a missing glyph; substitution arrows use different font metrics. Editor launchers are outside the padded summary and directly against card edges. |
| `pages/match-detail/ui/components/MatchActionBar.vue` | Team labels sit outside the 76px Goal buttons and use ellipsis. At 390px, even Athletic United truncates. |
| `app/styles/global.css` | At a 320px viewport, classic scrollbars leave 305px of layout width while the body's 320px minimum produces 15px of horizontal overflow. Existing browser checks compare scroll width to `innerWidth`, which misses this case. |

The recording area already reports its height through `ResizeObserver`; `MatchDetailPage.vue` reserves `actionHeight + 48` pixels. Existing tests cover accepted action times, commit-only events, failed saves, panel retention, and editor focus. Browser tests use Selenium/Firefox; Playwright is available for visual inspection. There is no icon dependency, and `shared/ui/index.ts` currently exports the focused-editor shell.

A design artifact is warranted because the fix crosses shared rendering, two action features, and page composition, and needs consistent ownership of responsive styles.

## Goals / Non-Goals

**Goals:**

- Render recognizable, consistently sized Match icons independently of fonts.
- Make icon-label spacing and button states deliberate and predictable.
- Give event-card actions a proper inset and visible focus ring.
- Put each full team name inside its goal action and preserve one-tap operation at narrow widths.
- Keep the growing recording area clear of scrollable content.

**Non-Goals:**

- An app-wide icon or visual redesign, new fonts, a generic button framework, or an icon-library dependency.
- Changes to match records, clocks, scoring, substitution eligibility, event ordering, or editor draft rules.
- Additional event types, confirmation steps, or new recording modes.
- Reworking archive, player-management, or statistics screens beyond checking the small shared width correction for regressions.

## Decisions

### 1. Use one small local SVG renderer

Add a domain-neutral `AppIcon.vue` in `src/shared/ui`, exported from `index.ts`. It accepts a typed icon name and renders only the local vector shapes needed here: plus, play, pause, arrow-left, football, and exchange arrows. It has no match state, event behavior, font loading, or external resource lookup.

Use a common 24-unit view box, a nonshrinking 18px-at-default-text-size box, and `currentColor`. Use coherent stroke weight and optically balanced shapes; render play/pause shapes clearly at that size. Every use in this change is decorative: `aria-hidden="true"`, nonfocusable SVG, and a separate visible text label. Preserve team-specific accessible button names.

Use leading icons for back, clock, and Goal controls. Replace the goal/substitution event symbols with the same visual family. Score separators, minute notation, and other textual data remain text.

Alternatives considered: ASCII plus alone fixes only one glyph; changing fonts leaves platform-dependent metrics and football rendering. A third-party icon package is unnecessary for six static shapes. Duplicating SVG markup in each feature would recreate inconsistent sizing.

### 2. Let features own button appearance and pages own arrangement

`MatchClockControls.vue` owns its compact button padding, border, color, icon gap, and normal/hover/focus/disabled states. `RecordGoalButton.vue` owns the full goal tile. Their page parents own rows, columns, wrapping, and overall placement. Remove the overlapping presentation rules in `MatchHeader.vue` and `MatchActionBar.vue` when moving those responsibilities, rather than adding higher-specificity overrides.

Use inline flex for icon-label rows, center alignment, and an explicit 8px gap. Buttons retain at least 48px touch height, a visible focus outline, and stable allocated geometry across states. Use a restrained green hover treatment instead of the inherited lime clock hover. Disabled styling applies to the entire control.

The visual direction is the existing sideline workspace, with recognition and readable team names as the emphasis:

| Token | Direction |
| --- | --- |
| Surface / page | White `#ffffff` / pale background `#f2f4ef` |
| Primary action / ink | Green `#204d38` / ink `#17251d` |
| Secondary action / border | Pale green `#edf3e8` / muted border `#cad7c7` |
| Type | Existing DM Sans for controls and names; existing Space Grotesk for score/time |
| Geometry | 18px icons, 8px icon gaps, existing 10px control corners, touch-sized controls |

Alternative considered: a shared Button component would add an unnecessary API migration. Local ownership plus the shared icon renderer addresses the actual style collision.

### 3. Make the full team tile the goal button

Render the supplied `teamName` inside `RecordGoalButton.vue`, below a leading plus/Goal row. Both rows belong to the same native button; keep the existing `matchId`, `side`, `teamName`, and committed-result event contract. Tapping the team name therefore uses the same single click handler and disabled guard as tapping Goal.

```text
+------------------+------------------+
| + Goal           | + Goal           |
| Riverside FC     | Athletic United  |
+------------------+------------------+
|             Substitute              |
+-------------------------------------+
```

Start with a 72px minimum tile height, 10px vertical and 12px horizontal padding, and left-aligned readable text. The Goal row and team-name row are separate blocks; the name can occupy more than one line. Use wrapping, including a break opportunity for unusually long unbroken names; do not clamp text, shrink its font to force a fit, or depend on a hover tooltip. The two tiles stretch to the same row height.

`MatchActionBar.vue` removes the duplicated external team labels and uses two `minmax(0, 1fr)` goal columns. Keep the full-width Substitute row below them on phones and the existing wider-screen arrangement at the 680px breakpoint. Both desktop goal actions retain the same two-line content and behavior. Empty-bench messaging, phase-dependent presence, and pending-save disabling continue to come from the existing substitution feature.

Alternative considered: stacking the external name above a separate button would improve width but leave the name outside the touch target. The agreed whole-tile design makes the action and its team one unit.

### 4. Give timeline launchers a page-owned action inset

Wrap each existing goal/substitution editor launcher in a timeline action area. Use a shared event inset of 12px on phones and 16px on wider screens for both summary alignment and action left/right/bottom padding. Allow at least the focus outline plus its offset inside the card, which currently clips overflow. Keep the native launcher and its existing focus reference intact.

The timeline owns this spacing; the goal and substitution editor features continue owning their dialogs, forms, drafts, and save operations. No feature imports its sibling, and no editor needs knowledge of the enclosing event card.

Alternative considered: margins inside each editor feature would duplicate card-specific layout decisions and couple those features to this page.

### 5. Preserve measured footer clearance and correct available-width sizing

Keep the existing `ResizeObserver` height reporting and page reservation. Wrapped labels, font-size changes, viewport resizing, and safe-area padding must flow through the measured height; do not substitute a fixed bottom spacer for the larger tiles. Retain `env(safe-area-inset-bottom)` on the recording area.

Cap the body's existing minimum-width constraint at the available containing-block width so a 320px viewport with a classic scrollbar can lay out at its actual 305px content width. Limit the global change to that constraint and check other screens for a width regression. Do not hide horizontal overflow as a substitute for fitting the content. Browser assertions should compare document scroll width against `document.documentElement.clientWidth`, with a small rounding tolerance.

Alternative considered: accepting the extra scrollbar or hiding it leaves part of the Match layout outside the usable width. A narrowly scoped minimum-width correction addresses the observed cause.

### 6. Verify behavior and rendered geometry using the existing test setup

Extend existing tests only where the new whole-button hit area or geometry creates a meaningful regression case. In `RecordGoalButton.spec.ts` or the existing Match integration coverage, verify that activating the visible team-name portion records one goal for the correct side and that pending writes disable the whole tile. Retain the existing commit-time, failure, phase, and panel-selection coverage.

Adapt `App.e2e.test.mjs` to check full visible team names inside their buttons, equal-width phone tiles, at least 48px targets, positive icon-label separation, inset event actions, and usable footer clearance after long names and text enlargement. Include the classic-scrollbar width case using `clientWidth`. Avoid tests that simply snapshot SVG paths or duplicate style declarations.

Use Playwright for visual review at 320px, 390px, 1280px, and a short landscape viewport, with normal and long names. Review start, running, paused, half-time, and full-time controls; both panels; hover/focus/disabled states; and goal/substitution icons with external font requests unavailable. Verify editor opening/closing after adding the action wrappers. Run the existing unit suite, production build, and browser flow suite. No new visual-test runner is needed.

## Risks / Trade-offs

- Wrapped team names make the footer taller -> Use the existing measured clearance and verify the last event and player row with long names, enlarged text, and short landscape height.
- Font-independent shapes can still look optically uneven -> Compare all six icons together at their actual 18px size, including disabled and hovered controls.
- Moving styling out of deep overrides can expose missed states -> Inspect all clock phases and preserve existing accessible names and event contracts while consolidating only the affected rules.
- Event cards clip their children's outlines -> Budget the action inset for the complete focus ring and verify keyboard entry/return in the browser.
- The minimum-width correction affects the app shell -> Keep it to available-width sizing and smoke-check the archive and player screens at narrow and desktop widths.
- Desktop viewport resizing cannot prove native keyboard or real safe-area behavior -> Record the browser/device used; retain the existing dialog behavior and report any unavailable physical-device validation accurately.

## Migration Plan

Implement the shared icon renderer, update feature-owned controls and page composition, then run the scoped browser review and required project checks. Deploy through the existing frontend build. There is no data migration; rollback consists of reverting the presentation changes while retaining saved matches.

## Open Questions

No material scope decisions remain. The icon set, two-line team buttons, and phone Substitute row follow the exploration agreement. Final optical adjustments within the stated spacing and readability constraints are implementation-time visual review, not a new interaction design.
