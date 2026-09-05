# ECC Round 4 — Security, Verification, Enforcement & Infrastructure Audit

**Upstream:** `https://github.com/affaan-m/ecc` @ `e04ea0b9cc8248686edf5ac751cadff550e162b8` (VERSION `2.2.1`)  
**Target:** Life Hub umbrella = **all hubs and agents** (Life, Knowledge, Tasks, Teaching + shared packages / design kit / Netlify / GitHub Pages / personalities / Central Node)  
**Mode:** READ-ONLY quarry. No ECC install. No AgentShield install. No hooks install. No source/CI/rule/env changes. Report only.  
**Date:** 2026-09-05  
**Prior rounds:** `ECC_ROUND_1_SKILLS_AUDIT.md`, `ECC_ROUND_2_AGENTS_AUDIT.md`, `ECC_ROUND_3_AGENT_RUNTIME_AUDIT.md`  
**Baseline laws:** first-pass correctness + AI agent context integrity (Availability / Delivery / Interpretation / Behaviour) + Ponytail

---

## 1. Executive summary

Round 4 asked which ECC **security / verification / hook / CI / enforcement** mechanisms make Life Hub’s existing contracts harder to violate *silently* — without importing ECC’s operating system.

**Verdict:** Almost none of ECC’s security *product* belongs in Life Hub. AgentShield, GateGuard, Delivery-Gate, the hook mesh (~53 scripts), supply-chain IOC watchers, and Claude-Code config scanners are wrong harness, wrong threat model, or fail-open theatre. What survives is almost entirely **thin verification principles** already provisional from Rounds 1–3, plus a few Round 4 enforcement sharpenings:

1. **NOT_CHECKED must not become PASS** (fail-visible vocabulary).
2. **Silent-failure pattern catalogue** as first-pass / targeted static checks (not a hook farm).
3. **Omission/truncation counts** when lists or context are reduced.
4. **Delivery + Behaviour executable fixtures** for personality context (Life Hub tests — not ECC eval OS).
5. **Proof gate** for review/completion claims.
6. **Destructive / irreversible human gate** (thin ON_DEMAND, not PreToolUse freeze modes).

**ARCHITECTURAL_CHANGE_CANDIDATE remains 0.** Prior rejections (Agentic OS, CLV2, ck, knowledge-ops, PreCompact summaries, token-budget-as-integrity, agent swarm) are **reaffirmed** — no new evidence to reverse them.

**Serious current Life Hub security CVE?** None proven by static inspection. The urgent integrity class remains Round 3’s soft-fail / empty-memory / unproven Delivery–Behaviour gap — a **correctness/ACI** failure mode, not a credentials breach. Auth cookies look fail-closed on invalid credentials (401). Soft-fail `catch` density in chat/CN paths is the integrity risk to enforce against.

| Round 4 primary bucket | Count (serious surfaces) |
|------------------------|--------------------------|
| ENFORCE_NOW_CANDIDATE | 0 (audit only — none authorized to add now) |
| MINE_MECHANISM | 4 thin (R4-origin or R4-sharpened) |
| STRENGTHEN_FIRST_PASS | 3 |
| STRENGTHEN_ACI | 3 |
| TEST_CI_CANDIDATE | 3 |
| RUNTIME_INVARIANT_CANDIDATE | 2 |
| SECURITY_CANDIDATE | 1 thin ON_DEMAND |
| ON_DEMAND | 5 |
| REJECT | majority of ECC security/hooks/CI OS |

**Final deduplicated KEEP set across all four rounds:** **11** mechanisms (see §50).

**Next phase (do not start):** Cross-round consolidation and extraction design.

---

## 2. Scope reminder — Life Hub is ALL hubs and agents

| Hub / surface | Verification implication |
|---------------|--------------------------|
| Life personalities (incl. Chadwick/Sara pain path) | Delivery + Behaviour fixtures required on **named** path |
| Tasks Clare personality | Shared chat spine; not pain write path |
| Clare desk | Deterministic; no Anthropic — different contracts |
| Teaching Ann | Shared spine + CN patch capability |
| Knowledge Clementine | Divergent prompt assembly; **no** Central Node |
| Fitness confirm write | Non-LLM write; Availability seam |
| Shared packages / design kit | Click-path / dual-path still apply |
| Netlify Functions + GitHub private data | Auth/session + token boundary checks |
| Cursor first-pass + ACI + Ponytail + Matt | Existing enforcement destinations |

---

## 3. Existing Life Hub security / verification baseline

### 3.1 Correctness & ACI (instruction layer)

- **First-pass correctness** (always-on): real-path exercise; boundary validation; fidelity ladder; forbids “plausible diff = done.”
- **AI agent context integrity** (always-on): Availability / Delivery / Interpretation / Behaviour; named personality path; no silent context loss; no fake agent correctness; regression at narrowest seam.
- **Ponytail**: minimal machinery; do not delete security/test requirements for “simplicity.”
- **Matt skills / Superpowers**: diagnosing-bugs, verification-before-completion, etc. — already cover generic “verify before claim.”

