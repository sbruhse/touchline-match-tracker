# Spec Delta

## MODIFIED Requirements

### Requirement: Spiele lokal verwalten und wieder öffnen
Die Anwendung SHALL dem Nutzer ermöglichen, ein Spiel mit zwei manuell eingegebenen Teamnamen anzulegen und es ausschließlich lokal in IndexedDB zu speichern. Dort gespeicherte Spiele SHALL später in derselben Browser-Umgebung und unter derselben Website-Adresse wieder geöffnet und bearbeitet werden können. Bestehende localStorage-Spieldaten SHALL weder importiert, angezeigt, verändert noch gelöscht werden. Die Anwendung SHALL bei nicht verfügbarer IndexedDB nicht auf localStorage oder einen entfernten Datenspeicher ausweichen. Nach erfolgreichem Anlegen SHALL das neue, noch nicht gestartete Spiel in der geführten Vor-Anpfiff-Vorbereitung geöffnet werden, nicht unmittelbar in der Live-Erfassung.

#### Scenario: Neues Spiel anlegen
- **WHEN** der Nutzer ein neues Spiel mit den Namen beider Teams anlegt
- **THEN** wird das Spiel in IndexedDB gespeichert und nach erfolgreichem Speichern in der optionalen Vor-Anpfiff-Vorbereitung geöffnet
- **AND** die Uhr bleibt ungestartet und es wird kein Anpfiffzeitpunkt erzeugt

#### Scenario: Gespeichertes Spiel wieder öffnen
- **WHEN** der Nutzer ein zuvor in IndexedDB gespeichertes Spiel aus der lokalen Spielübersicht auswählt
- **THEN** werden dessen Teams, Tore, Spielstand und Spieluhrzustand in der Match-Ansicht wiederhergestellt
- **AND** ein noch nicht gestartetes Spiel bietet einen Einstieg zur Vorbereitung, ohne sie automatisch zu erzwingen

#### Scenario: Spiel bleibt nach Neuladen erhalten
- **WHEN** die Seite nach dem erfolgreichen Speichern eines Spiels oder einer Änderung neu geladen wird
- **THEN** bleiben die gespeicherten Spieldaten im selben Browser verfügbar

#### Scenario: Vorhandene localStorage-Daten werden nicht übernommen
- **WHEN** der Nutzer die Anwendung mit bestehenden localStorage-Spieldaten und ohne IndexedDB-Spiele öffnet
- **THEN** wird nach erfolgreichem Laden eine leere Spielübersicht angezeigt
- **AND** die bisherigen localStorage-Daten bleiben unverändert

#### Scenario: IndexedDB ist die einzige Quelle der Spielübersicht
- **WHEN** sowohl IndexedDB-Spiele als auch davon abweichende localStorage-Spieldaten vorhanden sind
- **THEN** zeigt die Anwendung ausschließlich die IndexedDB-Spiele an
- **AND** Änderungen an einem Spiel aktualisieren ausschließlich IndexedDB

#### Scenario: Bereits geladene Anwendung ohne Netzwerk nutzen
- **WHEN** der Nutzer in der bereits geladenen Anwendung ohne Netzwerkverbindung ein Spiel anlegt oder bearbeitet
- **THEN** kann die Änderung lokal gespeichert und anschließend aus IndexedDB gelesen werden, ohne Spieldaten an einen Server zu senden

## ADDED Requirements

### Requirement: Guided optional pre-kickoff preparation
Match creation SHALL lead from team entry to optional own-side squad and starter selection, then optional jersey preparation for a saved squad. Each optional step SHALL offer an explicit skip or keep-saved choice. Without a saved squad, the flow SHALL bypass jersey editing and allow immediate completion. Completing or leaving preparation SHALL NOT start the clock or create a first-kickoff time.

#### Scenario: Prepare a tracked match
- **WHEN** the user creates a match, saves their squad and starters, and accepts jersey assignments
- **THEN** each successful save advances the preparation flow
- **AND** completion opens that same unstarted match with its saved preparation
- **AND** starting the first half remains a separate action on the Match screen

#### Scenario: Skip all optional tracking
- **WHEN** the user creates a match and skips squad preparation without a saved squad
- **THEN** the flow offers completion without requiring jersey preparation or any directory or inventory data
- **AND** the unstarted Match screen remains usable for existing clock and goal recording

