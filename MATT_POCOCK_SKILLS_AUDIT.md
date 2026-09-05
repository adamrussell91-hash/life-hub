# Matt Pocock Skills audit — Life Hub

Audit only. No skills were installed. No Life Hub source, rules, docs, or git state were changed, other than this local uncommitted report.

---

## 1. Executive recommendation

| Measure | Count |
|---------|-------|
| Skills audited | **37** (25 promoted in plugin `1.2.3`, plus 8 in-progress and 4 misc) |
| Recommended for integration | **1** |
| Recommended as on demand | **5** |
| Rejected | **31** |

**Overall recommendation:** do not install the Matt Pocock skill set, plugin, or `setup-matt-pocock-skills` workflow.

Life Hub already has a stronger local coding law (Ponytail + project guardrails), a locked design kit, a consolidation architecture source of truth, a real test stack (`node:test`, Playwright, fixture validation), and a large Superpowers process archive. Cursor also already loads Superpowers skills (systematic debugging, TDD, code review, brainstorming, verification) at plugin level.

The one skill worth adding to the project, later and with Life Hub guardrails, is **`diagnosing-bugs`**. Five more are worth keeping available only when Adam explicitly invokes them. Everything else either duplicates existing guidance, imports a ticket/ADR/CONTEXT.md process Life Hub does not use, or would make Cursor more bureaucratic.

The target is not more agent machinery. The useful set is six named procedures around Ponytail, not a second operating system.

---

## 2. Existing Life Hub environment

Life Hub is the live umbrella application repository (`adamrussell91-hash/life-hub`). `life-hub-data` is a private data store and was not treated as an application or rules repo.

### What Cursor is already told to do

There is **no root `AGENTS.md`** and **no root `TASKS.md`**. Agent instruction is split across:

| Source | Role |
|--------|------|
| `.cursor/rules/ponytail.mdc` | Always-on simplicity discipline |
| `.cursor/rules/ponytail-project-guardrails.mdc` | Simplicity must not delete product, security, design, or test requirements |
| `.cursor/rules/life-hub-umbrella.mdc` | Umbrella architecture outranks folded-hub leftovers |
| `CLAUDE.md` | Consolidation overseer entry; points at `docs/consolidation/` |
| `docs/consolidation/plan.md` | Architecture and deployment source of truth (v4.27) |
| `packages/design-kit/AGENTS.md` | Locked visual and interaction law |
| `apps/knowledge/AGENTS.md`, `apps/tasks/AGENTS.md` | App-level run/test/cloud notes; some pre-fold leftovers |
| `README.md` | Auth, Pages/Netlify split, chat confirm loop, local/dev/test commands |
| `docs/superpowers/plans` and `docs/superpowers/specs` | Large historical Superpowers planning archive |

Folded apps still contain older `AGENTS.md` notes. The umbrella rule already says those lose when they conflict with `docs/consolidation/plan.md`.

### Ponytail

Ponytail is the default coding discipline. It is always applied. It tells Cursor to climb a reuse ladder before writing code, fix root causes rather than symptoms, refuse unrequested abstractions and dependencies, leave one small check for non-trivial logic, and skip tests for trivial one-liners.

The project guardrails then rank priorities: Adam's request, repo instructions and the design kit, then security/auth/accessibility/persistence/API/deploy contracts, then existing architecture, then simplicity. They explicitly forbid simplifying away locked chrome, confirm cards, auth, or tests that protect important behaviour.

Matt's skills must complement this. They must not become a second, more ceremonial coding law.

### Engineering systems that affect skill selection

- **Runtime:** vanilla JS / Vite SPAs, Netlify Functions, GitHub Pages, one operator passphrase, `life-hub-data` behind a read-scoped GitHub token.
- **Tests:** `npm test` (`node:test` unit + integration), `npm run test:browser` (Playwright), `npm run validate:fixtures`. Knowledge/Tasks still document Vitest in folded `AGENTS.md`. There is no ESLint/Prettier/Husky gate; Knowledge explicitly says do not invent one.
- **CI:** `.github/workflows/pages.yml` runs `npm ci --ignore-scripts`, `npm test`, `npm run build`, then deploys `dist/`.
- **Deploy:** site on GitHub Pages; API only on Netlify (`netlify.toml` publish placeholder). Widgets stay on a separate proxy. Consolidation topology lives in `docs/consolidation/plan.md`.
- **UI:** `packages/design-kit/` is closed. Tokens, rail, mobile chrome, sign-in, confirm cards, dates, and motion are locked. Per-hub difference is glass/tile density only.
- **Domain language:** already encoded in agent protocols, confirm-card UX, central-node docs, and the consolidation plan. There is **no `CONTEXT.md`**, **no `docs/adr/`**, **no `docs/agents/`**, and **no `.cursor/skills/`**.
- **Planning already in use:** Superpowers specs/plans under `docs/superpowers/`, plus Notion/Cursor task flow outside this repo. Life Hub does not run a Matt-style issue-tracker / triage-label / wayfinder machine.
- **Already-loaded Cursor plugin skills:** Superpowers `systematic-debugging`, `test-driven-development`, `requesting-code-review`, `brainstorming`, `writing-plans`, `verification-before-completion`, and related process skills. These are not Life Hub repo files, but they already steer Cursor in this environment.

