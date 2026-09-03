#!/usr/bin/env bash
# Copy the kit into each hub so Cursor sees it inside that workspace.
set -euo pipefail

KIT="$(cd "$(dirname "$0")/.." && pwd)"
HUBS=(
  "/Users/adamrussell/Teaching Hub"
  "/Users/adamrussell/Projects/life-hub"
  "/Users/adamrussell/Projects/knowledge-hub"
  "/Users/adamrussell/Projects/tasks-hub"
)

copy_kit() {
  local dest="$1/design-kit"
  local css_dest="$dest"
  if [[ -d "$dest/css" ]]; then
    css_dest="$dest/css"
  else
    mkdir -p "$dest/snippets"
  fi
  mkdir -p "$css_dest" "$dest/snippets"
  cp "$KIT/AGENTS.md" "$dest/AGENTS.md"
  cp "$KIT/TASKS.md" "$dest/TASKS.md"
  cp "$KIT/css/tokens.css" "$css_dest/tokens.css"
  cp "$KIT/css/overlays.css" "$css_dest/overlays.css"
  cp "$KIT/css/chrome.css" "$css_dest/chrome.css"
  cp "$KIT/css/actions.css" "$css_dest/actions.css"
  cp "$KIT/css/sign-in.css" "$css_dest/sign-in.css"
  cp "$KIT/css/calendar.css" "$css_dest/calendar.css"
  cp "$KIT/snippets/"*.html "$dest/snippets/"
  echo "Synced $dest"
}

for hub in "${HUBS[@]}"; do
  if [[ -d "$hub" ]]; then
    copy_kit "$hub"
  else
    echo "Skip (missing): $hub" >&2
  fi
done
