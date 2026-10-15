# Spec Delta

## MODIFIED Requirements

### Requirement: Prepare the own-side match squad before kickoff
The application SHALL allow participation tracking to be enabled before first kickoff by identifying the user's team as home or away, selecting unique directory players for the match squad, and choosing a nonempty subset as starters. Remaining squad members SHALL form the bench. Squad size SHALL NOT be fixed to eleven. Setup SHALL be editable before kickoff and locked after kickoff. Matches without participation setup SHALL remain usable for existing clock and goal tracking. The guided pre-kickoff workflow SHALL offer this setup as an optional step; saving SHALL advance only after commit, while skipping SHALL leave the last committed setup unchanged.

#### Scenario: Prepare an away-team lineup
- **WHEN** the user identifies the away team as their team, selects a squad, and chooses starters
- **THEN** those starters and bench are attached only to the away side and the opponent requires no player list

#### Scenario: Prevent invalid or partial tracked setup
- **WHEN** the user saves a tracked setup without an own side or starters, with a duplicate player, or with a starter outside the squad
- **THEN** the application rejects the setup with an explanation and preserves the last valid setup

#### Scenario: Lock setup at kickoff
- **WHEN** first-half kickoff occurs with a saved participation setup
- **THEN** those starters become the initial on-pitch players and setup cannot be replaced or disabled for that match

#### Scenario: Keep goal-only matches usable
- **WHEN** the user starts a match without participation setup
- **THEN** existing clock and goal actions remain available
- **AND** player tracking is marked as unavailable and cannot be enabled retrospectively after kickoff

#### Scenario: Save a squad in the guided flow
- **WHEN** the user successfully saves a valid squad and starters in preparation
- **THEN** those committed choices become the squad used by the following jersey step
- **AND** returning to the squad step shows the saved own side, squad, and starters

#### Scenario: Skip an unsaved lineup
- **WHEN** the user skips the squad step without a committed setup, confirming discard of changed inputs if necessary
- **THEN** no partial participation setup is saved
- **AND** completing preparation remains available without enabling tracking

#### Scenario: Retry without advancing
- **WHEN** saving a valid squad fails
- **THEN** the own side, squad selections, and starters remain available on the current step for retry
- **AND** the last committed squad and its jersey distribution remain unchanged

## ADDED Requirements

### Requirement: Optional squad setup despite unavailable directory data
The squad step SHALL distinguish a loaded empty directory from unavailable player data and SHALL offer retry for a load failure. Neither state SHALL block skipping or finishing preparation. Continuing without editing a previously saved squad SHALL remain possible without directory data, and SHALL NOT replace its saved identities or names.

#### Scenario: Prepare without registered players
- **WHEN** the directory loads successfully with no selectable players
- **THEN** the squad step explains where players can be managed and offers skipping player tracking
- **AND** it does not require the user to create dummy players or save an invalid empty lineup

#### Scenario: Player loading fails
- **WHEN** the player directory cannot load
- **THEN** the squad step shows unavailable data and a retry action rather than treating the directory as empty
- **AND** the user can keep existing preparation or finish without configuring tracking
