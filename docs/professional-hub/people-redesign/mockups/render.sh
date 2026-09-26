#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f fonts.css ]; then
  echo "fonts.css missing — run ./generate-fonts.sh first" >&2
  exit 1
fi

CHROME="${CHROME:-/opt/pw-browsers/chromium-1194/chrome-linux/chrome}"
if [ ! -x "$CHROME" ]; then
  CHROME="$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)"
fi
if [ -z "${CHROME}" ] || [ ! -x "$CHROME" ]; then
  echo "no chrome binary" >&2
  exit 1
fi

render() {
  local html="$1" png="$2"
  timeout 12s "$CHROME" --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
    --user-data-dir="${TMPDIR:-/tmp}/people-redesign-mockups-chrome-$$" \
    --force-device-scale-factor=1 --virtual-time-budget=2000 \
    --window-size=1680,1137 --screenshot="$png" "file://$(pwd)/$html" \
    || true
  echo "rendered $png"
}

render 01-directory-split.html     01-directory-split.png
render 02-crest-wall.html          02-crest-wall.png
render 03-relationship-lanes.html  03-relationship-lanes.png
render 04-directory-plus.html      04-directory-plus.png
