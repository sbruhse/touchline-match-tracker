# Spec Delta

## Purpose

Show accurate playing time for each of the user's players by summing all on-pitch spells within a match and aggregating recorded participation across matches.

## ADDED Requirements

### Requirement: Calculate playing time from every on-pitch spell
The application SHALL sum each player's elapsed on-pitch intervals from kickoff, substitutions, and actual half endings. Calculations SHALL include stoppage time, exclude the half-time break and manually paused time, and stop at full-time. Re-entry SHALL add to rather than replace prior time. Only time elapsed while on the pitch SHALL count. Match totals SHALL display elapsed minutes and seconds rather than ordinal football match-minute labels, without rounding individual spells before summing.

#### Scenario: Sum repeated spells
- **GIVEN** Alex starts, leaves at first-half elapsed 18:00, returns at elapsed 30:00, and remains until the half ends at 47:00
- **WHEN** first-half playing time is displayed
- **THEN** Alex has 35:00 and a player who replaced Alex only from 18:00 to 30:00 has 12:00

#### Scenario: Include both halves and exclude the break
- **GIVEN** a player remains on the pitch throughout a 47-minute first half and a 48-minute second half
- **WHEN** the match ends after any length of half-time break
- **THEN** the player's final time is 95:00

#### Scenario: Count a half-time exchange correctly
- **GIVEN** Alex plays all of a 47-minute first half and Sam replaces Alex at half-time
- **WHEN** the second half reaches elapsed 10:00
- **THEN** Alex has 47:00 and Sam has 10:00

#### Scenario: Zero-length spell and unused bench
- **WHEN** a player has never entered or enters and leaves at the same exact match time
- **THEN** that player's accumulated time is 00:00 and no negative or duplicated duration is counted

### Requirement: Keep live and saved totals consistent
The application SHALL update playing time for on-pitch players as the match clock progresses, keep bench and paused totals fixed, and reconstruct the same results after navigation or reload. Full-time totals SHALL remain fixed unless participation history is explicitly corrected. Match players SHALL be identified by their saved identities, not by matching display-name text.

#### Scenario: Reload during a running spell
- **WHEN** a tracked running match is reloaded after additional clock time has elapsed
- **THEN** on-pitch players receive the elapsed clock time and bench players retain their prior totals

#### Scenario: Pause and finish
- **WHEN** the user pauses the match and later finishes it
- **THEN** time spent paused is excluded and subsequent wall-clock passage does not increase final totals

### Requirement: Show cross-match player statistics with a breakdown
The application SHALL show each directory player's total recorded playing time, number of appearances, and per-match breakdown across all locally saved participation-tracked matches that have started. An appearance SHALL mean strictly positive playing time in a match and SHALL count once regardless of re-entry. The breakdown SHALL identify the opponent, own home/away side, date, match status, and playing time. Totals SHALL include elapsed time in ongoing matches and visibly identify that live contribution. Archived players SHALL retain access to their statistics. Untracked matches SHALL be excluded and identified as lacking participation data rather than contributing invented zero-minute appearances.

#### Scenario: Aggregate by identity across two matches
- **GIVEN** Alex plays 35:00 across several spells in one match and 20:00 in another
- **WHEN** the user views Alex's statistics
- **THEN** total time is 55:00 with two appearances and each match's contribution is visible

#### Scenario: No appearances yet
- **WHEN** a player has no positive playing time in tracked matches
- **THEN** their summary shows zero appearances and zero playing time
- **AND** any unused-bench selections in tracked matches remain visible as zero-time breakdown entries

#### Scenario: Corrections update aggregate statistics
- **WHEN** a valid substitution correction changes a player's accumulated time
- **THEN** the match breakdown and aggregate totals update together without double-counting a re-entry
