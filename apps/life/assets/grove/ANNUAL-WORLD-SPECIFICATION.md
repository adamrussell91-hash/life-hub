Grove Annual World and Animated Water Specification

Author: Codex, based on Adam Russell’s decisions in the discussion on 11 October 2026.
Status: Proposed next build. Existing production behaviour remains authoritative until implementation is verified.
Purpose: Replace repeating weekly terrain strips with a coherent annual world, generated independently of activity, then progressively populated from dated task history.

1. Product decisions and scope

Generate the full geography for a calendar year before populating any weekly region. Geography includes hills, valleys, meadows, lake basins, islands, streams, lake outlets and suitable waterfall sites. Task completion changes vegetation and milestone eligibility, rather than land height or water geography.

Show the whole annual map from the beginning. Future weekly regions appear as quiet terrain with restrained baseline ground cover. Completed weeks acquire task trees and denser vegetation. This is a visualisation of dated history, without points, damage, guilt, tree death or activity requirements for survival.

Retain Day, Week, Term and Year navigation. These views change framing, filtering and visual emphasis within the same annual geography. A day is a group of task trees inside its weekly region, rather than a separate rectangular clearing.

Use animated visual water. Physical fluid simulation, rainfall driven water levels, erosion, flooding, dams and water diversion are outside this build. There is no requirement for an external water service or purchased water asset.

The generated image from the discussion was an approximation of the existing weekly strip engine. Do not treat its repetitive parallel streams as the target annual design.

2. Verified current implementation

Current terrain implementation: apps/tasks/src/domain/grove/terrain.ts.
Current terrain renderer: apps/tasks/src/views/grove/ground.ts.
Task planning and planting: apps/tasks/src/domain/grove/plan.ts.
Tree catalogue: apps/tasks/src/domain/grove/assets.ts.
Wildlife milestones and path helpers: apps/tasks/src/domain/grove/wildlife.ts.
Asset inventory and existing delivery record: apps/life/assets/grove/manifest.json, README.md and BUILD-PLAN.md.

The existing engine uses 26 unit weekly terrain rows. Each row receives a carved winding stream and a seeded bowl. Basin filling runs within an individual row. Visible streams follow the explicit carved channel rather than a complete annual accumulated drainage network. Water surfaces are static.

Reuse the task history adapter, valid completion date handling, calendar resolver, species mapping, three day growth, asset loading, licensing and encrypted animal deployment, picking, milestone thresholds and disposal patterns.

Reuse the Priority Flood algorithm as a starting point, subject to annual boundary, lake outlet and connected basin tests. Its existing tile boundary assumptions are unsuitable as annual watershed boundaries.

The pack contains 15 tree variants and 41 tree files. Life, Teaching and Health each have three variants. Wedding, Other and Late each have two. Thirteen variants include three authored growth stages. Late has two mature files only. The renderer currently scales mature models. Switching to separate young models is unnecessary for this concept.

Current milestone rules stay unchanged. These include the repeated hare and deer baby milestones and the explicitly dated finished book owl.

3. Architectural boundaries

Maintain three independent layers.

Geography is a pure function of year, generator version and fixed generation parameters. No task totals, school term configuration, current day, frame rate or view selection influence landforms.

Activity planning derives trees, growth, task associations, ground cover accents and wildlife eligibility from existing source records and the current reference time.

Rendering derives visible meshes, animation phases, camera framing, detail levels and picking from geography and activity plans. Render settings never alter earned history.

Proposed domain modules:
world.ts for annual generation orchestration and immutable world output.
heightfield.ts for broad elevation and constrained landforms.
hydrology.ts for drainage, basin identification, lake surfaces and channels.
regions.ts for calendar ownership and usable planting regions.
planting.ts for stable tree placement.
water.ts for stream, lake and waterfall descriptors.

Proposed view modules:
worldChunks.ts for visible terrain and vegetation batches.
waterRenderer.ts for lake and stream surfaces.
waterfalls.ts for drop sheets, foam and splash effects.

Names are proposals. Adapt to repository conventions after reading applicable repository instructions. This document authorises a specification, not code changes or publication.

4. Annual world identity and reproducibility

Use a WorldKey containing calendar year and generator version, with a stable seed derived from those values. Avoid an account identifier in the seed for this build. Identical year and version produce identical geography.

Use independent random streams for elevation, hydrology constraints, regions, vegetation decoration and animal paths. Adding a decorative draw must never consume the random sequence responsible for terrain generation.

Preserve the original terrain heights separately from the filled drainage surface. Generated geography is derived data. An in memory cache is sufficient initially. A worker should perform generation without blocking interaction.

A versioned cache in browser storage is optional only after measured need. Cache failure must fall back to regeneration. Never store gameplay progress. No daily job or backend write is required.

