# Life City resource catalogue

Research date: 7 October 2026.
Author: ChatGPT.
Purpose: public repositories, free assets and inexpensive tools for Metropolis.

## Recommendation

Start with PixiJS 8, Kenney's Isometric Tiles family, Tiled and PixiJS AssetPack. Evaluate selected IsoCity modules before writing projection, sorting and transport movement from scratch. Use Blender to render additional CC0 models into sprites under a fixed camera.

This recommendation follows the critical review at the top of [life-city.md](https://github.com/adamrussell91-hash/life-hub/blob/main/docs/future-build-ideas/life-city.md). The preserved proposals below the review contain superseded mechanics. Life City's sky represents capacity. Fictional festival weather belongs in labelled Explore scenes. Doors open existing hubs. Pets and keepsakes have no task meaning.

The existing [package.json](https://github.com/adamrussell91-hash/life-hub/blob/main/package.json) already includes TypeScript, Vite, Zod, Playwright and Vitest. PixiJS is absent. The resource choices below avoid requiring a React or Next.js migration.

All recommendations about suitability are engineering judgements. Repository README claims and publisher pages were inspected. No external repository was installed or benchmarked. A licence listed for code does not establish rights for every bundled image.

## 1. Rendering and reusable city code

| Resource and primary source | Cost and rights | Concrete contribution | Fit and decision |
| --- | --- | --- | --- |
| [PixiJS](https://github.com/pixijs/pixijs) | Free, MIT | GPU sprite rendering, masks, input, SVG drawing, assets and filters | First choice for the 2D city. Separate rendering from Life Hub selectors. |
| [pixi viewport](https://github.com/pixijs-userland/pixi-viewport) | Free, MIT | Drag, pinch, zoom, camera clamping, target following and animated camera moves | Use major 6 with PixiJS 8. Disable unnecessary camera motion in Glance. |
| [PixiJS Tilemap Kit](https://github.com/pixijs-userland/tilemap) | Free, MIT | Batched ground and road tiles | Major 5 targets PixiJS 8. Supplies rendering, not the city layout or isometric projection. Keep tall buildings and vehicles in separate depth sorted layers. |
| [PixiJS Filters](https://github.com/pixijs/filters) | Free, MIT | Glow, outline, colour adjustment and other effects | Major 6 targets PixiJS 8. Use a small selection for the decision halo and atmosphere. Profile large filter areas. |
| [IsoCity and IsoCoaster](https://github.com/amilich/isometric-city) | Free, MIT code | CanvasIsometricGrid, depth sorting, tile placement, transport simulation, save and load, touch interface | Strongest whole city reference. README lists buses, trains, barges, bridges and traffic lights. Extract or adapt bounded modules. Next.js interface and economy are unnecessary for Life City. Audit sprite provenance separately. |
| [Pogicity](https://github.com/twofactor/pogicity-demo) | Free, MIT code. Art has mixed terms | Isometric sorting, buildings spanning several tiles, road intersections, moving cars, four direction characters, snow tiles | Useful source reference. Phaser 3 and Next.js add integration work. Replace bundled art. README expressly limits its art to learning, demos and prototyping. |
| [City Tour](https://github.com/jstrait/city-tour) | Free, MIT | Terrain, road networks, building lots, procedural buildings and automatic camera tours | Good separation of world blueprint from renderer. Adapt ideas for Explore camera paths. Random regeneration conflicts with stable personal geography. |
| [Three.js](https://github.com/mrdoob/three.js) | Free, MIT | Orthographic 3D renderer, materials, lighting and models | Future renderer option or sprite production preview. A 3D migration also changes picking, occlusion, assets and performance work. More than changing one import. |
| [threex procedural city](https://github.com/jeromeetienne/threex.proceduralcity) | Free, MIT | Compact procedural building generator | Reference for inexpensive scenery and procedural windows. Old Bower workflow and Three.js APIs make direct adoption unattractive. |
| [3d.city](https://github.com/lo-th/3d.city) | Free. Wrapper advertises MIT. Embedded simulation needs separate review | Three.js city plus simulation in a Web Worker | Architecture reference for keeping simulation off the render thread. README identifies micropolisJS ancestry. Do not treat the wrapper licence as a blanket clearance for embedded code or art. |
| [Phaser](https://phaser.io/download/license) | Free, MIT | Full browser game framework | Alternative if the product becomes a larger interactive game. PixiJS fits the current visualisation scope with fewer game systems. |
| [Phaser examples](https://github.com/phaserjs/examples) | Free, MIT sample code | Working examples of cameras, tilemaps, input, particles and animation | Reference library. Current default examples also include Phaser 4 development material. Select examples matching the chosen major. Art rights need separate checks. |
| [Excalibur](https://github.com/excaliburjs/excalibur) | Free, BSD 2 clause | TypeScript browser game engine | Alternative for an expanded game. No clear advantage over PixiJS for this brief. |
| [Godot](https://godotengine.org/license/) | Free, MIT engine | Integrated scene, animation and editor workflow | Strong standalone game option. Web export and communication with the existing hub add another runtime boundary. Reserve for a substantially different product. |

## 2. Buildings, streets, transport and scenery

The four Isometric Tiles packs below belong to the same named Kenney family. They provide the best starting point. Other Kenney families differ in projection, scale, outlines and shading. One publisher does not guarantee one interchangeable style.

Publisher file counts describe files, not unique usable buildings or animations.

| Resource and primary source | Cost and rights | Contribution | Preparation |
| --- | --- | --- | --- |
| [Isometric Tiles City](https://kenney.nl/assets/isometric-tiles-city) | Free, CC0, 128 files | Core city scenery | Establish the visual reference and sprite anchors from this family. |
| [Isometric Tiles Buildings](https://kenney.nl/assets/isometric-tiles-buildings) | Free, CC0, 128 files | Building variety for districts and landmarks | Assign meaning through Life Hub data. Catalogue footprints and occlusion bounds. |
| [Isometric Tiles Landscape](https://kenney.nl/assets/isometric-tiles-landscape) | Free, CC0, 128 files | Ground, nature and scenery | Establish road and footpath layers separately from decorative ground. |
| [Isometric Tiles Vehicles](https://kenney.nl/assets/isometric-tiles-vehicles) | Free, CC0, 540 files | Transport and service vehicle sprites | Inspect directions and exact vehicle types in the downloaded archive before assigning services. |
| [City Kit Roads](https://kenney.nl/assets/city-kit-roads) | Free, CC0, 3D | Modular road geometry | Render to sprites using the locked camera or save for a 3D version. |
| [City Kit Commercial](https://kenney.nl/assets/city-kit-commercial) | Free, CC0, 3D | Commercial skyline variety | Render fixed views. Compare edges, shadows and scale against the 2D family. |
| [City Kit Suburban](https://kenney.nl/assets/city-kit-suburban) | Free, CC0, 3D | Smaller buildings for quieter districts | Conversion route for low buildings and personal neighbourhood scenery. |
| [Train Kit](https://kenney.nl/assets/train-kit) | Free, CC0, 100 files, 3D | Trains, trams and track assets | Render required travel directions. Exact models and coverage need archive inspection. |
| [Watercraft Kit](https://kenney.nl/assets/watercraft-kit) | Free, CC0, 45 files, 3D | Boats for existing cross hub links | Render ferry views. Water motion is a separate effect. |
| [Screaming Brain Studios Town Pack](https://screamingbrainstudios.itch.io/iso-town-pack) | Free or donation, CC0 | 432 building tiles, 11 roof tiles and a Tiled example | Alternate complete visual family. Teal backgrounds need cleanup. Textured retro style differs from Kenney. |
| [Screaming Brain Studios asset library](https://screamingbrainstudios.com/downloads/) | Free or donation, CC0 | Matching floor, wall, object and overworld packs | Expand the alternate family rather than mixing arbitrary packs. |
| [Buggy Studio Isometric City Starter](https://buggystudio.itch.io/isometric-city-starter-pack) | Free or donation. Explicit reuse licence unresolved on inspected page | Over 500 sprites, 52 buildings, 23 vehicles in four directions and animated characters | Attractive alternative. Download price alone establishes no reuse permission. Obtain the pack licence before adoption. |

## 3. Pets, festivals, balloons, snow and sound

| Resource and primary source | Cost and rights | Contribution | Fit and decision |
| --- | --- | --- | --- |
| [Kenney Cube Pets](https://kenney.nl/assets/cube-pets) | Free, CC0. 24 files, animated 3D | Cats and dogs with animation | Excellent movement prototype. Render directions and idle states to sprite sheets. Individual pets still need their own appearance and chosen memories. |
| [Quaternius Ultimate Animated Animals](https://quaternius.com/packs/ultimateanimatedanimals.html) | Free. Current publisher terms are QAL. Preserve the downloaded pack licence | 12 animals with more than 12 animations each | Useful alternate animation source. Confirm species in the archive. Do not assume all Quaternius assets are CC0. |
| [Quaternius licence](https://quaternius.com/license.html) | QAL version 1, updated 28 August 2026 | Rights evidence for current packs | Permits completed products with no attribution requirement. Prohibits redistribution as standalone assets, including modified assets. Resolve public source asset distribution against the specific pack terms. |
| [Kenney Holiday Kit](https://kenney.nl/assets/holiday-kit) | Free, CC0. Animated 3D, 100 files | Seasonal props | Render props into the city style. A winter event requires atmosphere and placement rules as well as models. |
| [Kenney Particle Pack](https://kenney.nl/assets/particle-pack) | Free, CC0. 80 files | Reusable particle textures | Snow, sparks, smoke and celebration source material. Select small textures and pack them into an atlas. |
| [PixiJS ParticleContainer](https://pixijs.com/8.x/guides/components/scene-objects/particle-container) | Built into free MIT PixiJS | Efficient particle rendering | First option for simple snowfall, petals and fireworks. Motion and emitter rules still need implementation. |
| [Pixi Particle System](https://github.com/danielpokladek/pixi-particle-system) | Free, MIT | PixiJS 8 particle behaviours and interactive editor | Candidate for more complex weather. Newer project. Validate the selected release in a small scene before depending on the editor output. |
| [Legacy Pixi Particle Emitter](https://github.com/pixijs-userland/particle-emitter) | Free, MIT | Rain, snow, fountain, flame and smoke examples | Reference recipes. README targets older Pixi versions and an older editor. Avoid direct installation into a PixiJS 8 stack without a compatibility test. |
| [Hot Air Balloon by jeremy](https://poly.pizza/m/ascrGCCFjFx) | Free, Creative Commons Attribution. Version needs asset metadata verification | OBJ and glTF balloon model | Candidate for the Balloon Gathering. Render once, recolour selected panels, animate position and gentle sway. Retain creator credit and modification details. |
| [Hot air balloon by Poly by Google](https://poly.pizza/m/7Fej0Jd3_Di) | Free, Creative Commons Attribution. Version needs asset metadata verification | Second balloon model in OBJ and glTF | Compare silhouettes before choosing one base model. |
| [Tibayan Low Poly Hot Air Balloon](https://tibayan.itch.io/low-poly-hot-air-balloon) | Free or donation. Explicit reuse licence unresolved | Small OBJ balloon and material file | Research lead only until permission is established. Poly Pizza candidates have clearer public rights information. |
| [Kenney UI Audio](https://kenney.nl/assets/ui-audio) | Free, CC0, 50 files | Clicks, switches and interface sounds | Optional sound, governed by the existing chimes preference. |
| [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) | Free, CC0, 100 files | Further interface sound choices | Audition a few subdued sounds. No need for two overlapping sound libraries. |
| [Howler.js](https://github.com/goldfire/howler.js) | Free, MIT | Browser audio playback and sound sprites | Only if sound needs exceed the existing hub implementation. |

## 4. Production tools, routing and accessibility

| Resource and primary source | Cost and rights | Contribution | Fit and decision |
| --- | --- | --- | --- |
| [Tiled](https://www.mapeditor.org/) | Free, open source editor | Isometric maps, object layers, terrain rules and infinite maps | First choice for composing the stable street. Export map data and load into the renderer. Editor and map asset rights are separate. |
| [Tiled map documentation](https://docs.mapeditor.org/en/stable/manual/maps/) | Free documentation | Projection and map orientation rules | Use to establish tile size, coordinates and render order. Tiled does not transform ordinary art into isometric art. |
| [PixiJS AssetPack](https://github.com/pixijs/assetpack) | Free, MIT | Asset transformation, atlases, compression and manifests | Preferred repeatable production pipeline. Separate core city, pets and festival bundles for loading. |
| [PixiJS manifests and bundles](https://pixijs.com/8.x/guides/components/assets/manifest) | Free official documentation | Structured asset loading | Load the Home tile without downloading every seasonal prop. |
| [Free Texture Packer](https://github.com/odrick/free-tex-packer) | Free, MIT | Sprite sheet packing, trimming and Pixi output | Handy manual fallback. Maintainer states only critical bugs receive fixes. Prefer AssetPack for the automated build. |
| [TexturePacker](https://www.codeandweb.com/texturepacker) | Commercial tool with free trial and limited free use. Paid quote not verified | Polished atlas workflow | Optional purchase after the free pipeline proves insufficient. Trial access does not equal unrestricted free functionality. |
| [Blender](https://www.blender.org/about/license/?roistat_visit=2540962) | Free, GPL application. Artwork output has separate rights | Model editing, fixed camera rendering and animation export | Highest value production tool. Source model licences still apply to derived sprites. |
| [Piskel](https://github.com/piskelapp/piskel) | Free, Apache 2.0 editor | Browser sprite editing and animation | Useful for small frames and cleanup. Project states mobile support is absent. Desktop production tool. |
| [LibreSprite](https://github.com/LibreSprite/LibreSprite) | Free, GPL editor | Desktop pixel sprite animation | Free alternative for frame cleanup. Match the city's style rather than changing all art to pixel art. |
| [Aseprite](https://www.aseprite.org/faq/) | Paid binaries, source under Aseprite terms. Current price not verified | Animation tags, frame editing, sprite export and automation | Optional production tool. Public source availability does not make current Aseprite an unrestricted open source dependency. |
| [Asset Forge](https://kenney.nl/tools/asset-forge) | About AUD 29 Standard or AUD 57 Deluxe before tax and fees | More than 900 blocks, model assembly and batch sprite export in multiple directions | Best inexpensive purchase candidate. Standard is sufficient initially. Included blocks are public domain, creations belong to the user. Current Mac build has no future support or updates. |
| [Tween.js](https://github.com/tweenjs/tween.js) | Free, MIT | Movement interpolation and easing | Vehicles following known paths, camera transitions, balloon sway and catch up movement. Drive updates from the city clock for replay consistency. |
| [EasyStar.js](https://github.com/prettymuchbryce/easystarjs) | Free, MIT | Asynchronous grid A star routing | Pet footpath movement and actual spatial obstacles. Date based service suspensions do not need rerouting. |
| [javascript astar](https://github.com/bgrins/javascript-astar) | Free, MIT | Compact weighted grid routing | Alternative to EasyStar. Choose one, rather than installing both. |
| [seedrandom](https://github.com/davidbau/seedrandom) | Free, MIT | Repeatable random variation | Stable scenery variants and pet motion fixtures. Save explicit district slots and placements. A seed alone does not preserve layouts when input order changes. |
| [Red Blob A star implementation](https://www.redblobgames.com/pathfinding/a-star/implementation.html) | Free sample code, author offers Apache 2 terms | Grid versus graph routing explanations and algorithms | Particularly useful for transit routes represented as a graph. Page artwork and prose are separate from the sample code grant. |
| [PixiJS accessibility](https://pixijs.com/8.x/guides/components/accessibility) | Free official documentation and MIT implementation | Accessible overlays for canvas objects | Retain keyboard access, focus and plain text equivalents for real decisions. Canvas appearance alone does not expose meaningful controls. |
| [OpenTTD](https://www.openttd.org/about) | Free, GPL game | Orders, depots, signals, transparency and transport reference | Study mechanics. The current Life City brief excludes copying its code or graphics. |

Asset Forge conversions use approximately AUD 1.435 per USD on 7 October 2026. Seller prices are USD 19.95 and USD 39.95. Sources: [seller](https://kenney.itch.io/assetforge), [Deluxe details](https://kenney.nl/tools/asset-forge), [exchange rate](https://www.investing.com/currencies/usd-aud-historical-data?GL_Campaign_ID=18454663361). These are converted estimates, not Australian checkout quotes.

## 5. Feature recipes

| Life City feature | Resources to combine | Work still required |
| --- | --- | --- |
| Calm street and Home tile | Kenney Isometric Tiles, PixiJS, Tiled, AssetPack | Stable district slots, sprite anchors, viewport bounds, selector adapter and interaction destinations |
| Buses, trams and ferries | Vehicles pack, rendered Train and Watercraft Kits, Tween.js, IsoCity reference | Stored route polylines, direction changes, service eligibility and deterministic movement |
| Buildings hiding important vehicles | Pixi masks and alpha, IsoCity sorting reference | Semantic trigger for fading, building bounds, correct restoration and pointer handling |
| Pets resting and wandering | Cube Pets, Blender, sprite animation, EasyStar | Individual pet drawings, walkable footpaths, resting anchors and chosen photo or memory links |
| Balloon Gathering | A credited balloon model, Blender, Tween.js, Pixi sprites | Dream selection, ribbons, festival visibility and a labelled Explore state |
| Winter festival and snow storm | Particle Pack, ParticleContainer or Particle System, Holiday Kit renders | Density caps, depth layers, wind, reduced motion and separation from capacity weather |
| Spring, summer and term events | Palette swaps, Particle Pack, a small set of rendered decorations | Calendar entries chosen by Adam and fixed scenery state definitions |
| Night city | Pixi colour filters, separate window masks, real local clock | Darkening without hiding route meaning. One lighting rig for all rendered sprites |
| One decision halo | Pixi Graphics or a selected glow filter | Real owner, reason and destination. No decoration using the same signal |
| Keepsakes | Existing art tools, AssetPack, explicit sprite manifest | User import, footprint, placement and validation. Adam authors the pieces |
| Whale watching | Custom silhouette or suitably licensed model, Pixi water mask and Tween.js | Specific whale art is unresolved. No matching verified whale animation pack emerged from this search |
| Catch up, rewind and term replay | Deterministic clock, sprite states, Tween.js | The missing event log and historical selectors. Animation software supplies no past Life Hub data |

## 6. Proposed first evaluation

1. Compose one small street in Tiled using the four matching Kenney packs. Include a low building, a taller building, one route and a resting pet placeholder.
2. Run the same scene through the intended PixiJS renderer. Measure first load, frame stability, pointer picking and camera movement on a representative iPhone and desktop.
3. Compare one IsoCity transport module with a small route follower written for the existing snapshot. Evaluate extraction cost before choosing reuse.
4. Render one Cube Pet idle and walk cycle, one train and one balloon in Blender. Fix camera, scale, light direction and ground anchors. Compare against the Kenney street.
5. Test the four golden day fixtures from the brief. Include missing capacity data and a service suspension. Check whether the city communicates the intended state.
6. Add one snowfall effect in Explore. Confirm reduced motion, hidden tab behaviour and teardown when leaving the city.

Start without purchases. Asset Forge Standard is the first paid option worth considering once an extra building or service vehicle is needed. Existing runtime tests and selectors should be reused. A city simulation economy, new hosted database and additional paid API are unnecessary for these evaluation steps.

## 7. Decisions supported by this research

The street, moving services, pets and first seasonal event have viable free components.

The art problem needs a consistent production process. Existing packs remove much drawing work. They do not resolve inconsistent camera angles, shading, sprite anchors or personal pet likenesses.

A fixed sprite production rig is a useful investment. Preserve editable source, orthographic camera, selected lighting, palette, tile footprint, frame dimensions, direction names, ground anchor and licence provenance. Generate sprites and atlases reproducibly.

Use public CC0 packs as the first asset source for a public repository. MIT and BSD code need their notices retained. Creative Commons Attribution models need creator, licence and modification records. Current Quaternius terms distinguish completed products from standalone asset distribution.

Resource availability changes the effort estimate for several ideas in the brief. Animated pets and balloons no longer require every movement frame to be drawn from scratch. Personal likenesses, festival rules, source data and coherent art direction still require specific work.

The essential custom work is the Life Hub to city mapping, stable geography, signal vocabulary and truthful missing data states. External city code supplies rendering and movement. No external game supplies those product decisions.

