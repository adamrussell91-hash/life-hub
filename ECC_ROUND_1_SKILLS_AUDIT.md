# ECC Round 1 — Skills Audit

**Status:** Audit only. No ECC skills installed, vendored, activated, or adapted. No Life Hub source, rules, skills, config, or dependencies were modified except this report file.

**Governing question:** Which tiny subset of ECC gives Life Hub capabilities it does not already have, and what is the smallest way to capture that value without importing another development operating system?

---

## Executive summary

| Field | Value |
|---|---|
| Upstream | https://github.com/affaan-m/ecc |
| Audited commit SHA | `e04ea0b9cc8248686edf5ac751cadff550e162b8` |
| Commit date | 2026-09-03 16:51:15 -0400 |
| Upstream version (`VERSION` / package) | **2.2.1** (`ecc-universal`) |
| Audit date | 2026-09-05 |
| Canonical skills directory | `skills/` (each child dir with `SKILL.md`) |
| Exact skills discovered & audited | **286** |
| README marketing count (not used as authority) | “284” in tree diagram; live inventory is 286 |
| Also present (not counted as separate Round 1 skills) | `.agents/skills/` Codex subset mirrors; `agents/*.md` specialist agents → Round 2; `hooks/`, `commands/` → Round 4/2 |

### Bucket counts

| Bucket | Count |
|---|---:|
| EXTRACT_NOW | 0 |
| MINE_MECHANISM | 5 |
| ON_DEMAND | 12 |
| DEFER_R2 | 38 |
| DEFER_R3 | 15 |
| DEFER_R4 | 24 |
| REJECT | 192 |
| **Total** | **286** |

### Headline recommendations

- **Full-skill EXTRACT NOW:** **0**. Nothing survived the bar for importing a whole ECC `SKILL.md` as persistent Life Hub instruction.
- **Mechanisms to mine later (after approval):** **5** — all as short additions to existing Life Hub rules/skills, not as new always-on ECC skills.
- **Strongest finding (first-pass correctness):** `skills/click-path-audit/SKILL.md` — store side-effect map `{sets, resets}` + ordered handler trace for Sequential Undo / Async Race / useEffect Interference so final UI state matches the control’s promise.
- **Strongest finding (AI agent context integrity):** `skills/agent-architecture-audit/SKILL.md` — treat distillation/digests as pseudo-fact risk; memory admission must prefer user corrections over agent assertions (ACI today guards silent *loss*, not compressed artifacts re-entering as authority).
- **Strongest rejection reasons:** wrong-stack encyclopedias; ECC framework/OS glue; duplicate of Ponytail / first-pass / Matt / Superpowers; Claude Code hooks+commands dependency chains; autonomy/orchestration theatre; design-kit conflicts.

### Challenge pass outcome

Second critical pass downgraded:

- `inherit-legacy-style` MINE → **REJECT** (writes `.ai-style-rules.md` + optional PreToolUse hooks; design-kit + Ponytail/first-pass “inspect before inventing” already cover the useful sniff).
- `regex-vs-llm-structured-text` MINE → **ON_DEMAND** (rare parser decision tree; not standing instruction).
- Confirmed **zero EXTRACT NOW** after asking whether ordinary Cursor / existing skills already cover 80% of each candidate.

---

## Existing Life Hub baseline

Evaluated against **adamrussell91-hash/life-hub** (live umbrella). `life-hub-data` is private data only. Authority: Adam’s request → Ponytail/guardrails → design kit → `docs/consolidation/plan.md` → first-pass correctness → agent-context integrity → five Matt skills.

Baseline content was read from `origin/main` where the Cloud snapshot was stale (guardrails and Matt skills are on main but were missing from the boot checkout).

### Always-on rules

| Rule | Role |
|---|---|
| `.cursor/rules/ponytail.mdc` | YAGNI ladder, reuse-first, root-cause fixes, no unrequested abstractions |
| `.cursor/rules/ponytail-project-guardrails.mdc` | Simplicity must not delete product/security/design/test requirements |
| `.cursor/rules/life-hub-umbrella.mdc` | Umbrella architecture; consolidation plan outranks folded-app leftovers |
| `.cursor/rules/first-pass-correctness.mdc` | Prove observable outcomes on the real path; ban “should work”; fidelity ladder; first failure → `diagnosing-bugs` |
| `.cursor/rules/agent-context-integrity.mdc` | Trace source→…→model behaviour; Availability/Delivery/Interpretation/Behaviour; personality paths; precedence; continuity |
| `.cursor/rules/life-hub-skills.mdc` | Activation authority for the five Matt skills |

### Selected Matt Pocock skills (pinned `3cca18b…`, plugin 1.2.3)

| Skill | Activation |
|---|---|
| `diagnosing-bugs` | Task-matched; Life Hub debug procedure (not Superpowers systematic-debugging in parallel) |
| `tdd` | Explicit only |
| `code-review` | Explicit only |
| `codebase-design` | Explicit only |
| `grilling` | Explicit only |

### Superpowers (plugin-level, already available)

Includes `verification-before-completion` (evidence before claims), `systematic-debugging`, `test-driven-development`, `brainstorming`, `writing-plans`, `requesting-code-review`, worktrees, parallel agents, etc. Life Hub deliberately does not install a second debugging OS beside `diagnosing-bugs`.

### Engineering systems

- **Stack:** vanilla JS / Vite SPAs (`apps/teaching|knowledge|tasks`), Netlify Functions, GitHub Pages, `life-hub-data` behind scoped token, design-kit locked UI.
- **Tests:** root `node:test` unit/integration; Playwright browser suite; fixture validation; app-level unit trees under Tasks.
- **CI:** `.github/workflows/pages.yml` — `npm test` + `npm run build` + Pages deploy.
- **Deploy:** Pages for site; API on Netlify (`netlify.toml`).
- **Skill discovery:** `.cursor/skills/` + `life-hub-skills.mdc` activation policy; Cursor plugin skills separate.

### What this means for ECC scoring

A skill adds value only if it contributes a mechanism Life Hub lacks. Generic TDD, review, “search first”, build/lint/test gates, Playwright cookbooks, and agent self-scorecards are already covered — often more specifically than ECC.

---

## Score legend

Scores 0–5. Higher is better for all axes, including H/I/J/K (instruction cost, duplication distinctness, overengineering risk, behavioural risk).

| Axis | Meaning |
|---|---|
| A | Life Hub usefulness |
| B | Expected frequency |
| C | Unique added value vs baseline |
| D | First-pass correctness impact |
| E | AI-agent correctness impact |
| F | Standalone extractability |
| G | Compatibility with LH stack/Cursor |
| H | Instruction cost (5 = cheap) |
| I | Duplication risk (5 = distinct) |
| J | Overengineering risk (5 = low risk) |
| K | Behavioural risk (5 = low risk) |
| L | Maintainability |

Scores for REJECT rows are abbreviated heuristics unless the skill was deep-read; deep-read skills carry card-derived scores.

---

## Complete inventory

Every skill under `skills/*/SKILL.md` at `e04ea0b` (286 total). Paths are relative to the ECC repo root.

