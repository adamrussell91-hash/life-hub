# Career: applications made easy

Written 7 Nov 2026. Approved design; one branch, one PR, three parts as commits.

## Why

Career tracks futures well but does almost nothing for a real application:

- The Criteria Mirror is fake. `career-criteria-mirror.ts` sets `const pct = 0`, so every criterion
  shows 0% and offers a stepping stone. No code writes `answers_criterion` links.
- **Split into criteria** in the Mirror is broken. It sends `notes` and `evidence_refs`, which
  `parseCriteria` in `application-schema.mjs` rejects as unknown keys, so the save fails.
- Nothing helps write the application. Each criterion has a response box. Adam writes all of it.
- The Skills scan only reads Professional meetings with notes, so few cards exist and coverage
  barely moves.

Adam hands in criteria responses (often with word limits), a cover letter and a tailored CV. The
goal: getting an application done is a breeze.

## Part 1: The Mirror shows real coverage

**Splitting the ad.** The Mirror's **Split into criteria** uses the same rule as a future's paste
box (`career-criteria-paste.ts`, PR 1376): a list saves word for word, one criterion per line; a
paragraph over 400 characters or more than 20 lines goes to Ann (the existing `draft` job kind on
`/api/career-ann-run`). Lines that state a limit ("(250 words)", "max 300 words", "1 page") set that
criterion's `word_limit`; the text keeps the limit wording. Existing criteria are kept. The save sends
only schema keys.

**Schema** (`application-schema.mjs`, criterion keys):

- `word_limit`: integer 25–2000, nullable.
- `check`: nullable `{ status: 'have'|'partly'|'not_yet'|'unknown', evidence: string ≤ 300,
  card_ids: string[] ≤ 6, confirmed_at: ISO }`. Only confirmed answers are stored.

**Check against my record.** A button on the Mirror starts job kind `app_check` on
`/api/career-ann-run` (same start / status / clear flow and polling as the futures check, no clock).
The prompt is `applicationCheckPrompt`, a sibling of `futureCheckPrompt`. It adds the card id to each
card and asks for `card_ids` per suggestion. Inputs: criteria, kept cards with ids, Work card roles,
Central Node. The parser drops unknown criterion ids and card ids. Rules carried over: silent is
`unknown`, never `not_yet`; no invented roles, dates or credentials; no flattery.

**Confirming.** Each criterion row shows Ann's suggestion: the status pill, the evidence line and card
chips. Each has **Confirm**, a status picker to change it, and **Skip**. **Confirm all** saves every
row as shown. On save:

- `criterion.check` is written on the application.
- Each named card gets one `answers_criterion` link (achievement → application, `criterion_id`,
  `strength`: `strong` for have, `some` for partly). Re-confirming replaces that criterion's links.

**Coverage.** `career-model.ts` scores a criterion as `max(link strength, check status)`: have = 1,
partly = 0.5, otherwise 0 (the same values as `metCoverage`). The Mirror reads `pct` from the model,
not a constant. No check yet reads **Not checked**, never 0%. **Make it a stepping stone** shows only
on `not_yet` rows. The application's match % on the Career list comes from the same model result
(V4). A partly row shows "Partly · <evidence>", so Adam sees what's thin.

**Cost.** About 1 Sonnet 5 call: ~15k tokens in, ~3k out, roughly A$0.10. The button says so.

## Part 2: Drafting

**Draft responses.** Job kind `app_draft` with `target: 'responses'`. One call drafts every criterion
that has a confirmed check of have or partly. Inputs:

- the role, the school, and the ad summary;
- each criterion with its word limit, confirmed evidence and the full STAR text of its cards;
- Work card roles;
- the Central Node;
- Adam's private voice sample (`loadPrivatePersonalityWritingSample`, from the private data repo).

Rules:
- Write in his voice, first person.
- Stay under each word limit; with no limit, aim for 200–250 words.
- One claim per sentence, built on STAR. Use only the evidence given.
- No meta openers. State what he can do, with no deficit phrasing.
- Australian English, no markdown.

Criteria with no confirmed have or partly are not drafted; their row says "Check this one first" or
"Nothing in your record yet".

**Where drafts go.** Ann's text lands in `criterion.response` only when the box is empty or still holds
Ann's last draft unchanged. Add `response_source: 'ann'|'adam'` and `response_drafted_at`. If Adam has
edited the response, the Mirror shows the new draft beside it with **Use this** and **Keep mine**.
Nothing he wrote is overwritten silently.

**Cover letter and CV.** New application fields:

- `cover_letter`: nullable `{ text ≤ 8000, source, drafted_at, updated_at }`;
- `cv`: the same shape, `text ≤ 16000`.

`app_draft` with `target: 'cover_letter'` or `'cv'` drafts them from the role, the school, the
strongest confirmed evidence, Work card roles and the Central Node.

The CV is laid out as plain text with headings:

- profile;
- roles, newest first, each with 2–4 bullet achievements tied to this role's criteria;
- qualifications, registration, PD and referees ("Available on request" unless referees are linked).

Anything a section needs that isn't in the record appears as `[add: teaching registration number]`,
never made up. The Mirror shows a warning count for these brackets.

**Mirror layout.** The Criteria Mirror becomes the application workspace. From top to bottom:

1. the ad and **Split into criteria**;
2. **Check against my record**;
3. one row per criterion: text, limit, coverage bar, evidence, then the response box with a live word
   count (amber over the limit), **Draft**, **Copy** and **Redraft**;
4. the cover letter box;
5. the CV box.

