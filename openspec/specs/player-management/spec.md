# Player Management Specification

## Purpose

Maintain the user's own reusable player directory in this browser so player identities and their match history remain connected across matches.

## Requirements

### Requirement: Manage a persistent own-player directory
The application SHALL allow the user to list, create, and rename their own players with a nonblank display name. Each player SHALL retain a distinct identity independent of their name. Players SHALL persist in the same browser profile and be available for selection in multiple matches without requiring opponent player management.

#### Scenario: Reuse players after reload
- **WHEN** the user creates a player, reloads the application, and prepares another match
- **THEN** the player remains in the directory and can be selected for that match

#### Scenario: Rename without splitting history
- **WHEN** the user renames a player who has participated in matches
- **THEN** their existing participation and aggregate statistics remain associated with that same player
- **AND** saved match roster names remain as recorded for those matches

#### Scenario: Distinct players with the same name
- **WHEN** two players have the same display name
- **THEN** the application keeps their selection and statistics distinct and displays a stable distinguishing label when they appear together

#### Scenario: Reject a blank name
- **WHEN** the user attempts to create or rename a player using only whitespace
- **THEN** the application explains that a name is required and does not save the invalid change

### Requirement: Archive players while preserving participation history
The application SHALL allow players to be archived and restored. Archived players SHALL be excluded from new squad selections, remain available in historical statistics, and retain their membership and substitution eligibility in already saved match squads. The application SHALL provide archiving rather than destructive player deletion.

#### Scenario: Archive a player already selected for a match
- **WHEN** the user archives a player who belongs to a saved match squad
- **THEN** that match's lineup, substitution history, and playing time remain intact
- **AND** the player remains usable in that saved squad but is not offered for a new squad selection

#### Scenario: Restore an archived player
- **WHEN** the user restores an archived player
- **THEN** the same player identity becomes selectable for new match squads again and retains previous statistics

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

### Requirement: Offer a fixed grouped player-position catalogue
The application SHALL offer exactly twelve predefined player positions, grouped under Tor, Abwehr, Mittelfeld, and Angriff. Each choice SHALL show its full name and abbreviation. The catalogue SHALL have a consistent presentation order, with no free-text or user-defined positions.

#### Scenario: Present the complete position catalogue
- **WHEN** the user creates or edits a player profile
- **THEN** the position choices appear in the following group and entry order:

| Group | Name | Abbreviation |
| --- | --- | --- |
| Tor | Torwart | TW |
| Abwehr | Innenverteidiger | IV |
| Abwehr | Linksverteidiger | LV |
| Abwehr | Rechtsverteidiger | RV |
| Mittelfeld | Defensives Mittelfeld | DM |
| Mittelfeld | Zentrales Mittelfeld | ZM |
| Mittelfeld | Offensives Mittelfeld | OM |
| Mittelfeld | Linkes Mittelfeld | LM |
| Mittelfeld | Rechtes Mittelfeld | RM |
| Angriff | Linksaußen | LA |
| Angriff | Rechtsaußen | RA |
| Angriff | Stürmer | ST |

### Requirement: Maintain optional multiple positions on each player profile
Each player SHALL have a persistent set of zero to twelve catalogue positions. Every selected position SHALL have equal status, without a primary position or preference ranking. Positions SHALL belong to the player's stable directory identity and survive renaming, archiving, restoring, and reloading. Profile position changes SHALL NOT assign positions in matches or rewrite saved match history.

#### Scenario: Create a versatile player
- **WHEN** the user creates a player with IV and DM selected
- **THEN** both positions are saved on that player's profile with equal status
- **AND** both remain selected after reloading the application

#### Scenario: Create a player without positions
- **WHEN** the user creates a player with a valid name and no selected positions
- **THEN** the player is saved successfully with an empty position set

#### Scenario: Select every position
- **WHEN** the user saves a player with all twelve catalogue positions selected
- **THEN** all twelve are retained, including both goalkeeper and outfield positions

#### Scenario: Remove the final position
- **GIVEN** a player has saved positions
- **WHEN** the user deselects every position and saves the profile
- **THEN** the player's position set becomes empty and remains empty after reloading

#### Scenario: Keep same-name players independent
- **GIVEN** two players have the same display name
- **WHEN** the user changes one player's positions
- **THEN** only that player's position set changes
- **AND** the other player's positions and identity remain intact

#### Scenario: Preserve positions through the directory lifecycle
- **GIVEN** a player has IV and DM saved and has participated in a match
- **WHEN** the user renames, archives, restores, and reloads that player
- **THEN** the same player identity still has IV and DM
- **AND** saved match membership, names, events, and playing-time history remain as recorded

#### Scenario: Normalize repeated choices
- **WHEN** a profile update contains repeated valid positions
- **THEN** each selected position is retained once in catalogue order

