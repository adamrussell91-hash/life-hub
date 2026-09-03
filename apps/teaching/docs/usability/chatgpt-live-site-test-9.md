# Teaching Hub — ChatGPT Live block catalogue + student render (run 9)

Copy everything from **Operator brief** through **Report template** into ChatGPT Live (browser / computer-use). Replace `{{PASSPHRASE}}` first. Do not invent or expose a passphrase.

Runs 7–8 proved durable AI jobs and forensic tracing. This run asks a different question: **can Ann produce usable learning materials in every lesson block type, and do those blocks render correctly for students?**

A result such as “AI failed,” “looks broken,” or “student view is weird” is invalid. Every defect must name the block type, the surface (teacher canvas vs student page), and the technical boundary that failed.

---

## Operator brief

You are a careful teacher testing **Teaching Hub** in a real Chrome browser. Follow the steps in order. Use the exact values. Continue after failures so one run can map which block types work and which do not.

**Site:** https://teaching-hub.adam-russell.com  
**Passphrase:** `{{PASSPHRASE}}`  
**Timebox:** up to 70 minutes  
**Goal:** drive Ann through every lesson block type in five insert waves, inspect teacher render, publish, inspect student render and interactivity, then have Hammond review without rewriting.

### What this run must answer

1. **AI usability** — can a teacher get a finished proposal, understand it, and Accept without silent mutation or leaked retry prose?
2. **End result** — is the accepted content actually teachable (not empty shells, lorem, or schema leftovers)?
3. **Teacher render** — does each accepted type paint a real block on the canvas?
4. **Student render** — after Publish, does `/s/lessons/{id}` show the same learning material in student mode (read-only chrome, working activities, working media)?
5. **Catalogue coverage** — which of the 32 lesson types Ann can produce, and which it skips, invalidates, or renders unusably?

### Block catalogue (this run)

There are **32** registered types. **`collection` is homepage-only** and must never appear in this lesson. The other **31** are in scope.

| Family | Types Ann must attempt |
|--------|------------------------|
| Content | `heading`, `rich_text`, `callout`, `quote`, `definition`, `divider`, `code` |
| Media | `image`, `gallery`, `video`, `embed`, `audio`, `attachment` |
| Activities | `question_set`, `flashcards`, `cloze`, `self_check`, `accordion`, `table` |
| Visuals | `chart`, `equation`, `diagram`, `mind_map`, `concept_map`, `timeline` |
| Layout | `section`, `columns`, `tabs`, `spacer` |
| Explicit HTML | `html`, `html_app` (teacher will ask for these by name) |
| Forbidden | `collection` |

`html` / `html_app` are allowed **only** because Wave 5 explicitly asks for them. `collection` must still be refused.

### How AI works now (read once)

- Chat does **not** stream token-by-token. Expect a phase line, then a finished result.
- Phase lines (some may be brief): **Thinking…** → **Searching the web…** → **Writing the reply…**
- A phase that keeps changing means the job is alive. A frozen phase with no card and no error for **3 minutes** is a fail for that wave.
- Stall copy like **The AI connection stalled before a reply** is a fail.
- Mutating AI: the canvas must **not** change until **Accept** (or **Accept selected**).
- Prefer `insert_blocks`. If Ann offers **replace lesson**, Accept it **only** on this run’s new lesson, and only if the unique starter heading and earlier accepted waves would not be wiped. Prefer Reject + retry with insert if a replace would destroy prior waves.
- One retry per wave (Reject + same prompt once, or Send once more). Then continue.
- If Send says an unresolved job already exists, open the existing confirm card or wait — do not create a second lesson.
- Do not trash English Advanced / English Standard / existing school classes.
- Do not click **Backup Now** or **Backup to GitHub**.
- Do not edit `Retrieval in 20 minutes` or `Nine-block dual coding`.

### Non-negotiable reporting rules

1. Never report only that something “failed.” For every failure, report:
   - block type(s) involved;
   - surface: teacher canvas / confirm card / student page;
   - last boundary that succeeded;
   - first boundary that failed;
   - exact evidence (UI text, job ID, HTTP status, Console);
   - the narrowest technical conclusion;
   - what remains unknown.
2. Do not infer Brave/Anthropic from a spinner. A searching phase proves only that the job last persisted `searching`.
3. Capture evidence **before** refreshing, retrying, rejecting, accepting, or navigating away.
4. Continue after a diagnosed failure. Skip only the unsafe Accept, not the rest of the run.
5. Never expose the passphrase, cookies, `Authorization` headers, API keys, or HAR files.
6. You may record non-secret headers such as `x-nf-request-id`.
7. Screenshots support visible state. They do not replace request status, response JSON, Console text, or the block matrix.
8. Observe in DevTools. Do not rewrite requests, storage, or application state.

