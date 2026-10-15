# Spec Delta

## Purpose

Maintain a local inventory of named jersey sets, individual jerseys and their owners, together with advisory player-number preferences for each set.

## ADDED Requirements

### Requirement: Manage multiple independently identified jersey sets
The application SHALL allow users to list, create, rename, and remove multiple jersey sets with nonblank trimmed names. Each set SHALL retain an identity independent of its name. Equal names SHALL be allowed and presented with stable distinguishing labels when needed. A new set SHALL start empty and remain usable before any players or jerseys have been recorded.

#### Scenario: Create and rename independent sets
- **WHEN** the user creates Blue and White sets and later renames Blue to Home Blue
- **THEN** both sets remain independently selectable
- **AND** the renamed set retains its jerseys and number preferences under the same identity

#### Scenario: Reject a blank set name
- **WHEN** the user submits a new or edited set name containing only whitespace
- **THEN** the application explains that a name is required and does not save the invalid change

#### Scenario: Distinguish equally named sets
- **WHEN** two sets have the same name
- **THEN** inventory and preference controls distinguish them with stable labels
- **AND** editing either set affects only that set

### Requirement: Track each physical jersey independently
Each jersey SHALL belong to one set and have its own stable identity, a back number, an actual size, and an owner. The application SHALL allow individual jerseys to be added, edited, and removed. Repeated numbers, including jerseys with identical number, size, and owner, SHALL remain separate items. Editing or deleting one item SHALL affect only that item.

#### Scenario: Record the same number in different sizes
- **WHEN** the user adds number 7 in M and number 7 in L to Blue
- **THEN** both jerseys remain visible as individual inventory items
- **AND** number 7 can also exist independently in White

#### Scenario: Distinguish otherwise identical jerseys
- **WHEN** two team-owned jerseys in Blue both have number 7 and size M
- **THEN** both are retained and their controls have stable distinguishing labels
- **AND** editing or removing either one leaves the other intact

#### Scenario: Change an individual jersey
- **WHEN** the user changes a jersey's number, actual size, or owner and saves
- **THEN** the same inventory item reflects the new values after reload
- **AND** no player's general size or preferred number is changed automatically

#### Scenario: Remove a jersey without removing a preference
- **GIVEN** Alex prefers Blue 7 and the set contains a number-7 jersey
- **WHEN** that jersey is removed
- **THEN** Alex's preferred number remains 7
- **AND** the remaining inventory is preserved

### Requirement: Accept explicit numbers and flexible size labels
Jersey numbers and nonblank preferred-number inputs SHALL represent nonnegative whole numbers. Missing, negative, fractional, or nonnumeric jersey numbers SHALL be rejected. Every inventory jersey SHALL have a nonblank trimmed free-text size. The application SHALL support youth, adult, and combined size labels without inferring fit from a player's general size.

#### Scenario: Record varied size labels and zero
- **WHEN** the user saves valid jerseys with sizes `164`, `M`, or `S/M`, including a jersey with number 0
- **THEN** the numbers and trimmed labels are preserved after reload
- **AND** zero is not treated as a blank number

#### Scenario: Reject incomplete or invalid jersey details
- **WHEN** the user submits a blank or whitespace-only size, a missing number, a negative number, a fraction, or nonnumeric text
- **THEN** the application identifies the invalid field and keeps the draft without changing the saved inventory

### Requirement: Record informational ownership on individual jerseys
A jersey's owner SHALL be either the team or one directory player, with team ownership as the initial choice. Player owners SHALL be referenced by stable identity, including archived players. Ownership SHALL be informational and SHALL NOT reserve a number, set a preference, impose a size match, or imply lending availability.

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

### Requirement: Keep advisory number preferences per player and set
Each player SHALL have at most one optional preferred number per existing jersey set. Different sets SHALL support different numbers for the same player, and multiple players SHALL be allowed to prefer the same number in one set. A preference SHALL refer to a number, not to a particular jersey, and SHALL NOT require a matching inventory item or create a match assignment.

#### Scenario: Prefer numbers independently across sets
- **WHEN** Alex's preferences are saved as Blue 7 and White 12
- **THEN** both values persist independently for the same player
- **AND** Blue and White can contain duplicate-number jerseys without making either preference ambiguous

