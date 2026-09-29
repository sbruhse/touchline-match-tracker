## Why

Playwright inspection of the Match screen at phone and desktop widths reproduced missing plus/football glyphs, clock icons touching their labels, and event-edit buttons pressed against card borders. The bottom recording bar also truncates ordinary team names, making its most important actions harder to distinguish during a match.

## What Changes

- Replace font-dependent decorative symbols in Match controls and event summaries with a consistent set of locally rendered SVG icons.
- Give icon-and-label controls explicit spacing, alignment, and coherent hover, focus, and disabled presentation.
- Place Add details, Edit, and Correct launchers inside a padded event-card action area.
- Make each goal action one two-line button containing the icon/Goal label and the full team name; allow team names to wrap. Keep the two goal buttons side by side and Substitute full-width below them on phones.
- Preserve reachable content as the recording bar grows, including narrow widths, enlarged text, safe-area padding, and the scrollbar-related overflow observed at 320px.
- Retain one-tap recording, accessible team-specific names, pending-save protection, phase eligibility, and the existing Events/Player times workflow.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `football-match-tracking`: Reliable Match-screen icon rendering, clearly spaced controls and event actions, and fully team-labeled goal tiles with responsive recording-area clearance.

## Impact

- Generic icon rendering in `src/shared/ui`, exported through its public entry point.
- Goal button presentation in `src/features/record-goal` and clock controls in `src/features/control-match-clock`.
- Header, timeline, and recording-area composition in `src/pages/match-detail`; a minimal layout-sizing correction in `src/app/styles/global.css` if required for the confirmed 320px scrollbar case.
- Existing colocated interaction tests and `src/app/ui/App.e2e.test.mjs`, supplemented by Playwright visual review of the affected controls.
- This follows the implemented `phone-first-match-view` change. Additive delta requirements avoid modifying requirement titles that have not yet been synced to the main specs. Match data, persistence contracts, and runtime dependencies remain compatible.
