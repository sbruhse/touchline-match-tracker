# Proposal

## Why

The player directory currently records names and archive status, so users cannot keep track of the positions each player can play. Persisting several selectable positions on a player's profile makes that information available whenever the directory is opened.

## What Changes

- Add an optional, equally weighted set of positions to each player profile using the agreed twelve-position catalogue: TW, IV, LV, RV, DM, ZM, OM, LM, RM, LA, RA, and ST.
- Offer grouped checkboxes with full position names and abbreviations when creating or editing a player. Players can have no positions, several positions across groups, or all twelve; selections can be removed later.
- Extend the current rename action into profile editing so the name and positions are saved together, with cancellation and retryable errors.
- Display saved positions as compact, wrapping abbreviations on active and archived player cards.
- Load existing player directories with an empty position selection for each player and preserve positions through renaming, archiving, restoring, and reloading.
- **BREAKING for older application releases:** successful directory saves will use player-storage format version 2. The updated application reads version 1, but older releases cannot open a directory once it has been saved as version 2.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `player-management`: Extend directory profiles with optional persistent positions, a fixed grouped catalogue, profile editing, and position summaries on player cards.

## Impact

- `src/entities/player/`: Position catalogue and validation, player creation/profile updates, immutable store snapshots, and backward-compatible reading of version-1 localStorage data.
- `src/features/manage-players/`: Creation/profile forms, grouped selection controls, card summaries, and saved-versus-draft state.
- `src/pages/my-players/ui/MyPlayersPage.spec.ts`, colocated player/feature tests, and `src/app/ui/App.e2e.test.mjs`: Coverage of selection, editing, persistence, failure recovery, and narrow-screen use.
- `README.md`: Player-profile workflow and player-directory storage compatibility.
- Positions describe a player's reusable profile. Match-specific position assignments, formations, position-based statistics, and custom position catalogues are outside this change.
