# Touchline — Match Tracker

A local-first Vue app for recording goals during a football match.

## Match data and privacy

Matches are stored in IndexedDB in this browser profile and for this website origin. They are not uploaded, backed up to the cloud, or synchronized with other devices. Clearing this site's browser data may permanently remove saved matches. Editing the same match concurrently in multiple tabs is not supported.

The app uses database `touchline` (schema version `1`) with one `matches` object store keyed by match ID. This storage cutover does not import, modify, or delete existing localStorage match data, so a profile with only legacy localStorage matches opens to an empty archive. Older app versions do not display matches saved by this IndexedDB version; rollback does not convert data between the two stores.

Match records have their own data version, independent of the IndexedDB schema version and the separate player-directory and jersey-inventory formats. Existing records without `recordVersion` (or tagged `1`) are read as version 1; tagged version-2 and version-3 records are also supported. Loading formats 1–3 is read-only: missing participation, jersey assignments, kickoff times, half durations, and goal-player links remain unknown unless the saved data proves them. Legacy goal names are never matched to directory players. The next successful save upgrades only the affected match to record format 4 in the same IndexedDB transaction. Format 4 explicitly stores nullable scorer and assist player IDs alongside the recorded names on every goal. A failed write leaves the previous raw record and committed app state intact. Formats 1–4 may coexist, and unsupported or malformed records are rejected rather than overwritten.

The first successful upgrade from version 1 keeps that record's exact original contents once as `legacyV1Backup`; later saves never replace it. Existing backups on version-2, version-3, or version-4 records are also retained unchanged, while records without a backup do not receive an invented one. A format-4 match stores nullable `firstKickoffAt` and `jerseyAssignment` fields plus explicit nullable scorer/assist identities. The kickoff time is recorded with the first successfully saved start and is not estimated for older matches. An accepted jersey distribution stores the set identity/name and immutable jersey number, size, and owner snapshots against stable match-squad player IDs, so later inventory or directory edits do not rewrite match history. This upgrade changes neither player records nor jersey-inventory data or formats.

This per-record upgrade does not change database `touchline` schema version `1` or the `matches` object store, and is not a migration from localStorage. Legacy localStorage match values remain ignored and untouched. Older app releases cannot read format-4 match records; after the first successful format-4 save, continue using an updated release. There is no automatic downgrade. The embedded version-1 backup is for recovery, not an automatic downgrade of later match data; preserve the IndexedDB database before deliberate recovery and prefer a forward fix after match data has been recorded.

## Participation and playing time

Participation calculations use elapsed duration in milliseconds relative to each half. These durations are not ordinal football-minute labels: a player who plays 47 elapsed minutes in the first half has `47:00` of playing time, while the match clock may label the endpoint `45+2′`. The second half starts at elapsed `00:00` (displayed as `46′`); a 48-minute second half may be displayed as `90+3′`. Do not use those labels as duration inputs.

The half-time break is not part of either half's elapsed timeline. A half-time exchange is recorded at period 2, elapsed `00:00`; the outgoing player's first-half spell ends at the recorded first-half endpoint, and the incoming player starts accumulating only when second-half time advances. Manually paused time is excluded because the saved clock endpoint remains frozen until the clock resumes.

Substitutions replay in period order, then elapsed-time order, then their stable per-match sequence for equal-time exchanges. That sequence matters when exchanges chain at the exact same time. For example, if Alex starts, leaves at first-half elapsed `18:00`, returns at `30:00`, and stays through a `47:00` half, Alex's total is `18:00 + 17:00 = 35:00`; a replacement who plays only from `18:00` to `30:00` has `12:00`. If one player stays on throughout actual half durations of `47:00` and `48:00`, their total is `95:00`, regardless of the length of the break.

All spells are summed in milliseconds before formatting the total as elapsed `mm:ss`; individual spells are never rounded first. Appearance count is one per tracked match with strictly positive playing time, regardless of re-entry. A selected unused substitute remains visible in that match's breakdown at `00:00` but does not count as an appearance. Matches without participation data and tracked matches that have not started are excluded from statistics; unknown historical half durations are not guessed.

