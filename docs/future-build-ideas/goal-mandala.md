# Goal mandala: a 9×9 grid for thinking through a goal

## The idea

Add a sixth goal structure, **Mandala**, beside WOOP, SMARTER, OKR, Lead/lag and Floor·target·stretch. It is based on the 9×9 chart used in the Harada Method (often shared as "one goal, 64 habits"): the goal goes in the centre, eight pillars that support it sit around the goal, and each pillar gets eight concrete actions.

The grid is a **thinking tool, not a tracker**. Its value is in making you name eight different angles on one goal, including ones that are easy to skip (rest, relationships, character, luck). Once it is filled in, it is a menu you pick from, not 64 boxes to tick each day.

## Why not a 64-habit tracker

- Goals is built around one lead measure per goal, "this week's one move", an if-then trigger and a 2-minute start. Sixty-four daily items would swamp the runway.
- The kit rule is no red for a miss. A grid that mostly shows misses breaks the spirit of that rule even without red.
- In the full Harada Method the chart is one tool among several. The daily part is a short routine check sheet (around ten items) and a journal, not the whole grid.

## How it would work

1. **Mandala structure card.** The goal page shows a 3×3 view: the goal in the centre, the eight pillars around it. Tapping a pillar opens its own 3×3 with the pillar in the centre and its eight actions. On a phone, one 3×3 at a time.
2. **Promote.** Any action cell can be promoted to:
   - the goal's lead measure (`lead_measure`),
   - the if-then trigger,
   - a task or project hosted by the goal.
   A promoted cell shows a small link to what it became. Aim for one to three promoted cells per goal.
3. **Pillar coverage.** A pillar can link to a hosted project. The grid then shows which pillars have work behind them and which are empty. Empty pillars are the most useful thing the grid reveals.
4. **Nothing is lost.** As with the other structures, the mandala fields live in `frame.mandala` and stay under the closed "Details" disclosure when another structure is chosen.
5. **Hammond helps fill it (optional).** Hammond can suggest pillars or actions from the goal and its hosted work, through the usual propose → confirm → apply flow. Hammond never fills the grid without a confirm.

## Data sketch

```
mandala: {
  pillars: [            // exactly 8, may be blank
    { id, label, project_id: string | null,
      actions: [ { id, label, promoted_to: { kind: 'lead' | 'if_then' | 'task' | 'project', id } | null } ]  // up to 8
    }
  ]
}
```

`structure` gains `'mandala'`. No new endpoint should be needed; it rides on the existing goal record.

## What it would not do

- No daily tracking of each cell.
- No score or percentage for the whole grid.
- No requirement to fill all 64 cells. A half-filled grid is fine.

## Open questions

- Should the mandala be a full structure, or a "think it through" step any structure can open, since its output (a lead measure, an if-then, hosted work) feeds the other structures anyway?
- Does it overlap with the brainstorm block or Problem Solver enough to reuse one of those instead of a new view?
- Should the Sunday check-in or weekly review ever surface an empty pillar, or is that nagging?
- Is a 3×3 of eight pillars too many for small goals? Allow fewer, or keep eight as the prompt to stretch?

## Built (11 November 2026, first slice)

- **Mandala** is a sixth structure on the goal page. The card shows a 3×3 of the goal and its eight pillars; "n/8 actions →" opens a pillar as its own 3×3. The open pillar survives saves.
- Each named pillar shows the project behind it, or "No project yet". The pillar view has a project picker listing the goal's hosted projects. The summary line counts named pillars and pillars with a project.
- An action can be used as the **lead measure** (asks before replacing an existing one; only one cell holds it) or as a **task on this goal** (creates the task, then records its id). A chip shows what the cell became, and only while that still holds: a changed lead measure or a deleted task frees the cell again.
- Data: `frame.mandala.pillars[]` (`id`, `label`, `project_id`, `actions[]` with `promoted: { kind: 'lead' | 'task', task_id } | null`), normalised on the server to at most eight of each with blank cells kept in place.
- Not built in the first slice: promotion to the if-then, Hammond suggestions, and an answer to the open question on structure vs step.

## Built (11 November 2026, second slice)

- **Restyle** to the approved goal-page look: pastel pillar tiles with bold text on the tile, a navy goal centre, dashed empty slots, dot progress, and a single-column action list on a phone.
- **Use as if-then.** The action fills the trigger's "then" and the cue field takes focus. Nothing is saved until the cue is typed, because a trigger without a cue is not a trigger. Replacing an existing trigger asks first. The cell shows "If-then" while the trigger's action is that text; nothing is stored on the cell.
- **Hammond suggests cells** (`goal_mandala` proposal, Mandala goals only). Hosted projects not on the grid become pillars in empty slots, linked to the project; open tasks in a linked project become actions under that pillar, marked as that task. Deterministic, from existing work only; at most eight cells per proposal. On Confirm the additions merge into the grid as it is then: cells typed since the read are kept, and an action only lands under the pillar still linked to its project. Declining it repeatedly cools it like the other proposal kinds.
- Still open: model-written pillar ideas for goals with no hosted work yet, and the structure-vs-step question.
- Files: `apps/tasks/src/views/goal-mandala.ts`, `goal-frame.ts`, `goal-page.ts`, `schemas/goal.ts`, `styles/goals.css`, `netlify/functions/_shared/goal-record.mjs`; tests in `apps/tasks/tests/unit/goal-mandala.test.ts` and `tests/unit/goal-record.test.js`.

## History

- 11 November 2026: concept doc created from a discussion of the Harada 9×9 chart and how it fits the Goals design.
- 11 November 2026: first slice built (see Built).
- 11 November 2026: second slice built: restyle, if-then hand-over, Hammond grid proposals.
