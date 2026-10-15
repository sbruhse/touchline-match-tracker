# Spec Delta

## MODIFIED Requirements

### Requirement: Display a persistent current lineup and combined match timeline
For a tracked match the application SHALL display the current on-pitch and bench players and their accumulated match time. Each assigned player's accepted jersey number SHALL appear before their name in the same row; players without a recorded number SHALL remain readable without an invented number. Jersey sizes and ownership SHALL not appear in these rows. It SHALL show goals and substitutions in match-time order with distinguishable event types and team labels. Substitutions SHALL NOT change the score. Equal-time substitutions SHALL retain a stable application order across reloads. At half-time the lineup SHALL reflect recorded half-time exchanges; at full-time it SHALL be labeled as the final lineup.

#### Scenario: Reopen a match with repeated exchanges
- **WHEN** the user reloads or reopens a match containing goals and substitutions
- **THEN** the pitch, bench, and chronological event history are restored consistently
- **AND** the score still derives only from goals
- **AND** accepted jersey numbers remain attached to the same player identities in their pitch or bench rows

#### Scenario: Two exchanges share a time
- **WHEN** Alex leaves for Sam and Sam leaves for Jordan at the same recorded time
- **THEN** the events retain their recorded order and Jordan is on the pitch after both

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
