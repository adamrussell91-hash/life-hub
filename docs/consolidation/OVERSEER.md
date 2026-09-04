# Consolidation overseer (Claude Code)

## How to find this file

Claude Code must run with **cwd = the `life-hub` git repo root** (same folder as root `CLAUDE.md`).

| Location | Path |
|----------|------|
| **Repo-relative (use in prompts)** | `docs/consolidation/OVERSEER.md` |
| **Plan (SoT)** | `docs/consolidation/plan.md` |
| **Checkpoint reports** | `docs/consolidation/checkpoints/checkpoint-NN.md` |
| **Adam’s Mac (typical)** | `~/Projects/life-hub/docs/consolidation/OVERSEER.md` |
| **GitHub** | `adamrussell91-hash/life-hub` → `docs/consolidation/` on branch `main` |

Root [`CLAUDE.md`](../../CLAUDE.md) points here automatically when Claude Code opens this repo.

(In the future umbrella repo, keep this exact relative path: `docs/consolidation/OVERSEER.md`.)

This file defines Claude Code’s **role and scope**. It is not the migration plan. The plan is [`plan.md`](./plan.md). Checkpoint outputs go only under [`checkpoints/`](./checkpoints/).

---

## Role

You are the **consolidation overseer**: critic, scoper, and checkpoint auditor.

You help Adam avoid sprawl, auth mistakes, and plan drift while Cursor local agent does the implementation.

| You do | You do not |
|--------|------------|
| Critique and tighten `plan.md` | Edit application source, configs for deploy, or design-kit CSS/JS |
| Flag scope creep and missing risks | Move/rename/delete repo files or folders |
| Write observe-only checkpoint reports | `git add` / `git commit` / `git push` / open PRs |
| Propose **wording** Cursor should paste into `plan.md` | Apply those edits yourself unless Adam explicitly says “update plan.md only” in that turn |
| Say “do not merge yet” when boundaries break | “Just fix this one file” in the product code |

**Default stance at checkpoints:** read-only observation → report file → stop.

---

## Scope

**In scope**

- Hub consolidation architecture and migrate order
- One code repo (+ `life-hub-data` unchanged)
- One Adam operator session/auth; public Teaching student URLs remain unauthenticated
- Single design-kit source; no sync-to-N-repos as the long-term model
- Shared agent runtime so Hammond (and peers) can see across hub domains once data is reachable
- Consolidated calendar as a shell-level capability (sources may land in phases)
- Netlify retarget vs new site tradeoffs; Cloudflare/R2 blast radius
- Cursor ↔ Claude handoff quality (plan as SoT, no parallel chat plans)

**Out of scope**

- Changing `life-hub-data` schema, path policy, or replacing it
- Greenfield rewrite of Life Hub chat/agents
- iCloud paths (`~/Desktop`, `~/Documents`); code lives under `~/Projects/…` or Teaching Hub paths Adam already uses
- Implementing features, refactors, or deploy cutovers yourself
- Inventing new design tokens outside `design-kit`

---

## Source of truth

1. [`plan.md`](./plan.md) — architecture, order, status (Cursor maintains)
2. This file — your mandate
3. [`checkpoints/checkpoint-NN.md`](./checkpoints/) — your written audits
4. Git diff / PR against the agreed branch — what you observe at checkpoints

If chat disagrees with `plan.md`, **`plan.md` wins** until Cursor updates it.

---

## Inventory (FILL_IN)

Fill before the first serious critique. Secret **values** are never pasted here — only names, site labels, and public URLs.

### GitHub

| Item | Value |
|------|--------|
| Umbrella / code repo (target) | **Reuse `adamrussell91-hash/life-hub`** (grow in place; decided 2026-09-01) |
| Data repo (frozen) | `adamrussell91-hash/life-hub-data` (confirm) |
| Current hub code repos | `life-hub`, `teaching-hub`, `knowledge-hub`, `Tasks-Hub`, `widgets`, `proxies` (confirm), `hub-design-kit` (confirm) |
| Design kit canonical remote | `github.com/adamrussell91-hash/hub-design-kit` |

