# Curriculum network: units and the year as a transit map

Date: 19 October 2026
Status: design, awaiting Adam's review
Builds on: Curriculum lines block (PR 964)
Next design: ticket-gate routing (diagnostic boarding, checkpoint junctions, desire lines)

## Why

The Curriculum lines block draws a unit as a transit map, but it is a hand-drawn picture of the intended curriculum. Its strands are free text, every station is one strand in one week, and it has no way to show the work that branches off a lesson. Three problems showed up in use:

- A checkpoint and a shared lesson in the same week draw two capsules on top of each other, so the checkpoint chip floats in the gutter, joined to nothing.
- A line cannot split, so extension, optional and support work has nowhere to go.
- Nothing connects the unit map to the year, so you cannot see a concept or skill come back across units.

This design rebuilds the map around how Sydney's transport network actually works, at two zoom levels: a **unit map** (week to week, lesson by lesson) and a **year network** (unit by unit). The same lines appear at both levels, so zooming in and out joins up.

## The model

### Stations are lessons

A station is a full lesson. It ties several lines together, as an interchange does. Smaller things (an activity, a practice task, a homework) are not stations; they are stops on light rail (below).

### Three modes of line

| Mode | Stands for | Examples | How it behaves |
|---|---|---|---|
| Train (T) | The syllabus's own groupings | Understanding, Responding | Surface rail. Runs through the stations that serve it. Where a lesson does not serve it, the train **bends round** the station. Thick solid line. |
| Metro (M) | Textual concepts | Representation, context, perspective | Underground. Runs **straight under** every station and never bends round anything. A dot on the station means it stops; no dot means it passes underneath. Concepts sit in at least half the lessons and rarely get extension or support work, so metro never branches. Cased line (two edges, pale centre). |
| Light rail (L) | Skills | Analytical writing, creative writing, literary technique analysis, oral skills | Thin, lighter line. Weaves between lessons and out to small stops. **All branching lives here**: optional extension spurs, support loops, practice tasks. Builds towards the task the skill is assessed in. |

Lines may cross. Sydney maps cross lines all the time, and this map will need to.

### Light-rail stops

A light-rail stop is a small dot on a light-rail line. It points to one of:

- a whole lesson
- one block (activity) inside a lesson; clicking opens the lesson scrolled to that block
- a text label with no link

A stop has a **kind**:

- **stop**: an ordinary practice point on the line
- **extension**: optional; drawn as a dashed spur that ends at the stop
- **support**: a loop that leaves the line and rejoins it at the line's next stop

Branches inherit their line's style, so a support practice task on oral skills is light rail.

### Depth

Train and metro stops keep the existing depth: introduced (open dot), reinforced (filled dot), mastered (ringed dot). Light-rail stops have no depth.

### Gates

Heavy capsules are reserved for gates: the diagnostic at the start of a unit and checkpoint quizzes. This design only draws a gate that a teacher places. What a gate does (routing students by device) belongs to the ticket-gate design. Ordinary lessons never get a capsule; a lesson that combines lines is the station those lines pass through.

### Outcomes

Every unit in HSC English holds every outcome, so outcomes cannot be lines. They stay where they are (tagged on lessons and units) and appear in a coverage panel in the year network (see below).

## Where the data lives

One place for each fact, so the two zoom levels cannot disagree.

### Line list: on the subject

`Subject.network_lines` (new, optional, max 24):

```ts
{
  id: string;            // stable, e.g. 'line_x7k2'
  mode: 'train' | 'metro' | 'light_rail';
  name: string;          // 'Responding', 'Representation', 'Oral skills'
  short?: string;        // badge text, max 4 chars, e.g. 'RESP'
  colour: CurriculumLinesColour; // the existing palette tokens
}
```

The order in the array is the order of columns on the map, trains first, then metro, then light rail. Edited from the subject's settings with a small list editor (add, rename, reorder, change mode and colour, remove; removing a line in use asks first and lists where it is used).

### Which lines a lesson serves: on the lesson

`Lesson.line_stops` (new, optional, max 16):

```ts
{ line_id: string; level?: 'introduced' | 'reinforced' | 'mastered' }
```

