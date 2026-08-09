# Hammond Central Node + Governance Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Hammond tools to patch Central Node (auto vs Confirm by risk) and append a Governance Log, with full CN in his prompt and protocols wired to durable writes.

**Architecture:** Pure patch + risk helpers extend `central-node-write` / new sibling modules. Hammond-gated chat tools mirror Hyaluronica auto-writes for low-risk patches and Governance Log appends; high-risk patches emit a Confirm SSE (like `log_entry`) and apply via an extended `/api/chat/confirm`. Persona injects full `central-node.md` + capped Governance Log tail for Hammond only.

**Tech Stack:** Vanilla JS, Netlify Functions, GitHub Contents API, `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-09-hammond-central-node-governance-design.md`

**Deploy:** Local commits only until Adam asks to push.

---

## File map

| File | Responsibility |
|------|----------------|
| `js/core/constraints.js` | Export all CN heading constants used by patches |
| `js/core/central-node-patch.js` | Pure patch apply + risk classifier |
| `js/core/governance-log.js` | Path, format/append entry, parse recent tail |
| `netlify/functions/_shared/hammond-tools.mjs` | Tool schemas + validate/apply wrappers |
| `netlify/functions/chat.mjs` | Gate tools; full CN + gov-log for Hammond; executeTools auto; SSE for confirm patches |
| `netlify/functions/chat-confirm.mjs` | Accept `kind: 'cn_patch'` candidates |
| `netlify/functions/_shared/persona.mjs` | Full CN / gov-log tail / tool instructions for Hammond |
| `netlify/functions/_shared/hammond-audit.mjs` | Lock phase: persist via tools |
| `js/app/hammond-audit.js` | Keep lock contract text in sync |
| `config/hammond-protocol.md` | Protocol → tools; drop chat-only write-back |
| `js/app/render-chat.js` | `appendCnPatchProposal` Confirm card |
| `js/app/chat-controller.js` | Bind CN patch proposals → confirm |
| `js/app/chat-api.js` | Pass `kind` on confirm if needed |
| `service-worker.js` | Bump cache; precache new `js/core` modules if client-imported |
| Tests | unit patch/risk/gov-log/persona; integration chat + confirm; render-chat |

**Paths:**
- `central-node.md` (existing)
- `data/governance/governance-log.md` (new)

**Governance Log tail cap:** last **10** entries or **12_000** characters, whichever truncates first (prefer complete entries).

---

### Task 1: Heading exports + CN patch helpers + risk classifier

**Files:**
- Modify: `js/core/constraints.js`
- Create: `js/core/central-node-patch.js`
- Create: `tests/unit/central-node-patch.test.js`

- [ ] **Step 1: Write failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyCentralNodePatchRisk,
  applyCentralNodePatch,
  CENTRAL_NODE_SECTIONS
} from '../../js/core/central-node-patch.js';

const FIXTURE = `# Purpose
Purpose body.

## 📏 Writing Rules (All Agents Must Follow)
Rule one.

## 🤖 Agent Directory
- Hammond

## 🔴 Current Constraints & Priorities
- Steroid taper active

## ⚡ Today's Status — Monday, 1 January 2026
**Flags:** Quiet day.
**Energy:** Ok.

## 📅 This Week
- Lift Mon

## 📊 This Month
### Active Goals
- Sleep by 11

## 📈 Long-Term Trends & Patterns
- Sleep debt rising

## 🤝 Cross-Agent Coordination
- Chadwick→Brisket: training day

## 📝 Recent Agent Actions
- 1 Jan — Brisket: meal logged
`;

test('classify: status upsert_field is auto', () => {
  assert.equal(
    classifyCentralNodePatchRisk({
      section: 'todays_status',
      op: 'upsert_field',
      payload: { field: 'Flags', text: '**Flags:** Flare watch.' }
    }),
    'auto'
  );
});

test('classify: constraints append_line is auto', () => {
  assert.equal(
    classifyCentralNodePatchRisk({
      section: 'constraints',
      op: 'append_line',
      payload: { text: '- New additive flag' }
    }),
    'auto'
  );
});

