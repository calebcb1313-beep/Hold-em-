#!/usr/bin/env bash
# Build a signed, installable debug APK without Gradle (aapt2 + javac + d8 + apksigner).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export JAVA_HOME="${JAVA_HOME:-$HOME/tools/jdk17}"
export PATH="$JAVA_HOME/bin:$PATH"
SDK="${ANDROID_SDK_ROOT:-$HOME/tools/sdk}"
BT="$SDK/build-tools/34.0.0"
PLATFORM="$SDK/platforms/android-34/android.jar"
OUT="$ROOT/build/apk"
PKG="app.holdem.poker"

for f in "$JAVA_HOME/bin/java" "$BT/aapt2" "$BT/d8" "$BT/apksigner" "$BT/zipalign" "$PLATFORM"; do
  [ -e "$f" ] || { echo "missing build tool: $f" >&2; exit 1; }
done

rm -rf "$OUT"
mkdir -p "$OUT/compiled" "$OUT/classes" "$OUT/dex" "$OUT/gen"

bash tools/sync-web.sh

# aapt2 rejects a package attribute in an AGP-8 manifest, so link against a copy that has one.
sed 's|<manifest xmlns:android="http://schemas.android.com/apk/res/android">|<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="'"$PKG"'">|' \
  android/app/src/main/AndroidManifest.xml > "$OUT/AndroidManifest.xml"
grep -q "package=\"$PKG\"" "$OUT/AndroidManifest.xml"

"$BT/aapt2" compile --dir android/app/src/main/res -o "$OUT/compiled/res.zip"
"$BT/aapt2" link -o "$OUT/base.apk" -I "$PLATFORM" \
  --manifest "$OUT/AndroidManifest.xml" \
  -A android/app/src/main/assets \
  --java "$OUT/gen" \
  --min-sdk-version 24 --target-sdk-version 34 \
  --version-code 2 --version-name 2.0 \
  --auto-add-overlay "$OUT/compiled/res.zip"

find "$OUT/gen" android/app/src/main/java -name '*.java' > "$OUT/sources.txt"
"$JAVA_HOME/bin/javac" -encoding UTF-8 -classpath "$PLATFORM" -d "$OUT/classes" @"$OUT/sources.txt"

find "$OUT/classes" -name '*.class' > "$OUT/classes.txt"
"$BT/d8" --lib "$PLATFORM" --min-api 24 --output "$OUT/dex" $(cat "$OUT/classes.txt")

(cd "$OUT/dex" && zip -q -j "$OUT/base.apk" classes.dex)
"$BT/zipalign" -f -p 4 "$OUT/base.apk" "$OUT/aligned.apk"

KS="$ROOT/tools/debug.keystore"
if [ ! -f "$KS" ]; then
  "$JAVA_HOME/bin/keytool" -genkeypair -keystore "$KS" -storepass android -keypass android \
    -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Android Debug,O=Android,C=US" >/dev/null 2>&1
fi

"$BT/apksigner" sign --ks "$KS" --ks-pass pass:android --key-pass pass:android \
  --out "$ROOT/holdem-royale.apk" "$OUT/aligned.apk"
"$BT/apksigner" verify "$ROOT/holdem-royale.apk"
echo "APK: $ROOT/holdem-royale.apk"
ls -lh "$ROOT/holdem-royale.apk"
unzip -l "$ROOT/holdem-royale.apk" | tail -3
