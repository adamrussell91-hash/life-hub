# Challenge sprints — any-agent, any-domain, time-boxed focus (build scope)

**Replaces:** `belly-flab-blitz-dashboard-build.md` (Cursor's first cut). The Belly Flab Blitz is now the **first acceptance case**, not the product.
**Ask (Adam, 30/09/26):** "Hi Hammond — school holidays, starting a Belly Flab Blitz: eating, measurements, exercise, mind, diary… let's make a plan." Future sprints will cover any area of life (e.g. "get my doctoral application written"). **No agent may be unable to take part.**

**Size overall: Medium–Large.** Most of it reuses existing parts: `track_*` challenges, Confirm, `propose_goal`, CN relay, `day-sense-notify` and the protocol catalog. The new work is lanes, agent awareness, cadence and the Home card. It is **not** a site redesign and **not** a "temporary website mode".

---

## 0. What changed from the first cut, and why

| First cut said | Now | Why |
|---|---|---|
| 4 fixed lanes: Brisket / Sara / Chadwick / Penelope; "arbitrary specialist count" not in v1 | **1–8 lanes, any agent in the roster** (Hammond, Clare, Brisket, Chadwick, Sara, Hyaluronica, Penelope, Vera, Ann, Clementine) | A doctoral sprint needs Clementine + Clare + Vera, not Brisket. Four hardwired names makes it belly-flab-shaped. |
| Phase A = Home card | **Phase A = agents can see and act on the sprint** | The card is a view. Today **no agent's context reads `data/challenges/**`** (only Brisket's separate nutrition challenges reach a prompt, via `chat.mjs`), so an opened challenge is invisible to every specialist unless Hammond hand-relays it. Without this, lanes are decoration. |
| Separate widget instance (`data/widgets/…`, `challenge-lanes` template) + challenge JSON | **One source: the challenge JSON.** The Home card reads computed sprint state directly. | Avoids the dual-write/stale-% problem of `challenge-progress.progress_pct`. |
| No cadence | **Cadence is a field.** A short sprint defaults to **daily check + weekly review + final review.** | A 12-day sprint with one check-in isn't a sprint. |
| No expiry mechanism | End date → "ended, awaiting final review" state + nudge; verdict still Confirm | Nothing closes or flags a challenge today. |
| — | **Headline metric chosen by Adam** (e.g. midsection tape) and respected | Motivation matters; see §5. |
| — | **Hammond knows the thinking protocols and suggests one at the right moments** | §6. |

---

## Phase 0 — today, before any build (Adam can start now)

Nothing in this section needs code. Hammond already has these tools. Put this in Hammond's reply behaviour **now**, via `config/hammond-protocol.md` §"Challenge sprints" (Phase D text below, trimmed).

1. Hammond plans the sprint in chat: focus, headline metric, one lead measure per specialist, cadence.
2. `track_open_challenge` (Confirm): title, goal, metric = headline metric, `start_date`, `end_date`. Put the lane plan in `notes`.
3. `propose_goal` (Confirm) with `lead_measure` if Adam wants it on Goals.
4. **One `Hammond→<Agent>:` Cross-Agent line per lane** via `propose_central_node_patch`, plus one This Week line. This is currently the *only* way specialists learn a sprint exists. It's mandatory in Phase 0, and it's the thing Phase A removes the need for.
5. Daily: Adam opens Hammond and says "blitz check-in". Hammond logs it with `track_log_progress`.

When Phase A ships, the new open tool must accept an existing `challenge_id` and **upgrade** it to a sprint (add lanes, cadence, headline). A Phase-0 blitz must not have to be re-opened.

---

## 1. Data model — extend `data/challenges/<date>-<slug>.json`

Backwards compatible: a challenge with no `lanes` is a plain challenge and behaves exactly as today.

