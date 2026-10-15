# Spec Delta

## Purpose

Prepare a match squad's jersey distribution from one selected inventory, using ownership, fit, and previous match numbers to propose assignments that the user reviews and finalizes manually.

## ADDED Requirements

### Requirement: Prepare jerseys for one saved match squad and set
The application SHALL offer optional jersey preparation before first kickoff for a saved own-side match squad. The user SHALL select one existing jersey set for the distribution. Every squad member, including substitutes, SHALL appear separately. Saved distributions SHALL remain readable during play and after full-time; proposal generation and distribution editing SHALL be available only before kickoff.

#### Scenario: Choose a set for the complete squad
- **WHEN** the user opens jersey preparation for a saved squad and selects a set
- **THEN** all starters and substitutes appear as assignment rows
- **AND** inventory choices belong only to that set, with equal names and duplicate items distinguished by stable identity

#### Scenario: Prepare the squad first
- **WHEN** a match has no saved participation setup
- **THEN** jersey preparation explains that a match squad is required
- **AND** the existing optional player-tracking and goal-recording workflows remain usable

#### Scenario: View the accepted distribution after kickoff
- **WHEN** the match has started and the user opens its player information
- **THEN** the saved distribution and unassigned players are readable
- **AND** generating or accepting a replacement distribution is unavailable

### Requirement: Prioritize private jerseys without automatically lending them
Automatic proposals SHALL prioritize eligible private jerseys for their owners before distributing team jerseys. A private jersey SHALL be an automatic candidate only for its owner in the current squad and only within the automatic size limits. An owner who cannot receive a private jersey SHALL remain eligible for team jerseys. Ownership priority SHALL precede historical-number preferences.

#### Scenario: Reserve an owner's number ahead of a historical claim
- **GIVEN** Alex owns an eligible number-7 jersey and Ben previously wore a team-owned number 7 in this set
- **WHEN** both are included in an automatic proposal
- **THEN** Alex receives the private number 7
- **AND** Ben is considered for another team jersey

#### Scenario: Exclude an absent owner's jersey
- **WHEN** a private jersey's owner is not in the current squad or its owner reference cannot identify a squad member
- **THEN** that jersey is excluded from automatic allocation to other players
- **AND** it is not treated as team-owned stock

#### Scenario: Apply size limits to owned jerseys
- **GIVEN** Alex needs M, owns only an XL jersey, and an unclaimed team-owned M jersey is available
- **WHEN** a proposal is generated
- **THEN** the owned XL jersey is ineligible for automatic allocation
- **AND** Alex can receive the team-owned M jersey

### Requirement: Compare adult sizes with a one-step automatic limit
Automatic size matching SHALL use a fixed adult-size order, independent of available stock. Matching SHALL ignore surrounding whitespace and letter case and treat equivalent extended-size labels alike. Only the player's own size or exactly one step larger SHALL be eligible. Unknown, missing, youth, and combined size labels SHALL not be guessed into an adult rank. Stored labels SHALL retain their original values.

#### Scenario: Compare adult sizes and aliases
- **WHEN** sizes are compared for a proposal
- **THEN** the order includes XXS, XS, S, M, L, XL, XXL, XXXL, and successive extended sizes
- **AND** labels such as 2XL and XXL, 3XL and XXXL, or 2XS and XXS compare as equal
- **AND** trimmed lowercase labels compare as their uppercase equivalents

#### Scenario: Do not skip a missing size step
- **GIVEN** a player needs M and no eligible M or L jersey is available
- **WHEN** XL remains available
- **THEN** XL is not assigned automatically and the player receives an unassigned-row error

#### Scenario: Avoid automatic guessing
- **WHEN** a player has no recorded size or a label such as 164 or S/M, or a jersey has an unrecognized label
- **THEN** no adult fit is inferred for that value
- **AND** affected players remain visible and manual selection remains available

### Requirement: Prefer exact fit before historical numbers
Within private allocation, exact fits SHALL precede one-step-larger fits. After private allocation, team jerseys SHALL be considered for exact fits across the remaining squad before one-step-larger fits. A historical number SHALL not override a better fit within the same ownership priority. Size eligibility SHALL be measured against the player's current recorded size.