### Expected architecture (use when a wave fails)

1. Browser `POST /api/ai/jobs` → HTTP `202` with `data.id` like `ai_job_…`.
2. Browser polls `GET /api/ai/jobs/{jobId}`.
3. Job advances `queued` → `searching` → `writing` → terminal `done` or `error`.
4. Ann mutating jobs should include `proposal.kind: "insert_blocks"` (or `replace_lesson` on this lesson only).
5. Confirm card appears. Canvas unchanged until Accept.
6. Accept applies locally, then `PUT /api/lessons/{lessonId}` and `PATCH /api/ai/jobs/{jobId}` with `{"resolution":"accepted"}`.
7. Publish is `POST /api/lessons/{lessonId}/publish`. Student URL is `/s/lessons/{lessonId}`.
8. Hammond should be `proposal.kind: "review_only"` with no lesson PUT.

On **success**, record job ID, proposed types, accepted types, and a one-line usability note. On **failure**, collect the full evidence package from the **Technical diagnosis** section.

### Recover (prefer) or create

Reuse subject / class / unit when they exist. Always create a **new** lesson.

| Role | Prefer | Fallback if missing |
|------|--------|---------------------|
| Subject | `Retrieval Practice` | Create subject `Catalogue Check` (title only) |
| Class | `11 Retrieve A` | `11 Cat A` (code `11CAT`, 2026, Year 12) |
| Unit | `Testing Effect` | Create unit `Catalogue Unit` (Year 12, same subject) |
| Lesson | Create **new** with the unique title below | — |

### Exact values (this run)

| Field | Value |
|-------|--------|
| Create-modal lesson title | `Catalogue starter` |
| On-page lesson title | `Block catalogue run 9 — YYYYMMDD-HHMM` (use actual local time) |
| Pedagogical mode | `Seminar` |
| Starter heading | `Do now: why is spacing better than cramming?` |
| Topic | Spacing effect / retrieval practice for Year 12. Australian English. |
| Wave 1 phrase | `spacing beats massed practice` |
| Wave 2 phrase | `search pack media must stay grounded` |
| Wave 3 phrase | `students retrieve before they reread` |
| Wave 4 phrase | `graphs must show labelled nodes` |
| Wave 5 phrase | `layout holds nested teaching moves` |

---

## Shared Console helpers

Use these read-only snippets. Do not paste huge HTML. Record the returned objects.

### Inventory (teacher or student)

On the **teacher** lesson, run as-is. On the **student** page, it targets `.lesson-blocks` automatically.

```js
(() => {
  const root =
    document.querySelector('.lesson-blocks') ||
    document.querySelector('.teacher-layout__canvas');
  const nodes = [...(root?.querySelectorAll('[data-block-type]') ?? [])];
  const types = nodes.map((el) => el.getAttribute('data-block-type'));
  const counts = {};
  for (const t of types) counts[t] = (counts[t] || 0) + 1;
  const text = root?.innerText || '';
  const phrases = [
    'Do now: why is spacing better than cramming?',
    'spacing beats massed practice',
    'search pack media must stay grounded',
    'students retrieve before they reread',
    'graphs must show labelled nodes',
    'layout holds nested teaching moves'
  ];
  return {
    surface: document.querySelector('.lesson-blocks') ? 'student' : 'teacher',
    url: location.pathname,
    blockCount: nodes.length,
    distinctTypes: [...new Set(types)].sort(),
    counts,
    hasEditor: Boolean(document.querySelector('.block-editor, .lesson-palette')),
    phrases: Object.fromEntries(phrases.map((p) => [p, text.includes(p)]))
  };
})()
```

### Per-type render probe (teacher or student)

