# Mind Session Memory — Vera, Penelope, Hammond

**Date:** 2026-08-13  
**Status:** Approved (brainstorm)  
**Deploy rule:** Local commits only until Adam asks to push.  
**Supersedes:** `2026-08-05-mind-tab-avatars-design.md` decisions “Vera = reflection only, no `log_entry`” and “Out of v1: Vera session record type.”  
**Implements (with deltas):** the unbuilt `docs/superpowers/plans/2026-08-12-vera-penelope-integration.md`. That plan was written and never started. This spec is the source of truth for what to build; a new implementation plan follows.

---

## Problem

Chat is not a record. The transcript lives in the browser for ~20 minutes (30 messages). Durable memory only happens when an agent proposes a structured log and it is written to GitHub.

Vera is explicitly forbidden from proposing `log_entry`. Cross-agent lines she types in chat never reach Central Node (`applyLogToCentralNode` has no Cross-Agent write). Hammond and Penelope cannot use anything said to her. Tonight she correctly said she keeps no file — the protocol told her not to.

Penelope can write diary files, but she is fed the nutrition digest, not mind data. The Mind tab’s own mood/theme model never reaches either agent’s prompt.

## Goals

- A Vera conversation that reaches a natural close (or an explicit “record this”) leaves a durable `mind_session` file other agents can read.
- Written insights and Cross-Agent notes actually persist (Governance Log + Central Node), instead of dying with the transcript.
- Vera and Penelope get a bounded 30-day Mind digest (diary + sessions), not Chadwick/Brisket’s nutrition window. Hammond gets Mind cadence, a silence flag, and Governance Log insights on every turn; diary-body metadata only when producing a brief or retrospective.
- Mixed diary days can carry 1–3 moods without rewriting old files.
- Penelope’s “on this day” opening uses a short excerpt of last year’s prose, not a mood label.
- Hammond can act on Mind cadence, silence, and insights, including a monthly brief and a quarterly two-voice look-back — both suggested, never silent CN writes.

## Non-goals

- Full chat transcripts / a session archive.
- Leave-flush (auto-log when switching agents, hitting New Chat, or hiding the tab). If Vera never proposes, there is still no file.
- Auto-confirm for diary, meals, workouts, body, or skincare.
- Notion’s 12-property Session Database.
- Auto-writing Long-Term Trends.
- Weather / live calendar restore from the Notion spec.
- Day One behaviour changes.

---

## Decisions (locked)

| Topic | Choice |
|---|---|
| What persists from Vera | Compact session note at close, not the transcript |
| Confirm vs autosave | **Server-side auto-write** for Vera `mind_session` only. Diary / meals / workouts still need Confirm |
| Walk-away without a proposal | No file. No leave-flush in this work |
| Diary logging | Still Penelope only |
| Multi-mood | Keep scalar `mood` as primary. Add optional `moods` array (1–3). No migration of old files |
| On this day | Short excerpt of that year’s diary body (plus highlights/challenges/moods), for Penelope’s opening with Adam. Not a vault dump into Vera/Hammond prompts |
| Phases 5–6 | In this spec, not deferred. Plumbing ships now and no-ops until data exists. 5e/6b are real features with the shapes below |
| Privacy | Vera/Hammond see metadata, `system_note`, named insights, Cross-Agent one-liners. They do not get raw diary/session prose quoted back. Penelope may use a short excerpt of Adam’s own past diary with him |

---

## Architecture

