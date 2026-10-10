# Grove: asset shopping list (brief for Codex)

> **Who this is for:** ChatGPT Codex.
> **Job:** find, download, check and tidy the 3D models and sounds Grove needs, and commit them with a manifest.
> **Not your job:** writing Grove itself. Claude Code builds the page and the engine from what you deliver.
> **Written:** 10/10/26, after Adam chose the forest idea on Home's Now panel.

## 1. What Grove is (so you pick the right things)

Grove is a forest that grows from Adam's completed tasks. Every finished task plants a tree. The tree's species depends on the task's hub, and it grows from a sapling over the following days. You can zoom from one day (a small clearing) to a week, a school term and the whole year (the full forest). Animals move in as milestones are reached, and some of them have babies.

The look is **low-poly with flat colours**, viewed from above at an angle. Think of the mood of the mobile game *Forest Island*. Do **not** use anything from that game or any other commercial game. We want the style, not their files.

The engine is three.js in the browser. Ground, hills, streams and lakes are generated in code, so you are **not** sourcing terrain, water or sky.

## 2. Hard rules

1. **Licence: CC0 (public domain) only.** CC-BY 4.0 is allowed only when no CC0 asset fits a must-have slot, and then its attribution goes in the manifest and `LICENSES.md`. Never use CC-BY-NC, CC-BY-SA, "free for personal use", "editorial use", royalty-free-with-account, or anything without a stated licence.
2. **Check the licence on the asset's own page when you download it.** Record that page's URL. If the pack ships a licence file, keep its text in `licenses/`.
3. **One art family per category.** All trees come from one pack family, and so do all animals, so they sit together without clashing. Mixing is fine only between categories (for example Quaternius trees with Kenney rocks).
4. **No ripped, extracted or "fan" assets** from any game, and no AI-generated meshes.
5. **Size budget:** at most **25 MB** for the whole `grove/` folder. Each static model should be under **300 KB** and each animated animal under **800 KB**. Optimise as in §5. If the budget won't fit everything, drop the nice-to-haves first.
6. **Touch only the folders in §4.** Don't change app code, CSS, tests or other docs.

## 3. The shopping list

Quantities are minimums for the must-haves. "Variants" means visibly different meshes, not recolours.

### 3.1 Trees: one species per task hub (must have)

Tasks carry a hub (`domain`): `life`, `teaching`, `health`, `wedding`, `other`. Each gets its own species so the forest shows where your effort went.

| Slot id | Hub | Species feel | Variants | Growth stages |
|---|---|---|---|---|
| `tree-life` | Life | Pine or fir | 3 | sapling, young, mature |
| `tree-teaching` | Teaching | Round broadleaf (oak) | 3 | sapling, young, mature |
| `tree-health` | Health | Birch (pale trunk) | 3 | sapling, young, mature |
| `tree-wedding` | Wedding | Blossom (cherry, pink) | 2 | sapling, young, mature |
| `tree-other` | Other | Generic leafy | 2 | sapling, young, mature |
| `tree-late` | Overdue tasks finished late | Gnarled or twisted, still alive | 2 | mature only |

Growth stages: prefer real separate meshes (many packs ship small and large versions of each tree). If a species has no sapling, take the smallest bush-like tree from the same pack and note it in the manifest. Claude will scale between stages.

**Preferred source:** Quaternius **Stylized Nature MegaKit** or **Ultimate Nature Pack** (CC0), both at quaternius.com. Fallback: Kenney **Nature Kit** (CC0) at kenney.nl. Use a single family for all trees.

### 3.2 Ground cover and props (must have)

| Slot id | What | Count |
|---|---|---|
| `grass` | Grass tufts | 4 |
| `flower` | Small flowers in clearly different colours | 6 |
| `bush` | Low bushes or shrubs | 4 |
| `rock` | Rocks, small to large | 5 |
| `stump` | Stumps and fallen logs | 3 |
| `mushroom` | Mushrooms | 3 |
| `reed` | Reeds or cattails for water edges | 3 |
| `lily` | Lily pads | 2 |
| `bridge` | A small wooden bridge or stepping stones | 1 |

Source: the same family as the trees where possible. Kenney Nature Kit is the fallback.

### 3.3 Animals: animated (must have)

Each needs at least **idle** and **walk** animations, plus **eat** or **sit** where the pack has them. A baby is the adult scaled down unless the pack ships a young version (take it if so).

| Slot id | Animal | Milestone it's meant for (for context only) |
|---|---|---|
| `animal-rabbit` | Rabbit | First day with five tasks done |
| `animal-deer` | Deer (doe), plus stag if separate | A full week with something done every day |
| `animal-fox` | Fox | End of a school term |
| `animal-bird` | A small bird that can fly (flap clip) | First task finished early |
| `animal-squirrel` | Squirrel | A streak |
| `animal-duck` | Duck that can swim (on water) | First lake appears |

**Preferred source:** Quaternius **Ultimate Animated Animal Pack** and other animated animal packs on quaternius.com (CC0). Fallback: Poly Pizza (poly.pizza), filtered to CC0, with animations included. Keep one art family across all animals.

### 3.4 Nice to have (only if the budget allows)