test('classify: constraints delete_lines is confirm', () => {
  assert.equal(
    classifyCentralNodePatchRisk({
      section: 'constraints',
      op: 'delete_lines',
      payload: { match: 'Steroid taper' }
    }),
    'confirm'
  );
});

test('classify: this_month replace_section is confirm', () => {
  assert.equal(
    classifyCentralNodePatchRisk({
      section: 'this_month',
      op: 'replace_section',
      payload: { text: '### Active Goals\n- New goal' }
    }),
    'confirm'
  );
});

test('classify: purpose any op is confirm', () => {
  assert.equal(
    classifyCentralNodePatchRisk({
      section: 'purpose',
      op: 'replace_section',
      payload: { text: 'Nope' }
    }),
    'confirm'
  );
});

test('apply upsert_field updates Flags', () => {
  const next = applyCentralNodePatch(FIXTURE, {
    section: 'todays_status',
    op: 'upsert_field',
    payload: { field: 'Flags', text: '**Flags:** Flare watch.' }
  });
  assert.match(next, /\*\*Flags:\*\* Flare watch\./);
  assert.match(next, /\*\*Energy:\*\* Ok\./);
});

test('apply append_line to cross_agent', () => {
  const next = applyCentralNodePatch(FIXTURE, {
    section: 'cross_agent',
    op: 'append_line',
    payload: { text: '- Hammond→Brisket: hold surplus' }
  });
  assert.match(next, /Hammond→Brisket: hold surplus/);
});

test('apply append_line to constraints', () => {
  const next = applyCentralNodePatch(FIXTURE, {
    section: 'constraints',
    op: 'append_line',
    payload: { text: '- Watch sodium this week' }
  });
  assert.match(next, /Watch sodium this week/);
});

test('apply delete_lines removes matched constraint', () => {
  const next = applyCentralNodePatch(FIXTURE, {
    section: 'constraints',
    op: 'delete_lines',
    payload: { match: 'Steroid taper' }
  });
  assert.equal(next.includes('Steroid taper active'), false);
});

