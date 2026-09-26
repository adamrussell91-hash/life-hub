# Cognitive protocols: conversation, context, log and write-back

Date: 2026-09-26
Scope: `netlify/functions/_shared/cognitive-*.mjs`, `netlify/functions/knowledge-protocols*.mjs`, `config/knowledge/cognitive/*`, `apps/knowledge/src/protocols/`, `docs/cognitive-protocol-api.md`
Status: design for review. Built in four phases, each with its own plan.

## Problem

The eight cognitive protocols are supposed to be live conversations that are informed by Adam's own life and by real research. In practice:

1. Voices deliver long pieces and only ask at the end of a turn. Fates asks after every question, which makes a Normal run about 54 replies and a Long run about 98.
2. Word and sentence limits fail the whole stage (`voice_limit`), and the run stops until Adam retries.
3. The background runner (`knowledge-protocols-run.mjs`) builds its service with a stub `retrieve` that returns nothing. The real lookup (`defaultRetrieve`) only runs on the inline fallback path, so archive context is empty in normal use. It also only searches Knowledge Hub note excerpts. The Central Node never reaches any protocol and web search is not offered.
4. The Fallacy Filter cannot reopen a flagged element, only re-run itself.
5. There is no run history on the Thinking page. The backend `?list=1` endpoint exists but nothing calls it.
6. Finished runs leave nothing for Hammond in the Central Node.
7. Horizon's quarterly-review rule cannot be enforced because nothing knows when the last review was.

## Decisions (from Adam, 2026-09-26)

| Question | Decision |
|---|---|
| Fates run length | Fewer, shorter stops. Roughly 8 / 16 / 27 replies for Sprint / Normal / Long. |
| Conversation model, all 8 protocols | Short bursts. A voice may pause mid-turn with a steering question and then continue. No quotas. |
| Horizon | Ketill and Alvar may ask steering questions in character. Sigrid's classification stays the closing checkpoint. |
| Central Node write-back | Automatic for both the Recent Agent Actions line and the Cross-Agent directive. |
| Context | Central Node, Knowledge Hub and web research inform all 8 protocols. |
| Run log | On the Thinking page, so past runs can be re-read. |
| Length limits | Must never fail a run. |

## Phase 1: Conversation engine

### 1.1 The burst model

A step is a voice speaking one logical turn. A turn is now one or more short **bursts**.

- The voice's JSON gains `done` (boolean, default `true`). A voice that asks a question and will continue sets `done: false`.
- When a burst returns a `question`, the session waits (checkpoint kind `answer`). On Adam's reply the controller **re-runs the same step** (a continuation) instead of advancing the cursor. The continuation prompt includes the answer and the instruction to continue without repeating.
- When a burst returns `done: true`, or `maxBursts` for that voice is reached, the cursor advances. If the cap is reached mid-question, the voice is told on its final burst to close without asking.
- Step fields added: `maxBursts` (default 3), `burstWords` (default 90). Session fields added: `burst` (count within the current step).
- Steps with `gate` (confirm, verify, reflection) keep their current one-question-and-stop behaviour.
- **Compile steps** (Horizon map, Mirror synthesis, Tribunal convergence, Consilium map) are single burst with a 400 to 450 word budget, replacing the default 1,500.
- **Nothing in the model is quota-driven.** The Fates `micro`/`quota` fields are removed.

`shared.md` is updated: keep "when you ask a question, stop", add the continuation rule ("you will be called again with the answer; continue from it; do not repeat"), and set the default burst length.

### 1.2 Tribunal exception

Tribunal voices must stay independent and receive identical original input (existing test). Per-voice questions are therefore not allowed. Instead a shared `clarify` step (controller) runs first and asks up to two steering questions when the input is thin or ambiguous. All three voices then receive identical enriched input.

### 1.3 Length never fails a run

In `validateOutput`:

- Soft ceiling = budget × 1.25 (Consilium sentence cap: 5).
- Over the ceiling: re-ask the voice up to two times, appending the exact violation ("141 words, limit 90. Rewrite shorter and keep your question.").
- Still over after two retries: trim to the last complete sentence, keeping the question if there is one, and set `trimmed: true` on the turn.
- Other invalid-output errors (`invalid_model_output`, `missing_question`): one automatic retry, then fail as today.
- A session never enters `failed` because of length.

### 1.4 Fates run shape

| Mode | Stops | Cycles | Breaks | Approx. replies |
|---|---|---|---|---|
| Sprint | 3 (Clotho, Atropos, Clotho) | 1 | 0 | 8 |
| Normal | 6 | 2 cycles of 3 | 1 | 16 |
| Long | 12 | 3 cycles of 4 | 2 | 27 |

A stop is 1 to 2 bursts with at least one question, 250 words at most across the stop. Briefing stays two short bursts, then plan, then cycles, filter, Weave, close. This intentionally shortens Notion's "cycles of six". `fates.md` run-length text is updated.

A new action `wrap` is allowed at any answer checkpoint: it jumps to the filter and close.

### 1.5 Fallacy Filter reopen

The filter checkpoint offers three responses: **hold with caution**, **reopen** or **close**.

- New action `reopen` (requires text naming the element). The controller inserts one `reopen-n` stop for the Fate best suited (Atropos for unsupported claims, Clotho for narrowed options, chosen by Lachesis in the filter turn as `nextSpeaker`), then re-runs the filter.
- Cap of two reopens per run, after which only confirm or close is allowed.
- `hold with caution` is a `confirm` carrying the flagged element into the Weave's map.

