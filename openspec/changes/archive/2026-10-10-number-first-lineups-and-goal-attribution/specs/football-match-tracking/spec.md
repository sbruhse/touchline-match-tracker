# Spec Delta

## MODIFIED Requirements

### Requirement: Tore später vervollständigen und bearbeiten
Die Anwendung SHALL erlauben, ein gespeichertes Toreignis später über Add details/Edit zu bearbeiten. Für Tore der eigenen Seite mit gespeichertem Kader SHALL Schütze und Vorlage optional aus diesem Kader auswählbar sein. Schütze und Vorlage SHALL weiterhin als manuell eingegebene Namen erfasst werden können; eine vorab gepflegte Spielerliste ist nicht erforderlich. Eine optionale Beschreibung SHALL als Freitext erfasst werden können. Spielzeit und Team eines Toreignisses SHALL ebenfalls korrigierbar sein. Ohne ausdrückliche Änderung der Spielzeit SHALL das Speichern anderer Details die ursprüngliche Halbzeit und millisekundengenaue Torzeit erhalten.

#### Scenario: Schütze, Vorlage und Beschreibung nachtragen
- **WHEN** der Nutzer ein gespeichertes Toreignis öffnet und Spieler auswählt, Namen oder eine Freitext-Beschreibung ergänzt
- **THEN** werden die Angaben am Toreignis gespeichert und beim späteren Öffnen angezeigt

#### Scenario: Unbekannte oder nicht vorhandene Vorlage offenlassen
- **WHEN** für ein Tor keine Vorlage bekannt ist oder keine Vorlage vergeben wurde
- **THEN** kann das Vorlagenfeld leer bleiben, ohne das Speichern oder Bearbeiten zu verhindern

#### Scenario: Zeitstempel nach verspäteter Erfassung korrigieren
- **WHEN** der Nutzer ein Tor nicht im tatsächlichen Moment erfasst hat
- **THEN** kann er die gespeicherte Spielzeit des Toreignisses nachträglich korrigieren

#### Scenario: Spielernamen ergänzen ohne die Torzeit zu runden
- **WHEN** der Nutzer Schütze, Vorlage, Team oder Beschreibung eines Tores ergänzt, ohne das angezeigte Minutenfeld zu ändern
- **THEN** bleiben die ursprüngliche Halbzeit, millisekundengenaue Torzeit und Erstellungszeit erhalten
- **AND** die Anzeige als Fußballminute führt nicht zu einer stillen Rundung beim Speichern

#### Scenario: Spielstand nach Bearbeitung aktualisieren
- **WHEN** der Nutzer das Team eines gespeicherten Toreignisses ändert
- **THEN** wird der angezeigte Spielstand anhand der gespeicherten Tore neu berechnet
- **AND** Spielerzuordnungen, die nicht mehr zur eigenen gespeicherten Teamseite passen, werden im selben erfolgreichen Speichern entfernt, ohne die notierten Namen zu verlieren

#### Scenario: Aus dem vollständigen gespeicherten Kader auswählen
- **WHEN** der Nutzer die Details eines eigenen Tores mit gespeichertem Kader öffnet
- **THEN** enthalten beide Spielerfelder alle gespeicherten Kaderspieler, nicht nur die aktuell auf dem Feld befindlichen Spieler
- **AND** eine vorhandene Trikotnummer steht vor dem Namen, einschließlich Nummer 0
- **AND** Spieler ohne Trikotnummer bleiben nach Namen auswählbar und gleiche Namen bleiben unterscheidbar
- **AND** Trikotgrößen und Eigentümer werden in den Spieleroptionen nicht angezeigt

#### Scenario: Gegner und Spiele ohne Kader erfassen
- **WHEN** das Tor zur gegnerischen Seite gehört oder kein eigener Kader gespeichert ist
- **THEN** bleiben manuelle Namen und leere optionale Felder verfügbar
- **AND** eigene Kaderspieler werden nicht als Spieler der gegnerischen Seite angeboten

