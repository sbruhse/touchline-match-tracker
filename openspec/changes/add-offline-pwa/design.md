# Design

## Context

See `proposal.md` for motivation and `specs/pwa-offline-support/spec.md` for the availability and update contract.

- The current stack is Vue 3.5, TypeScript, and Vite 7. `vite.config.ts` has the Vue plugin but no manifest generation or service worker. `index.html` has a theme color but no installation icons or manifest.
- `src/app/ui/App.vue` initializes the three entity stores and implements in-memory screen selection. A fresh mount opens the archive; retaining the last selected screen is not an existing guarantee.
- Matches use IndexedDB database `touchline`, schema version 1, object store `matches`, with record formats 1–4 supported. Players use `touchline.player-store` format 3 with older readers; jerseys use `touchline.jersey-set-store` format 1. PWA work must not change any of these formats or repositories.
- All three stores expose public loading/saving state. `matchStore.persist()` publishes a snapshot only after the local transaction succeeds. The clock derives elapsed time from persisted timestamps, so offline recovery does not require an always-running background timer.
- `src/app/styles/global.css` imports DM Sans, DM Mono, and Space Grotesk from Google Fonts. Match icons are already local SVG components.
- Preparation has a dirty-state/navigation guard in `usePreparationFlow`. Goal details can retain closed drafts within an open match. Player, jersey, and creation drafts are owned by their existing features; there is no universal dirty-draft registry.
- `src/app/ui/App.e2e.test.mjs` runs Selenium against a Vite development server. Its offline checks replace `navigator.onLine`, `fetch`, and `XMLHttpRequest` on an already-loaded page. Those checks remain useful for local persistence but do not verify a production service worker or cold offline start.

## Goals / Non-Goals

**Goals:**

- Add offline delivery around the current local application without changing domain save paths.
- Keep PWA registration, readiness, and explicit reload decisions app-owned and independently testable.
- Use a conservative reload boundary that does not require inspecting or migrating every feature's drafts.
- Verify production caching separately from the existing development-server browser flows.

**Non-Goals:**

- Persisting session-only drafts, reopening the last screen automatically, or providing reliable background execution.
- Unifying localStorage and IndexedDB, adding a generic draft registry, or changing cross-tab domain-write support.
- Implementing the future backend, accounts, team membership, operation logs, outboxes, clock arbitration, or conflict resolution. The future direction is recorded below, not specified as behavior delivered by this change.

## Decisions

### 1. Generate the worker with Vite PWA; retain manual app-owned registration

Add a released `vite-plugin-pwa` version compatible with Vite 7 and the project's supported Node runtime. Use `generateSW`, prompt-style updates, no unconditional `skipWaiting`, no automatic client claiming, and no injected duplicate registration script. Leave service-worker delivery disabled in normal development and unit tests.

Use a small native Service Worker API adapter rather than an automatic-reload registration helper. The adapter registers once per app mount, observes initial activation, `updatefound`, worker state changes, and an already-waiting worker. It detaches its window/registration listeners on disposal without unregistering a healthy worker.

**Why:** generated precaching avoids hand-maintaining worker routes, while native lifecycle handling lets the application control exactly which tab may reload. Activating a worker must never be treated as unconditional permission to reload all open clients.

**Alternatives:** a hand-written `injectManifest` worker adds unnecessary worker code; `autoUpdate` violates the safety contract; a registration helper that reloads on every controller change is unsuitable unless its reload behavior is fully disabled.

### 2. Keep metadata and resources consistent with the Vite base

Derive the manifest's stable `id`, `start_url`, and `scope`, the worker URL/scope, navigation fallback, and icon URLs from the configured Vite base. The existing `/` base remains the default; verify a non-root build without choosing a hosting provider. Use the existing Touchline identity, English UI language, standalone display, and colors consistent with the current page background.

Provide regular 192px/512px icons, a separate maskable icon with appropriate safe-zone artwork, an Apple touch icon, and an editable local source based on the existing brand mark. Reference installation assets in `index.html` using base-aware URLs. Do not add an always-visible custom installation button; platform installation instructions belong in the README.

Enable Vite's build manifest at a public generated output path such as `pwa-assets.json`. Its bundle/CSS/asset references, together with the explicitly declared public installation assets, form a small resource inventory for readiness checks and production assertions. Include the inventory itself in precaching. Keep deployment-wide constants in app-owned configuration rather than duplicating path conventions in UI code.

**Why:** neither `/sw.js` hardcoding nor an unscoped start address works for subdirectory hosting. A generated resource inventory allows readiness checks to verify the actual current build instead of accepting an arbitrary cache as proof.

**Alternative:** hardcoded root paths are simpler but fail the deployment-base contract. A custom asset-inventory generator is unnecessary while Vite's build manifest covers emitted application assets.

### 3. Precache the complete application; keep caches separate from user stores

Include the emitted HTML, JavaScript, CSS, font files, installation icons, resource inventory, web manifest, and relevant license files in the generated precache. Check the build report for excluded required assets, including size-limit warnings. Do not add remote runtime-cache rules, API caching, or source maps to the offline shell.

