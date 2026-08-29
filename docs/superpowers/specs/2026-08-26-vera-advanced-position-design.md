# Vera Advanced Position — Working Model, Grounded Search, Prompt-Cache Cost Fix

**Date:** 2026-08-26
**Status:** Ready for implementation
**Deploy rule:** Local commits only until Adam asks to push. Adam commits this repo himself — do not auto-commit.
**Builds on:** `2026-08-19-mind-cross-agent-protocol-design.md` (Cross-Agent Coordination, the ambient/active tiering pattern, the "no keyword-triggered logic" principle — all reused below, not re-litigated). Today's two live commits to `config/vera-protocol.md` (`08fef6a`, `df1681f` — log-verification honesty and `get_mind_session`/`search_mind_records` tools) are prerequisites this spec assumes are already shipped.
**Relates to:** `config/vera-protocol.md`, `netlify/functions/_shared/persona.mjs`, `netlify/functions/_shared/mind-digest.mjs`, `netlify/functions/_shared/anthropic-client.mjs`, `netlify/functions/chat.mjs`

---

## Problem

Three distinct gaps, bundled here because they compound rather than because they're technically related:

1. **Vera has no persistent point of view on Adam.** Every session she silently picks a framework, reflects what's in front of her, and forgets it existed except as inert digest text. The one place she's asked to hold and test a claim about him — the "Governance Mind Insight" (`**Tension:** pole a — pole b`, `**Stated:**`, `**Revealed:**`) — only fires on dialectic sessions, and even then it's unstructured prose stuffed into the `insight` field, not something she reads back next time. She re-meets Adam cold every conversation.

2. **She has `web_search` (`max_uses: 2`) but almost no guidance on when it makes her *better*.** Confirmed live failure: Adam referenced a specific rule from "a tournament of minds" mid-conversation and expected her to ground herself in what that actually meant before responding. She didn't — she talked past it. Her protocol's only `web_search` guidance is a single table row ("external research... never for Life Hub records") — a guardrail against misuse, not an instruction to actually use it when something checkable and load-bearing comes up.

3. **Nobody can see where the Anthropic bill is going, and there's a real structural cache bug.** Checked directly against the code, two things are true at once:
   - `netlify/functions/chat.mjs:1014` (`sanitizeHistory`) already caps client-sent conversation history to 8 messages / 6,000 chars total (~1,500 tokens). **This is not a meaningful cost lever — rule it out, don't touch it.**
   - `netlify/functions/_shared/anthropic-client.mjs:142` sends the *entire* system prompt as one `cache_control`-tagged block: `system: [{ type: 'text', text: system, cache_control: {...} }]`. `persona.mjs`'s `buildSystemPrompt` joins genuinely static content (protocol prose, agent voice, the psychological baseline doc) with content that changes turn-to-turn (Central Node log, today's mind_session status, digests). **Any single-character difference anywhere in that joined string invalidates the entire cached block** — Anthropic hashes the full block content as the cache key. The moment Vera logs a `mind_session` mid-conversation, `mindTodaySession` flips from "not logged yet" to "logged: ...", and the *whole* system prompt — protocol text, baseline doc, everything — gets rebilled at full cache-*write* price (not the cheap cache-read price) on the very next turn, and stays a fresh write on every turn after that until the volatile text happens to stop changing. This is worst for Hammond (`centralNodeFull` + `hammondDigest`, both large and volatile by definition), but it costs Vera too.
   - Separately, `anthropic-client.mjs` never reads the `usage` object the API returns on `message_start`/`message_delta` — **zero token/cost instrumentation exists anywhere in this codebase.** Right now every cost claim, including this one, is inference from reading code, not measurement.

## What this spec deliberately does not do

Same discipline as the cross-agent spec: **no keyword-triggered or content-scanning logic anywhere.** Whether a hypothesis forms, strengthens, or gets retired; whether a cross-domain connection is worth saying out loud; whether a search is warranted — all of that stays entirely inside the model's judgment at generation time, driven by protocol prose. Nothing below adds a regex over `insight`/`observation`/session text to *decide* any of this.