Known env **names**:

- **Life Hub API:** `LIFE_HUB_PASSPHRASE_HASH`, `SESSION_SECRET`, `GITHUB_REPOSITORY`, `GITHUB_BRANCH`, `GITHUB_TOKEN`, `GITHUB_TOKEN_EXPIRES`, `SITE_ORIGIN`, `ANTHROPIC_API_KEY`
- **Teaching Hub API:** `TEACHING_HUB_PASSPHRASE_HASH`, `SESSION_SECRET`, `SITE_ORIGIN`, `ANTHROPIC_API_KEY` (later); cookie `teaching_hub_session`
- **Umbrella (target):** retain Life Hub env names — `LIFE_HUB_PASSPHRASE_HASH`, `SESSION_SECRET` (no new umbrella secret set; decided 2026-09-01)

### Netlify (no secret values)

Adam dashboard export 2026-09-01:

| Hub / API | Site name (dashboard) | Site ID | Public Functions URL | `SITE_ORIGIN` (app origin) | Notes |
|-----------|----------------------|---------|----------------------|----------------------------|--------|
| Life Hub API | `life-hub2` | `5771ee5c-0cb2-4858-b03d-2637f092050e` | `https://api.adam-russell.com` | `https://life-hub.adam-russell.com` | **Absorb target** — present and enabled; all hub APIs live here |
| Teaching Hub API | `arteaching-hub` | `899b0fd3-53b3-45a0-bbfb-0238264d9246` | `https://teaching-api.adam-russell.com` | remounted `/teaching/` | **Deleted 2026-09-04** — site ID absent; domain 404 |
| Tasks Hub API | `artasks-hub` | `c6696619-f478-4ac1-b0cd-1e4cfd3101df` | `https://tasks-api.adam-russell.com` | remounted `/tasks/` | **Deleted 2026-09-04** — site ID absent; domain 404 |
| Knowledge Hub API | `knowledge-hub-archive` | `ff82fc91-2f4d-45b9-8c85-f5f35a8875eb` | `https://knowledge-api.adam-russell.com` | remounted `/knowledge/` | **Deleted 2026-09-04** (Netlify site only — **not** the R2 bucket) |
| Proxies (widgets OpenAI) | `jade-melomakarona-ea20fe` | `4d8c41e5-57b0-45a8-a607-80114a5d973a` | `https://jade-melomakarona-ea20fe.netlify.app` | n/a | **Keep** — do not migrate or fold onto `life-hub2` |

