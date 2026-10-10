# Travel journal Phase 5 — Optional enrichment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optional enhancements that never block Phases 1–4: photo annotations, souvenir collections, Corey’s separate perspective, transcripts, printable editions. Ordinary photo/text/audio access remains for every enhancement.

**Architecture:** Each enrichment is an additive module behind explicit UI entry points. No enrichment may replace the basic reader or require a paid API for core journal access. Prefer pinning Codex candidate libraries only when the named feature is requested.

**Tech Stack:** Annotorious (annotations), pdf-lib (print), optional Wavesurfer (presentation only), transcript text as editable derived fields (no essential cloud STT).

**Spec:** `docs/superpowers/specs/2026-10-10-travel-journal-design.md`  
**Depends on:** Phase 4  
**Product authority:** Codex § Optional enrichment + Binding UI (same contract).  
**Gate:** Do **not** start this plan until Adam names which enrichment items to build.

## Global Constraints

- Keep ordinary photo, text, and audio access for every enhancement.
- Panoramas, immersive exhibitions, film generation are later options — not in this plan’s default tasks.
- Same kit, R4, liveness, privacy, and pre-PR rules as prior phases.
- Pattern/versioning: new assets must not silently redesign old journals (store pattern version).

---

## File Structure (when activated)

| File | Responsibility |
| --- | --- |
| `apps/travel/src/journal/annotations.ts` | Photo region notes; store as derived JSON beside media id |
| `apps/travel/src/journal/souvenirs.ts` | Collection of object moments / attached objects |
| `apps/travel/src/journal/corey-perspective.ts` | Separate author lane; never promoted to Adam truth without explicit confirm |
| `apps/travel/src/journal/transcripts.ts` | Editable derived text linked to audio media id |
| `apps/travel/src/journal/print-edition.ts` | Printable layout / PDF export |
| Matching `tests/unit/journal-*.test.ts` | Per feature |

---

### Task A: Photo annotations (only if Adam asks)

- [ ] **Step 1:** Pin Annotorious (BSD) version + licence notice in export bundle.
- [ ] **Step 2:** Annotations store as `{ media_id, regions[], revision }` — not burned into originals.
- [ ] **Step 3:** Viewer toggle; reduced-motion safe; keyboard accessible controls.
- [ ] **Step 4:** Export includes annotation JSON; basic reader shows text fallback without Annotorious if needed.
- [ ] **Step 5: Commit** `feat(travel): optional journal photo annotations`

---

### Task B: Souvenir collections (only if Adam asks)

- [ ] **Step 1:** Data: souvenir records referencing moment/media ids; lifecycle + liveness.
- [ ] **Step 2:** UI collection surface using kit list patterns — not a new visual language.
- [ ] **Step 3:** Deleting a moment detaches or soft-deletes souvenirs per explicit rule (document in UI copy).
- [ ] **Step 4: Commit** `feat(travel): journal souvenir collections`

---

### Task C: Corey perspective (only if Adam asks)

- [ ] **Step 1:** Parallel author field on moments or sibling moment stream with `author: 'corey' | 'adam'`.
- [ ] **Step 2:** Agent-context integrity: Corey lines are not authoritative user truth; digests must not override Adam corrections (`agent-context-integrity` rules).
- [ ] **Step 3:** Filter toggles in toolbar; export labels authorship.
- [ ] **Step 4: Commit** `feat(travel): Corey journal perspective lane`

---

### Task D: Transcripts (only if Adam asks)

- [ ] **Step 1:** `transcript` as editable derived text on audio media; original audio unchanged.
- [ ] **Step 2:** Manual paste/edit first; optional STT only as non-essential enhancement with explicit consent.
- [ ] **Step 3:** Search indexes transcripts (Phase 4 index hook).
- [ ] **Step 4: Commit** `feat(travel): editable audio transcripts`

---

### Task E: Printable edition (only if Adam asks)

- [ ] **Step 1:** Pin pdf-lib (MIT) or print CSS path — choose one; prefer print CSS if it meets Adam’s bar.
- [ ] **Step 2:** Page breaks by leg/day; photos use derivatives; no remote fonts.
- [ ] **Step 3:** Smoke a 2-leg fixture PDF/print preview at A4.
- [ ] **Step 4: Commit** `feat(travel): journal printable edition`

---

### Explicitly deferred (not scheduled here)

- Panoramas
- Immersive exhibitions
- Film / video generation
- Continuous background location tracking
- Passive full-library photo sync

---

## Spec coverage (Phase 5)

| Codex optional item | Task |
| --- | --- |
| Photo annotations | A |
| Souvenir collections | B |
| Corey perspective | C |
| Transcripts | D |
| Printable editions | E |
| Panoramas / immersive / film | Deferred |

**Phase 5 done when:** each requested enrichment ships with the same Binding UI contract, basic access without the enrichment library still works, and pre-PR check is green.