Use an application-specific cache namespace that includes the deployment base. Configure navigation fallback to that base's entry HTML and restrict it to the application scope. Generated revision handling stages new assets before activation. Cleanup targets only application-owned caches; the PWA adapter never calls entity repository save methods or clears IndexedDB/localStorage.

Readiness requires successful initial activation and verification of the current release's required resource inventory in its application cache. Read the worker-served inventory and match its referenced resources in the app-scoped cache, accounting for revisioned cache keys; do not infer readiness from `navigator.onLine`, a persisted success flag, or merely having a registration. A previously healthy cache remains the basis for readiness while a new worker is installing.

If caches were evicted but an old registration survives, report preparation as incomplete. Offer an explicit, safe archive-only retry: release only this application's unusable registration and reload online to perform a fresh installation. Do not unregister a healthy release merely because its update failed. This recovery uses the same reload guard as updates and never removes domain data.

**Why:** application files and user records have different lifetimes. Cache verification catches incomplete preparation and cache-only deletion without promising that a browser will retain files forever.

**Alternatives:** network-first document loading weakens match-day availability; using the worker as a data repository conflates offline delivery with future synchronization; checking only for an active worker can falsely report readiness after eviction.

### 4. Self-host fonts and preserve the existing interface

Add licensed WOFF2 assets under `src/app/assets/fonts/` so Vite emits versioned font URLs. Preserve DM Sans and Space Grotesk weights 400–700 and DM Mono weights 400/500, using variable files where available. Include suitable Latin/Latin-extended coverage and retain system-font fallbacks and `font-display: swap`. Record font origins and redistribution licenses locally.

Replace only the external import in `global.css` with local font-face declarations; do not redesign screens or replace existing local SVG icons. Add `viewport-fit=cover` where needed and audit existing safe-area padding before changing app/header offsets, avoiding duplicate bottom insets already handled by action bars and editors.

**Why:** local fonts preserve current typography without CDN dependence or cross-origin cache complexity.

**Alternatives:** system fonts would change the established appearance; caching Google Fonts leaves external requests and adds separate stylesheet/font-origin policies.

### 5. Separate the lifecycle model from status presentation

Suggested app-owned modules are `src/app/model/usePwa.ts`, small resource/cache helpers under `src/app/lib/`, app configuration under `src/app/config/`, and `src/app/ui/PwaStatus.vue`, with colocated tests. `App.vue` remains the composition and eligibility boundary; no lower layer imports the app's PWA model.

The model exposes distinct preparation, update-available, applying, deferred, unsupported, and error information plus explicit retry/update actions. PWA errors do not overwrite entity-store errors or prevent locally available actions. UI strings follow the existing English interface, for example “Ready to open offline”, “Update available”, and “Finish or clear the match form before updating”.

The status component receives state and eligibility through typed props and emits update, defer, or retry intent. Render actionable PWA UI on the archive in normal document flow, not as a fixed overlay or unsolicited modal. Register and observe updates even while another screen is active; returning to the archive can reveal a pending update without initiating navigation. Use polite announcements and existing button/focus conventions.

**Why:** keeping worker state out of entities preserves the local-first repositories as the later backend seam. Archive-only UI avoids competition with persistent live recording controls and editor focus.

**Alternative:** a global floating update banner would need additional overlay, focus, and draft-safety coordination throughout the current phone workflows.

### 6. Guard each requested reload, including activation races

`CreateMatchForm` emits a typed boolean draft signal whenever either raw team input is nonempty, including whitespace. `MatchArchivePage` forwards it through its public page contract. The app resets this signal with the archive/form lifetime; clearing both fields restores eligibility. This does not expose the form's private inputs or introduce shared draft storage.

The update gate requires the archive to be the active screen, no selected match/preparation or player-statistics detail, empty creation inputs, and no loading or saving in any of the three public entity stores. Recheck it at the user request and immediately before reload. An ineligible request is not queued to run when the gate later opens.

For a waiting worker, an eligible explicit action requests activation using the generated worker's supported skip-waiting message. Only the requesting instance carries reload intent, and only while its gate remains safe. If input, navigation, or a write begins before controller change, cancel that intent and keep the page; a subsequent safe action is required. If another tab activated the release, retain an “updated release available to reload” state even though no waiting worker remains, without automatically reloading this instance.

Initial activation and worker activation after all old clients close are normal browser lifecycle events, not reasons to reload an open page. A later normal launch can naturally use the newest prepared release. Existing match-clock persistence continues to determine elapsed time across any permitted restart.

**Why:** a consent click is not permission to discard work that appeared afterward. Explicit per-instance intent also protects retained goal drafts in another tab without claiming that concurrent same-match writes are supported.

**Alternative:** passing a dirty signal through every existing feature would broaden the change significantly; archive-only eligibility needs just the currently mounted creation form plus existing public persistence state.

### 7. Verify the production worker with isolated browser fixtures