## My players

Open **My players** from the top navigation to manage your player directory. Enter a name in **Player name**, optionally enter one general **Jersey size**, and optionally select any positions the player can play from the grouped checkboxes: Tor, Abwehr, Mittelfeld, and Angriff. Sizes are trimmed free text, such as `164`, `M`, or `S/M`; leave the field blank when no size is recorded. Each position choice shows its full German name and abbreviation; players can have no positions or several, with no primary-position ranking. Choose **Add player** to save the profile. Names are trimmed and cannot be blank.

Player cards show a saved general size and position abbreviations in catalogue order; players without positions have no badges. Choose **Edit profile** on an active or archived player to change the name, size, and positions together, then **Save profile**. Choose **Cancel** to discard the draft, leave size blank to clear it, or uncheck every position and save to clear the selection. Archive and restore keep the same profile size and positions. A player's general size is separate from the actual sizes of owned jerseys. Each player has a stable identity separate from their display name, so edits do not split match history. Players with the same name remain distinct and receive an ID-based label when shown together.

Player cards also show saved preferred numbers by jersey set. Choose **Edit preferred numbers** to edit one optional nonnegative whole number per existing set, then use its separate **Save preferred numbers** action. Leave a set's field blank and save to clear that preference; **Cancel** discards the draft. Preferences are advisory: they may be shared by players, refer to numbers not currently stocked, and do not reserve or identify an owned jersey. A preference is independent of both the player's general size and jersey ownership. If inventory cannot load, its summaries are marked unavailable and **Try again** reloads the inventory; profile editing remains available. A failed preferred-number save keeps the draft for retry and does not publish unsaved values.

Use **Archive** to remove a player from new squad selections without deleting them or changing saved match membership and statistics. Choose the **Archived** filter to review those players and **Restore** the same identity for future selections. The **Active** filter returns to the players currently available for new matches.

The directory is stored locally under the separate versioned localStorage key `touchline.player-store` in this browser profile. It is not uploaded or synchronized; clearing site data may remove it. This player-directory key is independent of match storage: it is not a source for match records, and directory edits never rewrite saved matches.

Player directories saved by earlier app versions use format version 1 or 2. This version reads both formats without writing during load, treats a missing size as unknown, and preserves the existing position rules (version 1 players without positions get an empty selection). The first successful directory save lazily writes the complete directory in format version 3; a failed save leaves the previous stored payload intact. Older app releases cannot read version-3 directories, so continue using an updated release after that first successful save. There is no automatic downgrade.

Jersey sets, their jerseys, ownership references, and per-set player-number preferences are stored together as one version-1 collection under `touchline.jersey-set-store` in this browser profile. Loading a missing inventory key is read-only; each successful inventory save replaces only that aggregate. Inventory data stays local and does not write the player directory or saved-match storage. The jersey-set entity owns its records, validation, repository, and app-scoped store; player owners are stored as stable directory IDs so names and archive status can be resolved from the current player directory without duplicating or migrating player records.

## Jersey sets

Open **Jersey sets** from the top navigation to create named inventories. Choose **Create set**, enter a nonblank name, and save. Set names may repeat; the saved labels gain stable ID details when needed. Select a set to see its inventory, or choose **Rename** to change its label without changing its jerseys or preferences.

Choose **Add jersey** to record a back number, actual jersey size, and owner. Numbers are nonnegative whole numbers, including `0`; duplicate numbers and even otherwise identical jerseys remain separate items. Actual sizes are trimmed free text such as `164`, `M`, or `S/M`. New jerseys belong to the team by default. Choose a directory player to record private ownership; active and archived players are available, and the displayed name follows later renames. Ownership is informational and does not set a player's size or preferred number, reserve the jersey, or track lending.