```js
(() => {
  const root =
    document.querySelector('.lesson-blocks') ||
    document.querySelector('.teacher-layout__canvas');
  const first = (sel) => root?.querySelector(sel) || null;
  const img = first('.block[data-block-type="image"] img[src^="https://"]');
  const video = first(
    '.block[data-block-type="video"] iframe[src*="youtube"], .block[data-block-type="video"] iframe[src*="vimeo"]'
  );
  const probe = (type, ok) => ({ type, present: Boolean(first(`.block[data-block-type="${type}"]`)), ok });
  return {
    image: img
      ? {
          src: img.currentSrc || img.getAttribute('src'),
          alt: img.getAttribute('alt'),
          complete: img.complete,
          naturalWidth: img.naturalWidth
        }
      : null,
    video: video ? { src: video.getAttribute('src') } : null,
    galleryItems: root?.querySelectorAll('.block[data-block-type="gallery"] img').length ?? 0,
    flashcardsFlip: Boolean(first('.block-flashcards__btn')),
    clozeInputs: root?.querySelectorAll('.block-cloze input, .block-cloze [contenteditable]').length ?? 0,
    selfCheckInteractive: Boolean(
      first('.block-self-check button, .block-self-check input[type="checkbox"]')
    ),
    tabs: root?.querySelectorAll('.block-tabs__tab').length ?? 0,
    accordionItems: root?.querySelectorAll('[data-block-type="accordion"] details, .block-accordion__item').length ?? 0,
    mindMapNodes: root?.querySelectorAll('.block-mind-map text, .block-mind-map__svg text').length ?? 0,
    conceptMapNodes: root?.querySelectorAll('.block-concept-map text, .block-concept-map__svg text').length ?? 0,
    htmlAppIframe: Boolean(first('.block-html-app__frame')),
    htmlAppSandbox: first('.block-html-app__frame')?.getAttribute('sandbox') || null,
    collectionPresent: Boolean(first('[data-block-type="collection"]')),
    chartSvg: Boolean(first('[data-block-type="chart"] svg')),
    equationRendered: Boolean(first('[data-block-type="equation"] .katex, [data-block-type="equation"] svg')),
    probes: [
      'heading','rich_text','callout','quote','definition','divider','code',
      'image','gallery','video','embed','audio','attachment',
      'question_set','flashcards','cloze','self_check','accordion','table',
      'chart','equation','diagram','mind_map','concept_map','timeline',
      'section','columns','tabs','spacer','html','html_app','collection'
    ].map((type) => probe(type, true))
  };
})()
```

---

## Step 0 — Sign in and prepare DevTools

1. Open Chrome at https://teaching-hub.adam-russell.com/sign-in.
2. Open DevTools (`Command` + `Option` + `I` / `F12`).
3. Network: **Preserve log** on, **Disable cache** on, recording on, clear existing requests.
4. Console: preserve log if available, clear, note baseline errors.
5. If ChatGPT Live cannot operate the DevTools UI, use equivalent CDP/network tools. Do not pretend evidence was collected.
6. Enter `{{PASSPHRASE}}`. Sign in.
7. Dashboard. Rail brand one line. **Sign out** is a header icon (`aria-label` **Sign out**), not a rail pill.

**Pass:** signed in; chrome present.  
**Fail:** invalid passphrase; stacked rail brand; Sign out on the rail.

Record sign-in HTTP status and any new Console error.

---

## Step 1 — Isolated lesson + AI chrome smoke

1. Search Lessons for today’s `Block catalogue run 9 —` title. If a leftover from a crashed attempt exists, open it only if it still has just the starter heading; otherwise create new.
2. **+** → **Lesson**. Title `Catalogue starter`. Unit `Testing Effect` (or fallback). Mode **Seminar**. **Save**.
3. Must land on `/lessons/…` with the editor. Must **not** say **Lesson not found**.
4. Change title (aria-label **Lesson title**) to `Block catalogue run 9 — YYYYMMDD-HHMM`. Wait for **Saved**.
5. Add one **Heading**: `Do now: why is spacing better than cramming?` Wait for **Saved**.
6. Open chat (`Open chat` / `]`). Record visible agents. Expected: **Ann O'Tation**, **General Hammond**, **Clare DèMind**, **Professor Clementine Haig**.
7. Select **Ann O'Tation**. Switching agents later must **not** full-reload the site.
8. Run the inventory helper. This is the **baseline**. Distinct types should be `heading` only.

**Pass:** editor open; unique title saved; starter heading present; chat opens; Ann selected.  
**Fail:** not-found; chat missing; agents missing.

Record lesson URL, lesson ID, and baseline inventory.

---

## Step 2 — Wave 1 Ann: content blocks

Clear Network. Console marker:

```js
console.info('RUN9_WAVE1_SEND', new Date().toISOString())
```

Send **exactly**:

```
Keep the existing starter heading. Insert additional blocks below it for a Year 12 mini-lesson on the spacing effect. Australian English.

Prefer propose_insert_blocks. Do not replace the lesson. Do not use collection.

You MUST propose these block types, all filled with real teaching content (no lorem, no empty shells, no Untitled):
- heading
- rich_text that contains this exact phrase: spacing beats massed practice
- callout
- quote
- definition
- divider
- code (a short, relevant example or a clearly labelled retrieval schedule snippet)

Keep the heading "Do now: why is spacing better than cramming?".
Do not propose image, video, html, html_app, or collection in this wave.
```

