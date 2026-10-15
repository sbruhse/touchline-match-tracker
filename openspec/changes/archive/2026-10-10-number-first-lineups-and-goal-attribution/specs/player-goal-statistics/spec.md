# Spec Delta

## Purpose

Show each player's recorded goal and assist contributions across local matches using explicit scorer and assist identities, without guessing associations from names or changing playing-time statistics.

## ADDED Requirements

### Requirement: Count goals and assists by explicit player identity
Player goal and assist totals SHALL count committed goal roles explicitly linked to that identity in started participation-tracked matches for the saved own side. Each goal SHALL contribute once to its linked scorer and once to its linked assist provider. Blank, manual-name-only, opponent, untracked, and not-started contributions SHALL be excluded. Names, jersey numbers, appearances, and minutes SHALL not be used to infer attribution.

#### Scenario: Aggregate separate scoring and assisting roles
- **WHEN** Alex is explicitly linked as scorer on two goals and assist provider on one goal across started own-side matches
- **THEN** Alex's totals show two goals and one assist
- **AND** each linked assist provider receives their own assist independently of Alex's scorer credit

#### Scenario: Keep equal names separate
- **WHEN** two directory players share a name and goals link only one identity
- **THEN** only that identity receives those goal and assist contributions
- **AND** renaming or archiving either player does not transfer or erase their recorded contributions

#### Scenario: Exclude unlinked names and preparation-only goals
- **WHEN** goals have matching typed names but no explicit player links, or linked goals belong to an unstarted match
- **THEN** neither contributes to player goal or assist totals
- **AND** an explicitly linked preparation goal becomes eligible if that tracked match subsequently starts

#### Scenario: Allow an assist without a recorded scorer
- **WHEN** a started own-side goal has a linked assist provider but no linked scorer
- **THEN** the assist counts for its selected player and no scorer credit is invented

### Requirement: Keep goal contributions independent of playing-time validity
Valid committed goal links SHALL remain countable even when a started match's playing-time history is incomplete or unavailable. Goal and assist attribution SHALL not create appearances or minutes, require a positive playing-time total, or guess whether the selected player was on the pitch at the goal time. Existing playing-time and appearance calculations SHALL retain their rules.

#### Scenario: Count a contribution with unknown historical half duration
- **WHEN** a started tracked match has a valid linked goal but lacks a historical duration needed to calculate playing time
- **THEN** the player's goal or assist contribution still counts
- **AND** the unavailable playing-time calculation is not replaced with invented minutes or appearances

#### Scenario: Attribute a correction to a zero-time squad member
- **WHEN** an explicitly selected squad member has a goal or assist role but no recorded positive playing time
- **THEN** the goal or assist counts while their appearance count and recorded time remain unchanged

### Requirement: Derive totals from committed goal details
Goal and assist totals SHALL reflect saved attribution rather than separately stored player counters. Successful changes SHALL remove old role credit and add replacement credit once. Clearing a link or moving a goal to the opponent SHALL remove incompatible credit. Failed saves and unsaved drafts SHALL leave totals unchanged; reloads, clock ticks, and unrelated saves SHALL not duplicate contributions.

#### Scenario: Correct the scorer or clear an assist
- **WHEN** a committed correction replaces Alex with Sam as scorer or clears a linked assist
- **THEN** the old scorer loses that one contribution, the replacement gains it, or the cleared assist loses its contribution
- **AND** the match score and unrelated player totals remain unchanged

#### Scenario: Change the goal's team
- **WHEN** a linked own-side goal is successfully corrected to the opponent side
- **THEN** its former own-side scorer and assist credits disappear together with the incompatible links
- **AND** recorded manual names remain readable

#### Scenario: Fail and retry a details save
- **WHEN** changing player attribution fails and is later retried successfully
- **THEN** totals retain the previous committed values during failure and update once after the retry commits

#### Scenario: Reopen without multiplying totals
- **WHEN** the player screen or match is reloaded, the clock advances, or unrelated match changes save
- **THEN** goal and assist totals are reconstructed from the same committed role links without increments from those actions

### Requirement: Display goal and assist totals alongside player statistics
The existing player-statistics screen SHALL show labelled goal and assist totals beside playing time and appearances for active and archived directory identities. A player without eligible links SHALL show zero totals. The screen SHALL explain that manual-name-only historical goals are not included and that preparation-only matches are excluded. These values SHALL remain readable at 320px and above without changing match-navigation behavior.

#### Scenario: Review an active or archived player
- **WHEN** the user opens that player's statistics
- **THEN** playing time, appearances, goals, and assists are visible as separate labelled values
- **AND** existing dated match breakdown and match-opening controls remain available

#### Scenario: Review a player with no attributed goals
- **WHEN** a player has no eligible linked goals or assists, including when older goals only contain their name
- **THEN** both totals show zero with an explanation of explicit-link coverage rather than implying those historical names were matched

#### Scenario: Read totals on a narrow phone
- **WHEN** statistics are viewed at 320px or 390px with enlarged text and a long player name
- **THEN** all four labels and values are readable without horizontal page overflow
