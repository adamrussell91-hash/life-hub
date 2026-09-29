# Agent runtime + automation audit (27 Sep 2026)

Question: after the page rebuilds, can every agent still (1) read Central Node for context, (2) write the relevant stuff back, (3) use web search — and what should the daily / weekly / hook-driven auto runs be?

Evidence: code on `main` @ `da7c7c8`, `npm test` (4,546 pass / 0 fail), and the commit history + governance log of the private `life-hub-data` repo (read only, no personal data copied here — this repo is public).

---

## 1. Verdict per agent

| Agent | Runs through | Reads CN | Writes CN | Web search | Status |
|---|---|---|---|---|---|
| Brisket | `/api/chat` | Constraints, About Me, Status, Week, Cross-Agent, Actions | `log_entry` → Status + Actions + `cross_agent_note`; challenge tracker lines | Yes (stripped only on log-finalize turns) | **Working** — the most frequent CN writer |
| Chadwick | `/api/chat` | + This Week | `log_entry` (completed/skipped only) + pain flags → `Chadwick→Sara` | Yes (never stripped) | **Working** |
| Sara | `/api/chat` | standard | `log_entry` medical/body → Status; calendar ghost `Sara→Chadwick` | Yes | **Writes work, but Constraints never gets updated** (see §2.1) |
| Penelope | `/api/chat` | standard | diary → Status Mood/Energy + `cross_agent_note` | Yes | **Working** |
| Vera | `/api/chat` | standard + governance log | mind_session → Status Mind + `Vera→Hammond` | Yes (stripped on flush) | **Working** |
| Hyaluronica | `/api/chat` | standard | skincare → Status flags | Yes | **Code works; no skincare log in ~38 days**, so it hasn't written anything |
| Hammond (in app) | `/api/chat` | Full CN + governance + pending patch queue | `propose_central_node_patch` (auto/confirm), `append_governance_log` | Yes | **Working**, but Weekly Review has run once (6 Sep) |
| Hammond (daily sweep) | Cursor Automation on `life-hub-data` (`config/hammond-daily-sweep.md`) | Full | Status / Week / Month / Actions / Cross-Agent + governance entry | n/a | **Working, but had a 9-day outage (11–19 Sep) nobody noticed** |
| Clare | Tasks hub → `/api/chat` (slug `clare`) | standard + Tasks/Teaching hub context | `publish.cn-patch` (confirm) | Yes + `fetch_url` / `research_topic` | **Working**; has never written CN in the visible history |
| Ann (umbrella chat) | `/api/chat` (slug `ann`) | standard + hub context | `publish.cn-patch` (confirm) | Yes | **Working** |
| Ann / Clementine / Hammond / Clare **inside the Teaching lesson editor** | `/api/ai/jobs` | — | — | — | **Broken: no job runner.** Jobs sit `working`, then expire ("Timed out waiting for a runner"). Already noted in consolidation checkpoint-10; still open. |
| Clementine (Knowledge hub) | `/api/knowledge/clementine-chat` | **No** — never loads Central Node | **No** | Only `fromBook` / `makeNote` hats | **Isolated from Central Node**; not in the CN Agent Directory either |

## 2. What is broken or silently not working

### 2.1 Constraints goes stale, and every agent treats Constraints as the source of truth (highest impact)
Constraints edits are confirm-class, which is correct. But nothing turns the sweep's "Needs Adam" into a Confirm card. The daily sweep has written the same Constraints-update candidate (new lab result, a completed specialist follow-up still listed as TBC, current weight) into the governance log for **7 days in a row**, and `data/hammond/pending-cn-patches.json` is empty. A future-dated appointment file exists in `data/body/`, but Upcoming Appointments doesn't list it. Every specialist is currently coaching from outdated clinical constraints.

**Fix:** have the sweep (or a Sara hook, §4) write confirm-class candidates into `pending-cn-patches.json`. Hammond's prompt and `/api/chat-confirm` already surface and apply that queue, so Adam gets one tap instead of a governance paragraph.

