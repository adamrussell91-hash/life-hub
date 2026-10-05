# Teaching Hub — Codex hands-on build-through (run 10)

Copy everything from **Operator brief** through **Report template** into ChatGPT Codex (built-in browser). Replace `{{PASSPHRASE}}` first. Do not invent or expose a passphrase.

Runs 7–9 tested Ann and the AI job pipeline. This run takes the AI out. A teacher builds a whole unit **by hand**, the way Adam actually works: class → subject → unit → lessons → every block type → real content → tags → outcomes → publish → student view → delete and check what lingers.

The job is to find the kinks before Adam does: visual design faults, layout that is off, redundant controls or duplicate workflows, slow or clunky paths, things that are plain wrong (deleted items still showing, media not loading, saves not sticking), and places where the workflow could be shorter or clearer.

---

## Operator brief

You are a careful, slightly impatient teacher using **Teaching Hub** for the first time with a real unit to build. Work in the browser. Click the real controls. Type real content. Follow the steps in order, and keep going after a failure so one run covers the whole product.

**Site:** https://life-hub.adam-russell.com/teaching/
**Passphrase:** `{{PASSPHRASE}}`
**Timebox:** up to 120 minutes
**Viewports:** desktop (≥1280px wide) for the build. Repeat the spot checks in **Step 12** at 390px wide.

### What this run must answer

1. **Can a teacher build a complete unit by hand** without getting stuck, losing work, or needing a workaround?
2. **Does every block type insert, accept real content, save, survive a reload, and render for students?**
3. **Does media come in?** Images, galleries, videos, audio, embeds, PDFs, attachments, uploads, library picks.
4. **Does tagging work** and does it show up where you would expect (library filters, unit page, search)?
5. **Does delete mean gone?** A trashed lesson / unit / class must vanish from every list, picker, search, calendar, dashboard and student URL. Only Trash may show it.
6. **What is ugly, cramped, misaligned, redundant or slow?** Name it with a screenshot and a fix idea.

### Hard rules

- Prefix **every** record you create with `CDX10` so it can be found and cleaned up.
- Do **not** edit, trash, rename, reorder or publish any record that does not start with `CDX10`. Existing classes, units and lessons (e.g. English Advanced, English Standard) are Adam's real work.
- Do **not** click **Backup Now** or **Backup to GitHub**.
- Do **not** use AI to write content (Ann / Clementine / Hammond / Clare / Alchemy). You may open the AI panel and Chat to check they render, then close them. This run is about the hand-built path.
- **Permanent delete** is allowed only on `CDX10` records, only in Step 10.
- Never expose the passphrase, cookies, `Authorization` headers, API keys, or HAR files. Non-secret headers such as `x-nf-request-id` are fine.
- Capture evidence **before** you refresh, retry or navigate away.
- Do not rewrite requests, local storage or app state in DevTools. Observe only.

### What counts as a finding

Report anything in these categories. Small things count — a 4px misalignment repeated on every card is worth one line.

| Code | Category | Examples |
|------|----------|----------|
| **BRK** | Broken / wrong | Save doesn't stick after reload; deleted lesson still listed; image `naturalWidth: 0`; video iframe blank; 4xx/5xx; console error; wrong count; date wrong |
| **VIS** | Visual design | Misaligned edges, inconsistent spacing, clipped text, overflow, wrong font/size, raw ids or JSON on screen, broken icon, colour contrast, dark-mode glitch, modal off-screen |
| **LAY** | Layout | Things in the wrong place, controls buried, two columns that should be one, sticky bars covering content, buttons below the fold at 390px, tap targets <44px |
| **RED** | Redundancy | Two controls/paths that do the same job, two tag systems that don't talk, duplicated headings, repeated info on one screen |
| **FLOW** | Workflow friction | Too many clicks, a dead end, a modal that forgets input, no way back, a field you must fill twice, confusing labels, missing undo, no feedback after save |
| **ENH** | Enhancement | A shortcut, default, bulk action or auto-fill that would clearly save time |

