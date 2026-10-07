# Life City Extra 3D Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add licence-safe, visually compatible low-poly 3D assets for Life City and open the required draft PR without changing city code.

**Architecture:** Treat each source model as independently accepted or rejected through a recorded evidence trail. Accepted binaries, licence evidence, metadata, credits, comparison screenshots, and PR reporting remain linked by the asset’s item directory and `assets.json` entry.

**Tech Stack:** GitHub repository tooling; GLB/glTF; GLB viewer; Node/npm pre-PR check.

**Spec:** `docs/superpowers/specs/2026-10-08-life-city-assets-design.md`

## Global Constraints

- The public repository may contain CC0/public-domain assets, or CC-BY assets only with creator, licence, source URL, modification note, saved evidence, and a `CREDITS.md` line.
- Do not commit Quaternius QAL, personal-use, standard, unclear, game-ripped, or unverified AI-generated assets.
- Prefer GLB/glTF, unmodified low-poly models, and files below 1 MB; record approximate native dimensions.
- Do not write Three.js, renderer, city, gameplay, or scaling code; do not buy Asset Forge.
- Models belong at `assets/city-extra/<item>/`; Cube Pets belongs at `assets/kenney/kenney_cube-pets/`.
- Every accepted file has an `assets/city-extra/assets.json` record with the exact spec fields.
- Each accepted model is visually checked alongside the Kenney ambulance and modern tram; attach one comparison screenshot per item to the draft PR.
- `npm run pre-pr-check` must exit 0 before opening the draft PR into `main`.
- Draft PR title: `Life City: extra 3D assets`.

## Review Focus

- Licences: a similarly named file from a restricted source must be rejected even when its geometry is a perfect match.
- Evidence: page-only licences must be saved verbatim enough to remain auditable after the source page changes.
- Duplicates: existing Pirate Kit, Nature Kit, and Watercraft Pack coverage must be reported before any harbour/river asset is added.
- Metadata: every committed binary, including Cube Pets GLBs, must map to one complete metadata record with native—not guessed scene—dimensions.
- Visual compatibility: a legal model that clashes with the flat-colour Kenney references must be reported as a clash and omitted unless explicitly approved.

---

## File Structure

- Create: `assets/city-extra/<item>/<model>.glb` — accepted non-Kenney source models, grouped by requested item.
- Create: `assets/city-extra/<item>/LICENSE*` or `LICENCE-EVIDENCE.md` — reproducible licence evidence colocated with its asset.
- Create: `assets/city-extra/assets.json` — authoritative model manifest.
- Create: `assets/city-extra/CREDITS.md` — one line per accepted CC-BY asset.
- Create: `assets/kenney/kenney_cube-pets/` — unmodified Kenney pack and licence file.
- Create: `docs/life-city-assets/screenshots/<item>.png` — accepted-model comparison screenshots.
- Modify: draft PR description — complete report table and research findings.

### Task 1: Baseline and source ledger

**Files:**
- Create: `work/life-city-assets/source-ledger.md` (temporary, never committed)
- Create: `assets/city-extra/research-report.md` (committed source/rejection audit)

**Interfaces:**
- Consumes: requested shopping list and existing Kenney asset directories.
- Produces: one record per shopping-list item: searched sources, candidate URL, creator, explicit licence, download availability, native format, and initial style verdict.

- [ ] **Step 1: Inspect existing harbour and river coverage**

Record the relevant Pirate Kit, Nature Kit, and Watercraft Pack models in the ledger; mark whether each requested harbour/river use is already covered.

- [ ] **Step 2: Research candidates in required source order**

For bus, school bus, crane, food truck, ferry, transit stops, Cube Pets, balloon, whale, landmark, and remaining water-edge gaps, search Kenney, Poly Pizza, Quaternius, then OpenGameArt. Capture the source URL, creator, exact licence wording, and a candidate or “not found” result.

- [ ] **Step 3: Apply the acceptance gate**

Label each candidate `accept`, `reject`, or `style clash`. Reject nonredistributable or unclear licences; retain rejected candidates for the PR report.

- [ ] **Step 4: Review the source ledger**

Verify that every shopping-list item has a result and that all accepted candidates have explicit CC0/public-domain or CC-BY evidence.

- [ ] **Step 5: Commit the research audit**

Commit only `assets/city-extra/research-report.md` if it is useful independently; otherwise include it with Task 3’s documentation commit.

