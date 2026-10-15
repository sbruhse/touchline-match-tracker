# Spec Delta

## MODIFIED Requirements

### Requirement: Erweiterte und bisherige Spieldaten kompatibel öffnen
Die Anwendung SHALL gespeicherte Kader, Startaufstellung, eigene Teamseite, Wechselereignisse, Halbzeitdauern, angenommene Trikotverteilungen und den ersten Anpfiffzeitpunkt zusammen mit den bisherigen Spieldaten wiederherstellen. Bisherige IndexedDB-Spieldatensätze ohne Spielererfassung SHALL weiterhin mit unveränderten Teams, Toren, Spielstand und Spieluhr nutzbar sein. Fehlende historische Aufstellungen, Trikotverteilungen, Anpfiffzeitpunkte oder Halbzeitdauern SHALL als unbekannt behandelt und nicht erfunden werden. Vorhandene Datensätze ohne Versionsfeld SHALL als Version 1 gelesen werden. Datensätze der Versionen 1 und 2 SHALL ohne Schreibzugriff im Speicher normalisiert werden; beim nächsten erfolgreichen Speichern SHALL der jeweilige Datensatz als Version 3 geschrieben werden. Beim Upgrade eines Version-1-Datensatzes SHALL sein ursprünglicher Inhalt einmalig im selben IndexedDB-Datensatz unter `legacyV1Backup` erhalten bleiben; bereits vorhandene Backups aus Version 2 oder 3 SHALL unverändert erhalten bleiben. Die IndexedDB-Datenbankschemaversion und der Object Store SHALL unverändert bleiben. Alte Matchdaten im localStorage SHALL weder importiert noch gelesen oder verändert werden.

#### Scenario: Bestehendes Spiel ohne Spielererfassung öffnen
- **WHEN** ein Spiel aus dem bisherigen Speicherformat geöffnet und ein Tor bearbeitet wird
- **THEN** bleiben seine bisherigen Daten erhalten und die Torbearbeitung funktioniert weiterhin
- **AND** es werden keine Spieleraufstellungen oder Einsatzstatistiken aus Namen in Torereignissen abgeleitet

#### Scenario: Erweitertes Spiel wiederherstellen
- **WHEN** ein Spiel mit gespeicherter Spielererfassung und angenommener Trikotverteilung erneut geöffnet wird
- **THEN** werden Kader, Startaufstellung, eigene Teamseite, Wechselhistorie, erfasste Halbzeitdauern, Trikot-Snapshots und erster Anpfiffzeitpunkt zusammen mit Toren und Spieluhr wiederhergestellt

#### Scenario: Vorhandenen IndexedDB-Datensatz beim Speichern migrieren
- **WHEN** ein Version-1-Spiel aus dem bestehenden IndexedDB-Object-Store geöffnet und erfolgreich bearbeitet gespeichert wird
- **THEN** bleiben Teams, Tore, Zeitstempel und die exakten Uhrfelder erhalten und der Datensatz wird als Version 3 geschrieben
- **AND** die Aufstellung, Trikotverteilung und der erste Anpfiffzeitpunkt bleiben unbekannt und nur durch den gespeicherten Uhrenzustand belegbare Halbzeitdauern werden ergänzt
- **AND** der ursprüngliche Version-1-Datensatz bleibt einmalig als `legacyV1Backup` erhalten und wird durch spätere Speicherungen nicht ersetzt

#### Scenario: Legacy-localStorage-Matchdaten bleiben unberührt
- **WHEN** im Browser ein alter Match-Speichereintrag im localStorage vorhanden ist
- **THEN** importiert, liest oder verändert die Anwendung diesen Eintrag nicht

#### Scenario: Version 2 ohne erfundene Trikothistorie öffnen
- **WHEN** ein Version-2-Spiel geladen wird
- **THEN** bleiben Spielererfassung, Wechsel, Tore und Halbzeitdauern erhalten und fehlende Trikotverteilung sowie erster Anpfiffzeitpunkt gelten als unbekannt
- **AND** das Laden schreibt den Datensatz nicht um
- **AND** beim nächsten erfolgreichen Speichern als Version 3 bleibt ein vorhandenes `legacyV1Backup` unverändert erhalten

#### Scenario: Gemischte Versionen und fehlgeschlagenes Upgrade
- **WHEN** Version-1-, Version-2- und Version-3-Datensätze nebeneinander gespeichert sind und das Upgrade eines einzelnen Spiels fehlschlägt
- **THEN** bleiben alle bisherigen Datensätze und der veröffentlichte Spielzustand erhalten
- **AND** ein erneuter erfolgreicher Versuch aktualisiert nur dieses Spiel einschließlich seiner vollständigen Trikotverteilung

#### Scenario: Ungültige aktuelle Datensätze ablehnen
- **WHEN** ein Version-3-Datensatz Pflichtfelder für Trikotverteilung oder ersten Anpfiffzeitpunkt vermissen lässt, ungültige Trikot-Snapshots oder doppelte vergebene Nummern enthält, oder eine unbekannte Datensatzversion vorliegt
- **THEN** meldet die Anwendung einen wiederholbaren Ladefehler und ersetzt oder überschreibt den Datensatz nicht
- **AND** eine explizit leere Trikotverteilung oder ein unbekannter erster Anpfiffzeitpunkt bleiben zulässige Werte

#### Scenario: Versionskompatibilität dokumentieren
- **WHEN** der Nutzer die Dokumentation zur lokalen Speicherung liest
- **THEN** erklärt sie das schreibfreie Laden alter Versionen, das Upgrade beim erfolgreichen Speichern und die erhaltenen Version-1-Backups
- **AND** sie erklärt, dass ältere Anwendungsversionen Version-3-Datensätze nicht lesen können und keine automatische Rückkonvertierung erfolgt

## ADDED Requirements

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
