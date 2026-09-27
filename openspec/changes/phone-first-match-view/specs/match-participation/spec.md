# Spec Delta

## MODIFIED Requirements

### Requirement: Display a persistent current lineup and combined match timeline
For a tracked match the application SHALL make the current on-pitch and bench players and their accumulated match time available through Player times, one tap from Events within the same Match view. The lists SHALL retain a stable squad order within each group rather than automatically sorting by changing playing time. The application SHALL show goals and substitutions in newest-first match-time order, comparing half before elapsed time within that half, with distinguishable event types and team labels. At exactly equal half and elapsed time, goals SHALL precede substitutions; goals SHALL retain a deterministic creation order and equal-time substitutions SHALL retain their recorded application order across reloads. The newest-first display SHALL NOT change chronological replay of participation history. Substitutions SHALL NOT change the score. At half-time the lineup SHALL reflect recorded half-time exchanges; at full-time it SHALL be labeled as the final lineup.

#### Scenario: Reopen a match with repeated exchanges
- **WHEN** the user reloads or reopens a match containing goals and substitutions
- **THEN** the pitch, bench, and newest-first event history are restored consistently
- **AND** the score still derives only from goals

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

## ADDED Requirements

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
