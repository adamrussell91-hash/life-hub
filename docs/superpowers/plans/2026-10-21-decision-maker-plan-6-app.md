# Decision Maker Plan 6: The App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks 1–5 run in order; each leaves its tests green.

**Goal:** Decision Maker gets its pages in the Tasks hub, at `#/decision-maker`, in the approved circle-and-arrow design. After this plan:
- **Nav:** a "Decision Maker" entry under Tools, with its own icon (two discs and an arrow), routed to `views/decision-book/view.ts`.
- **Landing page:**
  - the hero: a lede, the **New decision** box and the **Quick decision** card, which says it is coming until Plan 7 builds the route;
  - the cover-shape board, in Problem Solver's place;
  - **Decisions**, one card per decision, with the **medal**: the cover built as the session moves, with the main model at its centre;
  - **How a session builds**;
  - **the four sections**, each opening its shelf of model emblems with their "use it when" lines. **Start from this** opens a decision on that model once it is framed;
  - the **shared skills ribbon**.
- **Session page:**
  - the **track**: round stations for Frame, Explore, Decide and Review, joined by a dotted line;
  - the **compass** above the canvas;
  - the **canvas**: `createChartForRun`, with the decision record's basis, live task statuses and a strip for looking back at earlier models;
  - Problem Solver's coach panel, skill tray, review panel and task cards.
- **Reuse, not copies.** Problem Solver's client takes what differs as options:
  - `createSessionApi(base)`;
  - the coach panel's `look` (avatar, emblems, frame prompts, noun);
  - the task bridge's `origin` (name, source, tag, noun);
  - the case-file bridge's `blocks` and `graphic`;
  - the task cards' `paper` (offer, noun, strict names) and its `graphic` kind;
  - the review banner's noun;
  - a link-chip builder with a Decision Maker chip.
- **The decision record on a page:**
  - an image block (the main model's emblem, with its section's emblem as a badge) goes above the heading;
  - after the heading, one rich-text block per section, then the caption and a link back;
  - if the image will not write, the text still does, `link_case_file` gets `graphic: false`, and the card offers **Retry the graphic**, which puts the image above the heading;
  - the images are static files in the Tasks build, made by a generator script, with a drift test.
- **The shared skills ribbon** on both landing pages. Each bar is split between this tool's share, in its colour, and the other tool's, in grey, with a legend.
- **Server:**
  - `startModel` on a decision's create (the shelf);
  - `main` on a decision's list row (the medal's centre);
  - Not now on a graphic retry is remembered;
  - Tasks knows the `decision_maker` task source;
  - the mock API serves `/api/decision-book` on the scripted coach.

**Not in this plan (Plan 7):** the Quick decision route, the source check, the live coach evaluation, the Playwright walks, `pre-pr-check` and the PR.

**Spec:** `docs/superpowers/specs/2026-10-21-decision-book-design.md` ("Experience: Landing", "Design language", "Architecture: Client, Tasks hub writes", "Errors").
**Plans 1–5:** done (Plan 5 HEAD `998e0f148`).
**Branch and worktree:** `claude/decision-book` in `/Users/example/Projects/life-hub-decision-book`. Run every command from that worktree's root unless a step says otherwise. Run `npm ci` at the root and in `apps/tasks` first if `node_modules` is missing.

**How this plan was made:** every file below was drafted in the worktree and its tests run green:
- **Unit suite:** 5,710 tests (5,699 pass, 11 skipped), including 7 new ones.
- **Tasks vitest:** all 250 files and 2,631 tests, including 16 new ones in `decision-book-app.test.ts`. The Problem Solver and Decision Book subset is 56 files and 1,104 tests.
- **Type-check:** the Tasks tsc showed no errors in these paths.
- **Browser:** the pages were checked in the `tasks-dev` launch configuration at desktop and 390px:
  - the landing page, the shelves and the ribbon on both tools;
  - a whole decision: framed, the Eisenhower matrix, Decide with the record and its basis line, then the task, review and record cards clicked;
  - the record written to a new project page, with the provenance image, and the Decision Maker chip on that page;
  - Move on to the waiting review, and Review now opening the feedback analysis with the task snapshot.

The browser check found two bugs, both fixed here:
- Tasks refused the `decision_maker` task source, which crashed the mock API.
- The record card kept showing "Write" after the graphic failed, because the offer's key does not change.

The drafts were then removed, after a check that this plan rebuilds every file byte for byte from a clean tree. New files are given in full. Changed files are given as patches: apply them with `git apply`, then check with `git diff`. The 52 provenance images are made by running the generator (Task 3); they are not printed here.

**Rules kept:**
- **Public repo:** no book sentences. Every line of copy (section lines, compass lines, step text) is our own.
- **Problem Solver is unchanged for its own users:**
  - every option defaults to Problem Solver's behaviour;
  - its tests pass unchanged;
  - its prompts never list `dm_` tools.
- **Flat design:** a hairline border instead of a shadow, round buttons, paper, ink, red and green. No yellow or blue: Decision Maker's pages remap Problem Solver's tokens.

**Design notes:**
- **One structure, two looks.** The session page wires the same parts in the same order as Problem Solver's `renderSession`; only the canvas, compass, track and options differ. A shared page factory was considered and left out: the two canvases differ too much, and the orchestration is short.
- **The provenance image is a static file, not a data URL.** An image block shows only http(s) sources (`isHttpUrl`), and a page keeps the address it was written with. So the image cannot be a hashed asset, which would change with each build. The URL is absolute, built from the page's origin and the build's base path.
- **The graphic goes above the text but never blocks it.** The bridge first tries one write with the image and the text together. If that fails (other than for a missing page), it writes the text alone and links with `graphic: false`. Block ids are fixed, so the retry inserts the image (`-0`) just before the heading (`-1`).

---
### Task 1: Server: the shelf, the medal's model, the graphic's Not now, the task source

**Files:**
- Modify: `netlify/functions/_shared/problem-solver/session.mjs`, `netlify/functions/_shared/problem-solver/service.mjs`, `netlify/functions/_shared/problem-solver/decision-prompts.mjs`, `packages/decision-book/record.mjs`, `packages/problem-solver/types.ts`, `netlify/functions/_shared/task-properties.mjs`, `apps/tasks/src/domain/task-properties-defaults.ts`

- [ ] **Step 1: Apply the patch**

- **`createSession`:** takes `startModel` for a decision, but only a model Explore offers. Once the decision is framed, the opening suggestion is that model, ahead of any the coach made. While framing, the prompt gets a SHELF PICK line. The service passes `startModel` through.
- **`summaryRow`:** adds `main` (`mainModel`) for a decision.
- **`recordOffer`:** a `graphic` offer respects Not now (`caseFileDeclined`).
- **Task sources:** both the server and client lists gain `decision_maker`. Tasks validates a task's source, and the browser check found that an unknown one crashed the mock API.

````diff
diff --git a/apps/tasks/src/domain/task-properties-defaults.ts b/apps/tasks/src/domain/task-properties-defaults.ts
index 4c354abed..06d009f4b 100644
--- a/apps/tasks/src/domain/task-properties-defaults.ts
+++ b/apps/tasks/src/domain/task-properties-defaults.ts
@@ -45,7 +45,8 @@ export const DEFAULT_TASK_PROPERTY_CONFIG: TaskPropertyConfig = {
     { id: 'manual', label: 'manual' },
     { id: 'auto_generated_from_excursion', label: 'auto generated from excursion' },
     { id: 'suggested_by_agent', label: 'suggested by agent' },
-    { id: 'problem_solver', label: 'problem solver' }
+    { id: 'problem_solver', label: 'problem solver' },
+    { id: 'decision_maker', label: 'decision maker' }
   ],
   tags: []
 };
