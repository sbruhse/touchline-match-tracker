# Tasks

## 1. Establish the match entity boundary

- [x] 1.1 Move match types/factories, clock calculations, and goal construction from `src/domain/` into `src/entities/match/model/`, and move persistence from `src/data/` into `src/entities/match/api/`; verify the localStorage key, version, record fields, and pure-function behavior are unchanged by reviewing the moved implementations.
- [x] 1.2 Create the entity's public `index.ts`, update current application/editor consumers to import through it, and move clock/storage tests beside their subjects using direct internal imports; verify those test suites pass and no application import targets the removed domain/data locations.
- [x] 1.3 Add the literal version-1 saved-record compatibility regression to the current app integration suite, covering reopen, restored score/clock/goals, goal editing, and the resulting persisted record; verify it passes without generating the starting fixture through the refactored factory.
- [x] 1.4 Document match entity ownership and the public-import convention in the README architecture section; verify the documented paths and exports match the delivered entity slice.

## 2. Extract shared entity state and independent user-action features

- [x] 2.1 Implement the entity-owned app-scoped match store with read-only reactive data, load and persist/refresh methods, typed provide/use helpers, and one instance per app mount; wire current App initialization to it and verify existing create/reopen and independently mounted reload tests still pass.
- [x] 2.2 Extract `features/create-match` with its form state, create/save action, and created-ID event; verify its `index.ts` API is used by the current composition and the existing create/archive/reopen integration scenario passes.
- [x] 2.3 Extract `features/control-match-clock` and entity `useMatchTime`, preserving timestamp-based calculations, action-time sampling, and interval teardown; verify existing paused/running reload and half-time/second-half/full-time integration scenarios pass and the old root interval is removed.
- [x] 2.4 Extract `features/record-goal` with immediate persistence and `features/edit-goal` with draft validation and persistence orchestration; verify the existing goal recording/edit/reload scenarios and legacy-record regression pass, and inspect both features for imports only from their own files or the match entity public API.
- [x] 2.5 Move feature-specific styles alongside extracted feature UI, splitting shared selector groups as needed while preserving class names and breakpoints; verify goal forms and action controls retain their appearance and accessibility in the running application.
- [x] 2.6 Extend the README architecture section with the four feature responsibilities and per-app entity state ownership; verify it describes actual APIs and confirm current App no longer orchestrates match/clock/goal mutations.

## 3. Compose pages and relocate the app shell and browser test

- [x] 3.1 Extract `pages/match-archive` and `pages/match-detail` with public `index.ts` APIs, reactive entity reads, feature composition, and navigation events; verify the archive opens/creates matches and the detail screen returns to it without any sibling-page or sibling-feature imports.
- [x] 3.2 Move the reduced shell to `src/app/ui/App.vue`, bootstrap to `src/app/main.ts`, and root integration tests beside the shell; update `index.html` and internal imports, then verify `npm test` and `npm run build` pass with the relocated entry and all existing plus compatibility scenarios discovered.
- [x] 3.3 Place global foundations in `src/app/styles/global.css` and shell/page styling with its owning UI; remove the superseded root stylesheet only after migrating its rules, and verify archive/detail views at desktop and narrow widths preserve layout, typography, controls, and goal timeline appearance.
- [x] 3.4 Move the Selenium flow to `src/app/ui/App.e2e.test.mjs` and update `test:e2e` to its new path; verify `npm run test:e2e` executes the existing full flow in Firefox and Vitest discovery remains limited to its intended `.spec.ts` files.
- [x] 3.5 Remove fully migrated legacy application files/directories after searching for remaining references, and update README with the final source tree, test locations, and commands; verify every documented source path exists and no obsolete source path remains referenced by entry points, scripts, imports, or documentation.

## 4. Verify integrated architecture compliance

- [x] 4.1 Audit the completed source against each rule in `AGENTS.md`, including segments, responsibility ownership, test colocation, public entry points, type/re-export imports, downward dependencies, and sibling-slice isolation; record the audit outcome and any corrections in the implementation summary.
- [x] 4.2 Complete the final `npm test`, `npm run build`, and `npm run test:e2e` checks after all edits, reusing already successful final-state runs where applicable; record results and confirm the legacy-data regression and all existing match-tracking flows remain covered.
- [x] 4.3 Complete desktop and narrow-viewport integration review of create/open/navigation, running and paused clocks, goal recording/editing, score updates, and persistence after reload; record the observed outcome against the design's acceptance criteria and confirm no product requirement or storage schema was changed.
