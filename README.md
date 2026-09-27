# Touchline — Match Tracker

A local-first Vue app for recording goals during a football match.

## Match data and privacy

Matches are stored in IndexedDB in this browser profile and for this website origin. They are not uploaded, backed up to the cloud, or synchronized with other devices. Clearing this site's browser data may permanently remove saved matches. Editing the same match concurrently in multiple tabs is not supported.

The app uses database `touchline` (schema version `1`) with one `matches` object store keyed by match ID. This storage cutover does not import, modify, or delete existing localStorage match data, so a profile with only legacy localStorage matches opens to an empty archive. Older app versions do not display matches saved by this IndexedDB version; rollback does not convert data between the two stores.

Match records have their own data version, independent of the IndexedDB schema version. Existing records without `recordVersion` (or tagged `1`) are read as version 1 and normalized in memory: participation remains unknown, and a completed half duration is inferred only when the saved clock proves it. Reading or opening a legacy record does not write to storage. Its next successful save upgrades only that record to version 2 in the same object store and keeps the exact original record once as `legacyV1Backup` in the upgraded value. The backup is retained by later saves. The read and write happen in one IndexedDB transaction, so a failed upgrade leaves the version-1 record intact; version-1 and version-2 records may coexist. Unsupported record versions are rejected rather than overwritten.

This per-record upgrade does not change the database schema version and is not a migration from localStorage. Legacy localStorage match values remain ignored and untouched. A prior IndexedDB app can open the unchanged database schema, but does not understand participation data and may drop new fields if it saves an upgraded record. The embedded version-1 backup is for recovery, not an automatic downgrade; preserve the IndexedDB database before deliberate recovery and prefer a forward fix after participation data has been recorded.

## Participation and playing time

Participation calculations use elapsed duration in milliseconds relative to each half. These durations are not ordinal football-minute labels: a player who plays 47 elapsed minutes in the first half has `47:00` of playing time, while the match clock may label the endpoint `45+2′`. The second half starts at elapsed `00:00` (displayed as `46′`); a 48-minute second half may be displayed as `90+3′`. Do not use those labels as duration inputs.

The half-time break is not part of either half's elapsed timeline. A half-time exchange is recorded at period 2, elapsed `00:00`; the outgoing player's first-half spell ends at the recorded first-half endpoint, and the incoming player starts accumulating only when second-half time advances. Manually paused time is excluded because the saved clock endpoint remains frozen until the clock resumes.

Substitutions replay in period order, then elapsed-time order, then their stable per-match sequence for equal-time exchanges. That sequence matters when exchanges chain at the exact same time. For example, if Alex starts, leaves at first-half elapsed `18:00`, returns at `30:00`, and stays through a `47:00` half, Alex's total is `18:00 + 17:00 = 35:00`; a replacement who plays only from `18:00` to `30:00` has `12:00`. If one player stays on throughout actual half durations of `47:00` and `48:00`, their total is `95:00`, regardless of the length of the break.

All spells are summed in milliseconds before formatting the total as elapsed `mm:ss`; individual spells are never rounded first. Appearance count is one per tracked match with strictly positive playing time, regardless of re-entry. A selected unused substitute remains visible in that match's breakdown at `00:00` but does not count as an appearance. Matches without participation data and tracked matches that have not started are excluded from statistics; unknown historical half durations are not guessed.

## My players

Open **My players** from the top navigation to create and rename your player directory. Enter a name in **Player name** and choose **Add player**. Names are trimmed and cannot be blank. Each player has a stable identity separate from their display name, so renaming does not split match history. Players with the same name remain distinct and receive an ID-based label when shown together.

Use **Archive** to remove a player from new squad selections without deleting them or changing saved match membership and statistics. Choose the **Archived** filter to review those players and **Restore** the same identity for future selections. The **Active** filter returns to the players currently available for new matches.

The directory is stored locally under the separate versioned localStorage key `touchline.player-store` in this browser profile. It is not uploaded or synchronized; clearing site data may remove it. This player-directory key is independent of match storage: it is not a source for match records, and directory edits never rewrite saved matches.

