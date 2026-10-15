# Spec Delta

## ADDED Requirements

### Requirement: Maintain one general jersey size per player
Each player SHALL have one optional general jersey size, independent of jersey sets. Sizes SHALL accept trimmed free text, including youth, adult, and combined labels; blank input SHALL mean no size recorded. Updating this size SHALL preserve player identity and SHALL NOT change inventory jerseys, number preferences, or saved match data.

#### Scenario: Record a general size
- **WHEN** the user saves a player with size ` 164 `, `M`, or `S/M`
- **THEN** the trimmed label is saved as that player's single general size
- **AND** the value is restored after reloading

#### Scenario: Leave or clear a size
- **WHEN** the user creates a player without a size or clears an existing size and saves
- **THEN** the player is saved with no size recorded
- **AND** the application does not infer a size from owned jerseys or preferred numbers

#### Scenario: A player's size changes
- **GIVEN** Alex has general size M, a preferred number in a jersey set, and an owned jersey of size M
- **WHEN** Alex's general size is changed to L
- **THEN** the owned jersey retains its actual size M and the preferred number remains intact
- **AND** saved matches remain as recorded

### Requirement: Edit and display size through the player profile
The player creation and profile-editing forms SHALL include general jersey size. Name, positions, and size SHALL save together only after a successful explicit profile save. Active and archived player cards SHALL display the saved size when present. Cancellation or failure SHALL preserve the committed profile; failure SHALL retain the draft for retry.

#### Scenario: Save a complete profile
- **WHEN** the user creates or edits a profile with a valid name, selected positions, and a size and saves successfully
- **THEN** all three fields are committed together and the saved size appears on the card
- **AND** successful creation resets all three draft fields for the next player

#### Scenario: Cancel or fail a size edit
- **WHEN** the user changes a size and cancels, or its save fails
- **THEN** the saved card and stored profile retain the previous size
- **AND** a failed save announces the error and keeps the entered profile fields available for retry

#### Scenario: Reject an invalid profile without a partial size update
- **WHEN** the user submits a changed size with a whitespace-only name
- **THEN** the application rejects the whole profile update and explains the invalid name

### Requirement: Maintain preferred numbers from the player directory
The directory SHALL show saved preferred numbers with their jersey-set names and provide an explicit preferred-number editor for each saved active or archived player. The editor SHALL offer an optional number for each existing set and commit its number changes together through a dedicated save action. Profile and preferred-number actions SHALL clearly identify which fields they save.

#### Scenario: Enter different preferred numbers
- **GIVEN** Alex is saved and jersey sets Blue, White, and Red exist
- **WHEN** the user saves preferred numbers 7 for Blue and 12 for White, leaving Red blank
- **THEN** Alex's directory summary displays Blue 7 and White 12 with no preference for Red
- **AND** reopening the editor restores those values

#### Scenario: Clear one preference
- **WHEN** the user clears Alex's Blue number and saves the preferred-number form
- **THEN** Alex's Blue preference is removed
- **AND** Alex's White preference, other players' preferences, and all general profile fields retain their values

#### Scenario: Cancel or fail a preferred-number save
- **WHEN** the user changes several preferred numbers and cancels, or saving fails
- **THEN** none of the drafted number changes appear in committed summaries
- **AND** failure retains all number inputs with an announced error and a retry action

#### Scenario: Keep profile editing usable when inventory cannot load
- **WHEN** the player directory loads successfully but jersey data cannot load
- **THEN** name, position, and general-size editing remain available
- **AND** the preferred-number area shows a retryable unavailable state rather than an empty set of saved preferences

#### Scenario: Start before sets exist
- **WHEN** a saved player's number editor is opened and the inventory contains no sets
- **THEN** the editor explains that a jersey set must first be created
- **AND** the player's general profile remains usable without preferred numbers

### Requirement: Preserve jersey-related player information across lifecycle changes
Renaming, archiving, and restoring a player SHALL preserve their general size, per-set number preferences, and references from owned jerseys. Same-name players SHALL remain distinct in summaries and owner choices through stable distinguishing labels. Archiving SHALL NOT transfer ownership or clear preferences.

#### Scenario: Rename and archive a jersey owner
- **GIVEN** Alex has size M, prefers Blue 7, and owns a jersey
- **WHEN** Alex is renamed, archived, and later restored
- **THEN** the size, preference, and ownership remain linked to the same player identity
- **AND** the inventory displays the player's current name and archive status

#### Scenario: Distinguish players with the same name
- **GIVEN** two players share the name Alex
- **WHEN** the user changes one player's size or preferred number, or selects that player as a jersey owner
- **THEN** the application identifies the selected player unambiguously
- **AND** the other player's profile, preferences, and ownership links are unaffected

### Requirement: Upgrade existing directories without losing profile information
The application SHALL read player-directory formats 1 and 2 without rewriting them and treat missing general sizes as unknown. A successful directory save SHALL write format 3 and retain all players' identities, positions, sizes, timestamps, and archive states. Invalid or unsupported stored data SHALL produce a recoverable load error rather than an empty replacement directory.

#### Scenario: Open a pre-size directory
- **WHEN** a supported version-1 or version-2 directory without sizes is loaded
- **THEN** players have no recorded size and their existing fields are retained
- **AND** version-1 players without positions retain the existing empty-position normalization
- **AND** the original stored payload is unchanged

#### Scenario: Save the upgraded directory
- **GIVEN** active and archived players were loaded from an older supported directory
- **WHEN** one player is successfully edited and the application is reloaded
- **THEN** the directory uses format 3 and the saved size is restored
- **AND** all other players and their positions remain intact

#### Scenario: Fail the first upgraded save
- **WHEN** the first format-3 save fails
- **THEN** the prior stored payload and committed player collection remain intact
- **AND** the submitted draft remains available for retry

#### Scenario: Reject malformed current-format data
- **WHEN** stored format-3 data has a missing size field, a non-text non-null size, malformed positions, or an unsupported version
- **THEN** the application reports a directory load error without rewriting the payload

#### Scenario: Explain older-release compatibility
- **WHEN** the user consults the player-storage documentation
- **THEN** it explains that loading is read-only and that after a format-3 save older releases cannot read the upgraded directory