### Requirement: Erweiterte und bisherige Spieldaten kompatibel öffnen
Die Anwendung SHALL gespeicherte Kader, Startaufstellung, eigene Teamseite, Wechselereignisse, Halbzeitdauern, angenommene Trikotverteilungen, den ersten Anpfiffzeitpunkt und explizite Schützen- und Vorlagenidentitäten zusammen mit den bisherigen Spieldaten wiederherstellen. Bisherige IndexedDB-Spieldatensätze ohne Spielererfassung SHALL weiterhin mit unveränderten Teams, Toren, Spielstand und Spieluhr nutzbar sein. Fehlende historische Aufstellungen, Trikotverteilungen, Anpfiffzeitpunkte, Halbzeitdauern oder Tor-Spielerzuordnungen SHALL als unbekannt behandelt und nicht erfunden werden. Vorhandene Datensätze ohne Versionsfeld SHALL als Version 1 gelesen werden. Datensätze der Versionen 1, 2 und 3 SHALL ohne Schreibzugriff im Speicher normalisiert werden; beim nächsten erfolgreichen Speichern SHALL der jeweilige Datensatz als Version 4 geschrieben werden. Version 4 SHALL für jedes Tor explizit nullable Schützen- und Vorlagenidentitäten speichern. Beim Upgrade eines Version-1-Datensatzes SHALL sein ursprünglicher Inhalt einmalig im selben IndexedDB-Datensatz unter `legacyV1Backup` erhalten bleiben; bereits vorhandene Backups aus Version 2, 3 oder 4 SHALL unverändert erhalten bleiben. Die IndexedDB-Datenbankschemaversion und der Object Store SHALL unverändert bleiben. Alte Matchdaten im localStorage SHALL weder importiert noch gelesen oder verändert werden.

#### Scenario: Bestehendes Spiel ohne Spielererfassung öffnen
- **WHEN** ein Spiel aus dem bisherigen Speicherformat geöffnet und ein Tor bearbeitet wird
- **THEN** bleiben seine bisherigen Daten erhalten und die Torbearbeitung funktioniert weiterhin
- **AND** es werden keine Spieleraufstellungen, Einsatzstatistiken oder Tor-Spielerzuordnungen aus Namen in Torereignissen abgeleitet

#### Scenario: Erweitertes Spiel wiederherstellen
- **WHEN** ein Spiel mit gespeicherter Spielererfassung, angenommener Trikotverteilung und verknüpften Tor-Spielern erneut geöffnet wird
- **THEN** werden Kader, Startaufstellung, eigene Teamseite, Wechselhistorie, erfasste Halbzeitdauern, Trikot-Snapshots, erster Anpfiffzeitpunkt und Tor-Spieleridentitäten zusammen mit Toren und Spieluhr wiederhergestellt

#### Scenario: Vorhandenen IndexedDB-Datensatz beim Speichern migrieren
- **WHEN** ein Version-1-Spiel aus dem bestehenden IndexedDB-Object-Store geöffnet und erfolgreich bearbeitet gespeichert wird
- **THEN** bleiben Teams, Tore, Zeitstempel und die exakten Uhrfelder erhalten und der Datensatz wird als Version 4 geschrieben
- **AND** die Aufstellung, Trikotverteilung und der erste Anpfiffzeitpunkt bleiben unbekannt und nur durch den gespeicherten Uhrenzustand belegbare Halbzeitdauern werden ergänzt
- **AND** zuvor nicht explizit zugeordnete Schützen- und Vorlagenidentitäten bleiben unbekannt
- **AND** der ursprüngliche Version-1-Datensatz bleibt einmalig als `legacyV1Backup` erhalten und wird durch spätere Speicherungen nicht ersetzt

#### Scenario: Legacy-localStorage-Matchdaten bleiben unberührt
- **WHEN** im Browser ein alter Match-Speichereintrag im localStorage vorhanden ist
- **THEN** importiert, liest oder verändert die Anwendung diesen Eintrag nicht

#### Scenario: Version 2 ohne erfundene Trikothistorie öffnen
- **WHEN** ein Version-2-Spiel geladen wird
- **THEN** bleiben Spielererfassung, Wechsel, Tore und Halbzeitdauern erhalten und fehlende Trikotverteilung sowie erster Anpfiffzeitpunkt gelten als unbekannt
- **AND** das Laden schreibt den Datensatz nicht um und Tor-Spieleridentitäten werden nicht aus Namen abgeleitet
- **AND** beim nächsten erfolgreichen Speichern als Version 4 bleibt ein vorhandenes `legacyV1Backup` unverändert erhalten

