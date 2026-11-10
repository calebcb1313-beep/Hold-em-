# Hold'em Royale

Offline no-limit Texas Hold'em in plain HTML/CSS/JS, wrapped as an Android app.

- `www/` is the whole game. Open `www/index.html` in a browser to play.
- `android/` is a thin WebView host that loads `android/app/src/main/assets/www/`.

## What is in the game

- **Career map** — six cash tables from a hometown game to the Legends Room. Buy in, grow your stack to the
  goal, cash out, unlock the next room. Your bankroll carries between tables; busting costs the buy-in.
- **Tournaments** — a six-player sit and go at every unlocked room. Equal stacks, blinds up every eight hands,
  eliminations, a final table, winner takes the prize and a trophy for that circuit.
- **Opponents with personalities** — sharks, nits, calling stations, maniacs, bullies, trappers and more.
  Names, looks and playing styles are generated per table, and every bot re-rolls its mood each hand.
- **Adaptive bots with memory** — each bot keeps a private book on every opponent (how often they fold to
  bets, how often they call, how aggressive they are, what they show down) and adjusts its bluffs, calls and
  value bets. Shove every hand and they notice, widen up and start calling.
- **Progression** — XP and levels, stats, best hand, best pot, table clears and tournament trophies.

## Build the APK

The workflow in `.github/workflows/apk.yml` builds a debug APK on every push to `main`
(Actions → latest run → Artifacts → `holdem-royale-apk`).

To also build a signed release APK and Play Store AAB, add these repository secrets:
`RELEASE_KEYSTORE_BASE64` (base64 of the keystore), `RELEASE_STORE_PASSWORD`, `RELEASE_KEY_ALIAS`,
`RELEASE_KEY_PASSWORD`. Without them the workflow only builds the debug APK.

Locally, with JDK 17 and Android SDK (platform 34, build-tools 34.0.0):

```bash
bash tools/build-apk.sh      # Gradle-free debug build -> holdem-royale.apk
```

Or with Gradle:

```bash
bash tools/sync-web.sh
cd android && ./gradlew assembleRelease bundleRelease
```

Release signing reads `android/keystore.properties` (git-ignored), which points at a keystore outside git.
Keep both files safe: a Play Store listing must be signed with the same key for every update. The local
keystore generated for this workspace is `tools/release.keystore`; back it up before publishing.

After editing anything in `www/`, run `bash tools/sync-web.sh` (the Gradle workflow does this for you).
