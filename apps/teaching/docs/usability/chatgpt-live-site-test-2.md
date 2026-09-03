# Teaching Hub — ChatGPT live usability test (run 2)

Copy everything from **Operator brief** to the end of **Report template** into ChatGPT (browser / computer-use). Fill `{{PASSPHRASE}}` first. Do not invent a passphrase.

This is a **follow-up** to run 1 (2026-08-17). Run 1 failed create-class / create-unit (false “not found”) and blocked on Ann O’Tation stuck on **Thinking…**. This script retests those bugs, then the AI builder, nested blocks, publish, search, and design-kit chrome that never ran.

---

## Operator brief

You are a careful teacher testing **Teaching Hub** in a real browser. Follow the steps in order. Use the exact values. Do not improvise titles, skip Accept on AI proposals, or invent UI that is not on screen.

**Site:** https://teaching-hub.adam-russell.com  
**Passphrase:** `{{PASSPHRASE}}`  
**Timebox:** about 35 minutes  
**Goal:** prove the previous blockers are gone, that lesson AI proposes then waits for Accept, and that chrome matches the hub design kit.

### How to work

- Wait for each page or modal to finish loading before the next click.
- If a control is missing, wait 3 seconds, then hard-refresh once and retry that step. If it is still missing, **fail the step** and continue.
- After every AI proposal, look for a **confirm card** (class `confirm-card`) with **Accept** / **Reject** (or **Accept selected**). The lesson **must not change until Accept**.
- If chat shows **Thinking…**, wait. After **25 seconds** with no confirm card and no error, **fail** that AI step. Do not sit for a full minute. A useful error looks like **The AI connection stalled before a reply. Try again in a moment.** That means the hang-fix worked but the proposal still failed — record both.
- Record every mismatch: expected, actual, URL, screenshot if you can.
- Do not delete existing English Advanced / English Standard content. Create the **new** records below (do not reuse run 1’s `Usability Psychology` / `11 Psych A` / `Cognitive Load`).

### Exact values (use these, not close variants)

| Field | Value |
|-------|--------|
| Subject title | `Schema & Design` |
| Class title | `11 Schema A` |
| Class code | `11SCHEMA` |
| Academic year | `2026` |
| Year | `Year 12` (if missing, pick the only year listed and note it) |
| Unit title | `Dual Coding` |
| Lesson title (create modal) | `Imagery starter` |
| Lesson title (after open) | `Imagery and working memory` |
| Pedagogical mode | `Lab` |
| Manual heading | `Do now: two pictures` |
| Manual callout title | `Silent start` |
| Manual callout body | `Sketch one image that would help you remember this idea.` |
| AI heading | `Dual coding: two channels` |
| Unique phrase AI must include | `visual and verbal channels must not compete` |
| AI callout title | `Teacher pause` |
| AI callout body | `Stop before adding a second explanation on the same slide.` |
| Nested rich text | `This sits inside the section.` |
| Rewrite must keep | `Do now: two pictures` must still exist as a heading after Reject of the rewrite (see Step 7). |

---

## Step 0 — Sign in and chrome

1. Open https://teaching-hub.adam-russell.com/sign-in
2. Confirm: brand **Teaching Hub**, title **Sign in**, supporting **Curriculum, lessons, and student publishing.**, field label **Passphrase**, button **Sign in**.
3. In DevTools or View Source if you can: `<html>` has `data-hub="teaching"` and `lang="en"`. If you cannot inspect, skip and note “not inspected”.
4. Enter `{{PASSPHRASE}}`. Click **Sign in**.
5. Dashboard: left rail brand is a **single line** **Teaching Hub** (not a stacked two-line hero). Nav includes **Dashboard**, **Classes**, **Scope & Sequences**, **Units**, **Lessons**, **Templates**, **Resource Library**, **Trash**.
6. **Sign out** must be an **icon button** (aria-label **Sign out**) at the **canvas top-right**, not a labelled pill on the left rail. There must be no rail button whose visible text is `Sign out` or `Log out`.
7. Skip link: Tab once from the address bar / page start if practical; **Skip to content** is allowed.