### Where Ponytail and existing instructions are already enough

Simplicity, dependency refusal, design-kit compliance, auth/CORS/`life-hub-data` invariants, deployment topology, accessibility, confirm-card writes, and "do not invent lint/format tooling" are already stronger and more specific than anything in Matt's repo.

Genuine gaps are narrower: a hard-bug evidence loop, an optional public-seam TDD procedure that does not blanket every edit, a review procedure that checks spec vs standards without Fowler-driven rewrites, and an occasional architecture vocabulary that diagnoses without granting a refactor.

---

## 3. Complete skill inventory

Upstream commit `3cca18b368ae95cdbdebbff572ccafa662551015` (2026-09-04), package/plugin version **1.2.3**. Scores are 0–5. High is good, including Instruction cost, Overengineering risk, and Behavioural risk.

| Skill | Purpose | Usefulness | Frequency | Added value | Compatibility | Instruction cost | Overengineering risk | Behavioural risk | Maintainability | Disposition |
|-------|---------|------------|-----------|-------------|----------------|------------------|----------------------|------------------|-----------------|-------------|
| diagnosing-bugs | Hard-bug loop: red feedback loop → minimise → hypothesise → instrument → fix → regression test | 5 | 4 | 4 | 5 | 3 | 4 | 4 | 5 | Integrate |
| code-review | Two-axis Standards vs Spec review of a pinned diff | 4 | 3 | 3 | 3 | 3 | 2 | 3 | 4 | On demand |
| tdd | Red-green at user-confirmed public seams | 4 | 3 | 2 | 3 | 2 | 2 | 2 | 4 | On demand |
| codebase-design | Deep-module vocabulary: module, interface, depth, seam, adapter | 3 | 2 | 3 | 3 | 3 | 2 | 3 | 4 | On demand |
| improve-codebase-architecture | User-invoked architecture survey + HTML report, then grill a candidate | 3 | 1 | 3 | 3 | 1 | 1 | 2 | 3 | On demand |
| grilling | Relentless design-tree interview until the frontier is empty | 4 | 2 | 2 | 4 | 3 | 4 | 3 | 5 | On demand |
| grill-me | Thin wrapper that only invokes grilling | 2 | 2 | 1 | 4 | 5 | 5 | 4 | 5 | Reject |
| grill-with-docs | Invokes grilling + domain-modeling; writes CONTEXT.md and ADRs | 3 | 2 | 2 | 2 | 2 | 1 | 2 | 3 | Reject |
| domain-modeling | Build/sharpen CONTEXT.md glossary and sparse ADRs | 3 | 2 | 2 | 3 | 3 | 2 | 3 | 4 | Reject |
| setup-matt-pocock-skills | Writes `docs/agents/*` and an Agent skills block into CLAUDE.md/AGENTS.md | 2 | 1 | 1 | 2 | 2 | 1 | 2 | 3 | Reject |
| ask-matt | Router over the full Matt flow (grill → spec → tickets → implement) | 1 | 1 | 0 | 2 | 1 | 1 | 1 | 3 | Reject |
| to-spec | Synthesise the current chat into a tracker spec | 3 | 2 | 1 | 2 | 2 | 2 | 2 | 3 | Reject |
| to-tickets | Split work into tracer-bullet tickets with blocking edges | 2 | 1 | 1 | 2 | 2 | 1 | 2 | 3 | Reject |
| implement | Build a spec/tickets with mandatory tdd + code-review + commit | 2 | 2 | 1 | 2 | 4 | 2 | 2 | 4 | Reject |
| wayfinder | Multi-session decision-ticket map on the issue tracker | 2 | 1 | 1 | 2 | 1 | 1 | 2 | 2 | Reject |
| triage | Issue/PR state machine and agent briefs | 2 | 1 | 1 | 2 | 2 | 2 | 2 | 3 | Reject |
| prototype | Throwaway logic HTML demo or multi-variant UI switcher | 3 | 2 | 3 | 2 | 3 | 2 | 1 | 3 | Reject |
| research | Background agent writes a cited markdown research file | 2 | 2 | 1 | 3 | 4 | 3 | 3 | 4 | Reject |
| resolving-merge-conflicts | Intent-traced hunk resolution; never `--abort` | 2 | 1 | 1 | 4 | 5 | 5 | 3 | 5 | Reject |
| wizard | Generate a bash wizard for human-only dashboard/secret steps | 2 | 1 | 2 | 3 | 3 | 3 | 3 | 3 | Reject |
| handoff | Compact the chat into a temp-dir handoff doc | 3 | 2 | 2 | 4 | 5 | 5 | 4 | 5 | Reject |
| wait-what | Re-pitch the last message in simplified English using CONTEXT.md | 2 | 2 | 1 | 3 | 5 | 5 | 4 | 5 | Reject |
| teach | Multi-session teaching workspace | 1 | 0 | 0 | 3 | 2 | 3 | 3 | 3 | Reject |
| to-questionnaire | Build a questionnaire for someone else to fill in | 1 | 0 | 1 | 4 | 3 | 4 | 4 | 4 | Reject |
| writing-for-agents | How to write skills and AGENTS.md pointers | 3 | 1 | 2 | 4 | 3 | 4 | 4 | 4 | Reject |
| loop-me | In-progress: grill workflow specs in a stateful workspace | 1 | 0 | 0 | 2 | 2 | 2 | 2 | 2 | Reject |
| implement-spec | In-progress: concurrent worktree implementers into one PR | 2 | 1 | 1 | 2 | 1 | 0 | 1 | 2 | Reject |
| claude-handoff | In-progress: `claude --bg` handoff | 1 | 0 | 0 | 1 | 4 | 4 | 2 | 2 | Reject |
| setup-ts-deep-modules | In-progress: dependency-cruiser deep-module layout | 1 | 0 | 1 | 1 | 2 | 0 | 1 | 2 | Reject |
| retro | In-progress stub: suggest environment/steering-file changes | 2 | 1 | 1 | 3 | 3 | 2 | 2 | 2 | Reject |
| writing-beats | In-progress article beat assembly | 1 | 0 | 0 | 2 | 3 | 3 | 3 | 3 | Reject |
| writing-fragments | In-progress fragment mining for articles | 1 | 0 | 0 | 2 | 3 | 3 | 3 | 3 | Reject |
| writing-shape | In-progress paragraph-by-paragraph article shaping | 1 | 0 | 0 | 2 | 3 | 3 | 3 | 3 | Reject |
| git-guardrails-claude-code | Claude Code hooks that block dangerous git | 1 | 0 | 0 | 1 | 3 | 3 | 3 | 3 | Reject |
| migrate-to-shoehorn | Migrate tests to `@total-typescript/shoehorn` | 0 | 0 | 0 | 1 | 4 | 3 | 4 | 3 | Reject |
| scaffold-exercises | Course exercise directory stubs | 0 | 0 | 0 | 1 | 4 | 3 | 4 | 3 | Reject |
| setup-pre-commit | Husky + lint-staged + Prettier | 1 | 0 | 0 | 1 | 3 | 1 | 2 | 3 | Reject |