**Proxies functions:** `/.netlify/functions/ai` (OpenAI chat proxy), `/.netlify/functions/generate` (HSC Paper 1). CORS exact-match + model/`max_tokens` caps (proxies #1). Widgets stay here (Adam, 2026-09-04).

### Cloudflare / R2

| Resource | Name | Used by | Notes |
|----------|------|---------|--------|
| R2 bucket | `knowledge-hub-archive` | Worker `knowledge-hub-research` as binding `ARCHIVE` | ~5,940 objects / 4.07 GB (`notes/`, `podcast/`, `research/`, `university/`); CF account `100c592ec8d777abf2646a08525d0cc4`; **independent of** Netlify site with same name |
| Worker | `knowledge-hub-research` | `knowledge-hub` | Research edge; merge vs keep-separate at fold |
| Other R2 / KV / D1 / Workers | FILL_IN | FILL_IN | |

### Local paths (Adam machine)

| Role | Path |
|------|------|
| Umbrella checkout | FILL_IN — under `~/Projects/…` only |
| Cursor local workspace | FILL_IN |

---

## Phase prompts (paste into Claude Code)

### A — First critique / scope pass

```text
You are the consolidation overseer. Read and obey:
  docs/consolidation/OVERSEER.md
  docs/consolidation/plan.md

Task: Critique and scope the plan only.
- Do not modify any files outside docs/consolidation/ (prefer proposing plan text rather than editing; if Adam allows plan-only edits, you may update plan.md wording only).
- Check: life-hub-data frozen; one Adam auth; public student routes; design kit once; Netlify retarget preference; calendar phased; no Desktop/iCloud; migrate order realistic for Life→umbrella→new section→fold others.
- Call out holes using FILL_IN inventory — list what Adam must supply.
- Output: (1) verdict, (2) must-fix risks, (3) proposed plan.md edits as a markdown patch block, (4) suggested first Cursor action slice (max 5 bullets).
```

### B — Checkpoint report (observe-only)

```text
You are the consolidation overseer at a checkpoint. Read and obey:
  docs/consolidation/OVERSEER.md
  docs/consolidation/plan.md

Observe-only rules (hard):
- Do NOT edit application code, move files, run destructive git, or commit.
- You MAY create or update exactly one report:
  docs/consolidation/checkpoints/checkpoint-NN.md
  (use the next unused NN: 01, 02, …)

Inspect: git status, diff vs the plan’s expected phase, and any PR notes Adam provides.

Write the report using the template in OVERSEER.md.
End with: next 3 concrete steps for Cursor local agent — no patches.
If auth, life-hub-data boundary, or public student URL safety looks wrong, open with DO NOT MERGE YET.
```

### C — Post-fold audit (observe-only, thorough)

Hub API consolidation is complete. Use this when Adam wants a sweep for leftover breakage.

```text
You are the consolidation overseer running the post-fold audit.

Read and obey, in this order:
  docs/consolidation/OVERSEER.md
  docs/consolidation/plan.md
  docs/consolidation/POST-FOLD-AUDIT.md

Hard rules:
- Observe-only. Do not edit application code, configs, or design-kit files.
- Do not git add / commit / push / open PRs / delete sites / rotate tokens.
- Do not print secret values or ask for the Life passphrase.
- Do not treat widgets migration or GITHUB_TOKEN rotation as work to do.
- You MAY create exactly one report: docs/consolidation/checkpoints/checkpoint-10.md
  (next unused NN if 10 exists).

Task: run every check in POST-FOLD-AUDIT.md against origin/main (pull first).
For each check record PASS / FAIL / SKIP with evidence (command + output snippet, or file:line).
A known product leftover is not a consolidation FAIL unless it breaks an invariant.

Write the checkpoint using the template at the bottom of POST-FOLD-AUDIT.md.
If auth, life-hub-data, Knowledge-repo targeting, or public student URL safety is wrong, verdict is DO NOT TREAT PRODUCTION AS SAFE.
```

---

## Checkpoint report template

Save as `docs/consolidation/checkpoints/checkpoint-NN.md`:

```markdown
# Checkpoint NN — YYYY-MM-DD

## Verdict
PASS | PASS WITH NITS | DO NOT MERGE YET

## Diff vs plan
- Done:
- Drifted:
- Blocked:

## Boundary check
- life-hub-data untouched: yes/no — notes
- Single Adam session/auth path: yes/no — notes
- Public student (or other public) routes still unauthenticated by design: yes/no/n/a — notes
- Secrets / tokens blast radius: ok/risk — notes
- Design kit still single source: yes/no — notes

## Deploy / env
- Netlify / Pages / Cloudflare notes (no secret values)

## Calendar / cross-domain
- Progress toward consolidated calendar: none/partial/blocked — notes

## Risks
1.
2.

## Next 3 steps (Cursor only)
1.
2.
3.
```

---

## Checkpoint cadence (suggested)

| When | Report |
|------|--------|
| After `plan.md` v1 accepted | Critique pass (Phase A); optional `checkpoint-00-plan.md` if you want it filed |
| After umbrella seed boots (Life shell + kit + docs) | `checkpoint-01` |
| After Netlify/git retarget documented or done | `checkpoint-02` |
| After first non-Life section or calendar slice lands | `checkpoint-03` |
| Before any production cutover / DNS flip | `checkpoint-NN` with explicit merge gate |
| After hub API fold is complete | Phase C — `POST-FOLD-AUDIT.md` → `checkpoint-10` |

Adam may insert extra checkpoints anytime; always observe-only unless he explicitly widens your mandate in writing in the prompt for that turn.
