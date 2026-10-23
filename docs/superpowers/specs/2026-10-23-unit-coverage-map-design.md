# Unit coverage map

Date: 23 October 2026. Approved by Adam after a long mockup round (transit lines, radial, fan, weave, skill tree, constellation and others were tried and rejected).

## Purpose

A unit map that shows **what was taught and when, where each lesson led from and to, how much attention each strand got, and how one student is travelling through the unit**. It is for planning (coverage, neglect, build-up from introduced to mastered) and for finding who struggles with what, so support and extension can be planned.

## Decisions

- It **replaces** the transit-line unit map in `curriculum_lines` blocks (version 2 content). The year map keeps the old corridor engine.
- **Teacher only** in this build. Students keep seeing the current map until a student "my line" view is designed.
- The student view is built **from evidence that already exists**: quiz attempts and markbook evidence. A support, extension or option lesson counts as taken when the student attempted something in it. The teacher can also tick "took this" by hand.

## Layout (desktop)

Three columns, top to bottom in lesson order.

1. **Week label** (left edge). Lessons sit in alternating week bands, by calendar date when the class timetable has dates (reuse `placeByDate`), otherwise map order.
2. **Route gutter**, three lanes:
   - support (left, orange), core (centre), extension and option (right, purple);
   - core lessons are joined by a solid line; a support or extension lesson loops out of the core line and back in;
   - an option (a flow split, from `after_lesson_ids`) is a real fork: both options are drawn and rejoin where the flow says;
   - quizzes and other checkpoints are diamonds; the assessment task (the map's terminus) is a square at the end;
   - support rows have an orange tint and a "Support" tag before the name; extension and option rows a purple tint and "Extension" or "Option A/B" tags. A skip rule ("90%+ on the pre-test") shows under the name when set.
3. **Strand branches**, one vertical branch per item, in four groups:
   - Understanding: the unit focus area's U dot points (from lesson `dot_points`);
   - Responding: the R dot points;
   - Concepts: metro lines;
   - Skills: light-rail lines.
   A branch is dotted until the first lesson that teaches it, then solid. Each teaching lesson is a node on its row. Node size and line thickness show depth: introduced, reinforced, mastered (line stop levels with auto depths; dot points take the depth of the train line they sit on, else first introduced, later reinforced). A node from a support lesson has an orange dashed ring; from an extension or option, a purple dashed ring.

**Groups collapse.** Tapping a group name collapses it into one branch whose nodes show how many of the group's items that lesson touches. "Collapse all" and "Expand all" sit above the map.

**Coverage header** above each item:
- a solid bar for core lessons (everyone gets these) and a pale bar stacked on it for support, extension and option lessons (only some students get these);
- an orange "!" when an item has four or fewer core lessons, or none at all;
- this is the neglect signal. Items taught everywhere (U1, R1) are simply tall bars.

**Interaction**
- Tap a lesson row: the row highlights, its nodes get a gold ring, and a summary line shows the lesson name, date and items.
- Tap an item label: that branch stays bright and the others fade.
- Tap a lesson name to open it (existing link behaviour).

## Student view (teacher picks a student)

Same layout with these changes:
- **Nodes take the student's evidence state** for that item at that lesson: struggling (red), working on it (amber), secure (green). The first lesson where the item becomes secure at mastered depth gets a star.
- No evidence at a taught lesson shows a small hollow node.
- **Route**: support, extension and option lessons the student took are drawn thick in their lane colour. Ones they skipped fade. At a fork, the option they took is highlighted. Lessons after their latest activity fade.
- **Quiz scores** sit beside checkpoint diamonds, red under 70%.
- **The coverage header becomes current state**: one dot per item in the student's latest state.
- The summary line for a selected lesson lists the student's state on each item.

Evidence source: markbook and quiz evidence (`evidence/markbook-evidence.ts`, `class-evidence.ts`) bands weak, developing and secure map to struggling, working on it and secure. Each piece of evidence is placed at the lesson it came from. Evidence tags must be matched to map items (dot points, metro lines, light-rail lines); the plan confirms how outcome and skill tags map, and items with no matchable evidence stay hollow.

## Phone (390px)

The route gutter and names stay. Branches start collapsed to the four groups, so the map fits without sideways scrolling. Expanding a group shows its items; if they don't fit, only the branch area scrolls sideways while names stay pinned.

## Data changes

- Lesson: `route_role: 'core' | 'support' | 'extension'` (default core) and an optional `skip_rule`, set in the lesson's Before and after panel. Options stay as flow splits.
- Student "took this" overrides: per class, per student, a list of lesson ids, stored with the class (teacher only).
- No change to lines, stops, dot points or the alignment data.

## Out of scope

- Students seeing the map (later, with a "my line" design).
- Personalised route suggestions, and score-based unlocking (ticket gates).
- Changes to the year map.

## Checks

- Desktop and 390px walk of a real unit, both views.
- The coverage header's counts match the lessons in the map.
- A unit with no dates, a unit with a fork, a unit with no dot points.
- `npm run pre-pr-check` passes.