**Status: fixed (app side).** It turned out the queue was only visible inside a live Hammond chat turn. Now:
- `data/hammond/pending-cn-patches.json` syncs to the Life app.
- Every queued patch shows as a Confirm / Discard card in **Central Node → Needs you**. Each card shows who proposed it, the evidence, and a preview of the new section text.
- Cards confirm by id through the existing `/api/chat/confirm`.
- A queued whole-section rewrite carries `base_section_text`. Confirm refuses it with `patch_stale` if that section changed after it was proposed, so an old rewrite can't silently undo a newer edit.

The daily sweep's instructions live in `life-hub-data/config/hammond-daily-sweep.md` and need a matching change so it writes to this queue.

### 2.2 `coordinate_request_cn_write` is a dead end, and it tells the agent it succeeded
Every agent has this tool. For auto-risk patches it only appends a "loan" to `data/os/cn-loans.json` and returns `CN loan applied`. Nothing reads that file and `central-node.md` is never touched (`netlify/functions/_shared/capabilities/shortcuts.mjs` `handleCoordinateRequestCnWrite`). The file doesn't exist in `life-hub-data`, so it has never been used. If an agent does use it, it will tell Adam it wrote to Central Node when it did not.
**Fix:** apply auto-risk loans with `applyCentralNodePatch` in the same call, or send them through the pending-patch queue. Otherwise remove the capability.

**Status: fixed.**
- The tool now takes `summary` / `text` / `field` / `match`, the same shape as Hammond's patches.
- A signed line (Cross-Agent `Name→…`, Recent Actions `Name…`), a Today's Status field, or a This Week line is written to `central-node.md` straight away.
- Constraints (every op) and every other Confirm-class change go to the pending queue, show a Confirm card in chat and on the Central Node page, and the tool returns `awaiting_confirm`.
- Repeat proposals are de-duplicated.
- The `cn-loans.json` ledger is no longer written.

### 2.3 Teaching lesson-editor AI jobs have no runner
`apps/teaching/src/teacher/ai-panel.ts` → `POST /api/ai/jobs` creates `status: working, phase: queued` and nothing processes it. `ai-jobs-tick` just expires it after 10 min. `runTeachingAnnTurn` (`_shared/teaching-ann-turn.mjs`) exists but is only called from tests. `apps/teaching/src/ai/client.ts` still points at a non-existent `/api/ai/chat` (dead code).

### 2.4 Clare's "scheduled Haiku intuitive pass" no longer exists
`apps/tasks/config/clare-protocol.md` says a scheduled Haiku pass flags the week. `apps/tasks/src/{ai/intuitive-judge,domain/intuitive-scan,domain/intuitive-digest}.ts` are imported by tests only, and there is no cron on the umbrella. The protocol promises something that never runs.

### 2.5 Clementine is cut off from Central Node
Knowledge-hub Clementine never sees About Me, Constraints, or Cross-Agent. It also has no way to leave a `Clementine→X` line. It is missing from the CN Agent Directory.

### 2.6 Daily sweep reliability risks
- **No heartbeat.** Nothing flags a missed run. Sweeps stopped from 11 to 19 Sep and nothing noticed.
- **Daylight saving.** Sweeps commit at ~13:05–13:20 UTC, which is ~23:10 Sydney today. AEDT starts **Sun 4 Oct 2026**. If the Cursor cron is in UTC, the sweep moves to ~00:10. From then on "today" means the new, empty day: it will write `No meals logged` and never close out the day just ended. At 23:10 it can also miss late-evening logs (22:00 snacks exist).
- **Cross-Agent condense is weak.** Lines from early September and a 2-month-old `Hammond→Ann` handoff are still live. Ann has no scheduled way to answer it.
- **Challenge tallies drift.** A nutrition challenge closed as "met" while its tracker shows 7 unmarked days. Nothing marks or chases each day.