---

## 4. Integrate shortlist

### diagnosing-bugs

**What it does.** A gated diagnosis loop for hard bugs and performance regressions. Phase 1 is the skill: invent a tight, red-capable, agent-runnable feedback loop before reading code for a theory. Then reproduce and minimise, rank 3–5 falsifiable hypotheses, instrument one variable at a time with tagged logs, fix at a correct seam, and clean up. Secrets are redacted before anything is shown.

**Why Life Hub benefits.** This repo fails in mixed places: vanilla DOM, Netlify Functions, cross-origin cookies, Playwright, fixture-backed mocks, and confirm-card write paths. Agents currently guess from source too often. Ponytail says "root cause, not symptom" but does not impose a reproduce-first loop. Superpowers `systematic-debugging` is already in the Cursor plugin and is weaker here: it starts from reading errors and adding logs, not from building one command that goes red on the user's exact symptom.

**Gap filled.** Evidence-first debugging with a mandatory red loop, minimisation, single-variable instrumentation, tagged cleanup, and a regression test only when a real seam exists.

**Overlaps.** Ponytail root-cause rule; Superpowers systematic-debugging; Superpowers verification-before-completion. Acceptable because Matt's skill is the only one that refuses hypothesis until a red-capable command exists, and because it is scoped to hard bugs rather than "any technical issue."

**Risks.** Six phases can be too heavy for a one-line CSS miss or a typo. The skill is model-invoked on "broken / throwing / failing / slow," so it could fire on ordinary test failures. HITL bash scripts and throwaway harnesses can leave debris if cleanup is skipped.