Choose **Edit** on one jersey to change its details without affecting other duplicate-number items. **Remove** deletes only that physical jersey; it does not clear anyone's preferred number. Removing a set asks for confirmation and removes the set, its jerseys, and its per-set player preferences together. Other sets and player profiles remain unchanged. A failed save leaves the last committed inventory in place and the action can be retried; loading errors offer a separate retry rather than presenting an empty inventory.

## Automatic jersey proposals

An automatic proposal works from the selected set's physical jerseys and the complete saved match squad. It considers eligible private jerseys for their owner first (exact adult size, then one step larger), followed by team jerseys for the remaining players (all exact fits before one-step-larger fits). An owner who cannot use a private jersey within that size limit remains eligible for team stock. Private jerseys are never automatically lent to another player, including when an owner is absent or their identity is unavailable.

Adult size comparison trims surrounding whitespace and ignores letter case. The ranked order is `... 3XS, XXS, XS, S, M, L, XL, XXL, XXXL, 4XL ...`; repeated-X labels and positive numeric aliases such as `2XS`/`XXS` and `3XL`/`XXXL` mean the same rank. Automatic matching does not guess a fit for youth numbers such as `164`, combined labels such as `S/M`, blank player sizes, or unrecognized inventory sizes. These labels remain unchanged and the jerseys can still be selected manually.

Within each ownership-and-size round, assignments are matched together so row order does not create an avoidable shortage: for example, if Alex (M) can use team `7/M` or `8/M` while Ben (L) can use only `7/L`, Alex receives `8` and Ben receives `7`. A player's last accepted number in the same set is a preference only after fit and coverage are respected in team rounds. It comes from the most recently started match with an accepted assignment, ordered by its first kickoff; absent or unassigned games are looked past, and an assigned substitute contributes even if they did not play. The current match, unstarted preparations, and the profile's separate preferred-number fields do not create number history.

Equivalent claims are resolved randomly rather than by names, squad order, or inventory order. In particular, equally eligible owners competing for one private number have equal opportunity regardless of who wore it before. A generated result stays stable while it is reviewed; only an explicit regeneration draws a new proposal. If no eligible jersey exists, the affected player remains visible and unassigned with an explanation instead of receiving a smaller, two-steps-larger, or someone else's private jersey. The other rows remain usable, and the final distribution may be partial. Manual choices can use any physical jersey in the selected set regardless of size or ownership, but each player may receive only one item and each back number (including `0`) can appear only once across starters and substitutes.

### Review and save a match distribution

Newly created matches open the optional **Match squad** preparation step. Save a squad to continue to **Jersey assignments**; a saved squad is required for jersey review, but neither step is required to start the match. A previously saved match opens directly on Match. Before kickoff, choose **Review or edit preparation** to reopen its squad and jersey steps.

Select a **Jersey set** and choose **Generate proposal**. Review a separate row for every starter and substitute; an assigned back number (including `0`) leads each row before the player name, while size, ownership, and duplicate-shirt details remain secondary. Then choose **Save assignments and finish** to commit the distribution once. Choose **Skip jerseys** when no distribution is needed; if one is already saved, **Keep saved jerseys** leaves it unchanged. If you already generated a proposal, **Replace draft with a new proposal** explicitly replaces it; it does not save the replacement. Returning to the squad step and then back to jerseys keeps the current review draft in the open preparation session.

Generation and manual edits change only the review draft, not the match or the player/inventory stores. The generated result stays stable while you review it. Each **Jersey for …** menu includes every physical item in the selected set, regardless of size, size recognition, or owner. You can choose an item, return a row to **No jersey selected**, or leave the row unassigned. A number already assigned to another squad member is rejected with the current wearer's name; that row is not moved. To transfer the number, clear the current wearer's row first, then choose the jersey for the new wearer.

Unassigned rows remain visible with an explanation, and a partial distribution can be saved. After saving, unassigned rows continue to show a generic “No jersey assigned” message; proposal-specific fit diagnostics are not stored. Saving commits the whole distribution to the match once. If that save fails, the prior accepted distribution stays in place and the exact draft remains available to retry without rerolling. Skipping also leaves the prior accepted distribution unchanged.

