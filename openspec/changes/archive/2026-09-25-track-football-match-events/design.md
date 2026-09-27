# Design

## Context

Siehe `proposal.md` für Motivation und `specs/football-match-tracking/spec.md` für das beobachtbare Verhalten. Das Projekt ist noch ein Greenfield-Projekt: Es gibt keine App, Tests oder technischen Konventionen außerhalb des OpenSpec-Grundgerüsts. Vue.js, Web-only-Betrieb und Speicherung im Browser sind Vorgaben.

## Goals / Non-Goals

**Goals:**
- Den Live-Ablauf auf eine schnelle Toraktion reduzieren und fehlende Angaben später bearbeitbar halten.
- Spieluhr, Ereigniszeit und Spielstand konsistent mit der lokalen Spielhistorie speichern.
- Die Datenstruktur so halten, dass weitere Ereignistypen später ergänzt werden können, ohne sie bereits in v1 umzusetzen.

**Non-Goals:**
- Karten, Auswechslungen oder andere Ereignistypen in v1.
- Wiederverwendbare Vereins-, Kader-, Saison- oder Spielerprofile.
- Konten, Server, geräteübergreifende Synchronisierung oder automatische Online-Backups.
- Vorgegebene Kategorien für die Entstehung eines Tores.

## Decisions

### Vue-Web-App ohne Backend

Die Oberfläche wird als Vue-Web-App umgesetzt. Spielverwaltung und Live-Erfassung laufen vollständig im Browser; es gibt keinen Anwendungsserver und keine Kontopflicht. Das passt zum lokalen, persönlichen Einsatz und vermeidet Betrieb und Synchronisierung, die für v1 nicht benötigt werden.

### Spielbezogene Daten und Freitextnamen

Ein Spiel enthält zwei manuell eingegebene Teamnamen, den Zustand der Spieluhr und eine Liste von Torereignissen. Ein Tor speichert die Teamseite, Halbzeit und Spielzeit sowie optionale Freitextfelder für Schütze, Vorlage und Beschreibung. Es gibt keine vorab gepflegten Spielerkader. Der angezeigte Spielstand wird aus den gespeicherten Toren berechnet, damit Änderungen an der Teamzuordnung die Anzeige konsistent halten.

Alternative wäre eine dauerhafte Team- und Spielerdatenbank. Sie würde wiederholte Eingaben reduzieren, verlangt aber Verwaltungsabläufe vor dem Spiel und wird für den gewünschten einfachen Start nicht benötigt.

### Sofortiges Ereignis, Details danach

Die Hauptansicht bietet eine direkte Toraktion je Team. Diese Aktion erzeugt und speichert sofort ein Toreignis mit Team und aktueller Spielzeit; ein weiteres Formular für Schütze, Vorlage oder Beschreibung darf die Speicherung nicht blockieren. Fehlende Angaben werden am Ereignis in der Spielchronik ergänzt. So bleibt die schnelle Erfassung ein eigener Schritt und optionale Details können später folgen.

### Halbzeitbezogene Spieluhr

Die Uhr speichert die aktive Halbzeit und deren verstrichene Zeit. Der Nutzer startet, pausiert und beendet die Halbzeiten manuell. Sie stoppt nicht automatisch bei 45 Minuten: In der ersten Halbzeit wird darüber hinaus `45+x` angezeigt, in der zweiten `90+x`. Normale Spielminuten werden aus Halbzeit und verstrichener Zeit abgeleitet; das Ereignis speichert eine korrigierbare Zeitbasis und nicht nur den formatierten Anzeigetext.

Für eine im Hintergrund befindliche oder neu geladene Seite wird die laufende Zeit aus gespeichertem Zeitstand und Startzeitpunkt abgeleitet, nicht durch das Aufsummieren von UI-Timer-Ticks. Dadurch bleibt die Anzeige beim Wechseln von Tabs oder nach einem Neuladen näher an der tatsächlich verstrichenen Zeit.

### Browser-lokale Persistenz

Für die kleinen, textbasierten Spieldaten wird in v1 `localStorage` als einfachste Browser-Persistenz angenommen. Änderungen an Spiel, Uhr oder Toren werden unmittelbar lokal geschrieben. Die Speicherschicht soll von der Anzeige getrennt bleiben, damit bei späterem Bedarf auf IndexedDB oder ein anderes lokales Format gewechselt werden kann.

IndexedDB wäre für große Datenmengen oder Binärdateien geeigneter, bringt für die erwartete Anzahl kurzer Spiel- und Ereignisdatensätze aber unnötige asynchrone Komplexität mit.

## Risks / Trade-offs

- **Lokale Daten sind an Browserprofil und Gerät gebunden und können durch das Löschen von Websitedaten verloren gehen** → In v1 keinen Sync versprechen; Export/Import bleibt eine mögliche spätere Erweiterung und die lokale Begrenzung muss Nutzern klar sein.
- **Freitext kann denselben Spieler unterschiedlich geschrieben enthalten** → Für v1 wird die Einfachheit ohne Kaderverwaltung akzeptiert; Autovervollständigung oder Spielerprofile bleiben spätere Optionen.
- **Browser-Tabs können pausiert werden und Timer-Ticks verlieren** → Spielzeit aus Startzeitpunkt und gespeichertem Zeitstand berechnen; aufgezeichnete Torzeiten bleiben nachträglich korrigierbar.
- **Ein Tor kann verspätet erfasst werden** → Beim Speichern den dann aktuellen Zeitstempel setzen und eine nachträgliche Korrektur ermöglichen.

## Migration Plan

Es gibt noch keine Anwendung und keine vorhandenen Nutzerdaten, daher ist für die erste Einführung keine Datenmigration oder Rückwärtskompatibilität erforderlich. Die App speichert nur neue lokale Spieldatensätze. Änderungen am lokalen Datenformat nach v1 müssen eine versionsbewusste Migration oder einen klaren Umgang mit älteren Browserdaten vorsehen.