#### Scenario: Choose fit over the previous number
- **GIVEN** Alex needs M, has no eligible private jersey, previously wore 7, and team jerseys 7 in L and 12 in M are available
- **WHEN** the proposal is generated
- **THEN** Alex receives number 12 in M

#### Scenario: Protect an exact fit from a fallback claim
- **GIVEN** Alex needs M, Ben needs L, neither has eligible private stock, and the only available team jersey is 7 in L
- **WHEN** a proposal is generated
- **THEN** Ben receives the L jersey and Alex remains unassigned
- **AND** Alex's earlier use of number 7 does not override Ben's exact fit

### Requirement: Allocate jointly within each priority tier
Within each ownership and size tier, the proposal SHALL assign as many eligible players as number uniqueness permits. Team-jersey tiers SHALL then favor retaining historical numbers. Remaining ties, including equal private ownership claims, SHALL be resolved randomly. Squad order and inventory order SHALL not create avoidable shortages within that tier. Higher-priority allocations SHALL remain reserved while later tiers are considered.

#### Scenario: Avoid a shortage caused by greedy row order
- **GIVEN** Alex needs M and can use team jerseys 7 in M or 8 in M, while Ben needs L and can use only 7 in L
- **WHEN** exact-size team allocation is calculated
- **THEN** Alex receives 8 and Ben receives 7, regardless of row order
- **AND** Alex's historical preference for 7 does not leave Ben unnecessarily unassigned

#### Scenario: Retain a number when coverage and fit are equal
- **GIVEN** Alex and Ben need M and team jerseys 7 and 8 in M are available, with only Alex having previously worn 7
- **WHEN** a proposal is generated
- **THEN** Alex receives 7 and Ben receives 8

### Requirement: Reuse each player's last accepted number in the same set
Historical preference SHALL be the most recent nonempty accepted assignment for that player identity and set identity in a previously started match. First-kickoff chronology SHALL determine recency, with a stable match-identity tie-break for equal timestamps. The current match, unstarted matches, unsaved proposals, and matches without recorded assignments SHALL be excluded. Playing-time totals SHALL not determine jersey history.

#### Scenario: Look back past an absence or an unassigned match
- **GIVEN** Alex wore Blue 7 two games ago and was absent or had no jersey assignment in the most recent Blue game
- **WHEN** a new Blue proposal is generated
- **THEN** Alex's historical preferred number is 7
- **AND** the older assignment has the same priority as another player's more recent historical number

#### Scenario: Keep histories separate by set
- **GIVEN** Alex wore Blue 7 and later White 12
- **WHEN** Blue is selected again
- **THEN** the historical preference is 7, including if Blue has since been renamed

#### Scenario: Use the accepted manual result
- **GIVEN** a proposal suggested Alex should receive 7, but the user accepted a manual change to 9 and that match started
- **WHEN** the next proposal in that set is generated
- **THEN** the historical preference is 9 rather than the earlier suggestion

#### Scenario: Ignore preparation and later unrelated edits
- **WHEN** an unstarted match has an accepted distribution or an older played match is edited more recently than the last played match
- **THEN** neither preparation nor the later edit changes the order of eligible historical matches
- **AND** accepting a proposal alone does not make it evidence of a worn jersey before kickoff

#### Scenario: Include an equipped unused substitute
- **WHEN** a player had an accepted jersey assignment in a started match but stayed on the bench
- **THEN** that assigned number remains eligible as the player's last jersey number
- **AND** the existing playing-time appearance calculation is unaffected

### Requirement: Ignore advisory preferred numbers during automatic allocation
The separately stored per-set preferred-number fields SHALL provide neither an initial preference nor a fallback for automatic allocation. Without eligible number history, players SHALL be allocated by ownership, size, and random tie resolution. Proposal generation and acceptance SHALL not modify those preferred-number fields.

#### Scenario: Start without historical assignments
- **GIVEN** Alex has a saved preferred number but no eligible jersey history
- **WHEN** a proposal is generated
- **THEN** that preferred number gives Alex no priority over other otherwise equal jersey choices or players

#### Scenario: Ignore a preference conflicting with history
- **GIVEN** Alex's stored preference is 10 and their last accepted number in this set is 7
- **WHEN** both are equally fitting and available
- **THEN** historical number 7 is preferred
- **AND** acceptance leaves the stored preferred-number field at 10

