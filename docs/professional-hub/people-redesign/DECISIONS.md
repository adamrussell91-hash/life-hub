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
| Link inference | Agent sweep (Hammond daily sweep and annotation automations) | Sweeps Tasks and Events (then other hubs) for people. Proposes `professional_relationship` / `employee_at` / `collaborator` / `contact` links. Adam confirms each one |
| Warmth score | Product algorithm | Weighted by relationship: people closer to Adam, and closer to his current circumstances (current workplace, active projects), go cold faster. Communications feeds it once built |
| Remember | Agent automation, about twice a day | Pulls facts from notes, tasks and comms. Each fact shows its source. Editable |
| Ledger | Agent, triggered from an avatar button on the person card, plus the sweep | Two directions: you owe / they owe. Writes into the card live, patching in place with no reload flash. Every item is editable. Conversions: ledger item → task, task → comms item |
| Ask | AI search agent (owner undecided, see below) | Needs cross-hub context: people graph, tasks, projects, teaching/APST |
| Today strip | Product | Adam's own availability only. Suggests times from the history of past meetings with that person. No other staff timetables |

## Open question: which agent owns Professional?
No agent currently has the professional domain (`_shared/agent-directory.mjs`).
Ann O'Tation is set up as a teaching and lesson coach. Hammond is the
whole-hub coordinator. Options:
1. Extend Ann's remit to professional practice (mentoring, APST, colleagues).
2. A new Professional specialist that owns People, the ledger, Remember and Ask.
   Hammond's sweep hands People work to it.
3. Hammond does it directly.