Generating or editing requires the player directory and selected-set inventory to be loaded. A load failure is an unavailable-data state, not an empty roster or empty stock; retry the load before continuing. Saved summaries are match snapshots and remain readable without live directory or inventory data. Before saving, the app checks that the selected set and chosen jersey details are still current and that the match is still in its saved pre-kickoff phase. If source data changed, retry the source load or correct the stale choice in the open review. Committed squad edits reconcile draft rows by stable player ID—retained choices stay, departed players are removed, and newcomers are unassigned—without automatically drawing a replacement proposal. Disabling player tracking clears its distribution in the same match save. In that same atomic save, goal scorer/assist links for retained squad members and the saved own side remain; links made ineligible by a removed player, own-side change, or disabled tracking are cleared while the recorded goal names stay intact. Changing only starters does not clear links, and a failed preparation save changes neither the squad nor goal attribution.

If a row reports a missing/unrecognized player size or no eligible unclaimed jersey, choose any suitable item manually or keep the row unassigned; neither error blocks other rows or kickoff. A duplicate-number message identifies the existing wearer so you can clear that row before correcting the conflict. If **Try again** appears, use it to reload unavailable data before continuing. If **Save assignments and finish** reports a save failure, keep the review open and retry the same action; the existing accepted result is unchanged until a save succeeds. To leave changed, unsaved drafts from the squad step, choose **Go to match**; from jersey review, choose **Skip jerseys** or **Keep saved jerseys**. App navigation asks before discarding only when a draft has changed. Canceling **Discard changes** returns to the draft; confirming keeps committed snapshots and discards only unsaved session drafts.

Before kickoff, the saved preparation disclosure can still show the complete accepted number, size, owner, and set snapshots. After first kickoff, preparation and distribution edits close and accepted jersey numbers appear immediately before player names in the pitch and bench rows. An explicitly unassigned row says **No jersey assigned**; a match with no accepted distribution stays neutral. Player times no longer repeat a separate jersey roster or show sizes and ownership, but those historical snapshots remain saved. Reloading or leaving the preparation page does not promise to retain unsaved drafts; only successfully saved squad and jersey snapshots are durable. An accepted preparation in an unstarted match is not yet jersey-number history: it becomes eligible history only after that match has a recorded first kickoff. A missing or partial distribution never prevents kickoff.

Choose **Statistics** on a player card to see that identity's playing time, appearances, goals, and assists, plus dated match-by-match playing-time contributions. Each breakdown shows the opponent, whether your team was home or away, match status, and the player's time; select a match to return to its saved lineup and event history. The statistics use stable player IDs, so rename and archive do not detach or erase history. An unused squad member can have a `00:00` breakdown without an appearance, and two directory players with the same name remain separate.

Goal and assist totals come only from explicit scorer/assist player links on committed goals for the saved own side in started, player-tracked matches. The roles count independently: an assist can count without a linked scorer, while manual-name-only and legacy goals, opponent goals, untracked matches, and matches that have not started add no player credit. Names are never matched to profiles. These totals do not require valid playing-time history or positive minutes, and they do not create minutes or appearances. They are derived from saved match events rather than counters on player profiles, so a successful correction, replacement, cleared link, or team change updates the totals; drafts and failed saves leave the previous totals in place.

For a running match, the current on-pitch contribution updates live and is included once in the playing-time total. A paused clock freezes that contribution until play resumes; full-time fixes it at the recorded endpoint. Recorded stoppage time counts as playing time. Manually paused time and the half-time break do not. Appearance count increases once per match only when the player's summed on-pitch time is positive, including when that time comes from multiple spells. Untracked matches and matches not yet started do not create eligible player history, and intervals with unknown historical period durations do not invent minutes or appearances. An explicitly linked goal or assist still counts in a started tracked match even when its playing-time history is unavailable.

## Record and edit goals

