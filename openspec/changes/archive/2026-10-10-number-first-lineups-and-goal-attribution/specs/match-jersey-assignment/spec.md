# Spec Delta

## ADDED Requirements

### Requirement: Number-first jersey proposal review
Jersey review SHALL show the selected back number prominently before each player's name, outside the jersey selector. The number SHALL follow the current draft without generating or saving another proposal. Size, ownership, and duplicate-item distinctions SHALL remain available as secondary preparation information. Unassigned players SHALL remain visible without an invented number.

#### Scenario: Scan a generated distribution
- **WHEN** the user generates a proposal assigning number 7 to Alex and number 12 to Sam
- **THEN** their row headings show number 7 before Alex and number 12 before Sam
- **AND** the selected numbers are visually more prominent than size and ownership information
- **AND** the user can review them without opening each selector

#### Scenario: Change or clear a selection
- **WHEN** the user manually changes a row from number 7 to number 9, or clears its jersey
- **THEN** the prominent number immediately changes to 9, or the row shows an explicit unassigned state
- **AND** the player's name and other rows remain intact without another lottery or save

#### Scenario: Review zero and duplicate stock items
- **WHEN** number 0 is selected and the set also contains repeated physical jerseys with the same numbers
- **THEN** 0 is displayed as a valid assigned number
- **AND** size, ownership, and stable item distinctions remain available for manual selection
- **AND** existing number-uniqueness restrictions remain in effect

#### Scenario: Review from a narrow phone
- **WHEN** the proposal contains long or equal names at 320px or 390px, with enlarged text or reduced viewport height
- **THEN** the number remains before its readable player name without horizontal page overflow
- **AND** labelled choices, associated errors, and save/skip actions remain reachable with visible focus and at least 48px control targets

## MODIFIED Requirements

### Requirement: Preserve accepted distribution snapshots independently of inventory
Accepted distributions SHALL record the selected set identity and name and each chosen physical jersey's identity, number, size, and owner at acceptance, linked to stable squad player identities. Later inventory edits, removals, owner renames, or directory changes SHALL not rewrite these match snapshots. Saved preparation details and number history SHALL remain usable without resolving the original inventory items. The post-kickoff match presentation SHALL use accepted numbers beside player names without displaying jersey sizes, ownership, or a separate duplicate distribution list.

#### Scenario: Change or remove the original stock
- **WHEN** a used jersey is renumbered, resized, transferred, or removed, or its set is renamed or deleted
- **THEN** the saved match retains the accepted number, size, owner, and set snapshot
- **AND** the match lineup continues to show the accepted number beside the wearer independently of current inventory
- **AND** saved pre-kickoff preparation details can still show the recorded size, owner, and set
- **AND** later number-history lookup uses the accepted number under the original set identity

#### Scenario: Preserve assignments through unrelated match actions
- **WHEN** goals, clock transitions, substitutions, or substitution corrections are successfully saved
- **THEN** the accepted distribution and its snapshots are preserved

#### Scenario: Keep kit logistics out of the match view
- **WHEN** the user opens Player times during play, at half-time, or after full-time
- **THEN** accepted numbers and unassigned players are readable directly in the pitch and bench lists
- **AND** the match view does not display jersey sizes, ownership, or a second jersey-assignment roster
- **AND** hiding those details does not remove or alter their saved snapshots