`level` applies to train and metro. A light-rail line in `line_stops` means that lesson is itself a stop on that skill line. Edited in the lesson's settings next to the outcome picker, as a row of line chips grouped by mode, each with a depth toggle.

### Light rail, gates, nudges and terminus: in the unit map block

The `curriculum_lines` block moves to content version 2. The derived parts (stations and which lines stop where) are no longer stored in the block.

```ts
content: {
  version: 2;
  title?: string;
  rail_stops: Array<{
    id: string;
    line_id: string;                 // a light_rail line
    after_lesson_id?: string;        // position: sits after this lesson; absent = before the first lesson
    kind: 'stop' | 'extension' | 'support';
    lesson_id?: string;              // links a lesson ...
    block_id?: string;               // ... or a block inside that lesson
    label: string;                   // may be empty; display falls back to the lesson or block title
  }>;                                // max 60
  gates: Array<{
    id: string;
    after_lesson_id?: string;
    label: string;                   // 'Diagnostic', 'Quiz'
    lesson_id?: string;              // the quiz lesson, when there is one
    line_ids: string[];              // lines the gate checks
  }>;                                // max 12
  nudges: Record<string, { dx: number; dy: number }>; // keyed by rail stop id or bend id; max 120
  terminus: { label: string; detail?: string; when?: string; lesson_id?: string };
}
```

### Migrating version 1 blocks

Version 1 blocks (the shape on main today) are converted on read and saved back as version 2 on the next edit:

- Each v1 strand becomes a subject line of the same name. Its mode is taken from a name match against existing subject lines, otherwise train. The teacher can change modes afterwards.
- Each v1 station with a `lesson_id` becomes a `line_stops` entry on that lesson, keeping its level. A station without a lesson becomes a light-rail text stop placed after the last lesson of its week.
- Each v1 checkpoint becomes a gate.
- The terminus carries over unchanged.

