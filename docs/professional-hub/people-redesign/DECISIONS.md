# People redesign: decisions

Direction: `mockups/04-directory-plus` (Option A+). Recorded 26 Sep 2026.

## Layout
- One heading. One person view (the brief becomes the profile, and the separate brief page goes).
- Directory grouped by organisation, with filter, sort and group controls.
- No Message button. The hub will never send work email. Communications
  records what happened; it does not send anything.

## Feature ownership

| Feature | Built by | Notes |
|---|---|---|
| Crests | Product | Logo field and upload on Organisation. Adam supplies the images |
| Link inference | Clare's sweep of Tasks and Events; Hammond's daily sweep for other hubs | Sweeps Tasks and Events (then other hubs) for people. Proposes `professional_relationship` / `employee_at` / `collaborator` / `contact` links. Adam confirms each one |
| Warmth score | Product algorithm | Weighted by relationship: people closer to Adam, and closer to his current circumstances (current workplace, active projects), go cold faster. Communications feeds it once built |
| Remember | Ann, about twice a day | Pulls facts from notes, tasks and comms. Each fact shows its source. Editable |
| Ledger | Clare, from her avatar button on the person card and in her sweep | Two directions: you owe / they owe. Writes into the card live, patching in place with no reload flash. Every item is editable. Conversions: ledger item → task, task → comms item |
| Ask | Ann | Needs cross-hub context: people graph, tasks, projects, teaching/APST |
| Today strip | Product | Adam's own availability only. Suggests times from the history of past meetings with that person. No other staff timetables |

## Agent split
- **Clare DeMind** handles anything based on tasks, events and comms: the ledger,
  converting ledger items to tasks and tasks to comms, and proposing links from Tasks and Events.
- **Ann O'Tation** takes on professional practice beyond lessons: Remember, Ask,
  and the meaning of relationships (mentoring, APST, colleagues). Her voice and
  remit in `_shared/agent-directory.mjs` need widening.
- **Hammond** coordinates: runs the daily sweep, hands People work to Clare and
  Ann, and flags relationships going cold that matter to the current mission.