#### Scenario: Version 3 ohne erfundene Torzuordnungen öffnen
- **WHEN** ein Version-3-Spiel mit Schützen- oder Vorlagennamen geladen wird
- **THEN** bleiben seine Namen, Trikot-Snapshots, Spielererfassung und Anpfiffdaten unverändert
- **AND** fehlende Tor-Spieleridentitäten werden als unbekannt behandelt, auch wenn ein Name einem Kaderspieler entspricht
- **AND** das Laden schreibt den Datensatz nicht um und erst das nächste erfolgreiche Speichern schreibt Version 4

#### Scenario: Gemischte Versionen und fehlgeschlagenes Upgrade
- **WHEN** Version-1-, Version-2-, Version-3- und Version-4-Datensätze nebeneinander gespeichert sind und das Upgrade eines einzelnen Spiels fehlschlägt
- **THEN** bleiben alle bisherigen Datensätze und der veröffentlichte Spielzustand erhalten
- **AND** ein erneuter erfolgreicher Versuch aktualisiert nur dieses Spiel einschließlich seiner vollständigen Trikotverteilung und Tor-Spielerzuordnungen

#### Scenario: Ungültige aktuelle Datensätze ablehnen
- **WHEN** ein Version-4-Datensatz bisherige Pflichtfelder oder explizit nullable Tor-Spieleridentitäten vermissen lässt, ungültige Trikot-Snapshots, doppelte vergebene Nummern oder ungültige Tor-Spielerzuordnungen enthält, oder eine unbekannte Datensatzversion vorliegt
- **THEN** meldet die Anwendung einen wiederholbaren Ladefehler und ersetzt oder überschreibt den Datensatz nicht
- **AND** eine explizit leere Trikotverteilung, unbekannte Tor-Spieleridentitäten oder ein unbekannter erster Anpfiffzeitpunkt bleiben zulässige Werte
- **AND** die bisherige strenge Prüfung der Version-3-Pflichtfelder bleibt beim Laden alter Version-3-Datensätze erhalten

#### Scenario: Versionskompatibilität dokumentieren
- **WHEN** der Nutzer die Dokumentation zur lokalen Speicherung liest
- **THEN** erklärt sie das schreibfreie Laden alter Versionen, das Upgrade beim erfolgreichen Speichern und die erhaltenen Version-1-Backups
- **AND** sie erklärt, dass ältere Anwendungsversionen Version-4-Datensätze nicht lesen können und keine automatische Rückkonvertierung erfolgt

### Requirement: Whole-button team-labeled goal recording
The recording area SHALL present each team's goal action as one button containing a first line with the goal-addition icon and Goal label, followed by the team's full visible name. The team name SHALL wrap as needed rather than be ellipsized, line-clamped, or available only through a tooltip. On phones, the two goal buttons SHALL occupy equal-width columns in the same row; when substitution is eligible, Substitute SHALL occupy the full row below them. Goal actions SHALL retain their existing availability before kickoff, during play, and after full-time. A successful goal save SHALL automatically open optional details for that committed goal while retaining the selected Events or Player times panel behind the editor.

#### Scenario: Activate the team-name portion
- **WHEN** a user taps the team-name portion of an enabled goal button
- **THEN** the application initiates exactly one goal save for that team at the accepted action time
- **AND** after that save commits, it opens the details editor for that exact goal once without changing the selected Events or Player times panel

#### Scenario: Read long team names
- **WHEN** goal buttons display long team names at a 320px or 390px viewport width or with enlarged text
- **THEN** both full names remain visibly readable inside their buttons through wrapping
- **AND** neither name overlaps the adjacent action or causes horizontal page scrolling

#### Scenario: Preserve pending-save protection
- **WHEN** a match write is pending
- **THEN** the entire goal button, including its team-name portion, remains disabled
- **AND** activating any part of it cannot initiate an additional write
- **AND** the details editor does not open before the goal save commits

#### Scenario: Follow substitution eligibility
- **WHEN** the current match phase and tracking setup permit a new substitution
- **THEN** the phone recording area shows Substitute below the two goal buttons
- **AND** that action is omitted before kickoff, at full-time, and for matches without participation tracking

#### Scenario: Fail the initial goal save
- **WHEN** saving a newly recorded goal fails
- **THEN** no details editor opens for an unsaved goal and the prior score and events remain committed
- **AND** the recording action remains retryable without creating a duplicate goal

#### Scenario: Skip details without losing the goal
- **WHEN** the automatically opened editor is closed or its optional fields are left blank
- **THEN** the already saved goal and its action-time timestamp remain intact
- **AND** closing returns to the originating panel without pausing the match clock
- **AND** Add details/Edit remains available for the saved goal

