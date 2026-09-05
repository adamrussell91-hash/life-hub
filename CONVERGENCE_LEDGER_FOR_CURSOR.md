# Life Hub — What To Build, In Order

Three separate AI brainstorms (Claude, Cursor's own audit, ChatGPT) plus a Codex attempt to combine them produced 70+ ideas and a messy ranking. This replaces all of that with one flat list, checked against the actual code on `main` today. Ordered by priority — do the first two immediately, then work down the list.

## Do these two first — nearly free

**1. Finish Teaching's version history.**
The frontend is fully built and already calls backend routes that don't exist: `apps/teaching/src/teacher/version-api.ts` expects `GET/POST /api/lessons/:id/versions` (same for `units` and `classes`), plus `/versions/:revision` and `/versions/:revision/restore`. Nothing under `netlify/functions/` implements them. Add the four routes using the existing `teaching-blobs.mjs` store. Roughly a day of work, and it unlocks items 9 and 4 below.

**2. Check what's actually missing in Tasks.**
`docs/consolidation/plan.md` says, as of last week's fold: `/api/reviews` and `/api/task-properties` are fixed, but `/api/capacity` and `/api/stress-flags` are still missing. Confirm that's still true (grep `netlify/functions/`) before building anything below that assumes Tasks can report stress or capacity — item 6 needs it.

## Then, in priority order

**3. Give things one identity across hubs.**
A Life diary entry, a Knowledge page, a Tasks project, and a Teaching lesson each have their own, incompatible way of being identified. Knowledge is the only one with a real cross-link field (`connected: []` in `knowledge-data.mjs`); Life doesn't even have a durable ID — a record's "identity" is just its file path. Start small: pick one real case (a Teaching unit, its Knowledge sources, its Tasks project) and link them using Knowledge's existing `connected` field, extended to point outside Knowledge. This is the one idea all three original brainstorms agreed on independently — most things below get easier once it exists.

**4. Make "propose and confirm" one real system, decisions included.**
This mostly already exists. `netlify/functions/_shared/capabilities/propose-action.mjs` and `chat-confirm.mjs` already let an agent propose a batch of writes, queue them, and log the outcome to a governance log (`data/governance/governance-log.md`). Three real gaps, not a rebuild: (a) confirm doesn't check whether the file changed since the proposal was shown — it just overwrites; (b) you can't accept part of a proposal and reject the rest, it's all-or-nothing; (c) it only writes through Life's GitHub-backed files, not Tasks' or Teaching's Netlify Blobs storage. Fix those three. The "decision ledger" idea from the brainstorms is the same system — extend the existing governance log entries into real decision records (chosen option, reasoning, when to revisit) instead of building a second thing.

**5. Make it visible when an agent is missing information.**
A rule already exists saying silent context loss is a bug (`.cursor/rules/agent-context-integrity.mdc`). But `hub-agent-context.mjs` currently swallows failures into an empty list with no signal anything went wrong, and silently caps context (12 tasks, 12 classes, 10 lessons, 14 days) with no visible warning when it's cut off. Change the failure/cap result to say so explicitly instead of looking identical to "nothing to report."

**6. Combine the scattered "needs attention" lists into one.**
Life's home screen already shows one open item ("Hammond: X — 3 days open"), pulled from the governance log (`oldestOpenGovernanceEntry` in `home-model.js`). Widen it to also pull from the other places open items currently live — Central Node's cross-agent notes, Clare's "later" list, stale flags, Tasks stress flags (once item 2 is confirmed) — and keep showing just the oldest one.

**7. Let agents use real calculations instead of guessing.**
Nutrition/fitness/body/mind/skincare data is already flat, dated files under `data/{domain}/YYYY/MM/` — easy to query, but nothing computes anything over it today; agents narrate from raw context only. Start with one real number: workouts in the last 8 weeks vs. the previous 8 weeks, computed in code over `workout-history.mjs`'s already-parsed records, not estimated by an agent.

**8. Build one small panel for shortcuts.**
The backend already exists — `capabilities/registry.json`, `intent-router.mjs`, and the promote/list/run-shortcut endpoints are all there. There's just no screen for it.

**9. Skip reactive/live documents for now.**
A good idea (a note or page whose numbers update live when the underlying data changes), but it needs item 3 (shared identity) and item 7 (real calculations) to exist first, or it gets rebuilt once they land.

**10. Extend spaced repetition beyond quiz cards.**
Knowledge already has a real, working scheduler for this — `apps/knowledge/src/quiz/review.ts`, using the `ts-fsrs` library — but it's scoped to quiz cards only. Point the same mechanism at ordinary Knowledge pages so old notes resurface before they're forgotten, instead of building a new one.

**11. Simulate alternate teaching sequences.**
Depends on item 1 shipping first. Once version history exists, compare two possible unit orderings against each other before committing to one.

**12. Give document intake a real state machine.**
Two different half-built job systems already exist (`ai-jobs.mjs` and `chat-job-run.mjs`). Before adding a third, pick one real multi-step case — Knowledge's tidy/tag pipeline — and give it explicit stages (queued → extracting → classifying → awaiting review → done) instead of just a queue.

**13. Not worth scoping yet: tracing how an idea or decision changed over time.**
Needs items 3 and 4 to exist first — there's nothing stable to trace yet.

**14. Lowest priority: structured second opinions between agents, and watching external sources for changes.**
Real ideas, but no existing code to build on, and nothing else here depends on them.
