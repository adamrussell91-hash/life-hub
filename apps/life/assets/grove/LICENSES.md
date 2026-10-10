# Grove asset licences

Every delivered model is **CC0 1.0** (Quaternius, plus four Kenney water-edge plants). Original publisher licence
files are retained unchanged in `licenses/`.

| Pack | Author | Asset page checked 2026-10-10 | Original licence |
| --- | --- | --- | --- |
| Stylized Nature MegaKit (Source edition) | Quaternius | https://quaternius.com/packs/stylizednaturemegakit.html | `licenses/quaternius-stylized-nature-megakit-source.txt` |
| Ultimate Animated Animal Pack | Quaternius | https://quaternius.com/packs/ultimateanimatedanimals.html | `licenses/quaternius-ultimate-animated-animals.txt` |
| Nature Kit (reeds and lily pads only) | Kenney | https://kenney.nl/assets/nature-kit | `licenses/kenney-nature-kit.txt` |

CC0 dedication: https://creativecommons.org/publicdomain/zero/1.0/

Adam purchased MegaKit Source at https://quaternius.itch.io/stylized-nature-megakit.
Its bundled licence explicitly covers all models and engine projects as CC0.
The original Standard licence is retained for provenance. Animals and their
licence came from the public Drive folder linked by the publisher.

Grove adaptations: dimensions and pivots normalised; metallic materials
removed; blossom foliage tinted pink with alpha masks retained; animation
clips restricted to idle/walk/run/eat; Meshopt geometry compression and WebP
textures at no more than 512 px. Ground materials retain publisher colours.
Source geometry is recorded in `manifest.json`. Growth stages scale the same
source mesh and are explicitly labelled as fallbacks.

Reeds and lily pads: Kenney Nature Kit meshes kept at Adam's request for water
edges, recoloured to Grove greens (`tools/grove-previews/water-and-birch.mjs`).
Birch leaves: MegaKit's autumn-orange texture hue-shifted to green by the same script.
