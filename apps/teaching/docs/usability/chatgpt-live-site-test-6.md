# Teaching Hub — ChatGPT live usability test (run 6)

Copy everything from **Operator brief** to the end of **Report template** into ChatGPT (browser / computer-use). Fill `{{PASSPHRASE}}` first. Do not invent a passphrase.

Run 5 (17 Aug 2026) proved create / publish / print chrome, but **Ann and Hammond stalled** before any confirm card or review. That transport was patched: SSE keep-alives, a 60-second function budget, and visible phase lines (**Thinking…** → **Searching the web…** → **Writing the reply…**). **This run retests AI**, then sweeps the balanced teacher path: create, nested blocks, publish, student view, print, search, library, and schedule.

---

## Operator brief

You are a careful teacher testing **Teaching Hub** in a real browser. Follow the steps in order. Use the exact values. Do not invent UI. Do not skip Accept on mutating AI proposals.

**Site:** https://teaching-hub.adam-russell.com  
**Passphrase:** `{{PASSPHRASE}}`  
**Timebox:** about 40 minutes  
**Goal:** prove AI can finish a proposal and a review with live phase copy, and that create → blocks → publish → student → print → search → library → schedule still work.

### How to work

- Wait for each page or modal to finish loading.
- Missing control: wait 3 seconds, hard-refresh once, retry. Still missing → **fail** and continue.
- Mutating AI: canvas must **not** change until **Accept** (or **Accept selected**).
- The chat names its phase: **Thinking…**, then **Searching the web…**, then **Writing the reply…**. A phase line that keeps advancing means the request is alive.
- A full AI turn can take up to **60 seconds**. Fail an AI step only when the phase line is stuck on **one** phase for **60 seconds** with no streamed text, no confirm card, and no error.
- If the agent is **streaming text or using tools**, wait up to **2 minutes** for a confirm card or error. After 2 minutes with neither → fail.
- Stall copy like **The AI connection stalled before a reply** means the hang-fix fired — record it as an AI fail even if chrome elsewhere works.
- One retry only on any AI step (Reject + same prompt once, or Send once more). Then continue.
- Do not trash English Advanced / English Standard / existing school classes.
- Do not click **Backup Now** or **Backup to GitHub**.
- Do not Accept **replace lesson** except on the **new** lesson created in this run (`Phase check multimedia`).

### Recover (prefer) or create

Reuse subject / class / unit when they exist. Always create a **new** lesson for the AI stress test so old canvas state cannot mask failures.

| Role | Prefer | Fallback if missing |
|------|--------|---------------------|
| Subject | `Retrieval Practice` | Create subject `Phase Check` (title only) |
| Class | `11 Retrieve A` | `11 Phase A` (code `11PHASE`, 2026, Year 12) |
| Unit | `Testing Effect` | Create unit `Phase Unit` (Year 12, same subject) |
| Lesson | Create **new** `Phase check starter` → retitle `Phase check multimedia` | — |

If you must create class/unit: they must **not** flash **not found**. Do not edit or replace `Retrieval in 20 minutes` or `Nine-block dual coding` unless you open them only to confirm they exist and leave them alone.

### Exact values (this run)

| Field | Value |
|-------|--------|
| Create-modal lesson title | `Phase check starter` |
| On-page lesson title | `Phase check multimedia` |
| Pedagogical mode | `Seminar` |
| Manual heading | `Do now: label the diagram` |
| Manual callout title | `Silent start` |
| Manual callout body | `Name one image that would carry the idea without text.` |
| Nested rich text | `This sits inside the left column.` |
| Unique phrase AI must include | `phase check pairs search with blocks` |
| Clare unique phrase (if used) | `scope chip must follow selection` |
| Schedule: look for | today’s date or **Today** on the class calendar |

### Required after Ann Accept (minimum)

At least **six** distinct `data-block-type` values, **including** both `image` and `video`, plus the unique phrase. Prefer nine if Ann offers them; do not fail solely for missing optional types if image + video + phrase + six types are present.