Choose **Statistics** on a player card to see that identity's total elapsed playing time, appearance count, and dated match-by-match contributions. Each breakdown shows the opponent, whether your team was home or away, match status, and the player's time; select a match to return to its saved lineup and event history. The statistics use stable player IDs, so rename and archive do not detach or erase history. An unused squad member can have a `00:00` breakdown without an appearance, and two directory players with the same name remain separate.

For a running match, the current on-pitch contribution updates live and is included once in the total. A paused clock freezes that contribution until play resumes; full-time fixes it at the recorded endpoint. Recorded stoppage time counts as playing time. Manually paused time and the half-time break do not. Appearance count increases once per match only when the player's summed on-pitch time is positive, including when that time comes from multiple spells. Untracked historical matches, matches not yet started, and intervals with unknown historical period durations are not used to invent player statistics; those matches are identified as unavailable where possible.

## Record and edit goals

Choose a team's **Goal** action to save a goal immediately at the accepted match time. The editor does not open automatically, so recording can continue without entering player details. After the save commits, choose **Add details** to add a scorer, assist, or description to that specific goal. In the event history, choose **Add details** for a goal without descriptive details or **Edit** to change an existing summary.

The focused editor accepts blank optional fields. Choose **Close** or press Escape to hide it and keep the unsaved draft while you remain in the open match. Reopen the same goal to continue. Choose **Discard changes** to reset that draft to its last saved values; choose **Save details** to commit and close the editor. If saving fails, the editor keeps the entered values available for retry and the saved score and event history remain unchanged.

## Set up and follow a match

1. Add your players in **My players** before match day.
2. Open a match before kickoff. **Events** is the primary match history, and **Player times** is one tap away. If you want minutes tracked, choose **Set up player tracking** in **Match squad**: select your side, a unique squad, and a nonempty set of starters. Unmarked squad members make up the bench; opponent players are not needed. You may edit or disable setup only before kickoff.
3. **Start first half** is in the match header. Squad preparation is optional: the two team-labeled **Goal** actions remain available before kickoff, so you can start a goal-only match immediately. The match can also kick off without player tracking, but tracking cannot be added afterward.
4. Once kickoff is saved, the editable setup area is removed and the saved lineup appears in **Player times**. The score, clock, panel tabs, and bottom recording actions stay available while you scroll either panel. Switch between **Events** and **Player times** without stopping or resetting the match. Team-specific **Goal** actions remain reachable from both panels; a successful goal offers **Add details** for that saved goal without opening an editor automatically.
5. During a running or paused half, choose **Substitute** from the bottom action area. The focused editor captures the match time before you choose **Player off** and **Player on**, so taking time to choose names does not shift the event. Duplicate names include a short identity label. A paused clock uses its frozen time. Choose **Save substitution** to record the exchange or **Cancel** to leave history unchanged. At half-time, choose **Start second half** when ready; a saved exchange at half-time applies to the second-half lineup at elapsed `00:00`, and the break contributes no playing time.
6. **Events** shows the combined goal and substitution history newest first. The pitch, bench, and player times update after each saved exchange. A player may return after being substituted off and may be substituted again. Each event is exactly one player off for one player on from the saved match squad: simultaneous/bulk exchanges, temporary departures without a replacement, and opponent-player tracking are not supported.
7. Use **Correct** on a substitution in Events to open its focused editor. Change its half, elapsed `mm:ss`, or players, then choose **Save correction**; **Remove substitution** deletes it after the full history is revalidated. The explicit half-time control sets second-half `00:00`. Player-only corrections retain the original millisecond timestamp; entering a new time stores whole-second precision. A conflicting later exchange prevents the entire correction or removal from saving. A failed save keeps the editor and its values open for retry.
8. At full-time, review the final result and Events history or open **Player times** for final totals. Active clock and new live substitution controls are removed; the team-specific **Goal** actions remain available for a missed goal, and saved events can still be corrected. An untracked match explains that player times are unavailable instead of showing invented values.

Leaving the Match page tears down its display timers but does not stop a running match clock. Reopening the match restores the clock from its saved start time; use **Pause clock** or **Full-time** in the Match header to change its saved phase.

The side radio options, squad and starter checkboxes, player-off/player-on choice rows, correction controls, and action buttons have visible or explicit accessible labels and work with native keyboard controls. Validation and storage failures are announced in the focused editor; resolve the message, retry, or cancel before continuing.

## Development

