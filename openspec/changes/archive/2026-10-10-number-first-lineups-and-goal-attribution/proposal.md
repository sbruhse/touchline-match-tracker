# Proposal

## Why

During a match, the jersey number is the quickest way to identify a player, but proposal review buries it in a selector and the lineup separates it into a second, size-heavy list. Goal details also require manually typed names and an extra launch action, leaving goals and assists disconnected from the player's statistics.

## What Changes

- Lead jersey-review rows with a prominent assigned number followed by the player name; retain secondary size and ownership information where it helps select a physical shirt.
- Show accepted match numbers directly before names in planned, current, and final pitch/bench lists. Remove the separate post-kickoff jersey list and omit shirt sizes and ownership from the match lineup, without deleting saved jersey snapshots.
- Save a goal immediately at the accepted action time, then automatically open its optional scorer/assist editor after that save commits. Keep the same editor accessible through existing Add details/Edit actions.
- Offer number-first selections from the saved own-side match squad, including players without a jersey. Preserve optional fields and manual name entry for opponents, untracked matches, and names that cannot be linked.
- Save scorer and assist player identities alongside their recorded names, preserving historical readability and distinguishing equal names. Do not infer player links from old name-only goals.
- Add identity-based goal and assist totals to each player's existing statistics screen, with committed corrections reflected in both totals and goal details.
- **BREAKING (older app releases only):** Write match record format 4 with explicit nullable scorer/assist player references. Continue reading formats 1–3 without writes and preserve existing version-1 backups; older releases cannot read format 4 and there is no automatic downgrade.

## Capabilities

### New Capabilities

- `player-goal-statistics`: Derive and display each player's goal and assist totals from explicitly linked, committed own-side goal events in started tracked matches, independently of playing-time validity.

### Modified Capabilities

- `match-jersey-assignment`: Define prominent number-first proposal review and distinguish full stored jersey snapshots from the compact number-only match presentation.
- `match-participation`: Put saved jersey numbers beside pitch/bench player names rather than in a separate live list, preserving lineup and time behavior.
- `football-match-tracking`: Automatically open details after a successful goal save, support optional squad selection and durable player attribution, and evolve match-record compatibility for those references.

## Impact

- Jersey assignment row/summary presentation, the `match-lineup` widget, and `MatchDetailPage` composition; the existing guided pre-kickoff workflow remains in place.
- The match entity's goal model, attribution validation, snapshot handling, IndexedDB record reader/writer, and pre-kickoff squad reconciliation; no player-directory or jersey-inventory format change and no IndexedDB database-schema upgrade.
- The `edit-goal` feature's draft and selectors, committed-goal editor launching from `MatchDetailPage`/`MatchTimeline`, and the existing `player-statistics` page and summary.
- Colocated domain, repository, feature, widget, and page tests; app/browser flows and README guidance for goal entry, statistics, number-first review, and storage compatibility.
- No new dependencies, opponent roster management, goal deletion or own-goal modeling, automatic legacy-name matching, stored player counters, or unrelated architectural/UI redesign. This change builds on the current guided-preparation implementation without modifying its existing change artifacts.