Choose a team's **Goal** action to save a goal immediately at the accepted match time. After that save commits, the focused editor automatically opens for that exact goal; its optional details are a separate save, so closing it never loses the recorded goal. A failed initial save does not open an editor. **Add details** and **Edit** remain available in the event history for later changes. Each scorer and assist can be left blank, selected independently, or entered manually.

For a goal on your saved own side, the player selectors use the complete saved match squad, including the bench, and show accepted jersey numbers before names when available. They do not require the live player directory or jersey inventory. Selecting a player saves that stable identity with the match's recorded name snapshot; equal names remain distinct. Existing name-only goals stay manual and are never linked by matching text. Use **Enter a name manually** for an unlinked value; opponent goals and untracked matches use manual name fields directly. Moving a linked goal to the opponent clears its player links while keeping the recorded names.

The focused editor accepts blank optional fields. Changing names, team, or description without changing the displayed minute preserves the goal's exact saved period and millisecond timestamp; an explicitly changed minute corrects it. Choose **Close** or press Escape to hide the editor and keep the unsaved draft while you remain in the open match. Reopen the same goal to continue. Choose **Discard changes** to reset that draft to its last saved values; choose **Save details** to commit and close the editor. If saving fails or a selected player is no longer in the saved squad, the editor keeps the entered values available for correction or retry and the saved score and event history remain unchanged.

## Set up and follow a match

1. Add your players in **My players** before match day if you want player-time tracking.
2. Create a match. The saved match opens in optional **Match squad** preparation, without starting kickoff. To track minutes, select your side, choose the match squad, and mark at least one starter; unmarked squad members make up the bench, and opponent players are not needed. Choose **Save squad and continue** to commit it, or **Skip player tracking** to leave the match untracked. A saved squad is editable only before kickoff.
3. After saving a squad, optionally prepare jerseys. Choose a set and generate or manually review a distribution, then select **Save assignments and finish**. A partial distribution is allowed. Choose **Skip jerseys** or **Keep saved jerseys** to continue without changing the accepted snapshot. From the squad step, **Go to match** continues without changing saved preparation. App navigation is available from either step. To leave with changed drafts, confirm **Discard changes**; saved squad and jersey data remain intact. Failed saves keep their drafts available for retry while the page remains open.
4. Kickoff is a separate, explicit action: choose **Start first half** in Match. You can also skip all preparation and start a goal-only match; the two team-labeled **Goal** actions remain available before kickoff. Player tracking cannot be added after kickoff. Before kickoff, reopen saved preparation with **Review or edit preparation**. After kickoff, preparation edits close and the accepted jersey snapshot remains available in **Player times**.
5. Once kickoff is saved, the saved lineup appears in **Player times**. The score, clock, panel tabs, and bottom recording actions stay available while you scroll either panel. Switch between **Events** and **Player times** without stopping or resetting the match. Team-specific **Goal** actions remain reachable from both panels; after a successful goal save, its optional details editor opens over the current panel. Close or press Escape to continue recording, or save details before continuing. The goal time is captured when the action is accepted, before storage completes, and the clock keeps running while details are open.
6. During a running or paused half, choose **Substitute** from the bottom action area. The focused editor captures the match time before you choose **Player off** and **Player on**, so taking time to choose names does not shift the event. Duplicate names include a short identity label. A paused clock uses its frozen time. Choose **Save substitution** to record the exchange or **Cancel** to leave history unchanged. At half-time, choose **Start second half** when ready; a saved exchange at half-time applies to the second-half lineup at elapsed `00:00`, and the break contributes no playing time.
7. **Events** shows the combined goal and substitution history newest first. The pitch, bench, and player times update after each saved exchange. A player may return after being substituted off and may be substituted again. Each event is exactly one player off for one player on from the saved match squad: simultaneous/bulk exchanges, temporary departures without a replacement, and opponent-player tracking are not supported.
8. Use **Correct** on a substitution in Events to open its focused editor. Change its half, elapsed `mm:ss`, or players, then choose **Save correction**; **Remove substitution** deletes it after the full history is revalidated. The explicit half-time control sets second-half `00:00`. Player-only corrections retain the original millisecond timestamp; entering a new time stores whole-second precision. A conflicting later exchange prevents the entire correction or removal from saving. A failed save keeps the editor and its values open for retry.
9. At full-time, review the final result and Events history or open **Player times** for final totals. Active clock and new live substitution controls are removed; the team-specific **Goal** actions remain available for a missed goal, and saved events can still be corrected. An untracked match explains that player times are unavailable instead of showing invented values.

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