**Activation.** Task-matched, not always-on. Invoke when Adam reports a hard bug, flake, or performance regression, or when Cursor cannot get a tight repro. Do not invoke for copy, tokens, or trivial mechanical edits.

**Verbatim vs guardrails.** Keep the upstream loop verbatim. Add Life Hub guardrails beside it, not inside a fork if it can be avoided:

1. Ponytail and the design kit still win.
2. Skip the full loop for trivial edits.
3. Use existing `npm test`, `npm run test:browser`, and fixture tools before inventing a new harness.
4. Do not create `CONTEXT.md` just because the skill mentions it.
5. Prefer this skill over Superpowers systematic-debugging for Life Hub bugs, so two debug rituals do not run at once.

---

## 5. Available on demand shortlist

### code-review

**When useful.** A branch or PR needs a structured review against a known spec or issue, and Adam asks for review. The two-axis split (Standards vs Spec) is genuinely useful: it stops "the code looks tidy" from hiding a missed requirement, and stops "it matches the ticket" from hiding a confirm-card or kit violation.

**Why not routine.** Superpowers `requesting-code-review` already fires around task completion. Matt's Standards axis carries a Fowler smell baseline that wants new types, extracted shapes, and polymorphism. That fights Ponytail. The skill also expects `docs/agents/issue-tracker.md` from setup.

**How to invoke.** Adam says "review this branch against X" or names `code-review`. Never model-auto on every commit.

**Risks.** Smell-driven refactors; duplicate review loops; pressure to run `/setup-matt-pocock-skills`. Guardrail: repo standards (Ponytail, design kit, umbrella plan) override the Fowler baseline. Spec axis stays; smell axis is judgement only.

### tdd

**When useful.** New behavioural logic, API contract changes, or complex state transitions (chat confirm, auth, aggregations, model parsers) where a public seam already exists.

**Why not routine.** The skill does not distinguish styling, copy, config, docs, or tiny mechanical edits. It is model-invoked on "features or fix bugs test-first" and "integration tests." Blanket red-green would fight Ponytail's "trivial one-liners need no test" and would inflate Playwright/unit surface area.

**How to invoke.** Adam names TDD, or a later Life Hub pointer lists the allowed cases. Disable implicit invocation if the skill is installed.

**Risks.** See §10 and the TDD special treatment below. Also: `tdd` optionally calls `codebase-design`, and `implement` treats TDD as mandatory. Do not install `implement`.

### codebase-design

**When useful.** A real module-shape question: where should a seam sit, is this wrapper earning its keep, how should a testable interface look. Useful during consolidation when two hub copies of the same idea need one deep module rather than another helper file.

**Why not routine.** It is a design vocabulary, not a daily coding procedure. `DESIGN-IT-TWICE.md` spawns parallel interface designers. "Accept dependencies, don't create them" is fine; treating every function as a Module with Adapters is not.

**How to invoke.** Adam asks for module design / deepening / seam placement, or `improve-codebase-architecture` needs the vocabulary.

**Risks.** Speculative seams, extra files, "deep module" rewrites of locked kit code. Guardrail: analysis and vocabulary only unless Adam asks to implement a candidate.

### improve-codebase-architecture

**When useful.** Occasional survey of a hot area (chat write path, umbrella remount, design-kit consumption) when Adam wants candidates, not a refactor. The skill is user-invoked, writes an HTML report to `$TMPDIR`, and asks which candidate to explore. It does not implement on its own.

**Why not routine.** High scope-expansion risk. It then calls `grilling` and `domain-modeling`, and can start CONTEXT.md / ADR writes. Recommendation strength badges can make speculative cleanups look mandatory.

**How to invoke.** Adam types it or says "survey architecture in X." Never on a normal feature.

**Risks.** Orchestration failure if companion skills are missing. Agents may treat the report as permission to restructure. Guardrail: stop after the report unless Adam picks a candidate; do not write CONTEXT.md/ADRs; do not implement during the survey.

### grilling

**When useful.** A large, ambiguous product decision that Superpowers brainstorming would otherwise leave half-specified: a new hub surface, an auth/CORS change, a data-model fork.

**Why not routine.** Relentless frontier rounds are expensive on small work. Life Hub already has brainstorming, written specs, and a design kit that answers most UI questions.

**How to invoke.** Adam says "grill me" / "stress-test this decision." Do not also install `grill-me` or `grill-with-docs`.

**Risks.** Interview sprawl; refusal to act until the tree is empty, even when Adam already decided. Guardrail: Adam can stop the session and keep the decisions already made.

