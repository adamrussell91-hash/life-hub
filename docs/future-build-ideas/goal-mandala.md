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

## History

- 11 November 2026: concept doc created from a discussion of the Harada 9×9 chart and how it fits the Goals design.
