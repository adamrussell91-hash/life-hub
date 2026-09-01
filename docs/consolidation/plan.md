# Hub consolidation plan

> **Status:** v2.2 — auth + repo decided (minimal secret churn). Netlify dashboard site names still AWAITING ADAM.  
> **Non-goal locked:** `life-hub-data` repository shape and access model do not change as part of consolidation (API keeps pointing at it).

## Intent

One operator-facing hub product: one code repo, one Adam session/auth, one design kit, one agent runtime (Hammond et al. can see across domains). Private data stays in `life-hub-data`. Public student URLs stay unauthenticated.

## Decisions (source of truth — must be filled here, not only in chat)

### Repo (step 1)

| Field | Value |
|-------|--------|
| Umbrella code repo | **Reuse `life-hub`** — grow in place; no new GitHub repo |
| Existing `life-hub` GitHub repo after consolidation | **Leave as-is** — same repo name, same Netlify hook target, same clone URLs |

Rationale (Adam, 2026-09-01): retain workable secrets and avoid re-keying — reusing the repo keeps GitHub Pages workflow, Netlify link, and env var names stable.

### Auth (step 2)

| Field | Value |
|-------|--------|
| Secret strategy | **Retain Life Hub secrets** — no new passphrase hash or `SESSION_SECRET` for umbrella |
| Passphrase hash env | Keep `LIFE_HUB_PASSPHRASE_HASH` (unchanged on Netlify) |
| Session secret env | Keep `SESSION_SECRET` (unchanged on Netlify) |
| Session invalidation on cutover | **None expected** for Life — existing cookies remain valid if secrets unchanged |
| Teaching secrets at fold | `TEACHING_HUB_PASSPHRASE_HASH` retired when Teaching API merges onto umbrella; Adam uses existing Life passphrase everywhere |
| Data + API tokens (unchanged) | Keep `GITHUB_REPOSITORY`, `GITHUB_BRANCH`, `GITHUB_TOKEN`, `GITHUB_TOKEN_EXPIRES`, `ANTHROPIC_API_KEY` on the Life Netlify site |

**Implementation notes:**

- Single auth check lives in umbrella `netlify/functions/` but reads the **same** Life env var names above.
- When Teaching (and later hubs) fold in, extend CORS/`SITE_ORIGIN` allow-list to additional app origins (e.g. `https://teaching-hub.adam-russell.com`) — do **not** rotate secrets just to add origins.
- Prefer **one Netlify site** (existing Life API site at `api.adam-russell.com`) absorbing folded section APIs over standing up new Netlify sites with duplicate secrets.

## Deploy inventory (public URLs — from committed config)

Verified in repo source (not Netlify dashboard). **Netlify internal site names** still need Adam confirmation from Netlify UI.

| Hub / API | Netlify site name (dashboard) | Public Functions URL | `SITE_ORIGIN` (app origin) | Source |
|-----------|------------------------------|----------------------|----------------------------|--------|
| Life Hub API | **AWAITING ADAM** | `https://api.adam-russell.com` | `https://life-hub.adam-russell.com` | `js/app/config.js` |
| Teaching Hub API | **AWAITING ADAM** | `https://teaching-api.adam-russell.com` | `https://teaching-hub.adam-russell.com` | `teaching-hub/README.md`, `src/api/config.ts` |

Same-site cookie pattern: app and API are sibling subdomains under `adam-russell.com` (Life: `life-hub` + `api`; Teaching: `teaching-hub` + `teaching-api`). Umbrella retarget must preserve or deliberately redesign this pattern.

Mirror table also lives in [`OVERSEER.md`](./OVERSEER.md).

## Target shape (draft)

```text
hubs/                          # umbrella code repo (name decided above)
  apps/ or sections/
    life/                      # seeded from life-hub
    teaching/                  # folded later (step 5)
    knowledge/
    tasks/
    <next-hub>/                # new work starts here, not as repo #N
  packages/design-kit/         # once — see Design kit migration
  netlify/ or workers/         # shared API edge; single auth check lives here
docs/consolidation/            # this folder (carried into umbrella)
```

Deploy preference: **retarget existing Life Hub Netlify** at the umbrella repo — **keep all existing env vars**; only add origins/bindings as new hub sections fold in. Full execution-readiness stress test still needs Netlify **dashboard site names** filled.

## Invariants (named — checkpoint gates)

| Invariant | Meaning | Gate |
|-----------|---------|------|
| **Public student routes** | Teaching `/s/lessons/:id` stays **unauthenticated** after Teaching fold | Teaching fold only — see per-hub gates below |
| **life-hub-data frozen** | Private markdown repo unchanged; API still scoped read-only to it | Every checkpoint |
| **One Adam session** | Single operator passphrase + `SESSION_SECRET` for the umbrella shell | Decided in **Decisions → Auth**; verified at checkpoint-01 |