```text
{
  id, title, goal, start_date, end_date, status, owner_agent, progress[], notes,   # existing
  kind: "sprint",                                   # NEW; absent = plain challenge
  lead_agent: "hammond",                            # NEW; any roster slug. Hammond always oversees.
  headline: {                                       # NEW; Adam's chosen motivating metric
    label: "Midsection",
    metric: { label: "Waist", unit: "cm", direction: "down",
              source: "body.measurements.waist", baseline?: 0, target?: 0 },
    secondary?: [{ label: "Hips", unit: "cm", direction: "down", source: "body.measurements.hips" }]   # blitz: always set
  },
  cadence: {                                        # NEW; defaults by length, see §3
    daily_check: true, daily_nudge_time: "19:30",
    weekly_review_day: "sun", midpoint_review: false, final_review: true
  },
  lanes: [                                          # NEW; 1–8 lanes
    { agent: "brisket", role: "Eating",
      lead_measures: [
        { id: "protein", label: "Protein ≥ target", per: "day", target: 1,
          evidence: { source: "nutrition.protein_target_met" } },
        { id: "logged", label: "All meals logged", per: "day", target: 1,
          evidence: { source: "nutrition.meals_logged", min: 3 } }
      ],
      goal_ids: [], task_ids: [], status: "active", note: "" }
  ],
  checkins: [                                       # NEW; daily / weekly / final
    { date, kind: "daily"|"weekly"|"final", by: "hammond",
      lanes: { "<slug>": { status: "on_track"|"stalled"|"no_evidence", note } },
      adam: { rating?: 1-5, win?, snag?, note? },
      protocol_session_id?: "…" }
  ],
  protocol_suggestions: [ { date, protocol_id, mode, why, accepted?: bool } ]   # NEW
}
```

Rules:

- **Lane `agent` is validated against the live roster** (`CN_AGENT_NAMES` in `shortcuts.mjs`, or the registry's agent list). An unknown slug is a hard deny. A roster agent with **no chat entrypoint that gets sprint context** (see §2) is also a deny, with the reason shown. It's never silently accepted.
- `lead_measures[].evidence.source` must be a registered **evidence adapter** (§4) or `"self_report"`. There's no freeform source string.
- There's no stored `progress_pct`. Progress is **computed at read time** (§4).
- Max 3 open sprints at once (context budget). Opening a 4th is a deny with the reason shown.

**Must-not:** freeform HTML, agent-authored CSS, arbitrary prop shapes, per-sprint templates.

---

## 2. Agent awareness (Phase A — build this first)

### 2.1 Context block on every agent entrypoint

Add `formatOpenSprintsForPrompt(sprints, { slug, today, evidence })` (pure, tested). Inject it wherever an agent can be spoken to:

| Entrypoint | Agents | Today | Required |
|---|---|---|---|
| `/api/chat` (`netlify/functions/chat.mjs`) | all slugs | no challenge context | inject for every slug |
| `/api/knowledge/clementine-chat` | Clementine (Knowledge hub) | **isolated: never loads Central Node** (`docs/AGENT_AUTOMATION_AUDIT.md` §1) | inject the sprint block **and** give her `track_log_progress` + `track_checkin_lane`. Or route sprint turns through `/api/chat`. Cursor chooses one; Verify proves it. |
| Tasks-hub Clare chat, umbrella Ann chat | Clare, Ann | via `/api/chat` | covered by row 1; verify |
| Teaching lesson-editor `/api/ai/jobs` | Ann/Clementine/Hammond/Clare | **no job runner** (audit §2.3) | out of scope. List it in the PR as a known gap. Don't claim coverage. |

Before building, Cursor **greps for every chat entrypoint** (`runChatTurn`, `buildSystemPrompt`, `*-chat.mjs`) and adds any missing one to this table in the PR description.

Block content, capped at ~700 chars per sprint:

```text
OPEN SPRINT — Belly Flab Blitz · day 4 of 12 (ends 12/10/26) · lead: Hammond
Headline: Waist 89.0 → 88.0 cm (3 readings) · Hips 94.0 → 93.5 cm   (illustrative; baseline = real tape on day 1)
YOUR LANE (Brisket · Eating): protein ≥ target — met 3/3 days · meals logged — 2/3 yesterday
Other lanes: Chadwick on track · Sara no evidence today · Penelope on track
Today's check-in: not yet done
You may: log progress on your lane (track_log_progress / track_checkin_lane). Lane changes → Hammond (Confirm).
```

- Specialists see **their lane in full** and one line for each other lane. Hammond and the lead agent see all lanes in full.
- An agent with no lane in an open sprint sees only the one-line summary. That way Vera knows the blitz exists even if she has no lane.
- When evidence is `unavailable`, the block says **"unavailable"**. It never says "missed".

### 2.2 Tools

| Tool | Who | Risk | Notes |
|---|---|---|---|
| `track_open_sprint` | Hammond, Clare, **or the lead agent** | Confirm | Creates the sprint **or upgrades an existing `challenge_id`** (Phase 0). The Confirm card lists lanes, lead measures, headline, cadence and dates in plain language. |
| `track_checkin_lane` | the agent that owns the lane | auto | Appends a lane status/note for today. **Own lane only:** writing to another agent's lane is a deny. |
| `track_log_progress` | any | auto (existing) | Unchanged. |
| `track_link_lane` | lane owner, Hammond, Clare | auto | Adds a `goal_id` or `task_id` to a lane. It's additive and reversible. |
| `track_revise_sprint` | Hammond / lead | Confirm | Changes lanes, lead measures, cadence, dates or headline. |
| `track_close_challenge` | Hammond / lead | Confirm (existing) | For sprints, Phase B adds the final-review summary + headline start→end. |

Register them in `capabilities/registry.json` + `capabilities/track/*.json`. They're **visible to every agent**, with the lane-ownership check server-side (not prompt-side).

### 2.3 Roster capability card (so Hammond assigns sensible lanes)

Add `sprintRosterForPrompt()` to Hammond's (and the lead's) prompt **only while designing or revising a sprint**. It gives one line per agent: what it can log, and which evidence sources it owns. It's generated from the adapter registry (§4), not hand-written. Hammond must not assign a lead measure whose evidence source the lane agent can't produce. Where no source exists, he uses `self_report`.

---

## 3. Cadence (Phase B)

### 3.1 Defaults by length (all overridable at open or revise)

| Length | Daily check | Weekly review | Midpoint | Final review |
|---|---|---|---|---|
| ≤ 21 days | **on** | on (weekly day) | on if the length is < 10 days | on |
| 22–90 days | off (Adam can switch it on) | on | — | on |
| > 90 days | off | fortnightly | — | on |

### 3.2 Daily check (cheap: no scheduled AI)

1. **Evidence tick:** deterministic, computed at read time by the same function the card and prompts use (§4).
2. **One phone nudge a day** at `daily_nudge_time` (Sydney), through the existing `day-sense-notify` path. Example: *"Blitz day 4/12 · 3 of 4 lanes have evidence · 60-second check-in"*. It deep-links to Hammond chat with the check-in pill pre-selected.
   - It counts toward day-sense's existing 4/day cap, and the sprint nudge has priority over nice-to-haves.
   - It's skipped if today's check-in already exists.
   - No AI call.
