# ECC Round 2 — Specialist Agents & Procedures Audit

**Status:** Audit only. No ECC agents installed. No Life Hub source, rules, skills, config, or dependencies modified except this report.

**Scope clarification:** “Life Hub” here means the **entire umbrella** — Teaching, Knowledge, Tasks, Life, shared design kit, shared auth/API, and personality-agent surfaces — not a single app.

**Governing question:** What expert procedures are buried inside ECC’s specialist agents (and Round‑1 deferred agent/procedure skills) that are worth stealing **without** importing ECC’s agent swarm, orchestration model, or duplicate processes?

---

## Executive summary

| Field | Value |
|---|---|
| Upstream | https://github.com/affaan-m/ecc |
| Pinned SHA (same as Round 1) | `e04ea0b9cc8248686edf5ac751cadff550e162b8` |
| Commit date | 2026-09-03 16:51:15 -0400 |
| Version | **2.2.1** |
| Audit date | 2026-09-05 |
| Canonical agent directory | `agents/*.md` |
| Agents discovered & audited | **68** |
| Round 1 DEFER_R2 skills reclassified | **38** |
| Total Round 2 analysis units | **106** (68 agents + 38 deferred skills) |
| Round 1 report | `ECC_ROUND_1_SKILLS_AUDIT.md` |

### Classification counts

#### A. Agents (`agents/*.md`) — 68

| Bucket | Count |
|---|---:|
| EXTRACT_PROCEDURE_NOW | 0 |
| MINE_MECHANISM | 9 |
| ON_DEMAND_SPECIALIST | 5 |
| ACTUAL_AGENT_CANDIDATE | 0 |
| DEFER_R3 | 4 |
| DEFER_R4 | 2 |
| REJECT | 48 |
| **Total** | **68** |

#### B. Round 1 deferred skills reclassified — 38

| Bucket | Count |
|---|---:|
| EXTRACT_PROCEDURE_NOW | 0 |
| MINE_MECHANISM | 4 |
| ON_DEMAND_SPECIALIST | 7 |
| ACTUAL_AGENT_CANDIDATE | 0 |
| DEFER_R3 | 4 |
| DEFER_R4 | 3 |
| REJECT | 20 |
| **Total** | **38** |

### Headline

- **ACTUAL AGENT CANDIDATE: 0.** No ECC agent cleared the bar for permanent Life Hub subagent architecture.
- **EXTRACT PROCEDURE NOW: 0.** Nothing needs a new standalone Life Hub procedure file; value is small mechanisms folded into existing rules/skills.
- **Strongest agent-derived mines:** `code-reviewer` anti-noise proof gates; `silent-failure-hunter` greppable swallow patterns.
- **Strongest deferred-skill mines:** `santa-method` both-must-pass isolation (high-stakes only); `orch-pipeline` size tier + human gates + security triggers (sans agent map); `product-capability` constraints/non-goals/open questions (strengthens Round 1 intent).
- **Most dangerous pattern to avoid:** multi-agent orchestration that treats another agent’s assertion as evidence (`/orchestrate`, GAN loops, team Kanban, dual reviewers as default).

### Challenge pass

Downgraded relative to exploratory batch notes:

- Subagent `EXTRACT_PROCEDURE_NOW` for `loop-design-check` / `product-capability` / `benchmark-optimization-loop` → **not** EXTRACT. Loop-design is mostly **DEFER_R3** (agent-runtime). Product-capability **mines into** Round 1 intent framing. Benchmark loop is **ON_DEMAND**.
- Confirmed **zero** actual-agent candidates after asking whether independent context is required vs an explicit review checklist.

---

## Round 1 continuity

Round 1 deferred **38 skills** that looked like specialist/orchestration procedures. Round 2 also found **68** real agent markdown files under `agents/`. These are **not the same set**:

- The 38 are mostly `skills/` workflows that *dispatch* or *simulate* agent teams (`orch-*`, `santa-method`, `council`, `team-*`, …).
- The 68 are Claude-Code-style specialist agent prompts (`code-reviewer`, `silent-failure-hunter`, language reviewers, …).
- Mapping: orch skills reference agents via `docs/COMMAND-AGENT-MAP.md` (e.g. `/code-review` → `code-reviewer`; `/orchestrate` → planner+tdd+reviewer+security+architect).

We do **not** force the number 38 onto the agent folder. Evidence: **68 agents** + **38 deferred skills** = **106** Round 2 units.

### Round 1 provisional mechanisms — disposition

