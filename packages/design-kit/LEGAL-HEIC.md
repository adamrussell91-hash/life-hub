# HEIC conversion — legal note

Life Hub’s preferred HEIC path is **native decode** (Safari / platforms that
can `createImageBitmap` a HEIC blob) and re-encode to JPEG in-canvas. That path
uses no third-party HEIC codec.

When native decode fails (common on desktop Chromium), `hub-heic.js` can fall
back to [`heic-to`](https://github.com/hoppergee/heic-to), which embeds
**libheif** under **LGPL-3.0**.

## Obligations if the LGPL fallback is enabled

`ensureWebImage(..., { enableLgplConverter: true })` (the default in this
personal hub) means you are shipping LGPL object code (WASM) to the browser.

At minimum for this private Life Hub:

1. Keep this notice and the `heic-to` / libheif license texts available in the
   repo (`node_modules/heic-to` and upstream libheif LICENSE).
2. Do not statically link a proprietary fork of libheif into a closed binary
   without offering LGPL relicensing / object files as required.
3. Before a **public** or multi-tenant release, re-run legal review or ship
   native-only (`enableLgplConverter: false`) and ask users to export JPEG/PNG.

Round D parked HEIC as “post legal”; this file is the gate. Enabling the
fallback here is an explicit product choice for Adam’s private hubs.