#### Scenario: Skip only jersey preparation
- **WHEN** the user saves a valid squad and skips jerseys
- **THEN** the Match screen opens with that squad and no newly accepted jersey distribution
- **AND** kickoff is available without any jersey assignments

#### Scenario: Do not advance a failed save
- **WHEN** match creation, squad saving, or jersey acceptance fails
- **THEN** the user stays on the relevant form with their entered values and an actionable error
- **AND** a retry can complete that same step without claiming the failed change was saved

### Requirement: Revisit saved preparation without destructive skipping
An unstarted Match screen SHALL provide one preparation entry point and a compact saved-state summary instead of expanded squad and jersey editors. Reopening preparation SHALL restore committed choices. Skipping or keeping an existing step SHALL NOT clear committed data. App-controlled navigation that discards changed drafts SHALL require confirmation, and SHALL wait for pending match writes to finish.

#### Scenario: Resume after leaving or reloading
- **WHEN** the user saves a squad, leaves preparation, and later reopens the match after a reload
- **THEN** the match and saved squad remain available from the archive
- **AND** opening preparation restores the saved choices without creating another match

#### Scenario: Keep an accepted distribution
- **WHEN** the user reopens preparation and continues without replacing the saved squad or jersey assignments
- **THEN** both committed preparations remain unchanged
- **AND** continuing does not silently disable tracking or erase jersey snapshots

#### Scenario: Confirm discarding an edited draft
- **WHEN** the user requests a skip or an app-controlled departure that would discard changed preparation inputs
- **THEN** the application offers keeping the draft open or discarding only its unsaved changes
- **AND** cancelling departure preserves the inputs while confirmed departure preserves the last committed match data

#### Scenario: Protect a save in progress
- **WHEN** a preparation save is pending and the user requests completion, skipping, or leaving
- **THEN** the app does not navigate away or initiate a conflicting write before the pending result is known
- **AND** a failed save leaves the exact draft available on the same step

#### Scenario: Reopen a started match
- **WHEN** the user opens a running, paused, half-time, or completed match
- **THEN** the normal Match workspace opens without the preparation flow or an editable preparation launcher
- **AND** recorded events, clock state, and accepted snapshots remain unchanged

### Requirement: Retain drafts within an open preparation session
Moving back and forth between preparation steps SHALL retain unsaved inputs during the open session without treating them as committed data. Step navigation SHALL NOT generate another jersey proposal. Reopening preparation after leaving or reloading SHALL restore only committed data, not claim recovery of unsaved drafts.

#### Scenario: Return to a reviewed jersey draft
- **WHEN** the user generates and manually edits a jersey proposal, goes back to the squad step, and returns without changing the committed squad
- **THEN** the same unsaved jersey choices remain available without rerandomization
- **AND** neither the draft nor step navigation changes the saved distribution

#### Scenario: Return to edited squad choices
- **WHEN** the user edits the squad after going back from jerseys and switches steps without saving or explicitly discarding those inputs
- **THEN** the edited squad inputs remain available on returning to the squad step
- **AND** jersey preparation still uses the last successfully saved squad

### Requirement: Focused phone-first preparation navigation
Preparation SHALL show the current step, team context, and its next, back, skip, or finish actions without live clock, event-tab, or recording controls competing for space. At widths of 320 CSS pixels and above, content SHALL fit without horizontal scrolling; all fields and actions SHALL remain reachable at short heights and with enlarged text. Actions SHALL have visible focus and touch targets at least 48 CSS pixels high.

#### Scenario: Use a narrow or short viewport
- **WHEN** preparation is used at 320px or 390px width, in a short landscape viewport, or with reduced keyboard-height space
- **THEN** the active step remains readable and its final fields and actions can be reached by scrolling without being hidden behind fixed controls
- **AND** the live scoreboard, Match tabs, and fixed goal actions are not rendered in the preparation workspace

#### Scenario: Navigate steps using a keyboard
- **WHEN** the user saves or skips a step, returns to a previous step, or finishes using a keyboard
- **THEN** focus moves to the destination step heading or the appropriate Match heading or launcher
- **AND** saving and errors are announced where the action occurs without duplicate success announcements

#### Scenario: Continue on desktop
- **WHEN** the user prepares a match on a wider screen
- **THEN** the same ordered steps and optional actions remain available in a readable workspace
- **AND** desktop does not require a different preparation workflow
