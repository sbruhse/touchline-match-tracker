# Football Match Tracking Specification

## Purpose

Ermöglicht, Fußballspiele lokal im Browser zu verwalten und während des Spiels Tore schnell festzuhalten. Ein Tor kann zunächst unvollständig bleiben und später mit Namen und einer Beschreibung ergänzt werden.

## Requirements

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

### Requirement: Spieluhr für zwei Halbzeiten führen
Die Anwendung SHALL eine vom Nutzer steuerbare Spieluhr für zwei Halbzeiten mit je 45 Minuten bereitstellen. Die Uhr SHALL nach Ablauf der regulären 45 Minuten weiterlaufen, bis der Nutzer sie pausiert oder die Halbzeit beendet, und Nachspielzeit als `45+x` beziehungsweise `90+x` anzeigen. Eine Pause SHALL den erfassten Spielzeitfortschritt anhalten.

#### Scenario: Erste Halbzeit läuft in die Nachspielzeit
- **WHEN** die laufende Uhr der ersten Halbzeit 45 Minuten überschreitet
- **THEN** läuft sie weiter und zeigt die Nachspielzeit im Format `45+x` an

#### Scenario: Zweite Halbzeit läuft in die Nachspielzeit
- **WHEN** die laufende Uhr der zweiten Halbzeit 45 Minuten überschreitet
- **THEN** läuft sie weiter und zeigt die Spielzeit im Format `90+x` an

#### Scenario: Spieluhr pausieren und fortsetzen
- **WHEN** der Nutzer die Spieluhr pausiert und später fortsetzt
- **THEN** bleibt die Uhr während der Pause stehen und setzt danach beim zuvor erreichten Spielzeitstand fort

### Requirement: Tore schnell erfassen
Die Anwendung SHALL bei der Erfassung eines Tores dessen Team und aktuelle Spielzeit unmittelbar festhalten und das lokale Speichern unverzüglich anstoßen. Die Spielzeit SHALL dem Zeitpunkt der angenommenen Nutzeraktion entsprechen, nicht dem späteren Abschluss des asynchronen Speicherns. Erst nach erfolgreichem Abschluss SHALL das Tor als gespeichert gelten und den angezeigten Spielstand aktualisieren. Ein gespeichertes Tor SHALL unvollständig sein dürfen; Schütze, Vorlage und Beschreibung sind für das erstmalige Speichern nicht erforderlich.

#### Scenario: Tor während laufender Spieluhr erfassen
- **WHEN** der Nutzer ein Tor für eines der beiden Teams erfasst
- **THEN** wird ein Toreignis mit diesem Team und der Spielzeit der Erfassung gespeichert und der Spielstand des Teams nach erfolgreichem Speichern um eins erhöht

#### Scenario: Tor ohne weitere Details sichern
- **WHEN** der Nutzer ein Tor erfasst, ohne Schütze, Vorlage oder Beschreibung anzugeben
- **THEN** wird das Toreignis trotzdem gespeichert und bleibt als unvollständig ergänzbar

#### Scenario: Verzögerter Schreibvorgang verändert die Torzeit nicht
- **WHEN** das Speichern eines erfassten Tores erst nach einer Verzögerung abgeschlossen wird
- **THEN** bleibt dessen Spielzeit diejenige der angenommenen Erfassungsaktion

### Requirement: Asynchrone Speicherung nachvollziehbar abschließen
Die Anwendung SHALL Laden, laufendes Speichern und Speicherfehler erkennbar darstellen. Während des initialen Ladens SHALL sie noch keine leere Spielübersicht als endgültiges Ergebnis darstellen und keine schreibenden Aktionen zulassen. Innerhalb einer geöffneten Anwendung SHALL während eines laufenden Schreibvorgangs keine weitere schreibende Aktion angenommen werden. Gespeicherter Zustand, Erfolgsanzeigen und erfolgsabhängige Navigation SHALL erst nach erfolgreichem Abschluss des Schreibvorgangs aktualisiert werden. Fehlgeschlagene Schreibvorgänge SHALL den zuletzt erfolgreich gespeicherten Spielzustand erhalten und vorhandene Formulareingaben für einen erneuten Versuch verfügbar lassen.

#### Scenario: Initiales Laden läuft noch
- **WHEN** die Anwendung auf das Öffnen oder Lesen der Datenbank wartet
- **THEN** zeigt sie einen Ladezustand und deaktiviert schreibende Aktionen, bis die Daten erfolgreich geladen wurden