### 2.7 Existing Netlify crons (all present, tests green)
| Function | Cron (UTC) | Effective Sydney | Notes |
|---|---|---|---|
| `calendar-ghosts-propose-scheduled` | `30 18,19 * * *` | 05:30 (DST-safe gate) | Visible daily in `life-hub-data` |
| `people-remember-tick-scheduled` | `5 * * * *` | 07:00 + 16:00 gate | DST-safe |
| `promise-nudges-scheduled` | `0 21 * * *` | 07:00 → **08:00 from 4 Oct** | Not DST-gated |
| `ties-infer-tick-scheduled` | `20 3 * * *` | 13:20 / 14:20 | fine |
| `career-scan-tick-scheduled` | `10 * * * *` | Sun 17–19:00 gate | Retries 18/19 if the week has not succeeded yet |
| `ai-jobs-tick-scheduled` | `17 14 * * *` | 00:17 / 01:17 | Knowledge midnight tidy (20 pages) + job expiry |

Nothing schedules: Knowledge URL watches (last checked 20 Sep, on request only), Hammond Weekly Review / Goal Audit, Sara weekly scan, Clare intuitive pass, the Ann teaching forecast.

---

## 3. Platform constraint for any new auto run
Netlify scheduled functions stop after **30 s**. An agent turn with web search and tools needs a **background function** (`*-background`, 15 min), like `chat-run`. Pattern already in the repo: an hourly scheduled tick with a Sydney wall-clock gate and a `last_run` stamp (as in `remember-service.mjs`), which then invokes a background runner. `chat.mjs` already supports headless triggers (`startAuditSessionFromMessage`, server-side phase advance).

## 4. Recommended auto-run schedule (Sydney time)

Principle from About Me: the season is comfortable, slow growth, and the hub fails if it becomes too much. So the runs **prepare and queue**. They never nag, and confirm-class writes stay one tap.

### Daily
| When | Agent | Job | Output |
|---|---|---|---|
| **04:30** | Hammond | **Move the sweep here** (DST-safe gate). Close out *yesterday* with final totals, then open today's Status. Condense Cross-Agent. Queue confirm-class items into `pending-cn-patches.json` | CN auto sections + governance entry + Confirm cards |
| 05:30 | (existing) | Calendar ghosts | unchanged |
| 06:45 | Clare | Pre-build the Morning Sweep so the desk opens instantly (read-only, no writes) | cached briefing |
| 07:00 / 16:00 | (existing) | People Remember | unchanged |
| 07:00 | (existing) | Promise nudges; gate on Sydney hour so DST doesn't move it | unchanged |
| 21:30 | Brisket | **Only if a challenge is active:** mark today from the logs; if nothing is logged, put one flag in Status | challenge tracker + Status flag |
| 00:17 | Clementine | (existing) midnight tidy + job expiry | unchanged |
| hourly | system | **Heartbeat:** if the CN sweep hasn't committed in 36 h, add a Status flag `Sweep missed` | Status flag |

