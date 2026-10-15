# Proposal

## Why

The Match view spreads live actions across a long page, repeats squad information, and displays a full form for every goal. Phone users primarily recording goals and match events need immediate access to actions and a scannable history, with player minutes available in one tap.

## What Changes

- Prioritize usability on phones: a compact persistent score/clock header and a thumb-reachable action area with team-specific goal buttons and, when available, Substitute.
- Make Events the default live/review panel, displaying newest events first as concise summaries with explicit Add details, Edit, or Correct actions.
- Provide a Player times panel one tap away, showing stable on-pitch and bench lists with accumulated playing time; keep recording actions available across both panels.
- Open goal details and substitution flows deliberately in focused, phone-friendly editors instead of embedding all forms in the history. Preserve captured occurrence times, save feedback, validation, and retryable drafts.
- Give squad preparation priority before kickoff, remove redundant setup summaries during play, and emphasize review at full-time.
- Retain the green identity while simplifying labels and containers, increasing legibility, and providing generous touch targets.
- Add concise usability-first, mobile-first guidance to the root `AGENTS.md` during implementation so future UI changes follow the same priority.
- Scope event types to existing goals and substitutions; cards and other incidents are deferred.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `football-match-tracking`: Phone-first match workspace, persistent recording controls, phase-appropriate presentation, and explicit goal detail editing with accessible save feedback.
- `match-participation`: One-tap access to player times, focused touch-friendly substitutions, and newest-first presentation of the combined event history with deterministic equal-time ordering.

## Impact

- Match composition and timeline in `src/pages/match-detail`, lineup presentation in `src/widgets/match-lineup`, and UI in the goal, clock, squad, and substitution features.
- Small app-shell integration changes in `src/app/ui/App.vue` and relevant styles to support sticky match context and visible save feedback without duplicated banners or excessive chrome.
- Root `AGENTS.md`, relevant usage documentation, colocated component/integration tests, and the existing browser flow tests.
- Existing stores, IndexedDB format, clock semantics, playing-time calculations, and substitution-history validation remain the basis of the redesigned UI; no data migration, new service, or new runtime dependency is planned.