Install dependencies with `npm ci`, then start the Vite development server:

```sh
npm run dev
```

## Architecture

Application code follows Feature-Sliced Design under `src/`:

```text
src/
  app/
    main.ts
    styles/global.css
    ui/
      App.vue
      App.spec.ts
      App.e2e.test.mjs
  entities/
    match/
      index.ts
      api/matchStorage.ts
      api/matchStorage.spec.ts
      model/
        match.ts
        match.spec.ts
        clock.ts
        clock.spec.ts
        goals.ts
        participation.ts
        participation.spec.ts
        playerStatistics.ts
        playerStatistics.spec.ts
        matchStore.ts
        useMatchTime.ts
        useMatchTime.spec.ts
    player/
      index.ts
      api/playerStorage.ts
      api/playerStorage.spec.ts
      model/player.ts
      model/player.spec.ts
      model/playerStore.ts
      model/playerStore.spec.ts
  features/
    configure-match-squad/
    control-match-clock/
    create-match/
    edit-goal/
    edit-substitution/
    manage-players/
    record-goal/
    record-substitution/
  pages/
    match-archive/
    match-detail/
    my-players/
    player-statistics/
  widgets/
    match-lineup/
```

Match-specific types, factories, scoring and clock calculations, goal construction, participation data, and browser persistence belong to the `entities/match` slice. Pure domain logic lives in `src/entities/match/model/`, and the IndexedDB repository lives in `src/entities/match/api/`. The reusable player directory and its versioned localStorage repository belong to `entities/player`.

Other slices use the match entity through `src/entities/match/index.ts`; they must not import another slice's implementation files directly. Files inside the match entity use direct relative imports for their own implementation details and tests.

Match actions are separated into features: `create-match` validates the team form, creates and saves a match, then emits its ID; `control-match-clock` applies timestamp-based clock transitions; `configure-match-squad` owns pre-kickoff setup; `record-substitution` captures and validates exchanges; `edit-substitution` corrects or removes them; `record-goal` immediately persists a new goal; and `edit-goal` owns the goal-details draft, validation, and save operation. `manage-players` owns directory create, rename, archive, and restore actions. The `match-lineup` widget derives the pitch and bench from the match entity. Each feature, widget, and page exposes its public UI through its own `index.ts`.

The player-management and participation implementation was audited against the FSD boundaries: app composition imports pages and provides entity stores; pages/widgets/features consume entity public APIs; cross-slice UI imports target public `index.ts` entry points; and no upward, same-layer sibling-slice, or deep cross-slice imports were found. The audit checked 179 relative source imports. New UI/model tests are colocated with their subjects, and the browser flow remains under `app/ui`.

Each app mount provides a new match store with `provideMatchStore()`. Pages and features consume its read-only reactive collection and explicit asynchronous `load()` / `persist()` methods through `useMatchStore()`. A save promise resolves only after the IndexedDB transaction commits. The store publishes the committed snapshot after success, so state is shared within one mounted app but is not held in a module-level singleton.

The store exposes read-only `ready`, `loading`, `saving`, `saveStatus`, and `error` state. The app shows an accessible loading screen during startup, and a load failure must be retried before any match actions become available. Writes are rejected until initial loading succeeds and while another write is pending; actions are not queued. The app announces pending saves, committed saves, and failures. Failed operations do not publish unsaved records or clear creation/goal drafts; repeat the action to retry. Clock display ticks are in-memory only and never write to IndexedDB.

Once the app has loaded, match reads and writes use the browser's local IndexedDB and do not require a network request. The Firefox flow verifies this with `navigator.onLine` false and `fetch`/`XMLHttpRequest` unavailable while the loaded page records another goal. This does not promise that a fresh page can start offline: the app shell itself must first be served to the browser.

## Tests

Unit and app integration tests live beside their subjects as `*.spec.ts` files under `src/`. Run them with:

```sh
npm test
```

For watch mode while developing, run `npm run test:watch`.

Run the full-app Selenium flow from `src/app/ui/App.e2e.test.mjs` in headless Firefox with:

```sh
npm run test:e2e
```

Firefox must be installed; set `FIREFOX_BINARY` if it is not at a standard location.

## Production build

Type-check and create the browser build with:

```sh
npm run build
```

To serve the generated build locally, run `npm run preview`.