#### Scenario: Überlappende Aktionen vermeiden
- **WHEN** eine Spieländerung noch gespeichert wird und der Nutzer eine weitere schreibende Aktion auslösen möchte
- **THEN** bleibt diese Aktion vorübergehend gesperrt und wird nicht als angenommen oder gespeichert angezeigt
- **AND** nach erfolgreichem Speichern basiert die nächste angenommene Aktion auf dem aktualisierten Spielzustand

#### Scenario: Schreibvorgang schlägt fehl
- **WHEN** das Speichern einer Spieländerung fehlschlägt oder abgebrochen wird
- **THEN** bleiben die zuvor gespeicherten Daten und der daraus dargestellte Zustand erhalten
- **AND** die Anwendung zeigt einen verständlichen Fehler statt einer Erfolgsmeldung, behält vorhandene Formulareingaben und ermöglicht einen erneuten Versuch

#### Scenario: Datenbank kann nicht geladen werden
- **WHEN** IndexedDB nicht verfügbar ist, das Öffnen blockiert ist oder das Laden fehlschlägt
- **THEN** zeigt die Anwendung den Speicherfehler mit einer Möglichkeit zum erneuten Versuch statt einer scheinbar leeren Spielübersicht
- **AND** sie überschreibt oder löscht keine vorhandenen Daten und weicht nicht auf einen anderen Speicher aus

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

#### Scenario: Spielstand nach Bearbeitung aktualisieren
- **WHEN** der Nutzer das Team eines gespeicherten Toreignisses ändert
- **THEN** wird der angezeigte Spielstand anhand der gespeicherten Tore neu berechnet
- **AND** Spielerzuordnungen, die nicht mehr zur eigenen gespeicherten Teamseite passen, werden im selben erfolgreichen Speichern entfernt, ohne die notierten Namen zu verlieren

#### Scenario: Spielernamen ergänzen ohne die Torzeit zu runden
- **WHEN** der Nutzer Schütze, Vorlage, Team oder Beschreibung eines Tores ergänzt, ohne das angezeigte Minutenfeld zu ändern
- **THEN** bleiben die ursprüngliche Halbzeit, millisekundengenaue Torzeit und Erstellungszeit erhalten
- **AND** die Anzeige als Fußballminute führt nicht zu einer stillen Rundung beim Speichern

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

### Requirement: Tatsächliche Halbzeitdauern erhalten
Die Anwendung SHALL die tatsächlich erfasste Dauer jeder beendeten Halbzeit einschließlich Nachspielzeit speichern und beim Start der zweiten Halbzeit sowie beim erneuten Öffnen erhalten. Halbzeitpause und manuell pausierte Zeit SHALL nicht als Spielzeit zählen. Die bestehende Anzeige für zwei Halbzeiten mit je 45 regulären Minuten SHALL erhalten bleiben.

#### Scenario: Erste Halbzeit bleibt nach dem Seitenwechsel erhalten
- **WHEN** die erste Halbzeit nach 47 Minuten erfasster Spielzeit beendet und die zweite Halbzeit gestartet wird
- **THEN** bleibt die Dauer der ersten Halbzeit mit 47 Minuten gespeichert, während die zweite Halbzeit bei null erfasster Zeit beginnt

#### Scenario: Endgültige Dauern wieder öffnen
- **WHEN** ein beendetes Spiel nach Neuladen erneut geöffnet wird
- **THEN** sind die tatsächlichen Dauern beider Halbzeiten erhalten und verändern sich nicht mit der verstrichenen Echtzeit