### Requirement: Resolve equal conflicts randomly and retain the generated result
Equivalent candidates SHALL be resolved randomly rather than by a permanent player-name, squad, or inventory order. Equally fitting owners competing for one number SHALL have equal opportunity regardless of earlier number history. A generated proposal SHALL remain stable during display, manual edits, and save retries. Only an explicit generation action SHALL run the lottery again.

#### Scenario: Resolve conflicting private numbers
- **GIVEN** Alex and Ben each own one exact-fitting number-7 jersey and cannot both keep that number
- **WHEN** a proposal is generated
- **THEN** a random decision determines which owner receives 7
- **AND** earlier number history does not break the ownership tie
- **AND** the other owner remains eligible for team allocation and otherwise receives a visible unassigned error

#### Scenario: Resolve conflicting historical numbers
- **GIVEN** two players have equal fit and both last wore 7, with equally ranked alternatives available
- **WHEN** a proposal is generated
- **THEN** the conflict is resolved randomly without preferring the player who participated more recently

#### Scenario: Keep the lottery stable during review
- **WHEN** the user scrolls, edits another row, retries a failed save, or the match clock display refreshes
- **THEN** the existing proposed assignments do not rerandomize
- **AND** explicit regeneration replaces the current draft with a newly calculated proposal without saving it

### Requirement: Enforce unique numbers across the complete distribution
Automatic and manual distributions SHALL contain at most one jersey per player, one allocation per physical jersey, and one occurrence of each back number across the complete squad. This SHALL include substitutes, private jerseys, size variants, and number zero. A conflicting manual change SHALL identify the conflict and SHALL not produce a saved duplicate or silently move another player's jersey.

#### Scenario: Distinguish stock duplicates from match eligibility
- **GIVEN** the selected set contains separate number-7 jerseys in M and L
- **WHEN** one of them is assigned
- **THEN** neither the other variant nor any other number-7 jersey can be assigned to another squad member

#### Scenario: Reject a manual duplicate
- **WHEN** the user attempts to give a number already held by another draft row, including number 0
- **THEN** the conflict identifies the existing wearer
- **AND** it cannot be accepted as a duplicate distribution
- **AND** the other row is not automatically cleared or changed

### Requirement: Show incomplete results as actionable player errors
Every squad member SHALL remain visible when proposal generation cannot find an eligible jersey. Unassigned rows SHALL show an error explaining a missing or unrecognized size or the absence of an eligible unclaimed jersey. Other valid assignments SHALL remain available. The user SHALL be able to accept a partial distribution with explicit empty rows, which SHALL remain visible with errors after reload.

#### Scenario: Keep other results despite a shortage
- **WHEN** all but one player can receive an eligible jersey
- **THEN** the proposal retains the other assignments and shows the affected player with an error
- **AND** it does not silently assign a smaller jersey, a jersey two steps larger, or someone else's private jersey

#### Scenario: Accept and reopen a partial result
- **WHEN** the user explicitly accepts a distribution with an unassigned player and later reopens the match
- **THEN** the saved assignments are restored and that player still appears without a jersey and with an error
- **AND** an incomplete or absent distribution does not block kickoff

### Requirement: Let the user review and manually finalize the proposal
Generation SHALL create an editable draft, not a saved distribution. Manual selection SHALL offer every physical jersey in the selected set regardless of size, size recognition, or ownership, subject to number uniqueness. The user SHALL be able to clear choices, cancel the draft, or explicitly accept the final distribution. Manual choices SHALL take effect without an additional size or ownership approval step.

#### Scenario: Override size and ownership manually
- **GIVEN** Alex needs M and Ben owns an available XL jersey in the selected set
- **WHEN** the user manually selects that jersey for Alex
- **THEN** the draft accepts it if its number is unique
- **AND** accepting the draft saves Alex as its match wearer without changing Ben's inventory ownership or either player's size

#### Scenario: Change a single suggestion
- **WHEN** the user changes or clears one player's proposed jersey
- **THEN** other draft rows retain their assignments and no new lottery occurs
- **AND** clearing a choice makes its number available for a different row