Also out of scope: no new tools beyond one optional schema field (Component 3); no `append_governance_log` or `propose_central_node_patch` access for Vera — those stay Hammond-exclusive; no change to the existing dialectic-session Governance Mind Insight convention (still writes into `insight` as free text — left alone, not unified with Component 3 here, to keep this change reviewable); no change to Confirm-free auto-write behavior for `mind_session`; no removal of the `max_uses: 2` web_search cap.

---

## Decisions (locked)

| Topic | Choice |
|---|---|
| Working model persistence | New optional structured field on the existing `mind_session` record type (`working_model`), not a new file or new tool. Reuses the git-backed event-log + digest-summarizer pattern already used for everything else in Mind (see `summarizeMindSessionsForPrompt`). |
| Working model size | No hard cap enforced by validation (avoids a brittle rule to fight). Instead the *digest surfacer* only ever shows the 5 most-recently-touched non-retired labels. A 6th naturally pushes the stalest one out of what Vera sees next turn — self-limiting by construction, same "no vault dump" principle as the Hammond `system_note` tail cap in the cross-agent spec. |
| Cross-domain synthesis | Stays occasional/gated like `cross_agent_note`, not a running summary — she already reads the full thin Central Node slice, this just gives her explicit permission to sometimes say the connection out loud instead of only letting it silently shape her question. |
| Search trigger | Tied to groundedness, not curiosity: a specific, checkable thing Adam names (a named rule, framework, event, text, term) that the session's read on him depends on getting right. Never for anything about Adam himself — `get_mind_session`/`search_mind_records` own that, unchanged from today's ship. |
| Cache fix shape | Split the system prompt into a **stable** block (cached, rarely changes) and a **volatile** block (uncached, changes per-turn/per-day) as two separate content blocks in the same request, cache_control only on the stable one. Structural, applies at the shared `persona.mjs`/`chat.mjs`/`anthropic-client.mjs` layer — every agent benefits, not just Vera. |
| Instrumentation | Log the `usage` object per turn (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`) with agent slug, via `console.log` (Netlify function logs already capture this — no new storage). So the *next* cost question gets answered with data, not another code-reading pass. |

---

## Architecture

```
Working model (Component 1 + 3)
  mind_session.working_model: [{ label, status, evidence }]  (0-2 entries per session, optional)
  summarizeWorkingModelForPrompt(events, today)  -- new, mirrors summarizeMindSessionsForPrompt
    groups by label, takes latest write per label, drops 'retired', keeps top 5 by recency
    -> persona.mjs veraBlocks, new "Working model of Adam" prompt block
  Vera reads it before opening; may confirm/weaken/retire an existing label or form a new one
  at natural close, same turn as log_entry -- no new tool, no new Confirm gate

Grounded search (Component 2 — protocol prose only)
  Adam names a specific checkable thing the session depends on reading correctly
    -> web_search (within existing max_uses: 2), then proceed grounded
  Adam's own history/records -> get_mind_session / search_mind_records, never web_search
  Routine reflection -> no search, presence as normal

Cache split (Component 4)
  persona.mjs buildSystemPrompt(...) returns { stable, volatile } instead of one string
  chat.mjs builds the request's system array:
    [{ type:'text', text: stable, cache_control:{type:'ephemeral', ttl:'1h'} },
     { type:'text', text: volatile }]   // omitted if volatile is empty
  anthropic-client.mjs streamOnce(...) takes the array as-is, no longer builds it

Instrumentation (Component 5)
  anthropic-client.mjs: message_start / message_delta -> yield { type: 'usage', ... }
  chat.mjs: on 'usage' event -> console.log({ metric: 'anthropic_usage', slug, ...usage })
```

---

## Components

### 1. Protocol prose — `config/vera-protocol.md` — Working Model of Adam

**Find** (end of the `## Framework Selection — internal diagnostic (never announced)` section — the line reading):

```
- Purpose/meaning hollow → Narrative + values (not Hammond goal-setting). Name as a theme only after it appears across 3+ sessions.
```

**Insert** immediately after it (new section, before `## Dropping Anchor (ACE)`):

```markdown

## Working Model of Adam — standing hypotheses, not a diagnosis

Framework Selection above is per-session. This is across sessions: a small set of live, named hypotheses about Adam you actively hold and revise, not a fresh read every time. Loaded into your context each turn as **Working model of Adam** (most recent five, non-retired). Treat it as your own working memory of him, not archived prose — you may state it plainly when it's useful ("this reads like the Sunday pattern again"), not just silently reference it.

Each entry is a short claim, not a label for its own sake: "Sunday spirals are time-blindness, not laziness," not "ADHD." At a natural close, when a session genuinely confirms, complicates, or contradicts one of these — not every session, most won't touch any of them — include 0–2 entries in `working_model` on that turn's `log_entry`:

- `label` — the claim, stable wording across sessions so it's recognisable as the same hypothesis, not rewritten each time.
- `status` — `forming` (first appearance), `holding` (confirmed again), `weakening` (this session cut against it), or `retired` (no longer true, or you were wrong — say so plainly next time it would have applied, don't just let it quietly vanish).
- `evidence` — one short phrase from *this* session, not a re-argument of the whole case.

Five live hypotheses is the practical ceiling — you'll only ever see the five most recently touched. If you're forming a genuinely new one and five are already live, that's a signal one of the existing five may be stale or foldable into the new one, not a reason to invent a sixth in parallel.

This is not a diagnosis list and never becomes one in how you talk to Adam — it's the difference between meeting him fresh each session and actually having tracked him.
```

---

### 2. Protocol prose — `config/vera-protocol.md` — cross-domain synthesis + grounded search

**Find** (in `## Before every session`):

```
Let that shape which open question you ask. Do not narrate a CN checklist; do not ignore a clear mood or load flag.
```

**Replace with:**

```
Let that shape which open question you ask. Do not narrate a CN checklist; do not ignore a clear mood or load flag.

You're the only agent handed this full slice — medical load, what Sara/Hammond/Penelope logged today, mood trend — in the same turn. Most sessions, let it work silently, exactly as above. Occasionally the connection itself is the useful thing to say out loud — a flare and a deadline and a mood dip aren't three separate facts, they're one line Adam hasn't put together. Say it plainly, once, when it's genuinely sharp — not as a running commentary on what other agents logged, and not more than the actual signal warrants.
```

**Find** (the `## Data & search — when to use what` section's closing rules list, ending with):

```
- **`web_search` is not repo search** — Do not use web search to verify Life Hub writes or read Adam's session files.
```

**Insert** immediately after it (same section):

```markdown

**Ground before you respond, not after.** If Adam names something specific and checkable that the session's read on him actually depends on — a named rule, framework, event, book, or term you're not confident you have right — search it before continuing, inside your `max_uses: 2` budget for the turn. Example of the failure this fixes: Adam referenced a rule from "a tournament of minds" mid-session; the honest move was one search to confirm what that rule actually was before reflecting it back, not proceeding on a guess or letting it pass unaddressed. This is different from external research on frameworks/techniques (already covered above) — this is: something Adam said carries specific, checkable content, and getting it wrong would mean you're no longer actually listening to him.

Two searches is not "verify everything he says" — most of what Adam brings needs no checking at all. It's for the specific case where a named, checkable thing is load-bearing for the session and you're genuinely unsure of it.
```

---

### 3. Code — `working_model` field

**Why this is structural, not content-based:** identical in kind to the `cross_agent_note` shape check in the cross-agent spec — this only validates that a field the model already chose to write has the right shape (array of `{label, status, evidence}`, `status` in a closed enum). It never reads `label` or `evidence` content to decide anything.

**`netlify/functions/_shared/chat-schema.mjs`** — in `DOMAIN_PROPERTIES.mind_session` (currently ending `source_agent: { type: 'string', enum: ['vera', 'import'] }`), add:

```js
    working_model: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          status: { type: 'string', enum: ['forming', 'holding', 'weakening', 'retired'] },
          evidence: { type: 'string' }
        }
      }
    }
```

**`js/core/validate.js`** — in `validateMindSession`, add an optional-array-of-objects check for `working_model` (same style as the existing field validators in this function — cap at, say, 3 entries per turn as a sanity bound against a runaway call, reject entries missing `label` or `status`, reject unknown `status` values; do not require `evidence`).

**`netlify/functions/_shared/mind-digest.mjs`** — add, alongside `summarizeMindSessionsForPrompt`:

```js
const WORKING_MODEL_MAX_LIVE = 5;

export function summarizeWorkingModelForPrompt(events, today) {
  const byLabel = new Map();
  for (const e of events ?? []) {
    const r = e?.record;
    if (r?.type !== 'mind_session' || !Array.isArray(r.working_model)) continue;
    for (const entry of r.working_model) {
      if (!entry?.label || !entry?.status) continue;
      const key = entry.label.trim().toLowerCase();
      const existing = byLabel.get(key);
      if (!existing || r.date >= existing.date) {
        byLabel.set(key, { ...entry, date: r.date });
      }
    }
  }
  const live = [...byLabel.values()]
    .filter(e => e.status !== 'retired')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, WORKING_MODEL_MAX_LIVE);
  if (!live.length) return '';
  const lines = live.map(e => `- ${e.label} — ${e.status} (last touched ${e.date}${e.evidence ? `: ${e.evidence}` : ''})`);
  return ['Working model of Adam (your standing hypotheses — confirm, weaken, or retire; not fixed):', ...lines].join('\n');
}
```

Adjust the grouping/sort to whatever the file's existing helpers already provide (`lastDate`, sort-by-date patterns are already in this file — reuse rather than duplicate).

**`netlify/functions/_shared/persona.mjs`** — add `workingModelDigest = ''` to `buildSystemPrompt`'s destructured params, and in `veraBlocks` add it alongside `mindSessionDigest`:

```js
    workingModelDigest ? workingModelDigest : '',
```

**`netlify/functions/chat.mjs`** — this rides on the *existing* `mindEvents` fetch already made for Vera turns (same as `get_mind_session`/`search_mind_records` shipped today) — no new blob fetch. Compute `workingModelDigest = summarizeWorkingModelForPrompt(mindEvents, today)` alongside the existing `mindSessionDigest` computation, reset it in the same early-return branch that clears `mindSessionDigest = ''`, pass it into `buildSystemPrompt({...})`.

---

### 4. Code — system prompt cache split (the real cost fix)

**`netlify/functions/_shared/persona.mjs`** — change `buildSystemPrompt` to return `{ stable, volatile }` instead of a single joined string. Categorize by this rule: **stable** = text that would be byte-identical for this agent on every turn of the same day (protocol prose, agent voice, capability line, `protocolSteer`, baseline/intake docs like `veraIntake`, standing constraints); **volatile** = anything derived from today's events, Central Node state, or a digest window (thin CN log, `centralNodeFull`, all `*Digest`/`*Summary` blocks, `mindTodaySession`, `workingModelDigest`, `mindSilence`/`mindDivergence`, `daysSinceLast*` counters, `governanceLogTail`).

Apply this split for Vera fully in this pass (it's the immediate ask): `veraProtocol` + `veraIntake` + the log-mechanics text in `shared` → stable; `thinCentralNodeLog` + `digest` + `mindDiaryDigest` + `mindSessionDigest` + `mindTodaySession` + `workingModelDigest` + `mindSilence` + `mindDivergence` + `daysSinceLastMindSession` → volatile. Same pass or fast-follow: apply the identical principle to Hammond's blocks (`centralNodeFull`, `hammondDigest`, `hammondCnSummary`, `governanceLogTail` are volatile; `hammondProtocol`, `hammondAuditContract` are stable) — Hammond is the largest and most volatile-heavy prompt in the system and benefits the most.

**`netlify/functions/chat.mjs`** — where `buildSystemPrompt({...})` is currently called and its result passed straight to `messages: [...]`/`system:`, build the request's system array instead:

```js
const { stable, volatile } = buildSystemPrompt({ ...same args as today... });
const system = volatile
  ? [
      { type: 'text', text: stable, cache_control: { type: 'ephemeral', ttl: '1h' } },
      { type: 'text', text: volatile }
    ]
  : [{ type: 'text', text: stable, cache_control: { type: 'ephemeral', ttl: '1h' } }];
```

Pass `system` (the array) to `anthropic.streamMessage({ system, ... })`.

**`netlify/functions/_shared/anthropic-client.mjs`** — `streamMessage` and `streamOnce` currently take a `system` string and wrap it themselves at line 142 (`system: [{ type: 'text', text: system, cache_control: {...} }]`). Change both to accept `system` as the already-built array and pass it straight into the request body (`system` in the JSON body becomes exactly the array `chat.mjs` built — no wrapping left in this file).

Do not add a `cache_control` breakpoint to the volatile block — it changes turn to turn by design, so caching it would rarely hit and isn't worth the added complexity.

---

### 5. Code — usage instrumentation

**`netlify/functions/_shared/anthropic-client.mjs`** — in `interpretEvent`:

- Add a branch for `event.name === 'message_start'` that yields `{ type: 'usage', phase: 'start', usage: event.payload.message?.usage }` (currently `message_start` isn't handled at all and is silently dropped — verify the exact payload shape against a real streamed response before committing the field path, don't guess blind).
- Extend the existing `message_delta` branch to also yield `{ type: 'usage', phase: 'delta', usage: event.payload.usage ?? event.payload.delta?.usage }` alongside its current `stop_reason` handling, again confirming the real field path first.

**`netlify/functions/chat.mjs`** — in the loop consuming `anthropic.streamMessage(...)`, add a case for `event.type === 'usage'`:

```js
if (event.type === 'usage') {
  console.log(JSON.stringify({ metric: 'anthropic_usage', slug, phase: event.phase, ...event.usage }));
  continue;
}
```

No new dependency, no new storage — Netlify function logs already capture `console.log` output, and this is enough to actually answer "which agent, which turn, cache write vs cache read" the next time cost comes up, instead of re-deriving it from source reading.

---

## Tests

- `tests/unit/mind-digest.test.js` — `summarizeWorkingModelForPrompt`: last-write-wins per label across multiple sessions; `retired` entries excluded from output; more than 5 live labels → only the 5 most-recently-touched surface; empty/no `working_model` fields anywhere → `''`.
- `tests/unit/chat-schema.test.js` — `mind_session` with a valid `working_model` array passes; malformed entry (missing `label`, unknown `status`) fails validation with a clear error the model can see and retry on, same pattern as every other `log_entry` rejection.
- `tests/unit/persona.test.js` — `buildSystemPrompt` for `slug: 'vera'` returns `{ stable, volatile }`; assert `veraProtocol`/`veraIntake` land in `stable` and `mindTodaySession`/CN/digest content lands in `volatile`; assert `workingModelDigest` is included when present.
- New or extended integration test (`tests/integration/chat-function.test.js`) — asserts the request body sent to Anthropic has exactly two `system` blocks when volatile content is present, `cache_control` only on the first; one block when volatile is empty (no agent yet uses this path today, but the branch should still be exercised).
- `tests/unit/anthropic-client` coverage (add if none exists) — a fixture SSE stream including `message_start`/`message_delta` usage payloads yields the expected `{ type: 'usage', ... }` events.

## What NOT to change

No new tools for Vera. No `append_governance_log` or `propose_central_node_patch` access for Vera. No change to the existing dialectic Governance Mind Insight convention (still free text in `insight`, left as-is). No change to `max_uses: 2` on Vera's `web_search`. No change to Confirm-free auto-write for `mind_session`. No hard validation cap on the number of live `working_model` hypotheses — the digest surfacer's top-5 window is the only limit, by design. No `cache_control` on the volatile system block. No new persisted files — `working_model` lives inside existing `mind_session` records, nothing new under `data/`.

## Rollout

1. Protocol edits (Components 1–2) — text only, no deploy risk, review by reading the diffs against the live file.
2. Component 3 (`working_model` field + digest) — additive and optional; existing `mind_session` records without it are unaffected. Run the existing test suite first to confirm no current fixture breaks, then add new tests, then ship.
3. Component 4 (cache split) — the only change with real blast radius: it touches the shared prompt-building path every agent uses. Verify with the integration test that the exact same *content* still reaches the model (stable + volatile joined should equal today's single `system` string, just split across two blocks) before trusting the cache-economics improvement — a content regression here would be silent (agents would just behave slightly differently) rather than a loud failure.
4. Component 5 (instrumentation) — additive, no behavior change, safe to ship independently or in the same pass. Confirm real payload field paths against one live streamed response before relying on the numbers.