test('apply rejects unknown section', () => {
  assert.equal(
    applyCentralNodePatch(FIXTURE, {
      section: 'nope',
      op: 'append_line',
      payload: { text: 'x' }
    }),
    null
  );
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test tests/unit/central-node-patch.test.js`

- [ ] **Step 3: Implement**

Export remaining headings from `constraints.js`:
`CONSTRAINTS_HEADING`, `THIS_WEEK_HEADING`, `THIS_MONTH_HEADING`, `LONG_TERM_TRENDS_HEADING`, plus `PURPOSE_HEADING = '# Purpose'`, `WRITING_RULES_HEADING = '## 📏 Writing Rules'`, `AGENT_DIRECTORY_HEADING = '## 🤖 Agent Directory'` (match live file prefixes).

Create `js/core/central-node-patch.js`:

```js
import {
  CONSTRAINTS_HEADING,
  TODAYS_STATUS_HEADING,
  THIS_WEEK_HEADING,
  THIS_MONTH_HEADING,
  LONG_TERM_TRENDS_HEADING,
  CROSS_AGENT_HEADING,
  RECENT_ACTIONS_HEADING,
  PURPOSE_HEADING,
  WRITING_RULES_HEADING,
  AGENT_DIRECTORY_HEADING,
  extractSection
} from './constraints.js';
import { upsertStatusField, extractTodaysStatusBlock, replaceTodaysStatus, appendRecentAction } from './central-node-write.js';

export const CENTRAL_NODE_SECTIONS = [
  'purpose', 'writing_rules', 'agent_directory', 'constraints',
  'todays_status', 'this_week', 'this_month', 'long_term_trends',
  'cross_agent', 'recent_actions'
];

const SECTION_HEADING = {
  purpose: PURPOSE_HEADING,
  writing_rules: WRITING_RULES_HEADING,
  agent_directory: AGENT_DIRECTORY_HEADING,
  constraints: CONSTRAINTS_HEADING,
  todays_status: TODAYS_STATUS_HEADING,
  this_week: THIS_WEEK_HEADING,
  this_month: THIS_MONTH_HEADING,
  long_term_trends: LONG_TERM_TRENDS_HEADING,
  cross_agent: CROSS_AGENT_HEADING,
  recent_actions: RECENT_ACTIONS_HEADING
};

export function classifyCentralNodePatchRisk(patch) {
  if (!patch || !CENTRAL_NODE_SECTIONS.includes(patch.section)) return 'confirm';
  const { section, op } = patch;
  if (section === 'purpose' || section === 'writing_rules' || section === 'agent_directory') return 'confirm';
  if (op === 'replace_section' || op === 'delete_lines' || op === 'condense') return 'confirm';
  if (section === 'this_month' || section === 'long_term_trends') return 'confirm';
  if (section === 'constraints' && op !== 'append_line') return 'confirm';
  if (section === 'todays_status' && (op === 'upsert_field' || op === 'append_line')) return 'auto';
  if (section === 'cross_agent' && op === 'append_line') return 'auto';
  if (section === 'recent_actions' && (op === 'append_line' || op === 'upsert_field')) return 'auto';
  if (section === 'constraints' && op === 'append_line') return 'auto';
  if (section === 'this_week' && op === 'append_line') return 'auto';
  return 'confirm';
}

export function applyCentralNodePatch(content, patch) {
  if (typeof content !== 'string' || !patch || !CENTRAL_NODE_SECTIONS.includes(patch.section)) return null;
  const op = patch.op;
  const payload = patch.payload && typeof patch.payload === 'object' ? patch.payload : {};
  // Implement:
  // - todays_status + upsert_field → extractTodaysStatusBlock + upsertStatusField + replaceTodaysStatus
  // - recent_actions + append_line → appendRecentAction (reuse)
  // - generic append_line → append under section body
  // - delete_lines → remove lines containing match within section
  // - replace_section → replace full section body
  // - condense → treat as replace_section with payload.text (Confirm-class)
  // Return null on invalid op/payload
}
```

Implement helpers carefully using existing `extractSection` / heading regex patterns from `central-node-write.js` (`STATUS_HEADING_RE`, `NEXT_SECTION_RE`). Prefer small internal `replaceSectionBody(content, headingPrefix, newBody)` shared by ops.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add js/core/constraints.js js/core/central-node-patch.js tests/unit/central-node-patch.test.js
git commit -m "$(cat <<'EOF'
feat: add central node patch helpers and risk classifier

Pure ops for Hammond auto vs Confirm CN writes.
EOF
)"
```

---

### Task 2: Governance Log helpers

**Files:**
- Create: `js/core/governance-log.js`
- Create: `tests/unit/governance-log.test.js`

- [ ] **Step 1: Failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GOVERNANCE_LOG_PATH,
  GOVERNANCE_ENTRY_TYPES,
  emptyGovernanceLog,
  formatGovernanceEntry,
  appendGovernanceEntry,
  recentGovernanceTail
} from '../../js/core/governance-log.js';

test('path is data/governance/governance-log.md', () => {
  assert.equal(GOVERNANCE_LOG_PATH, 'data/governance/governance-log.md');
});

test('formatGovernanceEntry builds dated heading', () => {
  const md = formatGovernanceEntry({
    dateKey: '2026-08-09',
    entryType: 'Drift Detection',
    body: 'Stalled sleep goal.',
    status: 'Still Active'
  });
  assert.match(md, /^## 2026-08-09 — Drift Detection$/m);
  assert.match(md, /\*\*Status:\*\* Still Active/);
  assert.match(md, /Stalled sleep goal/);
});

test('appendGovernanceEntry prepends after title', () => {
  const base = emptyGovernanceLog();
  const next = appendGovernanceEntry(base, {
    dateKey: '2026-08-09',
    entryType: "Coach's Notes",
    body: 'First note.'
  });
  const again = appendGovernanceEntry(next, {
    dateKey: '2026-08-10',
    entryType: 'Weekly Review',
    body: 'Second.'
  });
  const firstIdx = again.indexOf('2026-08-10');
  const secondIdx = again.indexOf('2026-08-09');
  assert.ok(firstIdx < secondIdx);
});

test('recentGovernanceTail respects entry and char caps', () => {
  let log = emptyGovernanceLog();
  for (let i = 1; i <= 15; i += 1) {
    log = appendGovernanceEntry(log, {
      dateKey: `2026-08-${String(i).padStart(2, '0')}`,
      entryType: "Coach's Notes",
      body: `Note ${i}`
    });
  }
  const tail = recentGovernanceTail(log, { maxEntries: 10, maxChars: 12000 });
  assert.equal((tail.match(/^## /gm) || []).length, 10);
});
```

- [ ] **Step 2: FAIL** → **Step 3: Implement**

```js
export const GOVERNANCE_LOG_PATH = 'data/governance/governance-log.md';
export const GOVERNANCE_ENTRY_TYPES = [
  "Coach's Notes", 'Session Triage', 'Cross-Domain Tension', 'Major Decision',
  'Drift Detection', 'Escalation', 'Closed Loop Review', 'Weekly Review',
  'Goal Audit', 'Direction Session', 'Principle Update'
];

export function emptyGovernanceLog() {
  return '# Governance Log\n';
}

export function formatGovernanceEntry({ dateKey, entryType, body, status, title }) { /* … */ }
export function appendGovernanceEntry(content, entry) {
  // Insert newest entry immediately after "# Governance Log\n"
}
export function recentGovernanceTail(content, { maxEntries = 10, maxChars = 12000 } = {}) {
  // Split on /^## /m entries; take newest N within char budget; return markdown fragment
}
```

Reject unknown `entryType` in format (return null).

- [ ] **Step 4: PASS** → **Step 5: Commit**

```bash
git add js/core/governance-log.js tests/unit/governance-log.test.js
git commit -m "$(cat <<'EOF'
feat: add governance log helpers for Hammond

Append-only dated entries with a capped recent tail for prompts.
EOF
)"
```

---

### Task 3: Hammond tool schemas + apply wrappers

**Files:**
- Create: `netlify/functions/_shared/hammond-tools.mjs`
- Create: `tests/unit/hammond-tools.test.js`

- [ ] **Step 1: Tests for schema names + validatePatch + validateGovernanceAppend**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  proposeCentralNodePatchSchema,
  appendGovernanceLogSchema,
  validateCentralNodePatchInput,
  validateGovernanceLogAppendInput
} from '../../netlify/functions/_shared/hammond-tools.mjs';

test('schemas expose expected names', () => {
  assert.equal(proposeCentralNodePatchSchema().name, 'propose_central_node_patch');
  assert.equal(appendGovernanceLogSchema().name, 'append_governance_log');
});

test('validateCentralNodePatchInput requires section op payload.summary', () => {
  assert.equal(validateCentralNodePatchInput({}), null);
  assert.ok(validateCentralNodePatchInput({
    section: 'cross_agent',
    op: 'append_line',
    payload: { text: '- Hammond→Brisket: hold', summary: 'Direct Brisket to hold surplus' }
  }));
});
```

- [ ] **Step 2–4: Implement schemas** (JSON Schema style like skincare-library-tools), validators returning normalized objects or null. Re-export `classifyCentralNodePatchRisk` / `applyCentralNodePatch` usage for chat.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/hammond-tools.mjs tests/unit/hammond-tools.test.js
git commit -m "$(cat <<'EOF'
feat: add Hammond CN patch and governance log tool schemas

Validate tool inputs before auto-write or Confirm.
EOF
)"
```

---

### Task 4: Wire chat — full CN prompt, tools, auto writes

**Files:**
- Modify: `netlify/functions/chat.mjs`
- Modify: `netlify/functions/_shared/persona.mjs`
- Modify: `tests/unit/persona.test.js`
- Modify: `tests/integration/chat-function.test.js`

- [ ] **Step 1: Persona tests**

```js
test('Hammond prompt includes full central node markdown when provided', () => {
  const prompt = buildSystemPrompt({
    slug: 'hammond',
    centralNodeFull: '## 📅 This Week\n- Lift',
    centralNodeLog: 'thin',
    constraints: 'c'
  });
  assert.match(prompt, /This Week/);
  assert.match(prompt, /full Central Node/i);
});

test('Brisket prompt does not include centralNodeFull', () => {
  const prompt = buildSystemPrompt({
    slug: 'brisket',
    centralNodeFull: '## 📅 This Week\n- SECRET',
    centralNodeLog: 'thin only'
  });
  assert.equal(prompt.includes('SECRET'), false);
});
```

Extend `buildSystemPrompt` with optional `centralNodeFull = ''`, `governanceLogTail = ''`. Hammond blocks: instruct tools; remove “state compact lines in chat only.”

- [ ] **Step 2: chat.mjs wiring**

```js
const needsHammondTools = slug === 'hammond';
// tools += proposeCentralNodePatchSchema(), appendGovernanceLogSchema() when needsHammondTools

// After decoding central-node.md:
const centralNodeFull = needsHammondTools && decodedCentralNode != null ? decodedCentralNode : '';
// Keep existing thin centralNodeLog + constraints for everyone

// Load GOVERNANCE_LOG_PATH when needsHammondTools; recentGovernanceTail → governanceLogTail
```

**executeTools:**

```js
if (event.name === 'append_governance_log') {
  const entry = validateGovernanceLogAppendInput(event.input);
  if (!entry) return JSON.stringify({ ok: false, error: 'invalid_entry' });
  // appendGovernanceEntry; writeFile; return ok
}
if (event.name === 'propose_central_node_patch') {
  const patch = validateCentralNodePatchInput(event.input);
  if (!patch) return JSON.stringify({ ok: false, error: 'invalid_patch' });
  const risk = classifyCentralNodePatchRisk(patch);
  if (risk === 'confirm') {
    // Do NOT write. Return JSON telling model a Confirm card was queued.
    // Also signal outer loop to SSE (see below).
    return JSON.stringify({ ok: true, status: 'awaiting_confirm', summary: patch.payload.summary });
  }
  const next = applyCentralNodePatch(centralNodeMarkdown, patch);
  if (!next) return JSON.stringify({ ok: false, error: 'apply_failed' });
  await client.writeFile({ path: 'central-node.md', content: next, sha: centralNodeSha, message: `chore(cn): ${patch.payload.summary}` });
  centralNodeMarkdown = next; // only after success
  send({ type: 'central_node_patched', summary: patch.payload.summary, risk: 'auto' });
  return JSON.stringify({ ok: true, status: 'applied', summary: patch.payload.summary });
}
```

For confirm-class patches, also `send({ type: 'cn_patch_proposal', patch, risk: 'confirm' })` in the tool_call passthrough path (mirror `log_entry` → `record_proposal`). Cleanest: handle inside `executeTools` by calling `send` if available, **or** in the stream event loop when tool_call name is `propose_central_node_patch` and risk is confirm — prefer classifying in one place before write.

Pattern: in tool_call handler (alongside log_entry):

```js
if (event.name === 'propose_central_node_patch') {
  const patch = validate…;
  const risk = classify…;
  if (risk === 'confirm') {
    send({ type: 'cn_patch_proposal', patch });
  }
}
// executeTools still returns awaiting_confirm without writing
```

- [ ] **Step 3: Integration tests**

- Hammond registers both tools; Brisket does not
- Auto cross_agent append writes `central-node.md`
- Confirm-class constraints delete does **not** write; SSE includes `cn_patch_proposal` (assert via captured send events if test harness allows)
- Governance append writes `data/governance/governance-log.md`
- Hammond system prompt path uses full CN (assert anthropic request body contains This Week from fixture)

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: wire Hammond CN and governance tools in chat

Full CN prompt for Hammond; auto-apply low-risk patches and log appends.
EOF
)"
```

---

### Task 5: Confirm path for high-risk CN patches

**Files:**
- Modify: `netlify/functions/chat-confirm.mjs`
- Modify: `js/app/chat-api.js`
- Modify: `js/app/render-chat.js`
- Modify: `js/app/chat-controller.js`
- Tests: integration chat-confirm; unit render-chat / chat-controller

- [ ] **Step 1: Extend confirm API**

Accept either existing log candidate **or**:

```json
{
  "kind": "cn_patch",
  "slug": "hammond",
  "candidate": {
    "section": "constraints",
    "op": "delete_lines",
    "payload": { "match": "…", "summary": "…" }
  }
}
```

When `kind === 'cn_patch'` (default kind = log for backward compat):
1. Verify slug is hammond (or allow any authenticated — prefer hammond-only)
2. Validate patch; ensure `classifyCentralNodePatchRisk` is `confirm` (reject auto-class via confirm endpoint to avoid bypass confusion — or allow idempotent apply)
3. Load `central-node.md`, `applyCentralNodePatch`, writeFile
4. Return `{ ok, data: { path: 'central-node.md', summary } }`

- [ ] **Step 2: UI**

`appendCnPatchProposal(root, { patch })`:
- Card class `record-proposal` or `cn-patch-proposal`
- Show summary + section/op
- Confirm / Discard buttons

`chat-controller`: on `cn_patch_proposal` → append card → confirm calls `chatApi.confirm({ kind: 'cn_patch', candidate: patch, slug: 'hammond' })`.

On `central_node_patched` SSE → ephemeral status toast with summary.

- [ ] **Step 3: Tests** — confirm applies delete_lines; discard does nothing; client binder posts kind

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: confirm high-risk Hammond central node patches

Reuse chat Confirm cards for Constraint removals and section rewrites.
EOF
)"
```

---

### Task 6: Protocol + audit lock contracts

**Files:**
- Modify: `config/hammond-protocol.md`
- Modify: `netlify/functions/_shared/hammond-audit.mjs`
- Modify: `js/app/hammond-audit.js`
- Modify: `tests/unit/hammond-audit.test.js` (if contracts asserted)

- [ ] **Step 1: Update Central Node rules** in protocol — tools required after governance work; CN compact; Governance Log for reasoning; Cross-Agent via patches; drop specialist-logs-only / chat-signal-only language.

Add short “Tools” subsection listing `propose_central_node_patch` + `append_governance_log` and when to use each protocol type as `entry_type`.

- [ ] **Step 2: Lock phase text** (both audit files):

Replace:
> emit compact Central Node write-back lines … in chat. Do not invent a database write.

With:
> call `append_governance_log` for this audit’s Closed Loop / Goal Audit summary, and `propose_central_node_patch` for compact Flags / Cross-Agent / Recent Actions (and Confirm-class patches if removing Constraints or rewriting Week/Month/Trends). This ends the audit.

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: point Hammond protocols and audit lock at CN tools

Governance Log and patches replace chat-only write-back.
EOF
)"
```

---

### Task 7: Client SSE handling polish + SW + full verify

**Files:**
- Modify: `js/app/chat-controller.js` (toast for `central_node_patched` if not done)
- Modify: `service-worker.js` — bump cache; add `js/core/central-node-patch.js` / `governance-log.js` **only if** imported from browser modules (prefer keep patch/gov-log server-only via Netlify importing `js/core` — if browser never imports them, **do not** add to SHELL_FILES)
- Grep leftovers: “Do not invent a database write”, chat-only Hammond write instructions

- [ ] **Step 1: `npm test`** — all green

- [ ] **Step 2: Commit** if SW or client polish needed:

```bash
git commit -m "$(cat <<'EOF'
chore: finish Hammond governance cutover

Verify suite and bump shell cache if client assets changed.
EOF
)"
```

---

## Self-review (plan vs spec)

| Spec item | Task |
|-----------|------|
| Full CN for Hammond | Task 4 |
| Thin slice others | Task 4 |
| Patch ops + risk | Task 1 |
| Auto vs Confirm | Tasks 1, 4, 5 |
| Governance Log + Coach’s Notes | Tasks 2–4 |
| Cross-Agent Hammond→Agent | Tasks 1, 4 |
| Protocol update | Task 6 |
| Audit lock persist | Task 6 (+ 4/5) |
| No Goals DB / no agent prompt push | Explicit non-goals |
| No extra GitHub CN fetch | Task 4 (reuse decoded blob) |
| Tests | Tasks 1–5, 7 |

No TBD placeholders. Naming: `propose_central_node_patch`, `append_governance_log`, `cn_patch_proposal`, `kind: 'cn_patch'`, path `data/governance/governance-log.md`.