| R1 candidate | Round 2 decision | Why |
|---|---|---|
| `click-path-audit` `{sets,resets}` + sequential undo | **KEEP** | No agent procedure beats it for UI shared-state first-pass. `react-reviewer` adds hook nits, not store cancellation. |
| `agent-architecture-audit` pseudo-facts + user-corrections > agent assertions | **KEEP** | Still the best ACI gap fill. Agents here add persona/eval theatre, not stronger provenance rules. |
| `ai-regression-testing` dual-path contract parity | **KEEP** (+ light strengthen) | Keep dual-path. Strengthen with silent-failure greps as a sibling first-pass bullet, not a replacement. |
| `browser-qa` no baseline ⇒ INCONCLUSIVE | **KEEP** | `e2e-runner` is Playwright cookbook; does not improve honesty rule. |
| `intent-driven-development` Must/Must-not/Verify | **STRENGTHEN** | Fold `product-capability` CONSTRAINTS / NON-GOALS / OPEN QUESTIONS into the same thin framing; do not add a planning artifact stack. |

---

## Life Hub baseline (umbrella)

Relative to existing umbrella instruction:

- **Ponytail + project guardrails** — minimal code; no unrequested architecture
- **first-pass-correctness** — real-path proof; ban “should work”; fidelity ladder; first fail → `diagnosing-bugs`
- **agent-context-integrity** — source→…→behaviour; Availability/Delivery/Interpretation/Behaviour
- **Matt (selected):** diagnosing-bugs (task), code-review / tdd / codebase-design / grilling (explicit)
- **Superpowers:** verification-before-completion, systematic-debugging, TDD, brainstorming, writing-plans, requesting-code-review
- **Design kit** — UI authority across hubs
- **Tests/CI:** node:test + Playwright; Pages workflow

An ECC agent that restates “write tests / review security / plan first” is REJECT by default.

---

## Score legend (agents)

A relevance · B unique procedure · C first-pass · D AI-agent correctness · E specialist depth · F extractability · G agent necessity (5=needs separate agent) · H duplication distinctness · I instruction cost (5=cheap) · J orch risk (5=low) · K behavioural risk (5=safe) · L maintainability

---

## Complete agent inventory (68)