#### Scenario: Retain and retry an attribution draft
- **WHEN** the user closes an unsaved details draft or a details save fails
- **THEN** the committed goal remains intact and the draft selections, typed names, and description remain available while the match stays open
- **AND** reopening the same goal restores that draft, explicit Discard changes resets it, and a successful details save closes the editor

#### Scenario: Do not reopen on unrelated updates
- **WHEN** the clock display ticks, another match action saves, or the match is reopened
- **THEN** previously committed goals do not automatically reopen their editors
- **AND** only a newly successful recording action or an explicit details launcher opens one

## ADDED Requirements

### Requirement: Save explicit scorer and assist player attribution
A squad-player selection SHALL save that player's stable identity and recorded match name for its goal role. A linked player SHALL belong to the saved own-side squad and the goal SHALL be for that side. Either role SHALL allow an unknown identity with blank or manual name text. Changing to a manual name or clearing a role SHALL remove its link. Existing goal names SHALL not be matched to identities automatically.

#### Scenario: Save two linked roles
- **WHEN** the user selects Alex as scorer and Sam as assist provider and saves the details
- **THEN** the goal retains each selected identity alongside its recorded name after reload
- **AND** it does not write counters or other changes into player profiles

#### Scenario: Keep equal names and renamed players distinct
- **WHEN** two squad players share a name and one is selected, or that selected directory player is later renamed or archived
- **THEN** the goal remains linked only to the selected identity
- **AND** the recorded goal name and linked statistics remain intact

#### Scenario: Preserve an unlinked historical name
- **WHEN** the user opens a name-only goal whose text equals a squad player's name
- **THEN** the text remains readable as an unlinked manual value
- **AND** only an explicit player selection creates a player association

#### Scenario: Clear or replace a role
- **WHEN** a user clears a linked assist, replaces a scorer with another squad player, or chooses manual name entry
- **THEN** the successful save clears or replaces only that role's link and corresponding recorded name as requested
- **AND** other goal details and the number of goals remain unchanged

#### Scenario: Reject an invalid player link
- **WHEN** a details save attempts to link a player outside the saved squad or an own-side player to an opponent goal
- **THEN** the save is rejected with an explanation and the draft remains available
- **AND** the committed goal, score, and player totals remain unchanged

### Requirement: Reconcile goal attribution with preparation changes
Successful pre-kickoff squad edits SHALL retain links for eligible retained players and clear links made ineligible by removed membership, a changed own side, or disabled tracking. Recorded scorer/assist names SHALL remain intact when such links are cleared. Reconciliation SHALL occur in the same match save as the preparation change; failed saves SHALL preserve both preparation and goal attribution.

#### Scenario: Remove a previously attributed player before kickoff
- **WHEN** the user saves a squad edit removing a player already linked to a pre-kickoff goal
- **THEN** that goal role becomes an unlinked recorded name in the same successful match save
- **AND** eligible retained-player links remain intact

#### Scenario: Change starters or disable tracking
- **WHEN** the user changes only starters, changes the own side, or disables tracking before kickoff
- **THEN** starter-only changes retain goal links
- **AND** a changed own side clears incompatible links and disabling tracking clears all squad-player goal links without losing recorded names

#### Scenario: Fail a preparation change
- **WHEN** saving a preparation change that would clear goal links fails
- **THEN** the prior squad, jersey distribution, goal names, and player links all remain committed

### Requirement: Accessible number-first goal player choices
Scorer and assist choices SHALL have distinct accessible labels, optional empty selections, visible keyboard focus, and at least 48px control targets. Number-first player labels and manual-entry controls SHALL remain usable at 320px and above with long/equal names, enlarged text, and reduced keyboard-height space. Opening or closing automatic details SHALL move and restore focus meaningfully.

#### Scenario: Use automatic details from Player times
- **WHEN** a keyboard user records a goal while Player times is selected and the save succeeds
- **THEN** focus moves into the details editor and remains contained there
- **AND** closing returns focus to a visible control in the originating match panel or recording area

#### Scenario: Review choices with a reduced phone viewport
- **WHEN** the editor shows long or equal names at 320px or 390px with enlarged text or a reduced-height viewport
- **THEN** each player remains distinguishable and the selected player's number/name is readable without horizontal page overflow
- **AND** all fields and save/close actions remain reachable without hiding the final choice behind the editor actions