Wait up to **3 minutes** for a confirm card.

**Before Accept:** canvas must still match baseline (starter heading only), unless you already Accepted a retry on this same wave — note which.

**Accept** with all checkboxes on.

Then:

1. Run inventory + probe.
2. Record proposed types vs accepted types.
3. Score each Wave 1 type against **Usable learning material** below.
4. If the unique phrase is missing and search/job succeeded: one retry only.

**Pass:** confirm card before mutation; phrase present; at least `rich_text` plus two other content types usable.  
**Fail:** stall; silent write; no card; Accept no-op; phrase missing; content is empty/lorem.

If the wave’s job errors, record the evidence package and continue to the next wave.

---

## Step 3 — Wave 2 Ann: media blocks

Marker: `RUN9_WAVE2_SEND`. Send **exactly**:

```
Keep every existing block. Insert additional blocks below for the same Year 12 spacing-effect lesson. Australian English.

Prefer propose_insert_blocks. Do not replace the lesson. Do not use collection, html, or html_app.

You MUST propose these block types. Ground every URL in the search pack. Do not invent URLs.
- image (real https photograph, meaningful alt text)
- gallery (at least two real https images)
- video (YouTube or Vimeo from the search pack)
- embed (a real https page from the search pack, e.g. a university article)
- audio (only if the search pack has a real audio URL; otherwise omit and say so)
- attachment (only if the search pack has a real downloadable file URL; otherwise omit and say so)
- rich_text or callout that contains this exact phrase: search pack media must stay grounded

If web search is unavailable, say so clearly, omit all media URLs, and still insert a short callout with the unique phrase.
```

Same Accept rules. Then inventory + probe, plus image/video Network status.

**Image fail classes:** no image in proposal; proposal has image but no DOM after Accept; request 4xx/5xx; CSP/mixed-content Console; `naturalWidth === 0`.

**Video fail classes:** no video in proposal; no iframe after Accept; **Video unavailable.**; blocked player.

**Pass:** working `image` and `video` when search was available; unique phrase present.  
**Fail:** invented-looking broken media; missing both image and video when search ran; silent write.

If Ann reports search unavailable: mark **search unavailable**, do not fail Wave 2 solely for missing media, still require the unique phrase.

---

## Step 4 — Wave 3 Ann: learning activities

Marker: `RUN9_WAVE3_SEND`. Send **exactly**:

```
Keep every existing block. Insert additional activity blocks below for the same Year 12 spacing-effect lesson. Australian English.

Prefer propose_insert_blocks. Do not replace the lesson. Do not use collection, html, or html_app.

You MUST propose these block types, all publishable and filled:
- question_set with at least 3 questions, each with an answer
- flashcards with at least 4 cards; every card has a non-empty front and back (never leave Front/Back required-to-publish placeholders)
- cloze using the [[answer]] blank syntax, at least 2 blanks
- self_check with a real prompt and an answer or checklist items
- accordion with at least 2 items of teaching content
- table with headers and at least 2 data rows
- rich_text or callout that contains this exact phrase: students retrieve before they reread

Do not invent media URLs. Keep the starter heading.
```

Accept. Inventory + probe.

On the **teacher** canvas, flashcards may list fronts/backs rather than Flip. That is expected. Student mode is where Flip must exist.

**Fail immediately** if any flashcard still says **Front (required to publish)** or **Back (required to publish)** — that will block Publish later.

**Pass:** ≥4 of the 6 activity types present and filled; unique phrase present; flashcards publishable.  
**Fail:** empty activities; placeholder flashcards; silent write.

---

## Step 5 — Wave 4 Ann: visuals

Marker: `RUN9_WAVE4_SEND`. Send **exactly**:

```
Keep every existing block. Insert additional visualisation blocks below for the same Year 12 spacing-effect lesson. Australian English.

Prefer propose_insert_blocks. Do not replace the lesson. Do not use collection, html, or html_app.

You MUST propose these block types with valid schema:
- chart with a title and at least one labelled series of real numbers (e.g. retention after 1 day / 1 week / 1 month)
- equation with valid LaTeX
- diagram (search-pack `image_url` + alt if available; otherwise omit diagram or use `source: svg` with real SVG. A caption alone cannot publish)
- mind_map with at least 8 meaningful nodes, unique ids, and valid parent_id / edges. Content is { title?, nodes, edges }.
- concept_map with labelled concepts and labelled relationships; every from/to must reference an existing node id
- timeline with at least 3 events (when + label)
- rich_text or callout that contains this exact phrase: graphs must show labelled nodes

Do not invent media URLs. Empty node arrays are a fail.
```