```
Vera turn (natural close or “record this”)
  → log_entry mind_session
  → server validates, writes GitHub file immediately
       ├─ data/mind/<year>/<month>/<date>-<slug>.md
       ├─ Today's Status Mind (theme)
       ├─ Cross-Agent line (if cross_agent_note)
       └─ Governance Log Mind Insight (if insight)
  → client shows a logged summary, not a Confirm card

Penelope turn (enough day story)
  → log_entry diary (mood + optional moods, optional system_note, optional cross_agent_note)
  → Confirm card (unchanged gate)
  → on confirm: file + Mood + Energy + Cross-Agent + Day One as today

Every Vera / Penelope chat turn
  → bounded 30-day mind-digest.mjs (gated; does not widen the shared 2-day digest)
  → Vera: threads, diary metadata, divergence, silence
  → Penelope: diary metadata, on-this-day excerpt (extra file reads), silence

Every Hammond chat turn
  → existing 90-day path cadence (mind_session files already count)
  → silence flag from file dates already in that tree (no extra diary-body fetch)
  → Mind Insights from the governance tail he already loads
  → 5e/6b turns only: inject summarizeDiaryForPrompt (metadata + system_note, not prose)
```

Netlify budget: one new gated fetch window for Vera/Penelope (`MIND_DIGEST_WINDOW_DAYS = 30`), same pattern as Hammond’s `getWindowStart`. On-this-day is Penelope-only, at most three targeted file lookups (same calendar month/day, previous 3 years), skip silently if missing. Do not widen `chat.mjs`’s shared today+yesterday manifest. Hammond does not pay the 30-day diary-blob window on ordinary turns.

---

## Components

### 1. `mind_session` record

`TYPE_DOMAINS.mind_session = 'mind'` → `data/mind/<year>/<month>/<date>-<slug>.md`.

Fields:

| Field | Rule |
|---|---|
| `theme` | Optional string. One line: what was brought |
| `closing_question` | Optional string. Open thread for next time |
| `insight` | Optional string. Only when something sharp was actually present |
| `mood_at_open` / `mood_at_close` | Optional, same `MOODS` enum as diary |
| `cross_agent_note` | Optional string. One line, e.g. `Vera→Penelope: ask what the weekend is actually for.` |

At least one of `theme`, `closing_question`, or `insight` is required so empty files are rejected.

Vera’s `recordTypes`: `['mind_session']`. Domain in `agent-directory.mjs`: `'psychology'` (align with `agents.yml`).

Protocol: remove “You do not propose `log_entry`.” She **must** propose `mind_session` at a natural close (what was brought / noticed / worth carrying) and when Adam asks to record, log, or keep the session. Diary still goes to Penelope. She never quotes diary or session prose verbatim.

### 2. Auto-write (Vera only)

When the routed agent is Vera and the validated tool call is `mind_session`, the chat function writes immediately using the same GitHub / Central Node / governance helpers as `chat-confirm.mjs`. Return `written`, not `awaiting_confirm`.

Client: render the existing post-confirm summary (theme, mood close, optional insight), not a Confirm/Discard card. If the write fails, emit the same pending-record retry the confirm path already uses (client may POST `/api/chat/confirm` with that payload); Vera must not claim it was logged.

Same-day same-slug collision: overwrite that day’s session (one file per day), matching meal-slot overwrite. Do not silently create a second session file for the same date unless Adam asks for a new slug in a later turn — first ship is one `mind_session` per Sydney date; a later proposal that day replaces it.

Persona copy that says “specialists never silently auto-save” stays true for every type except this Vera exception, which the protocol states explicitly.

### 3. Mind digest (`netlify/functions/_shared/mind-digest.mjs`)

Pure functions, no blob I/O inside the module. Reuse `js/app/mind-model.js` (`diaryEntries`, `moodScoreSeries`, `entriesByMood`, `recurringThemes`).

Exports:

- `getMindDigestWindowStart(today)` — 30 inclusive days
- `summarizeDiaryForPrompt(events, today)` — last mood(s), tags, entry length, `daysSinceLastEntry`, bottom-quartile “shorter than usual” flag, `system_note` lines (not diary body)
- `summarizeMindSessionsForPrompt(events, today)` — recent `theme` + `closing_question` as named threads, `daysSinceLastMindSession`
- Simultaneous-silence flag when both gaps ≥ 7 days — included in Vera, Penelope, **and** Hammond prompt blocks
- Divergence line (Vera only): diary `mood` / `moods` vs session `mood_at_open`/`mood_at_close` in the same week, as a hypothesis, not an alert