The jersey-assignment audit confirms that the match, player, and jersey-set entities remain independent; the assignment feature coordinates them only through their public `index.ts` APIs; squad configuration uses only the match entity and does not import the assignment feature; and `MatchDetailPage` composes the feature through its public entry point without implementing allocation or persistence logic. The new cross-feature UI and model tests use public entity APIs. Guided-preparation browser checks at 320px, 390px (including 125% root text), 390×360px, 844×390px landscape, and 1280px use an 18-player squad with duplicate long names. They found no horizontal overflow; controls remained at least 48px high, the final row and actions stayed reachable, and preparation-step and discard-dialog focus behaved as expected. Physical-device soft-keyboard and safe-area checks remain pending.

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

## Installable offline app

Service workers and installation require HTTPS in production. `localhost` and `127.0.0.1` are treated as secure local-development origins; the normal `npm run dev` server deliberately does not register a service worker. Use the production build and preview to check installation metadata and worker delivery:

```sh
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

The default deployment base is `/`. A subdirectory deployment must use the same configured base when building and previewing, and the complete `dist/` contents must be published beneath that path:

```sh
npm run build -- --base=/touchline/
npm run preview -- --base=/touchline/ --host 127.0.0.1 --port 4173
```

For that example, the preview is available at `http://127.0.0.1:4173/touchline/`; the manifest, icons, worker, and application assets resolve below `/touchline/`. Do not move the generated files to a different path after building.

### Cold offline starts and local data

A fresh offline launch requires one successful online preparation of the production app at the same URL and in the same browser storage context. Open the HTTPS deployment (or the production preview above) while online and allow the worker to activate and prepare the complete application resource set before closing the page. An install icon, an online connection, or an already-rendered screen alone does not prove that a fresh offline launch is prepared. A first-ever visit from a profile with no prepared app files cannot start offline.

Offline readiness concerns the app shell and its required resources; it does not confirm that match, player, or jersey storage loaded. Those stores keep their existing separate loading, error, and retry behavior. If a local-storage error appears, use that store's retry rather than treating the app-shell status as proof that saved records loaded or as a reason to replace them with empty data.

To check a cold start manually, first visit the exact production URL online and wait for preparation to finish. Close the app page, disconnect the device or stop the preview server, then open that same URL in a new tab or installed app using the same browser profile. Reconnecting is required to prepare the app again if its application cache has been evicted; an offline page cannot download missing app files. Recovery of an unusable app registration is online-only and acts on the application registration, not the local match, player, or jersey stores. Do not clear all site data to repair app files; doing so can delete local records.

With Firefox installed, `npm run test:e2e` also runs `src/app/ui/App.pwa.e2e.test.mjs`. Its production cold-offline case waits for full resource preparation, closes the online page, stops the fixture server, creates and saves player profiles, jersey sets/items/preferences, a match, squad and jersey preparation, and attributed goal statistics offline, then opens a fresh page and verifies the committed data again. The already-loaded-page offline check described earlier is not a substitute for this cold-start flow.

Only successfully saved records are expected to survive a relaunch. The app opens at its normal archive screen; it does not restore the last screen or promise to recover unsaved team names, profile/inventory edits, preparation changes, or editor drafts. Match data uses IndexedDB, while player and jersey data use their existing localStorage keys. They stay in the browser's local storage context and are not copied automatically to a different origin, browser profile, device, or installation context. For example, `localhost` and `127.0.0.1` are different origins; installed-app storage sharing also varies by platform and browser. Check the chosen context before match day. These local records are not a cloud backup, and this release does not synchronize them between people or devices.

