# Teaching Hub — ChatGPT live usability test (run 4)

Copy everything from **Operator brief** to the end of **Report template** into ChatGPT (browser / computer-use). Fill `{{PASSPHRASE}}` first. Do not invent a passphrase.

Run 3 (17 Aug 2026) passed library, Clare Accept, and Hammond review-only. It **failed** schedule visibility, empty Flashcards blocking publish, print (`about:blank` + pop-up alert), and native `prompt()` on Save as lesson template. Those four were patched. This run **retests them**, then audits Scope & Sequence, Resource Library, and Trash.

---

## Operator brief

You are a careful teacher testing **Teaching Hub** in a real browser. Follow the steps in order. Use the exact values. Do not invent UI. Do not skip Accept on mutating AI proposals.

**Site:** https://teaching-hub.adam-russell.com  
**Passphrase:** `{{PASSPHRASE}}`  
**Timebox:** about 35 minutes  
**Goal:** prove the run 3 blockers are gone, then that a teacher can use scope, resources, trash chrome, and publish a lesson that includes flashcards.

### How to work

- Wait for each page or modal to finish loading.
- Missing control: wait 3 seconds, hard-refresh once, retry. Still missing → **fail** and continue.
- Mutating AI: confirm card before canvas change. **Thinking…** for **25 seconds** with no card and no error → fail that AI step.
- Do not trash English Advanced / English Standard / existing school classes.
- Do not click **Backup Now** or **Backup to GitHub**.
- Do not permanently delete anything in Trash.
- Do not Accept a **replace lesson** proposal.

### Recover (prefer) or create

Search **Lessons** for `retrieval in 20 minutes` first.

| Role | Prefer (run 3) | Fallback if missing |
|------|----------------|---------------------|
| Subject | `Retrieval Practice` | Create subject `Worked Examples` |
| Class | `11 Retrieve A` | `11 Examples A` (code `11EXA`, 2026, Year 12) |
| Unit | `Testing Effect` | `Fading Guidance` |
| Lesson | `Retrieval in 20 minutes` | Create `Example starter`, retitle to `Worked example fading`, mode **Seminar** |

If you must create: subject title only; class/unit must **not** flash **not found**.

### Exact values (this run)

| Field | Value |
|-------|--------|
| Flashcard 1 front | `Testing effect` |
| Flashcard 1 back | `Memory is stronger after a test than after re-reading.` |
| Flashcard 2 front | `Cue` |
| Flashcard 2 back | `A prompt that makes you retrieve, not recognise.` |
| Tabs panel 1 label | `Worked example` |
| Nested tab text | `Watch the full solution first.` |
| Resource title | `NSW syllabus` |
| Resource URL | `https://educationstandards.nsw.edu.au/` |
| Scope note title | `Run 4 note` |

---

## Step 0 — Sign in

1. https://teaching-hub.adam-russell.com/sign-in
2. Brand **Teaching Hub**, title **Sign in**, label **Passphrase**, button **Sign in**.
3. Enter `{{PASSPHRASE}}`. Dashboard. Rail brand one line. Sign out is a header icon.

**Pass:** signed in. **Fail:** invalid passphrase or missing chrome.

---

## Step 1 — Open the test lesson and fix Flashcards (run 3 regression)

1. Rail **Lessons**. Search `retrieval in 20 minutes` (or the fallback title). Open it.
2. Find the **Flashcards** block on the canvas.
3. You should see **front and back text listed on the canvas** (not a single blank card face). Hint copy **Select this block to edit cards.** is allowed.
4. If any card is empty or says **Front (required to publish)** / **Back (required to publish)**:
   - Click the flashcards block so Front/Back fields appear (inspector or on-canvas).
   - Set card 1 to `Testing effect` / `Memory is stronger after a test than after re-reading.`
   - Set card 2 to `Cue` / `A prompt that makes you retrieve, not recognise.`
   - Wait for **Saved**.
