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
