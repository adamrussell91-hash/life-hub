# Mind Cross-Agent Protocol — Vera / Penelope / Hammond Signal Loop

**Date:** 2026-08-19
**Status:** Approved direction (brainstorm), ready for implementation
**Deploy rule:** Local commits only until Adam asks to push. Adam commits this repo himself — do not auto-commit.
**Builds on:** `2026-08-13-mind-session-memory-design.md` (which shipped `mind_session`, auto-write, thin/full CN, the 30-day digest). This spec does not touch any of that plumbing — it fixes how the Cross-Agent channel it created gets *used*.
**Relates to:** `2026-08-15-mind-dashboard-v2-design.md`, `2026-08-09-hammond-central-node-governance-design.md`

---

## Problem

Central Node Cross-Agent Coordination — the mailbox Vera, Penelope, and Hammond share — is architecturally sound but empty in practice. As of this brief:

- The Mind dashboard's Cross-Agent strip has never shown a Vera or Penelope line, live or in months of use.
- The one real `cross_agent_note` any Mind agent has ever written (Vera, 14 Aug 2026) landed on Central Node but is invisible on the strip, because it was written `Hammond: ex-principal…` instead of `Vera→Hammond: …` — no arrow, so it fails the dashboard's own marker filter (`Vera→`, `Penelope→`, `→Vera`, `→Penelope` in `js/app/mind-model.js`).
- Penelope has never filled `cross_agent_note` on a live diary.
- Live Cross-Agent also holds a `Hammond→Ann:` line. Ann O'Tation is listed in Central Node's Agent Directory but is not an implemented Life Hub chat agent — the line is unreachable and will sit there until purged.

Root causes, confirmed against the current code and live data (not assumed):

1. **The trigger is pure permission** ("if another agent must act") with no cadence or checkpoint attached, so it's easy to reason your way out of writing anything, every single time.
2. **The format is unenforced free text.** `cross_agent_note` is `{ type: 'string' }` in `chat-schema.mjs` and only `optionalString` in `validate.js` — nothing requires the `Sender→Recipient:` shape the dashboard filter depends on.
3. **The two agents most likely to write these lines have no reporting relationship to Hammond spelled out.** Hammond's protocol already has a mandatory standing trigger for the Brisket/Chadwick/Sara/Hyaluronica relay ("silence must be a recorded judgment, not an omission" — `hammond-protocol.md`). Vera and Penelope have no analogue, and no instruction that Hammond is meant to relay back to *them* either.

This is not primarily a code problem. Two of three root causes are protocol text; the third is one structural (not semantic) validation rule.

## What this spec deliberately does not do

**No content-based or keyword-triggered logic, anywhere.** Nothing in this spec scans diary or session prose for specific words, phrases, or sentiment to decide whether a Cross-Agent line should be written, or what it should say. That decision — *should a line exist, and what does it say* — stays entirely inside the LLM's judgment at generation time, driven by protocol prose, exactly like Vera's existing silent framework-selection diagnostic already works. A future engineer reading this spec should not add a regex over `notes` or `insight` looking for trigger words ("hollow", "flake", "muffin" — anything) to *decide* whether a note gets written. That is explicitly out of scope and contrary to the design intent.

The two structural code changes below (validation format check, ambient digest tail) do not decide *whether* or *what* — they only (a) check the *shape* of a note the model already decided to write, using fields the model or the system already knows deterministically (record type, an explicit allowlist of implemented agent names), and (b) surface *already-authored* one-line fields (`system_note`) on a wider set of turns. Neither reads free text to infer intent. This distinction is called out again at each code change below so it isn't lost in review.

---

## Decisions (locked)

