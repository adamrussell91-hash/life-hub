#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f fonts.css ]; then
  echo "fonts.css missing — run ./generate-fonts.sh first" >&2
  exit 1
fi

CHROME="${CHROME:-/usr/local/bin/google-chrome}"
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
    --user-data-dir="${TMPDIR:-/tmp}/pd-event-mockups-chrome-$$" \
    --force-device-scale-factor=1 --virtual-time-budget=2000 \
    --window-size=1680,1050 --screenshot="$png" "file://$(pwd)/$html" \
    || true
  echo "rendered $png"
}

render 01-calendar-compose.html 01-calendar-compose.png
render 02-pd-log-wizard.html    02-pd-log-wizard.png
render 03-split-preview.html    03-split-preview.png
