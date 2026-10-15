# Product design principles

This is the living, project-wide record of durable UX and visual-design
decisions. OpenSpec specs remain the source of truth for behavior requirements;
change-specific `design.md` files can describe implementation details. Add
decisions here when they are agreed, and revise them when the product
direction changes.

## Product context

Touchline helps people record a football match, often from a phone near the
pitch. It should make the next useful action obvious during play while keeping
more detailed preparation available to people who want it.

## Principles

### 1. Design phone-first for real match conditions

Start with narrow phone layouts, short viewports, touch, and quick glances.
Keep primary actions reachable, text readable, and important content clear of
fixed controls and safe areas. Check narrow widths, long team and player names,
landscape layouts, and keyboard behavior. Desktop should remain comfortable
without introducing a separate interaction model.

### 2. Make the common action clear and quick

Prioritize the score, match phase, clock, and the next relevant action. Prefer
clear hierarchy and few steps over decorative UI. Use plain, consistent labels
that say what an action does, and make saving, missing setup, and errors
visibly distinct.

### 3. Keep optional tracking genuinely optional

A match must remain useful without player tracking or jersey assignments.
Detailed preparation should not block basic match recording or kickoff, and
skipping an optional step must not look like an error or an incomplete save.

### 4. Reveal detail when it is useful

Guide people through related tasks in context instead of making them hunt
through separate areas. Keep secondary choices and advanced details from
competing with the primary task; let people return to preparation when it is
still editable.

### 5. Make state and feedback honest

Say whether something is not configured, a draft, or saved. Confirm success
only after it is saved, explain what needs attention, and show the next useful
action where the user needs it.

### 6. Keep the interface accessible and restrained

Use sufficient contrast, visible keyboard focus, semantic controls, and touch
targets of at least 48 px for primary actions. Keep motion purposeful and avoid
decoration that competes with match information.

## Visual foundation

Continue the app's restrained green identity and existing typography:

| Role | Direction |
| --- | --- |
| Main surface | `#FFFFFF` |
| Page background | `#F2F4EF` |
| Primary text | `#17251D` |
| Secondary text | `#526156` |
| Primary action | `#204D38` |
| Separators | `#E4E8E0` |
| Body and controls | DM Sans |
| Compact score display | Space Grotesk |

Treat these as starting tokens, not a substitute for checking contrast in each
actual combination.

## First product decision: optional pre-kickoff workflow

When someone chooses **New match**, start a guided pre-kickoff preparation flow
after they enter the teams, rather than leaving squad and jersey setup as
separate blocks to discover later on the match page.

- Preparing the own-side squad is optional and can be skipped.
- Choosing a jersey set and preparing assignments is also optional and can be
  skipped independently.
- Skipping either step must leave the match usable without that tracking.
- Finishing preparation returns to the match before kickoff; starting the match
  remains a separate, deliberate action.
- Preparation remains editable before kickoff.

The flow should reduce hunting and make the available preparation clear without
turning it into a requirement for people who only want to record a match.
