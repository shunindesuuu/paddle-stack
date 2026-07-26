# Paddle Stack

Offline pickleball session manager — the paddle stack at your court, in an app.
Add your players, check in who showed up, and let it build fair matchups round
after round. No account, no network; everything lives in a local SQLite database
on the device.

## Running it

```bash
npm install
npm start          # then scan the QR with Expo Go
npm run android    # or build straight to a connected device / emulator
```

`npm run android` needs Android Studio installed. `npm start` + Expo Go is the
fastest way to try it on a real phone.

## Verifying changes

The pairing logic and the whole data layer run headless under Node, so you can
check behaviour without launching the app:

```bash
npm run verify        # typecheck + engine + database (96 checks)
npm run verify:engine # pairing fairness, rotation, swaps
npm run verify:db     # every SQL query + every migration, against node:sqlite
npm run simulate      # a whole night: 25 players, 4 courts, 15 rounds
```

`npm run simulate [players] [courts] [rounds]` plays a full session against the
real database and engine, then reports whether it was actually fair — games
played spread, longest bench run, distinct vs repeat partnerships, and the
widest skill gap on any court. Useful for sanity-checking a change to the
pairing weights against a group size you actually play with.

`verify:db` swaps only the SQLite driver — the repository code under test is
exactly what runs on device.

## How pairing works

Each player has a tier (Beginner / Intermediate / Advanced) which maps to a
numeric weight internally. Every round is chosen by sampling several hundred
candidate arrangements and scoring each on three objectives:

| Objective | What it measures |
|---|---|
| Balance | How close the two sides of a court are in combined tier weight |
| Freshness | How often these players have already partnered or faced off |
| Rest | Whether sit-outs are spread evenly |

The four pairing styles are just different weightings of the same scorer:

- **Balanced + Rotation** *(default)* — fair games while still mixing people up.
- **Balanced** — closest possible skill match, will happily repeat a good pairing.
- **Rotation** — prioritises new partners and opponents; tolerates lopsided games.
- **Random** — pure shuffle.

Two rules sit outside the scorer because they're non-negotiable:

- **Who sits is decided by games played, not by score.** Whoever has played most
  sits first, ties broken randomly. Leaving this to the scorer let players drift
  several games behind over a long session.
- **Doubles teams are split exactly.** With four players on a court there are
  only three possible 2v2 splits, so the closest one is picked outright rather
  than approximated.

### Manual overrides

Every generated line-up is editable. Tap a player, then tap another player — on
any court or on the bench — to swap them. Tap the same player twice to cancel.
Swaps are scoped to a single round, and are written straight to the database.

Tap-to-swap is used instead of drag-and-drop: it's more reliable one-handed at a
noisy court, and it works with screen readers. `react-native-gesture-handler`
and `reanimated` are already installed if you'd rather add dragging later.

## Recording results

Matches record **who won**, not a score. Mid-session nobody wants to type two
numbers on a phone, and nothing in the app consumes the margin — only the
winner feeds the leaderboard. Tap the cup on the winning side; tap it again to
clear a mis-tap. A match with no winner still counts as a game played, but as
neither a win nor a loss.

## Continuous play (auto-queue)

**Keep rounds rolling** turns a session into a rented-court night: the first
round is on court the moment the session opens, and as soon as every court has
a winner the next round starts by itself. The only taps are recording who won,
until you end the session.

The trigger is *every court in the current round having a result* — not a
timer. Two consequences worth knowing:

- With multiple courts it advances only when **all** of them have finished. If
  one court is still playing, the others wait.
- Correcting the result of an *older* round never starts a new one; only the
  current round can advance the queue.

**Skip to next round** is still there for jumping ahead when a game gets
abandoned. The toggle is remembered, so next week's session starts the same way.

## Up next (the queue)

The Play tab always shows the round the app intends to play next, before it's
committed. **Shuffle matchups** re-rolls it, **Start next round** commits it.

The preview lives in component state, not the database. That matters: an
unplayed round must never feed back into the history the pairing engine learns
from, or shuffling would quietly corrupt the partner and opponent counts.

Waiting players are listed in the order they'll come on — fewest games first,
which is the same rule the engine uses to choose who sits out, so the queue
always agrees with what actually happens.

