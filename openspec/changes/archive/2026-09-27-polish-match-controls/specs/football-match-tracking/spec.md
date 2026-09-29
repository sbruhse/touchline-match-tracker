## ADDED Requirements

### Requirement: Font-independent Match icons
The Match screen SHALL render its back, goal-addition, play, pause, goal-event, and substitution-event icons as consistent local vector graphics without depending on installed symbol fonts, operating-system emoji rendering, or successful external font downloads. Decorative icons SHALL be hidden from assistive technology and SHALL NOT introduce keyboard focus stops. Each control and event SHALL retain a meaningful text label independently of its icon.

#### Scenario: Render without symbol or emoji fonts
- **WHEN** a match containing goals and substitutions is viewed in a browser without supporting symbol or emoji fonts
- **THEN** the goal-addition, goal-event, and substitution-event graphics remain recognizable rather than displaying missing-glyph boxes
- **AND** their size and visual alignment are consistent with the other Match icons

#### Scenario: Show the correct clock-action symbol
- **WHEN** Start first half, Resume clock, or Start second half is available
- **THEN** its label is accompanied by a play icon
- **AND** the Pause clock action uses a pause icon while a half is running

#### Scenario: Navigate with assistive technology
- **WHEN** a user navigates Match controls using keyboard or assistive technology
- **THEN** controls retain descriptive names, including the full team name for each goal action
- **AND** decorative graphics neither receive focus nor add duplicate announcements

### Requirement: Deliberately spaced Match controls
Match controls containing both an icon and a label SHALL keep the icon and text vertically aligned with visible separation, including in compact headers and wrapped layouts. Clock actions, goal actions, and event-editor launchers SHALL provide touch targets at least 48 CSS pixels high, visible keyboard focus, and legible enabled, hovered, and disabled presentations. Styling changes between states SHALL NOT collapse the icon-label gap or shift the control's allocated layout space.

#### Scenario: Use a compact clock control
- **WHEN** the Match header displays a start, pause, or resume action at a 320px or 390px viewport width
- **THEN** the icon is separated from the full action label instead of touching its final character
- **AND** both remain inside the button without overlap or clipping

#### Scenario: Focus and hover a control
- **WHEN** a user focuses or hovers an enabled clock or goal action
- **THEN** its label and icon remain readable and aligned
- **AND** keyboard focus remains visible within the surrounding layout

### Requirement: Inset event-card actions
The Events timeline SHALL present each Add details, Edit, or Correct launcher in an action area inset from the event card's left, right, and bottom borders. The action area SHALL leave enough space for the launcher's keyboard-focus indication without clipping it. Opening and closing an editor SHALL retain its existing draft and focus-restoration behavior.

#### Scenario: Edit a goal from its card
- **WHEN** a goal card displays Add details or Edit
- **THEN** the button is visibly separated from the card edges and aligned with the card's content inset
- **AND** activating it opens the editor for that goal

#### Scenario: Correct a substitution from its card
- **WHEN** a user focuses and activates Correct on a substitution card
- **THEN** the button and its focus indication fit within the padded action area
- **AND** the correction editor opens for that substitution and returns focus to its launcher when closed

### Requirement: Whole-button team-labeled goal recording
The recording area SHALL present each team's goal action as one button containing a first line with the goal-addition icon and Goal label, followed by the team's full visible name. The team name SHALL wrap as needed rather than be ellipsized, line-clamped, or available only through a tooltip. On phones, the two goal buttons SHALL occupy equal-width columns in the same row; when substitution is eligible, Substitute SHALL occupy the full row below them. Goal actions SHALL retain their existing availability before kickoff, during play, and after full-time.

#### Scenario: Activate the team-name portion
- **WHEN** a user taps the team-name portion of an enabled goal button
- **THEN** the application initiates exactly one goal save for that team at the accepted action time
- **AND** recording retains the selected Events or Player times panel and does not automatically open the details editor

#### Scenario: Read long team names
- **WHEN** goal buttons display long team names at a 320px or 390px viewport width or with enlarged text
- **THEN** both full names remain visibly readable inside their buttons through wrapping
- **AND** neither name overlaps the adjacent action or causes horizontal page scrolling

#### Scenario: Preserve pending-save protection
- **WHEN** a match write is pending
- **THEN** the entire goal button, including its team-name portion, remains disabled
- **AND** activating any part of it cannot initiate an additional write

#### Scenario: Follow substitution eligibility
- **WHEN** the current match phase and tracking setup permit a new substitution
- **THEN** the phone recording area shows Substitute below the two goal buttons
- **AND** that action is omitted before kickoff, at full-time, and for matches without participation tracking

### Requirement: Responsive clearance for expanded recording controls
The Match workspace SHALL accommodate the recording area's actual rendered height, including wrapped team names, enlarged text, and bottom safe-area padding. At viewport widths of 320 CSS pixels and above, including browsers with space-consuming scrollbars, the page SHALL avoid horizontal scrolling. Users SHALL be able to scroll the final event or player row clear of the bottom recording area and reach its actions. Wider screens SHALL retain the same team-specific button content and recording behavior.

#### Scenario: Recording area grows after text reflow
- **WHEN** viewport width or text size changes and the team names wrap onto additional lines
- **THEN** the page's reserved bottom space grows with the recording area
- **AND** the final event or player row can still be scrolled above the recording controls

#### Scenario: Use a narrow browser with classic scrollbars
- **WHEN** the viewport is 320px wide and a vertical scrollbar reduces the available layout width
- **THEN** the Match content and recording controls fit the available layout width
- **AND** a minimum-width rule does not create horizontal scrolling

#### Scenario: Continue on a wider screen
- **WHEN** the Match screen is viewed at desktop width
- **THEN** each goal action still contains its Goal label and full team name in one button
- **AND** eligible Substitute remains available alongside the goal actions using the same workflow