**Pass:** signed in; rail brand one line; Sign out is a header icon, not a rail pill.  
**Fail:** `Invalid passphrase`, stacked rail title, Sign out labelled on the rail, or no dashboard.

---

## Step 1 — Create subject

1. Dashboard **+** (aria-label **Create**).
2. Menu: **Class**, **Subject**, **Unit**, **Lesson**, **Scope & Sequence**.
3. **Subject**. Modal title **New subject**. Only field **Title**. No Year.
4. `Schema & Design`. **Save**.
5. Stay on the dashboard. No “not found” page.

**Pass:** modal closes; still on dashboard.  
**Fail:** year field, Save error, or navigation to a missing page.

---

## Step 2 — Create class (regression: no false not-found)

1. **+** → **Class**. Modal **New class**.
2. Title `11 Schema A`. Code `11SCHEMA`. Academic year `2026`. Year `Year 12`. Subject `Schema & Design`.
3. After choosing Year, Subject list still includes **Schema & Design**. Labels must not look like `Year 12 Schema & Design`.
4. Click **Save**. Watch the next screen **immediately** (do not refresh first).
5. You must land on `/classes/…` with title **11 Schema A** and **View as student**.
6. **Fail this step** if you see **Class not found** at any moment, even if a later refresh shows the class. Note the URL.

**Pass:** class page opens on first navigation with the title; no not-found flash.  
**Fail:** not-found page, missing subject, year-prefixed label, or Save error.

---

## Step 3 — Create unit (same regression)

1. **+** → **Unit** (or **Units** then **+**). Modal **New unit**.
2. Title `Dual Coding`. Year `Year 12`. Subject `Schema & Design`.
3. **Save**. Watch immediately.
4. Land on `/units/…` titled **Dual Coding**.
5. **Fail** if **Unit not found** appears at any moment before a refresh.

**Pass:** unit page on first navigation.  
**Fail:** not-found flash, subject missing, or error.

---

## Step 4 — Lesson values

1. **+** → **Lesson**. Modal **New lesson**.
2. Title `Imagery starter`. Unit `Dual Coding`. Pedagogical mode: change default **Lesson** to **Lab**.
3. **Save**. Land in `/lessons/…` editor. Must not show **Lesson not found**.
4. Builder has three regions: left **blocks palette**, centre **page**, right **chat** (or a floating **Open chat** if chat is shelved).
5. Palette tab **Blocks**. Families include **Basic**, **Media**, **Teaching**, **Learning**, **Visualisation**, **Layout**.
6. Change title field (aria-label **Lesson title**) to `Imagery and working memory`. Wait for **Saved**.
7. Mode is still **Lab**. If it reset, set **Lab** again and wait for **Saved**.

**Pass:** editor, title stuck, mode Lab, palette families present.  
**Fail:** not-found, mode reset that will not stick, or missing palette/chat chrome.

---

## Step 5 — Manual blocks

If the palette is hidden, press `[` or show it.

1. **Basic** → click **Heading** (do not drag).
2. Heading text (aria-label **Heading text**): `Do now: two pictures`
3. Click **Callout**. Title `Silent start`. Body `Sketch one image that would help you remember this idea.`
4. Wait for **Saved**.
5. Canvas order: heading then callout, exact copy.

**Pass:** both blocks, exact text, saved.  
**Fail:** click does nothing, wrong nesting, or text lost after a refresh of this lesson URL.

---

## Step 6 — AI insert (the previous blocker)

1. If there is no chat column, **Open chat** (aria-label) or `]`.
2. Empty state (if the thread is empty): **Ask an agent to build or edit this lesson.**
3. Agent picker aria-label **AI agents**. Select **Ann O'Tation** (first avatar; title tooltip). Avatars should look **circular**, not square with sharp corners.
4. Composer placeholder **Ask the selected agent…**. Button **Send** (class should look like a primary `.btn`, not a random browser default).
5. Send **exactly**:

