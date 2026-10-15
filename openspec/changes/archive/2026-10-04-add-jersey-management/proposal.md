# Proposal

## Why

The player directory cannot currently record clothing sizes or the different numbers a player prefers in different jersey sets, and there is no inventory of the actual jerseys. Keeping these details together will help prepare kit for the team, including duplicate numbers and privately owned jerseys.

## What Changes

- Add one optional general jersey size to each player profile, editable alongside the existing name and positions.
- Manage multiple named jersey sets and their individual jerseys. Each jersey has its own identity, a back number, an actual size, and an owner: the team or a directory player. Duplicate numbers, including otherwise identical jerseys, remain distinct inventory items.
- Maintain an optional preferred number for each player and jersey set. Preferences are advisory, may differ between sets, and do not reserve a jersey or imply ownership.
- Provide a jersey-set inventory screen and an explicit preferred-number editor for saved players, with persistent summaries in the player directory.
- Allow sets and individual jerseys to be created, edited, and removed. Removing a set removes that set's jerseys and preferences together; removing one jersey leaves number preferences intact.
- Persist the inventory and preferences locally in this browser, with explicit saving, retryable failures, and no publication of unsaved drafts.
- **BREAKING for older application releases:** successful player-directory saves use format version 3. The updated application reads existing versions 1 and 2; older releases reject the version-3 directory. Loading alone does not migrate stored data.
- This change covers profile and inventory maintenance. Match-day allocation, reservations, loan/availability tracking, per-set player sizes, and assignment history are outside its scope. Ownership is informational only.

## Capabilities

### New Capabilities

- `jersey-management`: Manage named jersey sets, individually identifiable jerseys with sizes and ownership, and locally persisted per-player/per-set number preferences.

### Modified Capabilities

- `player-management`: Maintain one general jersey size, edit and display preferred numbers by jersey set, and preserve player identity and profile data across lifecycle operations and storage upgrades.

## Impact

- `src/entities/player/`: Size validation, profile input/model/store snapshots, and version-1/version-2 reading with version-3 writing.
- New `src/entities/jersey-set/`: Jersey-set aggregates containing individual jerseys and number preferences, domain operations, browser repository, and an app-scoped store.
- `src/features/manage-players/`: General-size input and summary, plus a separately saved preferred-number editor; the profile and preference actions each commit to one repository.
- New `src/features/manage-jersey-sets/` and `src/pages/jersey-sets/`: Inventory and ownership editing, composed through public slice APIs.
- `src/app/ui/App.vue`: Provide the new store and expose the inventory through the existing navigation model.
- Colocated domain, persistence, feature/page, and app tests; the existing Firefox browser flow; and the README's player, inventory, and storage documentation.
- The implementation builds on the current working-tree player-position feature described by the completed `add-player-positions` change. Its position catalogue, profile editing, and version-2 compatibility are part of the baseline; its requirements are not duplicated here.
