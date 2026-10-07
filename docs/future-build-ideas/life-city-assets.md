# Life City asset inventory

**Status:** Inventory of what is in the repo. Not a build brief.
**Checked:** 7 October 2026, against `main` after PR #731.
**Where:** `assets/kenney/` at the repo root. 26 Kenney packs, 16,248 files, about 268 MB. All CC0, with a `License.txt` in every pack.

The site build (`scripts/prepare-web.mjs`) publishes `apps/life/assets`, not the root `assets/`. These files are in the repo but not on the website.

## What arrived is mostly 3D

The plan assumed Kenney's 2D **Isometric Tiles** family (City, Buildings, Landscape, Vehicles) as the base art. **None of those four packs are here.** What arrived is mostly the 3D kits, as GLB, OBJ and FBX models with small preview images. That changes the best way to draw the city (see below).

## Coverage of what the snapshot needs

| City thing | Model in the repo | Gap |
|------------|-------------------|-----|
| Roads, crossings, bridges, street lights | City Kit Roads (95 models), 3D Road Tiles | — |
| Buildings: centre, suburbs, industry | City Kit Commercial (41, incl. 5 skyscrapers), Suburban (40), Industrial (37), Modular Buildings, Building Kit | — |
| Metro lines (goals) | Train Kit: `train-electric-subway-a/b/c`, `train-electric-city-*` | — |
| Trams (routines) | Train Kit: `train-tram-classic`, `train-tram-modern`, `train-tram-round` | — |
| **Buses (projects)** | None | **Missing.** The most important vehicle |
| Ambulance | Car Kit: `ambulance` | — |
| **School bus** | None | **Missing** |
| Food truck | Car Kit: `delivery`, `van` as stand-ins | A food truck would read better |
| Mail van | Car Kit: `van`, `delivery-flat` | — |
| **Crane** | None (Road kit has cones, barriers, fences) | **Missing.** Construction fences can stand in |
| Ferries | Watercraft Pack: `boat-*`, `ship-small`, `ship-large` | A passenger ferry would read better |
| Harbour dressing | Watercraft Pack: cargo containers, buoys, boat houses | — |
| Trees, rocks, parks | Nature Kit (2D renders in four directions), Mini Forest | — |
| Pets | None | Cube Pets was not uploaded |
| Holiday and festival props | Holiday Kit | — |
| People (Explore only) | Mini Characters | — |

Packs with no clear Life City use: coaster, racing, platformer, pirate, graveyard, fantasy town, food, furniture, mini skate, planets.

## What this means for the renderer

The plan picked **PixiJS (2D sprites)** because it expected 2D isometric tiles. With 3D models instead, there are two routes:

1. **Keep PixiJS.** Render every 3D model into 2D sprites through a Blender rig, at four angles each. That is the Track A rig, run by Codex on Adam's Mac. Sprites must be re-rendered whenever a model is added.
2. **Switch to Three.js with a fixed orthographic camera** and load the GLB models directly. The isometric look is the same, rotation and zoom come free (a Cities: Skylines feel), there is no Blender rig and nothing to re-render, and new models drop straight in. The catalogue already lists Three.js (MIT). The costs: picking and occlusion work differently from 2D, Three.js is a bigger download than Pixi (it still lazy-loads on the city page only, W4), and the Home tile still needs a pre-rendered image.

**Decided: route 2 (Three.js).** Adam's call, 7 October 2026. The build plan's Stack section now says so.

## Gaps to fill

- **Buses and a school bus** are the main gap. Options: Kenney's Isometric Tiles Vehicles pack (2D, would clash with 3D), Asset Forge (about AUD 29, builds vehicles from Kenney blocks), or a simple bus assembled from Car Kit parts. Asset Forge is the cleanest.
- **Crane, food truck and passenger ferry:** same options. Lower priority; stand-ins work for the glance test.
- **Cube Pets** for the pets (Slice 5): not needed yet.

## Repo size

268 MB of mostly unused models now sit in the public repo's history and slow every fresh clone. Removing them later does not shrink history. Adam's call: delete the unused packs once the build is complete and it is clear which are used.

## History

- **2026-10-07:** Inventory written after the Kenney upload in PR #731.