Every finding needs: **where** (URL + surface), **what you did**, **what happened**, **what you expected**, **evidence** (screenshot and/or Console/Network text), **severity** (P0 blocks work / P1 wrong or painful / P2 polish / P3 idea).

Bad: “Video block is broken.”
Good: “`/teaching/lessons/les_…` video block, pasted `https://youtu.be/aircAruvnKk`, clicked out. Teacher canvas shows grey box, iframe `src` is empty. Expected the YouTube player. Console: none. Reload: same. Student view: same. P1 BRK.”

---

## Test values

Use these exactly so reports are comparable across runs. `HHMM` = your local time at start.

| Thing | Value |
|-------|-------|
| Class | `CDX10 Year 9 Science` · code `CDX10` · year 2026 · Year 9 · meeting days Mon + Wed + Fri |
| Subject | `CDX10 Science` |
| Scope & sequence | `CDX10 Year 9 Science scope` |
| Unit | `CDX10 Forces and Motion` · Year 9 · subject `CDX10 Science` |
| Lesson A (main) | `CDX10 Lesson A — every block HHMM` |
| Lesson B | `CDX10 Lesson B — Newton's laws` |
| Lesson C (delete test) | `CDX10 Lesson C — delete me` |
| Template | `CDX10 Lesson template` |
| Composition | `CDX10 Starter composition` |
| Library tags | `cdx10`, `forces`, `practical` |

### Media URLs

| Use | URL |
|-----|-----|
| Image (PNG) | `https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png` |
| Image (pick one) | any Wikimedia Commons “Original file” URL for *Isaac Newton* — record the URL you used |
| YouTube (long form) | `https://www.youtube.com/watch?v=aircAruvnKk` |
| YouTube (short form) | `https://youtu.be/aircAruvnKk` |
| YouTube (timestamp) | `https://www.youtube.com/watch?v=aircAruvnKk&t=90s` |
| Vimeo | `https://vimeo.com/76979871` |
| Direct MP4 | `https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4` |
| Audio (MP3) | `https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3` |
| PDF | `https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf` |
| Generic embed | `https://phet.colorado.edu/sims/html/forces-and-motion-basics/latest/forces-and-motion-basics_en.html` |
| Map | search `Sydney Opera House` |
| Bad URL (negative test) | `https://example.invalid/nothing.png` |

If the browser lets you upload a local file, also upload one small PNG/JPG you create or download (screenshot is fine) through each **Upload** control you find. If you cannot upload files at all, say so once and mark upload rows **N/A (no file access)**.

---

## Shared Console helpers

Read-only. Paste into DevTools Console and record the returned object.

### Block inventory (teacher canvas or student page)

```js
(() => {
  const root =
    document.querySelector('.lesson-blocks') ||
    document.querySelector('.teacher-layout__canvas') ||
    document.body;
  const nodes = [...root.querySelectorAll('[data-block-type]')];
  const types = nodes.map((el) => el.getAttribute('data-block-type'));
  const counts = {};
  for (const t of types) counts[t] = (counts[t] || 0) + 1;
  return {
    surface: document.querySelector('.lesson-blocks') ? 'student' : 'teacher',
    url: location.pathname,
    blockCount: nodes.length,
    distinctTypes: [...new Set(types)].sort(),
    counts
  };
})()
```

### Media health

