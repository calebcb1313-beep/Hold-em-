# Hold'em Royale

A complete no-limit Texas Hold'em game in plain HTML/CSS/JS, with a pure rules engine,
thinking AI opponents, and an Android WebView wrapper.

## Run it

No build step or dependencies:

```bash
cd www
python3 -m http.server 8000
# open http://127.0.0.1:8000
```

Opening `www/index.html` directly also works; the service worker is skipped for `file://`.

## Test the rules

```bash
node tools/engine-test.js
```

The suite covers hand categories, kickers, wheel straights, ties, side pots, folded
chips, odd chips, minimum raises, illegal actions, heads-up blinds, short all-ins that
do not reopen betting, full raises that do, all-in calls, blind all-ins, folded-pot
reporting, deterministic shuffles, exact replay reconstruction, and **3,000 simulated
AI-vs-AI hands with a chip-conservation check after every action and settlement**.

Browser UI assertions (real game in a 390px iframe, checking the raise panel and a
reconstructed four-way all-in replay):

```bash
bash tools/ui-test.sh
# open http://127.0.0.1:8000/_uitest.html and wait for UI TEST PASS
```

## Architecture

- `www/engine.js` — the authoritative rules engine. It has no DOM, timers, or AI.
  `Table.legalActions(seat)` computes every legal move from state; `Table.act()` rejects
  anything else. The shuffle is seeded, so a hand can be reproduced exactly.
- `www/poker-core.js` — cards, seeded shuffle, hand evaluator, names, equity helper.
- `www/bots.js` — opponent personalities, ranges, pot-odds decisions, memory, tells.
- `www/game.js` — UI, animation, sound, career/tournament flow. It renders engine state
  and only submits actions the engine reports as legal, and records each hand for replay.
- `www/replay.js` — reconstructs recorded hands from their seed and action log and shows
  every step, including side pots and winners.
- `www/theme.css`, `style.css`, `skin.css` — generated cards, chips, felt, saloon art,
  responsive layout, reduced-motion handling.
- `tools/engine-test.js` — rules and conservation tests.
- `android/` — thin WebView host; `tools/sync-web.sh` copies `www/` into its assets.

### Rules implemented

- Button and blinds rotate every hand. Heads-up: the button posts the small blind,
  acts first pre-flop, and acts last after the flop.
- Pre-flop, flop, turn, river, showdown; one card burns before each community street.
- No-limit betting with strict minimum raises. A full raise reopens action; a short
  all-in raise does not reopen raising for players who have already acted.
- Side pots from total contributions, including dead folded chips. Folded players can
  never win. Uncalled amounts come back to the bettor.
- Standard five-card ranking with kickers and split pots.
- **Odd-chip rule:** a remainder is awarded one chip at a time in clockwise order
  starting with the first seat left of the button.
- Every settlement asserts that the sum of all stacks equals the table total.
- A player with no chips is marked out and cannot be dealt in; cash tables seat a
  replacement, while tournaments record the finishing place.

## Assumptions

- Chips are integers; there are no antes, straddles, or run-it-twice deals.
- In cash games the roster can change between hands, so a replacement player's buy-in
  changes the table total *between* hands. Within every hand, and at every settlement,
  chips are conserved exactly. Tournaments keep a fixed field and total.
- The engine's odd-chip order is the documented house rule above; it applies to every
  side pot independently.

## Hand replays

The last twelve hands are saved locally with the per-hand seed, starting stacks, button,
and every engine-validated action. Choose **Replays** in the main menu to open a hand and
step through the deal, betting, board, side pots and result. Replays are reconstructed by
the same engine, so they are exact rather than a video recording.

## Opponents and presentation

Each bot has a distinct temperament (tight-aggressive, loose-passive, maniac, trapper,
calling station, bully) expressed through range width, aggression, bluff frequency,
fold-to-pressure and trap rates. Decisions use hand strength, position, pot odds, stack
depth, betting history, and a private read on each opponent. Bots pause for a
human-feeling beat, vary that beat with decision difficulty, and talk at the table.

The interface uses a walnut-and-brass saloon palette with generated SVG/CSS cards,
chips, portraits, and table furniture. Turn, fold, all-in, win, and urgency states each
pair color with text, shape, or motion. Controls are touch-sized, with a raise slider,
Min/½-pot/Pot/All-in presets, and `prefers-reduced-motion` support.

## Build the Android app

The workflow in `.github/workflows/apk.yml` builds on every push to `main`.

Locally, with JDK 17 and Android SDK (platform 34, build-tools 34.0.0):

```bash
bash tools/sync-web.sh
cd android
./gradlew assembleRelease bundleRelease
```

Release signing reads `android/keystore.properties` (git-ignored). Keep the keystore and
its passwords safe; every Play Store update must use the same key.