---

## 6. Rejected skills

### Process suite Life Hub does not run

- **setup-matt-pocock-skills** — writes `docs/agents/`, triage labels, and an Agent skills block into `CLAUDE.md`. That is a new instruction plane. Not needed unless Adam later adopts the tracker workflow.
- **ask-matt** — router into grill → spec → tickets → implement. Installing it invites the whole suite.
- **grill-with-docs** — grilling plus mandatory CONTEXT.md/ADR creation. New persistent docs system on top of consolidation plan + design kit + Superpowers specs.
- **grill-me** — wrapper around `grilling`. Keep the primitive only.
- **domain-modeling** — useful only if Life Hub adopts CONTEXT.md. It does not have one, and should not grow one just to satisfy this skill.
- **to-spec** — Superpowers specs already exist; this one publishes to a configured tracker and asks for long user-story lists.
- **to-tickets** — ticket graph + "prefactor the code to make the change easy." Bureaucracy and speculative cleanup.
- **implement** — forces TDD, code-review, and commit. Orchestrates other skills and expands scope.
- **wayfinder** — multi-session decision tickets on GitHub Issues. Consolidation already has `docs/consolidation/plan.md` and overseer checkpoints.
- **triage** — label state machine and AI-generated issue comments. Not how this repo is run.

### Covered already, or too thin

- **research** — three instructions and a new markdown file. Firecrawl / existing research habits are enough.
- **resolving-merge-conflicts** — fifteen lines of ordinary git hygiene; "never `--abort`" is slightly rigid.
- **handoff** — Superpowers plans and consolidation checkpoints already hand work between sessions.
- **wait-what** — cute, but it assumes CONTEXT.md and does not earn a skill slot.
- **writing-for-agents** — Superpowers `writing-skills` already covers this; Life Hub is not primarily authoring Matt-style skills.
- **wizard** — occasional Netlify/Cloudflare clicks do not justify generated bash wizards that write `.env` and `gh secret`.

### Design-kit and architecture conflict

- **prototype** — the logic branch is attractive; the UI branch is not. It is model-invoked on "what should this look like" and asks for several *radically different* layouts, including throwing out shared layout. That conflicts with the locked kit (rail, chrome, confirm cards, tokens). Too easy for an agent to fire during ordinary UI work.
- **setup-ts-deep-modules** — dependency-cruiser plus a `src/packages/*/lib` shape Life Hub does not use.
- **setup-pre-commit** — Husky, lint-staged, Prettier. Knowledge `AGENTS.md` says there is no ESLint/Prettier and not to invent one. Ponytail forbids extra tooling.

### Wrong product

- **teach**, **to-questionnaire** — not Life Hub engineering.
- **writing-beats**, **writing-fragments**, **writing-shape** — article workshop, in-progress.
- **scaffold-exercises** — course repo tooling.
- **migrate-to-shoehorn** — Total TypeScript test helper; this repo is not that stack.
- **git-guardrails-claude-code** — Claude Code hooks only.
- **claude-handoff** — `claude --bg`, not Cursor.
- **loop-me** — in-progress workflow-spec workshop.
- **implement-spec** — concurrent worktrees, draft PR, merger subagents. High chaos; Cloud Agent git rules already constrain branching/PRs.
- **retro** — stub that proposes steering-file and lint changes after a session.

---

## 7. Overlap analysis

### Debugging

`diagnosing-bugs` overlaps Superpowers `systematic-debugging` and Ponytail's root-cause paragraph.

**Winner:** `diagnosing-bugs`, for Life Hub, because of the red-loop gate and secret redaction.

Do not keep both active. If Matt's skill is added, Life Hub instructions should prefer it and treat Superpowers debugging as fallback only.

### Review

`code-review` overlaps Superpowers `requesting-code-review`.

**Winner for on-demand structured review:** Matt's two-axis skill, with Ponytail overriding Fowler smells.

**Winner for routine completion checks:** existing verification + design-kit + tests. Do not auto-run both review skills.

### TDD / testing

`tdd` overlaps Superpowers `test-driven-development` and Ponytail's "one runnable check."

**Winner as a repo law:** Ponytail. It already allows no test for trivial work.

**Winner as an optional procedure for new behaviour:** Matt's `tdd`, because it tests public seams, forbids tautologies, and keeps refactoring out of the red-green loop. Superpowers TDD is more absolute ("Always" including refactoring; delete production code if written first) and is a worse fit.

Do not install both TDD skills into the repo.

### Architecture

`codebase-design`, `improve-codebase-architecture`, `setup-ts-deep-modules`, and `domain-modeling` overlap.