### 1.6 Horizon

Ketill and Alvar may ask one steering question per burst in their own voice (max 3 bursts each). `horizon.md` and the Horizon strings in `buildPrompt()` change from "no question" to that rule. Sigrid stays the closing classification. The server guard becomes generic: max bursts and one question per burst, for every voice.

### 1.7 API and UI

- `docs/cognitive-protocol-api.md`: add `done`, `trimmed`, actions `reopen` and `wrap`.
- `view.ts`: render `reopen` (with a text field) and `wrap` when allowed. The UI already treats `allowedActions` as authoritative.

## Phase 2: Context for all 8 protocols

### 2.1 One shared context step

New module `cognitive-context.mjs` exporting `gatherContext(session, env)` returning `{ evidence[], status }`. It runs once at session start and is used by **both** the background runner and the inline path. The stub in `knowledge-protocols-run.mjs` is removed.

### 2.2 Sources

1. **Central Node.** Read via the existing GitHub client used by `chat.mjs`. Sections are selected per protocol; medical detail is excluded unless the protocol needs it (Witness, Mirror). Evidence kind `central_node`.

   | Protocol | Sections |
   |---|---|
   | Fates | About Me, This Month |
   | Horizon | About Me, This Month, Long-Term Trends, Constraints (Work, Time), Cross-Agent |
   | Refinery, Cartographers | About Me (Work, Study) |
   | Mirror, Witness | About Me, Long-Term Trends, Recent Agent Actions, Medical Status (summary only) |
   | Consilium | About Me, People, This Month |
   | Tribunal | About Me, This Month |

   Goals are included where a readable record exists. Section choices are reviewable in code, not hidden in prompts.
2. **Knowledge Hub.** The existing manifest lookup is fixed to run, and the top 2 to 3 hits have the page read (bounded) instead of a 700-character excerpt. Terms are re-derived when Adam's answers add new subject matter.
3. **Web research.** A bounded **research brief** step before the voices: one model call with the `web_search` tool (`registry.mjs` already defines it), producing 3 to 5 findings with sources. Each finding becomes evidence `web:n` with title, URL and excerpt. Cartographers and Refinery's Builder may also call `web_search` mid-run, capped per burst.
   - Queries are built from the topic terms only. They never include Central Node text or personal details from intake.

### 2.3 Prompt changes

- `shared.md`: replace "Web lookup is unavailable" with the actual rule. Only supplied evidence is verified. Web findings are labelled sources supplied by the server, and voices never imply they searched during their own turn. Existing rules stay: no announcing retrieval, no URLs in text (the server renders links), quotations only via `quotes`.
- The empty-archive line in `shared.md` stays.

### 2.4 Failure handling

Context is best-effort. If any source fails, the run continues with what was retrieved and `evidenceStatus` says which sources were unavailable. It never blocks a session.

## Phase 3: Run log and write-back

### 3.1 Summary on completion

When a session reaches `completed`, one extra model call produces `summary`: `{ title, keyFinding (max 160 chars), summary (max 80 words), openQuestions[], forHammond: string | null }`. It is stored on the session.

### 3.2 Log on the Thinking page

- New "Past runs" section on the protocol library screen.
- List rows: date, protocol, focus title, mode, status. Filter by protocol.
- Opening a run replays the transcript read-only through the existing scrubber and shows the summary card.
- Waiting and paused runs offer **Resume**.
- "Download as markdown" exports the transcript and summary.
- `GET /api/knowledge/protocols?list=1` returns title and summary fields and supports paging. The 50-run cap is removed.

### 3.3 Central Node write-back

On completion, automatically:

- Add one line to **Recent Agent Actions**: protocol, date, key finding.
- If `forHammond` is set, add one line to **Cross-Agent Coordination**: `<Protocol>→Hammond: <directive>`. `forHammond` is only set when the run produced something actionable, for example Horizon's load-bearing choices.

Both lines follow the Central Node writing rules (one line, no essays, no hype). They go through the existing Central Node patch path. Full detail stays in the log. Since these write without a Confirm card, the log always shows exactly what was written.

## Phase 4: Horizon cadence (needs its own design pass)

- Starting Horizon within 90 days of the last completed Horizon (read from the log) requires the frequency justification.
- A calendar entry for the next review is wanted. The events store found so far (`event-schema.mjs`) supports only professional development events, so the Life calendar's entry path needs exploring before this phase is designed.

## Testing

- Update the controller tests for the new run shapes (Fates counts per mode, quotas removed).
- New: burst continuation and `maxBursts`; retry and trim behaviour; `reopen` and `wrap`; Tribunal clarify with identical enriched input; Horizon Ketill asking; generic guard.
- New: `gatherContext` with each source failing independently; both runner and inline path call the same function.
- New: summary generation; Central Node lines pass the writing-rule checks.
- View tests for Past runs and the new actions.

## Risks

- **Cost and latency.** Bursts add model calls, and the research brief and summary add one each. Bounded by `maxBursts` and one research call per session.
- **Privacy.** Central Node content goes to the model provider. Per-protocol section selection limits this, and web queries use topic terms only.
- **Unreviewed directives.** Cross-Agent lines write automatically. Mitigated by the fixed one-line format, `forHammond` being null by default, and the log showing what was written.
- **Voice drift in short bursts.** Voice files were written for longer turns. Expect a tuning pass after the first live runs.

## Out of scope

Portraits, the `view.ts` "is setting the first beams" status lines, and any reviewed save-to-Knowledge-Hub flow.
