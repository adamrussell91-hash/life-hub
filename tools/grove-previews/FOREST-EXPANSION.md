# Final private animal expansion

Twenty assets are installed in ignored `apps/life/assets/grove/project-only`: the original eight GLBs remain byte-for-byte unchanged; eight purchased Low World models and four Poly quadrupeds are added. Source meshes and exported models must not enter public Git. `forest-expansion-evidence.json` contains final source ranges, measured skin deformation and hashes; no source geometry or textures.

## Reproduce

Use the existing tool package dependencies and root Playwright. Inputs are the owner's unitypackage and four original named Poly GLBs; never execute package scripts.

```sh
python3 tools/grove-previews/extract-forest-expansion.py "$UNITYPACKAGE" work/forest-expanded
node --test tools/grove-previews/forest-metadata.test.mjs
python3 tools/grove-previews/extract-forest-expansion.test.py
node tools/grove-previews/prepare-forest-expansion.mjs work/forest-expanded apps/life/assets/grove/project-only/models/animals
node tools/grove-previews/rig-quadrupeds.mjs "$POLY_DOWNLOAD_DIRECTORY" apps/life/assets/grove/project-only/models/animals
GROVE_OUTPUT_DIR=apps/life/assets/grove/project-only node tools/grove-previews/verify-animal-motion.mjs
node tools/grove-previews/serve-animal-gallery.mjs apps/life/assets/grove/project-only 49462
node tools/grove-previews/check-animal-demo.mjs http://127.0.0.1:49462/demo/index.html apps/life/assets/grove/project-only
node tools/grove-previews/finalize-forest-expansion.mjs apps/life/assets/grove/project-only "$DELIVERY_DIRECTORY"
node tools/grove-previews/install-project-animals.mjs "$DELIVERY_DIRECTORY" "$REPO_DIRECTORY"
```

Preparation regenerates the twelve GLBs; retain the installed manifest entries with their credits/source names or restore the private ready bundle's manifest before verification. Frame rate comes from binary FBX `GlobalSettings.TimeMode` (3 = 60 FPS), not from clip duration. Unity metadata explicitly identifies each source take, firstFrame and lastFrame; exporter slices exact ranges, includes the final key and excludes combat. The supplied rabbit contains idle/walk/sleep only. Its held sleep pose receives a documented subtle Grove spine breathing loop; no run is fabricated.

The four static Poly meshes get original seven-joint body/head/tail/leg rigs and smooth normalized skin weights. Idle turns the head/tail; walk/run move opposite diagonal leg pairs; eat bends the head; otter swim moves the tail and paddles the limbs. Animation remains in place. Rough materials and texture sizes are bounded; models are Y-up, +Z forward, base centred and in metres. Otter waterline is 0.15m above base.

The verifier samples skinned vertices at nine phases, rejects non-finite/exploding bounds, invalid weights, absent deformation, motion consisting only of whole-model translation, and added-loop seams above 0.5mm. SkeletonUtils clones must have distinct skeletons/bones. Gallery tests additionally prove clone skeleton bone textures release on disposal, parent animation cannot mutate the baby, check half-scale babies, explicit missing-clip errors, and select every clip on every model. Headless software rendering is model correctness evidence, not physical device performance.

Publisher provenance: [Silver Delivery's Low World Forest Animals Kit](https://silver-delivery.itch.io/low-world-forest-animals-kit-rigged-animated). The supplied archive includes its original readme but no standalone licence text; the owner's original purchase terms govern. Installer verifies the complete file hash inventory, manifest/model hashes, motion evidence and all twenty required models before copying. Private bundle includes that readme, all original existing licence texts, explicit Poly attribution URLs and CC BY 3.0 licence link. Do not infer Unity EULA merely from the unitypackage format.