**Winner for vocabulary:** `codebase-design`.

**Winner for an occasional survey:** `improve-codebase-architecture`, user-invoked only.

**Reject:** `setup-ts-deep-modules` (tooling + layout) and `domain-modeling` (CONTEXT.md system).

### Planning / specs / tickets

`ask-matt`, `grill-with-docs`, `to-spec`, `to-tickets`, `implement`, `wayfinder`, `triage`, `implement-spec`, plus Superpowers brainstorming / writing-plans / `docs/superpowers/*`.

**Winner:** existing Life Hub + Superpowers planning. Reject the Matt shipping pipeline as a bundle.

### Grilling

`grilling`, `grill-me`, `grill-with-docs`, and Superpowers brainstorming overlap.

**Winner:** `grilling` as the one interview primitive. Reject the wrappers.

### Handoff

`handoff`, `claude-handoff`, consolidation checkpoints, Superpowers plans.

**Winner:** existing plan/checkpoint docs. Reject both Matt handoff skills.

### Research / writing

`research` and `writing-for-agents` overlap Firecrawl skills and Superpowers `writing-skills`.

**Winner:** existing tools. Reject both.

---

## 8. Ponytail interaction

Ponytail stays the universal discipline. The shortlist is specialised procedure, not a replacement.

| Skill | Extra abstractions? | Extra files? | Speculative cleanup? | New deps? | Broad refactors? | Mandatory on trivial work? | Conflicts with smallest correct impl? | Worth the overhead? |
|-------|---------------------|--------------|----------------------|-----------|------------------|----------------------------|----------------------------------------|---------------------|
| diagnosing-bugs | No | Only if a new harness is required | No, if cleanup runs | No | No | No, if scoped to hard bugs | No | Yes |
| code-review | Smell baseline can request them | No | Yes, if smells are treated as defects | No | Possible | No, if on demand | Yes, unless Ponytail overrides smells | Yes, with guardrails |
| tdd | Can, if seams are invented | Test files | No | No, if existing runner is used | No | Yes, if left model-invoked | Yes, if applied to kit/copy/config | Yes, only for new behaviour |
| codebase-design | Yes, if used as a rewrite license | Possible | Yes | No | Yes, if DESIGN-IT-TWICE is treated as an implement step | No, if on demand | Possible | Yes, as vocabulary |
| improve-codebase-architecture | Yes, after a candidate is picked | HTML in temp; CONTEXT.md if domain-modeling runs | Yes | Tailwind/Mermaid via CDN in the temp report only | Yes, if the report is executed | No | Possible | Yes, as survey only |
| grilling | No | No | No | No | No | Yes, if used on small tasks | No | Yes, for large decisions |

Where any shortlisted skill conflicts with Ponytail, the design kit, or `docs/consolidation/plan.md`, those win. No exception is implied by this audit.

---

## 9. Existing Life Hub instruction overlap

### diagnosing-bugs

Overlaps Ponytail's bug-fix paragraph and Superpowers debugging. Still worth it: Life Hub does not currently have a repo-local, loop-first debug procedure, and the existing plugin skill is easier to skip or to start from code reading.

### code-review

Overlaps Superpowers review and Ponytail's finishing questions ("did I add an abstraction," "did I change behaviour outside the task"). Still worth an on-demand copy because the Spec axis is tighter than Superpowers' generic reviewer prompt, *if* Ponytail overrides the smell baseline.

### tdd

Overlaps Ponytail's one-check rule, `package.json` test scripts, browser specs, and Superpowers TDD used throughout `docs/superpowers/plans`. Still worth an on-demand copy only as a *narrower* alternative to Superpowers TDD, not as a new always-on law.

### codebase-design / improve-codebase-architecture

Overlap `docs/consolidation/plan.md`, the umbrella rule, and Ponytail reuse/deletion tests. Still worth occasional use because the consolidation plan says *what* the topology is, not *how* to look for shallow modules inside a hot path. They must not outrank the plan or revive folded repos.

### grilling

Overlaps Superpowers brainstorming and existing specs. Still worth a rare manual interview when a decision is large and the kit/plan do not already answer it.

None of the shortlist should be referenced from always-on Cursor rules. That would duplicate Ponytail's job.

---

## 10. Orchestration risks

Matt's repo is explicit: user-invoked skills may call model-invoked skills via "Call the Skill tool with …". Cursor supports skill files, but it does not guarantee Claude-Code-style Skill-tool chaining. This was not tested; it is a reliability concern, not a solved design.