```js
(() => {
  const imgs = [...document.querySelectorAll('img')].map((i) => ({
    src: (i.currentSrc || i.getAttribute('src') || '').slice(0, 140),
    ok: i.complete && i.naturalWidth > 0,
    alt: i.getAttribute('alt')
  }));
  const frames = [...document.querySelectorAll('iframe')].map((f) => ({
    src: (f.getAttribute('src') || '(srcdoc)').slice(0, 140),
    w: f.clientWidth,
    h: f.clientHeight
  }));
  const av = [...document.querySelectorAll('video, audio')].map((m) => ({
    tag: m.tagName.toLowerCase(),
    src: (m.currentSrc || m.getAttribute('src') || '').slice(0, 140),
    readyState: m.readyState,
    error: m.error ? m.error.code : null
  }));
  const staleHosts = [...document.querySelectorAll('[src],[href]')]
    .map((el) => el.getAttribute('src') || el.getAttribute('href'))
    .filter((u) => /teaching-api|teaching-hub\.|tasks-api|knowledge-api/.test(u || ''));
  return {
    brokenImages: imgs.filter((i) => !i.ok),
    imageCount: imgs.length,
    frames,
    media: av,
    staleHosts
  };
})()
```

### Layout overflow

```js
(() => {
  const vw = document.documentElement.clientWidth;
  const wide = [...document.querySelectorAll('body *')]
    .filter((el) => el.getBoundingClientRect().right > vw + 1 && el.offsetParent)
    .slice(0, 15)
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      cls: (el.className && el.className.toString().slice(0, 60)) || '',
      right: Math.round(el.getBoundingClientRect().right)
    }));
  return { viewport: vw, pageScrollsSideways: document.documentElement.scrollWidth > vw, wide };
})()
```

### Deleted-record sweep (run on any list page after Step 10)

```js
(() => {
  const text = document.body.innerText;
  const hits = ['CDX10 Lesson C', 'delete me'].filter((s) => text.includes(s));
  return { url: location.pathname, hits };
})()
```

---

## Step 0 — Sign in and baseline

1. Open https://life-hub.adam-russell.com/teaching/. Sign in with the passphrase.
2. Note what the Dashboard shows before you touch anything (classes, upcoming lessons, counts). Screenshot.
3. Open DevTools → Console and Network. Keep them open the whole run. Record every red Console line and every 4xx/5xx with its URL and step.
4. Click every rail item once: Dashboard, Chat, Classes, Scope & Sequences, Units, Lessons, Templates, Resource Library, Trash. Note any page that is blank, spins forever, shows raw ids/JSON, or looks unlike the others.
5. Note what is already in **Trash** (names only). You'll compare later.

## Step 1 — Class

1. Classes → **+** / **New class**. Fill every field the modal offers with the class values above. Save.
2. Check: does the new class appear in the Classes list, the rail “Your classes” list, and the Dashboard without a reload? After a reload?
3. Open the class. Check the heading shows the class name (not an id), the calendar shows Mon/Wed/Fri meeting days, Day / Week / Month switch.
4. **Class homepage:** open **Edit page** / homepage editor. Insert at least: heading, rich text, image (PNG URL), callout, and a **collection** block (homepage-only). Write a short welcome. **Save homepage**. Reload. Did it stick?
5. Open the class's student link (`/teaching/s/classes/…`) in a **private window** (no session). It must load with no sign-in gate and show the homepage you wrote.
6. Edit the class (rename to `CDX10 Year 9 Science (edited)`, then back). Is editing obvious? Is the edit reflected everywhere?

## Step 2 — Subject and scope & sequence

1. Scope & Sequences → **New Subject** `CDX10 Science`. Then **New scope** `CDX10 Year 9 Science scope` if that is a separate step. Note whether subject vs scope vs “Overall Scope & Sequence” is clear or confusing.
2. Open the scope. Is the timeline / week grid readable? Are dates `dd/mm/yy`?
3. Leave it empty for now — you'll come back after the unit exists.

## Step 3 — Unit

