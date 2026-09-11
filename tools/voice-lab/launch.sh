#!/bin/bash
set -euo pipefail
LAB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$LAB_DIR"

if [[ "$(uname -s)" != Darwin || "$(uname -m)" != arm64 ]]; then
  echo "Chadwick Voice Lab needs Apple Silicon macOS. Open a native terminal outside Rosetta."
  exit 1
fi

mkdir -p .runtime/uv-cache .runtime/tmp
export UV_CACHE_DIR="$LAB_DIR/.runtime/uv-cache"
export TMPDIR="$LAB_DIR/.runtime/tmp"
export UV_LINK_MODE=clone

if command -v uv >/dev/null 2>&1; then
  LAB_UV="$(command -v uv)"
elif [[ -x "$LAB_DIR/.runtime/bootstrap/bin/uv" ]]; then
  LAB_UV="$LAB_DIR/.runtime/bootstrap/bin/uv"
else
  echo "Installing the small launcher inside Voice Lab (first run only)…"
  python3 -m venv "$LAB_DIR/.runtime/bootstrap"
  "$LAB_DIR/.runtime/bootstrap/bin/python" -m pip --disable-pip-version-check --no-cache-dir install 'uv==0.12.1'
  LAB_UV="$LAB_DIR/.runtime/bootstrap/bin/uv"
fi

# Reuse an existing native Python, or keep uv's downloaded Python in this lab.
LAB_PYTHON="$("$LAB_UV" python find --system --no-python-downloads 3.13 2>/dev/null || true)"
export UV_PYTHON_INSTALL_DIR="$LAB_DIR/.runtime/python"
if [[ -z "$LAB_PYTHON" ]]; then LAB_PYTHON=3.13; fi

echo "Preparing Chadwick Voice Lab…"
SYNC_ARGS=(sync --locked --python "$LAB_PYTHON")
if [[ -d "$LAB_DIR/.venv" ]]; then
  DATALLESS_SAMPLE="$(find "$LAB_DIR/.venv" -flags +dataless -type f -print -quit 2>/dev/null || true)"
  if [[ -n "$DATALLESS_SAMPLE" ]]; then
    echo "Restoring Voice Lab dependencies removed by iCloud optimisation…"
    SYNC_ARGS+=(--reinstall)
  fi
fi
"$LAB_UV" "${SYNC_ARGS[@]}"
exec "$LAB_DIR/.venv/bin/python" "$LAB_DIR/server.py" "$@"