Generator changes must not silently rearrange the current year after release. Keep a year to generator version policy in code or existing configuration. A deliberate visual migration requires explicit documentation. Existing task records remain untouched.

Current strip based coordinates require a one time visual migration. Retain task IDs, completion timestamps and date routes. Explain the changed layout in delivery documentation.

5. Calendar mapping

Generate a full calendar year, including holidays and empty days. Do not assume exactly 52 weekly regions. Build Monday through Sunday intervals intersecting the selected calendar year. Some years require 53 or even 54 intersecting intervals.

Clip the first and last intervals to the year boundaries. A week spanning New Year has portions in both annual worlds. Year view shows only the selected year’s records. Week view spanning New Year presents both portions with an explicit year boundary. Do not duplicate task ownership.

Compute date keys in the existing Australia/Sydney calendar convention. Daylight saving must not shift a tree into the adjacent calendar date.

School terms annotate weekly and daily ownership. Term edits change captions, filtering and meadow emphasis, rather than terrain seeds. Holiday tasks still plant trees. Missing school dates retain the existing provisional calendar indication.

6. Height field and landforms

Start with a bounded annual map. The first prototype should evaluate a roughly square or moderately elongated footprint, rather than a seven by fifty two strip. Treat dimensions as configurable engineering parameters, not a fixed visual contract.

An initial evaluation range is 768 to 1,024 world units across, sampled on a 257 by 257 grid. One world unit retains the existing model scale convention. Benchmark before increasing resolution.

Combine broad elevation noise with smaller relief. Use a small number of controlled ridge and valley features to avoid featureless noise. Reserve enough low gradient dry ground for every weekly region.

Create connected land occupying most of the footprint. Include one or more larger low basins and several smaller hollows. Islands emerge where elevated bed cells remain above the surrounding lake surface. Avoid randomly placing island props over water.

Keep slopes around activity regions comfortable for trees and readable camera framing. Restrict sharp cliffs to selected channel drops and peripheral scenery. Do not create steep terrain everywhere merely to justify waterfalls.

Use broad flat colour facets, restrained relief and the existing soft Quaternius visual family. Large world generation must not become a different art style.

7. Annual hydrology

Run drainage analysis over the complete annual height field. Render chunk edges must never act as hydrological outlets.

Use explicit map boundary outlets. Priority Flood computes drainage levels and an acyclic receiver graph while preserving original bed heights. Resolve equal height flats with stable ordering. Any epsilon used for drainage routing must not tilt a displayed lake.

Label connected filled basins. Each lake descriptor records a shared water elevation, bed cells, shoreline loops, outlet cell and downstream receiver. Validate enclosed basin fill against spill elevation.

Accumulate contributing area through the receiver graph in reverse topological order. Use configurable contributing area thresholds to select visible headwaters, streams and larger channels.

Create continuous channel polylines. Join tributaries at shared nodes. Route lake inflows to the shoreline and lake outflows from the recorded spill outlet. A stream ends at a lake or an explicit world outlet, not at an arbitrary visual chunk edge.

Constrain or carve channel beds after route selection, then recompute affected drainage and water descriptors. Repeating this step requires a fixed iteration limit and documented convergence criteria. Do not endlessly alternate carving and filling.

A valid annual seed must produce at least one substantial lake, connected flowing channels and enough dry land. Additional ponds and islands are desirable, with quantities governed by available geography. A waterfall is included only where a valid routed drop exists.

If a seed misses required geographic conditions, retry with a deterministic attempt index and bounded attempt count. Define a verified fallback seed layout. Never retry randomly on every page load.

8. Waterfalls

A waterfall site needs an upstream channel, positive downstream drop, receiving channel or pool and room for a visible vertical water surface.

Detect sustained elevation drops along stream polylines. Initial thresholds should be evaluated around a 2 to 4 unit vertical fall over a short run, subject to model scale and visual review. These are tuning parameters, not established final values.

Generate a lip, a descending water sheet and a receiving foam patch. The upstream and downstream water surfaces must join without gaps or uphill segments. Shape nearby rock banks from terrain or existing rock meshes.

Use the existing rocks for decoration. No waterfall model pack is necessary.

Target a small number of recognisable falls in the annual scene. Do not add one fall per week. Falls should read as consequences of terrain and drainage.

9. Shared geographic sampling

Expose one geographic sampling API returning bed elevation, surface normal, slope, water type, water elevation, water depth, downstream flow direction, shore distance and region ownership.

Every planting decision, animal path, duck position, tree base and water renderer uses this source. Avoid separate approximate masks which disagree at shores.

Use bilinear elevation sampling. Water classification derives from explicit lake polygons and channel corridors. Resolve water boundaries with a consistent shoreline tolerance.

Land animals require continuous path segment checks for wet ground and excessive slopes. Destination only checks are insufficient. Swimming ducks use navigable water corridors and the local surface elevation.