```
Keep the existing starter heading and callout.

After them, insert these blocks:
1. A Heading whose text is exactly: Dual coding: two channels
2. A Rich text paragraph that includes this exact phrase: visual and verbal channels must not compete
3. A Callout whose title is exactly: Teacher pause
   and whose body is: Stop before adding a second explanation on the same slide.

Do not replace the whole lesson. Insert after the existing blocks.
```

6. Clock the wait:
   - Confirm card should appear (title like **Proposal: insert blocks**).
   - If you only see **Thinking…** for **25 seconds** with no card and no error → **fail** (hang not fixed).
   - If you see the stall / try-again error → hang-fix **pass**, proposal **fail**. Stop this step; do not invent a workaround. Continue to Step 8 (nested) so publish can still be tested with manual blocks only. Note that AI Accept did not run.
7. Before Accept: canvas still has only the two manual blocks.
8. Click **Accept** (or **Accept selected** if checkboxes appear — leave all checked).
9. After Accept, canvas contains all of:
   - `Do now: two pictures`
   - `Silent start`
   - `Dual coding: two channels`
   - `visual and verbal channels must not compete`
   - `Teacher pause`
10. Card can read **Proposal accepted**. Header **Saved**. No word **Aborted** in the thread.

**Pass:** confirm card before apply; Accept inserted without destroying the starter.  
**Fail:** hang past 25s; silent write with no card; Accept no-op; starter deleted; required phrase missing; `Aborted`.

---

## Step 7 — AI Reject, then rewrite the selected heading

Skip this whole step if Step 6 never produced a confirm card.

### 7a Reject (must not change the canvas)

1. Still on Ann O’Tation. Send:

```
Replace the whole lesson with a single heading that says: DELETE ME NOW
```

2. Wait for a confirm card (likely **Proposal: replace lesson**). If none by 25s, fail 7a and skip 7b.
3. Confirm the canvas has **not** already been replaced.
4. Click **Reject**. Card may read **Proposal rejected**.
5. Canvas still includes `Do now: two pictures` and `Dual coding: two channels`. Nothing titled `DELETE ME NOW`.

**Pass:** Reject left the lesson intact.  
**Fail:** lesson replaced before Reject, or Reject still applied the change.

### 7b Suggestions → Rewrite selected heading

1. Click the heading `Do now: two pictures` on the canvas so it is selected.
2. Chat scope chip should read **Looking at: heading** (or similar “Looking at:” + heading).
3. Click **Suggestions (N)** if suggestions are hidden. You should see chips including **Rewrite**.
4. Click **Rewrite**. That sends a scoped request; wait for a confirm card (**Proposal: replace block** is expected).
5. Canvas must not change yet. Click **Reject** (we are testing the scoped tool, not keeping the rewrite).
6. Heading text is still exactly `Do now: two pictures`.

**Pass:** scoped rewrite proposed a confirm card; Reject kept the original heading.  
**Fail:** no suggestions; silent rewrite; Reject still changed the heading.

---

## Step 8 — Nested section + extra palette block

1. Palette **Layout** → **Section**.
2. Inside the section, **Add nested block type** → **Rich text** → **Add block** (do not only click Rich text on the root palette).
3. Nested text: `This sits inside the section.`
4. Palette **Visualisation** → click **Mind map**. A mind map block should appear on the canvas (root is OK).
5. Wait for **Saved**.

**Pass:** nested rich text is inside the section; mind map present.  
**Fail:** nested add lands at lesson root; Add block missing; mind map click does nothing.

---

## Step 9 — Publish and student view

1. Click **Save**, then **Publish**.
2. Success copy includes **Published. Students can now view this lesson at:** plus a link.
3. Open that link (or public-link **Open**). Must be a **new tab**.
4. Student page shows `Imagery and working memory`. If Step 6 passed, it also shows `Dual coding: two channels`. Read-only (no teacher editors, no chat, no palette).
5. Close the student tab. Open the class **11 Schema A**. **View as student** also opens a **new tab** (`/s/classes/…`).

**Pass:** publish OK; both student opens are new tabs; lesson title visible.  
**Fail:** publish error, same-tab hijack, or student view still looks like the teacher editor.