### 3.2 Executable verification

- `npm test` → `node --test` unit + integration.
- `npm run validate:fixtures`.
- `npm run test:browser` (Playwright) present as script; CI path is Pages workflow `npm test` + `npm run build`.
- GitHub Actions `.github/workflows/pages.yml`: checkout → Node 22 → `npm ci --ignore-scripts` → **test** → **build** → Pages artifact → deploy.
- Netlify: functions-only deploy (`command = "true"`); secrets scan omit keys for non-secret deploy metadata.

### 3.3 Auth / secrets / data

- Umbrella session: HttpOnly / Secure / SameSite=Lax cookies; invalid credentials → 401 (`auth.mjs` / `auth-security.mjs`).
- Env contract via `.env.example` (passphrase hash, session secret, GitHub token + expiry, Anthropic key, mail, site origin) — **names only audited; values not read.**
- `.auth-secrets` gitignored; Netlify secrets scan configured with explicit omit keys (history of false-positive deploy failure).
- Private GitHub data access via function-side token (`github-client.mjs`); multiple soft `catch` paths exist (integrity, not proof of leak).

### 3.4 Gaps relative to Round 3 + Round 4 lens

| Gap | Status |
|-----|--------|
| CN blob → Anthropic `system` Delivery proof | Missing automated test |
| Chadwick/Sara Behaviour constraint fixtures | Missing |
| Soft-fail CN sync / empty-memory chat visibility | Known; not mechanically gated |
| XA trim / heading miss as fail-visible | Not marked to model/operator |
| Secret scanning in CI | Relies on platform + hygiene; no dedicated LH secret CI job |
| MCP runtime | No product MCP surface requiring AgentShield |

---

## 4. ECC security / verification inventory (pinned SHA)

### 4.1 Skills (R1 DEFER_R4 set + companions)

| Surface | Path | Executable? | Fail mode | Round 4 bucket |
|---------|------|-------------|-----------|----------------|
| security-review | `skills/security-review/SKILL.md` | Advisory checklist | N/A | ON_DEMAND thin / mostly REJECT as standing skill |
| security-scan | `skills/security-scan/SKILL.md` | Invokes AgentShield on `.claude/` | External tool | REJECT (wrong harness; Cursor not Claude project config) |
| safety-guard | `skills/safety-guard/SKILL.md` | PreToolUse freeze/careful | Hook-dependent | REJECT framework; MINE thin destructive-human-gate idea ON_DEMAND |
| gateguard | `skills/gateguard/SKILL.md` | PreToolUse deny→force→allow | High friction | REJECT (ceremony; blocks valid velocity) |
| delivery-gate | `skills/delivery-gate/SKILL.md` | Stop hook; mtime/regex | Goodhartable mtime; Claude Stop | REJECT |
| verification-loop | `skills/verification-loop/SKILL.md` | Advisory workflow | Ceremony | REJECT (R1; first-pass already stronger) |
| repo-scan | `skills/repo-scan/SKILL.md` | External install pointer | Supply-chain install risk | REJECT |
| codehealth-mcp / config-gc / cost-* / dashboard / DB / docker / k8s / uncloud / … | R1 DEFER_R4 list | Mostly wrong topology | — | REJECT |
| hookify-rules | skills | Hook generator | Hook sprawl | REJECT |
| canary-watch (R1 ON_DEMAND) | skills | Advisory post-deploy smoke | — | ON_DEMAND keep (ops tip) |
| github-ops untrusted CI/issue text | skills | Advisory | — | ON_DEMAND thin (prompt hygiene) |
| opensource-pipeline sanitizer | skills | Advisory | — | ON_DEMAND if public extract ever |

### 4.2 Agents

| Surface | Path | Bucket |
|---------|------|--------|
| security-reviewer | `agents/security-reviewer.md` | ON_DEMAND checklist overlap; REJECT as installed agent |
| silent-failure-hunter | `agents/silent-failure-hunter.md` | **MINE_MECHANISM** (pattern catalogue) → STRENGTHEN_FIRST_PASS / TEST |
| opensource-sanitizer | `agents/opensource-sanitizer.md` | ON_DEMAND if publishing |
| code-reviewer proof gate | (R2) | KEEP — STRENGTHEN completion/review claims |

### 4.3 Hooks (`scripts/hooks/`, ~53 files) + `hooks/hooks.json`

