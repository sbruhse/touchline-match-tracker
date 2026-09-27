# Design

## Context

See `proposal.md` for motivation. The inspected implementation uses Vue 3 Composition API, TypeScript, Vite, Vitest, and Selenium with Firefox. `src/App.vue` currently owns the archive and detail screens, selected match ID, loaded matches, form state, a one-second timer, and all persistence-triggering actions. `GoalEventEditor.vue` already encapsulates draft editing and validation but delegates persistence to the root.

The pure functions in `src/domain/` have no UI or storage dependencies. `src/data/matchStorage.ts` persists the full match collection in localStorage under `touchline.match-store`, version `1`. Clock, goal, and match types are interdependent parts of this record. These are useful existing boundaries to retain within an entity slice.

Existing coverage comprises five root-component integration tests, four clock tests, two storage tests, and a full browser flow in `e2e/match-flow.test.mjs`. Vitest includes `src/**/*.spec.ts`; the browser script invokes `node --test e2e/*.test.mjs`. `index.html` points directly to `/src/main.ts`. The existing `football-match-tracking` spec defines behavior that this refactor must preserve, and no conflict with the architecture policy was found.

## Goals / Non-Goals

**Goals:**
- Make file ownership, dependency direction, and slice entry points inspectably compliant with `AGENTS.md`.
- Give each mounted application an isolated, reactive match data source shared by its pages and features.
- Preserve DOM semantics, responsive appearance, interaction order, clock calculations, and version-1 saved records through extraction.
- Retain existing behavioral coverage while relocating tests to the code they exercise.

**Non-Goals:**
- Product feature changes, a visual redesign, routing URLs, a new state-management library, or changes to storage validation/error behavior.
- A storage schema migration, backend integration, or new tooling dependencies solely for this refactor.
- Empty layers, speculative reusable widgets, or unrelated configuration cleanup.

## Decisions

### 1. Use four currently needed layers with explicit slice ownership

Target structure (tests and additional local UI files are shown where relevant; add segments only when they contain code):

```text
src/
  app/
    main.ts
    ui/
      App.vue
      App.spec.ts
      App.e2e.test.mjs
    styles/
      global.css
  pages/
    match-archive/
      index.ts
      ui/MatchArchivePage.vue
    match-detail/
      index.ts
      ui/MatchDetailPage.vue
  features/
    create-match/
      index.ts
      ui/CreateMatchForm.vue
      model/
    control-match-clock/
      index.ts
      ui/MatchClockControls.vue
      model/
    record-goal/
      index.ts
      ui/RecordGoalButton.vue
      model/
    edit-goal/
      index.ts
      ui/GoalEventEditor.vue
      model/
  entities/
    match/
      index.ts
      model/
        match.ts
        clock.ts
        clock.spec.ts
        goals.ts
        matchStore.ts
        useMatchTime.ts
      api/
        matchStorage.ts
        matchStorage.spec.ts
```

`app` is the composition root with initialization, shell, and navigation state. The archive page owns welcome/archive layout and composes the creation feature. The detail page owns scoreboard, clock display, timeline, and composition of clock/goal features. Small page-local display components may live in the same page's `ui` segment.

All match-specific pure logic, types, data access, and reactive record state belong to `entities/match`. Clock transitions and goal construction remain pure entity operations; invoking them in response to a user action and saving the result belongs to a feature. This distinction avoids moving business actions back into pages under new filenames.

Alternative considered: create separate match, goal, and clock entity slices. Their existing type and computation dependencies would require same-layer imports, so a cohesive match entity is preferable. Widgets and shared are omitted until there is actual reuse that calls for them; all-layer scaffolding adds no benefit here.

### 2. Enforce boundaries through narrow public APIs and composition

Every page, feature, and entity slice exposes its supported external exports through `index.ts`. Cross-slice imports resolve to that entry point; relative paths are sufficient and do not require a new alias. Internal files use direct relative imports, including tests for the same slice, rather than importing their own barrel.

The resulting dependency graph is `app → pages → features → entities`, with higher layers permitted to import any lower layer directly. Pages must not import sibling pages, features must not import sibling features, and entities must not import features, pages, or app. Runtime imports, type imports, re-exports, and Vue component imports all follow these rules. Entity indexes expose the needed types, calculations, and data-state API, not unrelated implementation details.

App chooses the current page using its selected match ID. The archive page emits an open-match event, forwarding the create feature's created ID when appropriate; the detail page emits a return-to-archive event. App handles these navigation events only. Pages compose independent features rather than having one feature call another.

Alternative considered: leave compatibility barrels in `src/domain`, `src/data`, and `src/components`. They would retain the obsolete architecture and allow new code to bypass ownership, so migrated consumers use the new slice APIs directly and obsolete files are removed only after checking for remaining references.

### 3. Share match data through an entity-owned, app-scoped store

Implement a small Vue composable/store factory in `entities/match/model/matchStore.ts`, using existing Vue primitives. A store instance owns a reactive match collection, a load operation, and a persist-and-refresh operation backed by the existing storage adapter. Consumers receive read-only reactive state and explicit methods; the storage adapter remains usable with the current injected `KeyValueStorage` test double.

The entity slice owns the typed injection key and public provide/use helpers. `App.vue` creates and provides one instance per mount and loads saved matches during initialization. Pages read the collection and derive their selected match from the ID prop. Features obtain the provided store, compute an updated record using entity functions, assign `updatedAt`, and persist through the store method. Creation persists and emits the new ID after success. Editing continues to maintain local draft state and validation while its feature also owns the final persistence action.