Must include:

1. `heading` or `rich_text` containing `phase check pairs search with blocks`
2. `image` (visible `img[src^="https://"]`)
3. `video` (YouTube or Vimeo player)
4. At least three more types from: `callout`, `mind_map`, `question_set`, `flashcards`, `table`, `definition`, `gallery`, `timeline`

---

## Step 0 — Sign in

1. Hard-refresh https://teaching-hub.adam-russell.com/sign-in (or the dashboard if already signed in).
2. Brand **Teaching Hub**, title **Sign in**, label **Passphrase**, button **Sign in**.
3. Enter `{{PASSPHRASE}}`. Dashboard. Rail brand one line. **Sign out** is a header **icon** (aria-label **Sign out**), not a rail pill.

**Pass:** signed in; chrome present.  
**Fail:** invalid passphrase; stacked rail brand; Sign out on the rail.

---

## Step 1 — Fresh lesson (no false not-found)

1. Search Lessons for `phase check multimedia`. If it exists from a prior attempt, open it and skip create — note “reused”.
2. Otherwise **+** → **Lesson**. Modal **New lesson**.
3. Title `Phase check starter`. Unit `Testing Effect` (or `Phase Unit`). Pedagogical mode **Seminar**. **Save**.
4. Must land on `/lessons/…` with the editor. Must **not** say **Lesson not found**.
5. Change title (aria-label **Lesson title**) to `Phase check multimedia`. Wait for **Saved**. Mode stays **Seminar**.

**Pass:** editor open; title saved; not a school English lesson.  
**Fail:** not-found; landed in the wrong lesson; title did not stick.

---

## Step 2 — Manual blocks + nested column

Stay on `Phase check multimedia`.

1. Palette **Teaching** (or equivalent) → add a **Heading**. Text: `Do now: label the diagram`.
2. Add a **Callout**. Title `Silent start`. Body `Name one image that would carry the idea without text.`
3. Palette **Layout** → **Columns**. In the **left** column, nested add → **Rich text** → `This sits inside the left column.`
4. Wait for **Saved**.
5. Refresh the lesson URL once. Heading, callout, columns, and nested text must still be present (nested text inside the left column, not only at root).

**Pass:** three block kinds persist; nested text is inside the column.  
**Fail:** nested add at root; click no-ops; content lost on refresh.

---

## Step 3 — Ann: phases, confirm card, Accept (core AI check)

1. Open chat (`Open chat` / `]`). Select **Ann O'Tation**.
2. Send **exactly**:

```
Keep the existing starter blocks. Insert additional blocks below them for a Year 12 psychology mini-lesson on dual coding. Australian English.

You MUST propose at least six different Teaching Hub block types in one proposal. Include ALL of the following:
- rich_text or callout that contains this exact phrase: phase check pairs search with blocks
- image (real https URL from the search pack, with meaningful alt text)
- video (YouTube or Vimeo from the search pack)
- mind_map OR question_set OR flashcards (at least one of these)
- one more distinct type (heading, table, definition, gallery, or timeline)

Ground image and video URLs in the search pack. Do not invent URLs. Do not use html, html_app, or collection.
Do not replace the whole lesson unless you must — prefer insert_blocks. Keep the heading "Do now: label the diagram".
If web search is unavailable, say so clearly, omit image and video, and still build the other blocks.
```

3. Record the phase lines you see, in order. Expected: **Thinking…** then **Searching the web…** then **Writing the reply…** (then streamed text and/or a confirm card).
4. Wait for a **confirm card** (`confirm-card`) with **Accept** / **Reject** (or **Accept selected**).
5. Before Accept: canvas must still show `Do now: label the diagram` and the nested column text.
6. Click **Accept** (leave all checkboxes on if **Accept selected**).
7. If the first proposal lacks image or video: **Reject**, send the same prompt once, Accept the second card. Note both attempts.
8. If **Media not in search pack** or **search unavailable**: record it. One retry only.

