# Grove annual world Phase 1 design

Status: implementation authorised by Adam on 11 October 2026, following the integrated five-phase plan. Covers audit items 1, 2, 3, 4 and 27.

## Outcome and scope

Generate one bounded annual geographic model independently of task history, clock, terms, view and frame rate. Include broad hills/ridges, valleys, flat planting reserves, two basin shapes and elevated island beds. Run generation in a dedicated module worker with transferable typed arrays; superseded requests terminate and cannot replace the selected year. Provide an explicit diagnostic preview, separate from the current task forest.

This is the foundation, not the annual world rollout. Priority Flood, final lake surfaces/outlets, connected streams, retries/fallback layouts, weekly ownership, tree migration, wildlife integration and animated water remain their agreed later phases. Basin descriptors record proposed spill levels for inspection; they are not hydrologically verified lake descriptors. The existing Grove route and Home keep their current renderer.

## Approach

Choose a constrained seeded height field. Unconstrained noise is simpler but cannot reserve gentle land or provide predictable basin/island features. Adapting weekly strips retains arbitrary watershed edges and would force a second migration. A constrained annual recipe gives Phase 2 deliberate terrain to analyse without embedding fabricated drainage results.

Recipe v1 is fixed at 896 by 896 world metres, origin (-448,-448), with a 257 by 257 vertex grid and 3.5 metre spacing. This is within the parent specification's evaluation range. Dimensions and recipe constants belong to the generator version; callers cannot silently alter them. Geography identity is calendar year plus supported integer generator version. Years 1900–9999 are accepted; unsupported versions, fractional/non-finite years and out-of-range years are rejected before allocation.

The policy explicitly pins 2026 to version 1 and uses version 1 for other years. Adding a generator version does not automatically change that default or historical mappings. Intentional migrations require a documented policy edit. Coordinate-addressed elevation noise, basin parameters and meadow placement have independent seed namespaces. Account IDs and activity never enter the API.

## Domain contract and modules

- `world-key.ts`: validated WorldKey, fixed v1 recipe, identity and year-to-version policy.
- `heightfield.ts`: coordinate-addressed smooth multi-scale noise, broad ridges/valley and constrained feature shaping. Generates original bed as Float32Array.
- `world.ts`: pure orchestration, immutable metadata and feature descriptors, height-field sampling, generation summary. Owns no task records or persistence.
- `world-worker.ts`: request/response protocol and generation inside a dedicated worker. Transfers the original bed buffer exactly once.
- `world-client.ts`: asynchronous caller lifecycle. One active worker per client, terminate/reject on supersession or disposal, reject errors and malformed responses, accept only the matching request/key. No synchronous main-thread fallback when Worker is unavailable.

World output contains key/identity, grid extent, original bed, basin/island descriptors, gentle meadow reserves and numeric summary. Metadata is frozen when assembled in the domain and restored on receipt; the typed-array bed is consumer-owned and must be treated as read-only. No shared mutable cached bed or detached-buffer cache. Initial requests regenerate rather than introducing persistence; caching is deferred until measurement demonstrates need.

## Landform recipe

Start with a connected base around 8 metres high. Add broad coordinate noise, smaller relief, two seeded broad ridges and a broad valley. Avoid sharp cliff noise. Reserve three generously sized gentle meadow discs using smooth interpolation to a level interior and gradual exterior transition. They are geographic capacity reserves, not assigned weekly regions.

Place a large elongated basin in the southwestern portion and a smaller basin in the northeastern portion, using independently seeded centres/radii. Smoothly shape beds below the proposed spill surface, raise a surrounding rim, lower a narrow outlet notch and add an elevated elliptical island to the larger basin. Feature spacing prevents reserve interiors overlapping basin interiors. Smoothly lift low ground within 35 metres of the perimeter, with boundary samples at least 4 metres high (one metre above both proposed surfaces). The outer map remains connected above both proposed surfaces. Check positive terrain margins and connected dry ground across representative years.

The depression, rim, notch and island are real height samples. Diagnostic water is an illustrative overlay where sampled bed lies beneath a basin's proposed level; Phase 2 must recompute final filling and lake classification. No island prop or floating terrain patch is used.

## Worker lifecycle

`AnnualWorldClient.generate(year)` validates the key, cancels a pending request with AbortError, creates a fresh worker and posts a uniquely numbered request. On success it validates the response identity, grid and finite buffer data, reconstructs frozen metadata, terminates the worker and resolves. On invalid output, worker errors, message errors, unsupported workers, synchronous setup/post failures or disposal, it terminates and rejects. Late callbacks from terminated workers are ignored. Disposing is idempotent and prevents later requests. Cancellation interrupts compute through worker termination, not a cancellation message that a synchronous worker cannot read.

No animation or generation timing influences geography. No localStorage, backend writes, scheduled jobs, task mutations or account identifiers.

## Diagnostic preview

Add `grove-world-preview.html` as a standalone Tasks build entry using the existing shared tokens/buttons. It is not added to the normal navigation. Show a faceted 3D relief model, a year control, generation status and numeric summary. Label illustrative basin surfaces explicitly. Render on demand and dispose resources on page exit. Recreate the client and renderer on restoration from the browser back/forward cache. A WebGL error produces a readable error rather than blocking worker/domain use. Controls remain reachable at 390 px and use at least 44 px targets. No purchase, new scenery pack or external service is required.

## Acceptance

1. Same key yields byte-identical original-bed buffers and equal descriptors; independent requests do not share buffers.
2. Different years yield distinct terrain. Invalid keys/versions fail without generation.
3. Output has 66,049 finite bed samples, expected dimensions/extent and useful relief.
4. Meadow interiors have gentle slopes; they remain dry against proposed basin levels. Representative-year dry terrain remains connected and predominates.
5. Both basins contain depressed bed below their proposed level, bounded rims/notches and the larger basin contains genuine elevated island cells.
6. Original beds and metadata survive worker transfer; buffers are transferred, not copied accidentally or retained detached in a cache.
7. Supersession, late responses, errors, malformed data, disposal and unavailable workers have deterministic lifecycle tests.
8. Real browser worker generation and rapid year switching work in Chromium and WebKit at desktop/390; no page errors or horizontal overflow.
9. Record generation duration/buffer size, screenshots and observed limitations. This is not a 30 FPS annual renderer performance claim.
10. Existing Grove tests, full Tasks tests, Tasks production build, focused Phase 1 typecheck and mandatory pre-PR gate pass. Full Tasks typecheck is also run and any pre-existing unrelated errors reported separately, without weakening checks.
