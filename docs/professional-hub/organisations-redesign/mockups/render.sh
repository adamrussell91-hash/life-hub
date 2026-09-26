#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f fonts.css ]; then
  echo "fonts.css missing — run ./generate-fonts.sh first" >&2
  exit 1
fi

CHROME="${CHROME:-$(ls -d "$HOME"/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-*/chrome-headless-shell 2>/dev/null | tail -1)}"
if [ ! -x "$CHROME" ]; then
  CHROME="$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)"
fi
if [ -z "${CHROME}" ] || [ ! -x "$CHROME" ]; then
  echo "no chrome binary" >&2
  exit 1
fi

render() {
  local html="$1" png="$2"
  "$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
    --user-data-dir="${TMPDIR:-/tmp}/org-redesign-mockups-chrome-$$" \
    --force-device-scale-factor=1 --virtual-time-budget=2000 \
    --window-size=1680,1137 --screenshot="$png" "file://$(pwd)/$html" \
    >/dev/null 2>&1 || true
  echo "rendered $png"
}

render 01-crest-wall.html    01-crest-wall.png
render 02-organisation.html  02-organisation.png
render 03-compare.html       03-compare.png
