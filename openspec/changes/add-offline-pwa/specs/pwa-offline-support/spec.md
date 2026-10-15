# Spec Delta

## Purpose

Make Touchline installable and usable from a fresh offline launch after successful application preparation, while keeping application updates non-disruptive and local user data independent of application caches.

## ADDED Requirements

### Requirement: Installable standalone application
The application SHALL provide installation metadata and local app icons for supporting browsers over HTTPS or a supported local-development origin. Installed launches SHALL use standalone presentation where supported. Unsupported installation environments SHALL retain ordinary browser access without blocking existing workflows.

#### Scenario: Install on a supporting browser
- **WHEN** a user opens a production deployment in an installation-capable browser
- **THEN** the browser can identify Touchline by its name, start address, and icons, including 192px and 512px variants
- **AND** an installed launch opens the application's entry screen with standalone presentation where supported

#### Scenario: Use a platform-specific installation path
- **WHEN** a user installs through a supporting platform's browser or share menu
- **THEN** the installation has an appropriate local icon, including a maskable variant and an Apple touch icon for supporting platforms
- **AND** documentation describes the platform's installation path without promising a universal in-app installation prompt

#### Scenario: Continue without installation support
- **WHEN** installation or offline preparation is unsupported in the current environment
- **THEN** the served application remains usable as a normal website
- **AND** it does not falsely claim to be ready for an offline launch

### Requirement: Consistent deployment address and scope
The installed start address and offline application coverage SHALL follow the configured deployment base. Installation and updates SHALL keep a stable application identity within that deployment. Offline navigation within the application SHALL open the application rather than a network error, without covering unrelated paths outside its scope.

#### Scenario: Launch from a subdirectory deployment
- **WHEN** the production application is deployed and prepared under a configured non-root base path
- **THEN** its installation metadata, application files, and offline start resolve within that base
- **AND** its installed entry point can reopen without a network connection

#### Scenario: Update the same installed application
- **WHEN** a new release is published at the same deployment address
- **THEN** it preserves the existing installed application identity and start address
- **AND** unrelated website paths outside the configured application scope are not served as Touchline

### Requirement: Truthful offline-readiness feedback
The application SHALL report offline readiness only after the files required for a fresh launch have been successfully prepared. Network connectivity, installation alone, or an already-rendered screen SHALL NOT count as proof of readiness. Preparation failure SHALL leave the loaded application usable and SHALL NOT be presented as a local-data failure or successful preparation.

#### Scenario: Complete initial preparation
- **WHEN** all required application files have been prepared and offline launch support is active
- **THEN** the application exposes a concise offline-ready status
- **AND** the status refers to application availability, not backup or synchronization of user data

#### Scenario: Lose connectivity before preparation finishes
- **WHEN** initial preparation cannot finish because a required file is unavailable
- **THEN** no success status is shown for offline preparation
- **AND** the already-loaded application can continue using its available local workflows
- **AND** a later preparation attempt can succeed without deleting local records

#### Scenario: Distinguish application readiness from storage failure
- **WHEN** the application is prepared offline but local match, player, or jersey storage cannot load
- **THEN** existing storage-error and retry behavior remains available
- **AND** offline-readiness feedback does not imply that the local data loaded successfully

### Requirement: Fresh offline launch supports existing workflows
After successful preparation, the application SHALL reopen without network access in the same browser storage context while its application cache remains available. Existing match, player, jersey, preparation, and statistics workflows SHALL retain their local behavior without a remote request or login. A relaunch SHALL restore committed data, not promise recovery of session-only drafts or the previously selected screen.

#### Scenario: Reopen and continue a saved match offline
- **GIVEN** a prepared application and a successfully saved running match
- **WHEN** the application is closed and freshly opened without network access
- **THEN** the archive and saved match can be opened, and the clock is reconstructed from its persisted state
- **AND** a goal, its optional details, a valid substitution, and clock controls can be saved locally
- **AND** a subsequent offline reload retains the successful changes

#### Scenario: Prepare a new match offline
- **WHEN** the prepared application starts offline and the user creates a match
- **THEN** team entry, optional squad selection, and optional jersey generation or manual assignment remain available with locally saved directory and inventory data
- **AND** the preparation can be saved, skipped, or revisited with the existing commit and validation rules
- **AND** kickoff remains a separate action

#### Scenario: Maintain directory and inventory offline
- **WHEN** the prepared application starts offline and the user saves player profiles, archive or restore actions, jersey sets, jerseys, or preferred numbers
- **THEN** the existing explicit-save, validation, and failure behavior remains available
- **AND** successful changes survive an offline reload and can be used in match preparation and statistics

#### Scenario: First-ever visit without application files
- **WHEN** a browser with no prepared application first attempts to open the deployment without a connection
- **THEN** the application does not promise a successful launch or invent recovery of unavailable data
- **AND** documentation explains the need for one successful online preparation