Conversion writes to the lesson and subject records, so it runs through the normal save path (teacher's own action, versioned), never silently in the background. When a teacher opens a v1 block in the editor it shows a one-line "Upgrade this map" bar that does the conversion in one step.

## Unit map

### Ordering and weeks

Rows are lessons in unit `lesson_ids` order. When the viewer's class has a schedule, rows are grouped into week bands from the scheduled dates; with no schedule the bands are left out and lessons simply follow one another. The `weeks` field of v1 goes away.

### Automatic layout, then nudge

The map lays itself out from the data above. The teacher can drag a light-rail stop or a light-rail bend to tidy it, and the offset is saved in `nudges`. Adding or removing a lesson never breaks the map: nudges are keyed by stop and bend ids, and a nudge whose target is gone is dropped.

Layout rules (vertical, desktop):

1. **Trunk.** Train and metro lines are columns in a central corridor, in subject order. Each lesson row has one station pill spanning the corridor.
2. **Metro.** Straight columns the full height. A dot on a station where the lesson stops on that line. No dot where it passes under.
3. **Trains.** Straight through stations that serve them. Before a station that does not, the train bends out at 45° to a detour lane outside the corridor (trains sit on the left of the corridor, so detours go left), passes the pill, and bends back. Consecutive skipped stations share one detour. Two trains skipping the same station take nested lanes.
4. **Light rail.** Each light-rail line gets a lane outside the corridor, alternating right, left, right. A segment runs from one stop to the next: from a station edge (when the lesson is a stop) or from a rail-stop dot placed in the gap after its `after_lesson_id` row. Extension stops hang off a dashed spur from the previous stop and end there. Support stops sit on a loop that leaves at the previous stop and rejoins at the next.
5. **Gates.** A capsule drawn across the lines in `line_ids`, in the gap after its lesson.
6. **Terminus.** The existing terminus pill at the foot, where every line ends.
7. **Crossings.** Allowed. Light rail is drawn above metro and below trains, so crossings read in a consistent order.

On phones the same layout is transposed (lessons run left to right) and swiped inside the block, as the current block does.

### Labels

Each station shows its lesson title once, beside the pill. Rail stops show their label beside the dot. Line names sit in a header row (short badge, full name on hover or tap) and in the legend.

### Students

Students see the same map. Links go only to published lessons (the current rule); an unpublished lesson's station shows its title without a link. Rail stops pointing at a block in an unpublished lesson show as text.

## Year network

### Where it lives

A **Network** view on the subject's scope and sequence page (teacher), and on the class site (students, published units only). Year 12 English only for now; Year 11 is not in the hub. The data model does not tie a network to a year level, so a stage-wide network can be added later by linking subjects.

### What it shows

- **Stations are units**, drawn as interchange complexes, in scope and sequence order.
- A unit **stops on** a train or metro line when any of its lessons does; its depth is the highest depth among them. It stops on a light-rail line when any lesson or rail stop in it does.
- The same mode rules apply: trains bend round units that do not serve them, metro runs straight underneath with dots for stops, light rail weaves between units it touches.
- An **HSC terminus** at the end, where the train lines finish.
- A **class-now dot** on the trunk at today's position for the selected class, taken from its scheduled lessons (the latest one dated today or earlier).
- **Tap a unit** to open its unit map.

### Layout

Automatic, then nudge, as with unit maps. Units are laid along the trunk with 45° bends so the map has some geography rather than rows: units that share more metro and light-rail lines are pulled closer. The teacher can drag a unit, saved per subject in `Subject.network_nudges` (same shape as block nudges, keyed by unit id).

### Outcome coverage panel

Beside the network, a list of the subject's outcomes. For each, the units whose lessons tag it and the highest depth reached on any line through those lessons. Outcomes with no tagged lessons are flagged. This replaces "outcomes as lines".

## Out of scope (next design: ticket gates)

- Diagnostic boarding and checkpoint junctions routing students by device token.
- Student "your journey" view.
- Desire lines (how many students travelled each route, across classes and years).
- Enacted layer from `delivery_status`.

The data here leaves room for all of them: gates already exist as objects, support loops already exist as rail stops, and scheduled lessons already carry delivery status.

## Build phases (one PR, a commit per phase)

1. **Data.** `network_lines` on Subject, `line_stops` on Lesson, `curriculum_lines` v2 schema, v1 to v2 conversion. Regenerate `netlify/functions/_shared/teaching-block-schema.mjs` with `node scripts/generate-alchemy-schema.mjs`.
2. **Unit map model and renderer.** Pure layout in `apps/teaching/src/blocks/curriculum-lines/model.ts` (trunk, detours, metro, light-rail lanes, spurs, loops, gates, nudges), rendering in `render.ts`, both orientations.
3. **Editors.** Subject line list editor; lesson line chips beside the outcome picker; unit map editor for rail stops, gates, terminus and drag-to-nudge; the "Upgrade this map" bar for v1.
4. **Year network.** Model and renderer (reusing the unit map's line drawing), Network view on the scope page, tap-to-zoom, class-now dot, outcome coverage panel.
5. **Students.** Unit map and year network on the class site, published lessons and units only.

## Testing

- Unit tests for the layout model: train detours (single, consecutive, nested), metro never bends, light-rail spur and loop geometry, stale nudges dropped, unit stops and depth derived correctly, v1 to v2 conversion (including stations without lessons and checkpoints).
- Browser tests: unit map renders at desktop and 390px, a station link opens the lesson, a block stop scrolls to its block, the year network opens a unit map, students see no links to unpublished lessons.
- Fixtures use invented lesson and line names (public repo).

## Risks

- **Auto layout quality.** Octilinear layout is hard in general. The rules above are deliberately constrained (fixed corridor, fixed lanes, 45° bends only) so the result is predictable; nudges cover the rest. If the year network's "pull units closer" step looks messy, fall back to a fixed zigzag along the trunk.
- **Tagging effort.** The maps are only as good as the lesson line chips. The v1 conversion fills them for existing maps; for new units the chips sit next to the outcome picker that is already part of planning a lesson.
- **Phone width.** The unit editor currently gives blocks about 85px on a phone (known, unfixed). The map itself swipes, but the editor needs that fixed before it is usable on a phone.