| Hook | Actual behaviour | Fail-open? | Bucket |
|------|------------------|------------|--------|
| `block-no-verify.js` | Blocks `git … --no-verify` / hooksPath bypass (exit 2) | Fail-closed on detect | ON_DEMAND / low value for LH (no mandatory local hooks CI) |
| `config-protection.js` | Blocks edits to eslint/prettier configs | Fail-closed; careful on truncated stdin | REJECT as standing (occasional valid config edits) |
| `quality-gate.js` | Post-edit format check | **No-op / soft unless STRICT** | REJECT (fail-open default) |
| `gateguard-fact-force.js` | Forces investigation facts before edit | High false friction | REJECT |
| `session-start.js` | Injects prior session summary; truncation marker | exit 0 on errors; injects distilled context | REJECT injection; **MINE** truncation-marker idea only |
| `suggest-compact.js` | Suggests compact | **Silent disable** on transcript failure | REJECT (anti-pattern) |
| `pre-compact.js` | LLM summary before compact | Fail-open log; pseudo-facts | REJECT (R3) |
| `ecc-context-monitor.js` | Warns on identical tool+params ×5 | Advisory warning | ON_DEMAND thin tool-loop idea; REJECT hook mesh |
| `insaits-security-*.py/js` | External security monitor | Claude/ECC bound | REJECT |
| observe-runner / CLV2 | Learning observations | — | REJECT (R3) |

**Default preference confirmed:** deterministic test/invariant > CI gate > thin rule > ON_DEMAND procedure > hook > framework.

### 4.4 CI / supply chain (ECC `.github/workflows/`)

| Workflow | Useful idea? | Bucket |
|----------|--------------|--------|
| `reusable-validate.yml` | Validate agents/hooks/skills manifests | REJECT (ECC self-meta) |
| `supply-chain-watch.yml` | `npm audit`, signatures, IOC scanner, workflow hardening | ON_DEMAND ops inspiration only; **not** copy IOC farm into LH |
| `ci.yml` / release / SLSA | ECC release engineering | REJECT |
| Dependabot | Standard | LH may already use platform defaults — no ECC import |

### 4.5 AgentShield

Documented as `ecc-agentshield` / `npx ecc-agentshield scan` over **Claude Code `.claude/`** configs, MCP json, hooks, agent md.  
**Life Hub:** Cursor rules + Netlify product agents — **not** that config tree.  
**Bucket:** REJECT install. Optional future ON_DEMAND only if LH ever ships a Claude Code plugin surface (not current).

### 4.6 Docs

`SECURITY.md` — disclosure policy for ECC packages (out of scope).  
`the-security-guide.md` — agentic threat essay (prompt injection, MCP, lethal trifecta). Useful as **reading**, not as installed machinery. Thin takeaway already overlaps ACI: **untrusted retrieved content ≠ instructions**.

---

## 5. Round 1 / 2 / 3 handoff reconciliation

### 5.1 Round 1 DEFER_R4 (24) — reconciled

| Handoff | Final |
|---------|-------|
| security-review | ON_DEMAND thin checklist if touching auth/input; else REJECT standing |
| security-scan + AgentShield | **REJECT** |
| safety-guard | REJECT hooks; **MERGE** destructive caution into human-gate ON_DEMAND |
| gateguard / hookify-rules / delivery-gate companions | **REJECT** |
| repo-scan / codehealth-mcp / config-gc | **REJECT** |
| cost-tracking / ecc-tools-cost-audit / dashboard-builder | **REJECT** |
| database-migrations / mysql/postgres/prisma/redis patterns | **REJECT** (wrong stack; django two-phase already R2 ON_DEMAND if schema appears) |
| deployment-patterns / docker / kubernetes / uncloud / flox | **REJECT** (Pages+Netlify topology) |
| latency-critical-systems / enterprise-agent-ops | **REJECT** |
| security-bounty-hunter | **REJECT** standing; ON_DEMAND only if Adam asks for hunt |

### 5.2 Round 2 DEFER_R4 + security triggers

| Handoff | Final |
|---------|-------|
| opensource-sanitizer | ON_DEMAND if public extract |
| automation-audit-ops / hermes-imports / unified-notifications-ops | **REJECT** for LH product |
| security-reviewer agent | REJECT agent; checklist ON_DEMAND |
| silent-failure-hunter | **KEEP → MINE** (catalogue) |
| orch size-tier + human gates | **KEEP thin ON_DEMAND**; REJECT agent map |

### 5.3 Round 3 DEFER_R4

| Handoff | Final |
|---------|-------|
| eval-harness / harness-optimizer / agent-eval family | **REJECT** product OS; Behaviour fixtures stay as **TEST_CI_CANDIDATE** without ECC harness |
| cost-aware-llm-pipeline | **REJECT** for integrity; ops later if spend hurts |
| autonomous-loops / loop-operator | **REJECT** |
| Goodhart / truncation / admission / tool-loop | **KEEP** as below |

**No deferred item becomes ENFORCE_NOW in this audit.** Implementation waits for consolidation approval.

---

## 6. Security findings

1. **AgentShield / Claude config scanning** does not map to Life Hub’s Cursor+Netlify agent surface → REJECT.
2. **GateGuard / Delivery-Gate / Stop hooks** are Claude Code lifecycle products → REJECT; also Goodhart and friction risks.
3. **Hook mesh** often **fail-open** (quality-gate soft; suggest-compact silent disable; session-start exit 0) — antithetical to Round 4’s “NOT_CHECKED ≠ PASS.”
4. **Prompt-injection / untrusted content** essay aligns with ACI; Life Hub’s real exposure is retrieved CN/diary/tool text and Knowledge archive content — enforce via ACI Interpretation rules + tests, not MCP Top-10 theatre.
5. **No product MCP runtime** found requiring ECC MCP security pack → classify MCP security as **N/A / REJECT** for current umbrella.