## Light and dark mode

Both schemes ship. The app follows the device by default; **Settings → Appearance**
overrides it to always-light or always-dark, and the choice is saved in the
database so it survives a restart.

Components never name a colour directly. `src/ui/theme.ts` defines two palettes
with identical keys, and `themedStyles()` in `src/ui/ThemeContext.tsx` builds a
stylesheet per palette (cached, so it's created once per scheme rather than per
render):

```tsx
const useStyles = themedStyles((c) => ({
  name: { color: c.text, fontSize: font.md },
}));
```

One wrinkle worth knowing: the brand lime is a **fill** colour, not a text
colour. It's readable as a button background in both schemes but fails contrast
as text on a light page, so the palette carries a separate `accentInk` for
accent-coloured text. Use `accent` for fills, `accentInk` for type.

## Typography and icons

Fredoka (rounded, characterful) carries titles, headings, scores and stats;
Outfit (geometric, tall x-height) does the UI text where 12–14px legibility
matters. Both load behind the splash screen so there's no flash of system font.

**Name a family, never a `fontWeight`.** Android does not synthesise weight for
custom fonts — `fontWeight: '700'` on a regular-weight file silently renders
regular. Every weight is its own loaded family, and `family` is injected into
stylesheet builders so it's hard to forget:

```tsx
const useStyles = themedStyles(({ c, font, family }) => ({
  name: { color: c.text, fontSize: font.md, fontFamily: family.semibold },
}));
```

Icons all route through [src/ui/Icon.tsx](src/ui/Icon.tsx), a named vocabulary
over Ionicons. Emoji were used originally and were a mistake: they render as
full-colour glyphs that ignore the active tint and look different on every
Android skin.

## Responsive layout

Phone-first. The base design targets an ordinary phone; bigger screens add
density and a little type scale rather than the phone being a shrunken tablet.
Everything keys off live window width, not a static device check, so
split-screen and rotation behave correctly.

| | xs (<360) | sm (phone) | md (600+) | lg (900+) |
|---|---|---|---|---|
| Courts per row | 1 | 1 | 2 | 2–3 |
| Player columns | 1 | 2 | 3 | 4 |
| Gutter | 12 | 16 | 20 | 24 |
| Type scale | 0.94× | 1.0× | 1.06× | 1.12× |

Content is only width-capped at `md` and above; phones use the full width
instead of sitting in a narrow column.

Use `<Grid>` / `<GridCell columns={n}>` for anything multi-column. They size
cells with padding rather than `gap` plus a shrunken percentage — `width: 49%`
next to `gap: 8` overflows the row by a fraction of a pixel and silently
collapses the grid to a single column, which is a genuinely hard bug to spot.

## Project layout

```
app/                     expo-router routes
  (tabs)/index.tsx       Play — session setup and the live session
  (tabs)/players.tsx     Roster management
  (tabs)/history.tsx     Past sessions + all-time leaderboard
  (tabs)/settings.tsx    Appearance, data summary, erase-all
  session/[id].tsx       Read-only view of a past session
src/
  domain/types.ts        Core types, tier weights. No React or DB imports.
  pairing/engine.ts      Round generation, scoring, swapping
  db/ddl.ts              Schema statements (shared by app and tests)
  db/driver.ts           SQLite seam that makes the repo testable
  db/client.ts           Production expo-sqlite connection
  db/repo.ts             Every SQL query in the app
  ui/theme.ts            Light + dark palettes and sizing tokens
  ui/ThemeContext.tsx    Palette resolution and themedStyles()
  ui/useResponsive.ts    Breakpoints driven by live window width
scripts/                 Headless verification harnesses
```

## Changing the schema

Bump `SCHEMA_VERSION` in `src/db/ddl.ts` and append a new array of statements to
`migrations`. Entry *N* upgrades a database from version *N* to *N+1*; the
applied version is tracked in SQLite's `user_version` pragma.

## Notes

- Deleting a player who already has recorded games archives them instead, so old
  results keep showing a name. Archived players can be restored.
- Only matches with a recorded score count toward wins and losses. An unscored
  match still counts as a game played.
- Session history is per-session for pairing purposes: starting a new session
  gives everyone a clean slate for partner/opponent freshness.