5. If there is **no** flashcards block: palette **Learning** → **Flashcards**. New cards should already contain sample text such as **Term** / **Definition** (publishable). You may replace them with the values above. Wait for **Saved**.
6. Click **Save**, then **Publish**. Must **not** say **Flashcards need front and back text on every card to publish**.

**Pass:** flashcards show both sides; publish is not blocked by empty cards.  
**Fail:** still a blank uneditable card; publish error about front and back; insert creates empty cards.

---

## Step 2 — Print (run 3 regression)

Stay on the same lesson.

1. Click **Print** (aria-label **Print**).
2. **Fail** if a tab stays `about:blank` and the teacher page shows **Allow pop-ups to print this lesson.**
3. **Pass** if a print preview / print dialog / print document with the lesson title appears. Cancel print. You must still have the teacher editor.

**Pass:** usable print document, editor still there.  
**Fail:** pop-up alert + blank tab, or editor destroyed.

---

## Step 3 — Save as lesson template (run 3 regression)

1. Page menu **⋯** (aria-label **Page menu**) → **Save as lesson template**.
2. A Teaching Hub **dialog** must appear (role `dialog`). Title **Save as lesson template**. Field label **Title**. Buttons **Cancel** and **Save**. This must **not** be the browser native `prompt("Lesson template name")`.
3. Confirm the default title looks like the lesson title. Click **Cancel**. Dialog closes. Lesson unchanged.

**Pass:** kit modal; Cancel is safe.  
**Fail:** native `prompt()`, or Save happens on open.

---

## Step 4 — Schedule visible after Confirm (run 3 regression)

1. Open class `11 Retrieve A` (or `11 Examples A`). Must not say **Class not found**.
2. Calendar: look at **Today** / `2026-08-17` if that is today. Day detail is the panel that can say **No lessons scheduled this day.**
3. **If** the test lesson title is already listed there → schedule persist **pass**. Skip the wizard.
4. **If** empty: **Schedule a lesson** (`+`, aria-label **Schedule a lesson**). Choose the test unit → **Next** → **Next** → **Confirm** if enabled.
5. After Confirm, **do not refresh yet**. The same day’s detail must show the lesson title (e.g. `Retrieval in 20 minutes`).
6. **Fail** if Confirm listed a row in the preview but the calendar still says **No lessons scheduled this day** before any refresh.
7. If the wizard says there is nothing to schedule **and** the calendar is still empty → **fail** (write never became visible).

**Pass:** scheduled lesson visible on first paint after Confirm, or already visible from run 3.  
**Fail:** not-found class; empty day after a successful Confirm.

---

## Step 5 — Student class view

1. On the same class page, **View as student**. Must open a **new tab** (`/s/classes/…`).
2. Student view is read-only (no Edit page, no Schedule, no chat).
3. If Step 4 passed, the student class should be able to show scheduled/lesson content or at least the class title — not **Class not found**.
4. Close the student tab.

**Pass:** new tab, read-only, class found.  
**Fail:** same-tab hijack; teacher chrome on the student URL; Class not found.

---

## Step 6 — Tabs on the canvas

1. Return to the test lesson (or create the fallback lesson if you are not already in an editor).
2. Palette **Layout** → **Tabs**.
3. Label the first tab `Worked example` if a tab label field exists.
4. Nested add inside that tab: **Add nested block type** → **Rich text** → **Add block**. Text: `Watch the full solution first.`
5. Wait for **Saved**. Nested text must sit **inside the tab**, not only at lesson root.
6. Optional: **Teaching** → **Accordion**. If click no-ops, fail with a note; do not spend more than one retry.

**Pass:** tabs persist; nested rich text is inside the tab.  
**Fail:** nested add at root; tabs click does nothing.

---

## Step 7 — Scope & Sequence

