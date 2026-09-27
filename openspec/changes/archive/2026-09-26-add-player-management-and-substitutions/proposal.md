# Proposal

## Why

The user needs to manage their own players, see who is currently on the pitch, and know how long each player has played. The current goal-only tracker cannot represent starting lineups or repeated substitutions, so it cannot calculate playing time across multiple spells or matches.

## What Changes

- Add a browser-local player directory for the user's squad, with stable player identities, editable names, and archiving that preserves history.
- Let the user identify their home/away side and select a match squad, starters, and bench before kickoff. Opponents remain manually named teams.
- Record one-for-one substitutions with unrestricted re-entry, show the current pitch and bench, and allow corrections to substitution history with consistency validation.
- Combine goals and substitutions in a match timeline while preserving quick goal capture and free-text goal details.
- Show live per-player match time and cross-match appearance/time totals with per-match breakdowns.
- Preserve actual half durations, including stoppage time, so time calculations exclude half-time breaks and manual clock pauses. Retain the existing two 45-minute halves.
- Preserve existing saved matches without inventing historical lineups or playing-time statistics. Participation tracking is optional for matches, but must be configured before kickoff when used.

## Capabilities

### New Capabilities

- `player-management`: Reusable local player directory and identity-preserving edits/archiving.
- `match-participation`: Own-side match squad, starting lineup, current pitch/bench, re-entry substitutions, and correctable participation history.
- `player-playing-time`: Live and final playing-time calculations and player statistics across tracked matches.

### Modified Capabilities

- `football-match-tracking`: Retain completed half durations and restore extended match data while keeping legacy matches usable without fabricated participation records.

## Impact

- Vue/TypeScript UI, navigation, the existing IndexedDB match store, the independent player-directory store, clock transitions, timeline composition, and unit/integration/browser coverage.
- Affected areas are the match screen, match/clock domain logic, and match persistence. The completed `align-app-with-fsd-architecture` change delivered the FSD slices used here: `entities/match`, match pages/features, and the app-scoped match store. This change adds player-management and statistics slices.
- Match persistence requires lazy per-record versioning within the existing IndexedDB database; legacy localStorage match data remains ignored and untouched. The player directory has its own local store. No backend, account system, synchronization, or new runtime library is required.
- Out of scope: managing opponent rosters, multiple managed clubs, formations/positions, cards or temporary removals, bulk simultaneous substitutions, configurable match formats, retrospective reconstruction of untracked matches, and linking existing free-text goal names to player statistics.
