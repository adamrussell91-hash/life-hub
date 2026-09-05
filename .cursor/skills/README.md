# Life Hub project skills

Upstream: https://github.com/mattpocock/skills  
Pinned SHA: `3cca18b368ae95cdbdebbff572ccafa662551015` (plugin / package `1.2.3`)

Five skills only. Bodies are upstream verbatim. Frontmatter is a Life Hub overlay for activation. Overrides live here and in `.cursor/rules/life-hub-skills.mdc`, not inside the vendored bodies.

Cursor may ignore `disable-model-invocation`. The four explicit skills therefore use descriptions that start with "Manual skill. Do not invoke unless…" so the model is not baited by "Use when…".

## Installed

| Skill | Activation | Vendored files |
|-------|------------|----------------|
| `diagnosing-bugs` | Task-matched | `SKILL.md`, `scripts/hitl-loop.template.sh` |
| `code-review` | Explicit only | `SKILL.md` |
| `tdd` | Explicit only | `SKILL.md`, `tests.md`, `mocking.md` |
| `codebase-design` | Explicit only | `SKILL.md`, `DEEPENING.md` |
| `grilling` | Explicit only | `SKILL.md` |

Not installed: `improve-codebase-architecture`, `DESIGN-IT-TWICE.md`, the plugin, `setup-matt-pocock-skills`, and every other upstream skill.

## Life Hub overrides

Ponytail, `ponytail-project-guardrails`, the design kit, and `docs/consolidation/plan.md` outrank these skills.

- Do not run `setup-matt-pocock-skills`. Do not create `CONTEXT.md`, `docs/adr/`, or `docs/agents/`.
- If a skill mentions a missing `CONTEXT.md` or ADR, skip that read. If `code-review` asks for `docs/agents/issue-tracker.md`, ignore it: use the spec path Adam gives, or the current conversation, or report "no spec available".
- `code-review`: Life Hub standards (Ponytail, design kit, umbrella plan, first-pass correctness, agent-context integrity) override the Fowler smell baseline. Smells are judgement only. Do not treat new types, extracted helpers, or polymorphism as required.
- `tdd` is not a blanket rule. Use it only when Adam explicitly asks, and only for new behavioural logic, API contracts, or complex state at a public seam. Not for styling, copy, config, docs, or tiny mechanical edits. Use existing `node:test` / Playwright / fixture checks.
- `codebase-design` is vocabulary. It is not permission to refactor. `DESIGN-IT-TWICE.md` is not vendored; do not invent that procedure.
- `grilling` stops when Adam says stop, even if the design tree is not empty.
- `diagnosing-bugs` is the Life Hub debug procedure. Do not also run Superpowers `systematic-debugging` on the same failure.