---

## 7. Secret-handling findings

| ECC offer | LH gap? | Decision |
|-----------|---------|----------|
| Hardcoded-secret checklist (security-review) | Hygiene already expected; Pages/Netlify platform scans | ON_DEMAND reminder when adding env; no new scanner OS |
| AgentShield secret patterns in CLAUDE.md | Wrong files | REJECT |
| opensource-sanitizer | Only if publishing private→public | ON_DEMAND |

**Do not print secrets. NOT RUN:** live secret exfiltration tests, credential rotation, production probing.

---

## 8. Auth / session findings

Static read: invalid passphrase → 401; session cookies Secure/HttpOnly/SameSite=Lax; structured token with exp/jti checks in `auth-security.mjs`.  
**No serious fail-open auth bug proven** in this audit.  
Soft `catch` on body cancel paths are transport cleanup, not auth bypass.  
**ECC contribution:** none beyond generic “fail securely” slogans already implied by first-pass + security checklist ON_DEMAND.

---

## 9. Private-data boundary findings

Life Hub private data flows through Netlify functions + GitHub token. Soft-fail on GitHub reads can yield **empty context with fluent chat** (R3) — **integrity**, not necessarily unauthorized disclosure.  
ECC does not supply a better boundary contract than: **fail-visible when private fetch fails** + Delivery tests.  
**REJECT** ECC enterprise agent-ops as a substitute.

---

## 10. Prompt / agent configuration security

| Risk | LH reality | ECC | Decision |
|------|------------|-----|----------|
| Malicious CLAUDE.md / hooks | Cursor rules committed; no ECC hook runner | AgentShield | REJECT tool; keep review of rule PRs via humans |
| Retrieved content as instructions | CN / archive / tools | Security guide | STRENGTHEN_ACI (already R1 user>agent; R3 XA untrusted) |
| Agent handoff assertions as authority | XA lines | — | KEEP admission posture |
| Prompt leakage in logs | Possible if logging system prompts | Checklist | ON_DEMAND; no ECC logger |

---

## 11. MCP findings

**Current applicable MCP product surface:** not found for Life Hub runtime.  
**ECC MCP security / mcp-health-check hooks:** REJECT for now.  
If MCP is added later, re-evaluate then — do not pre-install.

---

## 12. Dependency / supply-chain findings

ECC `supply-chain-watch` (audit signatures, IOC scripts, workflow hardening) is serious **for ECC’s own npm/plugin distribution**. Life Hub is an application repo on Pages+Netlify with `npm ci --ignore-scripts` already.  
**Decision:** REJECT copying IOC farm. Optional ON_DEMAND: run `npm audit` when upgrading deps. Do not add scanner count for theatre.

---

## 13. Silent-failure enforcement findings

**Best ECC mechanism in Round 4:** `agents/silent-failure-hunter.md` pattern list:

- empty `catch`
- `.catch(() => [])` / `{}` / `''`
- defaults that hide failure
- log-and-forget
- lost stacks

**Life Hub mapping:** chat outer catch clearing CN; protocol `catch → ''`; persist CN soft-fail; Knowledge sometimes fail-visible (better).

**Enforcement seam (preferred):**  
1) first-pass bullet (R2 KEEP),  
2) narrow regression tests on known soft-fail seams,  
3) optional low-noise `rg` in CI on **allowlisted paths** (`netlify/functions/chat.mjs`, persist-log, load-*-protocol) — not repo-wide empty-catch ban (false positives).

**Bucket:** STRENGTHEN_FIRST_PASS + TEST_CI_CANDIDATE.  
**REJECT:** silent-failure-hunter as always-on agent; REJECT hooks that “fix” swallows by rewriting mid-session.

---

## 14. Fail-open / fail-visible findings

| Principle | Source | Keep? |
|-----------|--------|-------|
| NOT_CHECKED / INCONCLUSIVE ≠ PASS | R1 browser-qa + R4 synthesis | **YES** — STRENGTHEN_FIRST_PASS |
| Truncation marker when context cut | session-start.js | **YES** thin — STRENGTHEN_ACI |
| suggest-compact silent disable | hooks | **Anti-pattern REJECT** |
| quality-gate soft default | hooks | **Anti-pattern REJECT** |
| delivery-gate mtime PASS | skills | **Anti-pattern REJECT** |

Preferred vocabulary for future gates (do not implement enum now): **PASS / FAIL / INCONCLUSIVE / NOT_RUN**.

---

## 15. Truncation-integrity findings