Each box has Copy, Redraft and a word count. **Draft everything** runs responses, letter and CV as
three jobs in a row; the button states the total cost first.

**Cost.**
- Responses: ~20k in, ~5k out, roughly A$0.15.
- Cover letter: about A$0.08.
- CV: about A$0.10.
- Draft everything: about A$0.35.
- Redraft one piece: the cost of that piece.

## Part 3: A wider scan

**What it reads.** `collectScanSources` reads, for the window:

- Professional meetings with notes (as now);
- PD and events;
- communications;
- Tasks: done tasks, completed projects, achieved goals;
- Teaching: units and lessons built or taught, plus quiz and markbook activity summed per lesson;
- Knowledge pages written or edited.

**The live scan reads nothing today.** `collectScanSources` only calls `deps.listMeetings`. Neither
`career-scan.mjs` nor `career-scan-tick-scheduled.mjs` passes it, so every live scan has had zero
sources. This build gives the scan real default readers. Each one is an injectable dep, so tests stub
it.

| Source | Reader (copy from) | Counts when | Date | Text |
|---|---|---|---|---|
| `professional:meeting` | `createMeetingRepository({store}).listMeetings()` | has `notes` or `summary` | `occurred_on ‖ scheduled_start ‖ updated_at` | notes / summary |
| `professional:event` | `createEventRepository({store, env}).listEvents()` (as `agent-calendar-loaders.mjs` `loadProfessional`) | `occurrence_state === 'completed'` | `start` | title, type, hours, talk titles |
| `professional:communication` | `createCommunicationRepository({store}).listCommunications()` | any, with a `summary` | `occurred_at` | subject + summary |
| `tasks:task` | `listJSON(tasksStore, 'tasks/')` + `withoutDeleted` (as `hub-agent-context.mjs:164`) | `status === 'done'` ‖ `bucket === 'done'` ‖ `completed_at` | `completed_at ?? updated_at` | title + description |
| `tasks:project` | `listJSON(tasksStore, 'projects/')` | all child tasks done (derived, as `tasks-closure.mjs`); there is no completed status | `updated_at` | title + description |
| `tasks:goal` | `listJSON(tasksStore, 'goals/')` + `normalizeGoalRecord` | `status === 'achieved'` | `updated_at` | title + description |
| `teaching:unit` | `listJSON(teachingStore, 'units/')` | updated in the window | `updated_at` | title, code, description |
| `teaching:lesson` | draft `lessons/` + `scheduled_lessons/` | built (`created_at`), published (`published_at`) or taught (`delivery_status === 'delivered'`, dated by `date`) | the latest of those in the window | title, mode, unit, "taught to N classes", "N quiz hand-ins" |
| `knowledge:page` | `listKnowledgePages({env})` (manifest; no per-page reads) | `updated_at` in the window | `updated_at` | title, tags, excerpt |

Notes:
- Quiz activity is a count of keys under `quiz/<lessonId>/results/` only. No student names, scores or
  markbook rows go to the model.
- Lesson blocks are never sent. They're large and student-facing.
- A reader that fails (store unbound, Knowledge repo unbound) is skipped. The scan records which
  sources it read, and the panel says "Read: meetings, tasks, lessons…", so a silent gap shows.
- The window is now always clamped: weekly = `max(last_success_at, now − 21 days)`. Before, a long gap
  meant an unbounded read.

Each source becomes `{ ref, kind, title, date, text }`, with `text` trimmed to 600 characters. Refs
are universal refs, so source chips open the record in its own hub (already wired, PR e2a8a96f8).

**Weekly cap.** At most 60 sources per weekly scan, newest first, so the weekly cost stays at about
one call (~A$0.08).

**Scan my history.** A button on the Skills scan panel.

1. Adam picks 6 months, 1, 2 or 3 years.
2. `career-scan?action=history_estimate` counts sources in the window (no model call). It returns the
   count, batches (40 sources each) and the cost (about A$0.08 per batch).
3. The panel shows "412 records in 11 batches, about A$0.90. Go?"
4. On Go, `history_start` runs a background job that works through the batches in order. Proposals land
   in the normal Skills scan queue, deduped by the existing source-ref hash and title fold. Each batch
   is saved as it finishes, so a failure keeps the earlier batches.
5. The panel shows "Batch 4 of 11" by polling, with no clock.
6. One history scan at a time. **Stop** ends it after the current batch.

The ad's own read and the weekly scan stay on their current model.

## Not in this build

- Interview prep, referee ranking and briefings, ghost paths, What if.
- Word download (Copy only, as Adam chose).
- Job-board matching.

## Checks

- **Unit tests through the real handlers:**
  - `app_check` parse drops unknown ids;
  - confirm writes `check` plus `answers_criterion` links, and a re-confirm replaces them;
  - model coverage uses `max(link, check)`, and unchecked reads Not checked;
  - split saves only schema keys and picks up word limits;
  - a draft never overwrites an `adam` response;
  - CV brackets are counted;
  - each new source kind is collected with fake stores, and the 60 cap holds;
  - the history estimate counts and batches, and a history job resumes after the last finished batch.
- Mock API covers check and draft replies with invented people and schools only.
- Walk the Mirror at 1440 and 390 on the mock server: split, check, confirm, draft, copy, over-limit
  word count, and an empty store.
- `npm run pre-pr-check` once at the end.

## Failure register

L1, L2 (rows stay compact with the response collapsed to 3 lines until focused), S3 (opaque draft
compare), V1, D5 (cost and count lines read aloud), I3 (empty store), I4 (actions on their own line),
W1 (`apiGet`/`apiPost` only), W2.
