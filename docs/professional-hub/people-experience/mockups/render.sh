#!/usr/bin/env bash
# Re-renders the six People mockup PNGs from their HTML sources.
# Requires fonts.css — run ./generate-fonts.sh first if it's missing.
# Requires a headless Chromium/Chrome binary — set CHROME env var to override.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f fonts.css ]; then
  echo "fonts.css missing — run ./generate-fonts.sh first" >&2
  exit 1
fi

CHROME="${CHROME:-/opt/pw-browsers/chromium-1194/chrome-linux/chrome}"
if [ ! -x "$CHROME" ]; then
  CHROME="$(command -v chromium || command -v google-chrome || command -v chromium-browser)"
fi

render() {
  local html="$1" png="$2" height="$3"
  "$CHROME" --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
    --force-device-scale-factor=1 --virtual-time-budget=3000 \
    --window-size=1680,"$height" --screenshot="$png" "file://$(pwd)/$html" 2>/dev/null
  echo "rendered $png"
}

render 01-people-home.html     01-people-home.png     900
render 02-person-profile.html  02-person-profile.png  1020
render 03-person-brief.html    03-person-brief.png    975
render 04-network-ecology.html 04-network-ecology.png 1050
render 05-organisation.html    05-organisation.png    980
render 06-your-network.html    06-your-network.png    1050