Keep the current development-server Selenium flows. Add a separate colocated production PWA flow, for example `src/app/ui/App.pwa.e2e.test.mjs`, and include both in `npm run test:e2e`. Reuse the existing Selenium/browser approach rather than introducing a second automation framework.

Build production fixtures into isolated temporary directories and serve them from one fixed origin/base per test profile. For version A/B update tests, a test-only Vite wrapper can add a release marker to generated HTML without editing application sources. Swap the served fixture while preserving the origin and profile; reject a required changed asset in the failed-update case.

- Disable ordinary browser HTTP caching for offline tests, wait for actual worker/cache readiness, close the application context, stop the fixture server or deny network access, and open a fresh application context using the same profile. Do not substitute the existing `navigator.onLine` mock for this test.
- Cover offline match continuation, clock controls, goals/details, substitutions/corrections, player profiles, inventory/preferences, preparation/jersey allocation, and derived statistics, followed by another offline reload.
- Seed supported existing records and raw localStorage payloads. Compare them before and after readiness, activation, and application-cache cleanup without performing domain writes in that comparison.
- Verify initial-install failure and later retry, successful A-to-B update, failed B preparation with A still launchable offline, dirty/pending-save gates, the activation race, and another tab's activation without a reload.
- Check manifest/icon/resource output and base-path scope in root and subdirectory builds. Confirm application requests do not use font-CDN origins.
- Check status layout at 320px/390px, enlarged text, short landscape, and desktop. Perform actual Android/Chromium and iOS/Safari installation, standalone safe-area, and software-keyboard checks; emulation is not evidence that a native install prompt works.

Unit tests mock native worker/cache lifecycle boundaries; app/feature/page integration tests cover the typed draft signal and all eligibility states. Keep existing repository tests unchanged except where a regression fixture is genuinely needed.

### 8. Preserve the future collaboration direction without premature implementation

The exploration confirmed that the future backend will synchronize multiple people recording the same match, all participants may start/stop its clock, and manual resolution of genuine conflicts is acceptable. Offline devices can temporarily disagree; connectivity is required to learn other people's changes.

A future design should keep successful local persistence independent of upload success, identify changes and authors, retry transfers idempotently, avoid blind whole-match last-write-wins, and preserve conflicting inputs. Clock actions and substitution history need domain-aware reconciliation rather than assuming every concurrent change commutes. These are follow-up design constraints, not a selected synchronization protocol or new fields in this release.

The current `MatchRepository`, `PlayerRepository`, and `JerseySetRepository` stay local. Any eventual outbox/storage-transaction changes and account/collaboration contracts require a separate change; the PWA worker remains application-delivery infrastructure rather than the future data-sync engine.

## Risks / Trade-offs

- [Cache or site-data eviction] -> Verify preparation, distinguish cache-only loss from domain-storage failure, document re-preparation and data-loss limitations, and never promise backup or permanent retention.
- [Archive-only updates require an extra step] -> Keep the update available when the user returns normally; explain the safety gate and never navigate there automatically.
- [Worker activation can race with new work or come from another tab] -> Own reload intent per instance, recheck the gate, test both paths, and retain the loaded page when intent becomes unsafe.
- [Older open pages may reference older hashed assets] -> Keep all current UI imports eager as they are today, do not introduce lazy loading here, retain previous hashed assets during hosting rollout, and verify open-page safety during A/B activation.
- [Incomplete or non-atomic deployment] -> Publish complete assets before exposing the new HTML/worker, surface preparation failure, and retain the healthy active precache until a complete release is ready.
- [Readiness checks depend on generated asset/cache conventions] -> Isolate resource matching in a tested helper, include the resource inventory in build assertions, and pin dependency behavior through the lockfile.
- [Desktop automation cannot verify mobile installation and keyboards] -> Record actual device results separately; state any unavailable device checks as outstanding rather than treating emulation as completion.
- [Installing from a different origin/profile/platform storage context appears empty] -> Explain that installation does not migrate data and validate storage access on target platforms; do not claim universal browser-tab/PWA storage sharing.

## Migration Plan

1. Add production PWA configuration, local resources, app lifecycle/UI, tests, and documentation without changing entity storage contracts.
2. Run unit/integration tests, production build, existing browser flows, and new production-worker flows. Complete or explicitly record outstanding physical-device checks before claiming platform verification.
3. Deploy the complete build on static HTTPS hosting. Keep the origin/base stable; serve correct manifest/worker/font MIME types, revalidate HTML and `sw.js`, and use immutable caching only for content-hashed assets. Retain previous hashed assets for older open pages.
4. Existing users prepare the worker on an online visit; only successful preparation earns the offline-ready status. Installation remains optional for browser offline use. Subsequent releases follow the guarded update path.
5. Prefer a forward fix or redeploy a known-good PWA-enabled build with unchanged storage codecs. Simply removing the worker file does not uninstall workers already present. If PWA support must be withdrawn, plan an explicit same-scope retirement release; never instruct users to clear all site data as an update remedy. No data downgrade or migration is part of this rollout.
