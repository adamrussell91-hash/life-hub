# Hub consolidation plan

> **Status:** v2 — post Claude critique #1 (2026-09-01).  
> **Non-goal locked:** `life-hub-data` repository shape and access model do not change as part of consolidation (API keeps pointing at it).

## Intent

One operator-facing hub product: one code repo, one Adam session/auth, one design kit, one agent runtime (Hammond et al. can see across domains). Private data stays in `life-hub-data`. Public student URLs stay unauthenticated.

## Target shape (draft)

```text
hubs/                          # umbrella code repo (name decided in step 1)
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

Deploy preference: **retarget existing Life Hub Netlify** at the umbrella repo (keep secrets); do not invent a second production Netlify for Adam-auth APIs unless forced. **Requires** [`OVERSEER.md`](./OVERSEER.md) Netlify inventory filled before checkpoint-02 can pass.

## Invariants (named — checkpoint gates)

| Invariant | Meaning | Gate |
|-----------|---------|------|
| **Public student routes** | Teaching `/s/lessons/:id` (and any other published student URLs) stay **unauthenticated** after Teaching fold | Mandatory check at step 5 + checkpoint before Teaching production cutover |
| **life-hub-data frozen** | Private markdown repo unchanged; API still scoped read-only to it | Every checkpoint |
| **One Adam session** | Single operator passphrase + `SESSION_SECRET` for the umbrella shell; not per-hub logins | Decided in step 2; verified at checkpoint-01 |

## Auth unification (design — decide in step 2 before seed cutover)

Today each hub API has its own env:

| Hub | Passphrase hash env | Session secret | Cookie name (today) |
|-----|---------------------|----------------|---------------------|
| Life Hub | `LIFE_HUB_PASSPHRASE_HASH` | `SESSION_SECRET` | (Life Hub cookie — confirm in code at unify time) |
| Teaching Hub | `TEACHING_HUB_PASSPHRASE_HASH` | `SESSION_SECRET` | `teaching_hub_session` |

**Decision required before umbrella seed completes:**

1. **Which secret wins** — generate **new** umbrella `SESSION_SECRET` + single `HUB_PASSPHRASE_HASH` (recommended), *or* retain Life Hub values and retire Teaching/Life duplicates. Record choice in this file and [`OVERSEER.md`](./OVERSEER.md) inventory.
2. **Where the single auth check lives** — shared Netlify auth handler under umbrella `netlify/functions/`; section-specific APIs call shared session verify, not duplicate auth routes.
3. **Session invalidation** — all existing Life + Teaching cookies invalidated on cutover (new secret ⇒ automatic); document one-time re-login for Adam.
4. **Public routes** — student/content routes must **bypass** session middleware explicitly (allow-list in router), not “fail open by accident.”

Do not start step 1 production retarget until step 2 auth decision is written here.

## Design kit migration

**Canonical remote:** `github.com/adamrussell91-hash/hub-design-kit` (local: `~/Projects/hub-design-kit`).

**Mechanic (decide in step 1):**

| Phase | Approach |
|-------|----------|
| Step 1 — umbrella seed | **Copy-then-freeze** into `packages/design-kit/` from hub-design-kit; stop `sync-to-hubs.sh` for umbrella |
| Steps 1–4 — repos not yet folded | Keep consuming their existing `design-kit/` copy; no forced sync until fold |
| Step 5+ — each fold | Replace section’s copied kit with import from `packages/design-kit/`; delete duplicate CSS drift |

Subtree/submodule deferred unless Adam prefers it — copy-then-freeze is simpler for a single-operator monorepo.

## Non-goals

- Rewriting Life Hub agents from scratch
- Merging `life-hub-data` into the code repo
- Putting repos under `~/Desktop` or `~/Documents` (iCloud)
- Multi-passphrase operator login (one Adam session)
- **Gating public student URLs behind Adam's operator session during Teaching fold**
- Claude Code writing or moving code at checkpoints

## Migrate order

### 1. Umbrella repo seeded from Life Hub

- Seed code from Life Hub; consolidation docs present; `packages/design-kit/` copy from hub-design-kit
- **Decide + record (blocks this step):**
  - Final umbrella repo name (reuse `life-hub` vs new `hubs` repo)
  - Whether `life-hub` GitHub repo is renamed, kept with redirect, or left as-is (affects CI, Netlify hook, clone URLs)

### 2. One Cursor env + GitHub permission story

- Code repo + `life-hub-data` only (fine-grained token unchanged in scope)
- **Decide + record (blocks Netlify retarget):**
  - Single auth secret strategy (see Auth unification above)
  - Env var names for umbrella Netlify (target: one passphrase hash name, one `SESSION_SECRET`)

### 3. Shell / auth / calendar stubs

- Shared shell chrome, unified auth wiring, routing skeleton for sections
- **Calendar stub scope (explicit):**
  - Shell UI placeholder (month/week view component)
  - Empty **source registry** (interface + config list; no live feeds)
  - No calendar source wiring in this step — sources land in step 5+ per hub

### 4. Next new hub as a section inside umbrella

- New product work starts as `apps/<name>/` — not a new GitHub repo or Netlify site

### 5. Fold Teaching / Knowledge / Tasks

- **Fold trigger (falsifiable — pick one per hub at fold time):**
  - (A) A **named feature** needs cross-hub data (e.g. consolidated calendar requires Teaching events), **or**
  - (B) A **fixed date** Adam sets in this plan’s status table, **or**
  - (C) Calendar source registry entry for that hub is implemented and tested in staging
- **Per-fold checkpoint gate:** public student routes still unauthenticated; auth middleware allow-list verified with an automated or scripted test
- **Calendar source wiring:** when a hub folds, register its event source in the calendar registry (step 3 stub → live)

Teaching fold additionally: migrate Blobs/content API into umbrella namespace; keep `/s/lessons/*` public.

## Status

| Phase | State | Notes |
|-------|--------|-------|
| Plan v2 | in progress | Claude critique #1 applied 2026-09-01 |
| Claude critique #1 | done | See `checkpoints/checkpoint-00-plan.md` |
| Inventory (Netlify URLs) | blocked | Adam must fill OVERSEER.md |
| Auth decision | not started | Required before step 1 cutover |
| Repo naming decision | not started | Required before step 1 |
| Design-kit mechanic | decided | Copy-then-freeze (see above) |
| Umbrella seed | not started | |
| Netlify retarget | not started | Blocked on inventory + auth decision |
| First implementation checkpoint | not started | |

## Open questions (Adam)

- Umbrella repo name: reuse `life-hub` or new repo?
- life-hub GitHub repo: rename / redirect / leave?
- Netlify site names + public URLs (Life + Teaching) — fill [`OVERSEER.md`](./OVERSEER.md)
- Calendar: which hub’s events first when wiring sources (Life appointments vs Teaching vs external)?
- Fold trigger choice (A/B/C) for Teaching — recommend (A) when consolidated calendar is the driver

## Next Cursor action slice

1. Adam fills OVERSEER.md inventory (Netlify site names, Functions URLs, `SITE_ORIGIN` — no secret values)
2. Adam records auth-unification choice + repo naming in this file (steps 1–2 blockers)
3. ~~Add public-student-routes invariant~~ — done in v2
4. ~~Calendar stub definition~~ — done in step 3
5. ~~Fold trigger~~ — done in step 5

After blockers cleared, Claude may run critique #2 on migrate order stress-test.