**Pass:** phases advanced; confirm card before mutation; Accept applied; unique phrase present; starter heading kept (unless you accepted replace on this new lesson only — note which).  
**Fail:** frozen phase >60s; stall error; silent write; no card; Accept no-op; phrase missing; whole school lesson wiped.

---

## Step 4 — Count types and inspect media

1. Count distinct `data-block-type` on the canvas (include nested). List every type.
2. **Image:** visible `img[src^="https://"]`. Fail on **Unsafe** / **unavailable** / broken / empty frame.
3. **Video:** YouTube (`youtube-nocookie.com` or `youtube.com`) or Vimeo player. Fail on **Video unavailable.** or no player.
4. **Flashcards** (if present): every card has front and back (not **Front (required to publish)**).
5. Unique phrase `phase check pairs search with blocks` visible.

**Pass:** ≥6 types including working image and video; phrase present.  
**Fail:** under 6; image/video missing or broken; phrase absent.

---

## Step 5 — Hammond review-only

1. Agent picker → **General Hammond**.
2. Send exactly:

```
Review this lesson for a Year 12 class. Do not change any blocks. Do not replace the lesson.
```

3. Expect phases, then prose review **or** a confirm card that you **Reject**.
4. Canvas must still match Step 4 afterwards.

**Pass:** review without destroying the lesson.  
**Fail:** stall; silent rewrite; Accept you did not mean; canvas wiped.

---

## Step 6 — Publish + student lesson view

1. **Save**. Wait for **Saved**.
2. **Publish**. Must **not** say **Flashcards need front and back text on every card to publish**.
3. **View as student** opens a **new tab** (`/s/lessons/…`).
4. Student view is read-only (no palette, no chat, no Accept). Phrase + image + video still present (lazy video frame is enough).
5. Close the student tab.

**Pass:** published; new tab; read-only; media still there.  
**Fail:** publish blocked; same-tab hijack; student missing phrase or media.

---

## Step 7 — Print in-page dialog

Stay in the teacher editor for `Phase check multimedia`.

1. **Print** (aria-label **Print**).
2. In-page dialog titled **Print**, with lesson title / print document, buttons **Close** and **Print**.
3. Click **Close**. Editor remains.
4. **Fail** if nothing happens, or only `about:blank` + **Allow pop-ups to print this lesson.**

**Pass:** in-page print UI; editor intact.  
**Fail:** silent no-op; pop-up alert + blank tab; editor destroyed.

---

## Step 8 — Search commands

1. ⌘/Ctrl+K or rail **Search**.
2. Type `print`. Action **Print lesson** should appear while you are on the lesson. Note it; Esc to close (or trigger and Close the print dialog).
3. Search `new lesson`. Action **New Lesson**. Trigger → **New lesson** modal. **Cancel**.

**Pass:** both actions resolve; Cancel is safe.  
**Fail:** search does nothing; New Lesson navigates to a blank/error page.

---

## Step 9 — Lessons library smoke

1. Rail **Lessons**. Header **Lessons**. Search `phase check multimedia`. The lesson row appears.
2. Filters present (aria-labels): **Filter by unit**, **Filter by subject**, **Filter by pedagogical mode**, **Filter by status** (or equivalent).
3. Set mode filter to **Seminar**. The lesson remains visible. Clear the filter.
4. View tabs (aria-label **Lesson views**): open **Table**, confirm a Mode (or similar) column, return to **Library**.

**Pass:** lesson found; mode filter works; table view usable.  
**Fail:** lesson missing; filters absent; table broken.

---

## Step 10 — Class schedule smoke

