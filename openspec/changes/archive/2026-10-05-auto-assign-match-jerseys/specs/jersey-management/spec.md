# Spec Delta

## MODIFIED Requirements

### Requirement: Accept explicit numbers and flexible size labels
Jersey numbers and nonblank preferred-number inputs SHALL represent nonnegative whole numbers. Missing, negative, fractional, or nonnumeric jersey numbers SHALL be rejected. Every inventory jersey SHALL have a nonblank trimmed free-text size. The application SHALL support youth, adult, and combined size labels. Inventory maintenance SHALL NOT infer or change actual jersey sizes from a player's general size; automatic match assignment SHALL apply its adult-fit rules independently without rewriting inventory labels.

#### Scenario: Record varied size labels and zero
- **WHEN** the user saves valid jerseys with sizes `164`, `M`, or `S/M`, including a jersey with number 0
- **THEN** the numbers and trimmed labels are preserved after reload
- **AND** zero is not treated as a blank number

#### Scenario: Reject incomplete or invalid jersey details
- **WHEN** the user submits a blank or whitespace-only size, a missing number, a negative number, a fraction, or nonnumeric text
- **THEN** the application identifies the invalid field and keeps the draft without changing the saved inventory

### Requirement: Record informational ownership on individual jerseys
A jersey's owner SHALL be either the team or one directory player, with team ownership as the initial choice. Player owners SHALL be referenced by stable identity, including archived players. Recording ownership SHALL NOT itself reserve a number, set a preference, impose a size match, or record a loan. Automatic match proposals SHALL use ownership for owner priority and exclude lending private jerseys to other players. Manual match assignment SHALL allow another wearer without changing inventory ownership.

#### Scenario: Record and change private ownership
- **WHEN** the user selects Alex as a jersey's owner and saves, then later selects the team and saves
- **THEN** the inventory first identifies Alex and subsequently the team as the owner
- **AND** no number preferences or player sizes are changed by either action

#### Scenario: Own several jerseys in different sets
- **WHEN** Alex is selected as owner of Blue 7 in M and White 12 in L
- **THEN** both ownership links are saved independently
- **AND** they remain valid even if Alex's general size or preferred numbers differ

#### Scenario: Keep an archived owner
- **WHEN** an owner is archived or the user chooses an archived directory player as an owner
- **THEN** the jersey remains linked to that player and the inventory identifies their archive status

#### Scenario: Preserve an unresolved owner
- **WHEN** a stored owner cannot be resolved because the directory is unavailable or the referenced player is missing
- **THEN** the inventory identifies that the player reference is unavailable using a stable distinguishing label
- **AND** it does not present the jersey as team-owned or erase the stored owner reference

#### Scenario: Validate a new owner selection
- **WHEN** a save attempts to add or change a player-owner reference
- **THEN** the application accepts only a player present in the successfully loaded directory
- **AND** an unavailable directory or unknown selected player produces an explanation without publishing the change

#### Scenario: Apply ownership only when preparing a match
- **WHEN** a private jersey is recorded and a later automatic proposal is requested for a match using its set
- **THEN** merely recording ownership has not created a match assignment
- **AND** the proposal considers the jersey only for its eligible owner in that squad

#### Scenario: Retain ownership after a manual match loan
- **WHEN** the user manually assigns Alex's jersey to Ben for a match
- **THEN** the match records Ben as wearer and Alex as the jersey's owner at acceptance
- **AND** the inventory continues to identify Alex as owner without changing preferred numbers or recording a separate lending lifecycle