`daysSinceLastEntry` / `daysSinceLastMindSession` are distinct names from Chadwick’s `daysSinceLastSession`.

Penelope gap copy: permission to notice gently (“been a minute — anything you want to get down?”), never an obligation.

### 4. On this day (Penelope)

If a diary file exists at the same month/day in any of the previous 3 years, inject one opening seed: date, primary mood + `moods`, tags, highlights/challenges, and a **short excerpt of `notes`** (first ~400 characters or through the second sentence boundary, whichever is shorter; strip trailing broken words). Skip silently if none.

This excerpt is for Penelope talking with Adam about *his* past writing. It does not go into Vera’s or Hammond’s digest.

### 5. Diary: multi-mood, Energy, `system_note`

- `mood` remains required primary (`MOODS`).
- `moods` optional array, 1–3 items, each in `MOODS`. Reject 0 and 4+. When present, `mood` must be one of the items (the ≥70% tone, or the first listed).
- Old files with only `mood` stay valid.
- `entriesByMood`: if `moods` is present, increment each; else increment `mood`. A mixed day can land in two bars. The score line still uses `mood_score`.
- Calendar / CN Mood line still show the primary `mood` (and score), not the full list.
- Diary confirm writes **Energy** as well as Mood (`upsertStatusField` Energy, same shape as Mood).
- Optional `system_note`: one line Penelope infers (“what this day was actually about”). Add to `HIDDEN_FIELDS`. Used by the diary digest. Never shown on the Confirm card. Must stay metadata, not a prose summary of the entry.
- Optional `cross_agent_note` on diary: visible on the Confirm card so Adam can edit it.

Penelope protocol: infer 1–3 moods; use a single mood when ≥70% of the day is one tone.

### 6. Cross-Agent write path

New `appendCrossAgentLine(content, line)` in `central-node-write.js`: insert at top of Cross-Agent Coordination, newest-first. Called from `applyLogToCentralNode` when `cross_agent_note` is present on `diary` or `mind_session`, **before** `trimCrossAgentSection` (12-line cap unchanged).

Protocols: stop telling agents to “state one line in chat.” Fill `cross_agent_note` on the proposal instead. Chat-only Vera→[Agent] lines are not memory.

### 7. Insight ledger

Add `'Mind Insight'` to `GOVERNANCE_ENTRY_TYPES`. On a successful `mind_session` write with a non-empty `insight`, server-side `appendGovernanceEntry` (`title` = theme, `body` = insight). Not a Vera tool. Existing tail/parse helpers work unchanged.

Named insights: both Vera and Penelope may refer to an insight by the short label Vera chose, without re-explaining it, once it is in the Governance Log.

### 8. Protocol restoration (Phase 0, still in)

From the Notion agent pages, into `config/vera-protocol.md` / `config/penelope-protocol.md`:

- Vera: Framework Selection Diagnostic (never announced) + Dropping Anchor / ACE (unlabelled unless asked) + correlation-with-constraints (test, don’t assert, only on repeat).
- Penelope: Gather context (relationship / purpose signals from her digest + Cross-Agent). Live weather/calendar from Notion stay out of scope.
- Style-only Penelope lines: notice the tell not the topic; constellation not a tag cloud; write forward sparingly (not Hammond goal-setting); prefer a recurring image in `cross_agent_note` when one is genuinely present.

### 9. Mind tab ambient line

`buildMindModel` (or a sibling) produces one observation: mood-trend direction + days since last diary / last `mind_session`. Render near Vera’s avatar. Zero extra API calls. Bump `CACHE_NAME`.

### 10. Hammond (cadence, brief, retrospective)

**6a.** `data/mind/` `mind_session` files are already on Hammond’s domain-presence path. Add a fixture test; no new tracking code.

**6c.** One Hammond protocol line: when a Mind Insight is open or a Vera divergence flag is present, triage it against Decision Priority Hierarchy #1 (health and psychological stability).

