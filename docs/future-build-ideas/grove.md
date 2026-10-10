# Grove

**Status:** Adam's concept, captured 10 October 2026. Not yet a build brief.
**Ingredients:** [Collected source, asset inventory and examples](grove-ingredients/README.md).
**Terrain research:** [Noise, streams, lakes and growth](grove-resources.md).

Grove is a quiet Three.js forest drawn from completed-task history, viewed from above at an angle. It lives below Day and Tasks, separately from them. Home shows today's clearing; tapping it opens the wider forest.

## Appearance and behaviour

- Original scenery with the soft, cheerful low-poly feel of Adam's Forest Island screenshot.
- Trees have natural spacing, never a visible grid. Each species grows in its own patch.
- Task hub labels determine species. Teaching/oak, Life/pine and Professional/birch are candidate mappings. Overdue tasks finally completed may make gnarly trees; this is a visual possibility, not a penalty.
- Trees start as saplings and grow over a few real days. A brief wobble accompanies appearance.
- Animals wander, pause and graze on dry ground. Babies reuse the same animal model at half scale and follow a parent.
- Trees, shrubs, rocks and flowers come first from Kenney Nature Kit. Animated animals can use existing Kenney Cube Pets and suitable Quaternius packs. Poly Pizza is a source of additional variety.

## Rules

1. Nothing dies. Empty days are grass; sickness and holidays are meadow. No damage or guilt mechanic.
2. Growth follows elapsed real dates, not effort or continued activity.
3. Animals correspond to recognisable real milestones, not points. Examples: rabbit for the first five-task day; deer for a week with a completion every day; owl for finishing a book; fox at term's end. Exact thresholds and data sources remain to be confirmed in a build slice.
4. The same history draws the same forest. Derive scenery and tree growth on load; no stored game state, new storage, daily job or background simulation.
5. Reopened tasks lose their trees. Board visibility does not limit the forest's history. Deleted tasks obey the repository's deleted-means-gone rule.

## Views

| View | Scene | Source |
| --- | --- | --- |
| Day | Grass, flowers and a sapling for each completion in a small clearing | Today's completed tasks |
| Week | Seven clearings, with softer weekends | The week's completions |
| Term | A stretch of woodland with trees of different ages | One actual school term |
| Year | The terms so far, separated by holiday meadows or streams | The year's completions and configured school terms |

View changes should change framing and visibility rather than randomly inventing a new forest. Terms use the configured dates, not an assumed ten-week duration.

## Repository facts checked

- [Task schema](../../apps/tasks/src/schemas/task.ts) has nullable `completed_at`.
- [Task store](../../apps/tasks/src/services/store.ts) sets that timestamp when a task first becomes done, preserves it on normal updates, and clears it when status changes away from done.
- [Done retention](../../apps/tasks/src/domain/done-retention.ts) filters the Board's Done column to a seven-day window and can reveal older completions; it is a visibility rule, not a delete operation.
- [School-term helper](../../packages/design-kit/js/calendar/school-terms.js) resolves actual date ranges from existing preferences/planning/calendar sources.

These support deriving Grove without a new game-state store. They do not establish that every legacy record has a valid completion timestamp or that every current API returns the full history. A future build needs to verify the history read path and reuse shared deleted-record filtering. A 'closed' task is not automatically a completed task: closed also includes deleted records.

## Open questions for the eventual build

- Which existing classifier is the authoritative Teaching/Life/Professional label? Task `domain` is configurable; do not assume it is an immutable hub label.
- What should happen to legacy done tasks without an accurate completion date? Do not invent planting dates from the current time.
- Does 'overdue when completed' require past due-date history, or is the retained due date sufficient? Later edits must not silently rewrite the meaning.
- How does a completed book map into the owl milestone? A finished task is not necessarily a finished book.
- Exact animal milestone definitions, maturation duration and default species mapping.

## History

- **2026-10-10:** Captured Adam's Grove concept and linked the collected raw ingredients. This is separate from Life City; its terrain does not inherit Life City's harbour, district or transit rules.