3. **"Sprint check-in" protocol pill** on Hammond (and on the lead agent if that isn't Hammond). It shows **only while a sprint with `daily_check` is open** (`apps/life/js/app/agent-protocols.js`). Steer:
   - ≤ 4 exchanges.
   - Hammond reads the evidence and asks at most 3 short questions: a 1–5 rating, one win, one snag.
   - He writes one `checkins[]` entry (`kind: daily`) via `track_checkin_lane` / a Hammond `track_log_checkin`.
   - He relays **at most one** `Hammond→<Agent>:` line, and only if something changed.
   - **No governance-log entry per day.** Daily noise belongs on the sprint, not in governance.
   - If a lane has shown `stalled` or `no_evidence` 2 days running, Hammond names it. He may suggest a protocol (§6).
4. **Specialist-side daily:** when Adam logs with a specialist during a sprint, that specialist sees their lane (§2.1). If the log satisfies a lead measure, they confirm it in one line ("That's protein met for the blitz — day 4"). That's all: no lecture, no second check-in.

**Must-not:** no daily Sonnet/Opus "PA" cron and no scheduled agent turns. AI runs only when Adam opens a chat (CLAUDE.md, Clare PA audit rule).

### 3.3 Weekly / midpoint review

The nudge fires on the weekly day (or at the midpoint). Hammond's "Weekly Review" pill gains a **sprint section** while a sprint is open:
- a lane-by-lane recap from `checkins[]` + evidence
- headline trend
- a proposed revision via `track_revise_sprint`, only if needed
- one relay line per lane, or a recorded "nothing to relay"
- **a Governance Log entry** (`entry_type: Weekly Review`) with a sprint subsection
- at most one protocol suggestion (§6).

For a 12-day sprint starting Thu 1 Oct, that's the review on Sun 4 Oct (short) and Sun 11 Oct. If the weekly day falls on day ≤ 2, the first one merges into day 1.

### 3.4 End of sprint

- On `end_date + 1`, the sprint state becomes **`ended_awaiting_review`**. It's computed, not written. The card shows "Ended — final review", and a single nudge goes out.
- **Final review (Hammond pill):**
  - headline start → end, with honest noise notes
  - lead-measure hit-rate per lane
  - what worked and what didn't
  - **"keep" proposals:** which lead measures become ongoing goals or habits (`propose_goal` / CN This Week), and which are dropped
  - verdict via `track_close_challenge` (Confirm)
  - a Governance Log entry.
- If there's no final review within 7 days, the card drops off Home. The sprint stays `ended_awaiting_review` in Hammond's context until it's closed. Nothing is auto-closed without Confirm.

---

## 4. Evidence adapters and computed state

`netlify/functions/_shared/sprint-evidence.mjs` holds a registry of adapters. Each one is `(records, date, params) → { status: "met" | "missed" | "no_evidence" | "unavailable", value?, detail }`.

| Source id | Owner agent | Reads | Notes |
|---|---|---|---|
| `nutrition.meals_logged` | Brisket | meal logs | `params.min` |
| `nutrition.protein_target_met` | Brisket | day totals vs targets config | |
| `nutrition.kcal_within_target` | Brisket | day totals | |
| `fitness.workout_completed` | Chadwick | workout logs (completed only) | |
| `fitness.steps` | Chadwick | if a steps source exists; else **don't register** | no stub adapters (P4) |
| `body.measurements.waist` / `.hips` | Sara | `type: measurements` records (`forecast-inputs.js` `dedupeTapeMeasurements`) | Both fields already exist on the same record and on the Body → Tape card (`render-body.js` `LABEL_ANCHORS`: `waist`, `hips`). Reuse that record and those deltas; don't add a new field. |
| `body.weight` | Sara | weight records | |
| `mind.diary_entry` | Penelope | diary records for the date | |
| `mind.session` | Vera | mind_session records | |
| `tasks.completed_linked` | Clare | tasks in `lane.task_ids` completed that day | **Check the Done-column retention** (`docs/CLARE-TASKS-PA-ASSUMPTIONS.md`). If completed tasks aren't retained, return `unavailable`, never `missed`. |
| `knowledge.pages_touched` | Clementine | Knowledge page edits on date | for writing sprints; register only if edit timestamps exist |
| `self_report` | any | today's `checkins[]` | always available |

- `computeSprintState(sprint, records, today)` → per-lane status, headline series, day N of M, check-in done?, ended?. **One function** feeds the prompt block, the Home card, the nudge and the reviews, so they can't disagree (V4).
- Lane status rules: `on_track` = lead measures met on ≥ 70% of days so far with evidence. `stalled` = < 70%, or 2 consecutive misses. `no_evidence` = nothing for 2 days. `unavailable` = the adapter failed. Never infer "missed" from "unavailable" (D6).

---

## 5. Headline metric and motivation (Belly Flab Blitz specifics)

Adam knows fat isn't lost from one spot. **The midsection focus is a deliberate motivational frame, and agents respect it:**

- The headline is the waist + hips tape trend (both already on the Tape card), shown first on the Home card and in every prompt block. The sprint delta is **since the sprint baseline**, not the Tape card's all-time "Overall".
- Agents use Adam's frame. Hammond may say **once**, in the opening plan, that the plan drives overall fat loss and the tape is the scoreboard. After that, **no agent repeats the "spot reduction" caveat.** Add this to Hammond's and Sara's protocol text.
- **Measurement protocol (Sara's lane):**
  - Waist at the navel and hips at the widest point.
  - Taken on waking, after the toilet, before food, same tape, relaxed (not sucked in).
  - A baseline on day 1, then every 3–4 days (days 1, 4, 8, 12), plus the final reading.
  - Daily readings are allowed, but the card plots the trend. Sara names the obvious noise: salt, alcohol, a late meal, bloating.
- Chadwick's lane may include core/midsection work *because Adam wants it*. It's framed as strength and posture on top of the whole-body plan, not as fat burning.

For a different sprint, `headline` is whatever Adam picks, e.g. "words drafted" for a doctoral application.

---

## 6. Thinking protocols (Phase D — small, but it matters)

The Knowledge hub's **Thinking** protocols (`config/knowledge/cognitive/definitions.mjs` `catalog`) are Fates, Horizon Council, Refinery, Cartographers, Mirror Council, Consilium, Witness and Tribunal of Frames. Today `config/hammond-protocol.md` doesn't mention them.

1. **Hammond's protocol text** gets a "Thinking protocols" section. It includes the one-line purpose of each protocol (generated from `catalog`, not retyped) and **when to suggest one**:

| Moment | Suggest | Mode |
|---|---|---|
| Designing a sprint whose end state is fuzzy | Horizon Council | brief |
| "I always fall off after day 3" / an entrenched pattern | Tribunal of Frames | quick |
| Stall ≥ 2 days, or a conflict between behaviour, aspiration and capacity (e.g. still getting over a cold) | Mirror Council | quick |
| Final review: "what actually worked?" | Witness | standard |
| What next after the sprint | Fates | sprint |
| Writing/argument sprints (doctoral application) | Refinery / Cartographers | build-break / focused |
| An ethical dimension only | Consilium | standard |

2. **Suggest, don't run.** At most **one** suggestion per check-in or review, with one line on why. The suggestion is recorded in `protocol_suggestions[]`, and Adam decides. Protocols are never suggested on a routine daily check unless the stall rule has fired.
3. **Deep link.** It doesn't exist today: the Knowledge `protocols` view has no route that opens a given protocol with its intake pre-filled. Add `…/knowledge/#protocols?id=mirror&mode=quick&<field>=<text>`. It opens that protocol with intake fields filled, and Adam can still edit them before starting. Hammond's suggestion includes this link, built from sprint context (e.g. Mirror `conflict` = "Blitz lane Chadwick stalled 2 days while recovering from a cold").
4. When the protocol session ends, its session id is attached to the next sprint check-in (`protocol_session_id`). The existing cognitive write-back to CN stays as is.
5. Other lead agents (e.g. Clementine leading a doctoral sprint) get the same table. Vera keeps her own pills; this doesn't override them.

---

## 7. Home card (Phase C) — design kit only

- **Mount:** Life Home (`#home-dashboard`), a new host `#home-sprints`. It's **hidden when there's no open or ended-awaiting-review sprint.** No empty chrome.
- **Read:** `GET /api/challenges/active` → `computeSprintState` for each open sprint. Use `apiGet` + `getApiBaseUrl()`, never a relative `fetch('/…')`.
- **Card, one per sprint:**
  1. Title · "Day 4 of 12" · ends dd/mm/yy.
  2. **Headline:** the latest value, the change since baseline, and a small trend of **real readings only**. With fewer than 2 readings it says "Baseline 89.0 cm — next reading Sun"; there's no line.
  3. **Lanes (1–8):** agent name · role · a lead-measure summary ("protein 3/3") · status chip (on track / stalled / no evidence / unavailable). Each row links to that agent's chat.
  4. **Today:** "Check-in done ✓", or a **Check in** button (deep link to the Hammond pill).
  5. Ended state: "Ended — final review" button.
- **Not in v1:** editable kanban on Home, charts beyond the headline trend, and freeform markdown.
- Desktop + 390px. No horizontal scroll, 44px targets, and intentional loading/error/ended states.

---

## 8. Phases and size

| Phase | Work | Size |
|---|---|---|
| **0** | Hammond protocol text for Phase-0 behaviour (§Phase 0 + §5 framing). **No code.** Ship first, today. | XS |
| **A** | Model (§1), `computeSprintState` + core adapters (§4: nutrition ×2, fitness workout, body waist + hips, mind diary, self_report), context block on **every** entrypoint including Clementine's (§2.1), tools with server-side lane ownership (§2.2), roster card (§2.3), Phase-0 upgrade path | **Medium** |
| **B** | Cadence (§3): check-in pill, daily nudge via day-sense-notify, weekly/midpoint sprint section, end state + final review | **Small–Medium** |
| **C** | Home card (§7) | **Small** |
| **D** | Thinking-protocol awareness + deep link (§6) | **Small** |
| **E** | Remaining adapters (tasks, knowledge, weight, Vera) as their data proves out | Small, each |

**Ship order for the 12-day holiday:** 0 now → A+B together (one PR, a sprint can actually run) → C → D. Phase D's Hammond text (the suggestion table) can ride in with Phase 0; the deep link comes later.

---

## 9. Must-not

- No freeform HTML, agent-authored CSS or arbitrary dashboard JSON.
- No hardcoded agent names in lane logic or UI (the roster comes from code).
- No silent structural writes: open/revise/close is Confirm; only progress, check-ins and additive links are auto.
- No scheduled AI turns (no daily PA cron).
- No replacing specialist logs. Meals, tape, workouts and diary stay with their owners, and the sprint reads them.
- No "missed" when the truth is "unavailable".
- No stub adapters, disabled buttons or "coming in Phase X" copy in the product (P4).
- Don't overload the Brisket nutrition challenge scoreboard for cross-domain sprints.
- No Google Calendar or external boards.

---

## 10. Verify (the PR is not ready until every line is proven)

1. **Belly Flab Blitz acceptance:**
   - Hammond opens a 12-day sprint with Brisket / Chadwick / Sara / Penelope lanes and a waist headline.
   - Each specialist's `/api/chat` prompt contains their lane (test + one live screenshot).
   - A meal log that meets protein flips Brisket's lane to "met" in the prompt block **and** on the card, from the same function.
2. **Doctoral sprint acceptance (fixture):**
   - A sprint with **Clementine** (writing), **Clare** (tasks) and **Vera** (mind) lanes, and a `self_report` headline "sections drafted".
   - Clementine's Knowledge-hub chat shows her lane and can call `track_checkin_lane`, proven by a test that goes through the real handler (W2).
3. Opening a lane for an unknown slug, or for an agent with no sprint-aware entrypoint, is denied with a readable reason.
4. Agent X calling `track_checkin_lane` on agent Y's lane → deny.
5. Upgrading a Phase-0 `track_open_challenge` challenge to a sprint keeps its `id` and `progress[]`.
6. Cadence defaults: 12-day → daily + weekly + final; 30-day → weekly + final; overrides persist.
7. The nudge fires once in the Sydney window, not again after a check-in, and respects the day-sense cap. There's no AI call in the scheduled path (assert in the test).
8. `end_date + 1` → `ended_awaiting_review` on the card and in Hammond's prompt; not closed without Confirm.
9. An adapter throwing → `unavailable` in the card and prompt, never `missed`.
10. The protocol deep link opens the right protocol and mode with intake pre-filled (browser test).
11. The Home card is hidden with no sprint; there's no horizontal scroll at 390 (`scrollWidth === innerWidth`); Tab + Enter reaches every lane link and the Check in button.
12. `npm run pre-pr-check` exits 0.

---

## 11. UI failure modes to check (from `docs/CURSOR-UI-FAILURES.md`)

- **V4 (parts disagree):** the card, prompt block, nudge text and reviews all come from `computeSprintState`. Check the same fixture yields identical lane statuses in all four.
- **D6 (partial input) / D1 (made-up precision):** `unavailable` ≠ `missed`. The headline shows tape to 0.5 cm as logged, with no invented decimals. No trend line from one reading.
- **D3 (demo data):** acceptance screenshots use the real blitz on the live umbrella.
- **D5 (ugly labels):** "Day 4 of 12", "ends 12/10/26", "protein 3/3". There are no raw ids or ISO dates on the card.
- **V1 (`[hidden]`):** `#home-sprints[hidden]{display:none}`. Check that it's gone with no sprint.
- **L2 (dead space):** lane rows size to content. Check the card with 1 lane and with 8.
- **R2 / R3 (390):** the phone layout for a lane row is given as `name · chip` on line 1 and `measure summary` on line 2. Check at 390.
- **I2 / I3 (fake links, dead buttons):** lane rows are `<a href>` to agent chat, and Check in is a `<button>`. Check with Tab + Enter.
- **C1 / C2 (chart):** the trend draws real readings only, and labels don't clip. Check with 2 and with 12 readings.
- **W1 / W2 (wiring):** `apiGet` only. At least one test goes through the real handler for the Clementine path.
- **P4 / P5:** no roadmap copy in the product. If A+B ship as one PR, the PR is ready only when every A and B line in §10 is ticked.

---

## Evidence anchors (`main` @ 20f03e2)

- Challenge tools: `netlify/functions/_shared/capabilities/shortcuts.mjs` (`handleTrackOpenChallenge`, `handleTrackLogProgress`, `handleTrackCloseChallenge`). Registry `capabilities/registry.json` (`agents: ["*"]`).
- No challenge context in prompts: `chat.mjs` only injects `formatNutritionChallengesForPrompt` (Brisket).
- Widgets: `netlify/functions/_shared/surface-widgets.mjs` (templates `challenge-progress`, `meal-plan-week`); mounts only on Fitness and Nutrition in `apps/life/index.html`.
- Clementine isolation: `netlify/functions/knowledge-clementine-chat.mjs`; `docs/AGENT_AUTOMATION_AUDIT.md` §1.
- Goals: `netlify/functions/_shared/goal-agent.mjs` (`propose_goal`, Hammond + Clare only).
- Phone nudges: `netlify/functions/day-sense-notify-scheduled.mjs` (deterministic, ≤ 4/day).
- Protocol pills: `apps/life/js/app/agent-protocols.js`.
- Thinking protocols: `config/knowledge/cognitive/definitions.mjs`; Knowledge `protocols` view in `apps/knowledge/src/main.ts` (no deep-link route).
- Tape: `type: measurements` records with `waist` and `hips` (and neck, chest, arms, thighs, calves). See `apps/life/js/app/render-body.js` `LABEL_ANCHORS`, and `apps/life/js/core/forecast-inputs.js` `dedupeTapeMeasurements` for same-day de-duplication.
