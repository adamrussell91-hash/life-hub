# Grove asset preparation

Asset-only delivery for `docs/proposals/grove-assets-codex-brief.md` (PR #779).
No app, CSS, runtime dependency, storage or build changes.

## Contents and limitations

74 GLBs: 41 trees (13 variants with three size stages, plus two twisted trees),
30 ground props, and three animated animals (doe, stag, fox). One family for
all trees: Quaternius Stylized Nature MegaKit Standard. One family for all
animals: Quaternius Ultimate Animated Animal Pack. Ground props: Kenney Nature
Kit. All CC0, original licence texts retained. The manifest names every source
file and every adaptation.

The free Standard MegaKit contains 68 of 116 models. It has no matching true
sapling/young meshes. The delivered size stages reuse each variant's geometry
at 0.65 m, 2.4 m and roughly 5.35–6.05 m; these are **scaled fallbacks**.
Growth can interpolate scale without loading all three copies. Pale-bark
broadleaf meshes stand in for birch; pink foliage stands in for blossom.
Variants within each hub have distinct source geometry; recolours are not
counted as additional variants. Different hubs can reuse geometry.

Reed coverage is two flat waterside plants, not three true reed/cattail meshes.
Six flowers have different source meshes and six adapted petal colours.
The little wooden bridge is a complete mesh, not a modular bridge segment.

Missing animals: rabbit, flying bird, squirrel and swimming duck. Publisher's
Ultimate Animated Animal Pack download was inspected: 12 glTF files cover
alpaca, bull, cow, deer, donkey, fox, horses, husky, shiba inu, stag and wolf.
Poly Pizza squirrel/duck/rabbit searches did not yield a verified compatible
CC0 animated member of this family. Its Quaternius rabbit result is an
anthropomorphic plush character, not a woodland rabbit:
https://poly.pizza/m/SwKX8OIlw8. Existing Kenney Cube Pets covers bunny/deer/fox/
parrot with idle/walk/eat, but adopting only its bunny/parrot would mix animal
families, and the parrot has no fly clip. No invented fly/swim animation was
used to label a static model as animated.

Nice-to-haves (Australian wildlife, hedgehog, owl, frog, butterfly and sound)
are not delivered: no matching verified animated CC0 assets were established
in the selected family; no licensed seamless audio was downloaded. Search
starting points for further curation: https://poly.pizza/search/squirrel,
https://poly.pizza/search/duck, https://poly.pizza/search/rabbit,
https://quaternius.com/packs/ultimateanimatedanimals.html and
https://freesound.org/search/?q=forest+stream.

## Reproduce

From repo root, install existing root dependencies (`npm ci`) for Playwright,
then this isolated tool's dependencies (`npm ci --prefix tools/grove-previews`).
Chromium must be available to Playwright (`npx playwright install chromium`
if not already installed). The script uses a local server and headless Chromium,
never a logged-in browser session.

Keep downloaded original packs outside the repo in a source directory:

```text
<sources>/nature-sources/glTF/          free Standard archive's glTF folder
<sources>/animal-sources/Deer.gltf      embedded buffers, publisher original
<sources>/animal-sources/Stag.gltf
<sources>/animal-sources/Fox.gltf
```

Kenney originals resolve to this repo's existing `assets/kenney/kenney_nature-kit/`.
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
