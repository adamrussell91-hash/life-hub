# Tasks Hub data model

Hierarchy for planning work, with cross-cutting tags and a Someday / Maybe holding pen.

## Tree

```
Area / Category
  └── Goal
        └── Project
              ├── Milestone (checkpoint — not a task)
              └── Task
                    └── Step
```

| Entity | Role |
|--------|------|
| **Area** | Broad life/work bucket (Teaching, Life, …). |
| **Goal** | Outcome under an area. |
| **Project** | Deliverable arc under a goal. Carries `milestones[]` inline. |
| **Task** | Actionable work on the board, day/week views, and backlog. |
| **Step** | Checklist item under a task (`kind: "step"`, `parent_task_id`). |
| **Milestone** | Date/status checkpoint on a project — not shown on the sprint board. |

## Cross-cutting

- **Tags / labels** — on goals, projects, and tasks (`tags: string[]`).
- **Someday / Maybe** — off-tree ideas (`bucket: "someday"`). Promote to goal, project, or active task from **Plan → Someday**.
- **Repeat** — JSON in `recurrence_rule` (`daily` / `weekly` / `monthly` / `yearly`, interval, optional count). Marking a recurring task **done** spawns the next instance with the advanced due date.
- **Notify me** — `remind_at` (ISO datetime) plus optional `due_time` (`HH:mm`). In-app reminder strip on every page; optional browser notifications if permission is granted. Snooze or dismiss from the strip.

## Recurrence rule shape

```json
{
  "v": 1,
  "frequency": "weekly",
  "interval": 1,
  "count": 10,
  "completed_count": 0,
  "weekday": 1,
  "series_id": "task_abc"
}
```

`count: null` repeats forever. `weekday` is 0–6 (Sunday–Saturday) for weekly rules.

## Reminders

| Field | Role |
|-------|------|
| `due_time` | Optional time on the due date (for “1 hour before” presets). |
| `remind_at` | When to surface the in-app / browser reminder. |
| `remind_dismissed_at` | Set when you dismiss; cleared when `remind_at` changes. |

Presets in the task editor: morning of due date, 1 day before, 1 hour before due time, or custom date/time.

## Board visibility

The sprint board, day/week focus, open tasks, and backlog include only **active board tasks**:

- `kind !== "step"` (and not legacy child rows treated as steps)
- `bucket !== "someday"`

Steps stay with their parent in the task editor. Someday items live on `#/someday`.

## APIs

| Resource | Mock / Netlify |
|----------|----------------|
| Areas | `GET/POST /api/areas`, `PATCH/DELETE /api/areas/:id` |
| Goals | `GET/POST /api/goals`, `PATCH/DELETE /api/goals/:id` |
| Projects | existing — now accepts `parent_goal_id`, `tags` |
| Tasks | existing — now accepts `kind`, `bucket`, `step_order` |

## Seed

`fixtures/seed.json` includes demo areas, goals, a step under the lesson-pack task, and a someday podcast idea.