Need to distinguish “12 items is complete” vs “20 existed, 12 kept.”  
ECC does not ship a clean reusable library for this — only session truncation markers and XA-like pressure elsewhere.  
**Mine:** when reducing CN XA / digests / tool payloads, attach `{kept, omitted, reason}` or a visible marker into assembled context or test assertions.  
**Bucket:** RUNTIME_INVARIANT_CANDIDATE + STRENGTHEN_ACI.  
**REJECT:** token-budget advisors as integrity.

---

## 16. Context-delivery verification findings

ECC eval-harness / verification-loop do **not** beat a **deterministic request-builder test**:

> fixture Central Node blob with `Chadwick→Sara` pain line → assemble Chadwick system → assert Delivery.

Also: Clare/Knowledge path must **not** be used as proxy.  
**Bucket:** TEST_CI_CANDIDATE (primary ACI enforcement).  
**REJECT:** ECC eval OS, model graders as release gates, iterative-retrieval theatre.

---

## 17. Behaviour-verification findings

Goodhart-aware fixtures (R3): must / must-not; negative control; no catchphrase requirement.  
ECC loop-design-check supplies vocabulary; eval-harness “prefer code graders” is weak support.  
**Bucket:** TEST_CI_CANDIDATE + STRENGTHEN_ACI.  
**REJECT:** LLM-as-judge pipelines; pass@k chasing.

---

## 18. Goodhart-resistant verification findings

**KEEP** loop-design-check set: decidable done; must-NOT; independent check; external reconcile; human last switch for irreversible ops.  
Merge into Must/Must-not/Verify rather than separate skill.  
**REJECT** delivery-gate learning mtime; REJECT confidence↑ on silence (CLV2).

---

## 19. Tool-loop findings

`ecc-context-monitor.js`: identical tool+params for last 5 → warning. Deterministic-ish; Claude-hook bound; advisory.  
**Is it a current LH product problem?** Not evidenced in personality Netlify tools the way coding agents loop.  
**Bucket:** ON_DEMAND for Cursor coding sessions if loop pain appears; REJECT installing ECC monitor.  
If ever needed: detect in application tool runner, not ECC hooks.

---

## 20. Human-gate findings

Useful for: destructive data ops, irreversible migrations, auth/security changes, production deploy config, bulk memory mutation, broad architecture.  
**Not** for routine coding.  
Sources: orch size-tier (R2), safety-guard careful mode (R4), Goodhart human last switch (R3).  
**MERGE** into one thin ON_DEMAND “irreversible → human confirm” note.  
**REJECT** freeze-mode PreToolUse OS.

---

## 21. CI findings

| Candidate | Catch? | Cost | FP risk | Decision |
|-----------|--------|------|---------|----------|
| Existing `npm test` + build | Regressions | Already paid | Low | KEEP baseline |
| Delivery unit test (CN→system) | Silent Delivery loss | Low | Low | TEST_CI_CANDIDATE |
| Soft-fail allowlisted rg | Empty-memory merges | Low | Medium if unscoped | TEST_CI thin / first-pass |
| Browser E2E always in Pages CI | UI breaks | Higher | Flakes | Optional later; honesty rule KEEP |
| ECC supply-chain IOC | ECC package threats | High noise | High | REJECT |
| AgentShield in CI | N/A surface | — | — | REJECT |
| Secret scanner job | Accidental commits | Medium | Medium | ON_DEMAND / platform; not ECC |

Every gate must support NOT_RUN/INCONCLUSIVE rather than silent PASS.

---

## 22. Deployment-verification findings

canary-watch post-deploy smoke (R1 ON_DEMAND): useful tip after Netlify/Pages deploy — HTTP check expected functions/routes.  
**REJECT** ECC deployment-patterns encyclopedias.  
**NOT RUN:** live production canaries in this audit.

---

## 23. Environment-validation findings

Check existence/shape of required env — do not log values. LH already fails some paths without keys; ECC adds no unique enforceable module worth importing.  
**Bucket:** REJECT ECC env kits (flox/uncloud). Optional first-pass reminder when adding functions that need env.

---

## 24. Hook findings (summary)

| Verdict | Detail |
|---------|--------|
| REJECT standing ECC hook framework | Wrong harness; fail-open patterns; hidden behaviour |
| MINE markers only | Truncation visible; NOT_CHECKED≠PASS |
| block-no-verify | Marginal; LH has no mandatory git hook CI |
| Prefer tests/CI/rules | Explicit over automatic |

---

## 25. Runtime-invariant candidates

1. **Fail-visible private-fetch / CN load failure** — do not clear memory and continue as success without marker (product choice: hard fail vs marker).  
2. **Truncation/omission metadata** on XA trim and similar reducers.

---

## 26. Test / CI candidates

1. Chadwick Delivery: blob → `system` substring.  
2. Sara Delivery sibling.  
3. Behaviour must/must-not with negative control.  
4. Optional allowlisted silent-catch lint on chat/persist/protocol loaders.  
5. Personality-path isolation test note: Clare ≠ Chadwick ≠ Clementine.

---

## 27. Security candidates