#### Scenario: Cancel a draft
- **WHEN** the user generates or edits a proposal and cancels
- **THEN** the last accepted distribution remains the saved result
- **AND** unsaved suggestions do not contribute to historical preferences

### Requirement: Preserve accepted distribution snapshots independently of inventory
Accepted distributions SHALL record the selected set identity and name and each chosen physical jersey's identity, number, size, and owner at acceptance, linked to stable squad player identities. Later inventory edits, removals, owner renames, or directory changes SHALL not rewrite these match snapshots. Saved summaries and number history SHALL remain usable without resolving the original inventory items.

#### Scenario: Change or remove the original stock
- **WHEN** a used jersey is renumbered, resized, transferred, or removed, or its set is renamed or deleted
- **THEN** the saved match continues to show the accepted number, size, and set snapshot
- **AND** later number-history lookup uses the accepted number under the original set identity

#### Scenario: Preserve assignments through unrelated match actions
- **WHEN** goals, clock transitions, substitutions, or substitution corrections are successfully saved
- **THEN** the accepted distribution and its snapshots are preserved

### Requirement: Accept distributions only at a successful save boundary
Acceptance SHALL validate the current squad, selected set, selected inventory items, and unique numbers, then persist the whole distribution in one match save. Loading and pending writes SHALL prevent conflicting actions. Failed or stale submissions SHALL retain the draft and prior saved distribution with an actionable error. Assignment actions SHALL not write player profiles, inventory, or preferred numbers.

#### Scenario: Retry a failed acceptance
- **WHEN** persisting an accepted draft fails
- **THEN** its entered selections and generated lottery results remain available for retry
- **AND** saved summaries and historical inputs retain the prior committed data

#### Scenario: Detect changed source data before accepting
- **WHEN** a selected jersey has been removed or its displayed details changed, the chosen set was removed, or the squad or match phase no longer permits the draft
- **THEN** acceptance explains the stale selection instead of silently accepting changed inventory details or departed players
- **AND** the user can refresh or correct the draft

#### Scenario: Distinguish inventory loading failure from empty stock
- **WHEN** inventory or directory data required for proposal generation cannot load
- **THEN** preparation shows an unavailable state with retry rather than a completed empty proposal
- **AND** the saved match distribution remains readable independently of that failure

### Requirement: Reconcile assignments with pre-kickoff squad edits
Saving a squad edit SHALL preserve accepted assignments for retained player identities, remove assignments for departed players, and expose added players as unassigned. Changing starters alone SHALL preserve the distribution. Disabling participation SHALL clear its jersey distribution in the same successful match save. These changes SHALL not automatically generate a replacement proposal.

#### Scenario: Replace a squad member
- **WHEN** the saved pre-kickoff squad removes Alex and adds Ben
- **THEN** Alex's allocation is removed, retained players keep theirs, and Ben appears without a jersey
- **AND** Alex's previous number is available for subsequent assignment in that match

#### Scenario: Disable or fail a setup edit
- **WHEN** participation is successfully disabled before kickoff
- **THEN** the accepted distribution is cleared together with the squad
- **AND** a failed squad-edit save preserves both the previous squad and distribution

### Requirement: Provide accessible phone-first jersey review
Preparation SHALL present labelled set and jersey choices, explicit generation and acceptance actions, visible saved-versus-draft state, and player-associated errors. At 320 CSS pixels and above, long names and duplicate-item labels SHALL wrap without horizontal page overflow. Controls SHALL have visible keyboard focus and touch targets at least 48 CSS pixels high, and all rows and actions SHALL remain reachable above the existing recording area.

#### Scenario: Review and correct from a narrow phone
- **WHEN** a squad with long or equal player names, long set names, and duplicate stock items is reviewed at 320px or 390px with enlarged text or reduced keyboard-height space
- **THEN** players and choices remain distinguishable, errors remain associated with their rows, and the final row and save/cancel actions remain reachable

#### Scenario: Operate review with a keyboard
- **WHEN** the user selects a set, generates a proposal, changes a jersey, and accepts or cancels using a keyboard
- **THEN** focus remains visible, generation errors and save outcomes are announced, and closing the editor returns focus to its launcher
- **AND** desktop use follows the same review-and-accept workflow
