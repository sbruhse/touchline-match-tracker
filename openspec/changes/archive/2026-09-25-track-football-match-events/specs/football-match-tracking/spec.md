# Spec Delta

## Purpose

Ermöglicht, Fußballspiele lokal im Browser zu verwalten und während des Spiels Tore schnell festzuhalten. Ein Tor kann zunächst unvollständig bleiben und später mit Namen und einer Beschreibung ergänzt werden.

## ADDED Requirements

### Requirement: Spiele lokal verwalten und wieder öffnen
Die Anwendung SHALL dem Nutzer ermöglichen, ein Spiel mit zwei manuell eingegebenen Teamnamen anzulegen und es im Browser lokal zu speichern. Gespeicherte Spiele SHALL später in derselben Browser-Umgebung wieder geöffnet und bearbeitet werden können.

#### Scenario: Neues Spiel anlegen
- **WHEN** der Nutzer ein neues Spiel mit den Namen beider Teams anlegt
- **THEN** wird ein lokales Spiel für die Live-Erfassung bereitgestellt

#### Scenario: Gespeichertes Spiel wieder öffnen
- **WHEN** der Nutzer ein zuvor gespeichertes Spiel aus der lokalen Spielübersicht auswählt
- **THEN** werden dessen Teams, Tore, Spielstand und Spieluhrzustand wiederhergestellt

#### Scenario: Spiel bleibt nach Neuladen erhalten
- **WHEN** die Seite nach dem Speichern eines Spiels oder einer Änderung neu geladen wird
- **THEN** bleiben die gespeicherten Spieldaten im selben Browser verfügbar

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
Die Anwendung SHALL ein Tor mit dem ausgewählten Team und der aktuellen Spielzeit sofort als lokales Ereignis speichern und den Spielstand daraus aktualisieren. Ein gespeichertes Tor SHALL unvollständig sein dürfen; Schütze, Vorlage und Beschreibung sind für das erstmalige Speichern nicht erforderlich.

#### Scenario: Tor während laufender Spieluhr erfassen
- **WHEN** der Nutzer ein Tor für eines der beiden Teams erfasst
- **THEN** wird ein Toreignis mit diesem Team und der aktuellen Spielzeit gespeichert und der Spielstand des Teams um eins erhöht

#### Scenario: Tor ohne weitere Details sichern
- **WHEN** der Nutzer ein Tor erfasst, ohne Schütze, Vorlage oder Beschreibung anzugeben
- **THEN** wird das Toreignis trotzdem gespeichert und bleibt als unvollständig ergänzbar

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
