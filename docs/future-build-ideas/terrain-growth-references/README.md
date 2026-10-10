# Upstream terrain and growth source snapshots

Read [the research guide](../life-city-terrain-growth.md) first.

These are selected, unmodified upstream files retrieved on 10 October 2026. They are reference material, not runnable Life Hub modules. Original filenames are recorded in [manifest.json](manifest.json); nested paths are flattened using `__`, and every saved file has a `.txt` suffix. Restore the source extension only when deliberately extracting code into a build slice.

Each source directory includes its upstream licence and package metadata. Copyright remains with the named upstream authors. Keep the applicable licence and notices when reusing source. Mapgen2 and Mapgen4 use Apache 2.0; simplex-noise.js, Tween.js and Lowpoly Tree Generator use MIT. Dependencies need their own notices when installed.

The manifest's commit links are the source of truth for exact versions. SHA-256 hashes verify the saved bytes. A snapshot is only the listed files: use the complete upstream project at that commit for demos and dependency resolution. No upstream project was installed or benchmarked for this pack.

## Contents

- `mapgen2/`: water classification, elevations, river flow and noise helpers.
- `mapgen4/`: terrain, rainfall and river generation.
- `simplex-noise.js/`: seeded-noise building block.
- `tween.js/`: easing implementation for a brief arrival wobble.
- `lowpoly-tree-generator/`: small faceted-tree usage example; the full generator is upstream.

Multi-day growth persistence and a renderer adapter still belong to Life Hub. The pack adds no runtime dependency or live feature.
