# UI/UX pass — Paddle Stack

## The job

Do a UI/UX review of Paddle Stack and then implement the improvements. Audit
first, get my sign-off on the list, then build. Do not start editing before I
approve the list.

## Who uses this and where

This is the context that should drive every call you make. Paddle Stack is used
**at the court, mid-session, not at a desk**:

- Outdoors in daylight. Screen brightness and glare are real. Light mode has to
  survive direct sun; dark mode gets used indoors and at dusk.
- One phone, passed between players, often held one-handed while holding a
  paddle. Thumb reach and target size matter more than density.
- Used in 3-10 second bursts between points: record a winner, glance at who's
  up, hand the phone back. The organiser is not reading the screen, they're
  scanning it from arm's length.
- Interruptions are the norm: someone shows up late, someone leaves, two people
  want to swap. Those flows are the ones that get fumbled under time pressure.
- No network. Nothing can show a spinner waiting on a server, and nothing can
  blame a failure on connectivity.

Rank every proposed change by how much it helps **the organiser standing on a
court with 12 people waiting**. A change that only looks nicer in a screenshot
ranks below a change that removes a tap from recording a score.

## What exists already — extend it, don't replace it

- `src/ui/theme.ts` — colour palettes (dark + light, identical keys), `space`,
  `radius`, `family`, the type ramp and `scaleFont`. **Every colour and size you
  use must come from here.** If you need a value that does not exist, add a
  named token with a comment explaining it, and use it everywhere it applies.
- `src/ui/ThemeContext.tsx` + `themedStyles()` — the styling pattern. New
  styles go in a `useStyles` block, not inline literals.
- `src/ui/components.tsx` — Screen, Card, Row, Grid, Title, Heading, Muted,
  Button, Input, SearchField, Segmented, Stepper, ToggleRow, TierBadge, Sheet,
  EmptyState. Reuse or improve these rather than hand-rolling a new variant in
  a screen file. If three screens need the same thing, it belongs here.
- `src/ui/motion.ts` — the animation presets. All motion goes through these and
  must honour `ReduceMotion.System`. No new ad-hoc durations.
- `src/ui/useResponsive.ts` — breakpoints keyed off the *short side*, column
  counts, gutters, font scale. Respect this; don't add raw `Dimensions` checks.

Note: Android does not synthesise font weight. `fontWeight: '700'` on a loaded
regular font silently does nothing — you must name a loaded family from
`family`. Watch for places that get this wrong.

## What to actually look at

Go through these in order and report concrete findings with file:line, not
general advice:

1. **The score-recording loop** (`src/ui/MatchCard.tsx`, `app/(tabs)/index.tsx`
   active session). How many taps from "point ends" to "next round is up"?
   Where can a mis-tap lose data, and is it undoable? Is the winner control big
   enough to hit without looking?
2. **Hierarchy on the live session screen.** `app/(tabs)/index.tsx` is 1200
   lines rendering setup, active courts, add-players, settings, standings and
   history. At arm's length, is it obvious what to do next? What should be
   demoted or collapsed?
3. **Mid-session edits** — add a player, sub someone in, swap two players,
   remove someone. These are the fumble-prone flows. Is the selected state
   legible? Can a half-finished swap be abandoned cleanly?
4. **Confirmations and feedback.** Everything currently uses `Alert.alert`
   (see `index.tsx`, `players.tsx`, `settings.tsx`, `session/[id].tsx`). Decide
   per case: a blocking system dialog, an inline undo, or nothing at all.
   Destructive-and-permanent deserves a dialog; a recorded winner deserves a
   silent, undoable tap. There is no haptic feedback anywhere — say whether
   that's worth adding and where.
5. **Empty, first-run and edge states.** No players, no rounds yet, one player
   short of a court, every court full with nobody resting, a 30-player roster.
   Also the `app/tutorial.tsx` path: does a first-time organiser get moving
   without reading it?
6. **Touch targets and reachability.** Minimum 48dp for anything tappable.
   Primary actions within thumb reach on a 6.7" phone; destructive actions
   deliberately out of it.
7. **Contrast and readability.** Check real contrast ratios against both
   palettes, especially `textDim`/`textFaint` on `surfaceAlt`, the tier colours,
   and `accentInk`. Target WCAG AA (4.5:1 body, 3:1 for large text and UI
   edges). Also check behaviour at OS font scale 1.3x and 2.0x — call out
   anything that clips or overlaps.
8. **Accessibility.** There are ~20 `accessibilityLabel`s and ~20
   `accessibilityRole`s across the app. Find the interactive elements that have
   none, and the labels that read badly aloud (a court card should announce who
   is playing and whether a result is recorded).
9. **Tablet and landscape.** `courtColumns`/`playerColumns` already adapt — does
   the result actually look intentional at `md` and `lg`, or just stretched?

## Constraints

- Read https://docs.expo.dev/versions/v57.0.0/ before writing code. Expo 57 /
  RN 0.86 / React 19. APIs have changed; don't go from memory.
- **No new dependencies without asking me first.** If something needs
  `expo-haptics` or a gesture library, propose it with a reason and wait.
- Do not touch `src/pairing/engine.ts`, `src/db/`, or `src/domain/types.ts`
  unless a UI change genuinely requires it — and flag it loudly if so. Pairing
  fairness and the data layer are verified separately and I don't want them
  moving in a UI pass.
- Keep it offline-first. No telemetry, no network calls, no accounts.
- Match the existing code's voice: tokens over literals, `themedStyles` over
  inline styles, and comments that explain *why* a non-obvious choice was made
  (the existing comments are the house style — follow them).
- Copy stays plain-spoken and specific, like the current strings ("Who's here?",
  "Keep rounds rolling"). No marketing tone, no exclamation marks.

## Deliverable

**Phase 1 — audit.** A prioritised list. For each item: the problem, where it is
(`file:line`), why it matters at the court, the fix, and an effort estimate
(S/M/L). Separate "high impact" from "polish" and put the count of each at the
top. Tell me which three you'd do first if I only had time for three.

**Phase 2 — implement**, after I pick. Work in reviewable chunks: shared
tokens/components first, then screen by screen. After each chunk run
`npm run verify` and report the result honestly. Tell me what you changed and
what I should look at on-device, since you can't see the running app.

If a finding is a judgement call rather than a clear defect, say so and give me
your recommendation instead of hedging.