| Skill | Self-contained? | Expects before | Expects after / during | Weakened if companion missing? | Cursor invocation fit | Extra Life Hub orchestration needed? |
|-------|-----------------|----------------|------------------------|--------------------------------|------------------------|--------------------------------------|
| diagnosing-bugs | Yes | Optional CONTEXT.md | None | No | Good as a single task-matched skill | Pointer only: when to use / not use |
| code-review | Mostly | `docs/agents/issue-tracker.md` from setup | Parallel sub-agents | Spec axis weakens without a spec path; setup is not required if Adam points at a spec | Good if invoked with a fixed point and spec path | Do not run setup just to unlock review |
| tdd | Mostly | User-confirmed seams | Optional codebase-design; implement wants it plus code-review | Slightly | Poor if left model-invoked | Must disable implicit invocation |
| codebase-design | Yes as reference | None | DESIGN-IT-TWICE is optional | No | Good | None |
| improve-codebase-architecture | No | codebase-design | grilling, domain-modeling, optional DESIGN-IT-TWICE | Yes. Without grilling the survey still works; without codebase-design the vocabulary drifts; without domain-modeling it may try to create CONTEXT.md and fail or improvise | Weakest of the shortlist | If installed, tell Cursor: survey + report only; skip companion writes |
| grilling | Yes | None | Used by several rejected wrappers | No | Good as manual | None |

Do not solve this by installing the missing companions "so the chain works." That is how the rejected suite creeps back in.

`ask-matt` / `implement` / `to-tickets` are the highest orchestration risk in the whole repo. They are rejected for that reason.

---

## 11. Proposed final skill set

```text
Ponytail                          → universal simplicity discipline (already always on)
diagnosing-bugs                   → hard bugs and performance regressions
tdd                               → new behavioural logic at public seams only
code-review                       → on-demand Standards vs Spec review
codebase-design                   → on-demand module / seam vocabulary
improve-codebase-architecture     → rare user-invoked survey, not a refactor licence
grilling                          → rare decision interview
```

That is one always-on local law, one integrated debug procedure, and four manual specialist procedures.

It is not the Matt "idea → ship" main flow. That flow is the thing not to install.

---

## 12. Integration plan

Do not do this now. After Adam approves a shortlist:

1. **File locations.** Prefer project skills under `.cursor/skills/<name>/` (or the current Life Hub skill path if one is chosen later). Do not install the Claude Code plugin bundle. Do not run `npx skills add mattpocock/skills` for the whole set.

2. **Upstream files.** Copy only approved `SKILL.md` files plus the few reference files they need (`tdd/tests.md`, `tdd/mocking.md`, `codebase-design/DEEPENING.md`, `improve-codebase-architecture/HTML-REPORT.md`). Leave `DESIGN-IT-TWICE.md` out unless Adam wants interface bake-offs. Do not vendor `setup-matt-pocock-skills`, tracker templates, or the plugin.

3. **Life Hub guardrails.** Keep them in one small local file, for example `.cursor/skills/README.md` or a short section in a future root `AGENTS.md`, not by rewriting Matt's prose. Guardrails: Ponytail wins; design kit wins; consolidation plan wins; no CONTEXT.md/ADR/docs/agents unless Adam asks; TDD never auto; architecture survey does not implement; code-review smells are judgement only.

4. **Activation.**
   - `diagnosing-bugs`: task-matched pointer from a future `AGENTS.md` line, not an always-on rule.
   - The other four: explicit invocation only. If a skill is model-invoked upstream, install it with implicit invocation disabled.

5. **Update strategy.** Pin the upstream SHA in the local skills README. Refresh only the approved files, on purpose. Do not subscribe to the whole plugin.

6. **Verification.** After a later integration task: confirm git only adds the approved skill files; confirm no `docs/agents/` or `CONTEXT.md` appeared; run a dry-read that Cursor would load the new skill descriptions; do not treat a plugin install as success.

---

## 13. What not to install

Especially tempting, still no:

- **The whole plugin / `npx skills add mattpocock/skills`.** It installs the shipping pipeline and makes `setup-matt-pocock-skills` the onboarding step.
- **setup-matt-pocock-skills.** The thin end of the wedge. Once `docs/agents/` exists, `to-spec` / `triage` / `wayfinder` look unfinished without it.
- **ask-matt + implement + to-spec + to-tickets + wayfinder + triage.** A second SDLC. Life Hub already has Superpowers plans and a consolidation overseer.
- **grill-with-docs + domain-modeling.** A CONTEXT.md/ADR culture on top of plan.md and the design kit.
- **prototype, especially the UI branch.** Locked kit vs "radically different variants."
- **Superpowers TDD and Matt TDD together.** Two iron laws. Keep Ponytail as the law; Matt TDD only when asked.
- **setup-pre-commit / setup-ts-deep-modules.** New tooling the repo has already declined.
- **in-progress implement-spec.** Concurrent worktrees and auto PRs.

