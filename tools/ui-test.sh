#!/usr/bin/env bash
# Browser UI assertions: phone raise panel + reconstructed side-pot replay.
# Opens a 390px iframe containing the real game, runs the checks, and prints
# PASS/FAIL in the page. Requires a browser; no npm packages.
set -euo pipefail
cd "$(dirname "$0")/.."
cp tools/ui-harness.html www/_uitest.html
trap 'rm -f www/_uitest.html' EXIT
PORT="${PORT:-8000}"
echo "UI tests: http://127.0.0.1:${PORT}/_uitest.html"
echo "Open that URL and look for UI TEST PASS. Ctrl+C to stop."
python3 -m http.server "$PORT" --directory www
