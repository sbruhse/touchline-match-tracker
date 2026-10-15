# Proposal

## Why

Touchline already saves match, player, and jersey data locally, but a fresh page cannot reliably open without a network connection. Match-day use needs an installable app that can restart offline and receive updates without interrupting recording or losing drafts.

## What Changes

- Add an installable web app manifest, Touchline app icons, and standalone presentation on supporting platforms while retaining ordinary browser use.
- Precache the production application and its local resources so all existing workflows can start and work offline after successful initial preparation; show an accurate offline-readiness state.
- Replace the Google Fonts import with locally distributed font files, preserving the existing typography and including their redistribution licenses.
- Offer updates explicitly, never through automatic reloads. Apply an update only from the archive with an untouched creation form and no pending local loads or saves; defer it while another screen or draft is active.
- Preserve IndexedDB, localStorage keys, record formats, historical snapshots, and the existing local commit/error semantics. PWA lifecycle and cache cleanup do not migrate or delete user data.
- Add production-build offline-start and update tests, phone/standalone checks, and hosting/installation documentation.
- Record the future direction without implementing it: several people will eventually synchronize the same match, everyone may control its clock, and unresolved conflicts may be resolved manually. This change adds no backend, accounts, outbox, synchronization metadata, conflict UI, or storage migration.

## Capabilities

### New Capabilities

- `pwa-offline-support`: Install and launch the application offline, communicate offline preparation, manage non-disruptive application updates, and keep application-cache lifecycle separate from local user data.

### Modified Capabilities

None. Existing domain requirements remain unchanged; the new capability extends application availability beyond the already-loaded-page offline scenarios.

## Impact

- `vite.config.ts`, `package.json`, and `package-lock.json`: add a Vite-7-compatible `vite-plugin-pwa` development dependency and production asset generation; retain the Vue/Vite stack.
- `index.html`, new local icons/fonts and license assets, and `src/app/styles/global.css`: installation metadata, standalone safe-area treatment, and removal of runtime font-CDN dependency.
- New app-owned PWA lifecycle model/UI composed by `src/app/ui/App.vue`; a narrowly scoped creation-draft signal through `CreateMatchForm` and `MatchArchivePage` makes archive-only update eligibility explicit.
- Colocated app/feature/page tests, production PWA browser tests included in `npm run test:e2e`, and `README.md` deployment and offline-use guidance.
- Static HTTPS hosting is sufficient. Origin and deployment base remain stable; root-path hosting is the current default. No remote data API, entity repository replacement, native wrapper, or app-store publication is introduced.