1. ON_DEMAND security checklist when touching auth/session/token boundaries.  
2. ON_DEMAND untrusted-content≠instructions when wiring retrieval.  
3. REJECT AgentShield/GateGuard/hook security mesh.

---

## 28. First-pass correctness additions (thin)

1. Silent-failure catalogue (R2+R4).  
2. NOT_CHECKED / INCONCLUSIVE ≠ PASS (R1+R4).  
3. Dual-path parity (R1).  
4. Click-path `{sets,resets}` + sequential undo (R1).  
5. Must/Must-not/Verify + Goodhart must-NOT (R1–R3 merge).  
6. Proof gate for completion/review claims (R2).

---

## 29. ACI additions (thin)

1. Pseudo-facts; digests derived; user>agent (R1).  
2. Admission posture create/untrusted (R3 thin).  
3. Fail-visible truncation/omission (R3+R4).  
4. Delivery + Behaviour proof requirements with Goodhart antibodies (R3+R4).  
5. Personality-path isolation (R3).

---

## 30. Rejected ECC infrastructure (aggressive)

AgentShield; GateGuard; Delivery-Gate; verification-loop as process OS; full hooks mesh; pre-compact LLM summaries; suggest-compact fail-open; quality-gate soft PASS; CLV2/observe-runner; Agentic OS; ck; knowledge-ops; context/token budget as integrity; iterative-retrieval theatre; supply-chain IOC farm; reusable ECC manifest validators; docker/k8s/uncloud/flox; repo-scan external installer; cost dashboards; enterprise-agent-ops; MCP security pack (no surface); security-scan skill; hookify-rules; config-protection as always-on; gateguard-fact-force; insaits monitors; eval-harness product; harness-optimizer; autonomous loop operators.

**Prior architectural rejections: REAFFIRMED.** No new evidence to reopen.

---

## 31. Full cross-round candidate reassessment

| Provisional candidate | Origin | Final status |
|----------------------|--------|--------------|
| Click-path `{sets,resets}` + sequential undo | R1 | **FINAL KEEP** |
| Pseudo-facts + user>agent | R1 | **FINAL KEEP** |
| Dual/multi-path parity | R1 | **FINAL KEEP** |
| No baseline ⇒ INCONCLUSIVE | R1 | **FINAL KEEP** (merge honesty vocab with NOT_CHECKED≠PASS) |
| Must / Must-not / Verify | R1 | **FINAL KEEP** |
| Product constraints/non-goals | R2 | **MERGE INTO** Must/Must-not/Verify |
| Goodhart antibodies | R2/R3 | **MERGE INTO** Must/Must-not/Verify + Behaviour fixtures |
| Proof / anti-noise gate | R2 | **FINAL KEEP** |
| Silent-failure catalogue | R2 | **FINAL KEEP** (R4 sharpened) |
| Santa both-must-pass | R2 | **ON_DEMAND** |
| Size-tier + human gates | R2 | **ON_DEMAND** (merge with destructive human-gate) |
| Fail-visible truncation | R3 | **FINAL KEEP** |
| Thin memory admission posture | R3 | **FINAL KEEP** |
| Behavioural constraint fixtures | R3 | **FINAL KEEP** |
| Tool-loop monitor | R3 | **ON_DEMAND** (downgrade — not proven LH pain) |
| Delivery blob→system tests | R3 gap / R4 | **FINAL KEEP** (TEST) |
| Destructive human gate | R4 | **MERGE INTO** ON_DEMAND human-gate |
| AgentShield / GateGuard / hooks OS | R4 | **REJECT** |
| ECC CI IOC / manifest validators | R4 | **REJECT** |
| verification-loop skill | R1/R4 | **REJECT** / superseded by first-pass |
| canary-watch | R1 | **ON_DEMAND** |
| opensource-sanitizer | R2 | **ON_DEMAND** |

---

## 32. Deduplicated final candidate set

Eleven **FINAL KEEP** (standing intent for consolidation — **not implemented**):

1. Click-path `{sets,resets}` + sequential undo  
2. Pseudo-facts + digest-derived + user corrections > agent assertions  
3. Dual/multi-path contract parity  
4. Evidence honesty: no baseline / not-run ⇒ INCONCLUSIVE (never silent PASS)  
5. Must / Must-not / Verify **including** Goodhart antibodies + product non-goals  
6. Proof / anti-noise gate for findings & completion claims  
7. Silent-failure catalogue (soft-fail / empty catch / hide-failure defaults)  
8. Fail-visible truncation / omission counts  
9. Thin memory admission posture (untrusted recall; no auto transcript→truth)  
10. Delivery proof tests (named personality; CN→final system)  
11. Behaviour constraint fixtures (must/must-not; negative controls; Chadwick/Sara class)

**ON_DEMAND (not standing):** Santa isolation; irreversible human-gate / size-tier; post-deploy canary tip; public-extract sanitizer; security checklist when touching auth; tool-loop watch if coding agent loops appear; github-ops untrusted-text hygiene.

---

## 33. Proposed destination for each final candidate

