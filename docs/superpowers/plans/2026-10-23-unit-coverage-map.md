# Unit coverage map: build plan

Spec: `docs/superpowers/specs/2026-10-23-unit-coverage-map-design.md`. One PR, phases as commits.

## What already exists (and is reused)

- `network/model.ts`: `orderStations`, `placeByDate`, `withAutoDepths`, and `buildFlow` (flow splits from `after_lesson_ids`) give the lesson order and the A/B forks.
- `curriculum_lines` v2 `rail_stops` already mark support and extension lessons (`kind`, `lesson_id`, `after_lesson_id`, `skip_rule`). `gates` and quiz lessons (`pedagogical_mode: 'quiz'`) give checkpoints. `terminus` gives the assessment.
- `alignment/coverage.ts` and `focusAreaFor` give the unit's focus area and its U and R dot points. Lessons carry `dot_points` and `line_stops`.
- `markbook/api.ts` `load(classId)` returns the roster and quiz columns. `evidence/markbook-evidence.ts` turns them into evidence. `studentBand` gives weak, developing and secure.
- The markbook stores per-student `focus` through `set_focus`. "Took this" follows the same pattern.

## Phase 1: data

1. Lesson `route_role: 'support' | 'extension'` (unset means core) and `skip_rule` (max 80). Plumbed like `lesson_kind`: `schemas/lesson.ts`, `lessons/library-patch.ts`, `curriculum/lesson-summary.ts`, `teacher/nav.ts`, `netlify/functions/curriculum.mjs`, `scripts/mock-api.ts`. Regenerate bundled runtimes.
2. Before and after panel: a "Route" select (Core, Support, Extension) and a skip-rule field when Support or Extension is chosen.
3. Markbook `took: Record<studentId, lessonId[]>`, action `set_took` (server, schema, api, mock). Regenerate `markbook-schema.mjs`.

## Phase 2: model (pure, `network/coverage-map/model.ts`, unit tested)

`buildCoverageMap(input)` returns:
- `rows`: lessons in flow order, each with `lane` (`core | support | extension | optionA | optionB`), `kind` (`lesson | check | goal`), tag, skip rule, week band, date, href and the item ids it teaches with a depth.
  - Lane: lesson `route_role`, else the kind of a rail stop that names it, else core. A lesson inside a flow split is an option. The first branch is A, the rest are B.
  - The terminus is a final `goal` row.
- `groups`: Understanding (U points), Responding (R points), Concepts (metro lines), Skills (light-rail lines). Without alignment, Syllabus groups fall back to train lines.
- Item depth per row: line stop level (auto depths applied). Dot points take the depth of the lesson's stop on the train line linked to that group, else count (first introduced, then reinforced, fourth mastered). Light rail uses the count.
- `coverage` per item: core count, optional count, first row, `thin` (4 or fewer core).

`studentRoute(map, evidence, took, studentId, today)` returns per row whether the student took it, a quiz score, and per row and item a state (`struggling | working | secure | null`) carried forward from the latest evidence on or before that row, plus a `star` at the second separate secure checkpoint.
- Evidence placement: `quiz:<lessonId>` sources land on that row.
- Item match: `skill:<strand>.*` tags match light-rail lines linked to that strand. Every other evidence item from a quiz lesson counts towards the items that quiz lesson teaches.
- Took: an attempted quiz in that lesson, or the manual list.

## Phase 3: drawing (`network/coverage-map/draw.ts`, `coverage-map.css`)

- An SVG built like the approved mockup: week bands, a three-lane gutter, tags, branches, a coverage header, collapse per group, Collapse all, a selected row, and focus on one item.
- HTML controls above it: Collapse or Expand all, the view picker (Class, then the class's students), and "Took this" on a selected side lesson in student view.
- Under 600px, groups start collapsed. Branches scroll sideways while names stay pinned.
- Colours from `lineColour` for groups. Tokens for light and dark.

## Phase 4: wiring

- `curriculum-lines/render.ts`: teacher and print modes draw the coverage map. Student mode keeps `mountNetworkStage`.
- `UnitNetworkContext` gains `rawLessons` extras (`route_role`, `skip_rule`, `quiz`), `classes` (id and name for classes teaching the unit), `loadClass(classId)` and `saveTook`.
- The coverage panel stays under the map.

## Phase 5: checks

- Unit tests for the model (lanes, forks, depth, coverage counts, student states, carry forward, star).
- `npm run pre-pr-check`.
- Browser walk on the mock API at desktop and 390px: class view, collapse, a student, took this.
