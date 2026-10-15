# Spec Delta

## MODIFIED Requirements

### Requirement: Prepare jerseys for one saved match squad and set
The application SHALL offer optional jersey preparation before first kickoff for a saved own-side match squad. The user SHALL select one existing jersey set for the distribution. Every squad member, including substitutes, SHALL appear separately. Saved distributions SHALL remain readable during play and after full-time; proposal generation and distribution editing SHALL be available only before kickoff. The guided workflow SHALL offer jersey review after squad preparation, with explicit save-and-finish and skip-or-keep actions; skipping SHALL NOT replace an accepted distribution.

#### Scenario: Choose a set for the complete squad
- **WHEN** the user opens jersey preparation for a saved squad and selects a set
- **THEN** all starters and substitutes appear as assignment rows
- **AND** inventory choices belong only to that set, with equal names and duplicate items distinguished by stable identity

#### Scenario: Prepare the squad first
- **WHEN** a match has no saved participation setup
- **THEN** jersey preparation explains that a match squad is required
- **AND** the existing optional player-tracking and goal-recording workflows remain usable
- **AND** the guided flow can finish without opening a jersey editor

#### Scenario: View the accepted distribution after kickoff
- **WHEN** the match has started and the user opens its player information
- **THEN** the saved distribution and unassigned players are readable
- **AND** generating or accepting a replacement distribution is unavailable

#### Scenario: Finish without jerseys
- **WHEN** the user skips jersey preparation for a saved squad
- **THEN** the flow returns to the unstarted Match screen without a new jersey save or a generated proposal
- **AND** any previously accepted distribution remains unchanged

#### Scenario: Missing inventory does not block completion
- **WHEN** no sets are available, a selected set has no stock, or required source data cannot load
- **THEN** the step explains the relevant empty or unavailable state and offers retry when loading failed
- **AND** the user can skip or keep the saved distribution and finish preparation

### Requirement: Provide accessible phone-first jersey review
Preparation SHALL present labelled set and jersey choices, explicit generation and acceptance actions, visible saved-versus-draft state, and player-associated errors. At 320 CSS pixels and above, long names and duplicate-item labels SHALL wrap without horizontal page overflow. Controls SHALL have visible keyboard focus and touch targets at least 48 CSS pixels high, and all rows and actions SHALL remain reachable in the focused preparation workspace without competing live recording controls.

#### Scenario: Review and correct from a narrow phone
- **WHEN** a squad with long or equal player names, long set names, and duplicate stock items is reviewed at 320px or 390px with enlarged text or reduced keyboard-height space
- **THEN** players and choices remain distinguishable, errors remain associated with their rows, and the final row and save/skip/back actions remain reachable
- **AND** vertical button size follows its label and touch target rather than expanding to fill otherwise unused screen height

#### Scenario: Operate review with a keyboard
- **WHEN** the user selects a set, generates a proposal, changes a jersey, and accepts or skips using a keyboard
- **THEN** focus remains visible and generation errors and save outcomes are announced
- **AND** completing the guided step moves focus to the destination Match heading; returning to squad selection moves focus to that step
- **AND** closing a standalone editor returns focus to its launcher
- **AND** desktop use follows the same review-and-accept workflow

## ADDED Requirements

### Requirement: Honest jersey preparation status
Jersey preparation SHALL distinguish no accepted distribution, an unsaved review draft, and an accepted distribution. Only an accepted distribution SHALL be labelled saved. Accepted partial distributions SHALL remain saved while showing which players have no assigned jersey. Merely opening a step, selecting a set, or generating a proposal SHALL NOT claim acceptance or start the match.

#### Scenario: Open a match without a distribution
- **WHEN** the user opens preparation or its summary with no accepted jersey distribution
- **THEN** it indicates that jerseys have not been prepared without a Saved badge or a blocking completion warning

#### Scenario: Review a generated proposal
- **WHEN** a proposal is generated or manually changed before acceptance
- **THEN** its selections are visibly an unsaved draft
- **AND** only a successful explicit acceptance changes the displayed committed distribution

#### Scenario: Display an accepted partial distribution
- **WHEN** the user accepts a distribution in which some players have no jersey
- **THEN** the distribution is labelled saved and those players remain explicitly unassigned
- **AND** the user can finish preparation and start the match without filling every row