| Agent | Path | Role (short) | Useful procedure? | Deps/orch | Scores A–L (abbrev) | Bucket | Rationale |
|---|---|---|---|---|---|---|---|
| `a11y-architect` | `agents/a11y-architect.md` | Accessibility Architect specializing in WCAG 2.2 compliance for Web and Native platforms. Use PROACT | yes-thin | standalone-prompt | `2/3/2/1/3/4/1/3/3/4/4/4` | ON_DEMAND_SPECIALIST | WCAG 2.2 checklist when auditing a11y; design-kit owns visuals |
| `agent-evaluator` | `agents/agent-evaluator.md` | Evaluates agent output against 5-axis quality rubric (accuracy, completeness, clarity, actionability | runtime | standalone-prompt | `2/3/1/4/3/2/2/3/2/2/2/2` | DEFER_R3 | Agent output rubric — Round 3 eval |
| `architect` | `agents/architect.md` | Software architecture specialist for system design, scalability, and technical decision-making. Use  | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | ADR/pattern essay fights Ponytail; codebase-design explicit |
| `build-error-resolver` | `agents/build-error-resolver.md` | Build and TypeScript error resolution specialist. Use PROACTIVELY when build fails or type errors oc | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Write-capable make-green agent papers over root cause; diagnosing-bugs owns failures |
| `chief-of-staff` | `agents/chief-of-staff.md` | Personal communication chief of staff that triages email, Slack, LINE, and Messenger. Classifies mes | yes-thin | claude,hooks,mcp | `4/4/4/2/3/5/1/4/4/4/4/4` | MINE_MECHANISM | 4-tier triage skip/info/meeting/action — only if ops mail triage asked; not a hub persona |
| `code-architect` | `agents/code-architect.md` | Designs feature architectures by analyzing existing codebase patterns and conventions, then providin | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Thin blueprint; Ponytail+codebase-design |
| `code-explorer` | `agents/code-explorer.md` | Deeply analyzes existing codebase features by tracing execution paths, mapping architecture layers,  | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | DUP first-pass path tracing |
| `code-reviewer` | `agents/code-reviewer.md` | Expert code review specialist. Proactively reviews code for quality, security, and maintainability.  | yes-thin | claude | `5/5/5/2/4/5/1/4/4/5/5/5` | MINE_MECHANISM | Pre-report gate + HIGH/CRITICAL require proof + zero findings valid + false-positive skip list — fold into explicit Matt code-review / first |
| `code-simplifier` | `agents/code-simplifier.md` | Simplifies and refines code for clarity, consistency, and maintainability while preserving behavior. | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | DUP Ponytail; scope-creep magnet |
| `comment-analyzer` | `agents/comment-analyzer.md` | Analyze code comments for accuracy, completeness, maintainability, and comment rot risk. | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Low product value |
| `conversation-analyzer` | `agents/conversation-analyzer.md` | Use this agent when analyzing conversation transcripts to find behaviors worth preventing with hooks | runtime | claude | `2/3/1/4/3/2/2/3/2/2/2/2` | DEFER_R3 | Session frustration→rule mining — Round 3 learning |
| `cpp-build-resolver` | `agents/cpp-build-resolver.md` | C++ build, CMake, and compilation error resolution specialist. Fixes build errors, linker issues, an | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `cpp-reviewer` | `agents/cpp-reviewer.md` | Expert C++ code reviewer specializing in memory safety, modern C++ idioms, concurrency, and performa | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `csharp-reviewer` | `agents/csharp-reviewer.md` | Expert C# code reviewer specializing in .NET conventions, async patterns, security, nullable referen | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `dart-build-resolver` | `agents/dart-build-resolver.md` | Dart/Flutter build, analysis, and dependency error resolution specialist. Fixes `dart analyze` error | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `database-reviewer` | `agents/database-reviewer.md` | PostgreSQL database specialist for query optimization, schema design, security, and performance. Use | yes-thin | standalone-prompt | `2/3/2/1/3/4/1/3/3/4/4/4` | ON_DEMAND_SPECIALIST | Rare if Postgres surfaces appear; not standing |
| `django-build-resolver` | `agents/django-build-resolver.md` | Django/Python build, migration, and dependency error resolution specialist. Fixes pip/Poetry errors, | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `django-reviewer` | `agents/django-reviewer.md` | Expert Django code reviewer specializing in ORM correctness, DRF patterns, migration safety, securit | yes-thin | orch | `4/4/4/2/3/5/1/4/4/4/4/4` | MINE_MECHANISM | Two-deploy column drop / reversible migration / unjustified non-atomic — transfer to fixture/schema changes |
| `doc-updater` | `agents/doc-updater.md` | Documentation and codemap specialist. Use PROACTIVELY for updating codemaps and documentation. Gener | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Doc churn agent |
| `docs-lookup` | `agents/docs-lookup.md` | When the user asks how to use a library, framework, or API or needs up-to-date code examples, use Co | no | mcp | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Context7 glue |
| `e2e-runner` | `agents/e2e-runner.md` | End-to-end testing specialist using Vercel Agent Browser (preferred) with Playwright fallback. Use P | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Playwright cookbook + Agent Browser; LH has Playwright |
| `fastapi-reviewer` | `agents/fastapi-reviewer.md` | Reviews FastAPI applications for async correctness, dependency injection, Pydantic schemas, security | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `flutter-reviewer` | `agents/flutter-reviewer.md` | Flutter and Dart code reviewer. Reviews Flutter code for widget best practices, state management pat | no | orch,claude | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `fsharp-reviewer` | `agents/fsharp-reviewer.md` | Expert F# code reviewer specializing in functional idioms, type safety, pattern matching, computatio | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `gan-evaluator` | `agents/gan-evaluator.md` | GAN Harness — Evaluator agent. Tests the live running application via Playwright, scores against rub | no | orch,claude,mcp | `0/1/0/1/2/1/0/1/1/0/0/1` | REJECT | GAN multi-agent loop theatre |
| `gan-generator` | `agents/gan-generator.md` | GAN Harness — Generator agent. Implements features according to the spec, reads evaluator feedback,  | no | orch,claude | `0/1/0/1/2/1/0/1/1/0/0/1` | REJECT | GAN loop theatre |
| `gan-planner` | `agents/gan-planner.md` | GAN Harness — Planner agent. Expands a one-line prompt into a full product specification with featur | no | orch,claude | `0/1/0/1/2/1/0/1/1/0/0/1` | REJECT | GAN loop theatre |
| `go-build-resolver` | `agents/go-build-resolver.md` | Go build, vet, and compilation error resolution specialist. Fixes build errors, go vet issues, and l | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `go-reviewer` | `agents/go-reviewer.md` | Expert Go code reviewer specializing in idiomatic Go, concurrency patterns, error handling, and perf | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `harmonyos-app-resolver` | `agents/harmonyos-app-resolver.md` | HarmonyOS application development expert specializing in ArkTS and ArkUI. Reviews code for V2 state  | no | claude | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `harness-optimizer` | `agents/harness-optimizer.md` | Improve local agent-harness configuration reliability and cost using eval-driven grading (pass@k/pas | runtime | claude,hooks | `2/3/1/4/3/2/2/3/2/2/2/2` | DEFER_R3 | Agent harness eval — Round 3 |
| `healthcare-reviewer` | `agents/healthcare-reviewer.md` | Reviews healthcare application code for clinical safety, CDSS accuracy, PHI compliance, and medical  | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `homelab-architect` | `agents/homelab-architect.md` | Designs home and small-lab network plans from hardware inventory, goals, and operator experience lev | no | orch | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `java-build-resolver` | `agents/java-build-resolver.md` | Java/Maven/Gradle build, compilation, and dependency error resolution specialist. Automatically dete | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `java-reviewer` | `agents/java-reviewer.md` | Expert Java code reviewer for Spring Boot and Quarkus projects. Automatically detects the framework  | no | orch | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `kotlin-build-resolver` | `agents/kotlin-build-resolver.md` | Kotlin/Gradle build, compilation, and dependency error resolution specialist. Fixes build errors, Ko | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `kotlin-reviewer` | `agents/kotlin-reviewer.md` | Kotlin and Android/KMP code reviewer. Reviews Kotlin code for idiomatic patterns, coroutine safety,  | no | orch,claude | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `loop-operator` | `agents/loop-operator.md` | Operate autonomous agent loops, monitor progress, and intervene safely when loops stall. | runtime | standalone-prompt | `2/3/1/4/3/2/2/3/2/2/2/2` | DEFER_R3 | Autonomous loop ops — Round 3 |
| `marketing-agent` | `agents/marketing-agent.md` | Marketing strategist and copywriter for campaign planning, audience research, positioning, copy crea | yes-thin | orch | `2/3/2/1/3/4/1/3/3/4/4/4` | ON_DEMAND_SPECIALIST | Campaign checklist when marketing asked |
| `mle-reviewer` | `agents/mle-reviewer.md` | Production machine-learning engineering reviewer for data contracts, feature pipelines, training rep | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `network-architect` | `agents/network-architect.md` | Designs enterprise or multi-site network architecture from requirements, using existing network skil | no | orch | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `network-config-reviewer` | `agents/network-config-reviewer.md` | Reviews router and switch configurations for security, correctness, stale references, risky change-w | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `network-troubleshooter` | `agents/network-troubleshooter.md` | Diagnoses network connectivity, routing, DNS, interface, and policy symptoms with a read-only OSI-la | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `opensource-forker` | `agents/opensource-forker.md` | Fork any project for open-sourcing. Copies files, strips secrets and credentials (20+ patterns), rep | no | claude | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `opensource-packager` | `agents/opensource-packager.md` | Generate complete open-source packaging for a sanitized project. Produces CLAUDE.md, setup.sh, READM | no | claude | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `opensource-sanitizer` | `agents/opensource-sanitizer.md` | Verify an open-source fork is fully sanitized before release. Scans for leaked secrets, PII, interna | runtime | standalone-prompt | `2/3/2/1/3/3/1/3/2/3/3/3` | DEFER_R4 | Secret/PII sanitization pack for release — Round 4 |
| `performance-optimizer` | `agents/performance-optimizer.md` | Performance analysis and optimization specialist. Use PROACTIVELY for identifying bottlenecks, optim | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Premature memoization gospel |
| `php-reviewer` | `agents/php-reviewer.md` | Expert PHP code reviewer specializing in PSR-12 compliance, PHP type system, Eloquent ORM patterns,  | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `planner` | `agents/planner.md` | Expert planning specialist for complex features and refactoring. Use PROACTIVELY when users request  | no | hooks | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Generic planning; Superpowers writing-plans + grilling |
| `pr-test-analyzer` | `agents/pr-test-analyzer.md` | Review pull request test coverage quality and completeness, with emphasis on behavioral coverage and | yes-thin | standalone-prompt | `4/4/4/2/3/5/1/4/4/4/4/4` | MINE_MECHANISM | Map changed paths→tests; rate behavioural gaps critical/important/nice — not coverage % |
| `python-reviewer` | `agents/python-reviewer.md` | Expert Python code reviewer specializing in PEP 8 compliance, Pythonic idioms, type hints, security, | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `pytorch-build-resolver` | `agents/pytorch-build-resolver.md` | PyTorch runtime, CUDA, and training error resolution specialist. Fixes tensor shape mismatches, devi | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `rag-pipeline-reviewer` | `agents/rag-pipeline-reviewer.md` | Reviews RAG (Retrieval-Augmented Generation) pipelines for retrieval quality, chunking strategy, emb | yes-thin | orch | `2/3/2/1/3/4/1/3/3/4/4/4` | ON_DEMAND_SPECIALIST | Only if Knowledge embeddings/RAG work appears |
| `react-build-resolver` | `agents/react-build-resolver.md` | Diagnose and fix React build failures across Vite, webpack, Next.js, CRA, Parcel, esbuild, and Bun.  | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `react-reviewer` | `agents/react-reviewer.md` | Expert React/JSX code reviewer specializing in hook correctness, render performance, server/client c | yes-thin | hooks | `3/3/3/1/4/4/1/3/3/4/4/4` | MINE_MECHANISM | Over-memoization without measured win; Server Action/public API framing — thin UI notes; discard Next/RSC bulk |
| `refactor-cleaner` | `agents/refactor-cleaner.md` | Dead code cleanup and consolidation specialist. Use PROACTIVELY for removing unused code, duplicates | yes-thin | standalone-prompt | `4/4/4/2/3/5/1/4/4/4/4/4` | MINE_MECHANISM | SAFE/CAREFUL/RISKY triage + small-batch discipline only — never the write agent |
| `rust-build-resolver` | `agents/rust-build-resolver.md` | Rust build, compilation, and dependency error resolution specialist. Fixes cargo build errors, borro | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `rust-reviewer` | `agents/rust-reviewer.md` | Expert Rust code reviewer specializing in ownership, lifetimes, error handling, unsafe usage, and id | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `security-reviewer` | `agents/security-reviewer.md` | Security vulnerability detection and remediation specialist. Use PROACTIVELY after writing code that | runtime | standalone-prompt | `2/3/2/1/3/3/1/3/2/3/3/3` | DEFER_R4 | OWASP checklist + pattern table useful later as R4 infra/checklist; do not install agent |
| `seo-specialist` | `agents/seo-specialist.md` | SEO specialist for technical SEO audits, on-page optimization, structured data, Core Web Vitals, and | yes-thin | standalone-prompt | `2/3/2/1/3/4/1/3/3/4/4/4` | ON_DEMAND_SPECIALIST | Technical SEO audit format on demand |
| `silent-failure-hunter` | `agents/silent-failure-hunter.md` | Review code for silent failures, swallowed errors, bad fallbacks, and missing error propagation. | yes-thin | standalone-prompt | `5/5/5/2/4/5/0/5/5/5/5/5` | MINE_MECHANISM | Hunt targets: empty catch, .catch(()=>[]), defaults that hide failure, log-and-forget, lost stacks — fold into first-pass |
| `spec-miner` | `agents/spec-miner.md` | Extracts behavioral specs from existing codebases for OpenSpec. Produces flat Requirement and Invari | yes-thin | standalone-prompt | `4/4/4/2/3/5/1/4/4/4/4/4` | MINE_MECHANISM | sample-and-expand + enforced/uncertainty anchors — thin; no OpenSpec |
| `swift-build-resolver` | `agents/swift-build-resolver.md` | Swift/Xcode build, compilation, and dependency error resolution specialist. Fixes swift build errors | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `swift-reviewer` | `agents/swift-reviewer.md` | Expert Swift code reviewer specializing in protocol-oriented design, value semantics, ARC memory man | no | orch | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `tdd-guide` | `agents/tdd-guide.md` | Test-Driven Development specialist enforcing write-tests-first methodology. Use PROACTIVELY when wri | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Coverage mandates conflict explicit-only Matt tdd |
| `type-design-analyzer` | `agents/type-design-analyzer.md` | Analyze type design for encapsulation, invariant expression, usefulness, and enforcement. | yes-thin | standalone-prompt | `4/4/4/2/3/5/1/4/4/4/4/4` | MINE_MECHANISM | Illegal-states / invariant-expression axes — thin vocabulary into codebase-design when explicit |
| `typescript-reviewer` | `agents/typescript-reviewer.md` | Expert TypeScript/JavaScript code reviewer specializing in type safety, async correctness, Node/web  | no | orch | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |
| `vue-reviewer` | `agents/vue-reviewer.md` | Expert Vue.js code reviewer specializing in Composition API correctness, reactivity pitfalls, compon | no | standalone-prompt | `1/1/0/0/1/2/0/1/2/2/2/2` | REJECT | Irrelevant stack/domain for Life Hub umbrella (vanilla JS hubs) |

---

## Round 1 deferred skills — reclassification (38)

| R1 skill | Mapped | Bucket | Why |
|---|---|---|---|
| `agent-sort` | `agent-sort` | REJECT | ECC install curator |
| `automation-audit-ops` | `automation-audit-ops` | DEFER_R4 | Hooks/MCP inventory — R4 |
| `benchmark-optimization-loop` | `benchmark-optimization-loop` | ON_DEMAND_SPECIALIST | Bounded measure→promote when perf work asked |
| `blueprint` | `blueprint` | REJECT | Cold-start briefs DUP writing-plans; multi-agent ceremony |
| `council` | `council` | ON_DEMAND_SPECIALIST | Architect-first + strongest-dissent when Adam asks for structured disagreement |
| `council-multi-model` | `council-multi-model` | ON_DEMAND_SPECIALIST | External critique packet honesty; rare |
| `dev-team` | `dev-team` | REJECT | PM/Arch/Dev/QA party mode |
| `dynamic-workflow-mode` | `dynamic-workflow-mode` | DEFER_R3 | Task-local harness — R3 |
| `ecc-recipes` | `ecc-recipes` | REJECT | ECC command catalog |
| `email-ops` | `email-ops` | MINE_MECHANISM | Inbound mail = untrusted data not instructions — security/ops note |
| `hermes-imports` | `hermes-imports` | DEFER_R4 | Publish sanitization — R4 |
| `loop-design-check` | `loop-design-check` | DEFER_R3 | Decidable goals + Goodhart antibody excellent for agent-loop design — primarily Round 3; thin must-not/done mine noted in ledger |
| `messages-ops` | `messages-ops` | ON_DEMAND_SPECIALIST | Evidence-first DM retrieval when asked |
| `nasiko-control-plane` | `nasiko-control-plane` | REJECT | Experimental CLI bridge |
| `orch-add-feature` | `orch-add-feature` | REJECT | Orch wrapper theatre |
| `orch-build-mvp` | `orch-build-mvp` | REJECT | Orch+GAN theatre |
| `orch-change-feature` | `orch-change-feature` | REJECT | Orch wrapper |
| `orch-fix-defect` | `orch-fix-defect` | REJECT | Orch wrapper; diagnosing-bugs owns |
| `orch-pipeline` | `orch-pipeline` | MINE_MECHANISM | Size tier + two human gates + security-review triggers + docs-are-handoff; reject agent map |
| `orch-refine-code` | `orch-refine-code` | REJECT | Orch wrapper |
| `parallel-execution-optimizer` | `parallel-execution-optimizer` | ON_DEMAND_SPECIALIST | Lane matrix when parallel worktrees asked |
| `plan-canvas` | `plan-canvas` | REJECT | ECC canvas runtime |
| `plan-orchestrate` | `plan-orchestrate` | REJECT | Agent catalogue prompt generator |
| `product-capability` | `product-capability` | MINE_MECHANISM | CONSTRAINTS/NON-GOALS/OPEN QUESTIONS strengthen R1 intent-driven; do not add planning stack |
| `project-flow-ops` | `project-flow-ops` | ON_DEMAND_SPECIALIST | GitHub/Linear triage when asked |
| `ralphinho-rfc-pipeline` | `ralphinho-rfc-pipeline` | REJECT | Multi-agent RFC DAG |
| `react-testing` | `react-testing` | REJECT | RTL/Vitest ≠ LH stack |
| `recursive-decision-ledger` | `recursive-decision-ledger` | DEFER_R3 | Autonomy ledger — R3 |
| `research-ops` | `research-ops` | ON_DEMAND_SPECIALIST | Evidence-boundary research wrapper |
| `rules-distill` | `rules-distill` | REJECT | Skills→rules ceremony |
| `santa-method` | `santa-method` | MINE_MECHANISM | Both-must-pass + context isolation for high-stakes only; no dual-agent install |
| `skill-comply` | `skill-comply` | DEFER_R3 | Skill compliance harness — R3 |
| `skill-scout` | `skill-scout` | REJECT | ECC catalog meta |
| `skill-stocktake` | `skill-stocktake` | REJECT | ECC skill QA |
| `team-agent-orchestration` | `team-agent-orchestration` | REJECT | Agent Kanban theatre |
| `team-builder` | `team-builder` | REJECT | Agent picker |
| `terminal-ops` | `terminal-ops` | REJECT | Status vocabulary ceremony; first-pass already requires evidence |
| `unified-notifications-ops` | `unified-notifications-ops` | DEFER_R4 | Cross-channel alerts — R4 |

---

## Procedures worth extracting

**None as standalone Life Hub procedures.**

Shortlist 1 is empty on purpose. Every survivor is better as ≤15 lines in an existing rule/skill.

---

## Mechanisms worth stealing (ranked)

| Rank | Source | Exact mechanism | Destination | Smallest adaptation |
|---:|---|---|---|---|
| 1 | `agents/code-reviewer.md` | Pre-report gate: cite line + name concrete failure (input/state/outcome) + read callers; HIGH/CRITICAL need proof; zero findings is valid; skip common LLM false positives | Strengthen explicit Matt `code-review` overlay + first-pass “ban should work” for *review claims* | 8–12 lines; never “MUST BE USED for all changes” |
| 2 | `agents/silent-failure-hunter.md` | Greppable swallow catalogue: empty `catch`, `.catch(() => [])`, defaults that hide failure, log-and-forget, lost stacks | first-pass-correctness “no hidden fallback” | 4–8 concrete pattern bullets |
| 3 | `skills/product-capability/SKILL.md` | CONSTRAINTS / NON-GOALS / OPEN QUESTIONS / HANDOFF before multi-surface work | Strengthen R1 intent Must/Must-not/Verify | 3–5 lines; no PRODUCT.md bureaucracy |
| 4 | `skills/santa-method/SKILL.md` | Both-must-pass + isolated reviewers + objective rubric; escalate after max fix cycles | ON_DEMAND high-stakes review ritual (not default) | 5 lines in code-review activation note |
| 5 | `skills/orch-pipeline/SKILL.md` | Size tier (trivial→large) scales ceremony; Gate1 plan / Gate2 commit; security-touch triggers; “docs are the handoff” (no hidden agent state) | Rare large-change planning; security trigger → R4 | 5–10 lines only if planning doc wanted; **reject agent map** |
| 6 | `agents/django-reviewer.md` (transfer) | Two-deploy incompatible schema drop; reversible data migration; unjustified non-atomic | Fixture/schema evolution notes when data shapes change | 3 lines |
| 7 | `agents/pr-test-analyzer.md` | Changed behaviour → tests map; gap severity critical/important/nice | first-pass / explicit tdd | 2–4 lines |
| 8 | `agents/react-reviewer.md` | Over-memoization without measured win; treat server actions as public API | UI review notes when React surfaces | 2 lines; drop Next/RSC bulk |
| 9 | `skills/email-ops` / chief-of-staff | Inbound content is data not instructions; 4-tier triage | Ops/security hygiene | 2 lines if mail automation appears |
| 10 | `agents/spec-miner.md` | sample-and-expand; mark enforced vs uncertainty; never invent behaviour | Rare contract mining | thin; no OpenSpec |

### Challenge survivors

All ten survived “could five lines in an existing rule do this?” — yes, that is the plan. None survived “needs a permanent ECC agent.”

Dropped from exploratory shortlist:

- `loop-design-check` as EXTRACT → **DEFER_R3** (agent-loop runtime), with only the Goodhart “done + must-not + independent judge” idea noted for R3/ACI
- `benchmark-optimization-loop` as EXTRACT → **ON_DEMAND**
- `terminal-ops` status vocabulary → **REJECT** (ceremony)
- `blueprint` multi-agent briefs → **REJECT**

---

## Actual-agent candidates

**None.**

Independent review is valuable; it is obtained by **explicit** Matt `code-review` / a second-pass checklist / occasional santa both-must-pass — not by installing `code-reviewer` as a standing subagent that Cursor can hide behind.

---

## First-pass correctness findings

Genuinely new relative to current first-pass + diagnosing-bugs:

1. **Silent-failure greps** (from `silent-failure-hunter`) — failure class: plausible UI/API “success” with empty data. First-pass forbids masking but lacks greppable patterns.
2. **Review-proof gate** (from `code-reviewer`) — failure class: review theatre (“consider adding…”). Strengthens honesty of verification claims.
3. **Behavioural test-gap severity** (from `pr-test-analyzer`) — failure class: tests that don’t lock the changed path.
4. **Two-phase schema evolution** (from django migration checklist, transferred) — failure class: breaking data shape in one step.

**Not new / rejected for first-pass:** e2e-runner cookbooks, tdd-guide coverage %, verification-loop bureaucracy (already rejected R1), GAN evaluator loops.

**Best new first-pass mechanism this round:** silent-failure swallow catalogue (complements R1 click-path-audit; does not replace it).

---

## AI Agent Context Integrity findings

Genuinely new beyond current ACI + R1 agent-architecture-audit:

- **Little in the agent folder.** Persona agents do not improve provenance.
- **`santa-method` isolation** — reviewers must not share each other’s conclusions (anti-anchoring). Useful for high-stakes *human-triggered* review, not ACI pipeline plumbing.
- **`product-capability` OPEN QUESTIONS** — prevents inventing product facts (adjacent to R1 intent / ACI Interpretation).
- **`loop-design-check` Goodhart antibody** — “tests pass” gamed by deleting tests / must-not boundaries / independent judge → **DEFER_R3** for personality-agent eval loops.

**Best ACI-related mechanism this round:** still Round 1’s distillation pseudo-fact + user-correction precedence. Round 2 adds only isolation/Goodhart notes for later.

---

## Useful handoff mechanisms

| Mechanism | Source | Steal? |
|---|---|---|
| Docs/task_list are the handoff; no hidden agent memory | `orch-pipeline` | Yes, if multi-step work — artifacts not vibes |
| CAPABILITY / CONSTRAINTS / NON-GOALS / OPEN QUESTIONS / HANDOFF | `product-capability` | Yes, thin |
| Verified vs inferred in findings | `code-reviewer` proof gate | Yes |
| Dual-reviewer JSON rubric | `santa-method` | Only on-demand |
| GAN generator↔evaluator score packets | gan-* | **No** — orch theatre |

---

## Useful failure-escalation mechanisms

| Mechanism | Source | vs diagnosing-bugs |
|---|---|---|
| Max fix cycles then escalate human | `santa-method` | Compatible; don’t loop patch roulette |
| Retry cap + human owns “done” cell | `loop-design-check` | R3; aligns with first-pass “first fail → diagnose” |
| Build-error-resolver keep patching until green | build agents | **Reject** — conflicts diagnosing-bugs |

---

## Round 3 handoff

Count: **8** units primarily (4 agents + 4 skills), plus mechanisms:

Agents: `harness-optimizer`, `loop-operator`, `conversation-analyzer`, `agent-evaluator`

Skills: `loop-design-check`, `dynamic-workflow-mode`, `recursive-decision-ledger`, `skill-comply`

Mechanisms to revisit in R3: Goodhart-resistant agent goals; independent judge vs builder; stall/retry-storm pause; frustration→rule mining; eval harnesses; continuous-learning ties from R1 DEFER_R3 list.

---

## Round 4 handoff

Count: **5** units primarily (2 agents + 3 skills), plus:

Agents: `security-reviewer`, `opensource-sanitizer`

Skills: `automation-audit-ops`, `hermes-imports`, `unified-notifications-ops`

Also: orch-pipeline security-touch triggers; email untrusted-inbound; hooks/commands from ECC maps — do not soft-import.

---

## Rejected orchestration patterns

Deliberately **do not** import:

1. **Default multi-agent pipelines** (`/orchestrate`, `orch-*`, `plan-orchestrate`, `team-agent-orchestration`, `dev-team`) — fragment context; assertions become “evidence.”
2. **MUST BE USED always-on reviewers** — fights explicit Matt activation and Ponytail.
3. **GAN / dual-model perfection loops** — cost and false confidence.
4. **Write-capable fix agents** that optimize for green builds/tests over root cause.
5. **Coverage % / scorecard agents** as completion gates.
6. **Hidden handoff state** between agents — if it isn’t in the repo/docs, it doesn’t exist.
7. **Delegating repo understanding** to explorer/architect subagents as a substitute for the implementing agent reading the code.

---

## Cross-round candidate ledger

| Candidate | Source Round | ECC Source | Mechanism | Proposed LH destination | Status | Could be superseded by |
|---|---|---|---|---|---|---|
| Store sets/resets + sequential undo | R1 | `skills/click-path-audit` | UI cancellation audit | first-pass + diagnosing-bugs UI branch | provisional / **KEEP** | — |
| Distillation pseudo-facts; user>agent memory | R1 | `skills/agent-architecture-audit` | Provenance/admission | agent-context-integrity | provisional / **KEEP** | R3 memory architecture |
| Dual-path contract parity | R1 | `skills/ai-regression-testing` | Fixture/live or Pages/API shape | first-pass boundaries | provisional / **KEEP** | R4 contract tests |
| No baseline ⇒ INCONCLUSIVE | R1 | `skills/browser-qa` | Visual honesty | first-pass evidence | provisional / **KEEP** | — |
| Must / Must-not / Verify | R1 | `skills/intent-driven-development` | Thin AC | first-pass | provisional / **STRENGTHEN** | product-capability constraints |
| Review proof gate + FP skip list | R2 | `agents/code-reviewer` | Anti-noise review | Matt code-review overlay / first-pass | provisional | — |
| Silent-failure swallow greps | R2 | `agents/silent-failure-hunter` | Masked success | first-pass | provisional | — |
| Constraints/non-goals/open questions | R2 | `skills/product-capability` | Intent hardening | intent framing in first-pass | provisional | grilling (explicit) |
| Both-must-pass isolation | R2 | `skills/santa-method` | Adversarial review | on-demand review ritual | provisional | human second reader |
| Size tier + human gates + sec triggers | R2 | `skills/orch-pipeline` | Ceremony scaling | rare planning / R4 sec triggers | provisional | Superpowers writing-plans |
| Two-phase schema evolution | R2 | `agents/django-reviewer` | Migration safety | data/fixture notes | provisional | R4 DB infra |
| Goodhart-resistant loop goals | R2 | `skills/loop-design-check` | Done+must-not+independent judge | — | **defer R3** | R3 eval design |
| Security OWASP agent | R2 | `agents/security-reviewer` | Checklist | — | **defer R4** | R4 scanners/hooks |

---

## Proposed extraction plan (DO NOT EXECUTE)

After all four rounds, if still approved:

1. Still **do not** install ECC agents, orch skills, hooks, or memory MCP.
2. Single minimal patch set editing only existing Life Hub rules/skills (~40–60 lines total across R1+R2 mines):
   - `first-pass-correctness` — click-path sets/resets; dual-path parity; visual INCONCLUSIVE; silent-failure greps; Must/Must-not/Verify (+ open questions)
   - `agent-context-integrity` — distillation pseudo-facts; user corrections > agent assertions
   - Matt `code-review` Life Hub overlay — proof gate + false-positive skip list (explicit activation only)
   - Optional diagnosing-bugs UI branch pointer to store-cancellation loop
3. Keep santa both-must-pass as a **documented on-demand ritual**, not an agent.
4. Re-read Ponytail; delete restatements.
5. Wait for Round 3–4 before anything resembling eval harnesses, hooks, or security scanners.

---

## Method notes

- Pinned SHA verified present (`git checkout` + `rev-parse`).
- Agent count = files in `agents/*.md` (68), not README.
- Every agent classified; language/domain specialists bulk-reviewed with spot deep-reads; high-value agents deep-read in full.
- Round 1 DEFER_R2 skills all reclassified.
- Preference order held: REJECT aggressively; mine mechanisms; never import swarm.

---

## Audit hygiene

- No branch / commit / push / PR / merge
- No ECC install
- Only new file expected: this report

Report path: `ECC_ROUND_2_AGENTS_AUDIT.md`