### Requirement: Erweiterte und bisherige Spieldaten kompatibel öffnen
Die Anwendung SHALL gespeicherte Kader, Startaufstellung, eigene Teamseite, Wechselereignisse, Halbzeitdauern, angenommene Trikotverteilungen, den ersten Anpfiffzeitpunkt und explizite Schützen- und Vorlagenidentitäten zusammen mit den bisherigen Spieldaten wiederherstellen. Bisherige IndexedDB-Spieldatensätze ohne Spielererfassung SHALL weiterhin mit unveränderten Teams, Toren, Spielstand und Spieluhr nutzbar sein. Fehlende historische Aufstellungen, Trikotverteilungen, Anpfiffzeitpunkte, Halbzeitdauern oder Tor-Spielerzuordnungen SHALL als unbekannt behandelt und nicht erfunden werden. Vorhandene Datensätze ohne Versionsfeld SHALL als Version 1 gelesen werden. Datensätze der Versionen 1, 2 und 3 SHALL ohne Schreibzugriff im Speicher normalisiert werden; beim nächsten erfolgreichen Speichern SHALL der jeweilige Datensatz als Version 4 geschrieben werden. Version 4 SHALL für jedes Tor explizit nullable Schützen- und Vorlagenidentitäten speichern. Beim Upgrade eines Version-1-Datensatzes SHALL sein ursprünglicher Inhalt einmalig im selben IndexedDB-Datensatz unter `legacyV1Backup` erhalten bleiben; bereits vorhandene Backups aus Version 2, 3 oder 4 SHALL unverändert erhalten bleiben. Die IndexedDB-Datenbankschemaversion und der Object Store SHALL unverändert bleiben. Alte Matchdaten im localStorage SHALL weder importiert noch gelesen oder verändert werden.

#### Scenario: Bestehendes Spiel ohne Spielererfassung öffnen
- **WHEN** ein Spiel aus dem bisherigen Speicherformat geöffnet und ein Tor bearbeitet wird
- **THEN** bleiben seine bisherigen Daten erhalten und die Torbearbeitung funktioniert weiterhin
- **AND** es werden keine Spieleraufstellungen oder Einsatzstatistiken aus Namen in Torereignissen abgeleitet

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
- **AND** das Laden schreibt den Datensatz nicht um
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

### Requirement: Ersten Anpfiffzeitpunkt dauerhaft erhalten
Die Anwendung SHALL den Zeitpunkt des ersten erfolgreichen Anpfiffs eines noch nicht gestarteten Spiels dauerhaft speichern. Pausieren, Fortsetzen, Halbzeitwechsel und spätere Bearbeitungen SHALL diesen Zeitpunkt erhalten. Ein angenommener Trikotvorschlag vor Anpfiff SHALL keinen Anpfiffzeitpunkt erzeugen. Historische Spiele ohne bekannten ersten Anpfiff SHALL keinen geschätzten Zeitpunkt erhalten.

#### Scenario: Ersten Anpfiff zusammen mit dem Uhrstart speichern
- **WHEN** die erste Halbzeit eines noch nicht gestarteten Spiels erfolgreich gestartet wird
- **THEN** werden Uhrstart und erster Anpfiffzeitpunkt im selben Spiel-Schreibvorgang gespeichert
- **AND** der Zeitpunkt entspricht der angenommenen Aktion, nicht dem späteren Abschluss der Speicherung

#### Scenario: Zeitstempel bei Folgeaktionen erhalten
- **WHEN** die Uhr pausiert, fortgesetzt oder in die zweite Halbzeit gewechselt wird oder ein Tor nachträglich bearbeitet wird
- **THEN** bleibt der erste Anpfiffzeitpunkt unverändert
- **AND** das Spiel erhält dadurch keinen neueren Platz in der Trikotnummernhistorie

#### Scenario: Fehlgeschlagenen Anpfiff erneut versuchen
- **WHEN** das Speichern des ersten Anpfiffs fehlschlägt
- **THEN** bleiben die gespeicherte Uhr und der unbekannte Anpfiffzeitpunkt erhalten
- **AND** ein erneuter Startversuch verwendet seinen eigenen angenommenen Aktionszeitpunkt und schreibt keinen halben Uhrzustand

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

#### Scenario: Open goal details after recording succeeds
- **WHEN** a new goal has been saved successfully
- **THEN** the application announces success and opens the details editor once for that committed goal
- **AND** the selected Events or Player times panel remains behind the editor, and closing it lets the user continue recording there

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
For previously saved goals, the application SHALL initially present event summaries rather than open forms for all goals. A goal summary SHALL identify its team, occurrence minute, and any recorded scorer, and SHALL offer Add details when no descriptive details exist or Edit otherwise. Optional blank fields SHALL NOT be treated as errors. Selecting an editing action SHALL open a focused editor for that event. Closing a goal editor without saving SHALL retain its draft within the current open match; reopening it SHALL restore that draft. Switching panels or saving unrelated match changes SHALL NOT discard retained goal drafts. Explicit Discard changes SHALL reset that draft to its saved values. Save failures SHALL keep the editor and entered values available for retry. Drafts need not survive leaving the match or reloading the application.

#### Scenario: Review without opening forms
- **WHEN** the user opens Events containing several previously saved goals
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