Accept. Inventory + probe.

Mind map / concept map **usable** means SVG text labels are visible (probe node counts > 0), not an empty box. Chart **usable** means an SVG (or equivalent) with a title, not a blank frame. Equation **usable** means KaTeX/SVG rendered, not raw broken `$...$` only.

**Pass:** `mind_map` or `concept_map` shows labelled nodes, plus at least two other visual types.  
**Fail:** empty graphs; missing unique phrase; silent write.

---

## Step 6 — Wave 5 Ann: layout + explicit HTML

Marker: `RUN9_WAVE5_SEND`. Send **exactly**:

```
Keep every existing block. Insert additional layout and HTML blocks below for the same Year 12 spacing-effect lesson. Australian English.

I explicitly ask for html and html_app in this message.

Prefer propose_insert_blocks. Do not replace the lesson. Do not use collection.

You MUST propose:
- section titled "Practice in class" containing at least one heading and one rich_text child
- columns with two columns, each containing at least one real child block
- tabs with at least two tabs (e.g. "Review" and "Extend"), each containing real child content
- spacer
- html: a small semantic HTML snippet (a short styled list or definition), not an empty div
- html_app: a tiny interactive retrieval widget (e.g. a button that reveals a spaced-practice tip). It must render inside the sandboxed iframe and not be blank.
- rich_text or callout that contains this exact phrase: layout holds nested teaching moves

Do not invent media URLs. Nested child blocks must be complete schema objects, not empty arrays.
```

Accept. Inventory + probe.

**Pass:** `section` or `columns` or `tabs` has nested children; unique phrase present; `html_app` iframe exists if proposed.  
**Fail:** empty layout shells; `collection` inserted; silent write.

If Ann refuses `html`/`html_app` despite the explicit ask, record that as an **AI capability miss**, not a teacher-error. Continue.

---

## Step 7 — Teacher-canvas catalogue audit

Do this even if some waves failed. You are mapping what actually landed.

1. Run **inventory** and **probe**.
2. Scroll the whole canvas. For every type in the catalogue, fill the matrix in the report: `missing / proposed-not-accepted / teacher-broken / teacher-ok`.
3. Usable-learning check (not just “DOM exists”):

| Type | Usable on teacher canvas means |
|------|--------------------------------|
| `heading` | Real section title, not `Untitled` or a type slug |
| `rich_text` | Real paragraphs about spacing/retrieval |
| `callout` | Teaching note with a visible style |
| `quote` | Readable quotation (attribution if present) |
| `definition` | Term + definition both filled |
| `divider` | Visible separator, no crash |
| `code` | Visible code/snippet, not empty |
| `image` | Visible https photo, meaningful alt, `naturalWidth > 0` |
| `gallery` | ≥2 images, none all-broken |
| `video` | YouTube/Vimeo player, not **Video unavailable.** |
| `embed` | Frame or honest fallback, not a blank error with no copy |
| `audio` | Player or honest unavailable copy |
| `attachment` | Titled download link or honest omit |
| `question_set` | ≥3 real questions |
| `flashcards` | ≥4 cards, both sides filled, no publish placeholders |
| `cloze` | Sentence with marked blanks (answers may show in teacher preview) |
| `self_check` | Prompt visible; answer hidden or checklist preview |
| `accordion` | ≥2 expandable teaching items |
| `table` | Headers + ≥2 rows of real cells |
| `chart` | SVG/chart with title |
| `equation` | Rendered maths |
| `diagram` | Image or SVG, caption if provided |
| `mind_map` | SVG with labelled nodes |
| `concept_map` | SVG with concepts and relationship labels |
| `timeline` | ≥3 when/label events |
| `section` | Title + nested children |
| `columns` | ≥2 columns with content in each |
| `tabs` | ≥2 tabs; clicking another tab changes visible panel |
| `spacer` | Gap; `aria-hidden` |
| `html` | Rendered markup, not raw unescaped junk or empty |
| `html_app` | Iframe with `sandbox="allow-scripts allow-forms"`; not a white void |
| `collection` | Must be **absent** |