## Auth unification (design — implement after **Decisions → Auth** filled)

Today each hub API has its own env:

| Hub | Passphrase hash env | Session secret | Cookie name (today) |
|-----|---------------------|----------------|---------------------|
| Life Hub | `LIFE_HUB_PASSPHRASE_HASH` | `SESSION_SECRET` | confirm in code at unify time |
| Teaching Hub | `TEACHING_HUB_PASSPHRASE_HASH` | `SESSION_SECRET` | `teaching_hub_session` |

Implementation rules (once decision recorded):

1. **Single auth check** — shared Netlify auth handler under umbrella `netlify/functions/`; sections call shared session verify.
2. **Session invalidation** — all existing Life + Teaching cookies invalidated on cutover if secrets change.
3. **Public routes** — student/content routes **bypass** session middleware via explicit allow-list.

## Design kit migration

**Canonical remote:** `github.com/adamrussell91-hash/hub-design-kit` (local: `~/Projects/hub-design-kit`).

**Mechanic:** copy-then-freeze into `packages/design-kit/` at seed; unfolder repos keep local copy until their step-5 fold.

## Non-goals

- Rewriting Life Hub agents from scratch
- Merging `life-hub-data` into the code repo
- Putting repos under `~/Desktop` or `~/Documents` (iCloud)
- Multi-passphrase operator login (one Adam session)
- Gating public student URLs behind Adam's operator session during Teaching fold
- Claude Code writing or moving code at checkpoints

## Migrate order

### 1. Umbrella repo seeded from Life Hub

- Seed from Life Hub; consolidation docs; `packages/design-kit/` copy
- **Blocked until `Decisions → Repo` filled**

### 2. One Cursor env + GitHub permission story

- Code repo + `life-hub-data` only
- **Blocked until `Decisions → Auth` filled**

### 3. Shell / auth / calendar stubs

- Shared shell, unified auth wiring, section routing skeleton
- **Calendar stub:** shell UI + empty source registry only — no live feeds

### 4. Next new hub as a section inside umbrella

- Not a new GitHub repo or Netlify site

### 5. Fold Teaching / Knowledge / Tasks

**Fold trigger (pick one per hub at fold time):** (A) named cross-hub feature, (B) fixed date in status table, or (C) calendar source ready in staging.

**Per-hub fold work + checkpoint gates** (do not apply Teaching-only checks to other hubs):

| Hub | Fold work | Checkpoint gates |
|-----|-----------|------------------|
| **Teaching** | Migrate Blobs/content API into umbrella namespace; keep `/s/lessons/*` public | Public student routes unauthenticated; auth allow-list test; cookie domain still valid under umbrella API hostname |
| **Knowledge** | Migrate or repoint Worker `knowledge-hub-research` + R2 `knowledge-hub-archive` bindings into umbrella CF account scope; document whether Worker stays separate or merges into umbrella edge | CF token blast radius reviewed; R2 bucket access unchanged for existing archive paths; no accidental auth gate on any public research/archive URLs |
| **Tasks** | TBD when Tasks Hub repo is inventoried (likely Blobs or markdown — record at fold time) | Per-hub auth gate only if Tasks has public routes; otherwise operator-session + data-boundary check |

Teaching fold detail: `/s/lessons/*` public; content API namespaced under umbrella.

Knowledge fold detail: R2 `knowledge-hub-archive` and Worker `knowledge-hub-research` currently used by `knowledge-hub` repo (confirm bindings in CF dashboard before fold).

## Status

| Phase | State | Notes |
|-------|--------|-------|
| Plan v2.1 | in progress | Partial critique #2 applied 2026-09-01 |
| Claude critique #1 | done | `checkpoints/checkpoint-00-plan.md` |
| Claude critique #2 (full) | **blocked** | Needs Decisions + Netlify site names in this file |
| Claude critique #2 (partial) | done | `checkpoints/checkpoint-00b-plan-partial.md` |
| Deploy URLs (public) | partial | From committed config; Netlify site names AWAITING ADAM |
| Auth decision | **AWAITING ADAM** | |
| Repo naming decision | **AWAITING ADAM** | |
| Design-kit mechanic | decided | Copy-then-freeze |
| Umbrella seed | not started | |
| Netlify retarget | not started | |

## Open questions (Adam)

- Netlify dashboard site names for Life + Teaching API sites (only remaining blocker for full critique #2)
- Calendar: first event source when wiring (Life vs Teaching vs external)
- Fold trigger (A/B/C) for Teaching — recommend (A) when consolidated calendar is the driver

## Next action

Adam fills Netlify **dashboard site names** in this file → Claude runs **full** critique #2 (execution-readiness stress test).

```text
Life Netlify site name: <from dashboard>
Teaching Netlify site name: <from dashboard>
```