| Topic | Choice |
|---|---|
| Primary hop | Vera↔Penelope peer channel *and* both report to Hammond ("boss"); Hammond may relay back to either. Not hub-and-spoke-only, not peer-only. |
| What triggers a line | Two tiers. **Ambient** (Status Mind/Mood line, Penelope's `system_note`) is automatic on every log, no judgment call, no format rule. **Active** (`cross_agent_note` → Cross-Agent) is cadence-plus-insight gated: named checkpoints (dialectic close, Penelope's 3rd consecutive low/bad day, resuming after ≥7-day silence) or a genuine insight that shouldn't wait for the next natural read. Most sessions/diaries clear neither and that's correct — no line, no "recorded nothing" filler either (Vera/Penelope don't get Hammond's "silence must be a recorded judgment" duty, because the ambient tier already gives them continuity that Brisket/Chadwick/Sara/Hyaluronica don't have). |
| Line content | Observation, not instruction. `Vera→Penelope: weekend framed as escape, not rest — third time this month.`, never `Vera→Penelope: ask him about the weekend.` The receiving agent's domain judgment decides what to do with it. |
| Format | Always `Sender→Recipient: text`, enforced at validation (see Component 2), not just requested in prose. Recipients limited to an explicit allowlist of agents implemented in Life Hub chat: Vera, Penelope, Hammond, Sara, Brisket, Chadwick, Hyaluronica. Never Ann or Clare. |
| Mind dashboard filter | **No change.** `mindCrossAgentLines`'s existing `Vera→ / Penelope→ / →Vera / →Penelope` substring match already catches a correctly-formatted `Hammond→Vera:` or `Vera→Hammond:` line. The empty strip was a formatting bug upstream, not a filter-scope bug. Confirm this with a new explicit test case (Component 5) rather than assuming. |
| Confirm vs auto-write | Unchanged. Vera's `mind_session` (and its `cross_agent_note`) still writes immediately, no Confirm. Penelope's `diary` still waits on Confirm. Flagged as a real asymmetry below — see "Confirm vs auto-write implications." |
| Hammond's ambient visibility into Penelope's `system_note` | **Approved 2026-08-19.** Currently Hammond only sees `system_note` history when a turn's message matches `isHammondMindBriefTurn` (retrospective/brief-type phrasing). Under "both report to Hammond as boss," this spec makes a short (≤5 line) `system_note` tail always visible to Hammond on any turn where he already has tools active — not gated behind brief language. Capped tightly so it cannot become the vault dump the hard constraints forbid. See Component 6. |

---

## Architecture

```
Ambient tier (always-on, no judgment call, ships already — reinforced by this spec)
  Vera mind_session   → Today's Status "Mind" line (auto, every session)
  Penelope diary       → Today's Status "Mood"/"Energy" line (auto, every diary)
                        → system_note (now mandatory to fill, not optional)
  Both                 → 30-day digest (existing), Hammond's 90-day path digest (existing)

Active tier (cadence + insight gated, judgment call every time)
  Vera dialectic close, genuine insight, or ≥7-day silence break
    → cross_agent_note: "Vera→Penelope: …" / "Vera→Hammond: …" / "Vera→Sara: …"
  Penelope 3rd low day, recurring purpose/hollow theme, or ≥7-day silence break
    → cross_agent_note: "Penelope→Vera: …" / "Penelope→Hammond: …" / "Penelope→Sara: …"
  Hammond Weekly Review / Goal Audit / Mind brief, pattern worth a same-loop nudge
    → propose_central_node_patch: "Hammond→Vera: …" / "Hammond→Penelope: …"
      (extends the existing Brisket/Chadwick/Sara/Hyaluronica relay pattern —
       no "record nothing" duty added for the Vera/Penelope direction)

Validation gate (Component 2)
  Any cross_agent_note on a diary or mind_session record must match
  Sender→Recipient: text, Sender/Recipient ∈ implemented-agent allowlist,
  Sender matches the record's own type (mind_session ⇒ Vera, diary ⇒ Penelope).
  Malformed notes are rejected before they reach Central Node — the model sees
  the validation error in the same turn and can retry, same as any other
  log_entry validation failure today.

Mind dashboard (no code change)
  mindCrossAgentLines already passes a correctly-formatted line through;
  the filter was never the bug.
```

---

## Components

### 1. Protocol prose — `config/vera-protocol.md`

**Find** (the `cross_agent_note` sentence currently embedded in the `## Logging` paragraph, line 26):

```
If another agent must act, put one line in `cross_agent_note` (e.g. `Vera→Penelope: ask what the weekend is actually for.`). Chat-only Vera→[Agent] lines are not memory.
```

**Replace with:**

```
See **Cross-Agent Coordination** below for when and how to fill `cross_agent_note`. Chat-only Vera→[Agent] lines are not memory — only the field on `log_entry` persists.
```

**Insert** a new section immediately after the `## Logging` section (i.e. after the paragraph ending "...Do not claim it was logged if the tool returns an error.", before `## Framework Selection`):

```markdown
## Cross-Agent Coordination — when to write, what to write

Central Node's Today's Status Mind line writes itself on every session, automatically — Penelope and Hammond already know a session happened and roughly what it was about without you doing anything. `cross_agent_note` is a second, rarer channel: use it only when something needs to reach Penelope or Hammond *before* they would naturally see it (their next digest, Hammond's next full Central Node read), not as a running summary of the session.

Consider writing a `cross_agent_note` when any of these hold:

- The session was dialectic and closed with a named tension (you're already writing a Governance Mind Insight for this — the note is the one-line pointer that tells Hammond it exists).
- A genuine `insight` formed — something sharp, not routine reflection — that touches Penelope's diary domain (a relationship, a recurring day-to-day pattern) or Hammond's domain (career, direction, a life-architecture decision).
- The session breaks a silence of a week or more (you'll be told in context when this applies).
- Adam directly asked, in effect, whether someone else needs to know this.

None of these fire on most sessions, and that's correct — the Status line already carries the fact that the session happened. Writing a note "just to have written one" is the failure mode this section exists to prevent, not encourage.

When you do write one:

- **State what you observed, not what the other agent should do.** `Vera→Penelope: weekend framed as escape from work, not rest — third time this month.`, not `Vera→Penelope: ask him what the weekend is actually for.` Penelope's interview craft, or Hammond's coaching judgment, decides what to do with the observation — that's their expertise, not yours to script from inside a session.
- **Always prefix `Sender→Recipient:`.** `Vera→Penelope:`, `Vera→Hammond:`, or `Vera→Sara:` for a medical/load-relevant physical symptom. An unprefixed note like `Hammond: ...` will be rejected — it can't be routed and won't reach him.
- **One line.** If it needs a second sentence to make sense, it belongs in the Governance Mind Insight (for a dialectic tension) or it should wait for the next ordinary digest read, not a Cross-Agent line.
- **Only address Penelope, Hammond, or Sara.** Ann and Clare are not implemented in Life Hub chat — never address a line to them even though Central Node's Agent Directory lists them.
```

---

### 2. Protocol prose — `config/penelope-protocol.md`

**Find** the `cross_agent_note` bullet in the `## Metadata` section (line 56):

```
- `cross_agent_note` — fill when proposing `log_entry` if another agent must act (e.g. `Penelope→Vera: three low days — worth a visit.`). Chat-only lines are not memory. Prefer a recurring image over a fact when one is genuinely present.
```

**Replace with:**

```
- `cross_agent_note` — see **Cross-Agent Coordination** below. Most days don't need one — `system_note` (below) already carries the ambient signal forward.
```

**Find** the `## Optional fields` section (lines 78–81):

```
## Optional fields

- `system_note` — one line, what this day was actually about, for other agents. Not shown to Adam. Metadata, not a prose summary of `notes`.
- Named insights in the Governance Log may be referenced by Vera's label without re-explaining.
```

**Replace with:**

```
## `system_note` — fill this every time

`system_note` is your ambient signal to other agents: one line, "what today was actually about" — not a mood label, not a prose summary of `notes`, not shown to Adam. Fill it every time you propose `log_entry`, the same way you always infer `mood` and `energy`. It costs nothing extra and it's the difference between Hammond having real texture for a retrospective and Hammond having a wall of mood scores. A genuinely uneventful day still gets a genuine line — `system_note: "quiet day, mostly work, nothing surfaced."` is a real, useful entry. Leaving the field blank is the failure mode, not writing an ordinary one.

Named insights in the Governance Log may be referenced by Vera's label without re-explaining.

## Cross-Agent Coordination — when to write, what to write

`system_note` above is ambient and fires every day. `cross_agent_note` is rarer — only when something shouldn't wait for Vera's or Hammond's next natural read of the digest.

Consider writing a `cross_agent_note` when any of these hold:

- This is the third (or later) consecutive day scored low or bad — you'll be told in context if a streak is running.
- Purpose, meaning, or "hollow" language recurs across two or more entries in a short span, not just today.
- The day breaks a silence of a week or more since your last diary entry.
- A relationship or health signal (Corey, family, a Crohn's/energy crash) surfaces sharply enough that Vera or Sara should know before their next session, not just their next digest read.

Most days clear none of these — every day has feelings in it, that alone doesn't qualify. `system_note` already carries the day forward on its own.

When you do write one:

- **State what you observed, not what the other agent should do.** `Penelope→Vera: three low-mood days this week, common thread is feeling behind at work.`, not `Penelope→Vera: check in on him.` Vera's clinical judgment decides what, if anything, that means for a session.
- **Always prefix `Sender→Recipient:`** — `Penelope→Vera:`, `Penelope→Hammond:`, or `Penelope→Sara:`.
- **One line**, filled at propose time — Life Hub writes Cross-Agent from what you filled when you proposed, not from anything typed after confirm.
- **Only address Vera, Hammond, or Sara.** Never Ann or Clare.
```

---

### 3. Protocol prose — `config/hammond-protocol.md`

**Find** the end of the `## Specialist pattern relay` section, immediately before `### Purging Cross-Agent` (after the paragraph ending "...if you don't post it, they can't know it." and the "**This has a standing trigger...**" paragraph, line 80):

**Insert** (new paragraphs, same section, before the `### Purging Cross-Agent` heading):

```markdown

**Vera and Penelope are relay targets too, not just relay sources.** When a Weekly Review, Goal Audit, or Mind brief surfaces something that should change Vera's next session (a theme Penelope's diary keeps surfacing that Vera hasn't touched, a Governance Mind Insight worth a direct nudge) or Penelope's next interview (a thread Vera's sessions keep circling that the diary conversation should make room for), relay it the same way: `Hammond→Vera: ...` / `Hammond→Penelope: ...` via `propose_central_node_patch`. Unlike the specialist relay above, this carries no standing "post one or record nothing" obligation each cycle — Vera and Penelope already have an ambient channel (their own Status line, Penelope's `system_note`) keeping them current without you, so your silence toward them isn't itself a signal the way it is toward Brisket/Chadwick/Sara/Hyaluronica.

**Never address a relay to Ann O'Tation or Clare DeMind.** They appear in Central Node's Agent Directory as Notion-era or future agents but are not implemented in Life Hub chat — a line addressed to them is unreachable and will sit on Cross-Agent as dead weight until purged.
```

---

### 4. Code — validation gate, `js/core/validate.js`

**Why this is structural, not content-based:** this check only inspects the *shape* of a string the model already chose to write (does it contain `→`, and are the two names either side of it on a fixed allowlist) — it never reads the note's subject matter, never scores sentiment, never scans `notes`/`insight`/`observation` for trigger words. It is the same kind of check as the existing `enumeration()` calls a few lines above it (`mood`, `cable_type`, `session_type`) — a closed-set structural constraint, not semantic inference.

**Find** near the top of the file, after the existing constant block (after line 19, `const SESSION_SOURCE_AGENTS = ['vera', 'import'];`):

**Insert:**

```js
const CROSS_AGENT_AGENT_NAMES = ['Vera', 'Penelope', 'Hammond', 'Sara', 'Brisket', 'Chadwick', 'Hyaluronica'];
const CROSS_AGENT_NOTE_RE = new RegExp(
  `^(${CROSS_AGENT_AGENT_NAMES.join('|')})\\u2192(${CROSS_AGENT_AGENT_NAMES.join('|')}):\\s*\\S`
);
```

(`→` is `→`; written as an escape so the source file stays plain ASCII — confirm the existing file's convention and use a literal `→` instead if other regexes in this file already do that.)

**Find**, after `function optionalString(...)` (after line 78):

**Insert** a new helper:

```js
function crossAgentNote(record, field, errors, { senderName } = {}) {
  const value = record[field];
  if (value == null) return;
  if (typeof value !== 'string') {
    errors.push(`${field} must be a string or null`);
    return;
  }
  const trimmed = value.trim();
  if (!trimmed) return;
  const match = CROSS_AGENT_NOTE_RE.exec(trimmed);
  if (!match) {
    errors.push(
      `${field} must be "Sender→Recipient: ..." using implemented agent names (${CROSS_AGENT_AGENT_NAMES.join(', ')})`
    );
    return;
  }
  const [, sender, recipient] = match;
  if (senderName && sender !== senderName) {
    errors.push(`${field} sender must be ${senderName} on a ${senderName === 'Vera' ? 'mind_session' : 'diary'} record`);
  }
  if (sender === recipient) {
    errors.push(`${field} sender and recipient must differ`);
  }
}
```

**Find** in `validateDiary` (line 226):

```js
  optionalString(record, 'cross_agent_note', errors);
```

**Replace with:**

```js
  crossAgentNote(record, 'cross_agent_note', errors, { senderName: 'Penelope' });
```

**Find** in `validateMindSession` (line 250):

```js
  optionalString(record, 'cross_agent_note', errors);
```

**Replace with:**

```js
  crossAgentNote(record, 'cross_agent_note', errors, { senderName: 'Vera' });
```

No other file needs a corresponding change: `chat-schema.mjs`'s `{ type: 'string' }` stays as-is (it's the loose tool-call surface; `validate.js` is where semantic rejection already happens, and a validation failure here surfaces to the model as a normal `log_entry` error it can see and correct in the same turn — same pattern as every other required-field rejection). `central-node-write.js`'s `applyLogToCentralNode` also needs no change: by the time a record reaches it, `cross_agent_note` is already guaranteed well-formed.

---

### 5. Tests — `js/core/validate.js` coverage

Add to whatever existing test file covers `validate.js` (or `chat-schema.test.js`, which already has `diary whitelist accepts moods, system_note, cross_agent_note` at line 277 using a correctly-formatted `Penelope→Vera: worth a visit.` fixture — that existing test should keep passing unchanged):

- A diary record with `cross_agent_note: 'Vera→Penelope: bad day.'` (wrong sender for a diary) → rejected with a sender-mismatch error.
- A mind_session record with `cross_agent_note: 'Hammond: ex-principal...'` (no arrow — the actual live bug) → rejected.
- A mind_session record with `cross_agent_note: 'Vera→Ann: ...'` → rejected (Ann not in the allowlist).
- A diary record with `cross_agent_note: 'Penelope→Penelope: ...'` → rejected (sender = recipient).
- A diary record with `cross_agent_note: 'Penelope→Hammond: purpose language recurring.'` → passes.
- No `cross_agent_note` at all → passes (field stays optional; only its *shape*, when present, is enforced).

Add to `tests/unit/mind-model.test.js`, alongside the existing "keeps Vera/Penelope prefixes and drops others" case: an explicit assertion that `mindCrossAgentLines` keeps a `Hammond→Vera: ...` line and a `Vera→Hammond: ...` line, and still drops `Hammond→Ann: ...`. This confirms the "no filter change needed" decision above rather than assuming it.

---

### 6. Code — ambient `system_note` tail for Hammond

Approved 2026-08-19. Independent of Components 1–5 — can ship in the same pass or separately, but is now part of this spec's scope, not deferred.

**Why this is structural, not content-based:** this surfaces one-line fields the model already authored (`system_note`), on more turns than today, within a hard line cap. It does not read `notes` or session prose, and it does not decide which days are "interesting" — it's a fixed, most-recent-N-days window, the same kind of mechanical windowing `getMindDigestWindowStart` already does for the 30-day digest.

**`netlify/functions/_shared/mind-digest.mjs`** — add a new export near `summarizeDiaryForPrompt`:

```js
const SYSTEM_NOTE_TAIL_DAYS = 7;
const SYSTEM_NOTE_TAIL_MAX_LINES = 5;

export function recentSystemNoteTail(events, today, { days = SYSTEM_NOTE_TAIL_DAYS, maxLines = SYSTEM_NOTE_TAIL_MAX_LINES } = {}) {
  const from = addCalendarDays(today, -(days - 1));
  const lines = (events ?? [])
    .filter(e => e?.record?.type === 'diary' && typeof e.record.date === 'string' && e.record.date >= from && e.record.date <= today)
    .filter(e => typeof e.record.system_note === 'string' && e.record.system_note.trim())
    .sort((a, b) => a.record.date.localeCompare(b.record.date))
    .slice(-maxLines)
    .map(e => `${e.record.date}: ${e.record.system_note.trim()}`);
  if (!lines.length) return '';
  return ['Recent day-to-day signal (system_note, metadata only):', ...lines].join('\n');
}
```

**`netlify/functions/chat.mjs`** — inside the `if (needsHammondTools) { ... }` block (around line 484–500), after the existing `hammondDiaryDigest = hammondDiaryDigestForTurn({...})` call:

```js
            hammondMindAmbient = recentSystemNoteTail(cnEvents, today);
```

Declare `let hammondMindAmbient = '';` alongside the existing `let hammondDiaryDigest = '';` (around line 284), reset it alongside `hammondDigest = ''; hammondCnSummary = '';` in the early-return/no-tools branch (around line 554), add `recentSystemNoteTail` to the existing `mind-digest.mjs` import list (around line 110–115), and pass `hammondMindAmbient` in the `buildSystemPrompt({...})` call (around line 601–619) alongside the other `hammond*` fields.

**`netlify/functions/_shared/persona.mjs`** — add `hammondMindAmbient = ''` to `buildSystemPrompt`'s destructured params (near `hammondDiaryDigest`, line 30), and add a block inside `hammondBlocks` (after the existing `hammondDiaryDigest` block, around line 182–184):

```js
    hammondMindAmbient
      ? hammondMindAmbient
      : '',
```

This rides on the *existing* `hammondCnEntries`/`cnEvents` fetch already made on every Hammond-tools turn — it does not add a new blob fetch. Cap stays at 5 lines specifically so this cannot drift into the "vault dump" the hard constraints forbid; do not raise `SYSTEM_NOTE_TAIL_MAX_LINES` without checking back in on that constraint.

---

## Confirm vs auto-write implications

Vera's `mind_session` (and any `cross_agent_note` on it) still writes immediately — no human check before it lands on Hammond's or Penelope's side of Central Node. Penelope's Confirm step still gives Adam a natural edit point before hers lands. This asymmetry is unchanged by this spec (per the hard constraint), but it means the discipline in Component 1 (observation, not instruction; cadence/insight gating, not reflexive) matters *more* for Vera's lines than Penelope's — there's no review step to catch a bad one. Worth a line in Vera's protocol doc calling this out explicitly if a future revision touches this section again; not re-litigating it here.

## What NOT to change

No new tools. No `propose_central_node_patch` access for Vera or Penelope. No new record types or schema fields beyond the `system_note`-is-mandatory framing (the field already exists). No changes to `mindCrossAgentLines`, `renderCrossAgentStrip`, or any Mind dashboard chrome/CSS. No changes to privacy rules — Cross-Agent lines stay metadata-level, never diary/session prose, same as `insight`/`theme`/`system_note` today. No live agent-to-agent chat channel. Diary stays Penelope's; `mind_session` stays Vera's. Vera-auto-write vs Penelope-Confirm stays as-is.

## Rollout

1. Protocol edits (Components 1–3) — text only, no deploy risk, review by reading the diffs against the live files.
2. `validate.js` change (Component 4) — run existing test suite first to confirm current fixtures already use the correct format (they do — see the "Tests" section above), then add the new rejection-path tests, then ship. This is the only change with real blast radius: a live session or diary that already has a malformed `cross_agent_note` in flight would fail validation post-deploy. Given the format has essentially never been used correctly in production, this risk is low, but confirm with Adam before deploy rather than assuming.
3. Component 6 (ambient tail) — approved, independent of 1–5, can ship in the same pass or separately.