---

## 14. Upstream reference

| Field | Value |
|-------|-------|
| Repository | https://github.com/mattpocock/skills |
| Commit SHA | `3cca18b368ae95cdbdebbff572ccafa662551015` |
| Release / version | `1.2.3` (`package.json` and `.claude-plugin/plugin.json`) |
| Commit date | 2026-09-04 |
| Audit date | 2026-09-05 |
| Promoted skills in plugin | 25 (`.claude-plugin/plugin.json` `skills` array length; engineering 18 + productivity 7) |
| Additional skills inventoried | 8 in-progress + 4 misc = 12 |
| Total inventoried | 37 |
| 37 vs 38 note | An earlier draft said "26 promoted + 8 in-progress + 4 misc = 37". Those category counts sum to 38. Recount at this SHA: unique `SKILL.md` files = 37; plugin list = 25, not 26. The total 37 was right; the promoted count was off by one. |
| How skills are intended to work | User-invoked vs model-invoked (`.agents/invocation.md`). User-invoked skills orchestrate; model-invoked skills hold reusable discipline. Setup writes per-repo `docs/agents/*`. |

---

## 15. Git state

Confirmed at audit end:

1. No branch created — still `main`
2. No commit created for this work
3. No push
4. No PR
5. No merge
6. No application source changes
7. No dependency changes
8. No Cursor rule changes
9. `life-hub-data` untouched

This report is local and uncommitted: `MATT_POCOCK_SKILLS_AUDIT.md`.

---

## Appendix A — Special treatment of TDD

Matt's `tdd` skill does **not** distinguish new behavioural logic, bug fixes, complex state, API behaviour, styling, copy, config, docs, tiny mechanical edits, or untested legacy surfaces. The trigger is "features or fix bugs test-first" or "integration tests." Anti-patterns (implementation-coupled, tautological, horizontal slicing) are good. The loop forbids refactoring during red-green, which is better than Superpowers TDD.

If later installed:

| Activate | Do not activate |
|----------|-----------------|
| New behavioural logic behind a public function/API | Pure styling / design-kit token work |
| Chat/auth/model/state machines | Copy changes |
| Bug with a correct existing seam | Config, workflow, and docs |
| | Tiny mechanical edits |
| | Untested legacy surfaces unless Adam wants a characterisation test first |

Interaction with existing tests: write `node:test` or Playwright tests in the current trees. Do not add Jest/Vitest to Life's root suite. Do not mock internal collaborators; mock only system boundaries, which Life Hub already does with `scripts/mock-api.mjs` and fixtures.

Interaction with Ponytail: Ponytail remains the default. Matt TDD is a procedure for the cases above. Public behaviour, not implementation details. One vertical slice, not a wall of imagined tests.

---

## Appendix B — Special treatment of debugging

`diagnosing-bugs` does enforce a useful evidence loop:

`feedback loop that goes red → reproduce + minimise → hypothesise → instrument → fix + regression test → cleanup`

Safeguards present: no hypothesis without a red-capable command; one variable at a time; tagged logs; refuse to declare done without rerunning the original loop; redact secrets; document missing seams instead of writing a false-confidence unit test.

This would materially improve Cursor on Life Hub hard bugs. It survives the audit. It does not survive as an always-on rule for every failed assertion.

---

## Appendix C — Special treatment of architecture

`improve-codebase-architecture` is the better of the two architecture skills for *analysis*: it scopes to hot paths, uses a deletion test, writes a temp HTML report, and asks before proposing interfaces. It does not auto-restructure.

`codebase-design` is the better *vocabulary*. `DESIGN-IT-TWICE` and `setup-ts-deep-modules` are the dangerous extras (parallel redesigns; cruiser-enforced package layout).

An architecture audit is not permission to refactor. Any later install must say that in Life Hub words, because the skill's grilling step is designed to turn a candidate into a deepening project.

---

## Appendix D — Special treatment of code review

Matt's review is better than a style linter and better than an unranked comment dump: two axes, word caps, documented standards override smells, tooling-enforced issues are skipped.

It does **not** natively prioritise security, accessibility, data integrity, or confirm-card / `life-hub-data` invariants. Those already live in Ponytail guardrails and the design kit. A Life Hub wrapper should tell the Standards agent to load those files first.

The Fowler baseline is the defect: Primitive Obsession, Data Clumps, and Repeated Switches will generate optional-looking "improvements" that Ponytail would delete. Treat them as noise unless they hide a real bug.

---

End of audit. Stop. No integration.