### Task 2: Acquire and validate accepted models

**Files:**
- Create: `assets/city-extra/<item>/<model>.glb`
- Create: `assets/city-extra/<item>/LICENSE*` or `LICENCE-EVIDENCE.md`
- Create: `assets/kenney/kenney_cube-pets/`
- Create: `docs/life-city-assets/screenshots/<item>.png`

**Interfaces:**
- Consumes: Task 1’s accepted candidates and licence evidence.
- Produces: licence-safe model files with their original licence material, exact byte size, native dimensions, and style screenshots.

- [ ] **Step 1: Download only accepted source files**

Save each binary in its specified destination without editing or rescaling it. Preserve the source licence file; where the licence appears only on a page, create `LICENCE-EVIDENCE.md` containing the source URL, retrieval date, creator, licence, and copied licence wording.

- [ ] **Step 2: Validate model format and dimensions**

Confirm every accepted model is GLB/glTF or cleanly convert an OBJ/FBX to GLB without geometric alteration. Record exact file size and approximate native length, width, and height.

- [ ] **Step 3: Inspect visual compatibility**

Open each accepted GLB next to `assets/kenney/kenney_car-kit/Models/GLB format/ambulance.glb` and `assets/kenney/kenney_train-kit/Models/GLB format/train-tram-modern.glb`. Save one screenshot per accepted item and assign `good`, `OK`, or `clashes`.

- [ ] **Step 4: Recheck Cube Pets placement**

Confirm the pack is unmodified, includes Kenney’s licence file, and is located exclusively under `assets/kenney/kenney_cube-pets/`.

- [ ] **Step 5: Commit the acquired assets and evidence**

Commit binaries, evidence, screenshots, and Cube Pets as one reviewable asset batch.

### Task 3: Manifest, credits, and PR report

**Files:**
- Create: `assets/city-extra/assets.json`
- Create: `assets/city-extra/CREDITS.md`
- Modify: `assets/city-extra/research-report.md`

**Interfaces:**
- Consumes: Task 1 ledger and Task 2 accepted assets.
- Produces: machine-readable manifest and complete human-readable attribution/rejection report.

- [ ] **Step 1: Create the manifest**

Add one object per accepted binary with `file`, `item`, `source_url`, `creator`, `licence`, `date_fetched`, `modifications`, and `size_m`. Set `modifications` to `none` for unaltered files; describe conversion precisely if any source required clean conversion.

- [ ] **Step 2: Create CC-BY credits**

Add exactly one line per accepted CC-BY model with creator, CC-BY version, source URL, and modifications. Leave no credit entry for CC0 assets.

- [ ] **Step 3: Write the research report**

For each shopping-list item, state found/not found, committed file (if any), source URL, licence, size, visual verdict, and note. Include all rejected candidates with their rejection reason, existing harbour coverage, and Asset Forge’s current Standard/Deluxe price, vehicle suitability, and GLB export finding.

- [ ] **Step 4: Check manifest completeness**

Enumerate every committed GLB in `assets/city-extra/` and `assets/kenney/kenney_cube-pets/`; verify each is either manifested or intentionally excluded because it is a pack-support file documented in the report.

- [ ] **Step 5: Commit manifest and report**

Commit `assets.json`, `CREDITS.md`, and the research report.

### Task 4: Repository verification and draft PR

**Files:**
- Modify: draft PR description

**Interfaces:**
- Consumes: Tasks 1–3 and the branch `codex/life-city-assets`.
- Produces: passing repository validation and a draft PR into `main`.

- [ ] **Step 1: Run the mandatory pre-PR check**

Run: `npm run pre-pr-check` from repository root.  
Expected: exit status 0.

- [ ] **Step 2: Resolve validation failures**

If the pre-PR check fails, make only corrections required for this asset branch, rerun the full command, and require exit status 0. Do not open the PR while it fails.

- [ ] **Step 3: Prepare the PR body**

Include the complete one-row-per-item report, rejected candidate list, Asset Forge findings, and one attachment/link for each accepted-model comparison screenshot.

- [ ] **Step 4: Open the draft PR**

Open a draft PR from `codex/life-city-assets` to `main` titled `Life City: extra 3D assets`.

- [ ] **Step 5: Verify the remote result**

Confirm the PR is draft, targets `main`, shows the intended branch, and contains only asset documentation, binaries, evidence, screenshots, and no city code.