| # | Candidate | Likely destination |
|---|-----------|-------------------|
| 1 | Click-path | first-pass + diagnosing-bugs UI branch |
| 2 | Pseudo-facts / user>agent | ACI |
| 3 | Dual-path parity | first-pass + tests |
| 4 | INCONCLUSIVE / NOT_RUN honesty | first-pass |
| 5 | Must/Must-not/Verify + Goodhart | first-pass + ACI Behaviour section |
| 6 | Proof gate | Matt code-review overlay / first-pass completion claims |
| 7 | Silent-failure catalogue | first-pass + allowlisted tests/CI |
| 8 | Truncation/omission visible | ACI + runtime reducer invariant |
| 9 | Admission posture | ACI Admission |
| 10 | Delivery proof tests | `node:test` unit on request builder |
| 11 | Behaviour fixtures | tests (integration/unit with fixtures); not LLM judge OS |

---

## 34. Minimum final Life Hub system

After four rounds, the smallest coherent system is:

**A. Two standing Cursor laws (already exist), each thickened by ≤ ~20–30 lines total when approved:**

- First-pass: click-path; dual-path; silent-fail catalogue; evidence honesty; Must/Must-not/Verify; proof-for-claims.  
- ACI: pseudo-facts; admission; truncation visible; Delivery+Behaviour proof obligations; personality-path isolation; Goodhart Behaviour language.

**B. A handful of executable tests (Life Hub code):**

- Delivery (Chadwick ± Sara)  
- Behaviour must/must-not  
- Optional allowlisted soft-fail regressions  

**C. ON_DEMAND procedures only when the task matches** (Santa, irreversible gates, canary, sanitizer, auth checklist).

**D. Zero ECC installs:** no hooks framework, no AgentShield, no memory OS, no agent swarm, no eval OS.

That is the quarry yield — not Life Hub + ECC.

---

## 35. Cross-round candidate ledger (final)

| Mechanism | Rounds | Final | Destination |
|-----------|--------|-------|-------------|
| `{sets,resets}` + sequential undo | R1 | FINAL KEEP | first-pass / diagnosing-bugs |
| Pseudo-facts; user>agent | R1–R3 | FINAL KEEP | ACI |
| Dual-path parity | R1 | FINAL KEEP | first-pass / tests |
| No baseline ⇒ INCONCLUSIVE; NOT_RUN≠PASS | R1+R4 | FINAL KEEP | first-pass |
| Must/Must-not/Verify + constraints + Goodhart | R1–R3 | FINAL KEEP (merged) | first-pass + ACI |
| Proof / anti-noise | R2 | FINAL KEEP | Matt / first-pass |
| Silent-failure catalogue | R2+R4 | FINAL KEEP | first-pass / tests |
| Truncation/omission visible | R3+R4 | FINAL KEEP | ACI / runtime |
| Admission posture thin | R3 | FINAL KEEP | ACI |
| Delivery blob→system tests | R3–R4 | FINAL KEEP | tests |
| Behaviour fixtures | R3–R4 | FINAL KEEP | tests |
| Santa both-must-pass | R2 | ON_DEMAND | procedure |
| Human gate irreversible / size-tier | R2+R4 | ON_DEMAND | procedure |
| Tool-loop monitor | R3+R4 | ON_DEMAND | coding only if needed |
| canary-watch | R1 | ON_DEMAND | ops |
| opensource-sanitizer | R2 | ON_DEMAND | publish |
| AgentShield / GateGuard / hooks / CLV2 / Agentic OS / ck / PreCompact / token-budget integrity / eval OS / IOC CI | R1–R4 | REJECT | — |

---

## 36. Challenge pass (survivors)

| Candidate | Challenge result |
|-----------|------------------|
| Click-path | Unique; not covered by React hook nits — KEEP |
| Pseudo-facts / user>agent | Still best ACI gap — KEEP |
| Dual-path | Still needed (Clare≠Chadwick; Pages≠Functions) — KEEP |
| INCONCLUSIVE honesty | Prevents fake PASS — KEEP |
| Merged Must/Goodhart | Deduped; Ponytail-acceptable if thin — KEEP |
| Proof gate | Stops speculative review noise — KEEP |
| Silent-failure catalogue | Directly maps R3 seams; scope allowlists to control FP — KEEP |
| Truncation visible | Cheap; high ACI value — KEEP |
| Admission posture | Concept only; no vault — KEEP |
| Delivery/Behaviour tests | Highest leverage enforcement; deterministic preferred — KEEP |
| Tool-loop standing | Downgraded ON_DEMAND — not proven product pain |
| AgentShield etc. | Fail challenge (wrong surface / theatre) — REJECT |

Ponytail would reject any expansion into hook OS, eval harness product, or second memory system — those stay REJECT.

---

## 37. Proposed next phase

**Cross-round consolidation and extraction design.**

That phase should:

1. Freeze the 11 FINAL KEEP + ON_DEMAND list.  
2. Draft the smallest rule/test diffs (still for approval).  
3. Sequence implementation behind Adam’s explicit go-ahead.  
4. Re-read Ponytail; delete restatements.