1. Open class `11 Retrieve A` (or `11 Phase A`). Must not say **Class not found**.
2. Calendar: **Week** / **Month** / **Timeline**; **Today** exists.
3. **If** `Phase check multimedia` or another test-unit lesson is already on today’s detail → schedule persist **pass**. Skip the wizard.
4. **If** empty: **Schedule a lesson** (`+`). Choose the test unit → **Next** → **Next** → **Confirm** if enabled.
5. After Confirm, **before refresh**, today’s detail must show a scheduled lesson title. **Fail** if preview listed a row but the day still says **No lessons scheduled this day.**
6. Optional: **View as student** on the class → new tab `/s/classes/…`, read-only, class found. Close tab.

**Pass:** class found; schedule already visible or visible immediately after Confirm.  
**Fail:** Class not found; empty day after successful Confirm.

---

## Step 11 — Design / chrome sweep (fail only clear misses)

| Check | Expected |
|-------|----------|
| Agent avatars | Circular; switching Ann ↔ Hammond does not full-reload the site. |
| Confirm card | Kit `confirm-card` with Accept/Reject — not a native `confirm()`. |
| Print | In-page dialog, not `about:blank` + pop-up warning. |
| Phase lines | At least two of Thinking / Searching / Writing appeared during Ann. |
| Focus | Tab from Search: Wave-style ring, not orange High Sea (note if not inspectable). |
| Native prompts | No `window.prompt` / `window.alert` on Print, New lesson Cancel, or schedule. |

---

## What not to do

- Do not use `teaching-hub-local` on production unless it works.
- Do not Accept replace-lesson except on **Phase check multimedia**.
- Do not open AI on **Retrieval in 20 minutes** or rewrite English Advanced content.
- Do not wait past 60 seconds of a frozen phase with no stream / card / error.
- Do not wait past 2 minutes of streaming with no card and no error.
- Do not Backup Now / empty Trash / permanently delete.

---

## Report template

Paste this back when finished.

```
# Teaching Hub usability report (run 6)

Date / time:
Browser:
Signed in: yes/no
Lesson URL:
Records used: Retrieval Practice + Phase check multimedia / fallback Phase Check / mixed

## Results
| Step | Result (pass/fail) | Notes |
|------|--------------------|-------|
| 0 Sign in |  |  |
| 1 Fresh lesson |  |  |
| 2 Manual + nested column |  |  |
| 3 Ann phases + confirm + Accept |  |  |
| 4 Block types + media |  |  |
| 5 Hammond review-only |  |  |
| 6 Publish + student view |  |  |
| 7 Print in-page dialog |  |  |
| 8 Search commands |  |  |
| 9 Lessons library |  |  |
| 10 Class schedule |  |  |
| 11 Design sweep |  |  |

## AI
Confirm card before canvas change: yes/no
Proposal kind(s): insert blocks / replace lesson / other:
Retries: 0/1
Phases seen (list in order):
Phase stall (>60s frozen on one phase): yes/no
Stream wait (>2 min, no card): yes/no
Stall error shown: yes/no
Search unavailable message: yes/no
Media not in search pack error: yes/no
Unique phrase present: yes/no
Starter heading kept: yes/no
Hammond mutated canvas: yes/no

## Blocks / media
Distinct data-block-type count:
Types found:
Includes image: yes/no
Includes video: yes/no
Image visible https photo: yes/no
Image broken/unavailable: yes/no
Video YouTube or Vimeo player: yes/no
Video unavailable copy: yes/no
Nested column text after refresh: yes/no
Flashcards complete (if present): yes/no/n/a

## Chrome
Print in-page dialog: yes/no
Publish blocked by empty flashcards: yes/no
Student lesson new tab + read-only: yes/no
Search Print lesson + New Lesson: yes/no
Library mode filter: yes/no
Schedule visible after Confirm (or already): yes/no
Class not-found: yes/no

## Bugs (one block per issue)
Severity: blocker / major / minor
Step:
Expected:
Actual:
URL:
Screenshot:

## Verdict
Ship-ready for AI phases + balanced teacher path: yes / no
One sentence why:
```