### Weekly
| When | Agent | Job |
|---|---|---|
| Sun 17:00 | (existing) | Career skills scan. Retry on the 18:00 and 19:00 ticks if it failed |
| **Sun 18:00** | Hammond | **Weekly Review prep:** build the week pack, draft the recap and the forward lock, queue the Cross-Agent condense. Adam opens it Sunday night (it has only happened once) |
| Sun 18:00 | Ann | Teaching forecast for the next 7–14 days (lessons, marking load) → `Ann→Hammond` line. Answers the open handoff |
| Sun 18:00 | Ann | Teaching forecast → `Ann→Hammond:` load line (`ann-teaching-forecast-scheduled`) |
| Sun 19:00 | Clare | Weekly judgment (Haiku) → `Clare→Hammond:` (+ optional Status Confirm); retry 20:00 if model failed; not Network flags |
| **Mon 06:30** | Sara | **Weekly health scan:** medical/body logs vs Constraints → Constraints patch into the Confirm queue; appointments from future-dated `data/body` files → Upcoming Appointments |
| Mon 06:30 | Chadwick | Research freshness: list the areas past the 14-day `RESEARCH DUE` rule so the next session plan is fast (no web search unattended) |
| Wed 20:00 | Hyaluronica | Nutrition→skin weekly check. If there's been no skincare log for 14+ days, one gentle Status flag, not a lecture |
| Sat 10:00 | Clementine | Knowledge URL-watch check (the code exists, it just isn't scheduled) |

### Monthly
| When | Agent | Job |
|---|---|---|
| 1st, 06:00 | Hammond | Goal Audit prep + monthly three-way brief (with Vera/Penelope Mind Insights). Long-Term Trends candidates (≥3 dated data points) go into the Confirm queue |
| 1st | Sara | Medical Overview vs Constraints consistency check |

### Event hooks (on write, no cron)
| Trigger | Agent | Action |
|---|---|---|
| Medical/body log whose labs, weight, or appointment differ from Constraints | Sara | Queue a Constraints patch immediately (Confirm card) |
| Future-dated appointment file created | Sara / Clare | Add to Upcoming Appointments (confirm) + Appointment Prep the day before |
| Workout `pain_flags` | Chadwick | `Chadwick→Sara` (exists) |
| Diary `cross_agent_note` | Penelope | exists |
| Calendar ghost accepted | any | exists |
| Challenge opened | Brisket | turns on the 21:30 daily mark job |
| Term start / end (Almanac) | Ann + Clare | Term setup brief, and teaching load → Hammond |

---

## 5. Suggested build order
1. Fix §2.2 (the agent claims a write that never happens), and make the sweep queue confirm-class Constraints candidates (§2.1).
2. Before 4 Oct: move the sweep to a DST-safe 04:30 gate, and add the heartbeat (§2.6).
3. Teaching job runner (§2.3). Wire it to `runTeachingAnnTurn` through a background function.
4. Sun 18:00 Hammond Weekly Review prep + Mon 06:30 Sara scan.
5. Clementine CN read (About Me + Constraints + her Cross-Agent lines) + a directory entry.
6. The rest of §4 in whatever order Adam wants.

---

## 6. Status (27 Sep, end of day)

**Done**
- §2.1 and §2.2: fixed in this PR (Confirm cards on the Central Node page; `coordinate_request_cn_write` really writes).
- §4 daily / weekly / monthly runs: written as Cursor Automation instruction files in `life-hub-data/config/` (adamrussell91-hash/life-hub-data#25):
  - the daily sweep, moved to 04:30 Sydney, closing out yesterday and marking challenge days;
  - Hammond's Sunday Weekly Review prep;
  - Sara's Monday health scan;
  - Chadwick's Monday research refresh;
  - Hammond's monthly Goal Audit prep.

  The setup table is in `config/automations/README.md`.

**Next up: app-side list (these need code because the data is in Netlify Blobs)**
1. **Teaching lesson-panel AI runner** (§2.3). Run queued `/api/ai/jobs` lesson jobs in a background function through `runTeachingAnnTurn`. Delete the dead `/api/ai/chat` client in `apps/teaching/src/ai/client.ts`.
2. **Clare weekly judgment (Tier 1).** **Built:** `clare-weekly-judgment-scheduled.mjs` (~19:00 Sydney Haiku, ~20:00 retry on model failure; failure persisted in judgment state) → `Clare→Hammond:` Cross-Agent (+ optional Status Confirm). Uses shared `completeMessage` from `anthropic-client.mjs`. Not a Network/flags restore; old intuitive-scan path stays deleted.
3. **Ann Sunday teaching forecast.** **Built:** `ann-teaching-forecast-scheduled.mjs` (~18:00 Sydney) → deterministic `Ann→Hammond:` teaching-load line from Teaching lessons + open Tasks `marking` shadows (not title guesswork).
4. **Clementine reads Central Node** (§2.5). Load About Me, Constraints and her Cross-Agent lines in `knowledge-clementine-chat`, let her post `Clementine→` lines, and add her to the CN Agent Directory.
5. **Knowledge URL-watch check.** Weekly scheduled run of the existing `url-watch.mjs` checker. It was last run by hand on 20 Sep.
6. **In-app sweep heartbeat.** The Central Node page and Home show "Daily sweep missed" when the newest `Daily Sweep` governance entry is more than a day old. The automations check this weekly; the app would catch it the same morning.
7. **Small cron fixes.** Gate `promise-nudges-scheduled` on the Sydney hour so it stays at 07:00 after daylight saving. **Career scan** retries Sunday 18:00–19:00 when 17:00 failed (`shouldRunCareerScanNow`).

**Clare / Tasks (Netlify scheduled functions; Tasks data is in Blobs)**

8. **Morning Sweep ready at 06:45.** Precompute Clare's Morning Sweep and store it, so the Tasks desk opens instantly. Read-only.
9. **Deadline runway (daily).** A task due within 48 hours with no work block gets a proposed calendar ghost through the existing ghost queue. Adam accepts or dismisses it.
10. **Waiting-on follow-ups (daily).** An item waiting on someone for more than N days gets a follow-up draft on the calendar, the same pattern as `promise-nudges`. Never sent automatically.

**Professional / People (app-side; people edits, links, ledger and Remember live in Blobs. `data/professional/*.json` is only the original Notion import, so Cursor must not edit it)**

Already running: tie inference 13:20 daily, Remember 07:00 and 16:00, promise nudges 07:00, career skills scan Sun 17:00.

11. **Nightly link inference.** `runLinkInferencePass` (person ↔ task / meeting / comms link proposals) only runs when the People page asks for it. Schedule it nightly, only for people with new material since the last run. The output is proposals in "Links to confirm" and nothing auto-links. Clare's "people sweep" in `persona.mjs` is prompt text only and gets replaced by this.
12. **Weekly profile refresh (people research).** For the ~10 most active contacts whose profile has not been checked in 90 days, search public professional information (current role, organisation, recent publications or appointments) and propose profile updates as confirm cards with sources. Guardrails:
    - never students (reuse the Communications-students exclusion);
    - never the people About Me says are invisible;
    - public professional information only, no personal life;
    - nothing auto-applied.
13. **Search** needs no automation. It stays on demand in the People / relational search pages.

**Event triggers (write-hooks in app code, not crons)**

14. **Task created or edited that names a person:** run link inference for that person only, which gives a proposal.
15. **Meeting or communication logged:** run the Remember pass for its attendees and extract promises into the ledger.
16. **Medical log that conflicts with Constraints:** queue `cnp_auto_constraints` immediately rather than waiting for Monday's Sara scan.
17. **Task done that belongs to a Hammond goal:** add a goal check-in entry.
18. **Term start or end (Almanac):** Ann and Clare term-setup brief and a teaching-load line to Hammond.

Dropped: Hyaluronica's weekly skin check (Adam, 27 Sep).

**Done 28 Sep: people tools in chat for Clare, Hammond and Ann**
- `search_people`: read-only search of People and Organisations, covering app records and the Notion import.
- `propose_people_changes`: add people, edit name / sort name / aliases, and link person↔person (`professional_relationship` + role) or person→organisation (`employee_at`, `member_of`, `studied_at`, `placement_at`). It is one Confirm card, and Adam can untick single lines. At Confirm, writes run through `identity-repository` and the Universal Link repository (`people:` write target in `propose-action.mjs`).
- **Imported people can now be edited.** People from the Notion import lived only in GitHub, so `/api/entities` edits returned "not found". That also affected the People page's Edit button. An edit now adopts the person into the app under the same id. Their imported relationships still load in the People collection, and search no longer shows them twice.
- Clare's prompt no longer claims she runs link inference or writes the ledger.
- Still not possible from chat: delete, merge or archive people, or edit profile notes, communications or Remember facts.