10. Weekly regions

Allocate calendar regions after geography exists. Use connected dry land and terrain aware path distance, rather than equal rectangular cells.

Choose weekly anchors along a continuous traversal of the annual world. Successive regions should generally neighbour each other. The route should encounter varied scenery without forcing a lake, island or waterfall into every week.

Partition eligible land using terrain aware distances or a connected region growth method. Rivers, ridges and shores influence borders. Borders remain invisible in the normal scene.

Reserve planting capacity before assigning regions. Region selection must not depend on actual task totals. Changing a task must never shift a weekly boundary.

Give each region a stable primary planting area and ordered overflow areas. Overflow should remain associated with the same week and use dry ground. There must be no silent tree omission when a week exceeds its initial allocation.

Island regions require enough usable area and suitable camera framing. Wildlife stays within safe connected land or water. No bridge is required merely because an island exists.

11. Stable planting and grove composition

Keep exactly one tree for each live completed task with a usable timestamp. Preserve existing late completion override and domain species.

Initial ecological weighting:
Life pines favour higher dry ground.
Teaching oaks favour broad gentle slopes.
Health birches favour damp ground above the wet mask.
Wedding blossom trees favour open gentle ground.
Other and Late trees use suitable remaining dry sites.

These are visual placement preferences. They must never prevent a valid task from receiving a tree.

Precompute stable candidate positions per region and species using minimum spacing, slope limits, shore setback and maximum mature canopy size. Group candidates into irregular groves, with protected meadow corridors between them.

Existing task history includes backdated records and record edits. Avoid assigning positions solely by chronological rank, because inserting an earlier completion would move later trees.

Prefer a per task seeded sequence of candidates, with deterministic ID based conflict resolution and a bounded overflow strategy. Deleting a neighbour should not move a surviving tree into a newly vacant slot. Fully invariant placement under arbitrary insertion plus strict collision avoidance needs an explicit allocator design. Treat this as a required prototype and test gate, not an assumed property.

If pure reconstruction cannot satisfy the chosen movement tolerance, document the tradeoff before implementation. Do not quietly introduce a persistent placement store contrary to the derived world decision.

Retain three day growth from actual elapsed time. Mature canopy spacing governs planting even while a tree is small. Tree picking always resolves to the original task.

Baseline meadows, shore plants and rocks exist independently of tasks. Completion driven grass, flowers and bushes add restrained local detail. Do not expose geometric region borders through abrupt decoration changes.

12. Water animation

Lake surfaces use level geometry with a small visual ripple effect. Use shader normals or restrained vertex displacement, with shoreline attenuation. Keep displacement low enough to avoid water crossing shores or conflicting with duck waterlines.

Stream meshes record distance along channel, transverse coordinate, local flow direction, width, surface elevation and slope. Animate highlights and foam along channel distance rather than global screen axes. Tributary joins require continuous coverage.

Waterfalls use downward animated bands on a sheet mesh, sparse instanced splash particles and a receiving foam patch. No particle physics solver is required.

Use one shared animation clock. Do not regenerate terrain, hydrology, planting or geometry during animation frames. Animate material uniforms and a bounded set of visible effects.

Initial quality tiers:
Low uses simple opaque water colours, scrolling highlights and static foam.
Medium adds restrained lake ripples and limited waterfall particles.
High adds richer foam and local splash detail without changing geography.

Use bounded time phases so long sessions retain numeric precision. Ensure loops do not visibly snap. Stable seeded offsets prevent every lake or fall animating in synchrony.

Pause animation when hidden or offscreen. Reduced motion displays static water and frozen wildlife without changing geography or task visibility. Extend the existing motion control clearly if water animation shares its pause state.

13. Rendering and performance

Generate the full geographic model once. Upload terrain and water meshes by spatial chunk. Chunk size and mesh resolution should be measured independently of weekly region size.

Terrain borders must share identical edge samples and normals or deliberate faceted continuity. Adjacent water chunks share surface heights and phase coordinates.

Use instanced tree batches grouped by model, material and detail level. Keep a lookup from instance to task ID. Near views use existing authored models. Distant views use simplified silhouettes consistent with the existing Term and Year approach.

Render the whole map at low detail for Year view. Refine the selected region and its neighbours. Avoid loading a separate animal rig for every region. Existing milestone animals form a bounded visible population near the current focus.

Geometry generation runs in a worker with typed array outputs and transferable buffers. Cancel stale requests on year changes. Prevent old worker responses replacing the currently selected year.

Dispose replaced geometry, materials, animation mixers and handlers. Keep shared model resources reference counted or centrally owned. Repeated navigation must not accumulate GPU resources.

