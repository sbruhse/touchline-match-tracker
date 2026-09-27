# Spec Delta

## ADDED Requirements

### Requirement: Phone-first match workspace
The application SHALL provide a compact match header showing both team names, the score, the current match minute, and the match phase. During a running or paused half and at half-time, the header, panel switcher, and a bottom recording area SHALL remain available while the user scrolls the Events or Player times panel. The recording area SHALL provide separate, team-labeled, one-tap goal actions and the substitution action when participation tracking is available. Clock controls SHALL remain with the match header, separate from event-recording actions. Events SHALL be the default panel when opening a started or completed match and SHALL show newest match-time entries first in both tracked and goal-only matches. Switching between Events and Player times SHALL require one tap without leaving the match or changing its clock state. These persistent workspace controls need not remain accessible behind an open focused editor.

#### Scenario: Record while reading older events
- **WHEN** the user scrolls down the Events panel during a running match
- **THEN** the score, clock, and team-specific goal actions remain visible and reachable without scrolling back to the top
- **AND** one tap on a goal action initiates saving for that team without requiring a detail form

#### Scenario: Record from player times
- **WHEN** the user switches from Events to Player times during an active tracked match
- **THEN** the match header and recording actions remain available in the same positions
- **AND** the match clock continues according to its existing running or paused state

#### Scenario: Preserve save semantics in persistent actions
- **WHEN** a goal action is accepted and its save is pending
- **THEN** visible and announced saving feedback is available in the current view and additional write actions are unavailable
- **AND** the score and saved event history update only after successful persistence
- **AND** a failed save shows an actionable error in the current view without changing the committed score or history

#### Scenario: Confirm a goal without interrupting recording
- **WHEN** a new goal has been saved successfully
- **THEN** the application announces success and offers Add details for that goal without automatically opening an editor
- **AND** the user can continue recording from the currently selected panel

### Requirement: Phase-appropriate match presentation
The application SHALL prioritize optional squad preparation and Start first half before kickoff. Once kickoff has occurred, it SHALL remove the editable setup area and redundant saved-squad summary from the live workspace. At half-time it SHALL expose Start second half alongside the frozen clock context. At full-time it SHALL present the final result, event review, and final player times without active clock or new live substitution controls. Existing goal creation and event-correction capabilities SHALL remain accessible before and after play. For untracked matches, Player times SHALL explain that participation data is unavailable rather than showing invented times; after kickoff it SHALL NOT offer retrospective setup.

#### Scenario: Prepare and start a match
- **WHEN** the user opens a match before first kickoff
- **THEN** optional squad preparation and Start first half are easy to find
- **AND** the user can start a goal-only match without configuring a squad

#### Scenario: Enter live tracking
- **WHEN** first kickoff is successfully saved
- **THEN** the Events panel becomes the primary content and squad setup no longer occupies the live workspace
- **AND** the saved squad remains available through its planned or current player-time lists as appropriate

#### Scenario: Review a completed match
- **WHEN** a completed match is opened
- **THEN** Events is selected, the header shows the final result, and Player times gives access to final totals
- **AND** existing goals and substitutions can still be corrected and a missed goal can still be added
- **AND** no new live substitution or active clock action is offered

#### Scenario: Open player times without tracking
- **WHEN** the user selects Player times in an untracked match after kickoff
- **THEN** the panel explains that player tracking was not enabled for the match
- **AND** it shows neither invented zero-time players nor a setup action
- **AND** clock and goal tracking remain usable

### Requirement: Readable and accessible phone interactions
The Match view SHALL work at viewport widths from 320 CSS pixels without horizontal page scrolling. Match action buttons, panel tabs, event-editor launchers, and selectable player rows SHALL have touch targets at least 48 CSS pixels high. Text and controls SHALL retain readable contrast, visible keyboard focus, and unambiguous names without depending on color alone. Persistent elements SHALL NOT obscure the last content item, focused inputs, or editor actions. Long team and player names SHALL remain identifiable. Tabs and focused editors SHALL be operable with keyboard and assistive technology.

#### Scenario: Read long names on a small phone
- **WHEN** a match with long team and player names is viewed at 320 CSS pixels wide
- **THEN** the user can identify each team and player and operate the controls without horizontal page scrolling
- **AND** the final event or player row can be scrolled fully above the bottom action area

#### Scenario: Edit with the phone keyboard open
- **WHEN** the user focuses a text field in a goal or correction editor on a phone
- **THEN** the field, validation feedback, and Save and close controls remain reachable by scrolling within the editor
- **AND** the background recording area does not overlap or intercept editor controls

#### Scenario: Navigate without touch
- **WHEN** the user operates tabs and opens and closes an editor with the keyboard
- **THEN** selection and focus are visibly and programmatically identifiable
- **AND** focus enters the editor when opened and returns to its launcher or a meaningful fallback when closed

### Requirement: Intentional event editing and retained drafts
The application SHALL initially present event summaries rather than open forms for all goals. A goal summary SHALL identify its team, occurrence minute, and any recorded scorer, and SHALL offer Add details when no descriptive details exist or Edit otherwise. Optional blank fields SHALL NOT be treated as errors. Selecting an editing action SHALL open a focused editor for that event. Closing a goal editor without saving SHALL retain its draft within the current open match; reopening it SHALL restore that draft. Switching panels or saving unrelated match changes SHALL NOT discard retained goal drafts. Explicit Discard changes SHALL reset that draft to its saved values. Save failures SHALL keep the editor and entered values available for retry. Drafts need not survive leaving the match or reloading the application.

#### Scenario: Review without opening forms
- **WHEN** the user opens Events containing several goals
- **THEN** the goals appear as summaries with explicit editing actions and no goal form is open automatically

#### Scenario: Return to an unfinished goal edit
- **WHEN** the user enters goal details, closes the editor, switches panels, records another goal, and reopens the original editor
- **THEN** the original unsaved details are restored without having been persisted automatically

#### Scenario: Save a goal draft
- **WHEN** the user successfully saves a goal draft
- **THEN** the summary and any affected score or ordering update and the editor closes

#### Scenario: Discard a goal draft
- **WHEN** the user explicitly discards changes
- **THEN** the draft resets to the last saved event without modifying the saved match

#### Scenario: Retry failed editing
- **WHEN** saving a goal edit or substitution correction fails
- **THEN** the focused editor retains the entered values and displays the failure with a retry path
- **AND** the saved timeline, lineup, playing times, and score remain unchanged