1. Units → **New unit** `CDX10 Forces and Motion`, Year 9, subject `CDX10 Science`. Fill every field offered.
2. Open the unit. Check: cover image control (**Change cover** → library / URL / upload — set the PNG; then **Remove cover**; then set it again), unit plan / notes, unit dates.
3. Write a short unit plan (3–4 lines) and **Save plan**. Reload. Did it stick?
4. **Tag the unit** using the @ / tag section on the unit page: tag it with the class `CDX10 Year 9 Science`, and any one person or page the search offers. Remove one tag. Reload. Do tags persist? Is it clear what a tag *does*?
5. **Schedule unit** to the class for the next two weeks. Does it appear on the class calendar and on the scope timeline? Is it the right dates?
6. Go back to the scope (Step 2). Is the unit on it? Try **Compare order** if present (open and close).

## Step 4 — Lessons A, B, C

1. Create Lesson A from **Lessons → New lesson** (or the unit's add-lesson control — note which exists and whether both exist; that's a RED finding if they behave differently). Put it in unit `CDX10 Forces and Motion`.
2. Create Lesson B from the **other** entry point (command palette **New Lesson**, unit page, or class calendar — use whichever you didn't use for A).
3. Create Lesson C any way. Give it one heading and one rich text block. Leave it for Step 10.
4. Check the unit page lists A, B, C **in order**, and that reordering (Move up / Move down / drag) works and sticks after reload.
5. In Lesson A, set: title, **Pedagogical mode** (pick any), **cover** (Change cover → PNG), **outcomes** (open the outcomes picker, pick 2, save). Note anything confusing in Lesson options / page options.

## Step 5 — Every block type in Lesson A

Insert each block from the **insert palette** (the `+` / Blocks panel). For every block:

1. Insert it. Note: icon present? description sensible? where did it land (top / bottom / at cursor)?
2. **Fill it with real content** (see column 3). Use the editor, not defaults.
3. Click out. Does it render as the student would see it?
4. Record a row in the **Block matrix** (report template).

After every 8 blocks: **Save**, **reload the page**, and confirm everything you filled is still there. Lost content is P0.

| Family | Type | Content to put in |
|--------|------|------------------|
| Basic | `heading` | `Do now: what makes things move?` — try H2 and H3 if levels exist |
| Basic | `rich_text` | 2 paragraphs, **bold**, *italic*, a bulleted list, a numbered list, and a link to `https://en.wikipedia.org/wiki/Newton%27s_laws_of_motion` |
| Basic | `callout` | `Safety: trolleys stay on the bench.` — try every callout style/tone offered |
| Basic | `quote` | `If I have seen further it is by standing on the shoulders of Giants.` — attribution `Isaac Newton, 1675` |
| Basic | `definition` | Term `Force`, meaning `A push or a pull that can change an object's motion.` |
| Basic | `divider` | — (check it's visible and not doubled) |
| Basic | `code` | Python: `force = mass * acceleration` plus a comment line; pick language if offered; caption `F = ma in code` |
| Basic | `html` | `<p><mark>Highlighted</mark> HTML block</p>` — check it is sanitised but shows |
| Basic | `html_app` | a tiny counter: `<button onclick="this.textContent=+this.textContent+1">0</button>` — click it in teacher and student view |
| Media | `image` | PNG URL; set alt text + caption. Then try the Newton image, library pick, upload, and the bad URL. Check the bad URL shows a clear error, not a silent grey box |
| Media | `gallery` | 3 images (PNG, Newton, and one from library/upload); captions; swipe/grid both if offered |
| Media | `video` | **each** of: YouTube long, YouTube short, YouTube timestamp, Vimeo, direct MP4, and upload/library if offered. One block per URL or swap the URL in one block — record each result separately. Press play on each. |
| Media | `embed` | PhET URL. Then the **Map** variant (`Sydney Opera House`), **PDF** variant (PDF URL), and **Slides** / **Document** variants with any public Google link you can find (or mark N/A) |
| Media | `audio` | MP3 URL. Press play |
| Media | `attachment` | PDF URL (and upload if offered). Click it — does it download/open? Is filename + size shown? |
| Teaching | `accordion` | 3 items: `First law`, `Second law`, `Third law`, one sentence each |
| Teaching | `table` | 3 cols × 4 rows: Object / Mass (kg) / Force (N); add a row and a column, delete one |
| Teaching | `question_set` | 1 multiple choice (4 options, 1 correct), 1 short answer, with feedback if offered |
| Teaching | `timeline` | 4 events: 1687 Principia, 1905 Special relativity, 1915 General relativity, 1969 Moon landing |
| Teaching | `card_stack` | 3 cards with image + text |
| Teaching | `outcomes` | — should list the 2 outcomes you picked in Step 4. Does it update if you change outcomes? |
| Learning | `flashcards` | 4 cards: Force / Mass / Acceleration / Inertia, front + back |
| Learning | `cloze` | `An object at {rest} stays at rest unless acted on by an unbalanced {force}.` (use whatever blank syntax the editor wants — note if it's not obvious) |
| Learning | `self_check` | Prompt `Explain why seatbelts matter using Newton's first law.` + model answer |
| Visualisation | `chart` | Bar chart: Mass 1/2/3/4 kg vs Acceleration 4/2/1.33/1 m/s². Try a second chart type. Axis labels |
| Visualisation | `equation` | `F = ma` and `a = \frac{v - u}{t}` |
| Visualisation | `diagram` | 3 labelled boxes + arrows: `Force → Acceleration → Change in velocity` |
| Visualisation | `mind_map` | Centre `Forces`, 4 branches: gravity, friction, tension, normal |
| Visualisation | `concept_map` | `Mass` —`resists`→ `Acceleration`; `Force` —`causes`→ `Acceleration` |
| Visualisation | `whiteboard` | Draw a line, a shape, write text. Does it save? |
| Layout | `section` | Title `Practical`, put a rich text + image **inside** it |
| Layout | `columns` | 2 columns: image left, rich text right. Then try 3 columns / change widths / move a block between columns |
| Layout | `tabs` | 3 tabs `Before` / `During` / `After`, different content in each |
| Layout | `spacer` | — check it's visible in the editor but not ugly for students |
| Compositions | (any) | Select 3 blocks → **Save as composition** `CDX10 Starter composition`. Insert it into Lesson B. Note the **Keep in sync / copy** choice — is it understandable? Edit the source; does the synced copy update? |

Also on Lesson A:

- **Block operations** on at least 3 different blocks: move up/down, drag, duplicate, delete, undo (Ctrl/Cmd+Z), visibility (teacher-only vs student), copy/paste. Note any block where an operation is missing or behaves differently.
- **Hide blocks** panel (`[`), **Full screen**, **Print / A4 preview**, **Version history** (open; save a checkpoint; **do not restore** unless it's a CDX10 lesson — then do restore once and check it worked), **Export JSON** (does it download?).
- **Save as lesson template** → `CDX10 Lesson template`. Templates page: is it there? Create a new lesson **From template** (`CDX10 Lesson D — from template`). Did all blocks and media come across?
- **Duplicate** Lesson B. Is the copy named sensibly? Is it in the same unit?

## Step 6 — Tagging

There are (at least) two tag systems. Test both and report whether they feel like one feature or two.

1. **Lesson @-tags** (tag section on the lesson page): tag Lesson A with the class, the unit, and Lesson B. Remove one. Reload. Persist?
2. **Library tags** (Lessons list → select lesson(s) → tag action): add `cdx10`, `forces`, `practical` to A and B (bulk if possible). Add `cdx10` to C.
3. Lessons list → **All tags** filter → pick `forces`. Only A and B should show. Then search box: `practical`. Then `Newton`.
4. Do @-tags on a lesson show anywhere on the unit or class page? Do library tags show on the lesson page? Report the gap as RED/FLOW if they don't connect.
5. Command palette (rail search): search `CDX10`, `Forces`, `Newton`. Do lessons, units and classes all come back? Does clicking each open the right page?

## Step 7 — Resource Library

1. Open Resource Library. Are the images/PDF/audio you used in Lesson A listed? (They may not be if they were URLs — note what the library actually holds and whether that's what you'd expect.)
2. Upload a file (if you can). Rename it if possible. Use it from a lesson via **Choose from library**.
3. Open a preview. Close it. Is there any way to see **where** a resource is used?
4. Check **Add from Drive** opens (cancel it).

## Step 8 — Schedule and calendar

1. Schedule Lesson A and B to `CDX10 Year 9 Science` on two meeting days next week (from the class calendar or the lesson — note which paths exist).
2. Check they appear on: class calendar (Day / Week / Month), Teaching calendar (`/teaching/calendar`), Dashboard upcoming. Click each — does it open the lesson?
3. **Change date** of Lesson B. Does every view update?
4. Try to schedule Lesson A to the same slot twice. Is the **Already scheduled** handling clear?

## Step 9 — Publish and student view

1. **Publish** Lesson A and Lesson B. Is it clear what's published vs draft vs **Unpublished changes**?
2. Open `/teaching/s/lessons/{A id}` in a **private window** (no session). Then the class path `/teaching/s/classes/{class}/lessons/{A id}`. Then `/teaching/s/units/{unit id}`.
3. On the student page: run **Block inventory** and **Media health**. Compare `distinctTypes` with the teacher canvas. Every block in the teacher view should be present unless marked teacher-only.
4. Click every interactive thing as a student: answer the questions (right and wrong), flip flashcards, fill the cloze, self-check reveal, accordion, tabs, card stack, html_app counter, play video/audio, open attachment.
5. Make an edit on Lesson A as teacher (change the heading). Before re-publishing, does the student page still show the old heading? After re-publish, the new one?
6. Student chrome must not show teacher controls (trash, publish, AI, edit).

## Step 10 — Delete means gone

1. **Trash Lesson C** (from the lesson's menu). Then, **without reloading**, check every place it could linger:
   - Lessons list (all filters incl. `cdx10` tag, search `delete me`)
   - Unit `CDX10 Forces and Motion` lesson list
   - Class calendar / Teaching calendar / Dashboard (schedule C first if you didn't)
   - Command palette search `delete me`
   - Lesson @-tag search (tag something with `delete me` — it must not be offered)
   - Insert palette / compositions / templates
   - Student URL `/teaching/s/lessons/{C id}` (private window) — should be gone or a clear “not available”, not the old lesson
   - Life Hub home (`/`) Teaching pulse/preview and Life calendar
2. **Reload** and repeat the sweep with the **Deleted-record sweep** helper on each list page.
3. Trash: is C there? **Restore** it. Does it come back to the unit in its old position, with its tags and schedule? Trash it again.
4. **Delete permanently** from Trash. Confirm card (not a browser `confirm()` popup)? After that, sweep again.
5. Trash the **duplicate of Lesson B** from Step 5 and the unit-level / class-level delete flows if they exist **only for CDX10 records** — but **do not delete the class or unit** you still need; just open their delete/archive confirm and **Cancel**, noting what it says will happen to child lessons.

## Step 11 — Other surfaces (light touch)

- **Chat** `/teaching/chat` and the lesson AI panel: open, check portraits/names/composer render, close. No sends.
- **Alchemy Lab / Find connections**: open and close only.
- **Lessons list** views: Cards / Compact / Table if offered, sorts (Title A–Z, Last edited, Date created), filters (status, unit, subject, mode, Needs review, Possible duplicates). Does `CDX10` content behave?
- **Dark mode** if the OS/browser can switch: re-check Lesson A canvas, the insert palette, and a modal.
- **Keyboard**: Tab through the New lesson modal and the insert palette; Enter / Escape behave?

## Step 12 — 390px pass

Resize to 390 × 844 (or device toolbar iPhone 12/13/14). On each, run **Layout overflow** and look for clipped text, overlapping chrome, and action buttons hidden under the fold or < 44px tall:

- Dashboard, Classes, Units, Lessons list
- New class / New unit / New lesson modals — can you reach **Save** / **Cancel** with the keyboard open?
- Lesson A teacher canvas — insert palette, a block editor (table, chart), Save/Publish
- Lesson A student page — every block readable without sideways scroll; video/embed width
- Trash restore/delete confirm card

## Step 13 — Wrap-up

1. List every record you created (name + id + still exists / trashed / permanently deleted).
2. Leave Lesson A, Lesson B, the unit, class and scope in place so Adam can look at them. Unpublish nothing.
3. Write the report below.

---

## What not to do

- Don't touch non-`CDX10` records.
- Don't use AI to generate content.
- Don't click Backup Now / Backup to GitHub.
- Don't paste the passphrase, cookies or tokens anywhere in the report.
- Don't stop at the first failure. Record it and move on.
- Don't report a “pass” because a page returned 200. A page that loads and looks wrong is a finding.

---

## Report template

```markdown
# Teaching Hub — Codex build-through run 10 — YYYY-MM-DD HH:MM

## Summary
- Run length:
- Viewports:
- Uploads possible: yes / no
- Counts: P0 _ · P1 _ · P2 _ · P3 _
- Top 5 things to fix first (one line each, link to finding ID):

## Records created
| Name | Kind | ID | Final state |
|------|------|----|-------------|

## Block matrix (Lesson A)
| Type | Inserted | Filled | Survived reload | Teacher render | Student render | Interactive (student) | Finding IDs |
|------|----------|--------|-----------------|----------------|----------------|-----------------------|-------------|
| heading | ✅/❌ | | | | | n/a | |
| … every type from Step 5 … | | | | | | | |

## Media matrix
| Source | Block | Teacher | Student | Evidence (src / naturalWidth / readyState / iframe size) | Finding |
|--------|-------|---------|---------|----------------------------------------------------------|---------|
| YouTube long | video | | | | |
| YouTube short | video | | | | |
| YouTube timestamp | video | | | | |
| Vimeo | video | | | | |
| MP4 | video | | | | |
| PNG URL | image | | | | |
| Newton (Commons) | image | | | | |
| Bad URL | image | | | | |
| Upload | image | | | | |
| Library pick | image | | | | |
| MP3 | audio | | | | |
| PDF | embed:pdf / attachment | | | | |
| PhET | embed | | | | |
| Map | embed:google_maps | | | | |
| Slides / Docs | embed | | | | |

## Delete sweep (Lesson C)
| Surface | Before reload | After reload | After permanent delete |
|---------|---------------|--------------|------------------------|
| Lessons list | gone / LINGERS | | |
| Unit page | | | |
| Class calendar | | | |
| Teaching calendar | | | |
| Dashboard | | | |
| Command palette | | | |
| @-tag search | | | |
| Student URL | | | |
| Life Hub home / calendar | | | |

## Tagging
- @-tags (lesson / unit): works? persists? visible where?
- Library tags: works? filter? search?
- Do the two systems connect? (RED/FLOW finding if not)

## Findings
### F1 — [BRK|VIS|LAY|RED|FLOW|ENH] P0–P3 — short title
- **Where:** URL · surface (teacher canvas / student page / modal / list) · viewport
- **Did:**
- **Got:**
- **Expected:**
- **Evidence:** screenshot name · Console line · Network `METHOD /path → status` · helper output
- **Reload / private window changes it?**
- **Fix idea:**

### F2 — …

## Workflow notes
Free text: where you hesitated, what took too many clicks, what you'd change about the order of building a unit. Name the step.

## Console and network errors
| Step | Kind | Text / request | Status |
|------|------|----------------|--------|

## Not tested / blocked
- item — why
```