Evaluation targets, subject to measurement:
At least 30 frames per second during interaction on the chosen representative phone.
At least 50 frames per second on the chosen desktop.
No synchronous generation step causing a main thread stall above 100 milliseconds.
Test 1,500, 5,000 and 10,000 annual trees, including a week with 200 completions.
Report draw calls, triangles, generation duration, memory estimates and frame time percentiles. These targets are not current performance claims.

14. Navigation and interaction

Year opens with the whole annual geography visible. Phones retain a readable entry near the selected week, with an explicit whole year framing action.

Week focuses the weekly region and enough surrounding terrain to show geographic context. Use eased camera motion with cancellation when the user pans, zooms or selects another date.

Day highlights today’s task trees within the region. Other dates remain visible but receive quieter emphasis. Avoid hiding surrounding trees in a way which looks like forest destruction.

Term focuses the union of regions and partial weeks intersecting the configured interval. Holiday navigation retains its actual interval and meadow treatment.

Keep date navigation, tree cards, original task links, Escape behaviour and Home refresh events. Home shows the current day within its actual weekly geography.

Future regions contain no invented completed trees or unearned animals. Backdated history appears in the appropriate region. Reopening and deletion recalculate eligibility without rebuilding geography.

15. Build sequence and completion gates

Stage 1. Annual geography prototype.
Implement year seed, height field, basin identification and connected drainage. Provide diagnostic layers for elevation, lake IDs, receivers, flow accumulation and outlets. Verify invariants before decorative work.

Stage 2. Weekly regions and capacity.
Generate calendar intervals and connected regions. Test New Year boundaries, holidays, high completion capacity and deterministic fallback geography.

Stage 3. Planting integration.
Move task trees into weekly regions. Retain species, growth, cards and milestone logic. Resolve insertion stability and overflow before acceptance.

Stage 4. Terrain and water rendering.
Replace weekly strip meshes with chunked annual meshes. Implement lake surfaces, connected streams, islands and waterfall geometry. Verify shared masks and mesh seams.

Stage 5. Animated water and wildlife.
Add quality tiers, flow animation, falls, foam, pause and reduced motion. Adapt land paths and duck swimming to the annual sampler.

Stage 6. Calendar views and Home.
Integrate framing, date emphasis, year transitions and Home preview. Preserve existing routes where practical.

Stage 7. Performance and production verification.
Measure stress fixtures and real history, inspect desktop and phone screenshots, run repository required checks and verify deployed assets and interactions. Document actual results and limitations.

Do not declare completion after a terrain screenshot alone. Task interaction, historical reconstruction, motion controls and yearly navigation are acceptance requirements.

16. Verification cases

Geography remains identical when task totals, task order, view, clock or school term dates change.
Every drainage receiver path terminates without a cycle.
Lake surfaces are horizontal and equal the correct spill elevation.
Streams descend along their displayed surfaces and meet lake outlets continuously.
Waterfall lips connect to upstream water and receiving pools.
Islands contain genuine land above water, with no submerged planting.
Shared chunk boundaries have no terrain cracks or broken water.
All qualifying tasks appear exactly once in the selected date interval.
Future and invalid completion dates follow existing exclusion rules.
A late task retains the gnarled override.
Backdated insertion, reopening, deletion and domain edits meet the documented tree movement tolerance.
Excess completions use overflow positions without lost trees.
Sydney date handling survives daylight saving transitions.
Partial New Year weeks do not duplicate records.
Existing milestones and explicitly dated book completion remain correct.
Land paths do not cross wet ground or excessive slopes.
Ducks stay on connected water at the correct elevation.
Pause, reduced motion and hidden tab states stop decorative animation.
Picking works for authored and simplified instanced trees.
Rapid year switching discards stale worker results.
Repeated mount and unmount returns resource counts to the expected baseline.
Chromium and WebKit desktop and phone layouts remain usable without overflow.
Real source records remain unchanged throughout scene generation.

17. Risks and decisions still requiring implementation evidence

A coherent annual watershed is a larger algorithmic change than animating current water surfaces.
Natural looking region allocation needs visual review alongside capacity checks.
Strict placement stability under arbitrary historical edits is unresolved until the allocator prototype passes.
Water shader quality and particle counts need measured phone performance.
Terrain resolution, world dimensions, waterfall thresholds and exact geographic quantities require tuning.
The annual map must remain visually consistent with existing assets.
The renderer needs a documented fallback for unavailable WebGL using the existing application conventions.

These are engineering validation items. They do not require another asset pack before work starts.

18. Intended result

A complete annual place exists from the beginning. Weeks focus on neighbouring portions of connected geography. Your dated work fills groves while preserving open meadows, shorelines and water corridors. Hills, lakes, islands and waterfalls belong to the annual landform. Animated surfaces communicate moving water without a physical fluid simulation.

The existing engine supplies the foundation and assets. The next build supplies annual geography, coherent drainage, weekly ownership, stable planting, animated water and regional rendering.