### Requirement: Application resources are available locally
Files required for the application interface SHALL be served with the application and included in its offline preparation. Existing text typography and icons SHALL NOT depend on runtime requests to a font CDN. Resource changes SHALL preserve readable system-font fallbacks and existing accessible control labels.

#### Scenario: Start without font-CDN access
- **WHEN** all external network access is unavailable during a prepared offline launch
- **THEN** the application can render its locally supplied text fonts and vector icons
- **AND** rendering does not require Google Fonts or another remote font service

### Requirement: Explicit updates do not interrupt local work
An update SHALL NOT cause an automatic reload or navigation in an open application. User-requested reloads SHALL be eligible only on the match archive with empty team-creation inputs and no pending match, player, or jersey load or save. Ineligible requests SHALL retain the page and drafts without queuing a future reload. Eligibility SHALL be checked again immediately before reloading.

#### Scenario: Detect an update while recording
- **WHEN** a new release becomes available during a match, preparation, player editing, or jersey editing
- **THEN** the current screen, clock, and available drafts remain intact
- **AND** the update stays deferred without an automatic navigation or reload

#### Scenario: Defer with a creation draft or pending persistence
- **WHEN** an update is available and the archive creation form contains any team input, or any local load or save is pending
- **THEN** update application remains unavailable with an understandable explanation
- **AND** clearing or saving the input and completing persistence does not itself trigger a reload

#### Scenario: Apply from a safe archive
- **WHEN** an update is available, the archive is eligible, and the user explicitly chooses to update
- **THEN** the application rechecks eligibility and reloads into the prepared new release
- **AND** successfully committed match, player, and jersey data remains available

#### Scenario: Eligibility changes during update activation
- **WHEN** a user requested an update but new input, navigation, or local persistence makes the page ineligible before reload
- **THEN** the application does not reload or discard that work
- **AND** a later reload requires a new eligible user action

#### Scenario: Another browser tab activates an update
- **WHEN** another tab activates a new application release
- **THEN** the current tab does not automatically reload or navigate
- **AND** this safety behavior does not introduce support for concurrent edits to the same match in multiple tabs

### Requirement: Failed release preparation preserves the working application
Failure to download or prepare a new release SHALL leave the previously prepared application available for offline launches. The update UI SHALL NOT report successful application or clear local user data on failure. A later attempt SHALL be possible when the release becomes available.

#### Scenario: A new release cannot be prepared completely
- **WHEN** an update is discovered but one of its required application files fails to download
- **THEN** the current application does not reload into an incomplete release
- **AND** its previously prepared release remains usable after an offline relaunch
- **AND** available feedback describes an application-update failure rather than a match-save failure

### Requirement: PWA lifecycle is isolated from local user data
Installation, offline preparation, application updates, and application-cache cleanup SHALL NOT rewrite or remove saved matches, player-directory payloads, jersey inventory, or legacy match data. Existing repositories, storage identities, formats, read-only loading, and local commit/error semantics SHALL remain unchanged. PWA availability SHALL NOT depend on a backend or account.

#### Scenario: Install and update an existing browser profile
- **GIVEN** supported saved matches, players, inventory, and legacy localStorage match data
- **WHEN** offline preparation, installation, a release update, or application-cache cleanup occurs
- **THEN** committed data remains readable under the existing storage contracts
- **AND** PWA operations do not migrate, upload, rewrite, or delete those records and payloads
- **AND** legacy localStorage match data stays ignored and untouched

#### Scenario: Remove only application caches
- **WHEN** only application caches are removed while local match, player, and jersey stores are retained
- **THEN** an online launch can prepare the application again and read the retained records
- **AND** loss of an application cache is not treated as permission to replace a local store with empty data

### Requirement: Accessible availability and update guidance
Availability and update feedback SHALL be concise, keyboard accessible, and usable at widths of 320 CSS pixels and above. Status controls SHALL NOT cover match recording or focused editors. Standalone layouts SHALL keep controls clear of device safe areas and reachable with the keyboard open. Guidance SHALL distinguish offline availability from backup and future synchronization.

#### Scenario: Operate update controls on a narrow screen
- **WHEN** a user reaches an available update on the archive at 320px or 390px width, with enlarged text or a reduced-height viewport
- **THEN** update and defer controls remain reachable, have visible focus and touch targets at least 48 CSS pixels high, and do not cause horizontal overflow
- **AND** status changes are announced without taking focus or opening an unsolicited modal

#### Scenario: Use installed match controls and editors
- **WHEN** the installed application is used with device safe areas or an open software keyboard
- **THEN** existing match actions, editor fields, and save/close actions remain readable and reachable without overlapping system areas

#### Scenario: Understand offline and storage limitations
- **WHEN** a user reads the offline-use and installation guidance
- **THEN** it explains initial online preparation, cache eviction, local-storage deletion risks, and platform-specific installation behavior
- **AND** it explains that another origin or browser storage context does not automatically receive existing data
- **AND** it does not claim that this release includes cloud backup or multi-person synchronization
