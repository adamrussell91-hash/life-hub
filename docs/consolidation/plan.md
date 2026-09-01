# Hub consolidation plan

> **Status:** stub — Cursor fills this before the first Claude critique.  
> **Non-goal locked:** `life-hub-data` repository shape and access model do not change as part of consolidation (API keeps pointing at it).

## Intent

One operator-facing hub product: one code repo, one Adam session/auth, one design kit, one agent runtime (Hammond et al. can see across domains). Private data stays in `life-hub-data`. Public student URLs stay unauthenticated.

## Target shape (draft — refine in critique)

```text
hubs/                          # umbrella code repo (name TBD)
  apps/ or sections/
    life/                      # seeded from life-hub
    teaching/                  # folded later
    knowledge/
    tasks/
    <next-hub>/                # new work starts here, not as repo #N
  packages/design-kit/         # once
  netlify/ or workers/         # shared API edge
docs/consolidation/            # this folder (carried into umbrella)
```

Deploy preference: **retarget existing Life Hub Netlify** at the umbrella repo (keep secrets); do not invent a second production Netlify for Adam-auth APIs unless forced.

## Non-goals

- Rewriting Life Hub agents from scratch
- Merging `life-hub-data` into the code repo
- Putting repos under `~/Desktop` or `~/Documents` (iCloud)
- Multi-passphrase operator login (one Adam session)
- Claude Code writing or moving code at checkpoints

## Migrate order (draft)

1. Umbrella repo seeded from Life Hub; design kit single copy; consolidation docs present
2. One Cursor env + GitHub permission story: code repo + `life-hub-data` only
3. Shell/auth/calendar stubs that can grow cross-domain
4. Next new hub as a section inside umbrella
5. Fold Teaching / Knowledge / Tasks when calendar or shared chrome requires them

## Status

| Phase | State | Notes |
|-------|--------|-------|
| Plan stub | in progress | Awaiting Cursor architecture pass |
| Claude critique #1 | not started | |
| Umbrella seed | not started | |
| Netlify retarget | not started | |
| First checkpoint | not started | |

## Open questions

- Final umbrella repo name
- Whether Life Hub GitHub repo is renamed/replaced or left as redirect
- Calendar event sources per hub (fill after inventory)
- FILL_IN rows in [`OVERSEER.md`](./OVERSEER.md) inventory