4. Click **tabs** (if present) once to prove the inactive panel is not empty.
5. Note leaked chat prose such as `Oops`, `response_space only accepts`, or tool-schema apologies. That is an AI-usability fail even if the proposal was accepted.
6. Wait for **Saved**. Hard-refresh the lesson URL once. Re-run inventory. Content must survive.

**Pass:** starter heading + at least 12 distinct lesson types still present after refresh; no `collection`.  
**Fail:** content gone; lesson not found; `collection` present.

---

## Step 8 — Publish

1. **Save**, then **Publish**.
2. Must **not** say **Flashcards need front and back text on every card to publish**.
3. Success panel: **Published. Students can now view this lesson at:** plus a link that opens in a **new tab**.
4. Record `POST /api/lessons/{id}/publish` status. On non-2xx, quote the sanitized issues list.
5. If a Drive-media confirm dialog appears, record the warning text. Publish anyway only if the warning is about restricted Drive files, not empty flashcards.

**Pass:** published; student path `/s/lessons/{lessonId}`; new tab.  
**Fail:** publish blocked; same-tab hijack; no student URL.

If publish fails, fix nothing in the lesson except empty flashcards/cloze if the error names them, retry Publish **once**, then continue to student view if a published snapshot exists. If none exists, skip Step 9 student interactions but still record the publish issues.

---

## Step 9 — Student view: render + usability of the learning material

Open the published lesson in a **new tab** at `/s/lessons/{lessonId}` (publish link or **Student link** → **Open**).

Student chrome must be read-only:

- No lesson palette, no block editors, no teacher Save/Publish, no AI chat.
- Brand/student shell is fine.

Run **inventory** and **probe** on this page. Then interact:

| Check | What to do | Pass |
|-------|------------|------|
| Phrases | Search page text | Starter heading + any accepted unique phrases still visible |
| Image/video/gallery | Look + Network | Same pass/fail classes as teacher; student must not drop media that teacher showed |
| Flashcards | Click **Flip**, then **Next** if present | Card flips; back text appears; this is student-only behaviour |
| Cloze | Find inputs/blanks | Blanks are fillable; answers are **not** all pre-filled as plain text |
| Self-check | Tick or reveal | Student can act; teacher’s “Answer hidden” preview is not the student UI |
| Question set | Read / answer if controls exist | Questions readable; not an editor |
| Tabs | Click second tab | Panel content changes |
| Accordion | Expand an item | Body visible |
| Mind/concept map | Inspect SVG | Labels still visible; not collapsed to empty |
| html_app | Look at iframe | Still sandboxed; not blank |
| teacher_only | Inventory | No surprise teacher-only callouts that say they are teacher-only, unless visibility was set that way — note if AI marked student content `teacher_only` by mistake |
| Layout | Section/columns | Nested content visible, not clipped to zero height |

Optional if time: resize viewport to ~390px wide. Record only **blockers** (unusable overlap, vanishing media, unscrollable iframe). Do not fail the run on minor wrapping.

**Pass:** student page shows the published blocks; flashcards/cloze/self-check use student mode when those types exist; no teacher editor chrome.  
**Fail:** 404; still looks like the teacher editor; missing phrases that existed on teacher canvas; activities unusable; media that worked for the teacher is broken for the student.

Leave the student tab open for screenshots. Return to the teacher tab for Hammond.

---

## Step 10 — Hammond review-only + AI usability wrap

1. Teacher tab. Agent picker → **General Hammond**. No full-reload.
2. Marker: `RUN9_HAMMOND_SEND`.
3. Send exactly:

```
Review this lesson for a Year 12 class. Comment on whether the block variety would actually help students practise spacing and retrieval. Do not change any blocks. Do not replace the lesson.
```

4. Expect phases, then a prose review and/or confirm card. If a mutating confirm card appears, **do not Accept**. Record `proposal.kind`. Reject after evidence capture.
5. Canvas must still match the post-refresh teacher inventory.
6. Record AI-usability observations for the whole run:

- Phase lines appeared and advanced
- Confirm cards were understandable
- Accept/Reject were obvious
- Chat remained usable after long jobs
- Agent switch did not reload
- No leaked tool-retry prose
- Unresolved-job conflict (yes/no)

**Pass:** review without destroying the lesson.  
**Fail:** stall; silent rewrite; canvas wiped.

---

## Step 11 — Negative check: collection (only if time and chat is idle)

If an unresolved Ann job is still pending, skip this step.

Select **Ann**. Send exactly:

```
Add a collection block to this lesson that lists other lessons.
```

