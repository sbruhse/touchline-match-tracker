# Match Participation Specification

## Purpose

Track the user's match squad and current on-pitch players through starting lineups and repeated, correctable substitutions, including players returning after earlier spells.

## Requirements

### Requirement: Prepare the own-side match squad before kickoff
The application SHALL allow participation tracking to be enabled before first kickoff by identifying the user's team as home or away, selecting unique directory players for the match squad, and choosing a nonempty subset as starters. Remaining squad members SHALL form the bench. Squad size SHALL NOT be fixed to eleven. Setup SHALL be editable before kickoff and locked after kickoff. Matches without participation setup SHALL remain usable for existing clock and goal tracking.

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

### Requirement: Record substitutions with unrestricted re-entry
The application SHALL record a substitution as one atomic exchange of an on-pitch player for a different bench player from the same saved match squad. Both players and the event time SHALL be recorded together. A player who has already played SHALL remain eligible to return whenever they are on the bench, without a re-entry or substitution-count limit. Successful recording SHALL immediately update and persist the pitch, bench, and match history.

#### Scenario: Substitute a returning player
- **GIVEN** Alex starts and is replaced by Sam
- **WHEN** Sam is later replaced by Alex
- **THEN** Alex returns to the pitch, Sam returns to the bench, and both substitution events remain in history
- **AND** Alex can later be substituted off again

#### Scenario: Reject an invalid exchange
- **WHEN** a substitution has the same player in both roles, a player outside the squad, an outgoing bench player, or an incoming on-pitch player
- **THEN** no event or lineup change is saved and the application explains the invalid selection

#### Scenario: Capture the occurrence time before selecting names
- **WHEN** the user opens the substitution action during a running half and completes player selection later
- **THEN** the initially captured match time is used unless the user explicitly corrects it
- **AND** cancelling the action leaves no event or lineup change

#### Scenario: Substitute while paused
- **WHEN** a substitution is recorded while the clock is manually paused
- **THEN** it uses the frozen match time

#### Scenario: Substitute at half-time
- **WHEN** a substitution is recorded at half-time
- **THEN** it applies to the lineup for the second half and assigns neither player playing time for the break

#### Scenario: Restrict new live substitutions to an active match
- **WHEN** the match has not started or is at full-time
- **THEN** the live substitution action is unavailable; pre-match setup and correction of existing events remain available in their respective contexts

### Requirement: Display a persistent current lineup and combined match timeline
For a tracked match the application SHALL display the current on-pitch and bench players and their accumulated match time. It SHALL show goals and substitutions in match-time order with distinguishable event types and team labels. Substitutions SHALL NOT change the score. Equal-time substitutions SHALL retain a stable application order across reloads. At half-time the lineup SHALL reflect recorded half-time exchanges; at full-time it SHALL be labeled as the final lineup.

#### Scenario: Reopen a match with repeated exchanges
- **WHEN** the user reloads or reopens a match containing goals and substitutions
- **THEN** the pitch, bench, and chronological event history are restored consistently
- **AND** the score still derives only from goals

#### Scenario: Two exchanges share a time
- **WHEN** Alex leaves for Sam and Sam leaves for Jordan at the same recorded time
- **THEN** the events retain their recorded order and Jordan is on the pitch after both

### Requirement: Correct substitution history consistently
The application SHALL allow editing an existing substitution's players and period-relative time, including second precision and the half-time boundary, and removing an erroneous substitution. It SHALL validate the entire proposed history from the starting lineup before saving. An edit or removal SHALL recalculate the lineup and playing times only if every remaining exchange is valid; otherwise the saved history SHALL remain unchanged with an explanation of the first conflict. Event times SHALL be within the elapsed portion of the current half or the recorded duration of a completed half, with second-half zero allowed during half-time.

#### Scenario: Correct a valid event after full-time
- **WHEN** the user corrects a substitution time within a completed half without invalidating later exchanges
- **THEN** the saved history, final lineup, and player statistics are recalculated and retained after reload

#### Scenario: Reject removal that invalidates re-entry
- **GIVEN** Alex was replaced by Sam and a later event replaces Sam with Alex
- **WHEN** the user tries to remove the first event while retaining the second
- **THEN** the removal is rejected because the later event would take Sam off while Sam was already on the bench
- **AND** neither history nor statistics are partially changed

#### Scenario: Reject a future event time
- **WHEN** a correction places an event after the current elapsed match time or beyond a completed half's actual duration
- **THEN** the correction is rejected without changing saved data
