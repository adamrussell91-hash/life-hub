# Life City extra 3D assets — design

**Date:** 2026-10-08  
**Branch:** `codex/life-city-assets`  
**Status:** Approved design; asset acquisition has not begun.

## Purpose

Supply licence-safe, low-poly 3D models that fill Life City's documented art gaps without changing city code. The repository is public, so every committed file must be redistributable under an explicit licence.

## Scope

The acquisition report covers every requested item:

- Must have: a single-deck city bus and a school bus.
- Should have: tower crane, food truck, passenger ferry, bus shelter, station entrance, tram platform, and Kenney Cube Pets.
- Nice to have: hot-air balloon, whale, landmark, and harbour/river edge pieces.

Before sourcing new harbour or river geometry, inspect the existing Kenney Pirate Kit, Nature Kit, and Watercraft Pack. Do not add redundant scenery.

## Acceptance policy

1. Search Kenney first, then Poly Pizza, Quaternius, and OpenGameArt.
2. Commit CC0/public-domain assets. Commit CC-BY only when the source and creator are recorded, a matching credit is added to `assets/city-extra/CREDITS.md`, and licence evidence is preserved.
3. Do not commit Quaternius QAL, personal-use, standard, unclear, game-ripped, or unverified AI-generated assets. Report viable-but-rejected candidates and their reason instead.
4. Prefer GLB or glTF. Convert OBJ/FBX only when conversion is clean; do not edit or rescale accepted models.
5. Prefer low-poly models below 1 MB. Record approximate native dimensions; code will handle scaling later.
6. Keep models that visually fit the Kenney flat-colour, toy-city style at least “OK”; explicitly report clashes.

## Repository layout and metadata

- Accepted models: `assets/city-extra/<item>/<file>.glb`.
- Metadata: `assets/city-extra/assets.json`, with `file`, `item`, `source_url`, `creator`, `licence`, `date_fetched`, `modifications`, and `size_m` per asset.
- Credits: one line per CC-BY asset in `assets/city-extra/CREDITS.md`.
- Kenney Cube Pets: unpack in `assets/kenney/kenney_cube-pets/`, including its licence file.
- Licence evidence: preserve each download's licence file, or an authoritative copy of the source-page licence text, within the relevant asset directory.

## Validation and delivery

Each accepted model is opened beside the existing Kenney ambulance and modern tram in a glTF viewer. The resulting per-item comparison screenshot is attached to the draft PR.

Run `npm run pre-pr-check` from the repository root and require exit status 0 before opening the PR. The draft PR targets `main`, is titled **Life City: extra 3D assets**, and includes a table for every shopping-list item, rejected candidates, and Asset Forge findings (current Standard/Deluxe prices, likely vehicle coverage, and GLB export support).

## Out of scope

- No Three.js, city, renderer, or gameplay code.
- No purchase of Asset Forge or any other product.
- No manual model modification, rescaling, or speculative substitute asset.