1. Rail **Scope & Sequences**. Header title **Overall Scope & Sequence**.
2. If you see **No scope & sequences yet. Create one to start the year timeline.**: dashboard or this page **+** → **Scope & Sequence**. Modal **New scope & sequence**. Title `Retrieval year`, Subject `Retrieval Practice` (or `Worked Examples`), Academic year `2026`. **Save**. Must not land on a not-found page.
3. Open a subject scope row (click through to the timeline editor).
4. Tabs **Timeline** and **Curriculum Map** exist. Buttons **+ Add Unit** and **Add note**.
5. **Add note**. Set note title `Run 4 note` if a title field appears (aria-label **Note title** is allowed). Save/close so the note is on the timeline. Do not delete other subjects’ units.

**Pass:** overview or timeline usable; note created without a native `prompt()`.  
**Fail:** not-found after create; timeline missing; Add note uses `window.prompt`.

---

## Step 8 — Resource Library

1. Rail **Resource Library**. Eyebrow **Library**, title **Resource Library**.
2. Buttons **Upload**, **Add URL**, **Add from Drive**.
3. **Add URL**. Fields aria-label **Resource title** and **Resource URL**.
4. Title `NSW syllabus`. URL `https://educationstandards.nsw.edu.au/`. **Save URL**.
5. The resource appears in the list. Do not Upload a file. Do not trash it.

**Pass:** URL resource saved and listed.  
**Fail:** form missing; Save URL errors; page blank.

---

## Step 9 — Trash chrome (look, do not destroy)

1. Rail **Trash**. Eyebrow **Workspace**, title **Trash**. Actions **Backup Now** and **Backup to GitHub** may exist — **do not click them**.
2. Either **Trash is empty.** or a list with **Restore** on rows.
3. Do not Restore school content. Do not permanently delete.

**Pass:** page loads; empty copy or a list.  
**Fail:** error page; missing title.

---

## Step 10 — From template (design check only)

1. Rail **Lessons** → **From template**.
2. If a native `prompt()` / `alert()` appears (`New lesson from template` or `No lesson templates yet`), **Cancel / OK** and stop. Record as a **design fail** if it was `prompt()`/`alert()` rather than a kit modal. Do not create a lesson into a real class.
3. If a kit modal appears instead, **Cancel**.

**Pass:** you can dismiss without creating. Native prompt is a design fail (minor) even if the feature works.  
**Fail:** it creates/overwrites a lesson anyway.

---

## What not to do

- Do not use `teaching-hub-local` on production unless it works.
- Do not Accept replace-lesson AI cards.
- Do not Backup Now / Backup to GitHub.
- Do not empty Trash or archive English Advanced.
- Do not wait past 25 seconds on **Thinking…**.

---

## Report template

Paste this back when finished.

```
# Teaching Hub usability report (run 4)
Date / time:
Browser:
Signed in: yes/no
Records used: run 3 Retrieval / fallback Worked Examples / mixed

## Results
| Step | Result (pass/fail) | Notes |
|------|--------------------|-------|
| 0 Sign in |  |  |
| 1 Flashcards visible + publish |  |  |
| 2 Print |  |  |
| 3 Template kit modal |  |  |
| 4 Schedule visible after Confirm |  |  |
| 5 Student class new tab |  |  |
| 6 Tabs nested |  |  |
| 7 Scope & Sequence |  |  |
| 8 Resource Library Add URL |  |  |
| 9 Trash chrome |  |  |
| 10 From template design |  |  |

## Regressions
Flashcards listed front and back on canvas: yes/no
Publish blocked by empty flashcards: yes/no
Print about:blank + Allow pop-ups: yes/no
Template used window.prompt: yes/no
Schedule empty after Confirm (before refresh): yes/no
Class not-found: yes/no

## New areas
Scope note created: yes/no
Scope used window.prompt: yes/no
Resource listed: yes/no
Trash page loaded: yes/no
From template native prompt: yes/no
Tabs nested inside tab: yes/no

## Bugs (one block per issue)
Severity: blocker / major / minor
Step:
Expected:
Actual:
URL:
Screenshot:

## Verdict
Ship-ready for schedule + flashcards + print + template + library/scope: yes / no
One sentence why:
```
