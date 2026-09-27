# Proposal

## Why

Während eines Fußballspiels ist es schwierig, Tore samt Spielminute, Schütze, Vorlage und Entstehung zuverlässig festzuhalten, besonders wenn die Eingabe sofort vollständig sein muss. Eine lokale Web-App soll Tore schnell sichern und fehlende Angaben später ergänzbar machen, ohne ein Konto oder einen Server vorauszusetzen.

## What Changes

- Eine Vue-basierte Web-App zur Live-Erfassung von Toren in Fußballspielen.
- Eine Spieluhr für zwei Halbzeiten zu je 45 Minuten, einschließlich Nachspielzeit im Format `45+x` und `90+x`.
- Sofortiges Speichern von Torereignissen mit Team und Spielzeit; Schütze, Vorlage und eine Beschreibung in Freitext können zunächst leer bleiben und später ergänzt werden.
- Lokales Speichern abgeschlossener Spiele, damit sie später wieder geöffnet und bearbeitet werden können.
- Der Umfang der ersten Version bleibt auf Tore beschränkt; weitere Ereignistypen sind nicht Teil dieses Changes.

## Capabilities

### New Capabilities
- `football-match-tracking`: Lokale Spiele verwalten und Tore während des Spiels erfassen, vervollständigen und später wieder öffnen.

### Modified Capabilities
- Keine.

## Impact

- Implementiert als Vue-3-Web-App mit lokaler, versionsbasierter Browser-Speicherung; Backend, Konto und geräteübergreifender Sync sind nicht enthalten.
- Der v1-Umfang bleibt auf Tore beschränkt.

## Verifikation

- `npm test`: erfolgreich, 11 Unit- und Komponententests.
- `npm run test:e2e`: erfolgreich, vollständiger Firefox-Browserablauf bei 500 px schmaler Viewportbreite.
- `npm run build`: erfolgreich, TypeScript-Prüfung und Vite-Produktionsbuild.