This places shared match data below its consumers without forcing a feature-to-feature import or making the app shell execute mutations. A new store instance per app mount also prevents state leakage between existing integration tests. Alternative considered: a module-level singleton, which is shorter but shares mutable state across mounts; or Pinia, which adds a dependency unnecessary for this application size.

The match detail screen uses entity-owned `useMatchTime` for reactive current time and releases its interval on unmount. Persisted elapsed time continues to be computed from timestamps, never from counting interval ticks. Features sample `Date.now()` when performing actions so goal timestamps and clock transitions are not based on a stale display tick. Returning from the archive samples current time again.

### 4. Keep styles with their owners while preserving the cascade

Move font imports, reset rules, global tokens, and genuinely app-wide element defaults to `app/styles/global.css`. Keep shell styling with the app UI, page layout styling with the appropriate page UI, and feature-specific selectors with feature UI. Goal editing retains its existing scoped styles. Preserve existing classes, test IDs, accessible labels, mobile breakpoints, and DOM order where practical.

Cross-cutting selector groups in `src/style.css` currently style multiple owners. Split those groups carefully; narrowly scoped duplicate declarations are acceptable when necessary to retain appearance without introducing dependencies on higher-layer styles. Generic shared UI should only be extracted if an actual reusable component is needed during this scoped migration.

Alternative considered: move the entire stylesheet unchanged into app. That minimizes visual risk but retains centralized ownership of feature/page styles, so use visual review to support the more complete extraction.

### 5. Colocate tests, retain behavioral coverage, and verify compatibility

Move `App.spec.ts` beside the new app shell, and move storage and clock tests with their corresponding entity files. The root integration tests remain valuable because they exercise assembled user workflows. Move the whole-app Selenium test to `app/ui/App.e2e.test.mjs`, treating the app shell as its subject; update `test:e2e` to target that file. Preserve its root-working-directory Vite launch and Firefox setup. Its `.test.mjs` suffix keeps it separate from Vitest's `src/**/*.spec.ts` discovery.

Add a focused regression case using a literal pre-refactor version-1 saved record rather than constructing the fixture with the newly moved factory. Reopen it through the app, verify teams/goals/score/clock restoration, edit a goal, and verify saved fields and metadata retain the same storage contract. Existing tests cover current creation, pause/resume, half transitions, and goal editing; avoid duplicating them simply because files move.

Record a final import/layout audit against all architecture rules alongside `npm test`, `npm run build`, and `npm run test:e2e` results. Review archive/detail appearance at desktop and the existing narrow browser viewport, including controls, goal forms, and timeline layout. Behavioral tests alone cannot establish FSD compliance.

Alternative considered: leave the browser test at root and add an E2E exception to `AGENTS.md`. Moving it avoids changing the user's policy. This is a conservative interpretation of the existing colocation requirement and does not alter how users invoke the test suite.

## Risks / Trade-offs

- [Component extraction changes reactivity or persistence ordering] → Use one app-scoped entity store, refresh only after successful writes, and retain full-app behavioral tests.
- [A displayed match or goal draft becomes stale after replacing stored records] → Derive selected records reactively from the shared collection and preserve the editor's prop watcher.
- [Timers leak or running clocks reset during navigation] → Colocate interval setup/teardown in the time composable and retain timestamp-derived elapsed time plus reload tests.
- [Style splitting changes the cascade or mobile layout] → Preserve selectors and breakpoints, then inspect both screens at narrow and desktop widths.
- [A storage refactor accidentally changes existing record compatibility] → Keep the key/version/schema stable and exercise a literal legacy fixture through a read-edit-save cycle.
- [Files move but business actions remain in App/pages] → Audit function ownership and import targets, not only directory names.

## Migration Plan

1. Establish the match entity slice and its public API, moving pure code, persistence, and colocated tests without changing their semantics.
2. Introduce the per-app entity store and match-time composable; extract independent feature UI/action logic against those APIs.
3. Extract the two page slices, compose features there, and reduce the app shell to initialization and page navigation.
4. Switch the Vite HTML entry to `/src/app/main.ts`, move/split styles and integration/browser tests, update the browser-test script, and remove fully migrated legacy source locations.
5. Update README with the actual layer/slice layout and test locations, then complete the structural audit, compatibility regression, required test/build commands, and visual review.

Deploy as one coherent refactor; no stored-data conversion is required. If regression demands rollback, redeploy the previous application build. Since both versions read and write the same version-1 record format, saved user matches remain usable across rollback.

## Acceptance Criteria

- Application source is organized under the four needed layers, with appropriately owned UI/model/API/style segments and no leftover application modules in the legacy root, `components`, `domain`, or `data` locations.
- Each page, feature, and entity slice has a public `index.ts`; all cross-slice references target public APIs, dependencies flow downward, and sibling slices have no imports between them.
- App owns initialization/shell/navigation; pages own screen composition; features own user-action orchestration; the match entity owns domain calculations and data.
- Tests are colocated with their subjects, all existing behavior checks remain, and version-1 data passes the added compatibility regression.
- `npm test`, `npm run build`, and `npm run test:e2e` pass, with successful desktop/mobile visual review and a documented import/layout audit.
- Current match-tracking requirements, storage format, accessible interactions, and visible design are preserved.