---

## Step 10 — Search and subject still global

1. **+** → **Class**. Pick Year first, then Subject. **Schema & Design** is still listed.
2. Search: rail **Search** or ⌘/Ctrl+K. Panel aria-label **Search**. Type `imagery and working memory`. Open the lesson.
3. Chat transcript must not contain the word `Aborted`.

**Pass:** subject still listed; search finds the lesson; no Aborted.  
**Fail:** subject gone, search miss, or aborted residue.

---

## Step 11 — Design sweep (2 minutes, same lesson URL)

Stay on the teacher lesson editor. Fail any item that is clearly wrong.

| Check | Expected |
|-------|----------|
| Type | Body looks like Inter, not Times / Arial-only bootstrap. |
| Buttons | Save / Publish / Send / Accept look like the same button family (filled or ghost), not a mix of blue default, green success, and red alert from another kit. |
| High Sea | Bright orange is for decisive/accent (e.g. Save in create modal), **not** body text and **not** the focus ring. Focus, if you Tab, should be a wave/blue-ish ring, not orange. |
| Glass | Dashboard tiles / panels may look glassy; the lesson page should still be readable, not milky unreadable overlay. |
| Chat hide | **Hide chat** (aria-label) shelves the column; **Open chat** brings it back. Shortcut `]` is allowed. |
| Palette hide | Hide blocks / `[` shelves the left rail; showing it again restores families. |
| Confirm card | AI cards use the confirm-card pattern (eyebrow title + Accept/Reject), not a raw browser `confirm()`. |
| Agent colour | Ann’s accent is a dark red; it must not recolour the whole page background. |

**Pass:** no design-kit clashes in the table.  
**Fail:** list each clash as its own bug (severity usually minor unless unreadable).

---

## What not to do

- Do not use `teaching-hub-local` on production unless it actually works.
- Do not Accept the **DELETE ME NOW** replace-lesson proposal.
- Do not trash English Advanced, English Standard, or existing classes.
- Do not spend this run on Templates, Trash, Resource Library, or Scope timeline editing.
- Do not keep waiting past 25 seconds on **Thinking…**.

---

## Report template

Paste this back when finished.

```
# Teaching Hub usability report (run 2)
Date / time:
Browser:
Signed in: yes/no
data-hub=teaching inspected: yes/no/not inspected

## Results
| Step | Result (pass/fail) | Notes |
|------|--------------------|-------|
| 0 Sign in / chrome |  |  |
| 1 Create subject |  |  |
| 2 Create class (no not-found) |  |  |
| 3 Create unit (no not-found) |  |  |
| 4 Lesson values / builder chrome |  |  |
| 5 Manual blocks |  |  |
| 6 AI insert + Accept |  |  |
| 7a AI Reject replace-lesson |  |  |
| 7b Suggestions Rewrite + Reject |  |  |
| 8 Nested section + mind map |  |  |
| 9 Publish / student new tab |  |  |
| 10 Search / subject still listed |  |  |
| 11 Design sweep |  |  |

## Create regression
Class not-found seen even briefly: yes/no
Unit not-found seen even briefly: yes/no
Class URL after save:
Unit URL after save:

## AI
Agent used:
Thinking lasted (seconds):
Confirm card appeared before apply: yes/no
Proposal title (insert):
Stall / try-again error shown: yes/no
Starter blocks kept: yes/no
Required phrase present: yes/no
Reject left canvas unchanged: yes/no
Suggestions Rewrite card appeared: yes/no
Aborted text seen: yes/no
Partial-accept checkboxes shown: yes/no

## Design
Rail brand single line: yes/no
Sign out is header icon (not rail pill): yes/no
Agent avatars circular: yes/no
Confirm cards used (not window.confirm): yes/no
Other clashes:

## Bugs (one block per issue)
Severity: blocker / major / minor
Step:
Expected:
Actual:
URL:
Screenshot:

## Verdict
Ship-ready for a teacher to build a lesson today: yes / no
One sentence why:
```
