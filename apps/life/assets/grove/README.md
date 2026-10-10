# Grove

**Status:** Canonical concept and asset brief, consolidated 10 October 2026. Day and Week views are built (`/tasks/#/grove`, and Home's Grove panel); Term, Year, water and animals are next.
**Ingredients:** [Model manifest](manifest.json), [contact sheet](previews/_sheet.png), [code references](references/README.md), [terrain and water notes](references/terrain-notes.md).

Grove is a quiet Three.js forest drawn from completed-task history, viewed from above at an angle. It lives below Day and Tasks, separately from them. Home shows today's clearing; tapping it opens the wider forest.

## Working animal hand-off for Claude

**Prepared and tested on 11 October 2026: all required animal slots now have
working movement clips.** The local project bundle contains seven GLBs. Core
vegetation remains Quaternius MegaKit Source; core deer/fox remain Quaternius.
The hare, squirrel, robin and mallard are matching one-off additions.

| Model | Available clips | Motion source |
| --- | --- | --- |
| Spring hare | `idle`, `hop`, `run`, `eat` | Original Grove rig-control loops, baked in Blender 5.0.1 |
| Spring squirrel | `idle`, `walk`, `run`, `eat` | Original Grove rig-control loops, baked in Blender 5.0.1 |
| Soltorch robin | `idle`, `hop`, `fly`, `eat` | Publisher-authored clips retained |
| Mallard, Poly by Google | `idle`, `walk`, `swim`, `eat` | Original Grove four-bone rig and motion loops |
| Quaternius doe, stag, fox | `idle`, `walk`, `run`, `eat` | Publisher-authored clips retained |

The downloaded [GameDev.tv Spring pack](https://gamedev.tv/assets/spring-assets)
still has only single-frame source actions; the delivered hare/squirrel now
have **added animation**, not hidden publisher clips. The
[robin](https://soltorchgames.itch.io/animated-low-poly-bird-sample) hops on the
ground and flies. The [mallard](https://poly.pizza/m/frSLi6b6Vid) is CC BY 3.0;
retain its supplied credit in the finished app. The toy-like Gobkit duck was
inspected and rejected for visual fit. No Cube Pets or Kenney models added.

### Where Claude gets the files

The project-use assets are installed locally at
`apps/life/assets/grove/project-only/` in this checkout. This folder is
intentionally gitignored: the repo was still public when checked on 11 October,
and the Spring/robin licences prohibit standalone public asset redistribution.
The exact local source bundle is recorded in
[animal-audit.json](../../../../tools/grove-previews/animal-audit.json).

For another **local checkout on Adam's Mac**, run from its repository root:

```bash
node tools/grove-previews/install-project-animals.mjs "/Users/adamrussell/Documents/Codex/2026-10-10/ground-streams-lakes-generated-in-code/outputs/grove-local-animals"
node tools/grove-previews/serve-animal-demo.mjs apps/life/assets/grove/project-only
```

The installer checks required clips and model hashes against the motion reports
before copying. The bundle also has a ZIP, manifest, original licence texts,
credits, GLBs, previews, browser motion/deformation reports and a live demo.
The files are available to local Claude; a cloud-only Claude session needs the
local ZIP attached or another authorised private project-file transfer.
Public Git alone cannot supply the licensed models.

Use `demo/animal-loader.mjs` with Three.js `GLTFLoader`, `MeshoptDecoder` and
`SkeletonUtils.clone`. `create(id, {baby: true})` makes a half-size animal with
its own skeleton/mixer. `play('locomotion')` resolves species-specific walk/hop;
`play('water')` selects the duck's swim loop. All locomotion is in place: the
future Grove scene provides paths, parent-following and water avoidance. The
mallard waterline is recorded in its manifest (0.085 m above the model base).
These are gentle prototype motion loops; animation timing/foot contact can be
polished when the real scene establishes movement speed and terrain.

Browser checks sampled actual deformed vertices through each full clip,
verified finite bounds and loop continuity, and tested independent parent/baby
skeletons plus every clip button. Existing public inventory remains 67 CC0
Quaternius GLBs; the local animal bundle is separate from that public manifest.

Other local downloads are preserved: Australian animals (source/licence and
clip checks pending), Acorn Bringer's Unity animal pack (not needed for these
filled slots), and duplicate Spring downloads. Detailed download hashes:
[downloaded-candidates.json](../../../../tools/grove-previews/downloaded-candidates.json).
MegaKit inventory: [source-edition-inventory.json](../../../../tools/grove-previews/source-edition-inventory.json).

## Appearance and behaviour

- Original scenery with the soft, cheerful low-poly feel of Adam's Forest Island screenshot.
- Trees have natural spacing, never a visible grid. Each species grows in its own patch.
- Task `domain` determines species: `life` → pine/fir, `teaching` → oak-like broadleaf, `health` → birch, `wedding` → blossom, `other` → generic leafy. Professional is not a Grove task domain. Overdue tasks finally completed may make gnarly trees; this is a visual possibility, not a penalty.
- Trees start as saplings and grow over a few real days. A brief wobble accompanies appearance.
- Animals wander, pause and graze on dry ground. Babies reuse the same animal model at half scale and follow a parent.
- Trees and vegetation use Quaternius MegaKit Source; animals use Quaternius. Visually matching one-off assets from other creators may fill gaps after review. No Kenney style or Cube Pets in Grove. Preserved Kenney models and inventory belong to [city candidates](../city-candidates/kenney-nature/README.md).

## Rules

1. Nothing dies. Empty days are grass; sickness and holidays are meadow. No damage or guilt mechanic.
2. Growth follows elapsed real dates, not effort or continued activity.
3. Animals correspond to recognisable real milestones, not points. Examples: rabbit for the first five-task day; deer for a week with a completion every day; owl for finishing a book; fox at term's end. Exact thresholds and data sources remain to be confirmed in a build slice.
4. The same history draws the same forest. Derive scenery and tree growth on load; no stored game state, new storage, daily job or background simulation.
5. Reopened tasks lose their trees. Board visibility does not limit the forest's history. Deleted tasks obey the repository's deleted-means-gone rule.

## Views

| View | Scene | Source |
| --- | --- | --- |
| Day | Grass, flowers and a sapling for each completion in a small clearing | Today's completed tasks |
| Week | Seven clearings, with softer weekends | The week's completions |
| Term | A stretch of woodland with trees of different ages | One actual school term |
| Year | The terms so far, separated by holiday meadows or streams | The year's completions and configured school terms |

View changes should change framing and visibility rather than randomly inventing a new forest. Terms use the configured dates, not an assumed ten-week duration.

## Repository facts checked

- [Task schema](../../../tasks/src/schemas/task.ts) has nullable `completed_at`.
- [Task store](../../../tasks/src/services/store.ts) sets that timestamp when a task first becomes done, preserves it on normal updates, and clears it when status changes away from done.
- [Done retention](../../../tasks/src/domain/done-retention.ts) filters the Board's Done column to a seven-day window and can reveal older completions; it is a visibility rule, not a delete operation.
- [School-term helper](../../../../packages/design-kit/js/calendar/school-terms.js) resolves actual date ranges from existing preferences/planning/calendar sources.

These support deriving Grove without a new game-state store. They do not establish that every legacy record has a valid completion timestamp or that every current API returns the full history. A future build needs to verify the history read path and reuse shared deleted-record filtering. A 'closed' task is not automatically a completed task: closed also includes deleted records.

## Open questions for the eventual build

- Use the brief’s five task domains as the default mapping; a build slice must define how custom/unknown domain values fall back to `other`.
- What should happen to legacy done tasks without an accurate completion date? Do not invent planting dates from the current time.
- Does 'overdue when completed' require past due-date history, or is the retained due date sufficient? Later edits must not silently rewrite the meaning.
- How does a completed book map into the owl milestone? A finished task is not necessarily a finished book.
- Exact animal milestone definitions, maturation duration and default species mapping.

## Build decisions (10 October 2026)

- Grove's engine lives in Tasks (`#/grove`). The Life Hub dashboard shows today's clearing at the bottom of Home and links into it.
- Reeds and lily pads are the one Kenney exception: Adam asked for them back for water edges. They are recoloured to Grove greens.
- Health's birch keeps the MegaKit mesh with its autumn-orange leaves hue-shifted to a light spring green.
- Bought (non-CC0) packs are allowed. Commit only optimised `.glb` files, never the original FBX/Blender/Unity sources.
- The plan logic is `apps/tasks/src/domain/grove/plan.ts`; it uses the mature mesh for every stage and scales it.

## History

- **2026-10-10:** Captured Adam's Grove concept and linked the collected raw ingredients. This is separate from Life City; its terrain does not inherit Life City's harbour, district or transit rules.

---

# Asset shopping list and preparation contract

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
3. **Art direction (Adam’s updated instruction).** MegaKit Source is the core for trees and vegetation; Quaternius is the core for animals. Matching one-off assets from other creators are allowed after visual review. No Kenney style or Cube Pets in Grove. Compare proportions, silhouettes, colours, materials and motion, not just a low-poly label.
4. **No ripped, extracted or "fan" assets** from any game, and no AI-generated meshes.
5. **Size budget:** at most **25 MB** for the whole `grove/` folder. Each static model should be under **300 KB** and each animated animal under **800 KB**. Optimise as in §5. If the budget won't fit everything, drop the nice-to-haves first.
6. **Preparation only.** No Grove runtime, CSS or app behaviour changes. This consolidated collection includes concept/specification and code references as Adam requested; preparation tooling stays under `tools/grove-previews/`.

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

**Selected source:** Quaternius **Stylized Nature MegaKit Source** (purchased, CC0). Preserve its tree family; growth stages currently scale the authored mature meshes.

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

Source: MegaKit Source, with visually matching one-off additions permitted after review. No Kenney fallback for Grove.

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

**Preferred source:** Quaternius **Ultimate Animated Animal Pack** and other animated animal packs on quaternius.com (CC0). Fallback: Poly Pizza (poly.pizza), filtered to CC0, with animations included. Keep Quaternius as the core; a visually matching one-off may fill a missing slot after review.

### 3.4 Nice to have (only if the budget allows)

- Australian animals to suit Sydney: kookaburra, wombat, kangaroo, possum (CC0, animated). Search Poly Pizza and Quaternius first.
- Hedgehog, owl, frog, butterfly (butterflies may become particles in code, so a mesh is optional).
- Ambient sound: one quiet forest loop and one stream loop, CC0, from freesound.org filtered to "Creative Commons 0". Format `.ogg`, under 1 MB each, seamless loop.

## 4. Where everything goes

The canonical Grove collection lives under:

```text
apps/life/assets/grove/
  README.md       canonical concept + asset brief (this file)
  references/     pinned code, licences, terrain notes
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
6. **Animation names:** rename clips to `idle`, `walk`, `hop`, `run`, `eat`, `sit`, `fly`, `swim` where they match. Record the original names in the manifest.

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
- [ ] Core models use MegaKit Source / Quaternius; any approved matching one-off is identified in the PR.
- [ ] Every `.glb` loads: `npx @gltf-transform/cli inspect <file>` succeeds for each.
- [ ] `node scripts/pre-pr-check.mjs --docs-only` exits 0. This PR has no runtime, test or type impact.
- [ ] One draft PR for the consolidated collection, with contact-sheet and source-index links.

## 9. Hand-off

When the PR is up, Adam will tell Claude Code. Claude reads `manifest.json` and the contact sheet, then builds Grove's day and week view first, then the term and year zoom, and adds animals last.
