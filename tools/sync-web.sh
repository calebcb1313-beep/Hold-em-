#!/usr/bin/env bash
# Copy the web game into the Android app's asset folder.
set -euo pipefail
cd "$(dirname "$0")/.."
DEST=android/app/src/main/assets/www
rm -rf "$DEST"
mkdir -p "$DEST"
cp www/*.html www/*.css www/*.js www/*.svg www/*.png www/*.webmanifest "$DEST"/
# The service worker only works over http(s); the APK loads from file://.
rm -f "$DEST/sw.js"
echo "synced web assets -> $DEST ($(ls -1 "$DEST" | wc -l) files)"
