# Tasks

## 1. Vue App Foundation

- [x] 1.1 Scaffold the Vue 3 web application and browser build scripts; verify a clean dependency install and production build succeed.
- [x] 1.2 Add the automated test runner and a minimal app smoke test; document the development, test, and build commands in the README and verify each documented command works.

## 2. Local Match Data

- [x] 2.1 Define match, goal, and clock-state records and implement versioned browser-local persistence; verify create, update, and reload round-trips with unit tests.
- [x] 2.2 Build match creation with two manually entered team names and a local match archive that can reopen a selected match; verify the flow with component or integration tests.
- [x] 2.3 Document that match data is limited to the same browser profile and may be lost if site data is cleared; verify the README does not imply cloud backup or device sync.

## 3. Match Clock

- [x] 3.1 Implement half-based clock calculations and match-minute formatting; verify first-half `45+x`, second-half `90+x`, ordinary minutes, and pause/resume behavior with unit tests.
- [x] 3.2 Add start, pause, halftime, and full-time controls and restore a running clock from its saved start state; verify clock display and reload behavior with component or integration tests.

## 4. Live Goal Capture and Editing

- [x] 4.1 Build the live match view with a direct goal action for each team; verify each action immediately persists the team and current match time and updates the score through automated tests.
- [x] 4.2 Add a goal timeline and editing for scorer, assist, free-text description, team, and time; verify blank optional fields are accepted, edits persist after reload, and score recalculates when team changes.

## 5. End-to-End Validation

- [x] 5.1 Exercise the complete flow in a browser-level test: create a match, run the clock into stoppage time, record an incomplete goal, complete it later, finish and reopen the match; verify the displayed time, event details, and score survive reload.
- [x] 5.2 Run the full automated test suite and production build and perform a smoke check of the live flow at a narrow browser viewport; record the verification results in the change summary.