Expected: Ann refuses, or proposes something that is **not** `collection`. Do **not** Accept a collection. Record the reply. Inventory must still show `collectionPresent: false`.

---

## What not to do

- Do not use `teaching-hub-local` on production unless it works.
- Do not Accept replace-lesson on any lesson except this run’s catalogue lesson, and not if it would wipe earlier waves.
- Do not open AI on **Retrieval in 20 minutes**.
- Do not wait past **3 minutes** of a frozen phase with no card / no error.
- Do not expect token-by-token streaming.
- Do not Backup Now / empty Trash / permanently delete.
- Do not treat “four types including image and video” as enough — this run is the full catalogue.
- Do not skip Step 8–9 to squeeze in more Ann waves. If time is short after Wave 3, **publish and inspect student view of whatever exists**, then resume Waves 4–5 if possible.

---

## Technical diagnosis rules

Use the narrowest label supported by evidence:

- **Browser event/UI:** expected request never left the browser
- **Authentication/session:** API `401`
- **Request validation:** API `400`
- **Lesson lookup:** API `404`
- **Unresolved job conflict:** creation `409`
- **Job creation function:** creation `5xx` or malformed body
- **Polling transport:** job exists, GET fails
- **Background execution:** job stays `working` with no terminal state; report last persisted phase; do not name a provider
- **Search stage:** terminal error names search/Brave, or server evidence does
- **Writing/model stage:** terminal error names model/Anthropic, or server evidence does
- **Proposal contract/validation:** missing proposal, invalid kind, media-not-in-pack, schema error
- **AI capability miss:** job `done` with valid proposal that simply omitted requested types
- **AI quality miss:** types present but unusable as learning material (empty, lorem, placeholder flashcards, empty graphs)
- **Client job rendering:** terminal JSON has the result, UI does not
- **Confirmation boundary:** canvas mutates before Accept
- **Proposal application:** Accept occurs, expected blocks do not appear
- **Teacher render:** blocks in DOM but broken paint (empty SVG, `naturalWidth === 0`, Video unavailable)
- **Lesson persistence:** lesson PUT fails
- **Job resolution tracking:** job PATCH fails
- **Publish validation:** publish POST names flashcards/media/schema issues
- **Student snapshot:** publish succeeded but `/s/lessons/{id}` 404 or stale
- **Student render/mode:** GET has blocks, student DOM uses teacher editor chrome or drops interactivity
- **Remote media/provider:** DOM correct, external asset/player fails

Example of a useful diagnosis:

> Wave 4 POST `202`, job `ai_job_…` reached `done` with `insert_blocks` including `mind_map` (8 nodes). Teacher probe `mindMapNodes: 0`. Student probe also 0. Last success: proposal application. First fail: teacher render of `mind_map` SVG. Next: inspect `content.nodes` in the lesson GET vs `buildMindMapSvg`.

“Mind map looks broken” is not useful.

---

## Required evidence package for every failure

1. Timestamp with timezone  
2. Lesson URL and ID  
3. Wave / agent / job ID or “no job ID”  
4. Block type(s)  
5. Surface (teacher / confirm card / student)  
6. Last successful boundary  
7. First failed boundary  
8. Method + path  
9. HTTP status or exact `net::ERR_*`  
10. Duration  
11. Sanitized response / `data.error`  
12. Exact UI text  
13. Console errors with source/line  
14. Inventory/probe snippets  
15. Screenshot reference  
16. Narrow conclusion  
17. Remaining uncertainty  
18. Next evidence needed (e.g. Netlify logs for `ai_job_…`)

---

## Report template

Paste the completed report back. Fill every matrix row. Use `n/a` only when a type was never reached because an earlier blocker stopped the wave.

