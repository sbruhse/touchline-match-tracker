# Spec Delta

## ADDED Requirements

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