On Android, use the browser's **Install app** or **Add to Home screen** menu when offered. On iPhone or iPad, open the site in Safari and choose **Share → Add to Home Screen**. On supported desktop Chromium browsers, use the browser's install icon or menu. Availability and wording vary by platform and browser; the site does not promise a universal in-app installation prompt.

Publish each release as a complete set of generated files: upload new hashed assets before exposing the matching HTML and `sw.js`, and avoid partial deployments. Configure the host to revalidate `index.html` and `sw.js` so clients can discover releases; content-hashed files under `assets/` may be served with immutable caching. Retain older hashed assets during rollout so an already-open page can finish using the release it loaded. The generated worker and installation resources are part of the deployment and should be served from the same origin and configured base as the app.

The existing DM Sans, DM Mono, and Space Grotesk font files are bundled locally under the SIL Open Font License 1.1. Their upstream source URLs and the complete family licenses are recorded in `src/app/assets/fonts/SOURCES.md` and `public/fonts/licenses/`; no Google Fonts request is needed at runtime.

Automated browser checks emulate narrow, short, and desktop viewports. Those checks do not verify native installation prompts, physical device safe areas, or the iOS/Android software keyboard. Platform installation and keyboard behavior must be checked on actual devices; emulation is not counted as installation evidence.

### App updates and release recovery

The app offers updates only on the match archive. Applying one is enabled only when no match or preparation is open, the player-detail view is closed, both raw team-creation fields are empty (including whitespace), and match, player, and jersey stores have no pending loads or saves. Updates never reload automatically. Choose **Later** to leave the update available on the archive; it is not queued for automatic application when work finishes. If the page becomes unsafe while activation is in progress, it stays open and a fresh eligible action is required. Activation from another tab also leaves this tab and its drafts untouched; return to the archive to reload when ready. A failed release preparation keeps the current prepared release available and can be retried after the release is fixed.

If application files were evicted while an unusable worker registration remains, **Recover offline access** is an online-only archive action. It resets only this app's registration and reloads so the current application can be prepared again; it does not clear or rewrite match, player, or jersey data. Keep the app online for recovery and wait for the complete resource set to prepare before relying on another offline launch.

For a faulty deployment, prefer a forward fix or redeploy a known-good PWA-enabled release at the same origin and deployment base. Publish all new hashed assets before exposing their matching HTML and `sw.js`, and retain older hashed assets while previously opened pages may still use them. A deployment rollback does not convert saved records: an older app release may not understand formats written by a newer release, so do not treat rollback as a data downgrade. Removing `sw.js` alone does not retire workers already installed in browsers; withdrawing PWA support requires an explicit same-scope retirement release. Do not clear all site data to repair app files, because that can delete local records.

### Future local-first collaboration direction

This release has no accounts, backend, backup, synchronization, outbox, or conflict interface. A future local-first design may let several people record the same match, with every participant able to control its clock; offline devices may temporarily disagree, and genuine conflicts may require manual resolution. That direction is not implemented here, and this app does not currently synchronize data between people or devices.

### Layout and platform validation

Production Chromium emulation passed the archive update-status and match goal-recording/details-editing flows at 320×844, 390×844, 390×844 with 150% root text, 844×390 short landscape, and 1440×900. The status controls and editor save action remained visible with at least 48px targets, the status was absent over the live editor, and no horizontal overflow was detected. At short landscape height, the compact sticky score/clock header leaves timeline controls reachable and save feedback stays in normal document flow.

| Physical platform check | Status |
| --- | --- |
| Android/Chromium installation, offline relaunch, standalone safe area, and software keyboard | **Pending — not performed on a physical device.** |
| iOS/Safari installation, offline relaunch, standalone safe area, and software keyboard | **Pending — not performed on a physical device.** |