**Do not begin that phase in this Round 4 response.**

---

## 50. Final candidate table

| Final Candidate | Origin | Mechanism | Failure Prevented | Final Status | Likely Destination | Deterministic? | Implementation Cost | Why Keep |
|-----------------|--------|-----------|-------------------|--------------|--------------------|----------------|---------------------|----------|
| Click-path `{sets,resets}` + undo | R1 | Side-effect map + ordered cancellation | UI controls that partially apply / fail to undo | FINAL KEEP | first-pass / diagnosing-bugs | Yes (audit procedure) | Low | Unique first-pass UI bug class |
| Pseudo-facts + user>agent | R1–R3 | Provenance/admission language | Digests/agent claims overriding user truth | FINAL KEEP | ACI | Policy + tests | Low | Strongest ACI conceptual gap |
| Dual/multi-path parity | R1 | Same contract on all live paths | Clare/Knowledge/proxy tests masking Chadwick loss | FINAL KEEP | first-pass / tests | Yes | Low–med | Personality-path isolation |
| Evidence honesty INCONCLUSIVE/NOT_RUN | R1+R4 | Vocabulary for missing evidence | Silent PASS when unchecked | FINAL KEEP | first-pass | Yes | Trivial | Blocks verification theatre |
| Must/Must-not/Verify + Goodhart | R1–R3 | Decidable done + must-NOT + independent check | Gamed “done” / phrase-only Behaviour tests | FINAL KEEP | first-pass + ACI Behaviour | Prefer deterministic judges | Low | Merges three overlapping mines |
| Proof / anti-noise gate | R2 | Findings need evidence; zero findings valid | Speculative review / fake completion | FINAL KEEP | Matt overlay / first-pass | Mostly | Low | Stops noise & false done |
| Silent-failure catalogue | R2+R4 | Greppable swallow patterns + soft-fail awareness | Empty memory / soft-fail CN fluent success | FINAL KEEP | first-pass / allowlisted tests | Yes | Low | Maps to known LH seams |
| Fail-visible truncation/omission | R3+R4 | kept/omitted/reason or marker | Trimmed XA looking complete | FINAL KEEP | ACI / runtime invariant | Yes | Low | Integrity of reduced context |
| Thin admission posture | R3 | Untrusted recall; no auto transcript truth | Agent monologue becoming memory | FINAL KEEP | ACI Admission | Policy | Trivial | Without importing vault OS |
| Delivery proof tests | R3–R4 | Fixture blob → final `system` | Pain flag missing from model request | FINAL KEEP | node:test | Yes | Low–med | Closes canonical ACI gap |
| Behaviour constraint fixtures | R3–R4 | must/must-not + negative control | Delivery without Behaviour change | FINAL KEEP | tests | Prefer deterministic | Med | Closes Behaviour gap |

### Rejected / superseded (do not disappear silently)

| Item | Origin | Fate | Why |
|------|--------|------|-----|
| AgentShield / security-scan | R1/R4 | REJECT | Wrong harness (Claude `.claude/`) |
| GateGuard | R1/R4 | REJECT | Friction ceremony |
| Delivery-Gate | R1/R4 | REJECT | mtime Goodhart; Claude Stop |
| verification-loop skill | R1 | REJECT / superseded | First-pass already stronger |
| ECC hooks mesh | R4 | REJECT | Fail-open + wrong harness |
| PreCompact LLM summaries | R3 | REJECT | Pseudo-facts |
| CLV2 / Agentic OS / ck / knowledge-ops | R1–R3 | REJECT | Architecture / integrity hazards |
| Token/context budget as integrity | R1–R3 | REJECT | Not Delivery proof |
| Eval-harness product / harness-optimizer | R3–R4 | REJECT | Use thin LH tests instead |
| Supply-chain IOC CI copy | R4 | REJECT | Noise; ECC-specific |
| Product-capability as separate skill | R2 | SUPERSEDED | Merged into Must/Must-not/Verify |
| Tool-loop as standing KEEP | R3 | DOWNGRADE | ON_DEMAND only |
| Safety-guard freeze OS | R4 | SUPERSEDED | Thin human-gate ON_DEMAND |
| Orch agent map | R2 | REJECT | Keep size-tier human-gate only |
| Santa | R2 | ON_DEMAND | Not standing |

---

## 51. Audit hygiene

- No branch / commit / push / PR / merge  
- No ECC / AgentShield / hooks / MCP install  
- No modifications to application source, tests, CI, Cursor rules, Ponytail, Matt skills, ACI, Netlify, env, auth, deploy, or life-hub-data  
- Only new untracked file intended: `ECC_ROUND_4_SECURITY_VERIFICATION_AUDIT.md` (+ prior R1–R3 audit markdown)

**Round 4 is complete. There is no Round 5 ECC audit.**

Report path: `ECC_ROUND_4_SECURITY_VERIFICATION_AUDIT.md`