```text
# Teaching Hub usability report (run 9) — block catalogue + student render

Date/time and timezone:
Chrome version:
Lesson URL:
Lesson ID:
Student URL:
DevTools Preserve log: yes/no
Technical evidence access limitations:
Records used: Retrieval Practice + this catalogue lesson / fallback Catalogue Check / mixed

## Results
| Step | Result (pass/fail/partial) | Notes |
|------|----------------------------|-------|
| 0 Sign in |  |  |
| 1 Isolated lesson + AI chrome |  |  |
| 2 Wave 1 content |  |  |
| 3 Wave 2 media |  |  |
| 4 Wave 3 activities |  |  |
| 5 Wave 4 visuals |  |  |
| 6 Wave 5 layout+html |  |  |
| 7 Teacher catalogue audit + refresh |  |  |
| 8 Publish |  |  |
| 9 Student render + activities |  |  |
| 10 Hammond review-only |  |  |
| 11 Collection refuse |  |  |

## AI usability
Agents visible:
Chat opened without reload: yes/no
Phase lines seen (list):
Token-by-token streaming observed: yes/no (expected: no)
Confirm card before canvas change (each wave):
Accept control obvious: yes/no
Leaked retry/tool prose (quote if yes):
Unresolved-job conflict: yes/no
Agent switch reloaded site: yes/no
Chat still usable after long jobs: yes/no
Hammond mutated canvas: yes/no
Hammond proposal kind:

## Wave jobs
| Wave | T0 | POST status | Job ID | Terminal status | Proposal kind | Distinct types proposed | Retry 0/1 | Confirm before mutate | Accept PUT status |
|------|----|-------------|--------|-----------------|---------------|-------------------------|-----------|-----------------------|-------------------|
| 1 content |  |  |  |  |  |  |  |  |  |
| 2 media |  |  |  |  |  |  |  |  |  |
| 3 activities |  |  |  |  |  |  |  |  |  |
| 4 visuals |  |  |  |  |  |  |  |  |  |
| 5 layout+html |  |  |  |  |  |  |  |  |  |
| Hammond |  |  |  |  |  |  |  |  |  |

Search unavailable: yes/no
Media not in search pack errors (quote):

## Block matrix
For each type use:
proposed: yes/no/n/a
teacher: missing / empty-unusable / rendered-broken / usable
student: missing / empty-unusable / rendered-broken / usable / n/a (not published)
notes: one short technical clause

| Type | Proposed | Teacher | Student | Notes |
|------|----------|---------|---------|-------|
| heading |  |  |  |  |
| rich_text |  |  |  |  |
| callout |  |  |  |  |
| quote |  |  |  |  |
| definition |  |  |  |  |
| divider |  |  |  |  |
| code |  |  |  |  |
| image |  |  |  |  |
| gallery |  |  |  |  |
| video |  |  |  |  |
| embed |  |  |  |  |
| audio |  |  |  |  |
| attachment |  |  |  |  |
| question_set |  |  |  |  |
| flashcards |  |  |  |  |
| cloze |  |  |  |  |
| self_check |  |  |  |  |
| accordion |  |  |  |  |
| table |  |  |  |  |
| chart |  |  |  |  |
| equation |  |  |  |  |
| diagram |  |  |  |  |
| mind_map |  |  |  |  |
| concept_map |  |  |  |  |
| timeline |  |  |  |  |
| section |  |  |  |  |
| columns |  |  |  |  |
| tabs |  |  |  |  |
| spacer |  |  |  |  |
| html |  |  |  |  |
| html_app |  |  |  |  |
| collection | no (required) | absent/present | absent/present |  |

## Inventories
Baseline teacher:
Post-wave-1:
Post-wave-2:
Post-wave-3:
Post-wave-4:
Post-wave-5:
Post-refresh teacher:
Student:

## Media / activity probes
Teacher probe:
Student probe:
Image request status:
Video player error:
Flashcards student Flip worked: yes/no/n/a
Cloze student blanks worked: yes/no/n/a
Self-check student interactivity: yes/no/n/a
Tabs switch worked (teacher / student):
html_app sandbox attribute:

## Unique phrases
Starter heading teacher/student:
Wave 1 teacher/student:
Wave 2 teacher/student:
Wave 3 teacher/student:
Wave 4 teacher/student:
Wave 5 teacher/student:

## Failures
### Failure 1
Timestamp:
Wave/agent/job ID:
Block type(s):
Surface:
Last successful boundary:
First failed boundary:
Request method/path:
HTTP status or exact network error:
Duration:
Sanitized response:
Exact UI text:
Exact Console evidence:
Inventory/probe evidence:
Screenshot:
Technical conclusion supported by evidence:
What remains unknown:
Next evidence needed:

### Failure 2
(repeat)

## Verdicts
Ann can produce usable content blocks: yes/partial/no
Ann can produce grounded media: yes/partial/no / search unavailable
Ann can produce usable activities: yes/partial/no
Ann can produce usable visuals (maps/charts): yes/partial/no
Ann can produce usable layout + html/html_app: yes/partial/no
Student render matches teacher learning material: yes/partial/no
AI chat is usable for a teacher building a real lesson: yes/partial/no
Ship-ready for AI-built student lessons across the catalogue: yes/no
One sentence why:
Types Ann never produced:
Types produced but unusable for students:
Primary proven failure boundary:
Required server-side follow-up (job/request IDs):
```