#### Scenario: Share a preference without reserving stock
- **WHEN** Alex and Ben both prefer Blue 7
- **THEN** both preferences are accepted and retained
- **AND** the inventory is not marked as allocated to either player

#### Scenario: Prefer a number that is not stocked
- **WHEN** the user records Blue 20 for Alex while no Blue jersey has number 20
- **THEN** the preference is saved without creating a jersey or changing existing inventory

#### Scenario: Reject invalid or stale preference changes together
- **WHEN** a submitted preference edit contains an invalid number or refers to a set that has been removed
- **THEN** none of that edit's number changes are saved and the application explains the problem
- **AND** the removed set is not recreated from the draft

### Requirement: Remove a set and its dependent data together
Removing a jersey set SHALL remove its jerseys and its player-number preferences in one successful save. The removal action SHALL make this scope clear. Other sets, their items and preferences, and player profiles SHALL remain intact. A failed removal SHALL leave the complete set and its dependent data available.

#### Scenario: Remove a populated set
- **GIVEN** Blue contains jerseys and number preferences and White also contains saved data
- **WHEN** Blue is successfully removed
- **THEN** Blue disappears from inventory and player preference summaries
- **AND** White's data and all players' general profiles remain intact after reload

#### Scenario: Fail a set removal
- **WHEN** saving a set removal fails
- **THEN** the set, its jerseys, and all its preferences remain in the committed collection and storage
- **AND** the failure is announced with a way to retry

### Requirement: Persist jersey data locally with recoverable save boundaries
Sets, jerseys, ownership references, and preferences SHALL persist in the same browser without a server. Loading SHALL be read-only. Loading, pending saves, and errors SHALL be visible; writes SHALL require a successful load and SHALL not overlap. State and success feedback SHALL reflect committed data only. Failed writes SHALL retain prior data and retryable drafts.

#### Scenario: Reload a complete inventory
- **WHEN** the user reloads after saving several sets, duplicate jerseys, private owners, and number preferences
- **THEN** all values and stable identities are restored

#### Scenario: Start with no inventory
- **WHEN** no jersey inventory has previously been saved
- **THEN** a successful load presents an empty inventory ready for creation
- **AND** loading does not write a new empty payload

#### Scenario: Use a loaded application without network
- **WHEN** network access is unavailable in an already loaded application
- **THEN** inventory and preferred-number edits can still be saved and reloaded locally

#### Scenario: Handle invalid or unavailable storage
- **WHEN** jersey data is malformed, uses an unsupported version, or cannot be read
- **THEN** the affected area displays a load error with retry rather than a final empty inventory
- **AND** it does not replace the stored payload or enable jersey writes before a successful load

#### Scenario: Prevent overlapping saves and publish after success
- **WHEN** a jersey or preferred-number save is pending
- **THEN** a second jersey-data write is rejected and saved summaries retain their committed values
- **AND** the changed state and success feedback appear only after the first save succeeds

#### Scenario: Preserve data on failure and isolate storage areas
- **WHEN** an inventory or preferred-number write fails
- **THEN** its stored payload and committed collection remain intact and its draft stays available for retry
- **AND** it does not modify player-profile storage or saved matches

### Requirement: Provide accessible phone-first inventory maintenance
The application SHALL expose jersey-set management through its existing navigation and provide labelled forms, explicit save and cancel actions, and saved inventory summaries. Set names, numbers, sizes, and owners SHALL remain readable at 320 CSS pixels and above. Controls SHALL support keyboard use, visible focus, announced errors, and touch targets at least 44 CSS pixels high.

#### Scenario: Operate and cancel an inventory editor
- **WHEN** the user opens an item editor with the keyboard, changes its values, and cancels
- **THEN** the saved item retains its previous values and focus returns to its edit control
- **AND** reopening starts from the saved data

#### Scenario: Read long and repeated content on a phone
- **WHEN** sets and players have long or equal names and jerseys have repeated numbers at a 320px or 390px viewport
- **THEN** labels wrap without horizontal page overflow and each item remains distinguishable
- **AND** all form fields and actions remain reachable with enlarged text or a reduced keyboard-height viewport

#### Scenario: Continue from desktop
- **WHEN** the inventory is used at desktop width
- **THEN** the same set, jersey, ownership, and preferred-number concepts and explicit-save behavior remain available
