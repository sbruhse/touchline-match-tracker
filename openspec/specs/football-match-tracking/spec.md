# Football Match Tracking Specification

## Purpose

Ermöglicht, Fußballspiele lokal im Browser zu verwalten und während des Spiels Tore schnell festzuhalten. Ein Tor kann zunächst unvollständig bleiben und später mit Namen und einer Beschreibung ergänzt werden.

## Requirements

### Requirement: Spiele lokal verwalten und wieder öffnen
Die Anwendung SHALL dem Nutzer ermöglichen, ein Spiel mit zwei manuell eingegebenen Teamnamen anzulegen und es ausschließlich lokal in IndexedDB zu speichern. Dort gespeicherte Spiele SHALL später in derselben Browser-Umgebung und unter derselben Website-Adresse wieder geöffnet und bearbeitet werden können. Bestehende localStorage-Spieldaten SHALL weder importiert, angezeigt, verändert noch gelöscht werden. Die Anwendung SHALL bei nicht verfügbarer IndexedDB nicht auf localStorage oder einen entfernten Datenspeicher ausweichen.

#### Scenario: Neues Spiel anlegen
- **WHEN** der Nutzer ein neues Spiel mit den Namen beider Teams anlegt
- **THEN** wird das Spiel in IndexedDB gespeichert und nach erfolgreichem Speichern für die Live-Erfassung geöffnet

#### Scenario: Gespeichertes Spiel wieder öffnen
- **WHEN** der Nutzer ein zuvor in IndexedDB gespeichertes Spiel aus der lokalen Spielübersicht auswählt
- **THEN** werden dessen Teams, Tore, Spielstand und Spieluhrzustand wiederhergestellt

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
Die Anwendung SHALL erlauben, ein gespeichertes Toreignis später zu bearbeiten. Schütze und Vorlage SHALL als manuell eingegebene Namen erfasst werden können; eine vorab gepflegte Spielerliste ist nicht erforderlich. Eine optionale Beschreibung SHALL als Freitext erfasst werden können. Spielzeit und Team eines Toreignisses SHALL ebenfalls korrigierbar sein.

#### Scenario: Schütze, Vorlage und Beschreibung nachtragen
- **WHEN** der Nutzer ein gespeichertes Toreignis öffnet und Namen oder eine Freitext-Beschreibung ergänzt
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

### Requirement: Tatsächliche Halbzeitdauern erhalten
Die Anwendung SHALL die tatsächlich erfasste Dauer jeder beendeten Halbzeit einschließlich Nachspielzeit speichern und beim Start der zweiten Halbzeit sowie beim erneuten Öffnen erhalten. Halbzeitpause und manuell pausierte Zeit SHALL nicht als Spielzeit zählen. Die bestehende Anzeige für zwei Halbzeiten mit je 45 regulären Minuten SHALL erhalten bleiben.

#### Scenario: Erste Halbzeit bleibt nach dem Seitenwechsel erhalten
- **WHEN** die erste Halbzeit nach 47 Minuten erfasster Spielzeit beendet und die zweite Halbzeit gestartet wird
- **THEN** bleibt die Dauer der ersten Halbzeit mit 47 Minuten gespeichert, während die zweite Halbzeit bei null erfasster Zeit beginnt

#### Scenario: Endgültige Dauern wieder öffnen
- **WHEN** ein beendetes Spiel nach Neuladen erneut geöffnet wird
- **THEN** sind die tatsächlichen Dauern beider Halbzeiten erhalten und verändern sich nicht mit der verstrichenen Echtzeit

### Requirement: Erweiterte und bisherige Spieldaten kompatibel öffnen
Die Anwendung SHALL gespeicherte Kader, Startaufstellung, eigene Teamseite, Wechselereignisse und Halbzeitdauern zusammen mit den bisherigen Spieldaten wiederherstellen. Bisherige IndexedDB-Spieldatensätze ohne Spielererfassung SHALL weiterhin mit unveränderten Teams, Toren, Spielstand und Spieluhr nutzbar sein. Fehlende historische Aufstellungen oder Halbzeitdauern SHALL als unbekannt behandelt und nicht erfunden werden. Vorhandene Datensätze ohne Versionsfeld SHALL als Version 1 gelesen und im Speicher normalisiert werden; beim nächsten erfolgreichen Speichern SHALL der jeweilige Datensatz als Version 2 geschrieben und sein ursprünglicher Version-1-Inhalt einmalig im selben IndexedDB-Datensatz unter `legacyV1Backup` erhalten bleiben. Die IndexedDB-Datenbankschemaversion und der Object Store SHALL unverändert bleiben. Alte Matchdaten im localStorage SHALL weder importiert noch gelesen oder verändert werden.

#### Scenario: Bestehendes Spiel ohne Spielererfassung öffnen
- **WHEN** ein Spiel aus dem bisherigen Speicherformat geöffnet und ein Tor bearbeitet wird
- **THEN** bleiben seine bisherigen Daten erhalten und die Torbearbeitung funktioniert weiterhin
- **AND** es werden keine Spieleraufstellungen oder Einsatzstatistiken aus Namen in Torereignissen abgeleitet

#### Scenario: Erweitertes Spiel wiederherstellen
- **WHEN** ein Spiel mit gespeicherter Spielererfassung erneut geöffnet wird
- **THEN** werden Kader, Startaufstellung, eigene Teamseite, Wechselhistorie und erfasste Halbzeitdauern zusammen mit Toren und Spieluhr wiederhergestellt

#### Scenario: Vorhandenen IndexedDB-Datensatz beim Speichern migrieren
- **WHEN** ein Version-1-Spiel aus dem bestehenden IndexedDB-Object-Store geöffnet und erfolgreich bearbeitet gespeichert wird
- **THEN** bleiben Teams, Tore, Zeitstempel und die exakten Uhrfelder erhalten und der Datensatz wird als Version 2 geschrieben
- **AND** die Aufstellung bleibt unbekannt und nur durch den gespeicherten Uhrenzustand belegbare Halbzeitdauern werden ergänzt
- **AND** der ursprüngliche Version-1-Datensatz bleibt einmalig als `legacyV1Backup` erhalten und wird durch spätere Speicherungen nicht ersetzt

#### Scenario: Legacy-localStorage-Matchdaten bleiben unberührt
- **WHEN** im Browser ein alter Match-Speichereintrag im localStorage vorhanden ist
- **THEN** importiert, liest oder verändert die Anwendung diesen Eintrag nicht
