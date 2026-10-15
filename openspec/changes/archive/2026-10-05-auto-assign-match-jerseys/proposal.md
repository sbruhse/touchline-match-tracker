# Proposal

## Why

The player directory and jersey inventory are now available, but preparing a match still requires distributing jerseys by hand and remembering earlier numbers. A size-aware proposal with explicit human review will reduce that work while preserving private ownership priority, number continuity, and unique match numbers.

## What Changes

- Add jersey preparation for the saved own-side match squad: choose one jersey set, explicitly generate a proposal, review every player, adjust individual choices, and accept the final distribution in one save.
- Prefer eligible privately owned jerseys for their owners. Automatic assignment never lends a private jersey to another player; equally ranked ownership conflicts are decided randomly.
- Use ordered adult sizes. After ownership priority, exact fit takes precedence over the previous number; automatic fallback is limited to one size step larger. Missing or unrecognized sizes and shortages leave visible unassigned rows with errors.
- Prefer each player's last recorded number in the same set, looking past games they missed. Derive this from accepted assignments in previously started matches; do not use the separately maintained preferred-number fields as an initial or fallback preference.
- Randomize equally ranked conflicts and initial allocations, keeping each generated proposal stable until the user explicitly regenerates it.
- Let the user manually choose any physical jersey in the selected set regardless of size or owner. Always enforce one number per entire squad, including substitutes and privately owned jerseys.
- Save the chosen set and jersey snapshots with the match so inventory changes cannot rewrite its recorded distribution. Record first kickoff time for reliable historical ordering, independently of later match edits and clock resumes.
- Reconcile accepted assignments when the pre-kickoff squad changes. Keep saved distributions readable during play and after full-time, including when their source inventory is no longer available.
- **BREAKING for older application releases:** write match-record format 3 on successful saves, while reading formats 1 and 2 without rewriting them. Preserve the existing original version-1 backup behavior and the IndexedDB database schema.

## Capabilities

### New Capabilities

- `match-jersey-assignment`: Match-scoped jersey proposals, ownership and size priorities, historical number reuse, random conflict resolution, manual review, incomplete-result feedback, and persistent final distributions.

### Modified Capabilities

- `jersey-management`: Qualify the existing informational-ownership and free-text-size requirements so match assignment may interpret them, while inventory maintenance remains independent of match allocation and advisory preferences.
- `football-match-tracking`: Extend compatible match persistence to record format 3 with jersey distributions and stable first-kickoff chronology.

## Impact

- `src/entities/match/`: Assignment snapshot types, validation/copying, history lookup, kickoff timestamp, and backward-compatible versioned IndexedDB persistence.
- `src/entities/jersey-set/`: Adult-size comparison helpers and existing public inventory/identity APIs; no inventory-format migration.
- New `src/features/assign-match-jerseys/`: Pure proposal calculation, draft orchestration, manual selection, errors, and explicit acceptance UI using the three entity public APIs.
- `src/pages/match-detail/`, `src/features/configure-match-squad/`, and `src/features/control-match-clock/`: Preparation composition, squad reconciliation, and first-kickoff recording. Existing explicit match-copy paths, including substitution correction, must preserve the new fields.
- Colocated model, repository, feature, and page tests; the full-app browser flow in `src/app/ui/App.e2e.test.mjs`; and usage/storage documentation in `README.md`.
- Continue using local storage repositories and the existing Vue application; no network service or new runtime dependency is required.
