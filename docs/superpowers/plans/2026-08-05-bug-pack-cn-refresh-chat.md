# Bug Pack (CN / Refresh / Chat / Accents / Week Chart) Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Fix Central Node empty notes, refresh timestamp UX, chat “On it…” feedback, agent bubble accents, and the protein week chart label/clipping.

**Architecture:** Seed `central-node.md` into the private data repo; teach confirm to create the file from the app seed if missing; small client fixes for sync timestamp, chat placeholder, CSS accent, and chart chrome.

**Tech Stack:** Vanilla JS PWA, Netlify functions, private GitHub data repo, node:test.

**Spec:** `docs/superpowers/specs/2026-08-05-bug-pack-cn-refresh-chat-design.md`

**Deploy:** Local commits only; do not push app or data repos unless Adam asks.

---

## File map

| File | Role |
|------|------|
| `life-hub-data/central-node.md` | Seeded private CN (copy from app) |
| `netlify/functions/_shared/load-central-node-seed.mjs` | Read app `central-node.md` for create-if-missing |
| `netlify.toml` | Include seed file in function bundle |
| `netlify/functions/chat-confirm.mjs` | Create CN if missing, then apply log |
| `js/app/app-controller.js` | Always `recordSuccess` on confirmed refresh |
| `js/app/chat-controller.js` | “On it…” + accent on slug |
| `js/app/main.js` / chat deps | Pass `agentColour` + `agentsConfig` if needed |
| `css/app.css` | Bubble border uses `--agent-accent` |
| `index.html` | Protein this week label; chart SVG attrs |
| `js/app/render-central-node.js` | Chart padding / aspect if needed |
| `js/app/chart-kit/area-line.js` | Extra bottom padding for labels |
| `service-worker.js` | Cache bump |
| Tests under `tests/unit` / `tests/integration` | Cover new behaviour |

---

### Task 1: Seed private data repo

- [ ] Copy `life-hub/central-node.md` → `life-hub-data/central-node.md`
- [ ] Commit in `life-hub-data` only (no push)

### Task 2: Confirm create-if-missing

- [ ] Add `load-central-node-seed.mjs` (mirror `load-chadwick-protocol.mjs`)
- [ ] Add `central-node.md` to `netlify.toml` `included_files`
- [ ] Update `syncCentralNodeAfterLog` to write seed when blob missing, then apply mutation
- [ ] Integration test: tree without CN still PUTs central-node.md after meal confirm
- [ ] Commit app repo

### Task 3: Refresh last-synced

- [ ] Test: confirmed refresh with `changed: false` updates `#last-synced`
- [ ] Fix `performRefresh` to always `recordSuccess()` when `freshness === 'confirmed'`
- [ ] Confirm refreshing state already disables control; wire if not
- [ ] Commit

### Task 4: Chat “On it…” + accents

- [ ] CSS: `.chat-message--assistant[data-agent]` → `var(--agent-accent, var(--wave))`
- [ ] Chat controller: placeholder on send; clear on first real event; set accent when slug arrives (needs `agentColour` + config getter)
- [ ] Unit/browser coverage as practical
- [ ] Commit

### Task 5: Protein week chart

- [ ] Label → “Protein this week”
- [ ] Fix clipping (padding / viewBox / preserveAspectRatio)
- [ ] Commit

### Task 6: Finish

- [ ] Bump SW cache
- [ ] `npm test`
- [ ] Update `docs/IMPLEMENTATION_STATUS.md` briefly
- [ ] Final commit(s); no push
