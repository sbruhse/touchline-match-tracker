# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