| Skill | Purpose | Key deps | Nearest overlap | Scores A–L | Bucket | Rationale |
|---|---|---|---|---|---|---|
| `accessibility` | Design, implement, and audit inclusive digital products using WCAG 2.2 Level AA. Use when building or auditing UI tha... | standalone-ish | design-kit a11y expectations | `3/2/3/3/1/4/4/3/3/4/4/4` | ON_DEMAND | WCAG 2.2 POUR checklist is stack-agnostic enough for vanilla SPAs; pull when auditing keyboard/contrast/SR, not as standing rule. A-L:3/2/3/3/1/4/4/3/3/4/4/4 |
| `agent-architecture-audit` | Full-stack diagnostic for agent and LLM applications. Audits the 12-layer agent stack for wrapper regression, memory pollution, tool discipline failures, hidden | standalone-ish | **Only mine in batch** — distillation/pseudo-facts + monologue→memory poisoning  | `4/3/4/2/5/3/4/2/3/2/3/3` | MINE_MECHANISM | **Only mine in batch** — distillation/pseudo-facts + monologue→memory poisoning (ACI gap) |
| `agent-eval` | Head-to-head comparison of coding agents (Claude Code, Aider, Codex, etc.) on custom tasks with pass rate, cost, time, and consistency metrics. Use when choosin | claude | Coding-agent bakeoff CLI; not LH personality/context correctness | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | Coding-agent bakeoff CLI; not LH personality/context correctness |
| `agent-harness-construction` | Design and optimize AI agent action spaces, tool definitions, and observation formatting for higher completion rates. Use when defining or revising an agent's t | standalone-ish | Tool/observation/recovery harness design = runtime architecture | `2/1/3/1/4/2/2/2/2/2/2/2` | DEFER_R3 | Tool/observation/recovery harness design = runtime architecture |
| `agent-introspection-debugging` | Structured self-debugging workflow for AI agent failures using capture, diagnosis, contained recovery, and introspection reports. Use when an agent run fails an | memory | Capture→diagnose→recover duplicates Matt diagnosing-bugs / ACI fail seam | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | Capture→diagnose→recover duplicates Matt diagnosing-bugs / ACI fail seam |
| `agent-payment-x402` | Add x402 payment execution to AI agents with per-task budgets, spending controls, and non-custodial wallets. Supports Base through agentwallet-sdk and X Layer t | claude,hooks,mcp | CRYPTO/payments x402 protocol — IRRELEVANT to Life Hub. | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | CRYPTO/payments x402 protocol — IRRELEVANT to Life Hub. |
| `agent-self-evaluation` | Use after completing any non-trivial task. The agent self-rates its output on 5 axes — accuracy, completeness, clarity, actionability, conciseness — with concre | hooks,companions:6 | Post-task 5-axis scorecard ceremony; Ponytail conflict + Stop-hook baggage | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | Post-task 5-axis scorecard ceremony; Ponytail conflict + Stop-hook baggage |
| `agent-sort` | Build an evidence-backed ECC install plan for a specific repo by sorting skills, commands, rules, hooks, and extras into DAILY vs LIBRARY buckets using parallel | hooks,mcp | Agent/skill sorting & catalog curation for ECC — Round 2 specialist/catalog proc | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | Agent/skill sorting & catalog curation for ECC — Round 2 specialist/catalog procedure / FRAMEWORK. |
| `agentic-engineering` | Operate as an agentic engineer using eval-first execution, decomposition, and cost-aware model routing. Use when planning or executing engineering work that age | standalone-ish | Generic eval-first / model routing platitudes; covered by first-pass + Ponytail | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | Generic eval-first / model routing platitudes; covered by first-pass + Ponytail |
| `agentic-os` | Build persistent multi-agent operating systems on Claude Code. Covers kernel architecture, specialist agents, slash commands, file-based memory, scheduled autom | claude,mcp | Claude Code “personal OS” kernel; architecture import, not LH | `2/1/3/1/4/2/2/2/2/2/2/2` | DEFER_R3 | Claude Code “personal OS” kernel; architecture import, not LH |
| `ai-first-engineering` | Engineering operating model for teams where AI agents generate a large share of implementation output. Use when setting team process, review gates, or ownership | standalone-ish | Team-process essay; no concrete mechanism | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | Team-process essay; no concrete mechanism |
| `ai-regression-testing` | Regression testing strategies for AI-assisted development. Sandbox-mode API testing without database dependencies, automated bug-check workflows, and patterns t | claude | Steal "bug-found → regression test" + sandbox/prod parity; drop Vitest/Next scaf | `4/4/4/4/5/3/3/2/3/3/4/3` | MINE_MECHANISM | Steal "bug-found → regression test" + sandbox/prod parity; drop Vitest/Next scaffolding |
| `android-clean-architecture` | Clean Architecture patterns for Android and Kotlin Multiplatform projects — module structure, dependency rules, UseCa... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | MOBILE_NATIVE. |
| `angular-developer` | Generates Angular code and provides architectural guidance. Trigger when creating projects, components, or services, ... | mcp,companions:35 | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT — Angular; companion-heavy. |
| `api-connector-builder` | Build a new API connector or provider by matching the target repo's existing integration pattern exactly. Use when ad... | mcp | search-first + Ponytail | `3/2/3/2/1/4/4/3/3/4/4/4` | ON_DEMAND | House-style connector workflow (learn pattern→narrow→match layers) is a thin useful procedure when adding Netlify/API integrations. A-L:2/2/3/3/1/5/4/4/3/4/4/4 |
| `api-design` | REST API design patterns including resource naming, status codes, pagination, filtering, error responses, versioning,... | standalone-ish | backend-patterns / Netlify handlers | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | GENERIC — REST textbook; Netlify functions are thinner. |
| `architecture-decision-records` | Capture architectural decisions made during Claude Code sessions as structured ADRs. Auto-detects decision moments, r... | claude | explicit no-ADR policy | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | DUP/conflicts explicit no-ADR workflow. |
| `article-writing` | Write articles, guides, blog posts, tutorials, newsletter issues, and other long-form content in a distinctive voice ... | standalone-ish | brand-voice / personality agents | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | MARKETING/GENERIC content. |
| `automation-audit-ops` | Evidence-first automation inventory and overlap audit workflow for ECC. Use when the user wants to know which jobs, h... | mcp | configure-ecc | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | ECC automation inventory; FRAMEWORK Round 2/4. DEFER_R2. A-L:1/1/1/1/1/1/1/1/1/2/3/2 |
| `autonomous-agent-harness` | Transform Claude Code into a fully autonomous agent system with persistent memory, scheduled operations, computer use, and task queuing. Replaces standalone age | claude,hooks,memory,mcp | Claude Code autonomous OS (crons/dispatch/MCP memory); wrong product + autonomy  | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | Claude Code autonomous OS (crons/dispatch/MCP memory); wrong product + autonomy risk |
| `autonomous-loops` | Patterns and architectures for autonomous Claude Code loops — from simple sequential pipelines to RFC-driven multi-agent DAG systems. Retained for compatibility | claude | Deprecated shim → continuous-agent-loop; autonomous coding loops | `2/1/3/1/4/2/2/2/2/2/2/2` | DEFER_R3 | Deprecated shim → continuous-agent-loop; autonomous coding loops |
| `backend-patterns` | Backend architecture patterns, API design, database optimization, and server-side best practices for Node.js, Express... | standalone-ish | Netlify Functions patterns | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT — Express/Next.js API routes. |
| `benchmark` | Use this skill to measure performance baselines, detect regressions before/after PRs, and compare stack alternatives. | mcp | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | GENERIC — trivial before/after timing; no standing skill. |
| `benchmark-methodology` | Use after competitive-platform-analysis has produced a tiered competitor set. Scores each competitor across nine weig... | standalone-ish | competitive-platform-analysis | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | BUSINESS_OPS. |
| `benchmark-optimization-loop` | Use when the user asks to make something faster, try many variants, run recursive optimization, benchmark latency/thr... | standalone-ish | benchmark | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | Recursive optimize-by-measure loop; Round 2 procedure. DEFER_R2. A-L:2/1/2/2/1/3/3/3/3/2/3/3 |
| `blender-motion-state-inspection` | Use this skill when inspecting Blender characters, rigs, poses, animation retargeting, ground contact, facing directi... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT. |
| `blueprint` | Turn a one-line objective into a step-by-step construction plan for multi-session, multi-agent engineering projects. ... | claude | plan-orchestrate / Superpowers writing-plans | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | Multi-agent construction plans; Round 2 procedure ORCH. DEFER_R2. A-L:1/1/2/1/2/2/2/2/2/1/2/2 |
| `brand-discovery` | Use when a brand needs to discover or articulate its identity through structured multi-session interviews. Covers pur... | companions:8 | brand-voice | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | MARKETING — multi-session brand interviews. |
| `brand-voice` | Build a source-derived writing style profile from real posts, essays, launch notes, docs, or site copy, then reuse th... | companions:1 | personality agents (Chadwick/Clare) | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | DUP/MARKETING — personality agents + ad-hoc voice; not Round 1 extract. |
| `browser-qa` | Use this skill to automate visual testing and UI interaction verification using browser automation after deploying features. | mcp | Steal blast-radius + INCONCLUSIVE-if-no-baseline; rest overlaps fidelity ladder | `4/3/3/4/3/3/4/3/3/3/3/4` | MINE_MECHANISM | Steal blast-radius + INCONCLUSIVE-if-no-baseline; rest overlaps fidelity ladder |
| `bun-runtime` | Bun as runtime, package manager, bundler, and test runner. When to choose Bun vs Node, migration notes, and Vercel su... | standalone-ish | Node/Vite toolchain | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT — Bun not Life Hub runtime. |
| `canary-watch` | Use this skill to monitor and verify a deployed URL after releases — checks HTTP endpoints, SSE streams, static assets, console errors, and performance regressi | hooks | Post-deploy smoke checklist; useful ops pattern, not always-on skill | `3/2/3/3/1/4/4/3/3/4/4/4` | ON_DEMAND | Post-deploy smoke checklist; useful ops pattern, not always-on skill |
| `carrier-relationship-management` | Codified expertise for managing carrier portfolios, negotiating freight rates, tracking carrier performance, allocati... | claude | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | BUSINESS_OPS. |
| `cisco-ios-patterns` | Cisco IOS and IOS-XE review patterns for show commands, config hierarchy, wildcard masks, ACL placement, interface hy... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | HOMELAB/IRRELEVANT. |
| `ck` | Persistent per-project memory for Claude Code. Auto-loads project context on session start, tracks sessions with git ... | claude,hooks,companions:9 | unified-memory / continuous-learning | `2/1/3/1/4/2/2/2/2/2/2/2` | DEFER_R3 | Context Keeper persistent project memory; Round 3 runtime memory. CLAUDE_ONLY. DEFER_R3. A-L:1/1/2/1/4/1/1/1/2/1/2/1 |
| `claude-devfleet` | Orchestrate multi-agent coding tasks via Claude DevFleet — plan projects, dispatch parallel agents in isolated worktrees, monitor progress, and read structured  | claude,mcp | External DevFleet MCP fleet; heavy dependency chain | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | External DevFleet MCP fleet; heavy dependency chain |
| `click-path-audit` | Trace every user-facing button/touchpoint through its full state change sequence to find bugs where functions individually work but cancel each other out, produ | standalone-ish | **Best unique mechanism in this batch** — store reset map + sequential-undo audi | `5/3/5/5/5/4/5/3/4/3/4/4` | MINE_MECHANISM | **Best unique mechanism in this batch** — store reset map + sequential-undo audit |
| `clickhouse-io` | ClickHouse database patterns, query optimization, analytics, and data engineering best practices for high-performance... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT. |
| `code-tour` | Create CodeTour `.tour` files — persona-targeted, step-by-step walkthroughs with real file and line anchors. Use for ... | standalone-ish | codebase-onboarding | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | DUP/GENERIC — CodeTour VS Code artifact. |
| `codebase-onboarding` | Analyze an unfamiliar codebase and generate a structured onboarding guide with architecture map, key entry points, conventions, and a starter CLAUDE.md. Use whe | claude | Recon→CLAUDE.md procedure; LH already has AGENTS.md/CLAUDE.md | `3/1/2/2/1/4/3/3/2/3/4/4` | ON_DEMAND | Recon→CLAUDE.md procedure; LH already has AGENTS.md/CLAUDE.md |
| `codehealth-mcp` | Real-time structural Code Health via CodeScene MCP — review before edits, verify score deltas after changes, gate com... | claude,mcp | plankton-code-quality | `2/1/2/2/1/2/2/2/2/2/2/2` | DEFER_R4 | CodeScene MCP health gates; Round 4 DEPENDENCY_CHAIN. DEFER_R4. A-L:1/1/1/1/0/1/1/1/1/2/3/1 |
| `coding-standards` | Baseline cross-project coding conventions for naming, readability, immutability, and code-quality review. Use detailed frontend or backend skills for framework- | hooks | Generic KISS/YAGNI/immutability; Ponytail + design kit already own this | `2/2/1/1/0/3/2/1/1/2/3/2` | REJECT | Generic KISS/YAGNI/immutability; Ponytail + design kit already own this |
| `competitive-platform-analysis` | Use when scoping a competitive landscape — identifying, categorising, and score-filtering a competitor set before any... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | BUSINESS_OPS. |
| `competitive-report-structure` | Use after benchmark-methodology has produced scored competitor profile cards. Assembles findings into a decision-grad... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | BUSINESS_OPS. |
| `compose-multiplatform-patterns` | Compose Multiplatform and Jetpack Compose patterns for KMP projects — state management, navigation, theming, performa... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | MOBILE_NATIVE. |
| `config-gc` | Garbage collection for your Claude Code configuration. Periodically scans ~/.claude (skills, memory, hooks, permissio... | claude,hooks,memory,mcp | configure-ecc | `2/1/2/2/1/2/2/2/2/2/2/2` | DEFER_R4 | Claude Code config GC; Round 4 FRAMEWORK. DEFER_R4. A-L:0/1/1/0/1/0/0/1/1/2/3/1 |
| `configure-ecc` | Guide ECC installation, update, or reconfiguration from inside Claude Code, Codex, or Kimi while respecting each harness's real plugin, scope, and hook capabili | claude | ECC install/reconfigure wizard | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | ECC install/reconfigure wizard |
| `connections-optimizer` | Reorganize the user's X and LinkedIn network with review-first pruning, add/follow recommendations, and channel-speci... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | MARKETING/BUSINESS_OPS — X/LinkedIn network. |
| `content-engine` | Create platform-native content systems for X, LinkedIn, TikTok, YouTube, newsletters, and repurposed multi-platform c... | standalone-ish | brand-voice | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | MARKETING. |
| `content-hash-cache-pattern` | Cache expensive file processing results using SHA-256 content hashes — path-independent, auto-invalidating, with serv... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | GENERIC — niche cache pattern; YAGNI for Life Hub. |
| `context-budget` | Audits Claude Code context window consumption across agents, skills, MCP servers, and rules. Identifies bloat, redundant components, and produces prioritized to | claude,mcp | Claude Code agents/skills/MCP token overhead audit | `2/1/3/1/4/2/2/2/2/2/2/2` | DEFER_R3 | Claude Code agents/skills/MCP token overhead audit |
| `continuous-agent-loop` | Patterns for continuous autonomous agent loops with quality gates, evals, and recovery controls. Use when running an agent loop that must self-check, gate on ev | standalone-ish | Canonical autonomous loop selector | `2/1/3/1/4/2/2/2/2/2/2/2` | DEFER_R3 | Canonical autonomous loop selector |
| `continuous-learning` | [DEPRECATED - use continuous-learning-v2] Legacy v1 stop-hook skill extractor. v2 is a strict superset with instinct-based, project-scoped, hook-reliable learni | claude,hooks,memory,companions:2 | Deprecated; routes to v2 | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | Deprecated; routes to v2 |
| `continuous-learning-v2` | Instinct-based learning system that observes sessions via hooks, creates atomic instincts with confidence scoring, and evolves them into skills/commands/agents. | claude,hooks,memory,companions:11 | Instinct/homunculus learning system = Round 3 learning | `1/1/2/0/4/1/1/1/2/1/2/2` | DEFER_R3 | Instinct/homunculus learning system = Round 3 learning |
| `contract-first` | Use when multiple consumers and providers must evolve an API or event schema without field drift, integration surpris... | standalone-ish | Netlify function contracts | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | ABSTRACTION — OpenAPI consumer-first ceremony overkill for current hubs. |
| `cost-aware-llm-pipeline` | Cost optimization patterns for LLM API usage — model routing by task complexity, budget tracking, retry logic, and prompt caching. Use when LLM spend needs to c | claude | Model routing / budget / caching for LLM product calls | `2/1/3/1/4/2/2/2/2/2/2/2` | DEFER_R3 | Model routing / budget / caching for LLM product calls |
| `cost-tracking` | Track and report Claude Code token usage, spending, and budgets from the local ECC cost-tracker metrics log. Use when... | claude | token-budget-advisor | `2/1/2/2/1/2/2/2/2/2/2/2` | DEFER_R4 | ECC cost-tracker metrics; Round 4/cost. DEFER_R4. A-L:1/1/1/0/1/1/1/2/2/3/3/2 |
| `council` | Convene a four-voice council for ambiguous decisions, tradeoffs, and go/no-go calls. Use when multiple valid paths exist and you need structured disagreement be | memory | Multi-perspective council decision procedure; Round 2 specialist. Pair with coun | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | Multi-perspective council decision procedure; Round 2 specialist. Pair with council-multi-model. |
| `council-multi-model` | Add one optional external Codex critique after the existing council has produced a decision draft. Use when an ambiguous, high-consequence decision would benefi | claude,mcp,companions:1 | Optional Codex critique after `council`; specialist decision procedure | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | Optional Codex critique after `council`; specialist decision procedure |
| `cpp-coding-standards` | C++ coding standards based on the C++ Core Guidelines (isocpp.github.io). Use when writing, reviewing, or refactoring... | mcp | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | NICHE_LANG. |
| `cpp-testing` | Use only when writing/updating/fixing C++ tests, configuring GoogleTest/CTest, diagnosing failing or flaky tests, or ... | memory | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | NICHE_LANG. |
| `crosspost` | Multi-platform content distribution across X, LinkedIn, Threads, and Bluesky. Adapts content per platform using conte... | standalone-ish | content-engine | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | MARKETING. |
| `csharp-testing` | C# and .NET testing patterns with xUnit, FluentAssertions, mocking, integration tests, and test organization best pra... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | NICHE_LANG. |
| `customer-billing-ops` | Operate customer billing workflows such as subscriptions, refunds, churn triage, billing-portal recovery, and plan an... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | BUSINESS_OPS. |
| `customs-trade-compliance` | Codified expertise for customs documentation, tariff classification, duty optimization, restricted party screening, a... | claude | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | BUSINESS_OPS. |
| `dart-flutter-patterns` | Production-ready Dart and Flutter patterns covering null safety, immutable state, async composition, widget architect... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | MOBILE_NATIVE. |
| `dashboard-builder` | Build monitoring dashboards that answer real operator questions for Grafana, SigNoz, and similar platforms. Use when ... | standalone-ish | n/a | `2/1/2/2/1/2/2/2/2/2/2/2` | DEFER_R4 | Grafana/SigNoz dashboards; Round 4 observability. DEFER_R4. A-L:1/0/1/1/0/3/2/2/3/3/4/3 |
| `data-scraper-agent` | Build a fully automated AI-powered data collection agent for any public source — job boards, prices, news, GitHub, sp... | standalone-ish | Firecrawl | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | AUTONOMY/COST — heavy scheduled scraper agent. |
| `data-throughput-accelerator` | Use when large data ingestion, backfill, export, ETL, warehouse loading, manifest catch-up, or table synchronization ... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT — warehouse ETL. |
| `database-migrations` | Database migration best practices for schema changes, data migrations, rollbacks, and zero-downtime deployments acros... | standalone-ish | n/a | `2/1/2/2/1/2/2/2/2/2/2/2` | DEFER_R4 | Cross-ORM migration safety; Round 4 if schema DB appears. DEFER_R4. A-L:1/1/1/2/0/3/2/2/3/3/4/3 |
| `deep-research` | Multi-source deep research using firecrawl and exa MCPs. Searches the web, synthesizes findings, and delivers cited r... | claude,mcp | Firecrawl skills + WebSearch | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | DUP/DEPENDENCY_CHAIN — firecrawl+exa. |
| `defi-amm-security` | Security checklist for Solidity AMM contracts, liquidity pools, and swap flows. Covers reentrancy, CEI ordering, dona... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | CRYPTO_DEFI. |
| `delivery-gate` | Stop hook that blocks Claude from finishing until quality checks pass. Detects rationalization patterns (surface text heuristics), stale learning logs (filesyst | claude,hooks,memory,companions:1 | Claude Code Stop hook for learning-library mtime; wrong harness + ceremony | `1/1/2/0/2/1/1/1/2/1/2/2` | REJECT | Claude Code Stop hook for learning-library mtime; wrong harness + ceremony |
| `deployment-patterns` | Deployment workflows, CI/CD pipeline patterns, Docker containerization, health checks, rollback strategies, and produ... | standalone-ish | Netlify/GitHub Pages | `2/1/2/2/1/2/2/2/2/2/2/2` | DEFER_R4 | CI/Docker/k8s deploy strategies; Round 4, weak Netlify fit. DEFER_R4. A-L:1/1/2/2/0/2/2/2/2/2/3/2 |
| `design-system` | Use this skill to generate or audit design systems, check visual consistency, and review PRs that touch styling. Use ... | mcp | packages/design-kit | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | DESIGN_KIT_CONFLICT — generates competing DESIGN.md/tokens. |
| `dev-team` | Simulate a collaborative dev team session where multiple role-based personas (PM, Architect, Developer, QA) respond t... | standalone-ish | personality agents | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | Simulated PM/Arch/Dev/QA session; ORCH theatre. DEFER_R2. A-L:1/1/2/1/2/2/2/2/2/1/2/2 |
| `django-celery` | Django + Celery async task patterns — configuration, task design, beat scheduling, retries, canvas workflows, monitor... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT — Django. |
| `django-patterns` | Django architecture patterns, REST API design with DRF, ORM best practices, caching, signals, middleware, and product... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT. |
| `django-security` | Django security best practices, authentication, authorization, CSRF protection, SQL injection prevention, XSS prevent... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT. |
| `django-tdd` | Django testing strategies with pytest-django, TDD methodology, factory_boy, mocking, coverage, and testing Django RES... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT. |
| `django-verification` | Verification loop for Django projects: migrations, linting, tests with coverage, security scans, and deployment readiness checks before release or PR. | standalone-ish | Framework gate template; LH is not Django; exemplifies bureaucracy first-pass ba | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | Framework gate template; LH is not Django; exemplifies bureaucracy first-pass bans |
| `dmux-workflows` | Multi-agent orchestration using dmux (tmux pane manager for AI agents). Patterns for parallel agent workflows across Claude Code, Codex, OpenCode, and other har | claude | tmux parallel coding panes when Adam asks; not product ACI | `2/1/2/1/1/3/3/3/3/3/3/3` | ON_DEMAND | tmux parallel coding panes when Adam asks; not product ACI |
| `docker-patterns` | Docker and Docker Compose patterns for local development, hardened CLI installer harnesses, container security, netwo... | standalone-ish | Netlify deploy (not Docker) | `2/1/2/2/1/2/2/2/2/2/2/2` | DEFER_R4 | Docker/Compose encyclopedia; infra Round 4 if ever needed, mostly IRRELEVANT. DEFER_R4. A-L:1/1/1/1/0/2/1/2/2/2/3/2 |
| `documentation-lookup` | Use up-to-date library and framework docs via Context7 MCP instead of training data. Activates for setup questions, A... | claude,mcp | WebSearch / Firecrawl / Context7 optional | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | DEPENDENCY_CHAIN — Context7 MCP. |
| `dotnet-patterns` | Idiomatic C# and .NET patterns, conventions, dependency injection, async/await, and best practices for building robus... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | NICHE_LANG. |
| `dynamic-workflow-mode` | Design task-local harnesses, eval gates, and reusable skill extraction for Claude dynamic workflow mode and other ada... | claude | eval-harness | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | Task-local harness + eval gates for Claude dynamic mode; R2/CLAUDE_ONLY. DEFER_R2. A-L:1/1/2/2/2/1/1/2/2/1/2/2 |
| `e2e-testing` | Playwright E2E testing patterns, Page Object Model, configuration, CI/CD integration, artifact management, and flaky test strategies. Use when writing Playwrigh | standalone-ish | Generic Playwright cookbook; LH already has Playwright + fixtures | `2/2/1/2/1/4/3/2/1/3/5/3` | REJECT | Generic Playwright cookbook; LH already has Playwright + fixtures |
| `ecc-guide` | Guide users through ECC's current agents, skills, commands, hooks, rules, install profiles, and project onboarding by reading the live repository surface before | claude,hooks | ECC catalog navigation | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | ECC catalog navigation |
| `ecc-recipes` | Map a described workflow to the right ECC command-GROUP with run-order and stop condition, and browse all command-gro... | memory | ecc-guide | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | ECC command-group recipes; FRAMEWORK. DEFER_R2. A-L:0/1/1/0/1/0/0/1/1/1/3/1 |
| `ecc-tools-cost-audit` | Evidence-first ECC Tools burn and billing audit workflow. Use when investigating runaway PR creation, quota bypass, p... | claude | cost-tracking | `2/1/2/2/1/2/2/2/2/2/2/2` | DEFER_R4 | ECC Tools billing audit; FRAMEWORK Round 4. DEFER_R4. A-L:0/0/0/0/0/0/0/1/1/2/3/1 |
| `email-ops` | Evidence-first mailbox triage, drafting, send verification, and sent-mail-safe follow-up workflow for ECC. Use when t... | standalone-ish | Gmail MCP | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | ECC mailbox triage workflow; Round 2 ops. DEFER_R2. A-L:1/1/1/1/0/2/2/2/2/3/3/2 |
| `energy-procurement` | Codified expertise for electricity and gas procurement, tariff optimization, demand charge management, renewable PPA ... | claude | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | BUSINESS_OPS. |
| `enterprise-agent-ops` | Operate long-lived agent workloads with observability, security boundaries, and lifecycle management. Use when running long-lived agent workloads that need obse | standalone-ish | Long-lived ops: lifecycle, kill switches, audit | `2/1/2/2/1/2/2/2/2/2/2/2` | DEFER_R4 | Long-lived ops: lifecycle, kill switches, audit |
| `error-handling` | Patterns for robust error handling across TypeScript, Python, and Go. Covers typed errors, error boundaries, retries,... | standalone-ish | existing app error patterns | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | GENERIC — TS/Python/Go encyclopedia; high cost/low Life Hub fit. |
| `eval-harness` | Formal evaluation framework for Claude Code sessions implementing eval-driven development (EDD) principles. Use when a Claude Code workflow needs a formal eval  | claude | EDD/pass@k useful for agent eval later, not product first-pass | `2/1/3/1/4/3/2/2/3/2/3/3` | DEFER_R3 | EDD/pass@k useful for agent eval later, not product first-pass |
| `evm-token-decimals` | Prevent silent decimal mismatch bugs across EVM chains. Covers runtime decimal lookup, chain-aware caching, bridged-t... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | CRYPTO_DEFI. |
| `exa-search` | Neural search via Exa MCP for web, code, and company research. Use when the user needs web search, code examples, com... | claude,mcp | Firecrawl search / WebSearch | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | DEPENDENCY_CHAIN — Exa MCP. |
| `fal-ai-media` | Unified media generation via fal.ai MCP — image, video, and audio. Covers text-to-image (Nano Banana), text/image-to-... | mcp | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | DEPENDENCY_CHAIN — fal.ai MCP media gen. |
| `fastapi-patterns` | FastAPI best practices covering project structure, Pydantic v2 schemas, dependency injection, async handlers, authent... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT. |
| `finance-billing-ops` | Evidence-first revenue, pricing, refunds, team-billing, and billing-model truth workflow for ECC. Use when the user w... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | BUSINESS_OPS — ECC billing. |
| `flox-environments` | Create reproducible, cross-platform (macOS/Linux) development environments with Flox, a declarative Nix-based environ... | claude | env-setup | `2/1/2/2/1/2/2/2/2/2/2/2` | DEFER_R4 | Nix/Flox toolchain envs; Round 4 infra. DEFER_R4. A-L:0/0/1/0/0/1/1/1/2/2/3/1 |
| `flutter-dart-code-review` | Library-agnostic Flutter/Dart code review checklist covering widget best practices, state management patterns (BLoC, ... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | MOBILE_NATIVE. |
| `foundation-models-on-device` | Apple FoundationModels framework for on-device LLM — text generation, guided generation with @Generable, tool calling... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | MOBILE_NATIVE. |
| `frontend-a11y` | Accessibility patterns for React and Next.js — semantic HTML, ARIA attributes, form labeling, keyboard navigation, fo... | standalone-ish | accessibility | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | FRAMEWORK — React/Next a11y; prefer accessibility skill. |
| `frontend-design-direction` | Set an ECC-specific frontend design direction for production UI work. Use when building or improving websites, dashbo... | claude | packages/design-kit + user frontend rules | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | DESIGN_KIT_CONFLICT — ECC visual direction vs design-kit. |
| `frontend-patterns` | Frontend development patterns for React, Next.js, state management, performance optimization, and UI best practices. Use when building or reviewing React or Nex | standalone-ish | Pattern dump vs design-kit authority; no unique verification beyond a11y snippet | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | Pattern dump vs design-kit authority; no unique verification beyond a11y snippets |
| `frontend-slides` | Create stunning, animation-rich HTML presentations from scratch or by converting PowerPoint files. Use when the user ... | companions:6 | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT — HTML slide decks; occasional but not Life Hub core. |
| `fsharp-testing` | F# testing patterns with xUnit, FsUnit, Unquote, FsCheck property-based testing, integration tests, and test organiza... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | NICHE_LANG. |
| `gan-style-harness` | GAN-inspired Generator-Evaluator agent harness for building high-quality applications autonomously. Based on Anthropic's March 2026 harness design paper. Use wh | claude,mcp | Multi-agent $125–200 loops; antithetical to Ponytail + LH cost/latency | `1/0/1/1/2/1/0/0/1/0/1/1` | REJECT | Multi-agent $125–200 loops; antithetical to Ponytail + LH cost/latency |
| `gateguard` | Fact-forcing gate that blocks Edit/Write/Bash (including MultiEdit) and demands concrete investigation (importers, data schemas, user instruction) before allowi | claude,hooks | Fact-forcing PreToolUse is interesting but high friction / CC-hook-bound | `3/2/4/3/4/2/2/1/3/1/2/2` | DEFER_R4 | Fact-forcing PreToolUse is interesting but high friction / CC-hook-bound |
| `generating-python-installer` | Commercial-grade Python installer expert for Windows: Nuitka extreme compilation, dist slimming, DLL footprint analys... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT — Windows Python installers. |
| `git-workflow` | Git workflow patterns including branching strategies, commit conventions, merge vs rebase, conflict resolution, and c... | hooks | Cursor/cloud git rules | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | DUP/GENERIC — branching encyclopedia. |
| `github-ops` | GitHub repository operations, automation, and management. Issue triage, PR management, CI/CD operations, release mana... | companions:1 | Cursor gh CLI usage | `3/2/3/2/1/4/4/3/3/4/4/4` | ON_DEMAND | Untrusted issue/PR/CI-log instruction hygiene is the unique bit; rest is generic gh. A-L:2/2/3/2/1/4/4/3/3/4/4/4 |
| `golang-patterns` | Idiomatic Go patterns, best practices, and conventions for building robust, efficient, and maintainable Go applicatio... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | NICHE_LANG. |
| `golang-testing` | Go testing patterns including table-driven tests, subtests, benchmarks, fuzzing, and test coverage. Follows TDD metho... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | NICHE_LANG. |
| `google-workspace-ops` | Operate across Google Drive, Docs, Sheets, and Slides as one workflow surface for plans, trackers, decks, and shared ... | standalone-ish | Google Drive/Docs MCP | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | GENERIC — MCP already present; thin ops wrapper. |
| `growth-log` | Use after a complex task, failure, or when reviewing what was learned. Teaches how to write growth logs that extract ... | hooks | continuous-learning | `2/1/3/1/4/2/2/2/2/2/2/2` | DEFER_R3 | Transferable failure-pattern logs; Round 3 learning. DEFER_R3. A-L:2/1/2/1/3/4/3/3/3/3/4/3 |
| `healthcare-cdss-patterns` | Clinical Decision Support System (CDSS) development patterns. Drug interaction checking, dose validation, clinical sc... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | HEALTHCARE. |
| `healthcare-emr-patterns` | EMR/EHR development patterns for healthcare applications. Clinical safety, encounter workflows, prescription generati... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | HEALTHCARE. |
| `healthcare-eval-harness` | Patient safety evaluation harness for healthcare application deployments. Automated test suites for CDSS accuracy, PH... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | HEALTHCARE. |
| `healthcare-phi-compliance` | Protected Health Information (PHI) and Personally Identifiable Information (PII) compliance patterns for healthcare a... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | HEALTHCARE. |
| `hermes-imports` | Convert local Hermes operator workflows into sanitized ECC skills and release-pack artifacts. Use when preparing a He... | standalone-ish | opensource-pipeline | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | Hermes→ECC skill sanitization; FRAMEWORK. DEFER_R2. A-L:0/0/1/0/1/1/1/1/1/2/3/1 |
| `hexagonal-architecture` | Design, implement, and refactor Ports & Adapters systems with clear domain boundaries, dependency inversion, and test... | standalone-ish | Ponytail / existing hub boundaries | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | ABSTRACTION — ports/adapters ceremony. |
| `hipaa-compliance` | HIPAA-specific entrypoint for healthcare privacy and security work. Use when a task is explicitly framed around HIPAA... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | HEALTHCARE. |
| `homelab-network-readiness` | Readiness checklist for homelab VLAN segmentation, local DNS filtering, and WireGuard-style remote access before chan... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | HOMELAB. |
| `homelab-network-setup` | Practical home and homelab network planning for gateways, switches, access points, IP ranges, DHCP reservations, DNS,... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | HOMELAB. |
| `homelab-pihole-dns` | Pi-hole installation, blocklist management, DNS-over-HTTPS setup, DHCP integration, local DNS records, and troublesho... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | HOMELAB. |
| `homelab-vlan-segmentation` | Segmenting home networks into VLANs for IoT, guest, trusted, and server traffic using UniFi, pfSense/OPNsense, and Mi... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | HOMELAB. |
| `homelab-wireguard-vpn` | WireGuard VPN server setup, peer configuration, key generation, split tunneling vs full tunnel routing, and remote ac... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | HOMELAB. |
| `hookify-rules` | This skill should be used when the user asks to create a hookify rule, write a hook rule, configure hookify, add a hookify rule, or needs guidance on hookify ru | standalone-ish | Hookify rule syntax for Claude hooks | `2/1/2/2/1/2/2/2/2/2/2/2` | DEFER_R4 | Hookify rule syntax for Claude hooks |
| `inherit-legacy-style` | Legacy-project style inheritance skill. Use when the user types /inherit-legacy-style, or when onboarding an AI codin... | claude,hooks | design-kit + Ponytail reuse | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | CHALLENGE DOWNGRADE: generates .ai-style-rules.md + optional PreToolUse hooks; design-kit + Ponytail/first-pass inspect-before-invent already cover style sniff. |
| `intent-driven-development` | Turn ambiguous or high-impact product and engineering changes into scoped, verifiable acceptance criteria before or alongside implementation. Use when a user as | standalone-ish | Observable AC template (Must not + verification); overlaps first-pass boundaries | `3/2/3/4/2/4/4/3/3/3/4/4` | MINE_MECHANISM | Observable AC template (Must not + verification); overlaps first-pass boundaries |
| `inventory-demand-planning` | Codified expertise for demand forecasting, safety stock optimization, replenishment planning, and promotional lift es... | claude | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | BUSINESS_OPS. |
| `investor-materials` | Create and update pitch decks, one-pagers, investor memos, accelerator applications, financial models, and fundraisin... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | BUSINESS_OPS. |
| `investor-outreach` | Draft cold emails, warm intro blurbs, follow-ups, update emails, and investor communications for fundraising. Use whe... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | BUSINESS_OPS. |
| `ios-icon-gen` | Generate iOS app icons as PNG imagesets for Xcode asset catalogs from SF Symbols (5000+ Apple-native) or Iconify API ... | companions:2 | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | MOBILE_NATIVE. |
| `iterative-retrieval` | Pattern for progressively refining context retrieval to solve the subagent context problem. Use when a subagent lacks the context it needs and retrieval must be | memory | Subagent progressive retrieval loops | `2/1/3/1/4/2/2/2/2/2/2/2` | DEFER_R3 | Subagent progressive retrieval loops |
| `ito-baskets` | Read-only Itô basket and prediction-market data skill. Index the live basket catalog, compare a basket against user-s... | mcp,companions:2 | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | CRYPTO_DEFI. |
| `ito-compute` | Query live GPU inventory, submit an authenticated Itô fixed-rate RFQ, inspect RFQ or procurement status, revoke devic... | mcp,companions:1 | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | CRYPTO_DEFI/IRRELEVANT. |
| `ito-inference` | Inspect the availability of model serving on a completed Itô compute booking and, when the canonical backend becomes ... | mcp | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT. |
| `ito-training` | Inspect the availability of ML training on a completed Itô compute booking and, when the canonical backend becomes av... | mcp | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT. |
| `java-coding-standards` | Java coding standards for Spring Boot and Quarkus services: naming, immutability, Optional usage, streams, exceptions... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | NICHE_LANG. |
| `jira-integration` | Use this skill when retrieving Jira tickets, analyzing requirements, updating ticket status, adding comments, or tran... | mcp | GitHub issues | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT — Jira not Life Hub tracker. |
| `jpa-patterns` | JPA/Hibernate patterns for entity design, relationships, query optimization, transactions, auditing, indexing, pagina... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | NICHE_LANG. |
| `knowledge-ops` | Knowledge base management, ingestion, sync, and retrieval across multiple storage layers (local files, MCP memory, ve... | claude,memory,mcp | life-hub-data / unified-memory | `2/1/3/1/4/2/2/2/2/2/2/2` | DEFER_R3 | Multi-layer knowledge sync incl MCP memory/vectors; Round 3. DEFER_R3. A-L:1/1/2/1/4/1/1/1/1/1/2/1 |
| `kotlin-coroutines-flows` | Kotlin Coroutines and Flow patterns for Android and KMP — structured concurrency, Flow operators, StateFlow, error ha... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | MOBILE_NATIVE/NICHE_LANG. |
| `kotlin-exposed-patterns` | JetBrains Exposed ORM patterns including DSL queries, DAO pattern, transactions, HikariCP connection pooling, Flyway ... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | NICHE_LANG. |
| `kotlin-ktor-patterns` | Ktor server patterns including routing DSL, plugins, authentication, Koin DI, kotlinx.serialization, WebSockets, and ... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | NICHE_LANG. |
| `kotlin-patterns` | Idiomatic Kotlin patterns, best practices, and conventions for building robust, efficient, and maintainable Kotlin ap... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | NICHE_LANG. |
| `kotlin-testing` | Kotlin testing patterns with Kotest, MockK, coroutine testing, property-based testing, and Kover coverage. Follows TD... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | NICHE_LANG. |
| `kubernetes-patterns` | Kubernetes workload patterns, resource management, RBAC, probes, autoscaling, ConfigMap/Secret handling, and kubectl ... | standalone-ish | n/a | `2/1/2/2/1/2/2/2/2/2/2/2` | DEFER_R4 | K8s workloads; wrong deploy topology. DEFER_R4. A-L:0/0/0/0/0/1/0/1/2/2/3/1 |
| `laravel-patterns` | Laravel architecture patterns, routing/controllers, Eloquent ORM, service layers, queues, events, caching, and API re... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT. |
| `laravel-plugin-discovery` | Discover and evaluate Laravel packages via LaraPlugins.io MCP. Use when the user wants to find plugins, check package... | mcp | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT. |
| `laravel-security` | Laravel security best practices — authentication, authorization, Eloquent safety, CSRF, XSS prevention, API security,... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT. |
| `laravel-tdd` | Laravel testing strategies with PHPUnit, Pest, model factories, HTTP tests, Sanctum authentication testing, mocking, ... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT. |
| `laravel-verification` | Verification loop for Laravel projects: env checks, linting, static analysis, tests with coverage, security scans, and deployment readiness. Use when verifying  | standalone-ish | Same *-verification clone; irrelevant | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | Same *-verification clone; irrelevant |
| `latency-critical-systems` | Use for latency-sensitive systems such as realtime dashboards, market data, streaming agents, execution gateways, que... | standalone-ish | n/a | `2/1/2/2/1/2/2/2/2/2/2/2` | DEFER_R4 | p95 hot-path optimization; Round 4 niche. DEFER_R4. A-L:1/0/1/1/0/4/2/3/3/3/4/3 |
| `lead-intelligence` | AI-native lead intelligence and outreach pipeline. Replaces Apollo, Clay, and ZoomInfo with agent-powered signal scor... | mcp,companions:4 | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | MARKETING/BUSINESS_OPS. |
| `liquid-glass-design` | iOS 26 Liquid Glass design system — dynamic glass material with blur, reflection, and interactive morphing for SwiftU... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | MOBILE_NATIVE + DESIGN_KIT_CONFLICT (iOS 26 glass). |
| `living-docs-governance` | Keep a long-lived project's documentation from rotting by assigning existing project docs clear constitution, map, st... | claude | no ADR/CONTEXT.md policy | `2/1/3/1/4/2/2/2/2/2/2/2` | DEFER_R3 | Doc-role constitution conflicts Life Hub no-CONTEXT.md; if revisited→R3. DEFER_R3. A-L:1/1/1/1/2/2/1/2/1/1/3/2 |
| `llm-trading-agent-security` | Security patterns for autonomous trading agents with wallet or transaction authority. Covers prompt injection, spend ... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | CRYPTO_DEFI. |
| `logistics-exception-management` | Codified expertise for handling freight exceptions, shipment delays, damages, losses, and carrier disputes. Informed ... | claude | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | BUSINESS_OPS. |
| `loop-design-check` | Design a goal-oriented agent loop, and review it for the ways loops go wrong — spinning and burning tokens, Goodhart-... | claude | autonomous-loops / verification-loop | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | Agent-loop design/review; Round 2 autonomy procedure. DEFER_R2. A-L:2/1/3/2/3/3/2/2/3/2/2/3 |
| `mailtrap-email-integration` | Guides agents through integrating transactional email sending via Mailtrap's Email API, including sandbox testing, do... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | DEPENDENCY_CHAIN — Mailtrap-specific. |
| `make-interfaces-feel-better` | Apply concrete design-engineering details that make interfaces feel polished. Use when reviewing or improving UI spac... | standalone-ish | packages/design-kit | `3/2/3/2/1/4/4/3/3/4/4/4` | ON_DEMAND | Optical alignment/concentric radius/hit-area polish is useful, but design-kit is authoritative—invoke subordinately, never as competing system. A-L:2/2/3/2/0/4/ |
| `manim-video` | Build reusable Manim explainers for technical concepts, graphs, system diagrams, and product walkthroughs, then hand ... | companions:1 | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT. |
| `market-research` | Conduct market research, competitive analysis, investor due diligence, and industry intelligence with source attribut... | standalone-ish | competitive-* | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | BUSINESS_OPS/MARKETING. |
| `marketing-campaign` | End-to-end marketing campaign planning and execution. Covers audience research, positioning, campaign angle definitio... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | MARKETING. |
| `mcp-server-patterns` | Build MCP servers with Node/TypeScript SDK — tools, resources, prompts, Zod validation, stdio vs Streamable HTTP. Use Context7 or official MCP docs for latest A | mcp | When building/debugging an MCP server | `2/1/2/1/2/4/3/3/3/3/4/4` | ON_DEMAND | When building/debugging an MCP server |
| `messages-ops` | Evidence-first live messaging workflow for ECC. Use when the user wants to read texts or DMs, recover a recent one-ti... | standalone-ish | n/a | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | ECC SMS/DM ops; Round 2. DEFER_R2. A-L:1/1/1/1/0/2/2/2/2/3/3/2 |
| `ml-adoption-playbook` | End-to-end methodology for AI agents and software engineers to add machine learning algorithms to existing non-ML cod... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | SCIENTIFIC/ML. |
| `mle-workflow` | Production machine-learning engineering workflow for data contracts, reproducible training, model evaluation, deploym... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | SCIENTIFIC/ML. |
| `motion-advanced` | Advanced motion patterns for React / Next.js — drag & drop, gestures, text animations, SVG path drawing, custom hooks... | hooks | design-kit motion.css | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | DESIGN_KIT_CONFLICT + React/Next. |
| `motion-foundations` | Motion tokens, spring presets, performance rules, device adaptation, accessibility enforcement, and SSR safety for Re... | hooks | design-kit motion.css | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | DESIGN_KIT_CONFLICT + React/Next. |
| `motion-patterns` | Production-ready animation patterns for React / Next.js — button, modal, toast, stagger, page transitions, exit anima... | hooks | design-kit motion.css | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | DESIGN_KIT_CONFLICT + React/Next. |
| `motion-ui` | Production-ready UI motion system for React/Next.js. Use when implementing animations, transitions, or motion patterns. | standalone-ish | design-kit motion.css | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | DESIGN_KIT_CONFLICT + React/Next FRAMEWORK. |
| `mysql-patterns` | MySQL and MariaDB schema, query, indexing, transaction, replication, and connection-pool patterns for production back... | standalone-ish | n/a | `2/1/2/2/1/2/2/2/2/2/2/2` | DEFER_R4 | MySQL patterns; wrong stack. DEFER_R4. A-L:0/0/0/0/0/2/0/1/2/3/4/2 |
| `nanoclaw-repl` | Operate and extend NanoClaw v2, ECC's zero-dependency session-aware REPL built on claude -p. Use when operating or extending the NanoClaw REPL. | standalone-ish | ECC `claw.js` REPL ops | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | ECC `claw.js` REPL ops |
| `nasiko-control-plane` | Use the experimental Nasiko CLI lifecycle bridge for pinned installation, read-only status, and qualified uninstall w... | companions:1 | n/a | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | Experimental Nasiko CLI bridge; niche ECC. DEFER_R2. A-L:0/0/0/0/1/1/0/2/2/2/3/1 |
| `nestjs-patterns` | NestJS architecture patterns for modules, controllers, providers, DTO validation, guards, interceptors, config, and p... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT — NestJS. |
| `netmiko-ssh-automation` | Safe Python Netmiko patterns for read-only collection, bounded batch SSH, TextFSM parsing, guarded config changes, ti... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | HOMELAB. |
| `network-bgp-diagnostics` | Diagnostics-only BGP troubleshooting patterns for neighbor state, route exchange, prefix policy, AS path inspection, ... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | HOMELAB. |
| `network-config-validation` | Pre-deployment checks for router and switch configuration, including dangerous commands, duplicate addresses, subnet ... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | HOMELAB. |
| `network-interface-health` | Diagnose interface errors, drops, CRCs, duplex mismatches, flapping, speed negotiation issues, and counter trends on ... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | HOMELAB. |
| `nextjs-turbopack` | Next.js 16+ and Turbopack — incremental bundling, FS caching, dev speed, and when to use Turbopack vs webpack. | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT — Next.js. |
| `nodejs-keccak256` | Prevent Ethereum hashing bugs in JavaScript and TypeScript. Node's sha3-256 is NIST SHA3, not Ethereum Keccak-256, an... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | CRYPTO_DEFI. |
| `nutrient-document-processing` | Process, convert, OCR, extract, redact, sign, and fill documents using the Nutrient DWS API. Works with PDFs, DOCX, X... | mcp | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | DEPENDENCY_CHAIN — Nutrient DWS API. |
| `nuxt4-patterns` | Nuxt 4 app patterns for hydration safety, performance, route rules, lazy loading, and SSR-safe data fetching with use... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT — Nuxt. |
| `openclaw-persona-forge` | 为 OpenClaw AI Agent 锻造完整的龙虾灵魂方案。根据用户偏好或随机抽卡， 输出身份定位、灵魂描述(SOUL.md)、角色化底线规则、名字和头像生图提示词。 如当前环境提供已审核的生图 skill，可自动生成统一风格头像图片。 当用户需要创建、设计或定制 OpenClaw 龙虾灵魂时使用。 不适用于：微调 | claude,companions:8 | OpenClaw lobster gacha/SOUL; LH already owns personalities | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | OpenClaw lobster gacha/SOUL; LH already owns personalities |
| `opensource-pipeline` | Open-source pipeline: fork, sanitize, and package private projects for safe public release. Chains 3 agents (forker, ... | claude | life-hub-data privacy boundary | `3/2/3/2/1/4/4/3/3/4/4/4` | ON_DEMAND | Sanitizer/forker idea valuable before any public extract from private store; full 3-agent ORCH is heavy—mine checklist on demand only. A-L:1/1/3/2/1/2/3/2/3/2/3 |
| `orch-add-feature` | Orchestrate building a brand-new feature end to end — research, plan, TDD implementation, review, and gated commit — ... | standalone-ish | Superpowers TDD + orch-pipeline | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | ECC orch family entry; ORCH. DEFER_R2. A-L:0/1/1/1/1/0/1/1/1/1/2/1 |
| `orch-build-mvp` | Orchestrate bootstrapping a working MVP from a design or spec document — ingest the doc, plan thin vertical slices, s... | standalone-ish | orch-pipeline | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | ECC orch family; ORCH. DEFER_R2. A-L:0/1/1/1/1/0/1/1/1/1/2/1 |
| `orch-change-feature` | Orchestrate altering an existing, working feature to new desired behavior — update its tests to the new spec, change ... | standalone-ish | orch-pipeline | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | ECC orch family; ORCH. DEFER_R2. A-L:0/1/1/1/1/0/1/1/1/1/2/1 |
| `orch-fix-defect` | Orchestrate fixing a bug — reproduce it as a failing regression test, fix to green, review, and gated commit — by del... | standalone-ish | orch-pipeline | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | ECC orch family; ORCH. DEFER_R2. A-L:0/1/1/1/1/0/1/1/1/1/2/1 |
| `orch-pipeline` | Shared orchestration engine for the orch-* skill family. Defines the gated Research-Plan-TDD-Review-Commit pipeline, ... | claude | tdd-workflow / delivery-gate | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | Shared Research-Plan-TDD-Review-Commit engine; ORCH. DEFER_R2. A-L:1/1/2/2/2/0/1/1/1/1/2/1 |
| `orch-refine-code` | Orchestrate a behavior-preserving refactor — confirm tests are green, restructure without changing behavior, keep tes... | standalone-ish | orch-pipeline | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | ECC orch family; ORCH. DEFER_R2. A-L:0/1/1/1/1/0/1/1/1/1/2/1 |
| `parallel-execution-optimizer` | Use when the user wants a task done much faster through parallel work, concurrent agents, batched tool calls, isolate... | standalone-ish | dispatching-parallel-agents | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | Parallel agent/worktree lanes; Round 2. DEFER_R2. A-L:2/1/2/2/2/3/2/3/3/2/2/3 |
| `perl-patterns` | Modern Perl 5.36+ idioms, best practices, and conventions for building robust, maintainable Perl applications. Use wh... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | NICHE_LANG. |
| `perl-security` | Comprehensive Perl security covering taint mode, input validation, safe process execution, DBI parameterized queries,... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | NICHE_LANG. |
| `perl-testing` | Perl testing patterns using Test2::V0, Test::More, prove runner, mocking, coverage with Devel::Cover, and TDD methodo... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | NICHE_LANG. |
| `plan-canvas` | Open plans and HTML artifacts in a local browser canvas where the human annotates elements, chats, and approves or re... | claude | n/a | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | Browser annotation canvas for plan approval; ECC runtime dependency. DEFER_R2. A-L:1/1/2/1/1/1/1/1/2/1/2/2 |
| `plan-orchestrate` | Read a plan document, decompose it into steps, design a per-step agent chain from the ECC catalogue, and emit ready-t... | claude | ECC /orchestrate | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | ECC agent-catalogue orchestration generator; FRAMEWORK+ORCH. DEFER_R2. A-L:0/1/1/1/2/0/0/1/1/1/2/1 |
| `plankton-code-quality` | Write-time code quality enforcement using Plankton — auto-formatting, linting, and Claude-powered fixes on every file edit via hooks. Use when setting up write- | claude,hooks | External Claude Code hook system; PM enforcement fights LH toolchain | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | External Claude Code hook system; PM enforcement fights LH toolchain |
| `postgres-patterns` | PostgreSQL database patterns for query optimization, schema design, indexing, and security. Based on Supabase best pr... | standalone-ish | life-hub-data (file store) | `2/1/2/2/1/2/2/2/2/2/2/2` | DEFER_R4 | Postgres/Supabase patterns; Round 4 if DB appears. DEFER_R4. A-L:1/1/1/1/0/3/2/2/3/3/4/3 |
| `prediction-market-oracle-research` | Research prediction markets as data sources or oracle signals for products, agents, dashboards, and corporate decisio... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | CRYPTO_DEFI. |
| `prediction-market-risk-review` | Review prediction-market, basket, oracle, and trading-agent workflows for compliance, safety, data-quality, privacy, ... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | CRYPTO_DEFI. |
| `prisma-patterns` | Prisma ORM patterns for TypeScript backends — schema design, query optimization, transactions, pagination, and critic... | standalone-ish | n/a | `2/1/2/2/1/2/2/2/2/2/2/2` | DEFER_R4 | Prisma ORM; wrong stack. DEFER_R4. A-L:0/0/0/0/0/2/0/1/2/3/4/2 |
| `product-capability` | Translate PRD intent, roadmap asks, or product discussions into an implementation-ready capability plan that exposes ... | claude | writing-plans / grilling | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | Capability plan artifact before multi-service work; Round 2 planning. DEFER_R2. A-L:2/1/2/2/1/3/3/2/2/2/3/3 |
| `product-lens` | Use this skill to validate the "why" before building, run product diagnostics, and pressure-test product direction be... | claude | Ponytail YAGNI + grilling | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | DUP — think-before-build already covered. |
| `production-audit` | Local-evidence production readiness audit for shipped apps, pre-launch reviews, post-merge checks, and "what breaks i... | standalone-ish | delivery-gate / first-pass correctness | `3/2/3/2/1/4/4/3/3/4/4/4` | ON_DEMAND | Local-evidence prod readiness lenses (auth/data/ops) useful pre-launch; overlaps delivery-gate—use sporadically. A-L:2/1/3/3/1/4/4/3/2/3/4/3 |
| `production-scheduling` | Codified expertise for production scheduling, job sequencing, line balancing, changeover optimization, and bottleneck... | claude | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | BUSINESS_OPS. |
| `project-flow-ops` | Operate execution flow across GitHub and Linear by triaging issues and pull requests, linking active work, and keepin... | standalone-ish | github-ops | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | GitHub+Linear dual-system execution ops; Round 2. DEFER_R2. A-L:1/1/1/1/0/2/2/2/2/3/3/2 |
| `prompt-optimizer` | Analyze raw prompts, identify intent and gaps, match ECC components (skills/commands/agents/hooks), and output a ready-to-paste optimized prompt. Advisory role  | claude | ECC-catalog prompt rewriter; framework glue | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | ECC-catalog prompt rewriter; framework glue |
| `python-patterns` | Pythonic idioms, PEP 8 standards, type hints, and best practices for building robust, efficient, and maintainable Pyt... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | NICHE_LANG — Life Hub is JS; occasional scripts not worth skill. |
| `python-testing` | Python testing strategies using pytest, TDD methodology, fixtures, mocking, parametrization, and coverage requirement... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | NICHE_LANG. |
| `pytorch-patterns` | PyTorch deep learning patterns and best practices for building robust, efficient, and reproducible training pipelines... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | SCIENTIFIC/ML. |
| `quality-nonconformance` | Codified expertise for quality control, non-conformance investigation, root cause analysis, corrective action, and su... | claude | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | BUSINESS_OPS. |
| `quarkus-patterns` | Quarkus 3.x LTS architecture patterns with Camel for messaging, RESTful API design, CDI services, data access with Pa... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT. |
| `quarkus-security` | Quarkus Security best practices for authentication, authorization, JWT/OIDC, RBAC, input validation, CSRF, secrets ma... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT. |
| `quarkus-tdd` | Test-driven development for Quarkus 3.x LTS using JUnit 5, Mockito, REST Assured, Camel testing, and JaCoCo. Use when... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT. |
| `quarkus-verification` | Verification loop for Quarkus projects: build, static analysis, tests with coverage, security scans, native compilation, and diff review before release or PR. | standalone-ish | Same *-verification clone + native image; irrelevant | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | Same *-verification clone + native image; irrelevant |
| `ralphinho-rfc-pipeline` | RFC-driven multi-agent DAG execution pattern with quality gates, merge queues, and work unit orchestration. Use when ... | standalone-ish | orch-pipeline | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | RFC DAG multi-agent merge queue; ORCH. DEFER_R2. A-L:1/0/2/2/2/1/1/1/2/1/2/1 |
| `react-native-patterns` | React Native and Expo app patterns — Expo Router navigation, state separation (server/client/route/form), TanStack Qu... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | MOBILE_NATIVE. |
| `react-patterns` | React 18/19 patterns including hooks discipline, server/client component boundaries, Suspense + error boundaries, for... | standalone-ish | frontend-patterns (deep) | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT — React; Life Hub is vanilla JS. |
| `react-performance` | React and Next.js performance optimization patterns adapted from Vercel Engineering's React Best Practices (https://g... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT — React/Next perf. |
| `react-testing` | React component testing with React Testing Library, Vitest/Jest, MSW for network mocking, accessibility assertions with axe, and the decision boundary between c | standalone-ish | RTL/Vitest world; LH is node:test + Playwright — maybe MSW discipline later | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | RTL/Vitest world; LH is node:test + Playwright — maybe MSW discipline later |
| `recsys-pipeline-architect` | Design composable recommendation, ranking, and feed pipelines using the six-stage Source→Hydrator→Filter→Scorer→Selec... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT — recsys. |
| `recursive-decision-ledger` | Use when the user asks for repeated rollouts, marked decision processes, high-dimensional search, stochastic optimiza... | standalone-ish | benchmark-optimization-loop | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | Recursive rollout ledger; Round 2 autonomy. DEFER_R2. A-L:1/0/1/1/2/2/2/2/2/1/2/2 |
| `redis-patterns` | Redis data structure patterns, caching strategies, distributed locks, rate limiting, pub/sub, and connection manageme... | standalone-ish | n/a | `2/1/2/2/1/2/2/2/2/2/2/2` | DEFER_R4 | Redis caching/locks; Round 4 if needed. DEFER_R4. A-L:1/0/1/1/0/3/2/2/3/3/4/3 |
| `regex-vs-llm-structured-text` | Decision framework for choosing between regex and LLM when parsing structured text — start with regex, add LLM only f... | standalone-ish | Ponytail (stdlib first) | `3/2/3/2/1/4/4/3/3/4/4/4` | ON_DEMAND | CHALLENGE: useful rare decision tree when building parsers; Ponytail already prefers stdlib/regex. Consult on demand, do not mine into standing rules. |
| `remotion-video-creation` | Best practices for Remotion - Video creation in React. 29 domain-specific rules covering 3D, animations, audio, capti... | companions:31 | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT — Remotion React video; companion-heavy. |
| `repo-scan` | Bootstrap pointer that installs the external repo-scan skill from a pinned, reviewable commit. Use when repo-scan mus... | standalone-ish | workspace-surface-audit | `2/1/2/2/1/2/2/2/2/2/2/2` | DEFER_R4 | External install pointer for asset audit; Round 4. DEFER_R4. A-L:1/0/1/1/0/1/1/1/2/2/3/1 |
| `research-ops` | Evidence-first current-state research workflow for ECC. Use when the user wants fresh facts, comparisons, enrichment,... | standalone-ish | deep-research / Firecrawl skills | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | ECC evidence-first research workflow; Round 2. DEFER_R2. A-L:1/1/2/1/0/2/2/2/2/3/3/2 |
| `returns-reverse-logistics` | Codified expertise for returns authorization, receipt and inspection, disposition decisions, refund processing, fraud... | claude | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | BUSINESS_OPS. |
| `rules-distill` | Scan skills to extract cross-cutting principles and distill them into rules — append, revise, or create new rule file... | companions:2 | Ponytail / coding-standards | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | Distill skills→rules; Round 2 meta, high ceremony. DEFER_R2. A-L:1/1/2/1/1/2/2/2/2/2/2/2 |
| `rust-patterns` | Idiomatic Rust patterns, ownership, error handling, traits, concurrency, and best practices for building safe, perfor... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | NICHE_LANG. |
| `rust-testing` | Rust testing patterns including unit tests, integration tests, async testing, property-based testing, mocking, and co... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | NICHE_LANG. |
| `safety-guard` | Use this skill to prevent destructive operations when working on production systems or running agents autonomously. | hooks | Destructive-command / freeze PreToolUse hooks | `2/1/2/2/1/2/2/2/2/2/2/2` | DEFER_R4 | Destructive-command / freeze PreToolUse hooks |
| `santa-method` | Multi-agent adversarial verification with convergence loop. Two independent review agents must both pass before outpu... | claude | verification-loop / delivery-gate | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | Adversarial dual-review loop; Round 2 agent procedure, high cost. DEFER_R2. A-L:2/1/3/3/2/2/2/2/2/1/2/2 |
| `scientific-db-pubmed-database` | Direct PubMed and NCBI E-utilities search workflows for biomedical literature, MeSH queries, PMID lookup, citation re... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | SCIENTIFIC. |
| `scientific-db-uspto-database` | USPTO patent and trademark data workflow for official record lookup, PatentSearch queries, TSDR checks, assignment da... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | SCIENTIFIC. |
| `scientific-pkg-gget` | gget CLI and Python workflow for quick genomic database queries, sequence lookup, BLAST-style searches, enrichment ch... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | SCIENTIFIC. |
| `scientific-thinking-literature-review` | Systematic literature-review workflow for academic, biomedical, technical, and scientific topics, including search pl... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | SCIENTIFIC. |
| `scientific-thinking-scholar-evaluation` | Structured scholarly-work evaluation for papers, proposals, literature reviews, methods sections, evidence quality, c... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | SCIENTIFIC. |
| `search-first` | Research-before-coding workflow. Search for existing tools, libraries, and patterns before writing custom code. Invokes the researcher agent. | claude,mcp | Duplicate of Ponytail ladder + research-before-code | `2/2/1/2/1/4/4/2/1/4/4/4` | REJECT | Duplicate of Ponytail ladder + research-before-code |
| `security-bounty-hunter` | Hunt for exploitable, bounty-worthy security issues in repositories. Focuses on remotely reachable vulnerabilities th... | standalone-ish | security-review | `2/1/2/2/1/2/2/2/2/2/2/2` | DEFER_R4 | Remote-vuln bounty hunt; Round 4. DEFER_R4. A-L:1/0/2/2/0/3/3/2/3/2/2/3 |
| `security-review` | Use this skill when adding authentication, handling user input, working with secrets, creating API endpoints, or impl... | companions:1 | existing auth rules | `3/2/2/2/1/3/3/2/2/2/3/3` | DEFER_R4 | Broad auth/secrets/input checklist; Round 4 security. A-L:3/2/3/3/1/3/4/2/2/3/3/3 DEFER_R4. |
| `security-scan` | Scan your Claude Code configuration (.claude/ directory) for security vulnerabilities, misconfigurations, and injecti... | claude,hooks,mcp | safety-guard / hookify | `2/1/2/2/1/2/2/2/2/2/2/2` | DEFER_R4 | AgentShield scan of ~/.claude; Round 4 FRAMEWORK. DEFER_R4. A-L:0/1/1/0/1/0/0/1/1/2/2/1 |
| `seo` | Audit, plan, and implement SEO improvements across technical SEO, on-page optimization, structured data, Core Web Vit... | standalone-ish | GitHub Pages hub sites | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | GENERIC — occasional SEO not worth a skill; use ad-hoc. |
| `skill-comply` | Visualize whether skills, rules, and agent definitions are actually followed — auto-generates scenarios at 3 prompt s... | companions:20 | eval-harness | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | Skill compliance measurement harness; Round 2 eval ORCH. DEFER_R2. A-L:1/0/2/2/2/1/1/1/2/1/2/1 |
| `skill-scout` | Search existing local, marketplace, GitHub, and web skill sources before creating a new skill. Use when the user want... | claude | search-first | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | Meta skill search before creating skills; Round 2 meta. DEFER_R2. A-L:2/1/2/1/0/3/2/3/3/3/3/3 |
| `skill-stocktake` | Use when auditing Claude skills and commands for quality. Supports Quick Scan (changed skills only) and Full Stocktak... | claude,memory,companions:3 | this audit | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | ECC skill quality stocktake; FRAMEWORK meta. DEFER_R2. A-L:1/0/1/1/0/1/1/1/2/2/3/2 |
| `social-graph-ranker` | Weighted social-graph ranking for warm intro discovery, bridge scoring, and network gap analysis across X and LinkedI... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | MARKETING. |
| `social-publisher` | Agent-driven scheduling and publishing of social media posts across 13 platforms via SocialClaw. Use when the user wa... | claude | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | MARKETING — SocialClaw. |
| `springboot-patterns` | Spring Boot architecture patterns, REST API design, layered services, data access, caching, async processing, and log... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT. |
| `springboot-security` | Spring Security best practices for authn/authz, validation, CSRF, secrets, headers, rate limiting, and dependency sec... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT. |
| `springboot-tdd` | Test-driven development for Spring Boot using JUnit 5, Mockito, MockMvc, Testcontainers, and JaCoCo. Use when adding ... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT. |
| `springboot-verification` | Verification loop for Spring Boot projects: build, static analysis, tests with coverage, security scans, and diff review before release or PR. | standalone-ish | Same *-verification clone for Java; irrelevant stack | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | Same *-verification clone for Java; irrelevant stack |
| `strategic-compact` | Suggests manual context compaction at logical intervals to preserve context through task phases rather than arbitrary auto-compaction. Use when a session is app | claude,hooks,memory,mcp | Claude `/compact` phase boundaries + PreToolUse hooks | `2/1/2/1/3/1/1/1/2/1/2/2` | DEFER_R3 | Claude `/compact` phase boundaries + PreToolUse hooks |
| `swift-actor-persistence` | Thread-safe data persistence in Swift using actors — in-memory cache with file-backed storage, eliminating data races... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | MOBILE_NATIVE. |
| `swift-concurrency-6-2` | Swift 6.2 Approachable Concurrency — single-threaded by default, @concurrent for explicit background offloading, isol... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | MOBILE_NATIVE. |
| `swift-protocol-di-testing` | Protocol-based dependency injection for testable Swift code — mock file system, network, and external APIs using focu... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | MOBILE_NATIVE. |
| `swiftui-patterns` | SwiftUI architecture patterns, state management with @Observable, view composition, navigation, performance optimizat... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | MOBILE_NATIVE. |
| `taste` | A creative-direction (taste) layer for music videos and short-form edits in the angelcore / cloud-trance / hyperpop v... | companions:1 | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT — music-video aesthetic. |
| `tasteforge-video` | Use for file-driven multimodal image, video, and 3D-asset discovery; taste interviews; distill or apply workflows; st... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT. |
| `tdd-workflow` | Use this skill when writing new features, fixing bugs, or refactoring code. Enforces test-driven development with 80%+ coverage including unit, integration, and | standalone-ish | Heavy TDD ceremony + 80% coverage; LH TDD is explicit-only; conflicts Ponytail | `2/1/2/2/2/2/1/1/1/1/3/2` | REJECT | Heavy TDD ceremony + 80% coverage; LH TDD is explicit-only; conflicts Ponytail |
| `team-agent-orchestration` | Run team-based orchestration for agent squads using work items, ownership, agent Kanban, merge gates, and control pane handoffs. Use when coordinating an agent  | claude | Agent Kanban / squad ownership procedures | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | Agent Kanban / squad ownership procedures |
| `team-builder` | Interactive agent picker for composing and dispatching parallel teams. Use when composing and dispatching a parallel ... | claude | team-agent-orchestration | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | Interactive parallel agent picker; ORCH. DEFER_R2. A-L:0/1/1/1/2/0/1/1/1/1/2/1 |
| `terminal-opener` | Open an executable and its argument array in a visible terminal window through a reusable, shell-free launch plan wit... | companions:2 | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | GENERIC — open terminal window helper. |
| `terminal-ops` | Evidence-first repo execution workflow for ECC. Use when the user wants a command run, a repo checked, a CI failure d... | standalone-ish | first-pass correctness | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | ECC evidence-first terminal execution; Round 2 FRAMEWORK. DEFER_R2. A-L:1/1/2/2/1/2/2/2/2/2/3/2 |
| `tinystruct-patterns` | Expert guidance for developing with the tinystruct Java framework. Use when working on the tinystruct codebase or any... | mcp,companions:6 | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT — tinystruct Java. |
| `token-budget-advisor` | Offers the user an informed choice about how much response depth to consume before answering. Use this skill when the user explicitly wants to control response  | claude | Response-depth chooser UI; zero ACI value; high ceremony | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | Response-depth chooser UI; zero ACI value; high ceremony |
| `ui-demo` | Record polished UI demo videos using Playwright. Use when the user asks to create a demo, walkthrough, screen recordi... | standalone-ish | walkthrough-artifacts + RecordScreen | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | DUP — Cursor already records Playwright/demo artifacts. |
| `ui-to-vue` | Use when the user has UI screenshots or design exports that need batch conversion into Vue 3 components, especially w... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT — Vue conversion. |
| `uncloud` | Use when managing an Uncloud cluster — deploying services, configuring Caddy ingress, adding static proxy routes for ... | standalone-ish | n/a | `2/1/2/2/1/2/2/2/2/2/2/2` | DEFER_R4 | Uncloud cluster ops; Round 4 infra niche. DEFER_R4. A-L:0/0/0/0/0/1/0/1/2/2/3/1 |
| `unified-memory` | Share durable, inspectable context and handoffs between Claude, Codex, Hermes, Cursor, OpenCode, and other agents through the local ECC Memory Vault. Use when a | memory,mcp | ECC Memory Vault (`ecc-universal`) cross-harness store | `2/1/2/1/4/1/1/1/2/1/2/2` | DEFER_R3 | ECC Memory Vault (`ecc-universal`) cross-harness store |
| `unified-notifications-ops` | Operate notifications as one ECC-native workflow across GitHub, Linear, desktop alerts, hooks, and connected communic... | hooks,mcp | hooks / github-ops | `2/1/2/1/2/2/2/2/2/2/2/2` | DEFER_R2 | ECC notification routing across hooks; Round 2/4. DEFER_R2. A-L:1/1/1/1/1/1/1/1/1/2/2/1 |
| `verification-loop` | A comprehensive verification system for Claude Code sessions. Use when verifying a Claude Code session's work before claiming it is complete. | claude,hooks | Generic build/type/lint/test bureaucracy; duplicates first-pass + Superpowers ve | `2/2/1/1/2/4/2/3/1/2/4/3` | REJECT | Generic build/type/lint/test bureaucracy; duplicates first-pass + Superpowers verification |
| `video-editing` | AI-assisted video editing workflows for cutting, structuring, and augmenting real footage. Covers the full pipeline f... | claude | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT. |
| `videodb` | See, Understand, Act on video and audio. See- ingest from local files, URLs, RTSP/live feeds, or live record desktop;... | memory,companions:11 | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT — VideoDB platform; companion-heavy. |
| `visa-doc-translate` | Translate visa application documents (images) to English and create a bilingual PDF with original and translation. Us... | companions:1 | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT. |
| `vite-patterns` | Vite build tool patterns including config, plugins, HMR, env variables, proxy setup, SSR, library mode, dependency pr... | standalone-ish | existing Vite SPA configs | `3/2/3/3/1/4/5/3/3/4/4/4` | ON_DEMAND | Stack match, but 450-line React/Vue/SSR encyclopedia; keep out of standing context, consult only for envPrefix/proxy/prebundle pitfalls. A-L:3/2/3/2/0/3/4/2/3/3 |
| `vue-patterns` | Vue.js 3 Composition API patterns, component architecture, reactivity best practices, Pinia state management, Vue Rou... | standalone-ish | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | IRRELEVANT — Vue. |
| `windows-desktop-e2e` | E2E testing for Windows native desktop apps (WPF, WinForms, Win32/MFC, Qt) using pywinauto and Windows UI Automation. Use when writing E2E tests for a Windows n | standalone-ish | pywinauto/UIA desktop; no LH Windows native app surface | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | pywinauto/UIA desktop; no LH Windows native app surface |
| `workspace-surface-audit` | Audit the active repo, MCP servers, plugins, connectors, env surfaces, and harness setup, then recommend the highest-value ECC-native skills, hooks, agents, and | claude,mcp | ECC setup/recommendation skill; not Life Hub product work | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | ECC setup/recommendation skill; not Life Hub product work |
| `x-api` | X/Twitter API integration for posting tweets, threads, reading timelines, search, and analytics. Covers OAuth auth pa... | claude | n/a | `1/1/0/0/0/3/1/2/1/3/3/3` | REJECT | MARKETING — Twitter API. |

---

## Full-skill recommendations (EXTRACT NOW)

**None.**

No ECC skill cleared: real Life Hub problem + materially distinct value + self-contained extraction + low instruction/behavioural cost + better than strengthening an existing rule.

Closest near-miss for a *standalone* skill was `click-path-audit`, but the useful core is ~one procedure that belongs inside first-pass / diagnosing-bugs, not a new always-on or task-matched ECC workflow with slash-command framing.

### Shortlist 1 — Highest-value full skills

| Rank | Skill | Notes |
|---:|---|---|
| — | — | Empty by design |

---

## Mechanisms worth stealing (MINE A MECHANISM)

### Shortlist 2

| Rank | Source skill | Exact mechanism (summary) | Strengthens | Smallest adaptation |
|---:|---|---|---|---|
| 1 | `click-path-audit` | Store `{sets,resets}` map + ordered handler trace for Sequential Undo / races | first-pass + diagnosing-bugs UI branch | ~8–15 lines; no agent fleet |
| 2 | `agent-architecture-audit` | Distillation pseudo-facts; user corrections > agent assertions | agent-context-integrity | ~5–10 lines; defer 12-layer audit |
| 3 | `ai-regression-testing` | Dual-path (fixture/live or Pages/API) contract parity; self-review ≠ evidence | first-pass boundaries | ~3–6 lines; drop Vitest/Next |
| 4 | `browser-qa` | No visual baseline ⇒ INCONCLUSIVE; no mutating prod journeys | first-pass evidence honesty | ~2–4 lines |
| 5 | `intent-driven-development` | Must / Must-not / Verify ACs; don’t invent business rules | first-pass (+ grilling when explicit) | ~2–5 lines |


### M1. `click-path-audit`

- **Upstream path:** `skills/click-path-audit/SKILL.md`
- **Exact mechanism:** Before trusting a shared-state UI change: (1) build a store side-effect map `action → {sets, resets}` and flag dangerous resets (actions that clear state they do not own); (2) for each touched control, trace handler calls in order (READ/WRITE/SIDE EFFECTS); (3) check Sequential Undo, Async Race, Stale Closure, Missing Transition, Conditional Dead Path, useEffect Interference; (4) verdict = whether final state matches what the control label promises.
- **Evidence:** skills/click-path-audit/SKILL.md — “DANGEROUS RESETS (actions that clear state they don't own)”; Pattern 1 Sequential Undo; per-touchpoint ordered trace template.
- **Strengthens:** `.cursor/rules/first-pass-correctness.mdc` (UI/shared-state section) and/or `.cursor/skills/diagnosing-bugs/SKILL.md` as a UI-specific Phase-1 loop option when “button does nothing” survives unit green.
- **Why it improves behaviour:** First-pass already requires exercising the real path, but not this cancellation analysis. diagnosing-bugs builds a red loop, but does not prescribe mapping store resets vs sets. Life Hub SPAs (fitness, tasks, chat confirm flows) are exactly shared-store surfaces where individual functions “work” while the UI lies.
- **Smallest sensible adaptation:** Add ~8–15 lines under first-pass “Exercise the real user path” / “Validate boundaries” for shared UI state: require a sets/resets map when touching store actions, and a sequential-undo check when a control still fails after handlers look correct. Do not import agent-fleet splitting or slash commands.
- **Dependency surface:** None required. Slash `/click-path-audit` is cosmetic. No hooks/MCP/agents.
- **Conflicts:** None material with Ponytail if kept short. Full skill’s multi-agent store-mapping fleet would conflict with Ponytail — do not import that.
- **Recommended later activation:** Mechanism in always-on first-pass for UI/store tasks; optional explicit diagnosing-bugs branch.
- **Challenge pass:** Ordinary Cursor sometimes notices races; it rarely builds an explicit sets/resets map. Not covered by Matt/Superpowers. Survives “would we notice in six months?” for Life Hub UI bugs.

### M2. `agent-architecture-audit`

- **Upstream path:** `skills/agent-architecture-audit/SKILL.md`
- **Exact mechanism:** Treat distillation/summary/digest artifacts as a first-class failure mode: compressed artifacts can re-enter context as pseudo-facts. Tighten memory/context admission so user corrections outrank agent assertions; prevent agent monologue from becoming durable memory authority.
- **Evidence:** skills/agent-architecture-audit/SKILL.md — Layer 4 Distillation “Compressed artifacts re-entering as pseudo-facts”; Common Failure “Same-session artifacts re-enter as pseudo-facts”; fix order “Tighten distillation triggers”; “Tighten memory admission — user corrections > agent assertions”; Q7 monologue→memory poisoning.
- **Strengthens:** `.cursor/rules/agent-context-integrity.mdc` under precedence / no-silent-context-loss / Interpretation.
- **Why it improves behaviour:** ACI already forbids silent *loss* and requires Availability→Behaviour. It does not currently require proving digests cannot *invent or over-authorize* constraints relative to fresher source data or user corrections. Life Hub digest/formatter paths (pain flags, workout notes, Clare briefs) are exactly where summaries become the model’s “reality”.
- **Smallest sensible adaptation:** Add ~5–10 lines: digests/agent notes are derived context; verify they cannot override fresher sources or user corrections; add a negative control where a thin digest must not imply full source presence. Defer the rest of the 12-layer audit to Round 3.
- **Dependency surface:** None for the two mechanisms. Full skill assumes broad agent-stack audit ceremony — do not import.
- **Conflicts:** Importing the full 12-layer release gate would fight Ponytail and ACI’s “no huge AI-eval framework”. Mechanism-only is compatible.
- **Recommended later activation:** Always-on ACI amendment (tiny).
- **Challenge pass:** Survives: specific Life Hub failure class (context present-but-wrong authority), not just missing. Ordinary Cursor will not invent this gate.

### M3. `ai-regression-testing`

- **Upstream path:** `skills/ai-regression-testing/SKILL.md`
- **Exact mechanism:** Dual-path contract parity: when a change touches a fixture/sandbox/mock path and a live/production path (or Pages vs Netlify-adjacent API behaviour), assert the same response *shape/contract* on both. Also: AI self-review of its own diff is non-evidence; name regression tests after the bug.
- **Evidence:** skills/ai-regression-testing/SKILL.md — “sandbox/production path inconsistency is the #1 AI-introduced regression”; “AI writes fix → AI reviews fix → AI says looks correct → Bug still exists”; “Name tests after the bug (e.g., BUG-R1 regression)”.
- **Strengthens:** `.cursor/rules/first-pass-correctness.mdc` boundary list (already has GitHub Pages ↔ Netlify Functions) with an explicit dual-path shape check; diagnosing-bugs Phase 5 naming hint.
- **Why it improves behaviour:** Self-review non-evidence overlaps Superpowers `verification-before-completion`, but dual-path shape parity is a sharper Life Hub-specific reinforcement for the Pages/API split and fixture vs live handlers. Drop Vitest/Next/SANDBOX_MODE scaffolding.
- **Smallest sensible adaptation:** 3–6 lines in first-pass under Validate boundaries / Exercise real path: if two modes exist, prove contract parity or explicitly mark the unchecked mode unverified.
- **Dependency surface:** Claude `/bug-check` command and Vitest helpers must not be imported.
- **Conflicts:** Full skill’s mandatory coverage theatre conflicts with Ponytail and explicit-only Matt tdd — mine rules only.
- **Recommended later activation:** Always-on first-pass bullets.
- **Challenge pass:** Bug-named regressions partially duplicate diagnosing-bugs Phase 5 — kept only as naming emphasis; dual-path is the unique keep.

### M4. `browser-qa`

- **Upstream path:** `skills/browser-qa/SKILL.md`
- **Exact mechanism:** Visual/a11y honesty rules: no visual baseline ⇒ report INCONCLUSIVE (never silent PASS); mutating journeys require staging/preview + explicit opt-in (not production); axe clean is necessary-not-sufficient (still need keyboard/focus).
- **Evidence:** skills/browser-qa/SKILL.md — “no baseline ⇒ report INCONCLUSIVE, never a silent PASS”; mutating journey production ban; axe honesty.
- **Strengthens:** first-pass correctness evidence section + Cloud/walkthrough testing notes / walkthrough-artifacts skill usage.
- **Why it improves behaviour:** Fidelity ladder already prefers browser proof, but agents still mark visual work “done” without baselines. INCONCLUSIVE-as-non-pass is the steal.
- **Smallest sensible adaptation:** 2–4 lines in first-pass “Ban should work” / final reports: visual claims without baseline = Not verified/INCONCLUSIVE.
- **Dependency surface:** Do not import Browserbase/Puppeteer MCP requirements; Life Hub already has Playwright + computerUse/walkthrough paths.
- **Conflicts:** Low if mechanism-only. Full browser-qa skill duplicates first-pass phases.
- **Recommended later activation:** Always-on first-pass evidence honesty.
- **Challenge pass:** Survives as honesty rule; phases rejected as DUP.

### M5. `intent-driven-development`

- **Upstream path:** `skills/intent-driven-development/SKILL.md`
- **Exact mechanism:** When acceptance is ambiguous or high-impact (auth/data/migration), write observable acceptance criteria that include explicit **Must not** outcomes and a verification method — and do not invent business rules from repo archaeology alone.
- **Evidence:** skills/intent-driven-development/SKILL.md — Must not examples; rejection of inferred per-tier business rules without user intent; AC template with verification method.
- **Strengthens:** first-pass “Test the exact requested outcome” + grilling (when explicitly invoked) for ambiguous product intent.
- **Why it improves behaviour:** First-pass focuses on verifying the requested outcome; it under-specifies stating prohibited outcomes. Grill covers interviewing but is explicit-only. A thin Must-not bullet reduces silent scope invention.
- **Smallest sensible adaptation:** 2–5 lines in first-pass: for non-trivial behavioural work, state Must/Must-not/Verify; never promote guessed product rules to acceptance.
- **Dependency surface:** Full IDD skill has ECC process weight — do not import. No hooks.
- **Conflicts:** Heavy AC ceremony would fight Ponytail; keep to a few lines. Do not make grilling auto-fire.
- **Recommended later activation:** Always-on thin first-pass bullet.
- **Challenge pass:** Borderline — 80% may already come from “understand requested outcome”. Kept because Must-not is cheap and targets a real over-implementation failure mode. Lowest priority mine.

---

## Correctness findings

### First-pass software correctness

Life Hub’s first-pass guardrail is already stronger than ECC’s `verification-loop` (build/type/lint/test/secret-grep/diff report). Superpowers `verification-before-completion` already bans success claims without fresh evidence.

**What ECC adds beyond the current guardrail:**

1. **Shared-store cancellation analysis** (`click-path-audit`) — not present today.
2. **Dual-path contract parity** (`ai-regression-testing`) — sharpens existing Pages↔Netlify boundary note.
3. **Visual INCONCLUSIVE-without-baseline** (`browser-qa`) — honesty rule for visual claims.
4. **Must-not acceptance** (`intent-driven-development`) — thin AC completeness.

**What ECC does *not* beat us on:** phased verification bureaucracy (`verification-loop`), Playwright encyclopedias (`e2e-testing`), framework `*-verification` clones, 80% coverage TDD theatre (`tdd-workflow`), multi-agent GAN eval loops (`gan-style-harness`).

**Single most valuable mechanism for first-pass:** `click-path-audit` store sets/resets + sequential-undo verdict.

### AI Agent Context Integrity

Life Hub’s ACI already requires full pipeline tracing and four contracts, personality-path verification, precedence, multi-turn continuity, negative controls, and no silent loss.

**What ECC adds beyond the current guardrail:**

1. **Pseudo-fact / distillation re-entry** and **user-corrections > agent-assertions memory admission** (`agent-architecture-audit`) — genuine ACI gap.

**Deferred (Round 3), not Round 1 mines:** unified memory vault, strategic compact, context/token budget advisors, continuous-learning instincts, agent harness construction, iterative retrieval, cost-aware model routing, autonomous loops.

**Rejected as ACI help:** `agent-eval` (coding-agent bakeoffs), `agent-self-evaluation` (scorecard ceremony), `agent-introspection-debugging` (duplicates diagnosing-bugs), `openclaw-persona-forge` (wrong personality system).

**Single most valuable mechanism for ACI:** distillation/pseudo-facts + memory-admission priority from `agent-architecture-audit`.

---

## Dependency and conflict analysis (shortlisted)

| Candidate | Quiet dependencies | Conflicts with LH | Integration surface if mined |
|---|---|---|---|
| click-path-audit | Slash naming only | Multi-agent fleet vs Ponytail if over-imported | ~8–15 lines in first-pass/diagnosing-bugs |
| agent-architecture-audit | Full 12-layer audit ceremony | Huge always-on audit vs Ponytail/ACI anti-framework | ~5–10 lines in ACI only |
| ai-regression-testing | Claude `/bug-check`, Vitest/Next examples | Coverage theatre vs explicit-only tdd | ~3–6 lines dual-path in first-pass |
| browser-qa | Browser MCP vendors | Phase checklist DUP first-pass | ~2–4 honesty lines |
| intent-driven-development | Broader IDD process kit | AC bureaucracy vs Ponytail if expanded | ~2–5 Must-not lines |

No shortlisted candidate requires ECC agents, hooks, continuous-learning, or `ecc-universal` MCP if mined as described.

---

## Later-round handoff

### Shortlist 3

### Round 2 — specialist agents / procedures (38)

Handoff only; do not audit fully now:

`agent-sort`, `automation-audit-ops`, `benchmark-optimization-loop`, `blueprint`, `council`, `council-multi-model`, `dev-team`, `dynamic-workflow-mode`, `ecc-recipes`, `email-ops`, `hermes-imports`, `loop-design-check`, `messages-ops`, `nasiko-control-plane`, `orch-add-feature`, `orch-build-mvp`, `orch-change-feature`, `orch-fix-defect`, `orch-pipeline`, `orch-refine-code`, `parallel-execution-optimizer`, `plan-canvas`, `plan-orchestrate`, `product-capability`, `project-flow-ops`, `ralphinho-rfc-pipeline`, `react-testing`, `recursive-decision-ledger`, `research-ops`, `rules-distill`, `santa-method`, `skill-comply`, `skill-scout`, `skill-stocktake`, `team-agent-orchestration`, `team-builder`, `terminal-ops`, `unified-notifications-ops`

Notes: includes `council`, `council-multi-model`, `dev-team`, `team-agent-orchestration`, `blueprint`, `plan-orchestrate`, `orch-*`, `santa-method`, `agent-sort`, `dmux`-adjacent orchestration, ECC recipe catalogs, etc. Also specialist *agent markdown* under ECC `agents/` is Round 2 inventory, not counted in the {N} skills.

### Round 3 — agent runtime / context / memory / routing / learning (15)

`agent-harness-construction`, `agentic-os`, `autonomous-loops`, `ck`, `context-budget`, `continuous-agent-loop`, `continuous-learning-v2`, `cost-aware-llm-pipeline`, `eval-harness`, `growth-log`, `iterative-retrieval`, `knowledge-ops`, `living-docs-governance`, `strategic-compact`, `unified-memory`

Plus deferred mechanisms from `agent-architecture-audit` (wrapper regression falsification, code-gated tools, hidden repair loops) and memory-trust lines from `unified-memory`.

### Round 4 — security / verification infrastructure / hooks (24)

`codehealth-mcp`, `config-gc`, `cost-tracking`, `dashboard-builder`, `database-migrations`, `deployment-patterns`, `docker-patterns`, `ecc-tools-cost-audit`, `enterprise-agent-ops`, `flox-environments`, `gateguard`, `hookify-rules`, `kubernetes-patterns`, `latency-critical-systems`, `mysql-patterns`, `postgres-patterns`, `prisma-patterns`, `redis-patterns`, `repo-scan`, `safety-guard`, `security-bounty-hunter`, `security-review`, `security-scan`, `uncloud`

Notably: `security-review`, `security-scan`, `gateguard`, `safety-guard`, `hookify-rules`, `delivery-gate` companions, CodeScene/`codehealth-mcp`, config GC, deploy/docker encyclopedias. Do not soft-import hooks in Round 1.

---

## ON DEMAND / REFERENCE (not persistent)

Consult only when the task matches; do not install as always-on project skills:

- `accessibility` — WCAG 2.2 POUR checklist is stack-agnostic enough for vanilla SPAs; pull when auditing keyboard/contrast/SR, not as standing rule. A-L:3/2/3/3/1/4/4/3/3/4/4/4
- `api-connector-builder` — House-style connector workflow (learn pattern→narrow→match layers) is a thin useful procedure when adding Netlify/API integrations. A-L:2/2/3/3/1/5/4/4/3/4/4/4
- `canary-watch` — Post-deploy smoke checklist; useful ops pattern, not always-on skill
- `codebase-onboarding` — Recon→CLAUDE.md procedure; LH already has AGENTS.md/CLAUDE.md
- `dmux-workflows` — tmux parallel coding panes when Adam asks; not product ACI
- `github-ops` — Untrusted issue/PR/CI-log instruction hygiene is the unique bit; rest is generic gh. A-L:2/2/3/2/1/4/4/3/3/4/4/4
- `make-interfaces-feel-better` — Optical alignment/concentric radius/hit-area polish is useful, but design-kit is authoritative—invoke subordinately, never as competing system. A-L:2/2/3/2/0/4/3/3/2/3/4/4
- `mcp-server-patterns` — When building/debugging an MCP server
- `opensource-pipeline` — Sanitizer/forker idea valuable before any public extract from private store; full 3-agent ORCH is heavy—mine checklist on demand only. A-L:1/1/3/2/1/2/3/2/3/2/3/2
- `production-audit` — Local-evidence prod readiness lenses (auth/data/ops) useful pre-launch; overlaps delivery-gate—use sporadically. A-L:2/1/3/3/1/4/4/3/2/3/4/3
- `regex-vs-llm-structured-text` — CHALLENGE: useful rare decision tree when building parsers; Ponytail already prefers stdlib/regex. Consult on demand, do not mine into standing rules.
- `vite-patterns` — Stack match, but 450-line React/Vue/SSR encyclopedia; keep out of standing context, consult only for envPrefix/proxy/prebundle pitfalls. A-L:3/2/3/2/0/3/4/2/3/3/4/3

---

## Rejected patterns

Recurring categories Life Hub should deliberately **not** import from ECC’s skill layer:

| Pattern | Why reject | Examples |
|---|---|---|
| Verification bureaucracy | First-pass forbids process theatre; Superpowers already gates claims | `verification-loop`, `*-verification` clones |
| Whole-SDLC / TDD operating systems | Conflicts with explicit-only Matt tdd + Ponytail | `tdd-workflow`, `intent-driven-development` (full) |
| ECC framework glue | Installers, guides, memory vaults, cost trackers | `configure-ecc`, `ecc-guide`, `ecc-recipes`, `unified-memory` |
| Claude Code hooks/commands | Wrong harness; Round 4 if ever | `delivery-gate`, `gateguard`, `hookify-rules`, `strategic-compact` |
| Autonomy / fleets | Dangerous initiative; anti-Ponytail | `autonomous-agent-harness`, `claude-devfleet`, `gan-style-harness` |
| Wrong-stack encyclopedias | Zero LH usefulness | Django/Laravel/Spring/Quarkus/Kotlin/Swift/Go/Rust/… |
| Design-direction generators | Conflicts with `packages/design-kit` | `design-system`, `frontend-design-direction`, `liquid-glass-design` |
| Marketing/business/homelab/healthcare/defi/scientific packs | Irrelevant domain | large REJECT set |
| Duplicate simplicity advice | Ponytail already stricter | `coding-standards`, `search-first`, `product-lens` |
| Second debug rituals | diagnosing-bugs is the chosen procedure | `agent-introspection-debugging`, Superpowers collision risks |

Approximate REJECT reason-code hits (heuristic, non-exclusive):

- IRRELEVANT: 47
- NICHE_LANG: 21
- BUSINESS_OPS: 18
- OTHER: 14
- DUP: 12
- GENERIC: 11
- MOBILE_NATIVE: 10
- CRYPTO_DEFI: 8
- MARKETING: 7
- FRAMEWORK: 7
- HOMELAB: 7
- SCIENTIFIC: 7
- DESIGN_KIT_CONFLICT: 6
- HEALTHCARE: 5
- DEPENDENCY_CHAIN: 4
- COST: 2
- AUTONOMY: 2
- ORCH: 2
- ABSTRACTION: 2

---

## Proposed Round 1 extraction plan (DO NOT EXECUTE)

Pending user approval only:

1. **Do not install ECC**, any ECC adapter, hooks, agents, commands, or memory MCP.
2. **Do not add** any new `.cursor/skills/*` from ECC.
3. Draft a minimal patch set (separate task) that only edits:
   - `.cursor/rules/first-pass-correctness.mdc` — click-path sets/resets+sequential-undo; dual-path contract parity; visual INCONCLUSIVE; Must/Must-not/Verify bullet.
   - `.cursor/rules/agent-context-integrity.mdc` — distillation/pseudo-fact gate; user-corrections > agent-assertions admission.
   - Optionally one short subsection in `.cursor/skills/diagnosing-bugs/SKILL.md` pointing at the UI store-cancellation loop when the symptom is “control does nothing” after green unit tests.
4. Keep total new instruction **under ~40 lines across all files**.
5. Re-read Ponytail after drafting; delete any line that restates existing rules.
6. Validate with one UI shared-state bugfix scenario and one agent digest/precedence scenario (tests or manual), then stop.

Activation mode for mined mechanisms: **always-on via existing guardrails** (not new skills). ON_DEMAND list stays uninstalled.

---

## Evidence & method notes

- Live clone of `affaan-m/ecc` at audit time; SHA recorded via `git rev-parse HEAD`.
- Skill count = number of `skills/*/SKILL.md` files (286), not README marketing.
- Every skill classified into exactly one primary bucket; promising candidates deep-read from full `SKILL.md` (+ companions where present).
- Life Hub baseline read from repo rules/skills on `origin/main` plus local Ponytail/umbrella/README/plan/design-kit/package scripts/CI.
- `.agents/skills/` mirrors were not double-counted.

---

## Audit hygiene

- No branch created
- No commit / push / PR / merge
- No ECC install
- No modifications to application source, rules, skills, hooks, dependencies, or config beyond writing this report

Report path: `ECC_ROUND_1_SKILLS_AUDIT.md`

