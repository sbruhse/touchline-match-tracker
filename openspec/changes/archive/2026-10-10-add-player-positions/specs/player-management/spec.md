# Spec Delta

## ADDED Requirements

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