diff --git a/netlify/functions/_shared/problem-solver/decision-prompts.mjs b/netlify/functions/_shared/problem-solver/decision-prompts.mjs
index 0be89e43a..276ec3bd8 100644
--- a/netlify/functions/_shared/problem-solver/decision-prompts.mjs
+++ b/netlify/functions/_shared/problem-solver/decision-prompts.mjs
@@ -180,6 +180,7 @@ export function buildDecisionPrompt(session) {
   const missing = frameKeysOf(session).filter((key) => !session.frame[key]);
   parts.push(`Frame: ${JSON.stringify(session.frame)}${missing.length ? `\nMissing frame answers: ${missing.join(', ')}` : ''}`);
   if (session.frame.compass) parts.push(`COMPASS: ${compassLabels(session.frame.compass)}`);
+  if (session.phase === 'frame' && session.startModel) parts.push(`SHELF PICK: the person started from ${TOOLS[session.startModel].name} (${session.startModel}). When framing ends it opens on that model: suggest it with next_tool and say in one sentence how it fits the frame.`);
   const earlier = earlierSteps(session);
   if (earlier) parts.push(earlier.replace(/^EARLIER STEPS:/, 'EARLIER:'));
   if (session.model) parts.push(...reviewLines(session));
diff --git a/netlify/functions/_shared/problem-solver/service.mjs b/netlify/functions/_shared/problem-solver/service.mjs
index 5a5e814e8..7ba176b27 100644
--- a/netlify/functions/_shared/problem-solver/service.mjs
+++ b/netlify/functions/_shared/problem-solver/service.mjs
@@ -107,7 +107,7 @@ export function createProblemSolverService({ store, coach, kinds = ['full', 'lig
       const kind = body.kind ?? kinds[0];
       if (!kinds.includes(kind)) throw httpError(400, 'validation_error', `This tool does not start ${kind} sessions.`);
       const make = kind === 'lightning' ? createLightningSession : (input, d) => createSession({ ...input, kind }, d);
-      const session = make({ title: body.title, text: body.text, links: Array.isArray(body.links) ? body.links : [] }, deps);
+      const session = make({ title: body.title, text: body.text, links: Array.isArray(body.links) ? body.links : [], startModel: body.startModel ?? null }, deps);
       session.requestIds = body.requestId ? [String(body.requestId)] : [];
       if (!ID_RE.test(String(body.requestId ?? ''))) return save(owner, session, null);
       session.id = String(body.requestId);
diff --git a/netlify/functions/_shared/problem-solver/session.mjs b/netlify/functions/_shared/problem-solver/session.mjs
index 69daf86bc..6a8930db1 100644
--- a/netlify/functions/_shared/problem-solver/session.mjs
+++ b/netlify/functions/_shared/problem-solver/session.mjs
@@ -1,13 +1,13 @@
 // netlify/functions/_shared/problem-solver/session.mjs
 import { acceptProblem, addEdge, applyScores, canEdge, canPlace, canPropose, isComplete as isRunComplete, newRun, placeNode, toolDef } from '../../../../packages/problem-solver/machine.mjs';
-import { defaultToolFor, firstStep, nextPhase, planStepForBook, stepName, stepServes } from '../../../../packages/problem-solver/steps.mjs';
+import { defaultToolFor, firstStep, nextPhase, planStepForBook, stepName, stepServes, toolsForPlanStep } from '../../../../packages/problem-solver/steps.mjs';
 import { parseSlot } from '../../../../packages/problem-solver/slots.mjs';
 import { isDate } from './coach-schema.mjs';
 import { cleanOverdue, reviewLive, reviewStart, SNAPSHOT_STATUSES, waitingForReview } from '../../../../packages/problem-solver/review.mjs';
 import { parseCompass } from '../../../../packages/decision-book/compass.mjs';
 import { DECISION_MODEL } from '../../../../packages/decision-book/model.mjs';
 import { RECORD_ID } from '../../../../packages/decision-book/record-slots.mjs';
-import { resolveBasis } from '../../../../packages/decision-book/record.mjs';
+import { mainModel, resolveBasis } from '../../../../packages/decision-book/record.mjs';
 
 export { waitingForReview };
 
@@ -117,7 +117,10 @@ function replaceRun(session, run) {
   return { ...session, steps };
 }
 
-export function createSession({ title = '', text, links = [], kind = 'full' }, deps) {
+/** A model a decision starts from (picked on the shelf), when it is one Explore offers. */
+const shelfModel = (kind, model) => (kind === 'decision' && typeof model === 'string' && toolsForPlanStep(DECISION_MODEL.id, 'explore').includes(model) ? model : null);
+
+export function createSession({ title = '', text, links = [], kind = 'full', startModel = null }, deps) {
   if (!KIND_FRAMES[kind]) throw fail(400, 'validation_error', `Unknown session kind: ${kind}`);
   const at = deps.now();
   const clean = String(text ?? '').trim();
@@ -151,6 +154,7 @@ export function createSession({ title = '', text, links = [], kind = 'full' }, d
     lightning: null,
     escalatedFrom: null,
     frameSeeds: null,
+    ...(shelfModel(kind, startModel) ? { startModel } : {}),
     requestIds: [],
     runner: { status: 'queued', mode: 'turn', error: null },
     createdAt: at,
@@ -300,7 +304,9 @@ export function applyCoachTurn(session, turn, deps) {
   // Leaving a step untouched asks no learning question, so the next step's opening tool comes at once.
   const untouched = mode === 'boundary' && skippedUntouched(next.steps?.[session.runner?.leaving]);
   const quiet = next.phase === 'finished' || (mode === 'boundary' && !untouched) || waitingForReview(next);
-  const suggestion = quiet ? null : (turn.suggestion ?? followOn(next) ?? (next.pendingLearning ? null : openingSuggestion(next)));
+  // A decision started from a model on the shelf opens on that model once it is framed.
+  const shelf = session.phase === 'frame' && next.phase !== 'frame' && next.startModel ? { kind: 'next_tool', tool: next.startModel, reason: 'You started from this model on the shelf.' } : null;
+  const suggestion = quiet ? null : (shelf ?? turn.suggestion ?? followOn(next) ?? (next.pendingLearning ? null : openingSuggestion(next)));
   return touch({ ...next, turns: [...next.turns, coachTurn], suggestion, summary: turn.summary ?? next.summary }, deps);
 }
 
@@ -628,6 +634,8 @@ export function summaryRow(session) {
     reviewTaskId: session.reviewTaskId ?? null,
     reviewDue: session.reviewState?.status === 'waiting' ? session.reviewState.due : null,
     escalatedTo: session.lightning?.escalatedTo ?? null,
+    // A decision's medal shows the model its reasons lean on most.
+    ...(session.kind === 'decision' ? { main: mainModel(session) } : {}),
     createdAt: session.createdAt,
     updatedAt: session.updatedAt
   };
diff --git a/netlify/functions/_shared/task-properties.mjs b/netlify/functions/_shared/task-properties.mjs
index 65186d972..fd63847eb 100644
--- a/netlify/functions/_shared/task-properties.mjs
+++ b/netlify/functions/_shared/task-properties.mjs
@@ -49,7 +49,8 @@ export const DEFAULT_TASK_PROPERTY_CONFIG = {
     { id: 'manual', label: 'manual' },
     { id: 'auto_generated_from_excursion', label: 'auto generated from excursion' },
     { id: 'suggested_by_agent', label: 'suggested by agent' },
-    { id: 'problem_solver', label: 'problem solver' }
+    { id: 'problem_solver', label: 'problem solver' },
+    { id: 'decision_maker', label: 'decision maker' }
   ],
   tags: []
 };
diff --git a/packages/decision-book/record.mjs b/packages/decision-book/record.mjs
index 43670481d..2e9839fc6 100644
--- a/packages/decision-book/record.mjs
+++ b/packages/decision-book/record.mjs
@@ -179,6 +179,6 @@ export function recordOffer(session) {
   if (!written) return session.caseFileDeclined === key ? null : { kind: 'write', version: file.version, file, digests, key, changed: file.sections.map((s) => s.key), provenance };
   const changed = file.sections.filter((s) => written.sections[s.key] !== digests[s.key]).map((s) => s.key);
   if (changed.some((k) => !QUIET.has(k)) && session.caseFileDeclined !== key) return { kind: 'update', version: written.version + 1, file, digests, key, changed, provenance };
-  if (written.graphic === false) return { kind: 'graphic', version: written.version, file, digests, key, changed: [], provenance };
+  if (written.graphic === false && session.caseFileDeclined !== key) return { kind: 'graphic', version: written.version, file, digests, key, changed: [], provenance };
   return null;
 }
diff --git a/packages/problem-solver/types.ts b/packages/problem-solver/types.ts
index b7398e46a..cac49f3f3 100644
--- a/packages/problem-solver/types.ts
+++ b/packages/problem-solver/types.ts
@@ -64,6 +64,8 @@ export type PsSession = {
   /** The step whose opening tool suggestion was dismissed with Not now; it stays away there. */
   dismissedOpening?: string | null;
   pendingKeep: { slot: string; text: string; objection: string; basis?: PsBasisRef[] } | null;
+  /** Decision Maker: a model picked on the shelf, opened once the decision is framed. */
+  startModel?: string;
   /** Decision Maker: per decision-record reason node, the Explore nodes it rests on. */
   basis?: Record<string, PsBasisRef[]>;
   runner: { status: 'idle' | 'queued' | 'running' | 'failed'; mode: 'turn' | 'boundary'; error: string | null; leaving?: string };
@@ -84,7 +86,7 @@ export type PsSession = {
   updatedAt: string;
 };
 
-export type PsSummary = Pick<PsSession, 'id' | 'title' | 'status' | 'phase' | 'links' | 'createdAt' | 'updatedAt'> & { kind?: 'full' | 'lightning' | 'decision'; escalatedTo?: string | null; model: PsModelId | null; tool: PsToolId | null; frame?: number; skills?: Record<string, number>; taskIds?: string[]; reviewTaskId?: string | null; reviewDue?: string | null };
+export type PsSummary = Pick<PsSession, 'id' | 'title' | 'status' | 'phase' | 'links' | 'createdAt' | 'updatedAt'> & { kind?: 'full' | 'lightning' | 'decision'; escalatedTo?: string | null; model: PsModelId | null; tool: PsToolId | null; frame?: number; skills?: Record<string, number>; taskIds?: string[]; reviewTaskId?: string | null; reviewDue?: string | null; main?: string | null };
 
 export type PsAction = 'say' | 'keep_anyway' | 'accept_suggestion' | 'dismiss_suggestion' | 'move_on' | 'rename' | 'archive' | 'score' | 'rescore_radar' | 'retry' | 'confirm_task' | 'dismiss_task' | 'set_review_task' | 'dismiss_review' | 'start_review' | 'task_status' | 'link_case_file' | 'dismiss_case_file' | 'lightning_answer' | 'lightning_again' | 'escalate';
 
````

- [ ] **Step 2: Run the unit suite**

Run: `npm run test:unit`
Expected: PASS (5,703 when drafted: 5,692 pass, 11 skipped). The new behaviour is tested in Task 5.

- [ ] **Step 3: Commit**

```bash
git add netlify/functions/_shared/problem-solver/session.mjs netlify/functions/_shared/problem-solver/service.mjs netlify/functions/_shared/problem-solver/decision-prompts.mjs packages/decision-book/record.mjs packages/problem-solver/types.ts netlify/functions/_shared/task-properties.mjs apps/tasks/src/domain/task-properties-defaults.ts
git commit -m "Decision Maker: start from a shelf model; the medal model on list rows; a decision_maker task source

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Problem Solver's client takes a tool's options

**Files:**
- Create: `apps/tasks/src/views/problem-solver/skills-ribbon.ts`
- Modify: `apps/tasks/src/views/problem-solver/api.ts`, `coach-panel.ts`, `task-bridge.ts`, `case-file-bridge.ts`, `task-cards.ts`, `link-chips.ts`, `link-chips.css`, `review-panel.ts`, `problem-solver-view.css`, `view.ts`, and `apps/tasks/src/views/page-editor.ts`

- [ ] **Step 1: Create the shared skills ribbon**

**Create `apps/tasks/src/views/problem-solver/skills-ribbon.ts`:**

````ts
// apps/tasks/src/views/problem-solver/skills-ribbon.ts
// The thinking skills ribbon both landing pages share: one tally of the twelve skills across
// Problem Solver and Decision Maker, each bar split between this tool (in its own colour) and
// the other (grey), with a legend naming the two.
import { el } from '@/views/hub-kit';
import { skillGlyph } from '../../../../../packages/problem-solver/glyphs';
import { SKILLS } from '../../../../../packages/problem-solver/skills.mjs';
import type { PsSummary } from '../../../../../packages/problem-solver/types';

export type RibbonSide = { name: string; sessions: PsSummary[] };

/** Skill id → times seen, summed over the sessions' turns. */
export function skillTotals(sessions: PsSummary[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const row of sessions) for (const [id, n] of Object.entries(row.skills ?? {})) totals[id] = (totals[id] ?? 0) + n;
  return totals;
}

/**
 * The ribbon and its legend. `here` is the page's own tool; `colour(i)` is the colour of its
 * share of skill `i`'s bar. `other` is the other tool, drawn grey.
 */
export function skillsRibbon(here: RibbonSide, other: RibbonSide, colour: (i: number) => string): HTMLElement {
  const own = skillTotals(here.sessions);
  const theirs = skillTotals(other.sessions);
  const max = Math.max(1, ...SKILLS.map((skill) => (own[skill.id] ?? 0) + (theirs[skill.id] ?? 0)));
  const wrap = el('div', 'ps-ribbon');
  const legend = el('p', 'ps-ribbon__legend');
  const key = (name: string, c: string) => {
    const item = el('span', 'ps-ribbon__key', name);
    item.style.setProperty('--c', c);
    return item;
  };
  legend.append(key(here.name, colour(0)), key(other.name, 'var(--ps-other, #a9aa9f)'));
  const grid = el('ul', 'ps-skills');
  SKILLS.forEach((skill, i) => {
    const mine = own[skill.id] ?? 0;
    const elsewhere = theirs[skill.id] ?? 0;
    const n = mine + elsewhere;
    const item = el('li', `ps-skills__item${n ? '' : ' is-unused'}`);
    item.title = `${skill.description} ${here.name}: ${mine}. ${other.name}: ${elsewhere}.`;
    const text = el('span', 'ps-skills__text');
    const bar = el('span', 'ps-skills__bar ps-skills__bar--split');
    const ownBar = el('i', 'ps-skills__own');
    ownBar.style.setProperty('--w', `${(mine / max) * 100}%`);
    ownBar.style.setProperty('--c', colour(i));
    const otherBar = el('i', 'ps-skills__other');
    otherBar.style.setProperty('--w', `${(elsewhere / max) * 100}%`);
    bar.append(ownBar, otherBar);
    text.append(el('span', 'ps-skills__name', skill.name), el('span', 'ps-skills__count', n ? `${n}×` : 'Not yet'), bar);
    item.append(skillGlyph(skill.id), text);
    grid.append(item);
  });
  wrap.append(legend, grid);
  return wrap;
}
````

- [ ] **Step 2: Apply the patch**

- **`api.ts`:** `createSessionApi(base)`, with `problemSolverApi` and `decisionBookApi` built from it. `create` takes `kind: 'decision'` and `startModel`.
- **`coach-panel.ts`:** a `look` option (`CoachLook`). Problem Solver's is the default.
- **`task-bridge.ts`:** an `origin` option (`TaskOrigin`, default `PS_ORIGIN`) for the description, source, tags and the "not linked to this …" message.
- **`case-file-bridge.ts`:**
  - `blocks` and `graphic` options;
  - a `graphic` offer retries only the image, above the heading;
  - `append` can insert before a block.
- **`task-cards.ts`:**
  - a `paper` option (`PaperCard`) for the offer, the noun and strict names;
  - the `graphic` kind's card;
  - the card is replaced when its offer's kind changes.
- **`link-chips.ts`:** one `sessionChips` builder, with `problemSolverChips` and `decisionMakerChips`. Its CSS adds the Decision Maker dots, and `page-editor.ts` shows both chips.
- **`review-panel.ts`:** `reviewBanner` takes a noun.
- **`view.ts` (Problem Solver):**
  - uses the shared ribbon, fetching Decision Maker's list for its share and leaving that share out if the fetch fails;
  - exports `section` and `createSkillTray`;
  - `caseFilePlaces` takes the new project's title.

````diff
diff --git a/apps/tasks/src/views/page-editor.ts b/apps/tasks/src/views/page-editor.ts
index 6836e1e5c..c035657cc 100644
--- a/apps/tasks/src/views/page-editor.ts
+++ b/apps/tasks/src/views/page-editor.ts
@@ -32,7 +32,7 @@ import {
 import { durationMinutesBetween, endTimeFromStart } from '@/domain/time-grid';
 import { projectNextActionHealth } from '@/views/projects';
 import { mountTagAnythingSection } from '@/views/entity-tagger';
-import { problemSolverChips } from '@/views/problem-solver/link-chips';
+import { decisionMakerChips, problemSolverChips } from '@/views/problem-solver/link-chips';
 
 function el<K extends keyof HTMLElementTagNameMap>(
   tag: K,
@@ -202,7 +202,7 @@ function paintTaskPage(
   const card = el('article', 'hub-card page-card');
   const head = el('header', 'task-card__head');
   head.append(backLink('#/board', '← Dashboard'));
-  head.append(problemSolverChips({ kind: 'task', id: task.id }));
+  head.append(problemSolverChips({ kind: 'task', id: task.id }), decisionMakerChips({ kind: 'task', id: task.id }));
 
   const fields = el('div', 'page-card__fields hub-toolbar');
   const status = pageFilter(
@@ -426,7 +426,7 @@ function paintProjectPage(
   const card = el('article', 'hub-card page-card');
   const head = el('header', 'task-card__head');
   head.append(backLink('#/projects', '← Projects'));
-  head.append(problemSolverChips({ kind: 'project', id: project.id }));
+  head.append(problemSolverChips({ kind: 'project', id: project.id }), decisionMakerChips({ kind: 'project', id: project.id }));
 
   const fields = el('div', 'page-card__fields hub-toolbar');
   const status = pageFilter(
diff --git a/apps/tasks/src/views/problem-solver/api.ts b/apps/tasks/src/views/problem-solver/api.ts
index 4079b0595..1111dfa33 100644
--- a/apps/tasks/src/views/problem-solver/api.ts
+++ b/apps/tasks/src/views/problem-solver/api.ts
@@ -4,25 +4,38 @@ import type { PsAction, PsModelId, PsSession, PsSummary } from '../../../../../p
 /** A session linked to a task or project: by its links, a confirmed task, or its review task. */
 export type PsLinkedSession = { id: string; title: string; phase: string; model: PsModelId | null; role: 'link' | 'task' | 'review' };
 
-export const problemSolverApi = {
-  list: () => apiGet<{ sessions: PsSummary[] }>('/api/problem-solver?list=1').then((r) => r.sessions),
-  get: (id: string) => apiGet<{ session: PsSession }>(`/api/problem-solver?id=${encodeURIComponent(id)}`).then((r) => r.session),
-  create: (body: { text: string; title?: string; links?: PsSession['links']; kind?: 'full' | 'lightning' }) =>
-    apiPost<{ session: PsSession }>('/api/problem-solver', { create: { ...body, requestId: crypto.randomUUID() } }).then((r) => r.session),
-  act: (session: PsSession, action: PsAction, text?: string) =>
-    apiPost<{ session: PsSession }>('/api/problem-solver', { id: session.id, revision: session.revision, requestId: crypto.randomUUID(), action, ...(text ? { text } : {}) }).then((r) => r.session),
-  /** An action with a JSON payload (task confirmations, review). */
-  actWith: (session: PsSession, action: PsAction, payload: Record<string, unknown>) =>
-    apiPost<{ session: PsSession }>('/api/problem-solver', { id: session.id, revision: session.revision, requestId: crypto.randomUUID(), action, payload }).then((r) => r.session),
-  /** Sessions linked to a task or project, for the chip on its page. */
-  linked: (ref: string) =>
-    apiGet<{ sessions: PsLinkedSession[] }>(`/api/problem-solver?linked=${encodeURIComponent(ref)}`).then((r) => r.sessions),
-  /** Score a run (radar now; force field, decision matrix and Pareto later). */
-  score: (session: PsSession, payload: Record<string, unknown> & { runId?: string }) =>
-    apiPost<{ session: PsSession }>('/api/problem-solver', { id: session.id, revision: session.revision, requestId: crypto.randomUUID(), action: 'score', payload }).then((r) => r.session),
-  /** Score the topics of the Gap analysis (advanced) radar; one 1 to 10 score per topic for each overlay. */
-  rescore: (session: PsSession, payload: { current: number[]; objective: number[]; runId?: string }): Promise<PsSession> => problemSolverApi.score(session, payload)
-};
+export type SessionApi = ReturnType<typeof createSessionApi>;
+
+/**
+ * The session API at `base` (`/api/problem-solver`, or `/api/decision-book` for Decision Maker):
+ * both tools share one handler, so every call is the same apart from the path.
+ */
+export function createSessionApi(base: string) {
+  const api = {
+    list: () => apiGet<{ sessions: PsSummary[] }>(`${base}?list=1`).then((r) => r.sessions),
+    get: (id: string) => apiGet<{ session: PsSession }>(`${base}?id=${encodeURIComponent(id)}`).then((r) => r.session),
+    create: (body: { text: string; title?: string; links?: PsSession['links']; kind?: 'full' | 'lightning' | 'decision'; startModel?: string }) =>
+      apiPost<{ session: PsSession }>(base, { create: { ...body, requestId: crypto.randomUUID() } }).then((r) => r.session),
+    act: (session: PsSession, action: PsAction, text?: string) =>
+      apiPost<{ session: PsSession }>(base, { id: session.id, revision: session.revision, requestId: crypto.randomUUID(), action, ...(text ? { text } : {}) }).then((r) => r.session),
+    /** An action with a JSON payload (task confirmations, review). */
+    actWith: (session: PsSession, action: PsAction, payload: Record<string, unknown>) =>
+      apiPost<{ session: PsSession }>(base, { id: session.id, revision: session.revision, requestId: crypto.randomUUID(), action, payload }).then((r) => r.session),
+    /** Sessions linked to a task or project, for the chip on its page. */
+    linked: (ref: string) =>
+      apiGet<{ sessions: PsLinkedSession[] }>(`${base}?linked=${encodeURIComponent(ref)}`).then((r) => r.sessions),
+    /** Score a run (radar now; force field, decision matrix and Pareto later). */
+    score: (session: PsSession, payload: Record<string, unknown> & { runId?: string }) =>
+      apiPost<{ session: PsSession }>(base, { id: session.id, revision: session.revision, requestId: crypto.randomUUID(), action: 'score', payload }).then((r) => r.session),
+    /** Score the topics of the Gap analysis (advanced) radar; one 1 to 10 score per topic for each overlay. */
+    rescore: (session: PsSession, payload: { current: number[]; objective: number[]; runId?: string }): Promise<PsSession> => api.score(session, payload)
+  };
+  return api;
+}
+
+export const problemSolverApi = createSessionApi('/api/problem-solver');
+/** Decision Maker's sessions: the same handler over its own store. */
+export const decisionBookApi = createSessionApi('/api/decision-book');
 
 export function isBusy(session: PsSession): boolean {
   return session.runner.status === 'queued' || session.runner.status === 'running';
diff --git a/apps/tasks/src/views/problem-solver/case-file-bridge.ts b/apps/tasks/src/views/problem-solver/case-file-bridge.ts
index 961901907..f11e591a8 100644
--- a/apps/tasks/src/views/problem-solver/case-file-bridge.ts
+++ b/apps/tasks/src/views/problem-solver/case-file-bridge.ts
@@ -3,9 +3,11 @@
 // the only writer: the server never touches Tasks. A project made for the case file is
 // remembered (as one shared promise), so a retry after a failed append never makes a second
 // one; if that project is later deleted, it is forgotten and the next try makes a fresh one.
-// One case-file write runs at a time.
+// One case-file write runs at a time. Decision Maker passes its own blocks and a provenance
+// graphic: the graphic goes above the text, and if it will not write the text still does,
+// the session is told (`graphic: false`) and a later `graphic` offer retries just the image.
 import type { Block } from '@/schemas/block';
-import type { PsCaseFileOffer, PsCaseFileTarget, PsSession } from '../../../../../packages/problem-solver/types';
+import type { PsCaseFileOffer, PsCaseFileTarget, PsRecordOffer, PsSession } from '../../../../../packages/problem-solver/types';
 import { nameVersion } from '../../../../../packages/problem-solver/naming.mjs';
 import { caseFileBlocks } from './case-file-blocks';
 
@@ -18,8 +20,15 @@ type Deps = {
   updateTask(id: string, body: { page_blocks: Block[] }): Promise<unknown>;
   link(payload: Record<string, unknown>): Promise<void>;
   today(): string; // YYYYMMDD
+  /** The page blocks for an offer (Problem Solver's case file by default). */
+  blocks?(offer: PaperOffer, opts: { sessionId: string; date: string }): Block[];
+  /** An image block written above the text on a full write, or null for none. */
+  graphic?(offer: PaperOffer, opts: { sessionId: string; date: string }): Block | null;
 };
 
+/** What the card writes: Problem Solver's case file or Decision Maker's decision record. */
+export type PaperOffer = PsCaseFileOffer | PsRecordOffer;
+
 export type CaseFilePlace = PsCaseFileTarget | 'new';
 
 /** The page the case file was on has gone; the card asks for another place. */
@@ -38,7 +47,8 @@ export function createCaseFileBridge(deps: Deps) {
   let made: Promise<string> | null = null;
   let writing = false;
 
-  async function append(target: PsCaseFileTarget, blocks: Block[]): Promise<void> {
+  /** Add the blocks the page lacks, at the end or just before block `before` when it is there. */
+  async function append(target: PsCaseFileTarget, blocks: Block[], before?: string): Promise<void> {
     const get = target.kind === 'project' ? deps.getProject : deps.getTask;
     const put = target.kind === 'project' ? deps.updateProject : deps.updateTask;
     let entity: Entity;
@@ -51,7 +61,9 @@ export function createCaseFileBridge(deps: Deps) {
     const existing = Array.isArray(entity.page_blocks) ? entity.page_blocks : [];
     const have = new Set(existing.map((block) => block.id));
     const fresh = blocks.filter((block) => !have.has(block.id));
-    if (fresh.length) await put(target.id, { page_blocks: [...existing, ...fresh] });
+    if (!fresh.length) return;
+    const at = before ? existing.findIndex((block) => block.id === before) : -1;
+    await put(target.id, { page_blocks: at < 0 ? [...existing, ...fresh] : [...existing.slice(0, at), ...fresh, ...existing.slice(at)] });
   }
 
   const api = {
@@ -60,7 +72,7 @@ export function createCaseFileBridge(deps: Deps) {
      * named by the case file's title); an update goes where the case file already is unless
      * `moved` (its page is gone) sends the full file to `choice.place`.
      */
-    async write(session: PsSession, offer: PsCaseFileOffer, choice: { place: CaseFilePlace; title: string; moved?: boolean }): Promise<void> {
+    async write(session: PsSession, offer: PaperOffer, choice: { place: CaseFilePlace; title: string; moved?: boolean }): Promise<void> {
       if (writing) throw new Error('The case file is still being written.');
       writing = true;
       try {
@@ -71,14 +83,28 @@ export function createCaseFileBridge(deps: Deps) {
     }
   };
 
-  async function writeOnce(session: PsSession, offer: PsCaseFileOffer, choice: { place: CaseFilePlace; title: string; moved?: boolean }): Promise<void> {
+  const blocksFor = deps.blocks ?? ((offer: PaperOffer, opts: { sessionId: string; date: string }) => caseFileBlocks(offer as PsCaseFileOffer, opts));
+
+  /** Retry the graphic alone: above the record's heading on the page it is already on. */
+  async function retryGraphic(session: PsSession, offer: PaperOffer): Promise<void> {
+    const record = session.caseFile;
+    const opts = { sessionId: session.id, date: deps.today() };
+    const image = deps.graphic?.(offer, opts);
+    if (!record || !image) throw new Error('There is no graphic to write.');
+    const heading = blocksFor({ ...offer, kind: 'write' } as PaperOffer, opts)[0]?.id;
+    await append(record.target, [image], heading);
+    await deps.link({ target: record.target, version: record.version, title: record.title, sections: offer.digests, graphic: true });
+  }
+
+  async function writeOnce(session: PsSession, offer: PaperOffer, choice: { place: CaseFilePlace; title: string; moved?: boolean }): Promise<void> {
+    if (offer.kind === 'graphic') return retryGraphic(session, offer);
     const full = offer.kind === 'write' || Boolean(choice.moved);
     // A first write takes its version from the title the person settled on; a later or moved
     // write keeps the offer's (the card refuses a title that disagrees).
     const first = offer.kind === 'write' && !choice.moved && !session.caseFile;
     const version = first ? (nameVersion(choice.title) ?? offer.version) : offer.version;
     const file = { ...offer.file, title: choice.title, version };
-    const sent: PsCaseFileOffer = full ? { ...offer, kind: 'write', version, file } : offer;
+    const sent = (full ? { ...offer, kind: 'write', version, file } : offer) as PaperOffer;
     let target: PsCaseFileTarget;
     let ours: Promise<string> | null = null;
     if (!full && session.caseFile) target = session.caseFile.target;
@@ -93,8 +119,22 @@ export function createCaseFileBridge(deps: Deps) {
       ours = made;
       target = { kind: 'project', id: await ours };
     } else target = choice.place;
+    const opts = { sessionId: session.id, date: deps.today() };
+    const text = blocksFor(sent, opts);
+    const image = full && deps.graphic ? deps.graphic(sent, opts) : null;
+    /** Whether the graphic wrote; left out when there is none to write. */
+    let graphic: boolean | undefined;
     try {
-      await append(target, caseFileBlocks(sent, { sessionId: session.id, date: deps.today() }));
+      if (image) {
+        try {
+          await append(target, [image, ...text]);
+          graphic = true;
+        } catch (err) {
+          if (err instanceof CaseFilePageGone) throw err;
+          await append(target, text);
+          graphic = false;
+        }
+      } else await append(target, text);
     } catch (err) {
       // The project made for the case file has been deleted: make a fresh one next time.
       if (err instanceof CaseFilePageGone && ours && made === ours) made = null;
@@ -102,7 +142,7 @@ export function createCaseFileBridge(deps: Deps) {
     }
     const sections = full ? offer.digests : Object.fromEntries(offer.changed.map((key) => [key, offer.digests[key]]));
     const title = full ? choice.title : session.caseFile!.title;
-    await deps.link({ target, version, title, sections, ...(choice.moved ? { moved: true } : {}) });
+    await deps.link({ target, version, title, sections, ...(choice.moved ? { moved: true } : {}), ...(graphic === undefined ? {} : { graphic }) });
   }
 
   return api;
diff --git a/apps/tasks/src/views/problem-solver/coach-panel.ts b/apps/tasks/src/views/problem-solver/coach-panel.ts
index f161dfcab..f82d881f7 100644
--- a/apps/tasks/src/views/problem-solver/coach-panel.ts
+++ b/apps/tasks/src/views/problem-solver/coach-panel.ts
@@ -8,6 +8,25 @@ import type { PsAction, PsSession } from '../../../../../packages/problem-solver
 import { coachAvatar, thinkingDots } from './decor';
 
 export type CoachPanelHandlers = { onSay: (text: string) => void; onAction: (action: PsAction) => void };
+
+/**
+ * How the panel looks in a tool: its coach avatar, the emblem beside a suggested tool, the
+ * framing questions per session kind and the word for the session. Problem Solver's is the
+ * default; Decision Maker passes its own (decision-book/decor.ts).
+ */
+export type CoachLook = {
+  avatar(): Element;
+  emblem(tool: string): Element;
+  frames: Record<string, { keys: string[]; prompts: string[] }>;
+  noun: string;
+};
+
+const PS_LOOK: CoachLook = {
+  avatar: coachAvatar,
+  emblem: (tool) => toolEmblem(tool as never),
+  frames: { full: { keys: ['goal', 'whatIsTrue', 'whatCanBeDone'], prompts: ['What is the goal?', 'What is true?', 'What can be done?'] } },
+  noun: 'Problem'
+};
 export type CoachPanel = { el: HTMLElement; update(session: PsSession): void };
 
 function actionButton(label: string, action: PsAction, handlers: CoachPanelHandlers, kind = 'btn--ghost'): HTMLButtonElement {
@@ -28,11 +47,11 @@ function keepRefused(session: PsSession): boolean {
   return Boolean(keep && run && acceptProblem(run, keep));
 }
 
-function message(turn: PsSession['turns'][number], fresh: boolean): HTMLLIElement {
+function message(turn: PsSession['turns'][number], fresh: boolean, look: CoachLook): HTMLLIElement {
   const coach = turn.role !== 'user';
   const item = el('li', `chat-message chat-message--${coach ? 'assistant' : 'user'} ps-msg${fresh ? ' is-new' : ''}`) as HTMLLIElement;
   item.dataset.turn = turn.id;
-  if (coach) item.append(coachAvatar());
+  if (coach) item.append(look.avatar());
   item.append(el('div', 'chat-message__body', turn.text));
   const chips = [...(turn.skillsSeen ?? []).map((id) => skillChip(id)), ...(turn.skillsMissing ?? []).map((id) => skillChip(id, { missing: true }))];
   if (chips.length) {
@@ -44,15 +63,15 @@ function message(turn: PsSession['turns'][number], fresh: boolean): HTMLLIElemen
   return item;
 }
 
-function thinkingBubble(): HTMLLIElement {
+function thinkingBubble(look: CoachLook): HTMLLIElement {
   const item = el('li', 'chat-message chat-message--assistant ps-msg ps-msg--thinking is-new') as HTMLLIElement;
   const body = el('div', 'chat-message__body ps-thinking');
   body.append(thinkingDots(), el('span', '', 'Coach is thinking…'));
-  item.append(coachAvatar(), body);
+  item.append(look.avatar(), body);
   return item;
 }
 
-function suggestionCard(session: PsSession, handlers: CoachPanelHandlers): HTMLElement | null {
+function suggestionCard(session: PsSession, handlers: CoachPanelHandlers, look: CoachLook): HTMLElement | null {
   const suggestion = session.suggestion;
   if (!suggestion) return null;
   const card = el('div', 'ps-suggestion confirm-card');
@@ -77,7 +96,7 @@ function suggestionCard(session: PsSession, handlers: CoachPanelHandlers): HTMLE
     title = `${suggestion.kind === 'switch_tool' ? 'Switch to' : 'Next'}: ${TOOLS[suggestion.tool].name}`;
   }
   const heading = el('p', 'ps-suggestion__title', title);
-  if (suggestion.kind === 'next_tool' || suggestion.kind === 'switch_tool') heading.prepend(toolEmblem(suggestion.tool));
+  if (suggestion.kind === 'next_tool' || suggestion.kind === 'switch_tool') heading.prepend(look.emblem(suggestion.tool));
   card.append(heading, el('p', 'ps-suggestion__reason', suggestion.reason));
   const row = el('div', 'ps-suggestion__actions');
   row.append(actionButton(accept, acceptAction, handlers, 'btn--primary'), actionButton('Not now', 'dismiss_suggestion', handlers));
@@ -91,7 +110,8 @@ function suggestionCard(session: PsSession, handlers: CoachPanelHandlers): HTMLE
  * page does not jump while the coach is polled. `slots.cards` (the task confirm cards) sits
  * between the extras and the composer and keeps its own DOM when the extras are replaced.
  */
-export function mountCoachPanel(handlers: CoachPanelHandlers, slots: { cards?: HTMLElement } = {}): CoachPanel {
+export function mountCoachPanel(handlers: CoachPanelHandlers, slots: { cards?: HTMLElement; look?: CoachLook } = {}): CoachPanel {
+  const look = slots.look ?? PS_LOOK;
   const panel = el('section', 'ps-coach');
   panel.setAttribute('aria-label', 'Coach');
   const list = el('ul', 'chat-messages ps-coach__messages');
@@ -147,7 +167,7 @@ export function mountCoachPanel(handlers: CoachPanelHandlers, slots: { cards?: H
         shown.add(turn.id);
         // Clear the composer once the answer is in the thread, so a failed send keeps the text.
         if (!first && turn.role === 'user' && input.value.trim() === turn.text.trim()) input.value = '';
-        const node = message(turn, !first);
+        const node = message(turn, !first, look);
         if (thinking && turn.role !== 'user') {
           thinking.replaceWith(node);
           thinking = null;
@@ -158,7 +178,7 @@ export function mountCoachPanel(handlers: CoachPanelHandlers, slots: { cards?: H
         }
       }
       if (busy && !thinking) {
-        thinking = thinkingBubble();
+        thinking = thinkingBubble(look);
         list.append(thinking);
       } else if (!busy && thinking) {
         thinking.remove();
@@ -171,7 +191,7 @@ export function mountCoachPanel(handlers: CoachPanelHandlers, slots: { cards?: H
         failed.append(el('span', '', session.runner.error ?? 'The coach could not answer.'), actionButton('Try again', 'retry', handlers));
         parts.push(failed);
       }
-      const card = boundaryFailed ? null : suggestionCard(session, handlers);
+      const card = boundaryFailed ? null : suggestionCard(session, handlers, look);
       if (card) parts.push(card);
       const actions = el('div', 'ps-coach__actions');
       if (session.pendingKeep && !locked) {
@@ -191,10 +211,10 @@ export function mountCoachPanel(handlers: CoachPanelHandlers, slots: { cards?: H
         extras.replaceChildren(...parts);
       }
 
-      const question = !lightning && session.phase === 'frame' ? (['goal', 'whatIsTrue', 'whatCanBeDone'] as const).findIndex((key) => !session.frame[key]) : -1;
-      const prompts = ['What is the goal?', 'What is true?', 'What can be done?'];
+      const frame = look.frames[session.kind] ?? look.frames.full ?? PS_LOOK.frames.full;
+      const question = !lightning && session.phase === 'frame' ? frame.keys.findIndex((key) => !session.frame[key as keyof PsSession['frame']]) : -1;
       const stepLabel = inStep ? `Step: ${stepName(session.model!.id, session.phase)}` : '';
-      now.textContent = lightning ? '' : question >= 0 ? `Answering: ${prompts[question]}` : session.phase === 'finished' ? 'Problem finished' : stepLabel;
+      now.textContent = lightning ? '' : question >= 0 ? `Answering: ${frame.prompts[question]}` : session.phase === 'finished' ? `${look.noun} finished` : stepLabel;
       now.dataset.q = String(question);
       input.placeholder = closed ? 'This run is done.' : !lightning && session.phase === 'finished' ? 'Add a note for next time…' : 'Your answer…';
       input.disabled = locked;
diff --git a/apps/tasks/src/views/problem-solver/link-chips.css b/apps/tasks/src/views/problem-solver/link-chips.css
index 95a2f6cb6..2ba1524eb 100644
--- a/apps/tasks/src/views/problem-solver/link-chips.css
+++ b/apps/tasks/src/views/problem-solver/link-chips.css
@@ -8,3 +8,7 @@
 .ps-linkchip__dot i:nth-child(1) { background: #c8372d; }
 .ps-linkchip__dot i:nth-child(2) { background: #e8b923; }
 .ps-linkchip__dot i:nth-child(3) { background: #2a5da8; }
+/* Decision Maker's chip: the cover's red and green discs. */
+.ps-linkchip--dm .ps-linkchip__dot i:nth-child(1) { background: #f43a25; }
+.ps-linkchip--dm .ps-linkchip__dot i:nth-child(2) { background: #60ba2c; }
+.ps-linkchip--dm .ps-linkchip__dot i:nth-child(3) { display: none; }
diff --git a/apps/tasks/src/views/problem-solver/link-chips.ts b/apps/tasks/src/views/problem-solver/link-chips.ts
index d6a4c1ab6..746f3f652 100644
--- a/apps/tasks/src/views/problem-solver/link-chips.ts
+++ b/apps/tasks/src/views/problem-solver/link-chips.ts
@@ -1,30 +1,41 @@
 import './link-chips.css';
 import { el } from '@/views/hub-kit';
-import { problemSolverApi, type PsLinkedSession } from './api';
+import { decisionBookApi, problemSolverApi, type PsLinkedSession } from './api';
+
+type LinkedApi = { linked: (ref: string) => Promise<PsLinkedSession[]> };
+/** A tool's chips: where they open, the review step a review chip opens at, and the tool's name. */
+type ChipTool = { hash: string; reviewStep: string; name: string; tone: string };
 
 /**
- * Chips on a task or project page for the Problem Solver sessions that link to it. Hidden
- * until at least one session is found; a failed lookup leaves it hidden. A review chip
- * opens its session at Improve.
+ * Chips on a task or project page for one tool's sessions that link to it. Hidden until at
+ * least one session is found; a failed lookup leaves it hidden. A review chip opens its session
+ * at the review step.
  */
-export function problemSolverChips(
-  ref: { kind: 'task' | 'project'; id: string },
-  api: { linked: (ref: string) => Promise<PsLinkedSession[]> } = problemSolverApi
-): HTMLSpanElement {
+function sessionChips(ref: { kind: 'task' | 'project'; id: string }, api: LinkedApi, tool: ChipTool): HTMLSpanElement {
   const host = el('span', 'ps-linkchips') as HTMLSpanElement;
   host.hidden = true;
   void api.linked(`${ref.kind}:${ref.id}`).then((sessions) => {
     for (const s of sessions) {
       const review = s.role === 'review';
-      const chip = el('a', 'ps-linkchip') as HTMLAnchorElement;
-      chip.href = `#/problem-solver?id=${encodeURIComponent(s.id)}${review ? '&step=improve' : ''}`;
+      const chip = el('a', `ps-linkchip ps-linkchip--${tool.tone}`) as HTMLAnchorElement;
+      chip.href = `${tool.hash}?id=${encodeURIComponent(s.id)}${review ? `&step=${tool.reviewStep}` : ''}`;
       const dot = el('span', 'ps-linkchip__dot');
       dot.setAttribute('aria-hidden', 'true');
       dot.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
-      chip.append(dot, document.createTextNode(`${review ? 'Review in Problem Solver' : 'Problem Solver'}: ${s.title}`));
+      chip.append(dot, document.createTextNode(`${review ? `Review in ${tool.name}` : tool.name}: ${s.title}`));
       host.append(chip);
     }
     host.hidden = host.childElementCount === 0;
   }, () => undefined);
   return host;
 }
+
+/** Chips for the Problem Solver sessions that link to a task or project. */
+export function problemSolverChips(ref: { kind: 'task' | 'project'; id: string }, api: LinkedApi = problemSolverApi): HTMLSpanElement {
+  return sessionChips(ref, api, { hash: '#/problem-solver', reviewStep: 'improve', name: 'Problem Solver', tone: 'ps' });
+}
+
+/** Chips for the Decision Maker decisions that link to a task or project (a record page, a first step, a review). */
+export function decisionMakerChips(ref: { kind: 'task' | 'project'; id: string }, api: LinkedApi = decisionBookApi): HTMLSpanElement {
+  return sessionChips(ref, api, { hash: '#/decision-maker', reviewStep: 'review', name: 'Decision Maker', tone: 'dm' });
+}
diff --git a/apps/tasks/src/views/problem-solver/problem-solver-view.css b/apps/tasks/src/views/problem-solver/problem-solver-view.css
index 1966c0eea..ea9d17f20 100644
--- a/apps/tasks/src/views/problem-solver/problem-solver-view.css
+++ b/apps/tasks/src/views/problem-solver/problem-solver-view.css
@@ -281,3 +281,11 @@
 
 .ps-resume { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 10px 14px; border: 1.5px solid var(--ink); border-radius: 12px; background: var(--ps-card); }
 .ps-resume__go { min-height: 44px; padding: 0 16px; border: 1.5px solid var(--ink); border-radius: 999px; background: var(--ink); color: var(--ps-paper); font: inherit; cursor: pointer; }
+
+/* ── Shared skills ribbon (skills-ribbon.ts): this tool's share in colour, the other's grey ── */
+.ps-ribbon { display: grid; gap: var(--space-3); }
+.ps-ribbon__legend { display: flex; flex-wrap: wrap; gap: var(--space-4); margin: 0; color: var(--muted); font-size: var(--text-xs); }
+.ps-ribbon__key::before { content: ''; display: inline-block; width: 14px; height: 4px; margin-right: 6px; border-radius: 4px; vertical-align: middle; background: var(--c); }
+.ps-skills__bar--split { display: flex; }
+.ps-skills__bar--split i { border-radius: 0; }
+.ps-skills__bar--split .ps-skills__other { background: var(--ps-other, #a9aa9f); }
diff --git a/apps/tasks/src/views/problem-solver/review-panel.ts b/apps/tasks/src/views/problem-solver/review-panel.ts
index 1fff28661..91afdf945 100644
--- a/apps/tasks/src/views/problem-solver/review-panel.ts
+++ b/apps/tasks/src/views/problem-solver/review-panel.ts
@@ -47,15 +47,18 @@ export function mountReviewPanel({ start }: { start: () => void }): ReviewPanel
   };
 }
 
-const BANNER: Record<ReviewEntry['kind'], (name: string) => [string, string]> = {
+const BANNER: Record<ReviewEntry['kind'], (name: string, noun: string) => [string, string]> = {
   move: (name) => [`This review picks up at ${name}.`, 'Start the review'],
   start: () => ['Your review is due.', 'Start the review'],
-  reopen: (name) => [`This problem has moved on. The review adds a new ${name} pass, then brings you back.`, 'Review the results']
+  reopen: (name, noun) => [`This ${noun} has moved on. The review adds a new ${name} pass, then brings you back.`, 'Review the results']
 };
 
-/** The banner a review task's link opens with. `name` is the Improve step's name in this model. */
-export function reviewBanner(entry: ReviewEntry, start: () => void, name = 'Improve'): HTMLElement {
-  const [text, label] = BANNER[entry.kind](name);
+/**
+ * The banner a review task's link opens with. `name` is the Improve step's name in this model;
+ * `noun` is the word for a session (Decision Maker says decision).
+ */
+export function reviewBanner(entry: ReviewEntry, start: () => void, name = 'Improve', noun = 'problem'): HTMLElement {
+  const [text, label] = BANNER[entry.kind](name, noun);
   const banner = el('div', 'ps-resume');
   banner.setAttribute('role', 'status');
   const go = el('button', 'ps-resume__go', label) as HTMLButtonElement;
diff --git a/apps/tasks/src/views/problem-solver/task-bridge.ts b/apps/tasks/src/views/problem-solver/task-bridge.ts
index 5bcd2f9e6..168f015be 100644
--- a/apps/tasks/src/views/problem-solver/task-bridge.ts
+++ b/apps/tasks/src/views/problem-solver/task-bridge.ts
@@ -12,8 +12,15 @@ type Deps = {
   confirm(proposalId: string, taskId: string): Promise<void>;
   dismiss(proposalId: string, reason?: 'removed'): Promise<void>;
   setReview(taskId: string, due: string): Promise<void>;
+  /** Which tool the tasks come from (Problem Solver's by default). */
+  origin?: TaskOrigin;
 };
 
+/** How a tool's tasks are labelled in Tasks: its name, source, tag and the word for a session. */
+export type TaskOrigin = { name: string; source: string; tag: string; noun: string; review: string };
+
+export const PS_ORIGIN: TaskOrigin = { name: 'Problem Solver', source: 'problem_solver', tag: 'problem-solver', noun: 'problem', review: 'the plan for "%s" is going, then open the problem to work through Improve' };
+
 export type TaskDetail = { status: string; due_date?: string | null; title?: string } | 'removed' | 'unknown';
 type SnapshotStatus = keyof PsTaskSnapshot['byStatus'];
 
@@ -50,22 +57,22 @@ function startStatus(session: PsSession, source: PsProposedTask['source'] | unde
   return node?.tag === 'doing' ? 'in_progress' : null;
 }
 
-export function taskBody(session: PsSession, edits: TaskEdits, domain: string, source?: PsProposedTask['source']): Record<string, unknown> {
+export function taskBody(session: PsSession, edits: TaskEdits, domain: string, source?: PsProposedTask['source'], origin: TaskOrigin = PS_ORIGIN): Record<string, unknown> {
   const status = startStatus(session, source);
   return {
     ...(status ? { status } : {}),
     title: edits.title.trim().slice(0, 120),
     domain,
     due_date: edits.due,
-    description: `From Problem Solver: ${session.title}`,
-    source: 'problem_solver',
-    tags: ['problem-solver'],
+    description: `From ${origin.name}: ${session.title}`,
+    source: origin.source,
+    tags: [origin.tag],
     parent_project_id: projectOf(session)
   };
 }
 
-export function reviewBody(session: PsSession, edits: { title: string; due: string }, domain: string): Record<string, unknown> {
-  return { ...taskBody(session, edits, domain), review_at: edits.due, description: `Review how the plan for "${session.title}" is going, then open the problem to work through Improve.`, tags: ['problem-solver', 'review'] };
+export function reviewBody(session: PsSession, edits: { title: string; due: string }, domain: string, origin: TaskOrigin = PS_ORIGIN): Record<string, unknown> {
+  return { ...taskBody(session, edits, domain, undefined, origin), review_at: edits.due, description: `Review how ${origin.review.replace('%s', session.title)}.`, tags: [origin.tag, 'review'] };
 }
 
 /**
@@ -75,10 +82,10 @@ export function reviewBody(session: PsSession, edits: { title: string; due: stri
  */
 export class TaskNotLinkedError extends Error {
   readonly taskId: string;
-  constructor(taskId: string, review = false) {
+  constructor(taskId: string, review = false, noun = 'problem') {
     super(review
-      ? 'The review task was created in Tasks but is not linked to this problem.'
-      : 'The task was created in Tasks but is not linked to this problem.');
+      ? `The review task was created in Tasks but is not linked to this ${noun}.`
+      : `The task was created in Tasks but is not linked to this ${noun}.`);
     this.name = 'TaskNotLinkedError';
     this.taskId = taskId;
   }
@@ -92,6 +99,7 @@ function refused(err: unknown): boolean {
 }
 
 export function createTaskBridge(deps: Deps) {
+  const origin = deps.origin ?? PS_ORIGIN;
   /** Proposal id → created task id, kept until the confirm lands so a retry never creates twice. */
   const created = new Map<string, string>();
   let reviewCreated: string | null = null;
@@ -115,7 +123,7 @@ export function createTaskBridge(deps: Deps) {
     async create(session: PsSession, proposal: PsProposedTask, edits: TaskEdits): Promise<void> {
       let taskId = created.get(proposal.id);
       if (!taskId) {
-        taskId = (await deps.createTask(taskBody(session, edits, await deps.domainFor(session), proposal.source))).id;
+        taskId = (await deps.createTask(taskBody(session, edits, await deps.domainFor(session), proposal.source, origin))).id;
         created.set(proposal.id, taskId);
       }
       try {
@@ -123,19 +131,19 @@ export function createTaskBridge(deps: Deps) {
       } catch (err) {
         if (!refused(err)) throw err;
         created.delete(proposal.id);
-        throw new TaskNotLinkedError(taskId);
+        throw new TaskNotLinkedError(taskId, false, origin.noun);
       }
       created.delete(proposal.id);
     },
     async createReview(session: PsSession, edits: { title: string; due: string }): Promise<void> {
-      if (!reviewCreated) reviewCreated = (await deps.createTask(reviewBody(session, edits, await deps.domainFor(session)))).id;
+      if (!reviewCreated) reviewCreated = (await deps.createTask(reviewBody(session, edits, await deps.domainFor(session), origin))).id;
       const taskId = reviewCreated;
       try {
         await deps.setReview(taskId, edits.due);
       } catch (err) {
         if (!refused(err)) throw err;
         reviewCreated = null;
-        throw new TaskNotLinkedError(taskId, true);
+        throw new TaskNotLinkedError(taskId, true, origin.noun);
       }
       reviewCreated = null;
     },
diff --git a/apps/tasks/src/views/problem-solver/task-cards.ts b/apps/tasks/src/views/problem-solver/task-cards.ts
index 701a1cce5..dbee6a75f 100644
--- a/apps/tasks/src/views/problem-solver/task-cards.ts
+++ b/apps/tasks/src/views/problem-solver/task-cards.ts
@@ -6,9 +6,9 @@ import { errorMessage } from '@/views/feedback';
 import { taskPageHash } from '@/domain/cards';
 import { caseFileOffer } from '../../../../../packages/problem-solver/case-file.mjs';
 import { nameVersion, namingProblem, reviseName } from '../../../../../packages/problem-solver/naming.mjs';
-import type { PsCaseFileOffer, PsProposedTask, PsSession } from '../../../../../packages/problem-solver/types';
+import type { PsProposedTask, PsSession } from '../../../../../packages/problem-solver/types';
 import { TaskNotLinkedError, type TaskEdits } from './task-bridge';
-import { CaseFilePageGone, type CaseFilePlace } from './case-file-bridge';
+import { CaseFilePageGone, type CaseFilePlace, type PaperOffer } from './case-file-bridge';
 
 export type TaskCardHandlers = {
   create(proposal: PsProposedTask, edits: TaskEdits): Promise<void>;
@@ -17,7 +17,7 @@ export type TaskCardHandlers = {
   dismissReview(): Promise<void>;
   /** Where the case file can go: linked pages first, `new` (a new project) last. */
   places(session: PsSession): Promise<PlaceOption[]>;
-  writeCaseFile(offer: PsCaseFileOffer, choice: { place: CaseFilePlace; title: string; moved?: boolean }): Promise<void>;
+  writeCaseFile(offer: PaperOffer, choice: { place: CaseFilePlace; title: string; moved?: boolean }): Promise<void>;
   dismissCaseFile(key: string): Promise<void>;
 };
 export type PlaceOption = { value: string; label: string };
@@ -26,7 +26,18 @@ export type TaskCardOptions = {
   fallbackFocus?: () => HTMLElement | null;
   /** Today as YYYYMMDD, for the case file's revised name (defaults to the local date). */
   today?: () => string;
+  /** The page record the card writes (Problem Solver's case file by default). */
+  paper?: PaperCard;
 };
+
+/**
+ * Which page record the card offers: its offer, the word for it, and whether its title must
+ * pass the strict naming rules and carry its version (the case file's do; a decision record's
+ * title is free).
+ */
+export type PaperCard = { offer(session: PsSession): PaperOffer | null; noun: string; strictNames: boolean };
+
+const CASE_FILE: PaperCard = { offer: (session) => caseFileOffer(session), noun: 'case file', strictNames: true };
 export type TaskCards = { el: HTMLElement; update(session: PsSession): void };
 
 const WAITING = 'Waiting for the coach…';
@@ -191,10 +202,12 @@ export function mountTaskCards(handlers: TaskCardHandlers, options: TaskCardOpti
   /** Card order on the last update, to find the card after one that removed itself. */
   let lastOrder: string[] = [];
   let review: (Card & { sync(proposal: NonNullable<PsSession['reviewProposal']>): void }) | null = null;
-  let caseFile: (Card & { key: string; sync(session: PsSession): void }) | null = null;
+  let caseFile: (Card & { key: string; kind: string; sync(session: PsSession): void }) | null = null;
   /** The session of the last update, for the places list when an update card turns into a write. */
   let current: PsSession | null = null;
   const dateToday = options.today ?? compactToday;
+  const paper = options.paper ?? CASE_FILE;
+  const noun = paper.noun;
 
   const syncHidden = () => {
     root.hidden = cards.size === 0 && !review && !caseFile && notices.childElementCount === 0;
@@ -289,9 +302,10 @@ export function mountTaskCards(handlers: TaskCardHandlers, options: TaskCardOpti
    * before anything is written) and a place; an update goes where the case file already is.
    * If that page has gone, the card turns into the write form for a full copy elsewhere.
    */
-  function caseFileCard(offer: PsCaseFileOffer, session: PsSession): Card & { key: string; sync(session: PsSession): void } {
+  function caseFileCard(offer: PaperOffer, session: PsSession): Card & { key: string; kind: string; sync(session: PsSession): void } {
     let moved = false;
     const write = offer.kind === 'write';
+    const graphic = offer.kind === 'graphic';
     const title = input('title', 'text', offer.file.title);
     const place = el('select', 'ps-taskcard__input ps-casefilecard__select') as HTMLSelectElement;
     place.name = 'place';
@@ -348,11 +362,12 @@ export function mountTaskCards(handlers: TaskCardHandlers, options: TaskCardOpti
     const writeFields = () => [field('Title', title), field('Place', place)];
     if (write) loadPlaces(session, true);
 
+    if (graphic) sections.replaceChildren();
     const card = makeCard({
       className: 'ps-casefilecard',
-      meta: write ? 'Write the case file?' : 'Add an update to the case file?',
+      meta: write ? `Write the ${noun}?` : graphic ? `The ${noun}'s graphic did not write. Try it again?` : `Add an update to the ${noun}?`,
       fields: write ? writeFields() : [],
-      primary: button(write ? 'Write case file' : 'Add update', 'write-casefile', 'btn--primary'),
+      primary: button(write ? `Write ${noun}` : graphic ? 'Retry the graphic' : 'Add update', 'write-casefile', 'btn--primary'),
       secondary: button('Not now', 'dismiss-casefile', 'btn--ghost'),
       busyLabel: 'Writing…',
       onPrimary: async () => {
@@ -367,7 +382,7 @@ export function mountTaskCards(handlers: TaskCardHandlers, options: TaskCardOpti
               skip = `${record.target.kind}:${record.target.id}`;
               loadPlaces(current ?? session, true);
               listSections(null);
-              card.reshape({ meta: 'Write the case file somewhere else?', fields: writeFields(), primary: 'Write it there' });
+              card.reshape({ meta: `Write the ${noun} somewhere else?`, fields: writeFields(), primary: 'Write it there' });
               place.focus();
             }
             throw err;
@@ -375,10 +390,13 @@ export function mountTaskCards(handlers: TaskCardHandlers, options: TaskCardOpti
           return;
         }
         const name = title.value.trim();
-        const problem = namingProblem(name);
-        if (problem) throw new Error(problem.charAt(0).toUpperCase() + problem.slice(1));
-        // Only a first write may choose its version; a later copy carries the offer's.
-        if ((moved || record) && nameVersion(name) !== offer.version) throw new Error(`Keep the version as v${offer.version}.`);
+        if (!name) throw new Error('Give it a title.');
+        if (paper.strictNames) {
+          const problem = namingProblem(name);
+          if (problem) throw new Error(problem.charAt(0).toUpperCase() + problem.slice(1));
+          // Only a first write may choose its version; a later copy carries the offer's.
+          if ((moved || record) && nameVersion(name) !== offer.version) throw new Error(`Keep the version as v${offer.version}.`);
+        }
         await handlers.writeCaseFile(offer, { place: parsePlace(place.value), title: name, ...(moved ? { moved: true } : {}) });
       },
       onSecondary: () => handlers.dismissCaseFile(offer.key),
@@ -390,6 +408,7 @@ export function mountTaskCards(handlers: TaskCardHandlers, options: TaskCardOpti
     return {
       ...card,
       key: offer.key,
+      kind: offer.kind,
       sync(next) {
         if (placesKey !== null && placeKey(next) !== placesKey) loadPlaces(next, false);
       }
@@ -432,9 +451,10 @@ export function mountTaskCards(handlers: TaskCardHandlers, options: TaskCardOpti
         review.refresh(busy);
       }
 
-      // Kept while the offer is the same content, so typed edits survive polling.
-      const offer = caseFileOffer(session);
-      if (caseFile && caseFile.key !== offer?.key) {
+      // Kept while the offer is the same content and kind, so typed edits survive polling (a
+      // written record whose graphic failed keeps its content but turns into a retry).
+      const offer = paper.offer(session);
+      if (caseFile && (caseFile.key !== offer?.key || caseFile.kind !== offer?.kind)) {
         caseFile.el.remove();
         caseFile = null;
       }
diff --git a/apps/tasks/src/views/problem-solver/view.ts b/apps/tasks/src/views/problem-solver/view.ts
index 5b5dd9c51..c9e8a728e 100644
--- a/apps/tasks/src/views/problem-solver/view.ts
+++ b/apps/tasks/src/views/problem-solver/view.ts
@@ -11,7 +11,8 @@ import { TOOLS, toolsForBookStep } from '../../../../../packages/problem-solver/
 import { BOOK_STEPS, planStepForBook, stepName } from '../../../../../packages/problem-solver/steps.mjs';
 import { reviewStart, waitingForReview } from '../../../../../packages/problem-solver/review.mjs';
 import type { PsAction, PsCaseFileOffer, PsSession, PsSummary, PsToolId } from '../../../../../packages/problem-solver/types';
-import { isBusy, pollUntilSettled, problemSolverApi } from './api';
+import { decisionBookApi, isBusy, pollUntilSettled, problemSolverApi } from './api';
+import { skillsRibbon } from './skills-ribbon';
 import { mountCanvas, type RunScores } from './canvas';
 import { mountCoachPanel } from './coach-panel';
 import { createTaskBridge } from './task-bridge';
@@ -39,7 +40,7 @@ const phaseLabel = (row: PsSummary): string =>
 const phaseColour = (phase: string): string => (phase === 'frame' ? 'var(--ps-blue)' : phase === 'finished' ? 'var(--ps-red)' : 'var(--ps-yellow)');
 const COLOURS = ['var(--ps-red)', 'var(--ps-yellow)', 'var(--ps-blue)'];
 
-function section(title: string, aside: string, ...body: Node[]): HTMLElement {
+export function section(title: string, aside: string, ...body: Node[]): HTMLElement {
   const wrap = el('section', 'ps-section');
   const head = el('div', 'ps-section__head');
   head.append(el('h2', 'section-title ps-section__title', title), el('p', 'ps-section__aside', aside));
@@ -208,28 +209,6 @@ export function toolShelf(): HTMLElement {
   return groups;
 }
 
-function skillsRibbon(sessions: PsSummary[]): HTMLElement {
-  const totals: Record<string, number> = {};
-  for (const row of sessions) for (const [id, n] of Object.entries(row.skills ?? {})) totals[id] = (totals[id] ?? 0) + n;
-  const max = Math.max(1, ...Object.values(totals));
-  const grid = el('ul', 'ps-skills');
-  SKILLS.forEach((skill, i) => {
-    const n = totals[skill.id] ?? 0;
-    const item = el('li', `ps-skills__item${n ? '' : ' is-unused'}`);
-    item.title = skill.description;
-    const text = el('span', 'ps-skills__text');
-    const bar = el('span', 'ps-skills__bar');
-    const fill = el('i');
-    fill.style.setProperty('--w', `${(n / max) * 100}%`);
-    fill.style.setProperty('--c', COLOURS[i % 3]);
-    bar.append(fill);
-    text.append(el('span', 'ps-skills__name', skill.name), el('span', 'ps-skills__count', n ? `${n}×` : 'Not yet'), bar);
-    item.append(skillGlyph(skill.id), text);
-    grid.append(item);
-  });
-  return grid;
-}
-
 async function renderList(canvas: HTMLElement): Promise<void> {
   const page = el('div', 'ps-page ps-landing ps-scope');
   const board = createShapeBoard();
@@ -243,7 +222,11 @@ async function renderList(canvas: HTMLElement): Promise<void> {
   hero.append(copy, board.el);
   page.append(hero);
 
-  const sessions = (await problemSolverApi.list()).filter((item) => item.status !== 'archived');
+  const [sessions, decisions] = await Promise.all([
+    problemSolverApi.list().then((rows) => rows.filter((item) => item.status !== 'archived')),
+    // The shared tally only: a Decision Maker that cannot be reached leaves its share out.
+    decisionBookApi.list().catch(() => [] as PsSummary[])
+  ]);
   const problems = el('ul', 'ps-probs');
   problems.append(...sessions.map(problemCard));
   const fresh = el('li', 'ps-prob ps-prob--new');
@@ -260,13 +243,13 @@ async function renderList(canvas: HTMLElement): Promise<void> {
     section('Problems', sessions.length ? 'Each badge fills in as you go. Blue, yellow and red are the three framing questions; the centre is the tool in use.' : 'Nothing yet. Start with the problem that is bugging you most.', problems),
     section('How a session builds', 'The order follows the toolkit’s problem solving process.', buildSteps()),
     section('The toolkit', 'The coach picks from these for each step. Here is what each one is for.', toolShelf()),
-    section('Thinking skills you have used', 'Totals across your problems. Faint marks have not come up yet.', skillsRibbon(sessions))
+    section('Thinking skills you have used', 'Across Problem Solver and Decision Maker. Faint marks have not come up yet.', skillsRibbon({ name: 'Problem Solver', sessions }, { name: 'Decision Maker', sessions: decisions }, (i) => COLOURS[i % 3]))
   );
   canvas.replaceChildren(page);
 }
 
 /** The twelve skill marks; ones seen in this session fill in, newly earned ones pop. */
-function createSkillTray(): { el: HTMLElement; update(session: PsSession): void } {
+export function createSkillTray(): { el: HTMLElement; update(session: PsSession): void } {
   const tray = el('div', 'ps-tray');
   const head = el('div', 'ps-tray__head');
   const count = el('span', 'ps-tray__count');
@@ -319,7 +302,7 @@ export function reviewEntry(session: PsSession, wanted: string | null): ReviewEn
  * coach's proposals that are not linked already, then a new project named by the case file.
  * `labels` maps `kind:id` to a fetched title.
  */
-export function caseFilePlaces(session: PsSession, labels: Record<string, string>): PlaceOption[] {
+export function caseFilePlaces(session: PsSession, labels: Record<string, string>, newTitle = composeCaseFile(session)?.title ?? 'the case file'): PlaceOption[] {
   const out: PlaceOption[] = [];
   const seen = new Set<string>();
   const add = (value: string, label: string) => {
@@ -335,7 +318,7 @@ export function caseFilePlaces(session: PsSession, labels: Record<string, string
     const value = `task:${proposal.taskId}`;
     add(value, `Task: ${labels[value] ?? proposal.title}`);
   }
-  add('new', `New project: ${composeCaseFile(session)?.title ?? 'the case file'}`);
+  add('new', `New project: ${newTitle}`);
   return out;
 }
 
@@ -504,7 +487,7 @@ async function renderSession(canvas: HTMLElement, id: string): Promise<void> {
     createReview: (edits) => bridge.createReview(session, edits),
     dismissReview: () => confirmed('dismiss_review', {}),
     places: (s) => placesFor(s),
-    writeCaseFile: (offer, choice) => writeCaseFile(offer, choice),
+    writeCaseFile: (offer, choice) => writeCaseFile(offer as PsCaseFileOffer, choice),
     dismissCaseFile: (key) => confirmed('dismiss_case_file', { key })
   }, { fallbackFocus: () => coach.el.querySelector('textarea') });
   const coach = mountCoachPanel({ onSay: (text) => void act('say', text), onAction: (action) => void act(action) }, { cards: cards.el });
````

- [ ] **Step 3: Run Problem Solver's client tests**

Run: `cd apps/tasks && npx vitest run tests/unit/problem-solver`
Expected: PASS, unchanged.

- [ ] **Step 4: Commit**

```bash
git add apps/tasks/src/views/problem-solver/ apps/tasks/src/views/page-editor.ts
git commit -m "Problem Solver's client takes a tool's API, look, origin, record and chips

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The Decision Book glyphs and the provenance images

**Files:**
- Create: `packages/decision-book/glyphs.ts`, `scripts/generate-decision-book-provenance.mjs`, and `apps/tasks/public/decision-book/provenance/*.svg` (52, generated)

- [ ] **Step 1: Create the glyph module**

It inlines the kit's emblems at build with `import.meta.glob` (`?raw`), as Problem Solver's `glyphs.ts` does, and wraps them so a label is said once.

**Create `packages/decision-book/glyphs.ts`:**

````ts
// packages/decision-book/glyphs.ts
// The kit's approved emblems as markup: one per catalogue model, the four sections and the
// book. Vite inlines them at build (`?raw`), as Problem Solver's glyphs.ts does. Every string is
// a static asset from this package, never user text.
import { SECTIONS } from './catalogue.mjs';
import bookEmblemSvg from './glyphs/identity/book-emblem.svg?raw';

const byName = (files: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(files).map(([path, svg]) => [path.slice(path.lastIndexOf('/') + 1, -4), svg]));

/** Model id → emblem markup (viewBox 140). */
export const MODEL_SVG: Record<string, string> = byName(import.meta.glob('./glyphs/models/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>);
/** Section key → emblem markup (viewBox 240). */
export const SECTION_SVG: Record<string, string> = byName(import.meta.glob('./glyphs/sections/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>);
export const BOOK_SVG: string = bookEmblemSvg;

/** The section key for a section number (1–4). */
export const sectionKey = (n: number): string | null => SECTIONS.find((s) => s.id === n)?.key ?? null;

function holder(className: string, markup: string, label: string | null): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = className;
  span.innerHTML = markup;
  const svg = span.querySelector('svg');
  if (label) {
    span.setAttribute('role', 'img');
    span.setAttribute('aria-label', label);
  } else span.setAttribute('aria-hidden', 'true');
  // The wrapper names it (or hides it); the inner SVG's own role and title would say it twice.
  svg?.removeAttribute('role');
  svg?.removeAttribute('aria-label');
  svg?.removeAttribute('aria-labelledby');
  svg?.querySelector('title')?.remove();
  svg?.querySelector('desc')?.remove();
  return span;
}

/** A model's emblem, decorative unless `label` is given. Unknown ids get the book emblem. */
export function modelEmblem(id: string, label: string | null = null): HTMLSpanElement {
  return holder('dm-emblem', MODEL_SVG[id] ?? BOOK_SVG, label);
}

/** A section's emblem by key. */
export function sectionEmblem(key: string, label: string | null = null): HTMLSpanElement {
  return holder('dm-emblem dm-emblem--section', SECTION_SVG[key] ?? '', label);
}

export function bookEmblem(label: string | null = null): HTMLSpanElement {
  return holder('dm-emblem dm-emblem--book', BOOK_SVG, label);
}
````

- [ ] **Step 2: Create the generator**

**Create `scripts/generate-decision-book-provenance.mjs`:**

````js
#!/usr/bin/env node
// scripts/generate-decision-book-provenance.mjs
// The provenance graphics a decision record's image block shows: for every catalogue model, its
// emblem on a paper disc, with its section's emblem as a badge at the lower right. Written to the Tasks
// build's static files (apps/tasks/public/decision-book/provenance/<model>.svg), so a page keeps
// a stable address for them. Run after changing an emblem; a unit test fails if they drift.
//   node scripts/generate-decision-book-provenance.mjs          write the files
//   node scripts/generate-decision-book-provenance.mjs --check  exit 1 if any differs
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { CATALOGUE, SECTIONS } from '../packages/decision-book/catalogue.mjs';

const root = new URL('../', import.meta.url);
const glyphs = new URL('packages/decision-book/glyphs/', root);
export const PROVENANCE_DIR = new URL('apps/tasks/public/decision-book/provenance/', root);

const esc = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** An emblem's drawing without its outer svg, title or description. */
const inner = (svg) => svg.replace(/^\s*<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<title[^>]*>.*?<\/title>/s, '').replace(/<desc[^>]*>.*?<\/desc>/s, '');

/** The composite for one catalogue entry. */
export function provenanceSvg(entry, sectionSvg, modelSvg) {
  const section = SECTIONS.find((s) => s.id === entry.section);
  const label = `${entry.title}, from ${section.title}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title><circle cx="112" cy="112" r="104" fill="#faf8ef" stroke="#171813" stroke-width="2"/><svg x="22" y="22" width="180" height="180" viewBox="0 0 140 140">${inner(modelSvg)}</svg><circle cx="190" cy="190" r="46" fill="#faf8ef"/><svg x="146" y="146" width="88" height="88" viewBox="0 0 240 240">${inner(sectionSvg)}</svg></svg>\n`;
}

/** File name → contents for every catalogue model. */
export async function provenanceFiles() {
  const out = {};
  for (const entry of CATALOGUE) {
    const key = SECTIONS.find((s) => s.id === entry.section).key;
    const sectionSvg = await readFile(new URL(`sections/${key}.svg`, glyphs), 'utf8');
    const modelSvg = await readFile(new URL(`models/${entry.id}.svg`, glyphs), 'utf8');
    out[`${entry.id}.svg`] = provenanceSvg(entry, sectionSvg, modelSvg);
  }
  return out;
}

async function main() {
  const files = await provenanceFiles();
  if (process.argv.includes('--check')) {
    const have = (await readdir(PROVENANCE_DIR).catch(() => [])).sort();
    const differs = [];
    for (const [name, text] of Object.entries(files)) {
      const current = await readFile(new URL(name, PROVENANCE_DIR), 'utf8').catch(() => null);
      if (current !== text) differs.push(name);
    }
    const extra = have.filter((name) => !files[name]);
    if (differs.length || extra.length) {
      console.error(`Provenance graphics are out of date: ${[...differs, ...extra].join(', ')}. Run node scripts/generate-decision-book-provenance.mjs`);
      process.exit(1);
    }
    return;
  }
  await rm(PROVENANCE_DIR, { recursive: true, force: true });
  await mkdir(PROVENANCE_DIR, { recursive: true });
  for (const [name, text] of Object.entries(files)) await writeFile(new URL(name, PROVENANCE_DIR), text);
  console.log(`Wrote ${Object.keys(files).length} provenance graphics.`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
````

- [ ] **Step 3: Generate the images and check them**

Run: `node scripts/generate-decision-book-provenance.mjs && node scripts/generate-decision-book-provenance.mjs --check`
Expected: `Wrote 52 provenance graphics.`, and the check exits 0.

- [ ] **Step 4: Commit**

```bash
git add packages/decision-book/glyphs.ts scripts/generate-decision-book-provenance.mjs apps/tasks/public/decision-book/provenance/
git commit -m "Decision Maker: emblem markup and the provenance images a record shows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The Decision Maker pages

**Files:**
- Create: `apps/tasks/src/views/decision-book/decor.ts`, `canvas.ts`, `record-blocks.ts`, `view.ts`, `decision-book-view.css`
- Modify: `apps/tasks/src/shell/shell.ts`, `apps/tasks/src/shell/icons.ts`, `apps/tasks/src/app/main.ts`, `apps/tasks/scripts/mock-api.ts`

- [ ] **Step 1: Create the decor**

This holds the shape board, medal, track, compass, avatar and the coach look, plus `toolNamed` and `plainName`.

**Create `apps/tasks/src/views/decision-book/decor.ts`:**

````ts
// apps/tasks/src/views/decision-book/decor.ts
/**
 * Decision Maker's shapes, after the book's cover: a red disc that turns back, a green disc that
 * goes forward, and the dotted line between. The shape board, the decision medal, the track,
 * the section compass and the coach avatar. They sit in Problem Solver's layout classes (ps-loom,
 * ps-track) so the two tools read as a set; the shapes and colours are Decision Maker's own.
 * Every string here is static markup; user text is always set with textContent elsewhere.
 */
import { el } from '@/views/hub-kit';
import { TOOLS } from '../../../../../packages/problem-solver/tools/index.mjs';
import { COMPASS, parseCompass } from '../../../../../packages/decision-book/compass.mjs';
import { SECTIONS } from '../../../../../packages/decision-book/catalogue.mjs';
import { RECORD_ID } from '../../../../../packages/decision-book/record-slots.mjs';
import { MODEL_SVG, modelEmblem, sectionEmblem } from '../../../../../packages/decision-book/glyphs';
import type { PsSession } from '../../../../../packages/problem-solver/types';
import type { CoachLook } from '../problem-solver/coach-panel';
import { reducedMotion } from '../problem-solver/decor';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A registered tool by id (Decision Maker's ids are strings the toolkit's id type does not list). */
export const toolNamed = (id: string): { name: string; when: string } | undefined => (TOOLS as Record<string, { name: string; when: string }>)[id];

/** A model's name for a label: without its leading "The", starting with a capital ("Project portfolio matrix"). */
export function plainName(id: string): string {
  const name = (toolNamed(id)?.name ?? id).replace(/^The /, '');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function svg(viewBox: string, markup: string, className?: string): SVGSVGElement {
  const node = document.createElementNS(SVG_NS, 'svg');
  node.setAttribute('viewBox', viewBox);
  node.setAttribute('aria-hidden', 'true');
  if (className) node.setAttribute('class', className);
  node.innerHTML = markup;
  return node;
}

/** The cover's two marks: the red disc with its turning-back chevron, the green disc with its forward arrow. */
export const BACK_DISC = '<circle cx="50" cy="50" r="46" fill="var(--dm-red)"/><path d="M68 30H46L28 50L46 70H68V61H50L40 50L50 39H68Z" fill="var(--dm-ink)"/>';
export const FORWARD_DISC = '<circle cx="50" cy="50" r="46" fill="var(--dm-green)"/><path d="M20 41H54L48 28L82 50L48 72L54 59H20L27 50Z" fill="var(--dm-ink)"/>';
const PAIR = '<circle cx="27" cy="50" r="23" fill="var(--dm-red)"/><circle cx="73" cy="50" r="23" fill="var(--dm-green)"/><path d="M50 2V98" stroke="var(--dm-ink)" stroke-width="3" stroke-dasharray="5 4"/>';
const RING = '<circle cx="50" cy="50" r="46" fill="var(--dm-green)"/><circle cx="50" cy="50" r="20" fill="var(--dm-paper)"/>';

/* ── Shape board ────────────────────────────────────────────────────── */

const SHAPES: Array<(a: string, b: string) => string> = [
  () => BACK_DISC,
  () => FORWARD_DISC,
  () => '<path d="M50 6A44 44 0 0 0 50 94Z" fill="var(--dm-red)"/><path d="M50 6A44 44 0 0 1 50 94Z" fill="var(--dm-green)"/><path d="M50 2V98" stroke="var(--dm-ink)" stroke-width="3" stroke-dasharray="4 4"/>',
  (a) => `<path d="M8 40H60L52 22L94 50L52 78L60 60H8L16 50Z" fill="${a}"/>`,
  (a) => `<circle cx="50" cy="50" r="44" fill="${a}"/><path d="M45 92V60L24 34L18 40L16 18L38 20L32 26L50 48L68 26L62 20L84 18L82 40L76 34L55 60V92Z" fill="var(--dm-paper)"/>`,
  () => '<circle cx="34" cy="50" r="30" fill="var(--dm-red)"/><circle cx="66" cy="50" r="30" fill="var(--dm-green)"/><path d="M16 44H62V32L84 50L62 68V56H16Z" fill="var(--dm-ink)"/>',
  (a) => `<path d="M76 24A37 37 0 1 0 87 50" fill="none" stroke="${a}" stroke-width="14"/><path d="M74 54L87 34L100 54Z" fill="var(--dm-ink)"/>`,
  (a, b) => `<circle cx="24" cy="50" r="16" fill="${a}"/><circle cx="76" cy="50" r="16" fill="${b}"/><path d="M42 50H60" stroke="var(--dm-ink)" stroke-width="3" stroke-dasharray="3 4"/><path d="M58 42L66 50L58 58Z" fill="var(--dm-ink)"/>`
];
const DISCS = ['var(--dm-red)', 'var(--dm-green)'];
const pick = (n: number) => Math.floor(Math.random() * n);

function tileMarkup(): string {
  const a = pick(2);
  return SHAPES[pick(SHAPES.length)](DISCS[a], DISCS[1 - a]);
}

export type ShapeBoard = { el: HTMLElement; nudge(): void };

/** A 4×3 board of cover shapes, in Problem Solver's place. Tiles drop in, then one swaps every couple of seconds. */
export function createShapeBoard(): ShapeBoard {
  const wrap = el('div', 'ps-loom dm-loom');
  wrap.setAttribute('aria-hidden', 'true');
  const board = svg('0 0 400 300', '');
  const tiles: SVGGElement[] = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const cell = document.createElementNS(SVG_NS, 'g');
      cell.setAttribute('transform', `translate(${col * 100} ${row * 100})`);
      cell.innerHTML = `<rect x="4" y="4" width="92" height="92" rx="${(row + col) % 3 === 0 ? 46 : 18}" class="ps-loom__cell"/><g class="ps-loom__tile"></g>`;
      board.append(cell);
      tiles.push(cell.lastElementChild as SVGGElement);
    }
  }
  wrap.append(board);
  const paint = (tile: SVGGElement, delay = 0) => {
    tile.innerHTML = tileMarkup();
    tile.style.animationDelay = `${delay}ms`;
    tile.classList.remove('is-leaving', 'is-entering');
    void tile.getBoundingClientRect();
    tile.classList.add('is-entering');
  };
  tiles.forEach((tile, i) => paint(tile, i * 110));
  const swap = () => {
    const tile = tiles[pick(tiles.length)];
    tile.style.animationDelay = '0ms';
    tile.classList.remove('is-entering');
    tile.classList.add('is-leaving');
    setTimeout(() => paint(tile), 300);
  };
  let last = 0;
  if (!reducedMotion()) {
    const timer = setInterval(() => {
      if (!wrap.isConnected) {
        clearInterval(timer);
        return;
      }
      if (!document.hidden) swap();
    }, 1700);
  }
  return {
    el: wrap,
    nudge() {
      const now = Date.now();
      if (reducedMotion() || now - last < 260) return;
      last = now;
      swap();
    }
  };
}

/* ── Decision medal ─────────────────────────────────────────────────── */

/**
 * The cover, built as the session moves: the red disc fills with the decision, the green disc
 * with the compass answer, the dotted line and both arrows arrive with what is known, and the
 * main model's emblem sits in the middle once there is one.
 */
export function decisionMedal(frame: number, model: string | null): SVGSVGElement {
  const ghost = 'var(--dm-ghost)';
  const red = frame >= 1 ? 'var(--dm-red)' : ghost;
  const green = frame >= 2 ? 'var(--dm-green)' : ghost;
  const known = frame >= 3;
  const marks = known
    ? '<path class="dm-medal__piece" d="M36 37H27L19 50L27 63H36V57H29L25 50L29 43H36Z" fill="var(--dm-ink)"/><path class="dm-medal__piece" d="M62 46H76L73 40L88 50L73 60L76 54H62L65 50Z" fill="var(--dm-ink)"/>'
    : '';
  const line = `<path d="M50 4V96" stroke="${known ? 'var(--dm-ink)' : ghost}" stroke-width="1.6" stroke-dasharray="3 3"/>`;
  const emblem = model ? MODEL_SVG[model] : null;
  const core = emblem
    ? `<circle cx="50" cy="50" r="21" fill="var(--ps-card)"/><g class="dm-medal__piece dm-medal__model">${emblem.replace('<svg ', '<svg x="33" y="33" width="34" height="34" ')}</g>`
    : '';
  return svg('0 0 100 100', `<circle class="dm-medal__piece" cx="27" cy="50" r="23" fill="${red}"/><circle class="dm-medal__piece" cx="73" cy="50" r="23" fill="${green}"/>${line}${marks}${core}`, 'dm-medal');
}

/* ── Track ──────────────────────────────────────────────────────────── */

const STATIONS: Array<{ name: string; mark: string }> = [
  { name: 'Frame', mark: PAIR },
  { name: 'Explore', mark: RING },
  { name: 'Decide', mark: FORWARD_DISC },
  { name: 'Review', mark: BACK_DISC }
];

/** "21 Jan" for a YYYY-MM-DD date. */
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

/** Where the session is (0 Frame … 3 Review, 4 finished) and each station's state and note. */
export function trackStations(session: PsSession): { at: number; stations: Array<{ name: string; state: 'done' | 'now' | 'waiting' | 'future'; note: string }> } {
  const order = ['frame', 'explore', 'decide', 'review'];
  const at = session.phase === 'finished' ? 4 : Math.max(0, order.indexOf(session.phase));
  const active = (step: string) => {
    const runs = session.steps?.[step]?.runs ?? [];
    return runs.find((run) => run.status === 'active') ?? runs.filter((run) => run.status !== 'switched').at(-1) ?? null;
  };
  const explored = (session.steps?.explore?.runs ?? []).filter((run) => run.status !== 'switched' && run.nodes.length).length;
  const waiting = session.reviewState?.status === 'waiting';
  const due = session.reviewState?.due ?? session.reviewProposal?.due ?? null;
  const notes = [
    at === 0 ? `Question ${Math.min(Object.keys(session.frame ?? {}).length + 1, 3)} of 3` : 'Done',
    at === 1 ? (active('explore') ? plainName(active('explore')!.tool) : 'Pick a model') : explored ? `${explored} ${explored === 1 ? 'model' : 'models'}` : '',
    at === 2 ? ((active('decide')?.tool as string | undefined) === RECORD_ID ? 'The record' : 'Settle it') : at > 2 ? 'Settled' : '',
    waiting && due ? `Due ${shortDate(due)}` : at === 3 ? 'Reviewing' : session.reviewState?.status === 'done' ? 'Done' : due ? `Due ${shortDate(due)}` : ''
  ];
  const stations = STATIONS.map((station, i) => {
    const state = i === 3 && waiting ? 'waiting' : i === at ? 'now' : i < at ? 'done' : 'future';
    return { name: station.name, state: state as 'done' | 'now' | 'waiting' | 'future', note: notes[i] };
  });
  return { at, stations };
}

export type TrackView = { el: HTMLElement; update(session: PsSession): void };

/** Round stations for Frame, Explore, Decide and Review, joined by a dotted line. */
export function createTrack(): TrackView {
  const nav = el('nav', 'ps-track dm-track');
  nav.setAttribute('aria-label', 'Process');
  const list = el('ol', 'ps-track__line dm-track__line');
  nav.append(list);
  let key = '';
  return {
    el: nav,
    update(session) {
      const { at, stations } = trackStations(session);
      const next = JSON.stringify(stations);
      if (next === key) return;
      key = next;
      list.style.setProperty('--ps-track-p', String(Math.min(at, 3) / 3));
      list.replaceChildren(...stations.map((station, i) => {
        const item = el('li', 'ps-track__stn dm-track__stn');
        item.dataset.state = station.state;
        if (station.state === 'now') item.setAttribute('aria-current', 'step');
        const mark = el('span', 'ps-track__mark dm-track__mark');
        mark.append(svg('0 0 100 100', STATIONS[i].mark));
        item.append(mark, el('span', 'ps-track__name', station.name), el('small', 'dm-track__note', station.note));
        return item;
      }));
    }
  };
}

/* ── Section compass ────────────────────────────────────────────────── */

/** One line per lit quadrant: what it means for this decision. */
const COMPASS_LINES: Record<string, string> = {
  self_understand: 'The decision is about you, and you want to see what you really want.',
  self_improve: 'The decision is about you, and you want to change how you act.',
  others_understand: 'The decision involves other people, and you want to see how they think.',
  others_improve: 'The decision involves other people, and you want to help them change.'
};

/** The section key each compass quadrant draws its emblem from. */
const sectionOf = (quadrant: string) => SECTIONS.find((s) => s.compass === quadrant)?.key ?? '';

export type CompassView = { el: HTMLElement; update(session: PsSession): void };

/**
 * The four section emblems in a 2×2 above the canvas: rows are who (you, others), columns the
 * aim (understand, improve). The lit quadrant is ringed and the rest fade; hidden until the
 * compass question is answered.
 */
export function createCompass(): CompassView {
  const box = el('section', 'dm-compass');
  box.setAttribute('aria-label', 'Section compass');
  box.hidden = true;
  const grid = el('div', 'dm-compass__grid');
  const cells = new Map<string, HTMLElement>();
  for (const who of ['self', 'others']) {
    for (const aim of ['understand', 'improve']) {
      const quadrant = COMPASS.find((q) => q.who === who && q.aim === aim)!;
      const cell = el('span', 'dm-compass__q');
      cell.title = quadrant.label;
      cell.append(sectionEmblem(sectionOf(quadrant.id)));
      cells.set(quadrant.id, cell);
      grid.append(cell);
    }
  }
  const text = el('p', 'dm-compass__text');
  box.append(grid, text);
  let key = '';
  return {
    el: box,
    update(session) {
      const lit: string[] = parseCompass(session.frame?.compass ?? '');
      const next = lit.join('+');
      if (next === key) return;
      key = next;
      box.hidden = !lit.length;
      for (const [id, cell] of cells) cell.dataset.lit = String(lit.includes(id));
      text.replaceChildren(...lit.flatMap((id, i) => {
        const quadrant = COMPASS.find((q) => q.id === id)!;
        return [...(i ? [document.createTextNode(' ')] : []), el('b', '', `${quadrant.label}.`), document.createTextNode(` ${COMPASS_LINES[id]}`)];
      }));
      box.setAttribute('aria-label', `Section compass: ${lit.map((id) => COMPASS.find((q) => q.id === id)!.label).join(' and ')}`);
    }
  };
}

/* ── Coach ──────────────────────────────────────────────────────────── */

/** The red and green discs overlapping, with an arrow through them. */
export function dmAvatar(): HTMLSpanElement {
  const span = el('span', 'ps-avatar dm-avatar');
  span.append(svg('0 0 100 100', '<circle cx="32" cy="58" r="28" fill="var(--dm-red)"/><circle cx="68" cy="42" r="28" fill="var(--dm-green)"/><path d="M30 52H64V42L86 56L64 70V60H30Z" fill="var(--dm-ink)"/>'));
  return span;
}

/** The decision record's mark: the forward disc. */
function recordMark(): HTMLSpanElement {
  const span = el('span', 'dm-emblem');
  span.setAttribute('aria-hidden', 'true');
  span.append(svg('0 0 100 100', FORWARD_DISC));
  return span;
}

/** How the shared coach panel looks in Decision Maker. */
export const DM_LOOK: CoachLook = {
  avatar: dmAvatar,
  emblem: (tool) => (tool === RECORD_ID ? recordMark() : modelEmblem(tool)),
  frames: {
    decision: {
      keys: ['decision', 'compass', 'known'],
      prompts: ['What are you deciding?', 'Who is it about, and what do you want?', 'What do you already know?']
    }
  },
  noun: 'Decision'
};
````

- [ ] **Step 2: Create the canvas**

**Create `apps/tasks/src/views/decision-book/canvas.ts`:**

````ts
// apps/tasks/src/views/decision-book/canvas.ts
/**
 * Decision Maker's canvas: the chart for the run in hand, drawn by the family renderer the
 * canvas map picks (createChartForRun), with a strip of every model run kept on the record.
 * Pressing a run in the strip shows its chart until Back to now. The decision record gets the
 * Explore nodes each reason rests on (setBasis); charts that make tasks get their live statuses.
 */
import { el } from '@/views/hub-kit';
import { createChartForRun, type RunChart } from '../../../../../packages/decision-book/render/charts';
import type { RecordView } from '../../../../../packages/decision-book/render/record';
import { RECORD_ID } from '../../../../../packages/decision-book/record-slots.mjs';
import { basisOf } from '../../../../../packages/decision-book/record.mjs';
import { bookEmblem } from '../../../../../packages/decision-book/glyphs';
import type { PsSession, PsTaskLink, PsToolRun } from '../../../../../packages/problem-solver/types';
import { DM_LOOK, plainName, toolNamed } from './decor';

export type DmRunScores = Record<string, unknown> & { runId: string };
type Chart = RunChart & { onScore?(cb: (scores: Record<string, unknown>) => void): void; setTasks?(links: PsTaskLink[]): void; setProposed?(nodeIds: string[]): void };

const STEP_ORDER = ['explore', 'decide', 'review'];

/** Every run in step order, switched ones included (they stay on the record). */
export function runsInOrder(session: PsSession): PsToolRun[] {
  return STEP_ORDER.flatMap((step) => session.steps?.[step]?.runs ?? []);
}

/** The run in hand: the current step's active run, else its latest kept one, else the latest kept run. */
export function shownRun(session: PsSession): PsToolRun | null {
  const here = session.steps?.[session.phase]?.runs ?? [];
  const kept = (runs: PsToolRun[]) => runs.filter((run) => run.status !== 'switched');
  return here.find((run) => run.status === 'active') ?? kept(here).at(-1) ?? kept(runsInOrder(session)).at(-1) ?? null;
}


function countLine(run: PsToolRun): string {
  const placed = run.nodes.length;
  const contested = run.nodes.filter((node) => node.state === 'contested').length;
  const state = run.status === 'switched' ? ' · switched away' : '';
  return `${placed} placed${contested ? ` · ${contested} contested` : ''}${state}`;
}

export function mountDecisionCanvas(host: HTMLElement, handlers: { onScore?: (scores: DmRunScores) => void } = {}) {
  const charts = new Map<string, Chart>();
  let last: PsSession | null = null;
  let pinned: string | null = null;
  let displayed: string | null = null;
  let statuses: Record<string, string> = {};

  const empty = el('div', 'dm-canvas__empty');
  empty.append(bookEmblem(), el('p', '', 'Answer the three questions. The coach then suggests a model from the book, and its chart builds here as you answer.'));

  function chartFor(run: PsToolRun): Chart | null {
    let chart = charts.get(run.id);
    if (!chart) {
      const made = createChartForRun(run) as Chart | null;
      if (!made) return null;
      chart = made;
      const runId = run.id;
      chart.onScore?.((scores) => {
        if (displayed === runId) handlers.onScore?.({ ...scores, runId });
      });
      charts.set(run.id, chart);
    }
    return chart;
  }

  /** The chart on screen gets its confirmed tasks (live status) and the proposals still waiting. */
  function pushTasks(): void {
    if (!last || !displayed) return;
    const chart = charts.get(displayed);
    if (!chart?.setTasks) return;
    const runId = displayed;
    const links = (last.proposedTasks ?? [])
      .filter((p) => p.taskId && p.source.runId === runId && (p.status === 'confirmed' || (p.status === 'dismissed' && p.removed)))
      .map((p) => ({ nodeId: p.source.nodeId, taskId: p.taskId!, status: p.status === 'dismissed' ? 'removed' : statuses[p.taskId!] ?? 'unknown' }));
    chart.setTasks(links);
    chart.setProposed?.((last.proposedTasks ?? []).filter((p) => p.status === 'proposed' && p.source.runId === runId).map((p) => p.source.nodeId));
  }

  function strip(session: PsSession, current: PsToolRun): HTMLElement | null {
    const runs = runsInOrder(session).filter((run) => run.nodes.length || run.id === current.id);
    if (runs.length < 2) return null;
    const list = el('ul', 'dm-canvas__strip');
    list.setAttribute('aria-label', 'Models on the record');
    for (const run of runs) {
      const item = el('li', '');
      const button = el('button', 'dm-canvas__run') as HTMLButtonElement;
      button.type = 'button';
      button.setAttribute('aria-pressed', String(run.id === current.id));
      if (run.status === 'switched') button.classList.add('is-switched');
      button.append(DM_LOOK.emblem(run.tool), el('span', '', plainName(run.tool)));
      button.addEventListener('click', () => {
        pinned = run.id === shownRun(session)?.id ? null : run.id;
        render();
      });
      item.append(button);
      list.append(item);
    }
    return list;
  }

  function render(): void {
    const session = last!;
    const live = pinned ? runsInOrder(session).find((run) => run.id === pinned) ?? null : null;
    if (pinned && !live) pinned = null;
    const run = live ?? shownRun(session);
    if (!run) {
      displayed = null;
      if (empty.parentNode !== host || host.childElementCount !== 1) host.replaceChildren(empty);
      return;
    }
    const heading = el('h2', 'ps-canvas__title dm-canvas__title');
    heading.append(DM_LOOK.emblem(run.tool), el('span', 'dm-canvas__name', toolNamed(run.tool)?.name ?? run.tool), el('span', 'dm-canvas__count', countLine(run)));
    if (pinned) {
      const back = el('button', 'btn btn--ghost dm-canvas__back', 'Back to now') as HTMLButtonElement;
      back.type = 'button';
      back.addEventListener('click', () => {
        pinned = null;
        render();
      });
      heading.append(back);
    }
    const holder = el('div', 'ps-canvas__chart dm-canvas__chart');
    const chart = chartFor(run);
    if (chart) {
      chart.update(run as never);
      if ((run.tool as string) === RECORD_ID) (chart as unknown as RecordView).setBasis(basisOf(session));
      holder.append(chart.el);
    } else holder.append(el('p', 'dm-canvas__none', 'This model has no chart yet.'));
    const parts: HTMLElement[] = [heading, holder];
    const runs = strip(session, run);
    if (runs) parts.push(runs);
    host.replaceChildren(...parts);
    displayed = run.id;
    pushTasks();
  }

  return {
    update(session: PsSession) {
      last = session;
      const live = new Set(runsInOrder(session).map((run) => run.id));
      for (const [runId, chart] of charts) {
        if (live.has(runId)) continue;
        chart.destroy?.();
        charts.delete(runId);
      }
      render();
    },
    /** The page fetched live statuses for the session's confirmed tasks. */
    setTaskStatuses(next: Record<string, string>) {
      statuses = next;
      pushTasks();
    },
    destroy() {
      for (const chart of charts.values()) chart.destroy?.();
      charts.clear();
    }
  };
}
````

- [ ] **Step 3: Create the record's page blocks**

**Create `apps/tasks/src/views/decision-book/record-blocks.ts`:**

````ts
// apps/tasks/src/views/decision-book/record-blocks.ts
// The decision record as page blocks: a heading, one rich text block per section, and the
// provenance caption with a link back to the decision. The provenance graphic is its own image
// block (the main model's emblem inside its section's), written above the heading on a full
// write; its source is a static file the Tasks build serves (public/decision-book/provenance/).
// The caption and the link back go in the rich text block at the end, not on the image.
// Ids are fixed per session and version, so a retried append never duplicates a block.
import { createBlock } from '@teaching/blocks/create-block';
import type { Block } from '@/schemas/block';
import { reviseName } from '../../../../../packages/problem-solver/naming.mjs';
import { toolNamed } from './decor';
import type { PsRecordOffer } from '../../../../../packages/problem-solver/types';

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function recordBlockId(sessionId: string, version: number, n: number): string {
  return `dm-rec-${sessionId.slice(0, 8)}-v${version}-${n}`;
}

/** The provenance image's address: absolute, since an image block only shows http(s) sources. */
export function provenanceUrl(model: string, origin = location.origin, base = import.meta.env.BASE_URL): string {
  return new URL(`${base}decision-book/provenance/${model}.svg`, origin).href;
}

/** The record's text blocks: a full record on a write, only the changed sections on an update. */
export function recordBlocks(offer: PsRecordOffer, opts: { sessionId: string; date: string }): Block[] {
  let n = 0;
  const id = () => recordBlockId(opts.sessionId, offer.version, (n += 1));
  const heading = (text: string, variant: 'section' | 'subsection'): Block => {
    const block = createBlock('heading', id()) as Extract<Block, { block_type: 'heading' }>;
    return { ...block, variant, content: { text } };
  };
  const rich = (html: string): Block => {
    const block = createBlock('rich_text', id()) as Extract<Block, { block_type: 'rich_text' }>;
    return { ...block, content: { html } };
  };
  const write = offer.kind === 'write';
  const title = write ? offer.file.title : `Update: ${reviseName(offer.file.title, { version: offer.version, date: opts.date })}`;
  const sections = offer.file.sections.filter((s) => write || offer.changed.includes(s.key));
  const back = `<a href="#/decision-maker?id=${encodeURIComponent(opts.sessionId)}">Open this decision in Decision Maker</a>`;
  return [
    heading(title, write ? 'section' : 'subsection'),
    ...sections.map((s) => rich(`<p><strong>${esc(s.heading)}</strong></p>${s.lines.length === 1 ? `<p>${esc(s.lines[0])}</p>` : `<ul>${s.lines.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>`}`)),
    rich(`<p><em>${esc(offer.provenance.caption)}</em></p><p>${back}</p>`)
  ];
}

/** The provenance image block, or null when the record has no main model to show. */
export function recordGraphic(offer: PsRecordOffer, opts: { sessionId: string; date: string }, url: (model: string) => string = provenanceUrl): Block | null {
  const model = offer.provenance.model;
  if (!model) return null;
  const block = createBlock('image', recordBlockId(opts.sessionId, offer.version, 0)) as Extract<Block, { block_type: 'image' }>;
  return { ...block, variant: 'small', content: { url: url(model), alt_text: `${toolNamed(model)?.name ?? 'The Decision Book'} emblem, inside its section's emblem` } };
}
````

- [ ] **Step 4: Create the view**

**Create `apps/tasks/src/views/decision-book/view.ts`:**

````ts
// apps/tasks/src/views/decision-book/view.ts
// Decision Maker in the Tasks hub (#/decision-maker): the landing page (hero, New decision,
// Quick decision, decisions, the four sections, the shared skills ribbon) and the session page
// (track, compass above the canvas, coach, skill tray, review panel, task and record cards).
// Its structure is Problem Solver's: the coach panel, task cards, bridges, review panel and
// syncs are Problem Solver's own components, given Decision Maker's API, look and record.
import '../../../../../packages/problem-solver/problem-solver.css';
import '../../../../../packages/decision-book/decision-book.css';
import '../problem-solver/problem-solver-view.css';
import './decision-book-view.css';
import { el } from '@/views/hub-kit';
import { hashQuery } from '@/shell/shell';
import { errorMessage, renderLoadError } from '@/views/feedback';
import { tasksApi } from '@/services/client-api';
import { onTasksChanged, onTasksDeleted } from '@/services/task-cache';
import { formatDisplayDate } from '../../../design-kit/js/format-display-date.js';
import { skillGlyph } from '../../../../../packages/problem-solver/glyphs';
import { planStepForBook, stepName } from '../../../../../packages/problem-solver/steps.mjs';
import { reviewStart, waitingForReview } from '../../../../../packages/problem-solver/review.mjs';
import type { PsAction, PsRecordOffer, PsSession, PsSummary } from '../../../../../packages/problem-solver/types';
import { SECTIONS, modelsInSection } from '../../../../../packages/decision-book/catalogue.mjs';
import { composeRecord, recordOffer } from '../../../../../packages/decision-book/record.mjs';
import { modelEmblem, sectionEmblem } from '../../../../../packages/decision-book/glyphs';
import { decisionBookApi, isBusy, pollUntilSettled, problemSolverApi } from '../problem-solver/api';
import { mountCoachPanel } from '../problem-solver/coach-panel';
import { createTaskBridge, type TaskOrigin } from '../problem-solver/task-bridge';
import { mountReviewPanel, reviewBanner, type ReviewEntry } from '../problem-solver/review-panel';
import { createReviewSync } from '../problem-solver/review-sync';
import { compactToday, mountTaskCards, type PlaceOption } from '../problem-solver/task-cards';
import { createCaseFileBridge, type CaseFilePlace, type PaperOffer } from '../problem-solver/case-file-bridge';
import { createSessionSync } from '../problem-solver/session-sync';
import { skillsRibbon } from '../problem-solver/skills-ribbon';
import { caseFilePlaces, createSkillTray, section } from '../problem-solver/view';
import { BACK_DISC, DM_LOOK, FORWARD_DISC, createCompass, createShapeBoard, createTrack, decisionMedal, plainName, toolNamed } from './decor';
import { mountDecisionCanvas, type DmRunScores } from './canvas';
import { recordBlocks, recordGraphic } from './record-blocks';

let poll: AbortController | null = null;
/** The open session's canvas and Tasks listeners, dropped when the page changes. */
let canvasNow: { destroy(): void } | null = null;
let unsubscribeNow: Array<() => void> = [];

const ORIGIN: TaskOrigin = { name: 'Decision Maker', source: 'decision_maker', tag: 'decision-maker', noun: 'decision', review: 'the decision "%s" has worked out, then open it in Decision Maker to compare what you expected with what happened' };

const SVG_NS = 'http://www.w3.org/2000/svg';
function art(markup: string, className?: string): SVGSVGElement {
  const node = document.createElementNS(SVG_NS, 'svg');
  node.setAttribute('viewBox', '0 0 100 100');
  node.setAttribute('aria-hidden', 'true');
  if (className) node.setAttribute('class', className);
  node.innerHTML = markup;
  return node;
}

/* ── Landing ────────────────────────────────────────────────────────── */

const phaseLabel = (row: PsSummary): string =>
  row.phase === 'frame' ? 'Framing' : row.phase === 'finished' ? 'Finished' : row.model ? stepName(row.model, row.phase) : row.phase;
const phaseColour = (phase: string): string => (phase === 'frame' ? 'var(--dm-red)' : phase === 'finished' ? 'var(--dm-ink)' : 'var(--dm-green)');

/** The meta line's middle part: the question being framed, the model in hand, or the review date. */
function metaNote(row: PsSummary): string {
  if (row.phase === 'frame') return `Question ${Math.min((row.frame ?? 0) + 1, 3)} of 3`;
  if (row.reviewDue) return `Review due ${formatDisplayDate(row.reviewDue)}`;
  const model = row.main ?? row.tool;
  return model ? plainName(model) : '';
}

function decisionCard(row: PsSummary, index: number): HTMLLIElement {
  const item = el('li', 'ps-prob dm-prob') as HTMLLIElement;
  item.style.setProperty('--i', String(index));
  const link = el('a', 'ps-prob__link') as HTMLAnchorElement;
  link.href = `#/decision-maker?id=${row.id}`;
  const medal = el('span', 'ps-prob__medal');
  const frame = row.frame ?? (row.phase === 'frame' ? 0 : 3);
  medal.append(decisionMedal(frame, row.main ?? null));
  const body = el('span', 'ps-prob__body');
  const meta = el('span', 'ps-prob__meta');
  const phase = el('span', 'ps-prob__phase', phaseLabel(row));
  phase.style.setProperty('--c', phaseColour(row.phase));
  meta.append(phase, el('span', '', metaNote(row)), el('span', '', formatDisplayDate(row.updatedAt.slice(0, 10))));
  body.append(el('span', 'ps-prob__title', row.title), meta);
  const seen = Object.keys(row.skills ?? {});
  if (seen.length) {
    const glyphs = el('span', 'ps-prob__skills');
    glyphs.append(...seen.slice(0, 6).map((id) => skillGlyph(id)));
    body.append(glyphs);
  }
  link.append(medal, body);
  item.append(link);
  return item;
}

type StartForm = { el: HTMLFormElement; startFrom(model: string): void };

function startForm(onType: () => void): StartForm {
  const start = el('form', 'ps-start dm-start') as HTMLFormElement;
  const input = el('textarea', 'ps-start__input') as HTMLTextAreaElement;
  input.rows = 3;
  input.placeholder = 'What are you deciding, or trying to see clearly? Say it the way you would to a friend.';
  input.setAttribute('aria-label', 'Describe the decision');
  const go = el('button', 'btn btn--primary', 'Start') as HTMLButtonElement;
  go.type = 'submit';
  const status = el('p', 'ps-start__status');
  const picked = el('p', 'dm-start__picked');
  picked.hidden = true;
  const row = el('div', 'ps-start__row');
  row.append(status, go);
  start.append(el('h2', 'ps-start__title', 'New decision'), picked, input, row);
  let startModel: string | null = null;
  input.addEventListener('input', () => {
    start.classList.remove('is-typing');
    void start.offsetWidth;
    start.classList.add('is-typing');
    onType();
  });
  start.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) {
      input.focus();
      return;
    }
    go.disabled = true;
    status.textContent = '';
    try {
      const session = await decisionBookApi.create({ text, kind: 'decision', ...(startModel ? { startModel } : {}) });
      location.hash = `#/decision-maker?id=${session.id}`;
    } catch (err) {
      status.textContent = errorMessage(err);
      go.disabled = false;
    }
  });
  return {
    el: start,
    /** A model picked on the shelf: the decision will open on it once it is framed. */
    startFrom(model: string) {
      startModel = model;
      const clear = el('button', 'dm-start__clear', 'Clear') as HTMLButtonElement;
      clear.type = 'button';
      clear.addEventListener('click', () => {
        startModel = null;
        picked.hidden = true;
        input.focus();
      });
      picked.replaceChildren(modelEmblem(model), el('span', '', `Starting from ${toolNamed(model)?.name ?? model}`), clear);
      picked.hidden = false;
      input.focus();
    }
  };
}

/** The quick route's card. Its flow arrives with the Quick decision plan; until then it says so. */
function quickCard(): HTMLElement {
  const card = el('section', 'ps-lightning-card dm-quick');
  const head = el('div', 'ps-lightning-card__head');
  const mark = el('span', 'dm-quick__mark');
  mark.append(art('<g transform="translate(-2 26) scale(0.52)">' + BACK_DISC + '</g><g transform="translate(50 26) scale(0.52)">' + FORWARD_DISC + '</g>'));
  head.append(mark, el('h2', 'ps-lightning-card__title', 'Quick decision'));
  card.append(head, el('p', 'ps-lightning-card__line', 'A yes/no check and a Stop Rule for everyday calls. Coming soon: for now, start a decision above.'));
  return card;
}

function buildSteps(): HTMLElement {
  const steps: Array<[string, string, string, SVGSVGElement | HTMLElement]> = [
    ['Frame', 'Three questions', 'What you are deciding, who it is about and what you want, and what you already know.',
      art('<circle cx="27" cy="50" r="23" fill="var(--dm-red)"/><circle cx="73" cy="50" r="23" fill="var(--dm-green)"/><path d="M50 4V96" stroke="var(--dm-ink)" stroke-width="2" stroke-dasharray="4 4"/>', 'dm-build__pair')],
    ['Explore', 'The coach picks a model', 'From the book, to fit your question: an Eisenhower matrix for competing demands, a rubber band when you are pulled two ways.', cyclingEmblem()],
    ['Decide', 'Go forward', 'Name the decision, why, what would change your mind, the first step and when to look again.', art(`<g class="dm-go">${FORWARD_DISC}</g>`)],
    ['Review', 'Look back', 'A record on its task or project page, and a review that compares what you expected with what happened.', art(`<g class="dm-turn">${BACK_DISC}</g>`)]
  ];
  const list = el('ol', 'ps-build dm-build');
  steps.forEach(([label, title, detail, drawing], i) => {
    const step = el('li', 'ps-build__step');
    const figure = el('span', 'ps-build__art');
    figure.append(drawing);
    step.append(figure, el('span', 'ps-build__n', `${i + 1} · ${label}`), el('h3', 'ps-build__title', title), el('p', 'ps-build__detail', detail));
    list.append(step);
  });
  return list;
}

function cyclingEmblem(): HTMLElement {
  const holder = el('span', 'ps-build__cycle dm-build__cycle');
  const order = ['dm_eisenhower', 'dm_rubber_band', 'dm_johari', 'dm_rumsfeld', 'dm_team'];
  let i = 0;
  const show = () => {
    const emblem = modelEmblem(order[i % order.length]);
    emblem.querySelector('svg')?.classList.add('ps-pop');
    holder.replaceChildren(emblem);
    i += 1;
  };
  show();
  if (!(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    const timer = setInterval(() => (holder.isConnected ? !document.hidden && show() : clearInterval(timer)), 2400);
  }
  return holder;
}

/** One line per section: what its models are good for. */
const SECTION_LINES: Record<string, string> = {
  improve_yourself: 'Priorities, trade-offs and when to stop weighing.',
  understand_yourself: 'What drives you, drains you and pulls you two ways.',
  understand_others: 'Unknowns, risks and how other people decide.',
  improve_others: 'Teams, roles and leading the people involved.'
};

/**
 * The four sections, each opening its shelf of model emblems with a "use it when" line. A model
 * can start a decision: the New decision box then opens on it once the decision is framed.
 */
function sectionShelves(onStart: (model: string) => void): HTMLElement {
  const wrap = el('div', 'dm-sections');
  for (const s of SECTIONS) {
    const box = el('details', 'dm-sect') as HTMLDetailsElement;
    const summary = el('summary', 'dm-sect__head');
    const text = el('span', 'dm-sect__text');
    const count = modelsInSection(s.id).length;
    text.append(el('span', 'dm-sect__title', s.title), el('span', 'dm-sect__line', `${SECTION_LINES[s.key]} ${count} models.`));
    summary.append(sectionEmblem(s.key), text);
    const shelf = el('ul', 'ps-shelf dm-shelf');
    for (const entry of modelsInSection(s.id)) {
      const tool = toolNamed(entry.id);
      if (!tool) continue;
      const item = el('li', 'ps-shelf__tool dm-shelf__model');
      const use = el('button', 'dm-shelf__start', 'Start from this') as HTMLButtonElement;
      use.type = 'button';
      use.setAttribute('aria-label', `Start a decision from ${tool.name}`);
      use.addEventListener('click', () => onStart(entry.id));
      item.append(modelEmblem(entry.id), el('span', 'ps-shelf__name', plainName(entry.id)), el('span', 'ps-shelf__when', tool.when), use);
      shelf.append(item);
    }
    box.append(summary, shelf);
    wrap.append(box);
  }
  return wrap;
}

async function renderList(canvas: HTMLElement): Promise<void> {
  const page = el('div', 'ps-page ps-landing ps-scope dm-scope dm-page');
  const board = createShapeBoard();
  const hero = el('div', 'ps-hero');
  const copy = el('div', 'ps-hero__copy');
  const start = startForm(() => board.nudge());
  copy.append(
    el('p', 'ps-hero__lede', 'Say what you are weighing. A coach frames it in three questions, picks the models from The Decision Book that fit, and works them with you one answer at a time.'),
    start.el,
    quickCard()
  );
  hero.append(copy, board.el);
  page.append(hero);

  const [sessions, problems] = await Promise.all([
    decisionBookApi.list().then((rows) => rows.filter((item) => item.status !== 'archived')),
    // The shared tally only: a Problem Solver that cannot be reached leaves its share out.
    problemSolverApi.list().catch(() => [] as PsSummary[])
  ]);
  const list = el('ul', 'ps-probs');
  list.append(...sessions.map(decisionCard));
  const fresh = el('li', 'ps-prob ps-prob--new');
  const freshButton = el('button', 'ps-prob__new', '+ New decision') as HTMLButtonElement;
  freshButton.type = 'button';
  const toStart = () => {
    page.querySelector<HTMLTextAreaElement>('.ps-start__input')?.focus();
    page.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  };
  freshButton.addEventListener('click', toStart);
  fresh.append(freshButton);
  list.append(fresh);

  page.append(
    section('Decisions', sessions.length ? 'Each badge is the cover, built as you go: the red disc is the decision, the green disc who it is about, the arrows what you know, and the centre the model it leans on.' : 'Nothing yet. Start with the decision you keep putting off.', list),
    section('How a session builds', 'Frame, then the coach discerns the models that fit. The book is a catalogue, so the coach chooses.', buildSteps()),
    section('The four sections', 'The book’s four parts, as a compass: about you or others, to understand or to improve. Open one to see its models.', sectionShelves((model) => {
      start.startFrom(model);
      toStart();
    })),
    section('Thinking skills you have used', 'Across Decision Maker and Problem Solver. Faint marks have not come up yet.', skillsRibbon({ name: 'Decision Maker', sessions }, { name: 'Problem Solver', sessions: problems }, () => 'var(--dm-ink)'))
  );
  canvas.replaceChildren(page);
}

/* ── Session ────────────────────────────────────────────────────────── */

/** How a review link (`step=review`) enters the decision, or null when it cannot start a review now. */
export function reviewEntry(session: PsSession, wanted: string | null): ReviewEntry | null {
  if (wanted !== 'review') return null;
  const kind = reviewStart(session);
  const step = session.model ? planStepForBook(session.model.id, 'improve') : null;
  return kind && step ? { kind, step } : null;
}

type RecordChoice = { place: CaseFilePlace; title: string; moved?: boolean };

/** The record card's write, run from the latest session at click time (the offer must still be the card's). */
export function latestRecordWriter(latest: () => PsSession, write: (session: PsSession, offer: PsRecordOffer, choice: RecordChoice) => Promise<void>) {
  return async (offer: PaperOffer, choice: RecordChoice) => {
    const session = latest();
    const now = recordOffer(session) as PsRecordOffer | null;
    if (!now || now.key !== offer.key) throw new Error('The decision record changed; check the card again.');
    await write(session, now, choice);
  };
}

function syncFor(initial: PsSession, render: (session: PsSession) => void, alive: () => boolean) {
  return createSessionSync({
    initial,
    render,
    actWith: (s, action, payload) => decisionBookApi.actWith(s, action, payload),
    get: (sessionId) => decisionBookApi.get(sessionId),
    poll: (sessionId, onUpdate) => {
      poll?.abort();
      poll = new AbortController();
      return pollUntilSettled(sessionId, onUpdate, { get: decisionBookApi.get, signal: poll.signal });
    },
    alive
  });
}

async function renderSession(canvas: HTMLElement, id: string): Promise<void> {
  let session = await decisionBookApi.get(id);
  const page = el('div', 'ps-page ps-session ps-scope dm-scope dm-page');
  const back = el('a', 'ps-back', '← Decisions') as HTMLAnchorElement;
  back.href = '#/decision-maker';
  const title = el('h2', 'ps-session__title', session.title);
  const track = createTrack();
  const board = el('div', 'ps-session__board');
  const bench = el('div', 'ps-bench');
  const compass = createCompass();
  const canvasHost = el('div', 'ps-canvas dm-canvas');
  const tray = createSkillTray();
  const review = mountReviewPanel({ start: () => void reviews.startReview() });
  bench.append(review.el, compass.el, canvasHost, tray.el);
  const cards = mountTaskCards({
    create: (proposal, edits) => bridge.create(session, proposal, edits),
    dismiss: (proposal) => confirmed('dismiss_task', { proposalId: proposal.id }),
    createReview: (edits) => bridge.createReview(session, edits),
    dismissReview: () => confirmed('dismiss_review', {}),
    places: (s) => placesFor(s),
    writeCaseFile: (offer, choice) => writeRecord(offer, choice),
    dismissCaseFile: (key) => confirmed('dismiss_case_file', { key })
  }, { fallbackFocus: () => coach.el.querySelector('textarea'), paper: { offer: (s) => recordOffer(s) as PsRecordOffer | null, noun: 'decision record', strictNames: false } });
  const coach = mountCoachPanel({ onSay: (text) => void act('say', text), onAction: (action) => void act(action) }, { cards: cards.el, look: DM_LOOK });
  const coachHost = el('div', 'ps-coach-host');
  coachHost.append(coach.el);
  board.append(bench, coachHost);
  const entry = reviewEntry(session, hashQuery().get('step'));
  const banner = entry && !(entry.kind === 'start' && waitingForReview(session)) ? reviewBanner(entry, () => void reviews.startReview(), stepName(session.model!.id, entry.step), 'decision') : null;
  page.append(back, title, track.el, ...(banner ? [banner] : []), board);
  canvas.replaceChildren(page);
  const diagram = mountDecisionCanvas(canvasHost, { onScore: (scores) => void rescore(scores) });
  canvasNow = diagram;

  const flash = (err: unknown) => {
    coachHost.querySelector('.ps-coach__status--failed.is-transient')?.remove();
    const note = el('p', 'ps-coach__status ps-coach__status--failed is-transient', errorMessage(err));
    coach.el.querySelector('.ps-coach__extras')?.prepend(note);
  };

  const render = (next: PsSession) => {
    session = next;
    if (title.textContent !== session.title) title.textContent = session.title;
    track.update(session);
    compass.update(session);
    diagram.update(session);
    tray.update(session);
    coach.update(session);
    cards.update(session);
    review.update(session);
    reviews.onRender(session);
  };

  const sync = syncFor(session, render, () => page.isConnected);
  const paint = (next: PsSession) => void sync.paint(next);
  const settle = () => sync.settle();
  const confirmed = (action: PsAction, payload: Record<string, unknown>) => sync.confirmed(action, payload);

  /** The linked task's domain if the decision links one, else life; one fetch per session. */
  let domain: Promise<string> | null = null;
  function domainFor(s: PsSession): Promise<string> {
    const linked = s.links.find((link) => link.kind === 'task')?.id;
    if (!linked) return Promise.resolve('life');
    if (!domain) {
      const fetching = tasksApi.getTask(linked).then((task) => task.domain || 'life');
      fetching.catch(() => {
        if (domain === fetching) domain = null;
      });
      domain = fetching;
    }
    return domain;
  }

  const bridge = createTaskBridge({
    createTask: (body) => tasksApi.createTask(body),
    getTask: (taskId) => tasksApi.getTask(taskId),
    domainFor: (s) => domainFor(s),
    confirm: (proposalId, taskId) => confirmed('confirm_task', { proposalId, taskId }),
    dismiss: (proposalId, reason) => confirmed('dismiss_task', { proposalId, ...(reason ? { reason } : {}) }),
    setReview: (taskId, due) => confirmed('set_review_task', { taskId, due }),
    origin: ORIGIN
  });

  async function placesFor(s: PsSession): Promise<PlaceOption[]> {
    const labels: Record<string, string> = {};
    const linked = s.links.filter((link) => link.kind === 'project' || link.kind === 'task');
    await Promise.all(linked.map(async (link) => {
      try {
        const found = link.kind === 'project' ? await tasksApi.getProject(link.id) : await tasksApi.getTask(link.id);
        if (found.title) labels[`${link.kind}:${link.id}`] = found.title;
      } catch {
        /* the fallback label stands */
      }
    }));
    return caseFilePlaces(s, labels, composeRecord(s)?.title ?? 'the decision record');
  }

  const records = createCaseFileBridge({
    createProject: (body) => tasksApi.createProject({ title: body.title, purpose: `Decision record for "${sync.session().title}"` }),
    getProject: (projectId) => tasksApi.getProject(projectId),
    updateProject: (projectId, body) => tasksApi.updateProject(projectId, body),
    getTask: (taskId) => tasksApi.getTask(taskId),
    updateTask: (taskId, body) => tasksApi.updateTask(taskId, body),
    link: (payload) => confirmed('link_case_file', payload),
    today: compactToday,
    blocks: (offer, opts) => recordBlocks(offer as PsRecordOffer, opts),
    graphic: (offer, opts) => recordGraphic(offer as PsRecordOffer, opts)
  });
  const writeRecord = latestRecordWriter(() => sync.session(), (latest, offer, choice) => records.write(latest, offer, choice));

  const reviews = createReviewSync({
    getSession: () => session,
    confirmed,
    settle,
    details: (proposals) => bridge.details(proposals),
    setTaskStatuses: (map) => diagram.setTaskStatuses(map),
    review,
    banner: () => (banner?.isConnected ? banner : null),
    flash,
    alive: () => page.isConnected,
    focusCoach: () => coach.el.querySelector<HTMLTextAreaElement>('textarea')?.focus()
  });
  const onVisible = () => {
    if (document.visibilityState === 'visible') reviews.refreshIfTasks();
  };
  document.addEventListener('visibilitychange', onVisible);
  unsubscribeNow.push(
    onTasksChanged(() => reviews.refreshIfTasks()),
    onTasksDeleted(() => reviews.refreshIfTasks()),
    () => document.removeEventListener('visibilitychange', onVisible)
  );

  async function act(action: PsAction, text?: string): Promise<void> {
    try {
      paint(await decisionBookApi.act(session, action, text));
    } catch (err) {
      if ((err as { code?: string }).code === 'conflict') {
        paint(await decisionBookApi.get(session.id));
        return;
      }
      flash(err);
      return;
    }
    if (isBusy(session)) await settle();
  }

  /** A plot or scales chart the person placed or scored: its payload, with the run it belongs to. */
  async function rescore({ runId, ...scores }: DmRunScores): Promise<void> {
    try {
      paint(await decisionBookApi.score(session, { runId, ...scores }));
    } catch (err) {
      if ((err as { code?: string }).code === 'conflict') {
        paint(await decisionBookApi.get(session.id));
        return;
      }
      flash(err);
    }
  }

  render(session);
  if (isBusy(session)) await settle();
}

/** Leaving Decision Maker (or opening another decision): stop polling, drop the canvas and the Tasks listeners. */
export function unmountDecisionMakerView(): void {
  poll?.abort();
  poll = null;
  canvasNow?.destroy();
  canvasNow = null;
  for (const off of unsubscribeNow) off();
  unsubscribeNow = [];
}

export async function renderDecisionMakerView(canvas: HTMLElement): Promise<void> {
  unmountDecisionMakerView();
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading…'));
  const id = hashQuery().get('id');
  try {
    if (id) await renderSession(canvas, id);
    else await renderList(canvas);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderDecisionMakerView(canvas), 'Could not load Decision Maker');
  }
}

````

- [ ] **Step 5: Create the styles**

**Create `apps/tasks/src/views/decision-book/decision-book-view.css`:**

````css
/* apps/tasks/src/views/decision-book/decision-book-view.css
   Decision Maker's pages. The layout is Problem Solver's (problem-solver-view.css); this file
   swaps its palette for the Decision Book's (red stays red, yellow becomes green, blue becomes
   ink) and adds the pieces Decision Maker has of its own: the medal, the track's dotted line,
   the compass, the quick card, the section shelves and the canvas strip. Flat surfaces: a
   hairline border instead of a shadow. */
.dm-page {
  --ps-red: var(--dm-red);
  --ps-yellow: var(--dm-green);
  --ps-blue: var(--dm-ink);
  --ps-on-yellow: var(--dm-ink);
  --ps-ink: var(--dm-ink);
  --ps-paper: var(--dm-paper);
  --ps-ghost: var(--dm-ghost);
  --ps-ease: var(--dm-ease);
  --ps-spring: var(--dm-spring);
  --ps-other: #a9aa9f;
}
.dm-page :is(.ps-prob__link, .ps-bench, .ps-build, .ps-skills__item, .ps-start) { box-shadow: none; border: 1px solid var(--dm-line); }
.dm-page .ps-skills__item.is-unused { border-color: transparent; box-shadow: inset 0 0 0 1px var(--dm-line); }

/* ── Emblems ── */
.dm-emblem { display: inline-grid; flex: none; width: 1.75rem; height: 1.75rem; place-items: center; }
.dm-emblem svg { display: block; width: 100%; height: 100%; }

/* ── Landing ── */
.dm-loom .ps-loom__cell { fill: var(--dm-soft); }
.dm-start__picked { display: flex; align-items: center; gap: var(--space-2); margin: 0; font-size: var(--text-sm); color: var(--dm-ink); }
.dm-start__picked[hidden] { display: none; }
.dm-start__clear { margin-left: auto; min-height: 32px; padding: 0 var(--space-3); border: 1px solid var(--dm-line); border-radius: 999px; background: transparent; color: var(--muted); font: inherit; font-size: var(--text-xs); cursor: pointer; }
.dm-quick { border-color: transparent; background: var(--dm-green-tint); }
.dm-quick__mark { display: inline-grid; width: 2rem; height: 2rem; }
.dm-quick__mark svg { width: 100%; height: 100%; }

.dm-medal { display: block; width: 100%; height: 100%; overflow: visible; }
.dm-medal__piece { transform-box: fill-box; transform-origin: center; transition: transform 420ms var(--dm-spring); }
.ps-prob__link:hover .dm-medal__model { transform: rotate(90deg) scale(1.06); }

.dm-build__pair path { animation: dm-dash 4s linear infinite; }
.dm-build__cycle .dm-emblem { width: 100%; height: 100%; }
.dm-go { transform-box: fill-box; transform-origin: center; animation: dm-go 3.2s var(--dm-ease) infinite; }
.dm-turn { transform-box: fill-box; transform-origin: center; animation: dm-turn 3.2s var(--dm-ease) infinite; }
@keyframes dm-dash { to { stroke-dashoffset: -32; } }
@keyframes dm-go { 50% { transform: translateX(6%); } }
@keyframes dm-turn { 50% { transform: translateX(-6%); } }

.dm-sections { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); align-items: start; }
.dm-sect { border: 1px solid var(--dm-line); border-radius: var(--radius-lg); background: var(--ps-card); }
.dm-sect[open] { grid-column: 1 / -1; }
.dm-sect__head { display: flex; align-items: center; gap: var(--space-4); min-height: 44px; padding: var(--space-4); cursor: pointer; list-style: none; }
.dm-sect__head::-webkit-details-marker { display: none; }
.dm-sect__head:focus-visible { outline: 2px solid var(--dm-ink); outline-offset: 2px; border-radius: var(--radius-lg); }
.dm-sect__head .dm-emblem { width: 3.5rem; height: 3.5rem; transition: transform 520ms var(--dm-spring); }
.dm-sect[open] .dm-sect__head .dm-emblem { transform: rotate(-90deg); }
.dm-sect__text { display: grid; gap: 2px; min-width: 0; }
.dm-sect__title { font-size: var(--text-base); font-weight: var(--weight-semibold); color: var(--dm-ink); }
.dm-sect__line { color: var(--muted); font-size: var(--text-sm); }
.dm-shelf { padding: 0 var(--space-4) var(--space-4); }
.dm-shelf__model { box-shadow: inset 0 0 0 1px var(--dm-line); }
.dm-shelf__model .dm-emblem { width: 3.25rem; height: 3.25rem; transition: transform 520ms var(--dm-spring); }
.dm-shelf__model:hover .dm-emblem { transform: scale(1.08); }
.dm-shelf__start { justify-self: start; min-height: 36px; padding: 0 var(--space-3); border: 1.5px solid var(--dm-ink); border-radius: 999px; background: transparent; color: var(--dm-ink); font: inherit; font-size: var(--text-xs); font-weight: var(--weight-semibold); cursor: pointer; }
.dm-shelf__start:hover { background: var(--dm-ink); color: var(--dm-paper); }
.dm-shelf__start:focus-visible { outline: 2px solid var(--dm-ink); outline-offset: 2px; }

/* ── Session ── */
.dm-track__line { min-width: 24rem; max-width: 40rem; }
.dm-track__line::before { height: 0; border-top: 2px dotted var(--dm-line); background: none; }
.dm-track__line::after { height: 0; border-top: 2px dotted var(--dm-ink); background: none; }
.dm-track__mark { border-radius: 50%; background: var(--dm-paper); }
.dm-track__stn[data-state='future'] .dm-track__mark { opacity: 0.35; }
.dm-track__note { min-height: 1em; color: var(--muted); font-size: var(--text-2xs); }

.dm-compass { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--space-4); align-items: center; }
.dm-compass[hidden] { display: none; }
.dm-compass__grid { display: grid; grid-template-columns: repeat(2, 40px); gap: 4px; }
.dm-compass__q { position: relative; width: 40px; height: 40px; }
.dm-compass__q .dm-emblem { width: 100%; height: 100%; }
.dm-compass__q[data-lit='false'] .dm-emblem { opacity: 0.22; filter: grayscale(1); }
.dm-compass__q[data-lit='true']::after { content: ''; position: absolute; inset: -3px; border: 2px solid var(--dm-ink); border-radius: 50%; }
.dm-compass__text { margin: 0; color: var(--muted); font-size: var(--text-sm); }
.dm-compass__text b { color: var(--dm-ink); }

.dm-canvas__title { flex-wrap: wrap; }
.dm-canvas__title .dm-emblem { width: 1.75rem; height: 1.75rem; }
.dm-canvas__count { color: var(--muted); font: 500 var(--text-2xs) / 1.4 var(--font-ui); letter-spacing: 0.04em; }
.dm-canvas__back { margin-left: auto; }
.dm-canvas__empty { display: grid; justify-items: center; gap: var(--space-3); padding: var(--space-8) var(--space-4); text-align: center; color: var(--muted); }
.dm-canvas__empty .dm-emblem { width: 4rem; height: 4rem; }
.dm-canvas__empty p { max-width: 28rem; margin: 0; }
.dm-canvas__strip { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: var(--space-4) 0 0; padding: 0; list-style: none; }
.dm-canvas__run { display: inline-flex; align-items: center; gap: var(--space-2); min-height: 44px; padding: 0 var(--space-3); border: 1px solid var(--dm-line); border-radius: 999px; background: transparent; color: var(--dm-ink); font: inherit; font-size: var(--text-xs); cursor: pointer; }
.dm-canvas__run[aria-pressed='true'] { border-color: var(--dm-ink); background: var(--dm-ink); color: var(--dm-paper); }
.dm-canvas__run.is-switched span:last-child { text-decoration: line-through; }
.dm-canvas__run:focus-visible { outline: 2px solid var(--dm-ink); outline-offset: 2px; }

@media (max-width: 720px) {
  .dm-sections { grid-template-columns: minmax(0, 1fr); }
  .dm-track__line { min-width: 0; }
  .dm-track__note { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .dm-build__pair path, .dm-go, .dm-turn { animation: none; }
}
````

- [ ] **Step 6: Add the nav entry, icon, route and mock API**

The mock API now keeps one service per path, each on its own memory store, both on the scripted coach. Decision Maker's starts only `decision` sessions. The route shares Problem Solver's unmount slot, so leaving either view stops its polling.

````diff
diff --git a/apps/tasks/scripts/mock-api.ts b/apps/tasks/scripts/mock-api.ts
index 6bc8f138d..470d4cdc8 100644
--- a/apps/tasks/scripts/mock-api.ts
+++ b/apps/tasks/scripts/mock-api.ts
@@ -145,7 +145,11 @@ export function createMockApi({ seed }: MockApiOptions) {
 
   const personalLines = new Map<string, Record<string, unknown> & { slug: string }>();
   const whiteboards = new Map<string, Record<string, unknown>>();
-  const problemSolver = createProblemSolverService({ store: createMemoryProblemStore(), coach: scriptedCoach });
+  // Problem Solver and Decision Maker: one service each over its own memory store, both on the scripted coach.
+  const coachServices: Record<string, ReturnType<typeof createProblemSolverService>> = {
+    '/api/problem-solver': createProblemSolverService({ store: createMemoryProblemStore(), coach: scriptedCoach }),
+    '/api/decision-book': createProblemSolverService({ store: createMemoryProblemStore(), coach: scriptedCoach, kinds: ['decision'] })
+  };
 
   async function handle(method: string, urlPath: string, body?: unknown) {
     await ensure();
@@ -449,7 +453,8 @@ export function createMockApi({ seed }: MockApiOptions) {
       }
     }
 
-    if (path === '/api/problem-solver') {
+    const problemSolver = coachServices[path];
+    if (problemSolver) {
       try {
         if (method === 'GET') {
           if (url.searchParams.has('linked')) return json(200, { ok: true, data: { sessions: await problemSolver.linked('operator', url.searchParams.get('linked') ?? '') } });
diff --git a/apps/tasks/src/app/main.ts b/apps/tasks/src/app/main.ts
index a35ba6bbd..401725373 100644
--- a/apps/tasks/src/app/main.ts
+++ b/apps/tasks/src/app/main.ts
@@ -106,7 +106,7 @@ function renderNotFound(canvas: HTMLElement, hash: string): void {
 
 /** Grove owns a WebGL context; release it when another view takes the canvas. */
 let groveUnmount: (() => void) | null = null;
-/** Problem Solver polls the coach and listens for task changes; stop both when another view takes the canvas. */
+/** Problem Solver and Decision Maker poll the coach and listen for task changes; stop both when another view takes the canvas. */
 let problemSolverUnmount: (() => void) | null = null;
 
 async function renderActiveView(view: HubViewId, canvas: HTMLElement): Promise<void> {
@@ -176,6 +176,11 @@ async function renderActiveView(view: HubViewId, canvas: HTMLElement): Promise<v
       problemSolverUnmount = problemSolver.unmountProblemSolverView;
       return problemSolver.renderProblemSolverView(canvas);
     }
+    case 'decision-maker': {
+      const decisionMaker = await import('@/views/decision-book/view');
+      problemSolverUnmount = decisionMaker.unmountDecisionMakerView;
+      return decisionMaker.renderDecisionMakerView(canvas);
+    }
     case 'city': {
       const { renderCityView } = await import('@/views/city/view');
       return renderCityView(canvas);
diff --git a/apps/tasks/src/shell/icons.ts b/apps/tasks/src/shell/icons.ts
index f35ff28fc..173e62216 100644
--- a/apps/tasks/src/shell/icons.ts
+++ b/apps/tasks/src/shell/icons.ts
@@ -45,6 +45,7 @@ export const RAIL_ICON_PATHS: Record<string, string[]> = {
   search: ['M11 11a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z', 'M14.5 14.5 19 19'],
   properties: ['M5 7h14v3H5z', 'M7 11h10v8H7z', 'M9 14h2', 'M13 14h2'],
   'problem-solver': ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18', 'M8 10l4 4l4-4'],
+  'decision-maker': ['M8 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10', 'M16 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10', 'M5 12h13', 'M15 9l3 3l-3 3'],
   'term-dates': ['M4 6h16', 'M4 10h12', 'M4 14h16', 'M4 18h8'],
   line: ['M8 3v18', 'M8 7h0', 'M8 7a1.5 1.5 0 1 0 0.01 0', 'M8 15a1.5 1.5 0 1 0 0.01 0', 'M12 7h7', 'M12 15h5']
 };
diff --git a/apps/tasks/src/shell/shell.ts b/apps/tasks/src/shell/shell.ts
index 1ce8d1698..9123130e1 100644
--- a/apps/tasks/src/shell/shell.ts
+++ b/apps/tasks/src/shell/shell.ts
@@ -63,6 +63,7 @@ export type HubViewId =
   | 'properties'
   | 'term-dates'
   | 'problem-solver'
+  | 'decision-maker'
   | 'city'
   | 'grove';
 
@@ -120,6 +121,7 @@ const NAV_SECTIONS: NavSection[] = [
     items: [
       { id: 'maps', label: 'Maps', href: '#/maps' },
       { id: 'problem-solver', label: 'Problem Solver', href: '#/problem-solver' },
+      { id: 'decision-maker', label: 'Decision Maker', href: '#/decision-maker' },
       { id: 'line', label: 'Personal line', href: '#/line' },
       { id: 'search', label: 'Search', href: '#/search' },
       { id: 'properties', label: 'Properties', href: '#/properties' },
````

- [ ] **Step 7: Type-check**

Run: `cd apps/tasks && npx tsc --noEmit -p . 2>&1 | grep -E "problem-solver|decision-book" | grep -v "TS6059\|Imported via\|rootDir" || echo "no problem-solver or decision-book errors"`
Expected: `no problem-solver or decision-book errors`.

- [ ] **Step 8: Commit**

```bash
git add apps/tasks/src/views/decision-book/ apps/tasks/src/shell/shell.ts apps/tasks/src/shell/icons.ts apps/tasks/src/app/main.ts apps/tasks/scripts/mock-api.ts
git commit -m "Decision Maker: landing and session pages at #/decision-maker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Tests

**Files:**
- Create: `apps/tasks/tests/unit/decision-book-app.test.ts`, `tests/unit/decision-book-app.test.js`

- [ ] **Step 1: Create the client tests**

These cover:
- the track through each step and the waiting review;
- the compass, the medal and the coach look;
- the record blocks and provenance image;
- the session canvas (empty, the run in hand, the strip, Back to now, and a reason's basis);
- the view's review entry and record writer;
- the shared parts' Decision Maker paths: the bridge's graphic and retry, the record card and its graphic kind, the chip, the ribbon's split and the task origin.

**Create `apps/tasks/tests/unit/decision-book-app.test.ts`:**

````ts
// Decision Maker's client: its decor (track, compass, medal, coach look), the record's page
// blocks and provenance image, the session canvas, the view's review entry and record writer,
// and the paths Problem Solver's shared components gained for it (the record card and its
// graphic retry, the bridge's graphic, the Decision Maker chip, the shared skills ribbon, the
// coach look and the task origin).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTrack, createCompass, decisionMedal, DM_LOOK, plainName, trackStations } from '../../src/views/decision-book/decor';
import { provenanceUrl, recordBlockId, recordBlocks, recordGraphic } from '../../src/views/decision-book/record-blocks';
import { mountDecisionCanvas, shownRun } from '../../src/views/decision-book/canvas';
import { latestRecordWriter, reviewEntry } from '../../src/views/decision-book/view';
import { createCaseFileBridge } from '../../src/views/problem-solver/case-file-bridge';
import { mountTaskCards } from '../../src/views/problem-solver/task-cards';
import { decisionMakerChips } from '../../src/views/problem-solver/link-chips';
import { skillsRibbon } from '../../src/views/problem-solver/skills-ribbon';
import { mountCoachPanel } from '../../src/views/problem-solver/coach-panel';
import { PS_ORIGIN, reviewBody, taskBody } from '../../src/views/problem-solver/task-bridge';
import { scriptedCoach } from '../../../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import { acceptSuggestion, applyCoachTurn, createSession, linkCaseFile, moveOn, say, setReviewTask } from '../../../../netlify/functions/_shared/problem-solver/session.mjs';
import { recordOffer } from '../../../../packages/decision-book/record.mjs';
import type { PsRecordOffer, PsSession, PsSummary } from '../../../../packages/problem-solver/types';

let n = 0;
const deps = { now: () => '2026-10-21T10:00:00.000Z', newId: () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}` };
type Session = PsSession;

async function step(session: Session, text?: string): Promise<Session> {
  const next = text ? say(session, text, deps) : session;
  return applyCoachTurn(next, await scriptedCoach(next), deps) as Session;
}

/** A decision walked by the scripted coach to `until`: framed, explored, or decided. */
async function walk(until: 'framed' | 'explored' | 'decided'): Promise<Session> {
  let s = await step(createSession({ text: 'Should I take the Sydney job offer?', kind: 'decision' }, deps) as Session);
  s = await step(s, 'It is about me and I want to understand what I really want.');
  s = await step(s, 'The offer closes Friday and the rent there is double.');
  if (until === 'framed') return s;
  s = await step(acceptSuggestion(s, deps) as Session);
  for (const t of ['Reply to the Sydney offer letter, do immediately', 'Talk the move over with my partner, decide when', 'Sort out the lease renewal paperwork, do later', 'reflection: The offer reply is the only thing that cannot wait.']) s = await step(s, t);
  if (until === 'explored') return s;
  s = await step(s, 'decide');
  s = await step(acceptSuggestion(s, deps) as Session);
  s = await step(s, 'I decide faster once the urgent part is named.');
  s = await step(acceptSuggestion(s, deps) as Session);
  for (const t of ['I will take the Sydney job and move in March.', 'The offer reply cannot wait and it matters most.', 'The rent there goes above half of my pay.', 'Then I look at the flats further out instead.', 'Email my acceptance to the Sydney office on Monday.', 'Review it on 2027-01-21']) s = await step(s, t);
  return s;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('decor', () => {
  it('the track moves Frame, Explore, Decide, Review, and waits on the review date', async () => {
    const framed = await walk('framed');
    expect(trackStations(createSession({ text: 'x', kind: 'decision' }, deps) as Session).stations.map((s) => s.state)).toEqual(['now', 'future', 'future', 'future']);
    expect(trackStations(framed).stations.map((s) => [s.state, s.note])).toEqual([['done', 'Done'], ['now', 'Pick a model'], ['future', ''], ['future', '']]);
    const decided = await walk('decided');
    expect(trackStations(decided).stations.map((s) => s.state)).toEqual(['done', 'done', 'now', 'future']);
    expect(trackStations(decided).stations[1].note).toBe('1 model');
    expect(trackStations(decided).stations[3].note).toMatch(/^Due 21 Jan/);
    const waiting = await step(moveOn(setReviewTask(decided, { taskId: 'tr', due: '2027-01-21' }, deps), deps) as Session);
    expect(trackStations(waiting).stations[3].state).toBe('waiting');
    const track = createTrack();
    track.update(waiting);
    expect(track.el.querySelector('[aria-current="step"]')).toBeNull();
    expect([...track.el.querySelectorAll('.ps-track__name')].map((e) => e.textContent)).toEqual(['Frame', 'Explore', 'Decide', 'Review']);
  });

  it('the compass lights the answered quadrant and says what it means', async () => {
    const compass = createCompass();
    compass.update(createSession({ text: 'x', kind: 'decision' }, deps) as Session);
    expect(compass.el.hidden).toBe(true);
    compass.update(await walk('framed'));
    expect(compass.el.hidden).toBe(false);
    expect([...compass.el.querySelectorAll('.dm-compass__q')].map((q) => (q as HTMLElement).dataset.lit)).toEqual(['true', 'false', 'false', 'false']);
    expect(compass.el.querySelector('.dm-compass__text')!.textContent).toMatch(/^Understand yourself\. The decision is about you/);
    expect(compass.el.getAttribute('aria-label')).toBe('Section compass: Understand yourself');
  });

  it('the medal fills disc by disc and centres the main model', () => {
    const fills = (svg: SVGSVGElement) => [...svg.querySelectorAll('circle')].slice(0, 2).map((c) => c.getAttribute('fill'));
    expect(fills(decisionMedal(0, null))).toEqual(['var(--dm-ghost)', 'var(--dm-ghost)']);
    expect(fills(decisionMedal(2, null))).toEqual(['var(--dm-red)', 'var(--dm-green)']);
    expect(decisionMedal(2, null).querySelectorAll('.dm-medal__piece').length).toBe(2);
    expect(decisionMedal(3, 'dm_eisenhower').querySelector('.dm-medal__model svg')).not.toBeNull();
  });

  it('the coach look frames the decision questions and names models plainly', () => {
    expect(DM_LOOK.frames.decision.keys).toEqual(['decision', 'compass', 'known']);
    expect(plainName('dm_project_portfolio')).toBe('Project portfolio matrix');
    const panel = mountCoachPanel({ onSay: () => {}, onAction: () => {} }, { look: DM_LOOK });
    panel.update({ ...(createSession({ text: 'x', kind: 'decision' }, deps) as Session), runner: { status: 'idle', mode: 'turn', error: null }, frame: { decision: 'd' } });
    expect(panel.el.querySelector('.ps-composer__now')!.textContent).toBe('Answering: Who is it about, and what do you want?');
  });
});

describe('record blocks', () => {
  const offerOf = async () => recordOffer(await walk('decided')) as PsRecordOffer;

  it('a write is a heading, every section, then the caption and a link back; ids are fixed', async () => {
    const offer = await offerOf();
    const blocks = recordBlocks(offer, { sessionId: 'abcdef12-3456', date: '20261021' });
    expect(blocks[0]).toMatchObject({ id: recordBlockId('abcdef12-3456', 1, 1), block_type: 'heading', variant: 'section', content: { text: 'Decision: Should I take the Sydney job offer?' } });
    expect(blocks).toHaveLength(1 + offer.file.sections.length + 1);
    const last = blocks.at(-1) as { content: { html: string } };
    expect(last.content.html).toBe('<p><em>Decided with The Decision Book · The Eisenhower matrix · 21 October 2026</em></p><p><a href="#/decision-maker?id=abcdef12-3456">Open this decision in Decision Maker</a></p>');
  });

  it('an update carries only the changed sections under a dated heading', async () => {
    const offer = { ...(await offerOf()), kind: 'update' as const, version: 2, changed: ['outcome'] };
    offer.file = { ...offer.file, sections: [...offer.file.sections, { key: 'outcome', heading: 'What happened', lines: ['It took four months.'] }] };
    const blocks = recordBlocks(offer, { sessionId: 'abcdef12-3456', date: '20270121' });
    expect(blocks).toHaveLength(3);
    expect((blocks[0] as { variant: string }).variant).toBe('subsection');
    expect((blocks[0] as { content: { text: string } }).content.text).toMatch(/^Update: /);
  });

  it('the provenance image is the main model’s file, absolute, with no caption of its own', async () => {
    const offer = await offerOf();
    expect(provenanceUrl('dm_eisenhower', 'https://hub.example', '/tasks/')).toBe('https://hub.example/tasks/decision-book/provenance/dm_eisenhower.svg');
    const image = recordGraphic(offer, { sessionId: 'abcdef12-3456', date: '20261021' }) as { id: string; block_type: string; content: Record<string, string> };
    expect(image.id).toBe(recordBlockId('abcdef12-3456', 1, 0));
    expect(image.block_type).toBe('image');
    expect(image.content.url).toMatch(/\/decision-book\/provenance\/dm_eisenhower\.svg$/);
    expect(image.content.alt_text).toBe("The Eisenhower matrix emblem, inside its section's emblem");
    expect(image.content.caption).toBeUndefined();
    expect(recordGraphic({ ...offer, provenance: { ...offer.provenance, model: null } }, { sessionId: 'a', date: 'b' })).toBeNull();
  });
});

describe('session canvas', () => {
  it('shows the empty state, then the run in hand, and a strip to look back at earlier models', async () => {
    const host = document.createElement('div');
    const canvas = mountDecisionCanvas(host);
    canvas.update(await walk('framed'));
    expect(host.querySelector('.dm-canvas__empty')).not.toBeNull();
    const decided = await walk('decided');
    canvas.update(decided);
    expect(shownRun(decided)?.tool).toBe('dm_record');
    expect(host.querySelector('.dm-canvas__name')!.textContent).toBe('The decision record');
    const reason = decided.steps.decide.runs[0].nodes.find((node) => node.slot === 'reason:1')!;
    expect(host.querySelector(`.dm-entry[data-node="${reason.id}"] .dm-entry__meta`)!.textContent).toMatch(/^Rests on The Eisenhower matrix: /);
    const runs = [...host.querySelectorAll<HTMLButtonElement>('.dm-canvas__run')];
    expect(runs.map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([['Eisenhower matrix', 'false'], ['Decision record', 'true']]);
    runs[0].click();
    expect(host.querySelector('.dm-canvas__name')!.textContent).toBe('The Eisenhower matrix');
    host.querySelector<HTMLButtonElement>('.dm-canvas__back')!.click();
    expect(host.querySelector('.dm-canvas__name')!.textContent).toBe('The decision record');
    canvas.destroy();
  });
});

describe('view helpers', () => {
  it('a review link enters only with step=review, by the server’s own rule', async () => {
    const decided = await walk('decided');
    const waiting = await step(moveOn(setReviewTask(decided, { taskId: 'tr', due: '2027-01-21' }, deps), deps) as Session);
    expect(reviewEntry(waiting, 'review')).toEqual({ kind: 'start', step: 'review' });
    expect(reviewEntry(waiting, 'improve')).toBeNull();
  });

  it('the record writer refuses a card whose offer has moved on', async () => {
    const decided = await walk('decided');
    const offer = recordOffer(decided) as PsRecordOffer;
    const write = vi.fn().mockResolvedValue(undefined);
    await latestRecordWriter(() => decided, write)(offer, { place: 'new', title: offer.file.title });
    expect(write).toHaveBeenCalledWith(decided, offer, { place: 'new', title: offer.file.title });
    await expect(latestRecordWriter(() => decided, write)({ ...offer, key: 'stale' }, { place: 'new', title: 'x' })).rejects.toThrow('The decision record changed; check the card again.');
  });
});

describe('shared components, Decision Maker paths', () => {
  const bridgeDeps = (over: Record<string, unknown> = {}) => ({
    createProject: vi.fn().mockResolvedValue({ id: 'proj-1' }),
    getProject: vi.fn().mockResolvedValue({ id: 'proj-1', page_blocks: [{ id: 'old' }] }),
    updateProject: vi.fn().mockResolvedValue({}),
    getTask: vi.fn(),
    updateTask: vi.fn(),
    link: vi.fn().mockResolvedValue(undefined),
    today: () => '20261021',
    blocks: (offer: PsRecordOffer, opts: { sessionId: string; date: string }) => recordBlocks(offer, opts),
    graphic: (offer: PsRecordOffer, opts: { sessionId: string; date: string }) => recordGraphic(offer, opts, (model) => `https://hub.example/${model}.svg`),
    ...over
  });

  it('the bridge writes the graphic above the text and says it wrote', async () => {
    const decided = await walk('decided');
    const offer = recordOffer(decided) as PsRecordOffer;
    const d = bridgeDeps();
    await createCaseFileBridge(d as never).write(decided, offer, { place: 'new', title: offer.file.title });
    const blocks = d.updateProject.mock.calls[0][1].page_blocks;
    expect(blocks.map((b: { block_type?: string; id: string }) => b.block_type ?? b.id).slice(0, 3)).toEqual(['old', 'image', 'heading']);
    expect(d.link).toHaveBeenCalledWith(expect.objectContaining({ version: 1, graphic: true }));
  });

  it('a graphic that will not write leaves the text, says so, and a retry puts it above the heading', async () => {
    let s = await walk('decided');
    const offer = recordOffer(s) as PsRecordOffer;
    const d = bridgeDeps();
    d.updateProject.mockImplementation(async (_id: string, body: { page_blocks: Array<{ block_type?: string }> }) => {
      if (body.page_blocks.some((b) => b.block_type === 'image')) throw new Error('image refused');
      return {};
    });
    await createCaseFileBridge(d as never).write(s, offer, { place: 'new', title: offer.file.title });
    expect(d.link).toHaveBeenCalledWith(expect.objectContaining({ graphic: false }));
    s = linkCaseFile(s, d.link.mock.calls[0][0], deps) as Session;
    const retry = recordOffer(s) as PsRecordOffer;
    expect(retry.kind).toBe('graphic');
    const text = recordBlocks(offer, { sessionId: s.id, date: '20261021' });
    const retried = bridgeDeps({ getProject: vi.fn().mockResolvedValue({ id: 'proj-1', page_blocks: [{ id: 'old' }, ...text] }) });
    await createCaseFileBridge(retried as never).write(s, retry, { place: s.caseFile!.target, title: s.caseFile!.title });
    const ids = retried.updateProject.mock.calls[0][1].page_blocks.map((b: { id: string }) => b.id);
    expect(ids.slice(0, 3)).toEqual(['old', recordBlockId(s.id, 1, 0), recordBlockId(s.id, 1, 1)]);
    expect(retried.link).toHaveBeenCalledWith(expect.objectContaining({ version: 1, graphic: true }));
  });

  it('the record card names the decision record, takes any title, and offers to retry the graphic', async () => {
    let s = await walk('decided');
    const write = vi.fn().mockResolvedValue(undefined);
    const handlers = { create: vi.fn(), dismiss: vi.fn(), createReview: vi.fn(), dismissReview: vi.fn(), places: vi.fn().mockResolvedValue([]), writeCaseFile: write, dismissCaseFile: vi.fn() };
    const cards = mountTaskCards(handlers, { paper: { offer: (x) => recordOffer(x) as PsRecordOffer | null, noun: 'decision record', strictNames: false } });
    cards.update(s);
    const card = cards.el.querySelector('.ps-casefilecard')!;
    expect(card.querySelector('.ps-taskcard__meta')!.textContent).toBe('Write the decision record?');
    card.querySelector<HTMLInputElement>('input[name="title"]')!.value = 'Sydney: the call';
    card.querySelector<HTMLButtonElement>('[data-act="write-casefile"]')!.click();
    await vi.waitFor(() => expect(write).toHaveBeenCalled());
    expect(write.mock.calls[0][1]).toMatchObject({ place: 'new', title: 'Sydney: the call' });
    const offer = recordOffer(s) as PsRecordOffer;
    s = linkCaseFile(s, { target: { kind: 'project', id: 'p1' }, version: 1, title: 'Sydney: the call', sections: offer.digests, graphic: false }, deps) as Session;
    cards.update(s);
    expect(cards.el.querySelector('.ps-casefilecard .ps-taskcard__meta')!.textContent).toBe("The decision record's graphic did not write. Try it again?");
    expect(cards.el.querySelector('[data-act="write-casefile"]')!.textContent).toBe('Retry the graphic');
  });

  it('a Decision Maker chip opens the decision, a review chip at Review', async () => {
    const linked = vi.fn().mockResolvedValue([{ id: 'd1', title: 'Sydney', phase: 'review', model: 'decision_book', role: 'review' }]);
    const host = decisionMakerChips({ kind: 'task', id: 't1' }, { linked });
    await vi.waitFor(() => expect(host.querySelector('a')).not.toBeNull());
    expect(host.querySelector('a')!.getAttribute('href')).toBe('#/decision-maker?id=d1&step=review');
    expect(host.querySelector('a')!.textContent).toBe('Review in Decision Maker: Sydney');
    expect(host.querySelector('a')!.classList.contains('ps-linkchip--dm')).toBe(true);
  });

  it('the skills ribbon sums both tools and splits each bar', () => {
    const row = (skills: Record<string, number>) => ({ skills }) as unknown as PsSummary;
    const ribbon = skillsRibbon({ name: 'Decision Maker', sessions: [row({ analysis: 3 })] }, { name: 'Problem Solver', sessions: [row({ analysis: 1, learning: 4 })] }, () => 'var(--dm-ink)');
    expect([...ribbon.querySelectorAll('.ps-ribbon__key')].map((k) => k.textContent)).toEqual(['Decision Maker', 'Problem Solver']);
    const analysis = [...ribbon.querySelectorAll('.ps-skills__item')].find((i) => i.textContent!.includes('Analysis'))!;
    expect(analysis.querySelector('.ps-skills__count')!.textContent).toBe('4×');
    expect((analysis.querySelector('.ps-skills__own') as HTMLElement).style.getPropertyValue('--w')).toBe('75%');
    expect((analysis.querySelector('.ps-skills__other') as HTMLElement).style.getPropertyValue('--w')).toBe('25%');
  });

  it('tasks carry their tool: Problem Solver by default, Decision Maker when it says so', async () => {
    const s = await walk('framed');
    expect(taskBody(s, { title: 'T', due: null }, 'life')).toMatchObject({ source: 'problem_solver', tags: ['problem-solver'] });
    const origin = { name: 'Decision Maker', source: 'decision_maker', tag: 'decision-maker', noun: 'decision', review: 'the decision "%s" has worked out' };
    expect(taskBody(s, { title: 'T', due: null }, 'life', undefined, origin)).toMatchObject({ source: 'decision_maker', tags: ['decision-maker'], description: 'From Decision Maker: Should I take the Sydney job offer?' });
    expect(reviewBody(s, { title: 'R', due: '2027-01-21' }, 'life', origin)).toMatchObject({ tags: ['decision-maker', 'review'], description: 'Review how the decision "Should I take the Sydney job offer?" has worked out.' });
    expect(PS_ORIGIN.source).toBe('problem_solver');
  });
});
````

- [ ] **Step 2: Create the server tests**

These cover:
- starting from a shelf model, including the service passing it through and models that are refused;
- the list row's main model;
- a graphic retry set aside with Not now;
- the provenance images matching their generator;
- the `decision_maker` task source.

**Create `tests/unit/decision-book-app.test.js`:**

````js
// tests/unit/decision-book-app.test.js
// The server side of Decision Maker's app: starting a decision from a model on the shelf, the
// list row's main model (the medal's centre), a set-aside graphic retry, the provenance graphics
// kept in step with their generator, and the task source Decision Maker's tasks carry.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import { acceptSuggestion, applyCoachTurn, createSession, dismissCaseFile, linkCaseFile, say, summaryRow } from '../../netlify/functions/_shared/problem-solver/session.mjs';
import { buildDecisionPrompt } from '../../netlify/functions/_shared/problem-solver/decision-prompts.mjs';
import { createProblemSolverService } from '../../netlify/functions/_shared/problem-solver/service.mjs';
import { createMemoryProblemStore } from '../../netlify/functions/_shared/problem-solver/store.mjs';
import { DEFAULT_TASK_PROPERTY_CONFIG } from '../../netlify/functions/_shared/task-properties.mjs';
import { recordOffer } from '../../packages/decision-book/record.mjs';
import { CATALOGUE } from '../../packages/decision-book/catalogue.mjs';
import { PROVENANCE_DIR, provenanceFiles } from '../../scripts/generate-decision-book-provenance.mjs';

let n = 0;
const deps = { now: () => '2026-10-21T10:00:00.000Z', newId: () => `id${(n += 1)}` };
const step = async (s, text) => {
  const next = text ? say(s, text, deps) : s;
  return applyCoachTurn(next, await scriptedCoach(next), deps);
};
const frame = async (s) => {
  s = await step(s);
  s = await step(s, 'It is about me and I want to understand what I really want.');
  return step(s, 'The offer closes Friday and the rent there is double.');
};

test('a decision started from a shelf model opens on it once framed; the prompt is told', async () => {
  let s = createSession({ text: 'Should I take the Sydney job offer?', kind: 'decision', startModel: 'dm_rumsfeld' }, deps);
  assert.equal(s.startModel, 'dm_rumsfeld');
  assert.match(buildDecisionPrompt(s).user, /SHELF PICK: the person started from The Rumsfeld matrix \(dm_rumsfeld\)\./);
  s = await frame(s);
  assert.equal(s.phase, 'explore');
  assert.deepEqual(s.suggestion, { kind: 'next_tool', tool: 'dm_rumsfeld', reason: 'You started from this model on the shelf.' });
  assert.ok(!buildDecisionPrompt(s).user.includes('SHELF PICK'));
});

test('a shelf model must be one Explore offers, and only a decision takes one', () => {
  assert.equal(createSession({ text: 'x', kind: 'decision', startModel: 'dm_record' }, deps).startModel, undefined);
  assert.equal(createSession({ text: 'x', kind: 'decision', startModel: 'five_whys' }, deps).startModel, undefined);
  assert.equal(createSession({ text: 'x', startModel: 'dm_rumsfeld' }, deps).startModel, undefined);
});

test('the service passes a shelf model through create', async () => {
  const service = createProblemSolverService({ store: createMemoryProblemStore(), coach: scriptedCoach, kinds: ['decision'], now: deps.now });
  const s = await service.create('me', { text: 'Who should lead the project?', kind: 'decision', startModel: 'dm_team' });
  assert.equal(s.startModel, 'dm_team');
});

test('a decision’s list row names its main model; a Problem Solver row has none', async () => {
  let s = await frame(createSession({ text: 'Should I take the Sydney job offer?', kind: 'decision' }, deps));
  assert.equal(summaryRow(s).main, null);
  s = await step(acceptSuggestion(s, deps));
  s = await step(s, 'Reply to the Sydney offer letter, do immediately');
  assert.equal(summaryRow(s).main, 'dm_eisenhower');
  assert.ok(!('main' in summaryRow(createSession({ text: 'Late rota.' }, deps))));
});

test('Not now on a graphic retry hides it until the record changes', async () => {
  let s = await frame(createSession({ text: 'Should I take the Sydney job offer?', kind: 'decision' }, deps));
  s = await step(acceptSuggestion(s, deps));
  for (const t of ['Reply to the Sydney offer letter, do immediately', 'Talk the move over with my partner, decide when', 'Sort out the lease renewal paperwork, do later', 'reflection: The offer reply is the only thing that cannot wait.', 'decide']) s = await step(s, t);
  s = await step(acceptSuggestion(s, deps));
  s = await step(s, 'I decide faster once the urgent part is named.');
  s = await step(acceptSuggestion(s, deps));
  for (const t of ['I will take the Sydney job and move in March.', 'The offer reply cannot wait and it matters most.', 'The rent there goes above half of my pay.', 'Then I look at the flats further out instead.', 'Email my acceptance to the Sydney office on Monday.', 'Review it on 2027-01-21']) s = await step(s, t);
  const offer = recordOffer(s);
  s = linkCaseFile(s, { target: { kind: 'project', id: 'p1' }, version: 1, title: offer.file.title, sections: offer.digests, graphic: false }, deps);
  assert.equal(recordOffer(s).kind, 'graphic');
  s = dismissCaseFile(s, { key: recordOffer(s).key }, deps);
  assert.equal(recordOffer(s), null);
});

test('every catalogue model has its provenance graphic, as its generator writes it', async () => {
  const files = await provenanceFiles();
  assert.deepEqual(Object.keys(files).sort(), CATALOGUE.map((entry) => `${entry.id}.svg`).sort());
  assert.deepEqual((await readdir(PROVENANCE_DIR)).sort(), Object.keys(files).sort());
  for (const [name, text] of Object.entries(files)) assert.equal(await readFile(new URL(name, PROVENANCE_DIR), 'utf8'), text, `${name} is stale: run node scripts/generate-decision-book-provenance.mjs`);
  assert.match(files['dm_eisenhower.svg'], /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 240 240" role="img" aria-label="The Eisenhower matrix, from How to improve yourself">/);
  for (const text of Object.values(files)) assert.ok(!/<script|href="https?:|<image/i.test(text));
});

test('Decision Maker’s tasks carry a known source', () => {
  assert.ok(DEFAULT_TASK_PROPERTY_CONFIG.sources.some((source) => source.id === 'decision_maker'));
});
````

- [ ] **Step 3: Run them**

Run: `node --test tests/unit/decision-book-app.test.js && (cd apps/tasks && npx vitest run tests/unit/decision-book-app.test.ts)`
Expected: PASS (7 and 16).

- [ ] **Step 4: Commit**

```bash
git add apps/tasks/tests/unit/decision-book-app.test.ts tests/unit/decision-book-app.test.js
git commit -m "Decision Maker: tests for the app

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Plan 6 check

- [ ] **Step 1:** `npm run test:unit`: PASS (5,710 when drafted: 5,699 pass, 11 skipped).
- [ ] **Step 2:** `cd apps/tasks && npx vitest run`: PASS (250 files, 2,631 tests when drafted).
- [ ] **Step 3:** The Tasks tsc check for these paths is clean (Task 4, Step 7).
- [ ] **Step 4:** Start `tasks-dev` and sign in with the mock's local passphrase, from `apps/tasks/scripts/mock-api.ts`. At desktop and 390px, check:
  - the landing page;
  - a decision walked with the scripted coach (see Plan 5's notes for its words);
  - the record written to a page, with its image;
  - the waiting review and Review now.
- [ ] **Step 5:** Do not push. Update `decision-book-tool.md` with "Plan 6 done (HEAD <sha>)".

---

## Notes for Plan 7 (Quick decision and checks)

- **Quick decision card:** `quickCard()` in `views/decision-book/view.ts` is the placeholder. Plan 7 swaps in a form like Problem Solver's `lightningCard` that creates a `quick` session.
- **Quick route:** the quick session's page can reuse `mountDecisionCanvas` for its Yes/No chart, or follow `lightning-view.ts`.
- **Walks:** the Playwright walks can follow this plan's browser check. Sign in through `/api/auth`, as `tests/browser/problem-solver.spec.mjs` does. Use the scripted coach's words:
  - a quadrant item names its cell;
  - `reflection: …`;
  - `another angle`;
  - `decide`;
  - the review typed as `2027-01-21`.
  The card buttons are "Create task", "Create review task", "Write decision record", "Move on to Review" and "Review now".
- **Mock API:** it still 404s `/api/chat/pending`, which fills the console with errors. Its whole server also crashes on a task source Tasks does not know (fixed here for `decision_maker`).
- **Branch:** it was 44 commits behind `main` at Plan 4. Merge `main` before `pre-pr-check`, and rerun `node scripts/generate-block-css.mjs` and the provenance generator if their sources changed.
