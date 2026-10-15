# Match Participation Specification

## Purpose

Track the user's match squad and current on-pitch players through starting lineups and repeated, correctable substitutions, including players returning after earlier spells.

## Requirements

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
For a tracked match the application SHALL make the current on-pitch and bench players and their accumulated match time available through Player times, one tap from Events within the same Match view. The lists SHALL retain a stable squad order within each group rather than automatically sorting by changing playing time. Each assigned player's accepted jersey number SHALL appear before their name in the same row; players without a recorded number SHALL remain readable without an invented number. Jersey sizes and ownership SHALL not appear in these rows. The application SHALL show goals and substitutions in newest-first match-time order, comparing half before elapsed time within that half, with distinguishable event types and team labels. At exactly equal half and elapsed time, goals SHALL precede substitutions; goals SHALL retain a deterministic creation order and equal-time substitutions SHALL retain their recorded application order across reloads. The newest-first display SHALL NOT change chronological replay of participation history. Substitutions SHALL NOT change the score. At half-time the lineup SHALL reflect recorded half-time exchanges; at full-time it SHALL be labeled as the final lineup.

#### Scenario: Reopen a match with repeated exchanges
- **WHEN** the user reloads or reopens a match containing goals and substitutions
- **THEN** the pitch, bench, and newest-first event history are restored consistently
- **AND** the score still derives only from goals
- **AND** accepted jersey numbers remain attached to the same player identities in their pitch or bench rows

#### Scenario: Two exchanges share a time
- **WHEN** Alex leaves for Sam and Sam leaves for Jordan at the same recorded time
- **THEN** the events retain their recorded order and Jordan is on the pitch after both

#### Scenario: Show later halves above earlier halves
- **WHEN** Events contains a first-half stoppage-time event, a half-time substitution, and a later second-half event
- **THEN** the second-half event appears first, the half-time substitution next, and the first-half event last
- **AND** half-time substitutions remain labeled as half-time

#### Scenario: Keep mixed equal-time events deterministic
- **WHEN** a goal and two successive substitutions share the exact half and elapsed time
- **THEN** the goal appears before both substitutions and the substitutions retain their recorded application order
- **AND** reloading produces the same ordering and lineup

#### Scenario: Check minutes and return to events
- **WHEN** the user switches from Events to Player times during a running tracked match
- **THEN** separate on-pitch and bench lists show accumulated minutes and seconds and clearly identify the tracked team
- **AND** on-pitch times advance, bench times remain fixed, and names do not reorder merely because time advances
- **AND** returning to Events takes one tap

#### Scenario: Correct an event time
- **WHEN** a valid correction changes an event's occurrence time
- **THEN** Events positions it according to its corrected match time
- **AND** player times and final or current lineup still derive from valid chronological participation history

#### Scenario: Identify players by number in every lineup phase
- **WHEN** a match has accepted numbers for starters and substitutes and the user views its planned, current, half-time, or final lineup
- **THEN** each assigned row shows the number before the player name, such as `#7 Alex Morgan`
- **AND** player time and live-state indicators retain their existing meaning
- **AND** the accepted number comes from that match's saved distribution rather than live inventory or directory preferences

#### Scenario: Keep optional and partial jersey preparation usable
- **WHEN** a tracked match has no accepted distribution, an unassigned player, or a player assigned number 0
- **THEN** every squad member remains present in the appropriate pitch or bench list
- **AND** 0 is rendered as an assigned number rather than as missing
- **AND** an explicit empty row in a saved partial distribution is identified as having no jersey
- **AND** a match with no jersey preparation does not gain a blocking warning or fabricated numbers

#### Scenario: Read equal and long player names on a phone
- **WHEN** the lineup has equal or long names at 320px or 390px or with enlarged text
- **THEN** rows remain distinguishable, with the number before the name and readable playing times
- **AND** names wrap without horizontal page overflow or clipping the number

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

### Requirement: Focused phone substitution entry
During a running half, a paused half, or half-time in a tracked match, the application SHALL expose Substitute from both Events and Player times. Opening it SHALL capture the occurrence time before player selection and present a focused editor with separately labeled player-off and player-on choices as touch-friendly selectable rows. Off choices SHALL come from the on-pitch players and on choices from the bench. The editor SHALL visibly retain the captured time, require both choices, and save the exchange only on explicit confirmation. Cancelling SHALL discard the draft without changing the match. Validation or storage failure SHALL preserve choices and the captured time for correction or retry. Duplicate names SHALL remain distinguishable.

#### Scenario: Select players without moving the occurrence time
- **WHEN** the user taps Substitute and spends time choosing an outgoing and incoming player
- **THEN** the occurrence time remains the time captured when Substitute was tapped
- **AND** both selections and the captured occurrence are visible before Save substitution
- **AND** successfully saving updates the timeline and player lists and returns to the previously selected panel

#### Scenario: Cancel selection
- **WHEN** the user cancels the substitution editor after choosing a player
- **THEN** no substitution or lineup change is saved and focus returns to Substitute

#### Scenario: Retry a failed substitution
- **WHEN** a substitution save fails
- **THEN** the selected players and captured time remain available in the editor with an actionable error
- **AND** the saved lineup and playing times remain unchanged until a valid exchange is successfully saved

#### Scenario: Explain an empty bench
- **WHEN** the user opens Substitute with no eligible bench player
- **THEN** the editor explains that no player is available to come on and does not allow an invalid exchange to be saved
