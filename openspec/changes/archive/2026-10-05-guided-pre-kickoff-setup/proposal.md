# Proposal

## Why

Preparing a match currently means finding separate squad and jersey blocks below the live Match header, with repeated launch/save steps and little working space on phones. A guided flow at match creation will make preparation discoverable and easier to complete without making player or jersey tracking mandatory.

## What Changes

- Treat team entry as the first step of match creation; after the new match saves successfully, open a focused pre-kickoff workflow instead of the live Match screen.
- Guide the user through their own side, squad and starters, then optional jersey-set selection and distribution review. Continue only after a requested save succeeds.
- Provide explicit skip actions for both optional steps and a quick route to the unstarted Match screen. Jersey preparation still requires a saved squad; no squad means no jersey editor, not a blocking error.
- Keep kickoff separate from finishing setup. Keep accepted preparation editable through one preparation entry point on an unstarted Match screen, rather than two expanded setup blocks.
- Preserve saved steps when leaving or reloading, and distinguish unsaved drafts from saved or unconfigured preparation. Skipping an edit does not silently clear an existing squad or distribution.
- Use compact phone-first preparation chrome without the live scoreboard, timeline tabs, or fixed recording controls competing with the active step. Keep the same workflow on desktop.

## Capabilities

### New Capabilities

None. Match creation, participation setup, and jersey preparation already have established capability boundaries.

### Modified Capabilities

- `football-match-tracking`: Replace the direct post-creation live-screen transition with guided preparation, define navigation/save/skip behavior, and keep kickoff explicit and existing match reopening compatible.
- `match-participation`: Integrate the optional own-side squad editor into the workflow and retain its validity rules, pre-kickoff edit access, and goal-only fallback.
- `match-jersey-assignment`: Integrate optional jersey review after a saved squad, make unavailable/unconfigured/draft/saved states honest, and support reachable review controls in the focused preparation surface.

## Impact

- `src/app/ui/App.vue` navigation and `src/pages/match-archive` creation events; a new `src/pages/match-preparation` composition slice.
- `src/pages/match-detail` pre-kickoff presentation and preparation launcher; the existing `create-match`, `configure-match-squad`, and `assign-match-jerseys` features and their public UI contracts.
- Colocated feature/page tests, `src/app/ui/App.spec.ts`, `src/app/ui/App.e2e.test.mjs`, and README workflow documentation.
- Existing Vue Composition API, Feature-Sliced Design, stores, IndexedDB records, and allocation/validation algorithms remain in place. No new dependency, storage migration, player/inventory-management redesign, or automatic kickoff is included.
- Project-wide `Design.md` supplies the design principles; this change's design artifact records the implementation-specific decisions.
