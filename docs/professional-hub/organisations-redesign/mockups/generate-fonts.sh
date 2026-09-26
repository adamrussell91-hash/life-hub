#!/usr/bin/env bash
# Regenerates fonts.css (Inter, base64-embedded) for the Organisation mockups.
# Not committed itself — 1.7MB of base64 — run this instead.
set -euo pipefail
cd "$(dirname "$0")"

mkdir -p .fonts-tmp
WEIGHTS=(400 500 600 700)
CSS_URLS=()
for w in "${WEIGHTS[@]}"; do
  url=$(curl -sSL "https://fonts.googleapis.com/css2?family=Inter:wght@${w}&display=swap" \
    -H "User-Agent: Mozilla/5.0" | grep -o 'https://fonts.gstatic.com[^)]*' | head -1)
  curl -sSL -o ".fonts-tmp/Inter-${w}.ttf" "$url"
done

node -e '
const fs = require("fs");
const weights = ["400","500","600","700"];
let css = "";
for (const w of weights) {
  const b64 = fs.readFileSync(`.fonts-tmp/Inter-${w}.ttf`).toString("base64");
  css += `@font-face{font-family:"Inter";font-style:normal;font-weight:${w};src:url(data:font/ttf;base64,${b64}) format("truetype");}\n`;
}
fs.writeFileSync("fonts.css", css);
console.log("wrote fonts.css:", fs.statSync("fonts.css").size, "bytes");
'
rm -rf .fonts-tmp
