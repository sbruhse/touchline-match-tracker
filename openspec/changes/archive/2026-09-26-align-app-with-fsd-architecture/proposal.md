# Proposal

## Why

The app's current `components`, `domain`, and `data` layout and multi-purpose root component do not satisfy the Feature-Sliced Design rules in `AGENTS.md`. Aligning the existing implementation now gives future match-tracking changes explicit ownership and import boundaries while preserving the current user experience and locally saved matches.

## What Changes

- Organize application code into the needed FSD layers and slice segments under `src/`.
- Separate application initialization and shell, archive and match-detail screen composition, match-related user actions, and match domain/data ownership.
- Introduce slice public `index.ts` APIs, downward-only dependencies, and independent slices on each layer.
- Keep match, clock, goal, and persistence code together in one match entity slice; place match creation, clock controls, goal recording, and goal editing in feature slices.
- Move styles to their owning application or slice UI segments, retaining global foundations at application level.
- Colocate existing unit, integration, and full-app browser tests with their subjects and update entry points and test discovery.
- Document the resulting architecture and verify structural compliance, saved-data compatibility, and existing browser flows.

## Capabilities

### New Capabilities

None. This change reorganizes existing implementation responsibilities.

### Modified Capabilities

None. The requirements and scenarios in `football-match-tracking` remain applicable without modification. This pure refactor declares `skip_specs: true` in the change metadata; architecture acceptance criteria are recorded in the design and tasks rather than introducing a product capability.

## Impact

- Affected application code: `src/main.ts`, `src/App.vue`, `src/style.css`, `src/components/GoalEventEditor.vue`, `src/domain/*`, and `src/data/*`.
- Affected verification and integration: colocated `src` tests, `e2e/match-flow.test.mjs`, `index.html`, the `test:e2e` package script, test configuration as needed for discovery, and the architecture documentation in `README.md`.
- Internal import paths change. The browser storage key `touchline.match-store`, version `1`, record shape, and data retention behavior remain compatible.
- Vue, TypeScript, Vite, Vitest, and Selenium remain the existing toolchain. No new runtime dependencies, routes, storage migration, or externally observable feature changes are required.
- The refactor is explicitly scoped to fulfilling the existing architecture rules; `AGENTS.md` remains the governing policy.