#### Scenario: Reject an unknown position
- **WHEN** a profile update contains a position outside the catalogue
- **THEN** the update is rejected with an explanation and does not replace saved profile data

### Requirement: Edit profile positions through accessible explicit-save forms
The application SHALL provide grouped, labelled checkboxes for positions when creating a player and when editing an active or archived player. Editing SHALL start with the saved name and positions. Name and position changes SHALL be committed together only on an explicit successful save; cancellation or a failed save SHALL NOT publish the draft. The form SHALL support keyboard and touch interaction.

#### Scenario: Save a profile edit
- **GIVEN** a player is named Alex and has IV selected
- **WHEN** the user opens profile editing, changes the name to Alex Smith, adds DM, and saves
- **THEN** the same player is saved as Alex Smith with IV and DM in one update
- **AND** the editor closes after saving succeeds

#### Scenario: Edit an archived player
- **WHEN** the user edits positions on a player in the Archived list and saves
- **THEN** the updated positions are saved while the player remains archived

#### Scenario: Cancel an edit
- **WHEN** the user changes the name or position selection and cancels editing
- **THEN** the saved card and stored player retain their previous values
- **AND** reopening editing starts from those saved values

#### Scenario: Retain a failed draft for retry
- **WHEN** saving a new or edited profile fails
- **THEN** the application announces the error and keeps the entered name and checked positions available for retry
- **AND** the saved directory does not show a partially applied update or a new unsaved player

#### Scenario: Reject a blank name without saving position changes
- **WHEN** the user submits a profile with a whitespace-only name and a changed position selection
- **THEN** the application explains that a name is required
- **AND** neither the name nor the position changes are saved

#### Scenario: Reset the creation form after success
- **WHEN** a new player is successfully saved with selected positions
- **THEN** the creation form clears both the name and the selection for the next player

#### Scenario: Operate the selection with a keyboard
- **WHEN** the user navigates the form with Tab and toggles a position with Space
- **THEN** focus is visible, the position is announced by its full name and checked state, and other selected positions remain selected
- **AND** save and cancel actions are keyboard reachable where applicable

#### Scenario: Use the profile form on a narrow phone
- **WHEN** the form is used at a 320 CSS-pixel viewport width with long player names or position labels
- **THEN** labels wrap, controls remain touch-friendly, and all choices and form actions can be reached by vertical scrolling without horizontal page overflow

### Requirement: Display saved positions on player cards
Active and archived directory cards SHALL display each saved position once as a compact abbreviation in catalogue order. The full names SHALL be available to assistive technology. Summaries SHALL reflect saved values and wrap within the card on narrow screens. A player with no positions SHALL have no position badges.

#### Scenario: Display a saved multi-position profile
- **WHEN** a player with DM and IV saved appears in the directory
- **THEN** the card displays IV followed by DM, regardless of selection order
- **AND** the summary identifies Innenverteidiger and Defensives Mittelfeld for assistive technology

#### Scenario: Keep saved summaries while a draft is open
- **WHEN** the user changes a position selection without saving
- **THEN** any visible saved summary continues to describe the committed profile

#### Scenario: Fit a long profile summary
- **WHEN** a player with a long name and all twelve positions appears on a narrow screen
- **THEN** all position abbreviations and card actions remain reachable without horizontal page overflow

### Requirement: Read existing player directories without losing data
The application SHALL load supported pre-position player directories with empty position sets, preserving identities, names, timestamps, and archive states without rewriting data during load. Subsequent successful saves SHALL retain every player's positions across reloads. Unsupported storage formats or malformed position data SHALL produce a load error instead of silently dropping data or replacing the directory.

#### Scenario: Open an existing directory for the first time
- **GIVEN** the browser contains a version-1 directory created before profile positions existed
- **WHEN** the updated application loads it
- **THEN** every player has an empty position selection and their previous identity and profile data
- **AND** the stored directory remains unchanged until a successful save

#### Scenario: Save positions in an existing directory
- **GIVEN** a previously saved directory contains active and archived players without position data
- **WHEN** the user adds positions to one player, saves, and reloads
- **THEN** that player's selection is restored
- **AND** all other players retain their identities, profile data, and empty selections

#### Scenario: Keep existing data if the first upgraded save fails
- **GIVEN** a pre-position directory was successfully loaded
- **WHEN** saving the first position update fails
- **THEN** the previously stored directory remains intact and the update remains available to retry

#### Scenario: Reject invalid stored positions or unsupported formats
- **WHEN** loading encounters malformed position data, an unknown position, or an unsupported directory format
- **THEN** the application reports that the directory could not be loaded
- **AND** it does not rewrite or discard the stored payload
