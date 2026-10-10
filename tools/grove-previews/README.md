# Grove asset preparation

Preparation tooling for the canonical collection at
[`apps/life/assets/grove/README.md`](../../apps/life/assets/grove/README.md).
The original PR #779 brief and concept now redirect there.
No app, CSS, runtime dependency, storage or build changes.

## Contents and limitations

67 GLBs: 41 trees (13 variants with three size stages, plus two twisted trees),
23 ground props and three animated animals (doe, stag, fox). All currently delivered models are
Quaternius: Stylized Nature MegaKit Source for trees and ground, Ultimate
Animated Animal Pack for animals. No Cube Pets or Kenney models. Visually matching one-off additions from other
creators are permitted after review; none is currently delivered.
All CC0; original publisher licence texts retained. The manifest names every
source file and adaptation.

The purchased Source MegaKit contains 116 models, including five birch and five
cherry-blossom variants. Three birch and two cherry-blossom variants replace
recoloured stand-ins. No dedicated sapling/young meshes are included. The three
size stages reuse each variant at 0.65 m, 2.4 m and roughly 5.35–6.05 m: **scaled
fallbacks**, not separately authored stages. Blossom foliage is tinted pink
while retaining its alpha mask. Variants within each hub have distinct meshes.

Ground cover includes four grasses, six flowers, four bushes, five rocks,
three mushrooms and a stepping-stone path. Publisher materials are retained.
Reeds, lily pads and stumps/logs are gaps: MegaKit has no specifically named
models for them. Earlier non-Quaternius assets have been removed from this
delivery, rather than relabelled as Quaternius.

Missing animated animals: woodland rabbit, flying bird, squirrel and swimming
duck. The inspected Ultimate Animated Animal Pack contains 12 glTF animals,
including delivered deer/stag/fox but none of those four species. Quaternius's
other rabbit leads are a plush character and an anthropomorphic Ultimate
Monsters character, not compatible woodland rabbits. See `sourcing-options.md`
for verified links and remaining requirements. No flight/swim clips were
invented. Optional animals and licensed seamless audio are not delivered.

## Reproduce

From repo root, install existing root dependencies (`npm ci`) for Playwright,
then this isolated tool's dependencies (`npm ci --prefix tools/grove-previews`).
Chromium must be available to Playwright (`npx playwright install chromium`
if not already installed). The script uses a local server and headless Chromium,
never a logged-in browser session.

Keep downloaded original packs outside the repo in a source directory:

```text
<sources>/nature-sources/glTF/          purchased Source archive's glTF folder
<sources>/animal-sources/Deer.gltf      embedded buffers, publisher original
<sources>/animal-sources/Stag.gltf
<sources>/animal-sources/Fox.gltf
```

`selection.json` describes source selection, target dimensions and adaptations.

```sh
node tools/grove-previews/normalise.mjs /absolute/path/to/sources
GROVE_RENDER_REPORT=/tmp/grove-render-report.json node tools/grove-previews/render.mjs
node tools/grove-previews/check.mjs --update-total
node scripts/pre-pr-check.mjs --docs-only
```

Normalisation preserves animation rigs and puts a uniform scale and base-centre
translation on a parent node. Sources are Y-up and animals face +Z. Preview
rendering measures Three.js bounds including skinning and samples **each** kept
animation, requiring its node matrices to move. Previews are 512×512, individually
framed on grey. `_sheet.png` labels every file, so its equal framing does not
represent relative physical sizes. Measured metres are in the manifest.
`render-report.json` retains the browser's bounds and animation checks, tied to
each delivered GLB by SHA-256. The check script rejects stale reports. Skinned
models must use these browser bounds: glTF Transform's static `getBounds()`
does not apply joint matrices and reports incorrect bounds after optimisation.

Every model runs through `gltf-transform optimize --compress meshopt
--texture-compress webp`. Keep the alpha masks: deleting the foliage textures
turns leaves into visible rectangles. Load with GLTFLoader plus MeshoptDecoder;
WebP textures also use standard GLTFLoader support. No Draco is used.

The check script validates model/manifest/preview bijections, unique IDs, source
and licence records, file budgets, dimensions, clip names, texture dimensions,
family consistency and one successful CLI `inspect` per GLB. `--update-total`
updates the manifest's whole-folder byte budget including itself and previews.
Run it again without that flag for a read-only audit. Known shopping-list gaps
are recorded above and in the draft PR, rather than hidden by the validator.

## Local project-only candidates

The canonical Grove README and `animal-audit.json` record the locally prepared
robin and Spring hare/squirrel. Extra licences prohibit standalone public asset
redistribution, so their files are outside the repo. Hare/squirrel have rigs,
not authored locomotion clips. Bird has authored fly/idle/hop/eat.

For a separately stored selection, `GROVE_SELECTION=/absolute/selection.json`
chooses its input list and `GROVE_OUTPUT_DIR=/absolute/output` chooses its model
folder for both normalisation and previews. Selection entries may specify
`clip_map`, `source_folder`, source metadata and their actual `license`; a paid
asset must never be recorded as CC0. Set `GROVE_RENDER_REPORT` to a local report
path too, so previewing the local selection cannot replace the public report.
Default invocation still prepares the repository's existing CC0 selection.