**Monthly three-way brief (6b).** Hammond may **suggest** it ~30 days after the last such patch (or when new Mind Insights exist and none has been briefed). He does not auto-write. Inputs: existing `hammondDigest`, diary metadata + `system_note` (not full vault), Mind Insights. Output: `propose_central_node_patch` into Long-Term Trends (existing Confirm).

**Quarterly two-voice retrospective (5e).** Adam asks, or Hammond suggests once ~90 days of diary + sessions exist. One model turn, two voices interleaved (Penelope on the days, Vera on named insights), shown in chat. If Adam wants it kept, Hammond proposes the same Long-Term Trends Confirm patch. If there isn’t enough data, they say so — they do not invent a season. No new record type.

---

## Data flow

1. Adam talks to Vera. History still 20 minutes in-tab only.
2. At close (or on “record this”) she calls `log_entry`. Server writes the session file and CN/governance side effects. Client shows “logged,” not Confirm.
3. Next Vera turn: digest includes that session’s `closing_question` as a named thread.
4. Penelope’s next diary: she can see Vera’s Cross-Agent note and on-this-day excerpt; she still Confirms the diary.
5. Hammond sees mind-domain presence, silence (from path dates), and Mind Insights on every turn. Diary metadata + `system_note` join his prompt only for a 5e/6b turn.

## Error handling

- Stream/API failure: retry the turn; no partial `mind_session`.
- Auto-write GitHub failure: pending retry; do not claim logged.
- Diary Confirm failure: existing pending-card + retry; conversation not replayed.
- Same-day session replace: overwrite with sha precondition; 409 → existing collision UI mapped to retry/overwrite.
- Empty digest window: empty string, not a crash.
- On-this-day miss: skip, no prompt noise.
- 5e/6b with thin data: refuse to fabricate; suggest waiting.

## Testing

- `validateMindSession`; diary `moods` 1 / 2 / 3 / reject 0 and 4+; `mood` must be in `moods` when both present; old scalar-only fixtures still pass.
- `mind-digest.test.js`: window math, empty window, threads, silence (both / one / neither), length-quartile, divergence, `system_note` in diary summary and **not** in Vera/Hammond as raw `notes`.
- On-this-day: present with excerpt; absent; excerpt truncated.
- `central-node-write`: Energy upsert; Mind status from `mind_session`; `appendCrossAgentLine` newest-first + 12-line cap.
- `governance-log`: `Mind Insight` round-trip.
- Persona: Vera lists `mind_session`; old “do not propose log_entry” line gone; other agents cannot auto-write.
- Integration: Vera `mind_session` tool call results in a GitHub write without `/api/chat/confirm`; a diary proposal still returns `awaiting_confirm`.
- `hammond-digest.test.js`: a `mind_session` file counts as mind-domain presence.
- Browser: Vera session does not leave a Confirm card; Penelope diary still does.
- Client JS change → `CACHE_NAME` bump; `netlify.toml` `included_files` if new protocol/config files are added (protocols already listed).

---

## Sequencing

```
Protocol restore (0)
  → mind-digest (1)
      → Penelope wiring + moods + Energy + on-this-day + system_note (2, 5d)
      → Vera mind_session + auto-write + threads + ambient line (3)
          → Cross-Agent write + Mind Insight ledger (4)
              → silence, divergence, named-insight protocol (5a/c/f)
              → Hammond cadence test + priority line + 6b/5e flows (6)
```

Ship in that order. 5e/6b can land as protocol + patch-path reuse once 4 exists; they do not need a new write stack.

After each phase: `npm test && npm run validate:fixtures`. Browser suite for client JS phases. Commit locally; do not push.

---

## Follow-ups (explicitly not this spec)

- Leave-flush if walk-away-without-proposal is still a hole in use.
- Full transcript archive.
- Migrating historical `mood` into `moods`.
- Two `mind_session` files on the same day as a product feature.
- Coach’s Notes / Goals database (still Hammond follow-ups from earlier specs).