- Australian animals to suit Sydney: kookaburra, wombat, kangaroo, possum (CC0, animated). Search Poly Pizza and Quaternius first.
- Hedgehog, owl, frog, butterfly (butterflies may become particles in code, so a mesh is optional).
- Ambient sound: one quiet forest loop and one stream loop, CC0, from freesound.org filtered to "Creative Commons 0". Format `.ogg`, under 1 MB each, seamless loop.

## 4. Where everything goes

Branch from fresh `main`: `codex/grove-assets`. Everything lives under:

```text
apps/life/assets/grove/
  models/
    trees/        tree-life-1-sapling.glb, tree-life-1-young.glb, tree-life-1-mature.glb, …
    ground/       grass-1.glb, flower-1.glb, rock-3.glb, bridge-1.glb, …
    animals/      animal-rabbit.glb, animal-deer-doe.glb, animal-deer-stag.glb, …
  audio/          forest-loop.ogg, stream-loop.ogg        (nice to have)
  previews/       one PNG per model, same base name       (see §6)
  licenses/       original licence files from each pack, named by pack
  manifest.json
  LICENSES.md
```

`apps/life/assets/` is already copied to the live site by `scripts/prepare-web.mjs`, so you don't need to change any build step.

File names are lower-case kebab-case: `<slot id>-<variant number>[-<stage>].glb`.

## 5. Make every model consistent

Run every model through the same pipeline, using `@gltf-transform/cli` via `npx`:

1. **Format:** binary glTF (`.glb`). Convert FBX or OBJ sources with Blender in background mode, or with `fbx2gltf`.
2. **Units and axes:** 1 unit = 1 metre, Y up, facing +Z, origin at the base centre (the point that touches the ground).
3. **Real-world size:** a mature tree about 4–7 m tall, a rabbit about 0.35 m long, a deer about 1.6 m. Record the measured height in the manifest.
4. **Clean up:** no cameras or lights. Merge duplicate materials. Keep flat or vertex colours; textures only if the pack needs them, at most 512 px.
5. **Optimise:** `gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress webp`. Do **not** use Draco; the page loads the meshopt decoder only.
6. **Animation names:** rename clips to `idle`, `walk`, `run`, `eat`, `sit`, `fly`, `swim` where they match. Record the original names in the manifest.

## 6. Previews (so Claude can see what it's getting)

For every model, render one 512×512 PNG on a light grey background from a 3/4 view, framed to fit. A short three.js script run in headless Chromium through Playwright is fine; Chromium is already installed in this repo's environment. Put the script under `tools/grove-previews/`. It's a tool, not app code. Also make one contact sheet, `previews/_sheet.png`, with all models in a grid and their file names written under each.

## 7. `manifest.json`

One entry per file. Claude's engine reads this file, so it must be complete and valid JSON.

```json
{
  "version": 1,
  "generated_at": "2026-10-11T09:00:00Z",
  "budget_bytes": 26214400,
  "total_bytes": 0,
  "assets": [
    {
      "id": "tree-teaching-1-mature",
      "slot": "tree-teaching",
      "kind": "tree",
      "variant": 1,
      "stage": "mature",
      "file": "models/trees/tree-teaching-1-mature.glb",
      "preview": "previews/tree-teaching-1-mature.png",
      "bytes": 0,
      "triangles": 0,
      "height_m": 5.2,
      "animations": [],
      "animation_source_names": {},
      "source": {
        "pack": "Stylized Nature MegaKit",
        "author": "Quaternius",
        "page_url": "https://…",
        "original_file": "CommonTree_3.fbx",
        "downloaded_at": "2026-10-11"
      },
      "license": { "id": "CC0-1.0", "url": "https://creativecommons.org/publicdomain/zero/1.0/", "attribution": null },
      "notes": ""
    }
  ]
}
```

- `kind` is one of `tree`, `ground`, `animal` or `audio`.
- `stage` is `sapling`, `young`, `mature` or `null`.
- For animals, `animations` lists the normalised clip names and `animation_source_names` maps each one to its original name.
- `notes` records any judgement call, for example "no sapling in pack; smallest bush used".

`LICENSES.md` lists each pack once (name, author, page URL, licence) and then every CC-BY asset with its exact attribution line. If everything is CC0, it says so and still lists the packs.

## 8. Done means

- [ ] Every must-have slot in §3.1–3.3 is filled, or listed under "Gaps" in the PR body with what you searched.
- [ ] Every file in `models/` has a manifest entry, a preview PNG and a licence record, and vice versa. A small check script under `tools/grove-previews/` proves this and exits non-zero on any mismatch.
- [ ] Total size is under 25 MB (`du -sh apps/life/assets/grove`).
- [ ] Trees come from one family and animals from one family (state which in the PR).
- [ ] Every `.glb` loads: `npx @gltf-transform/cli inspect <file>` succeeds for each.
- [ ] `node scripts/pre-pr-check.mjs --docs-only` exits 0. This PR has no runtime, test or type impact.
- [ ] Draft PR titled **"Grove assets: trees, ground cover and animals (CC0)"**, with the contact sheet image embedded in the PR body.

## 9. Hand-off

When the PR is up, Adam will tell Claude Code. Claude reads `manifest.json` and the contact sheet, then builds Grove's day and week view first, then the term and year zoom, and adds animals last.
