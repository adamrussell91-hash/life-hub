# Teaching Hub — ChatGPT live usability test (run 3)

Copy everything from **Operator brief** to the end of **Report template** into ChatGPT (browser / computer-use). Fill `{{PASSPHRASE}}` first. Do not invent a passphrase.

Runs 1–2 covered create → manual blocks → Ann insert/Accept. This run audits **the rest of the teacher product**: lessons library, class homepage/schedule, learning/layout blocks, other agents, print/history/templates, public links, and search commands.

---

## Operator brief

You are a careful teacher testing **Teaching Hub** in a real browser. Follow the steps in order. Use the exact values. Do not invent UI. Do not skip Accept on mutating AI proposals.

**Site:** https://teaching-hub.adam-russell.com  
**Passphrase:** `{{PASSPHRASE}}`  
**Timebox:** about 35 minutes  
**Goal:** prove a teacher can find lessons, run a class page, add learning activities, use a second agent, print, and share a student link — without design-kit clashes or silent AI writes.

### How to work

- Wait for each page or modal to finish loading.
- Missing control: wait 3 seconds, hard-refresh once, retry. Still missing → **fail** and continue.
- Mutating AI: wait for a **confirm card** (`confirm-card`) with **Accept** / **Reject**. Canvas must not change until Accept.
- **Thinking…** for **25 seconds** with no card and no error → fail that AI step. Do not wait a full minute. Stall copy like **The AI connection stalled before a reply** means the hang-fix worked but the proposal failed — record both.
- Do not trash English Advanced / English Standard / existing school classes.
- Do not Accept a **replace lesson** proposal in this run.

### Recover or create

Prefer the run 2 records if they exist. Search first.

| Role | Run 2 (prefer) | Fallback if missing |
|------|----------------|---------------------|
| Subject | `Schema & Design` | `Retrieval Practice` |
| Class | `11 Schema A` | `11 Retrieve A` (code `11RETA`, year 2026, Year 12) |
| Unit | `Dual Coding` | `Testing Effect` |
| Lesson | `Imagery and working memory` | Create title `Quiz starter`, then retitle to `Retrieval in 20 minutes`, mode **Tutorial** |

If you must create: same create-modal rules as run 2 (subject has title only; class/unit must **not** show not-found). Then continue.

### Exact values for new blocks / AI (this run)

| Field | Value |
|-------|--------|
| Columns nested left | `Left: retrieve from memory first.` |
| Question stem | `Why test before re-reading?` |
| Flashcards family | **Learning** |
| Clare unique phrase | `retrieval beats re-reading` |
| Cover URL (only if you apply one) | leave blank — **open the dialog, do not save a random image** |

---

## Step 0 — Sign in

1. https://teaching-hub.adam-russell.com/sign-in
2. Brand **Teaching Hub**, title **Sign in**, label **Passphrase**, button **Sign in**.
3. Enter `{{PASSPHRASE}}`. Dashboard. Rail brand one line. **Sign out** is a header **icon** (aria-label **Sign out**), not a rail pill.

**Pass:** signed in. **Fail:** invalid passphrase or missing chrome.

---

## Step 1 — Find the lesson (library, not only global search)

1. Rail **Lessons**. Header eyebrow **Workspace**, title **Lessons**. Button **From template** plus **+**.
2. Search box placeholder **Search titles, units, tags, notes…** (aria-label **Search lessons**).
3. Type `imagery and working memory`. If it appears, open it and skip create. Note **Lab** on the row if shown.
4. If missing, search `retrieval in 20 minutes`. If still missing, create the fallback subject/class/unit/lesson (mode **Tutorial**), then open the editor.
5. Filters present (aria-labels): **Filter by unit**, **Filter by subject**, **Filter by pedagogical mode**, **Filter by status**.
6. Set pedagogical mode filter to **Lab** (or **Tutorial** if you created the fallback). The lesson must remain visible. Clear the mode filter afterwards (empty / all).
7. View tabs (aria-label **Lesson views**): **Library**, **Table**, **Map**, **My views**. Click **Table**, confirm a Mode column, then return to **Library**.

**Pass:** lesson found or created; mode filter works; table view has a mode column.  
**Fail:** lesson missing and create 404s; filters absent; table view empty/broken.

---

## Step 2 — Class page: cover, homepage, schedule

1. Open the test class (`11 Schema A` or `11 Retrieve A`). Must not say **Class not found**.
2. Header actions: **View as student**, **Edit page**.
3. Banner **Change cover**. Dialog title **Change cover**. Controls include **Set URL**, **Remove cover**, **Choose from library**. **Close without saving.**
4. **Edit page**. You should get a homepage editor (not a raw `prompt()`). Look for **Save homepage** and **Cancel**. Click **Cancel** unless a heading is obviously empty and safe to leave. If you added nothing, Cancel.
5. On the class calendar: view tabs **Week** / **Month** / **Timeline** (aria-label **Calendar view**). **Today** button exists.
6. Open **Schedule a lesson** (`+`, aria-label **Schedule a lesson**). Modal titles in order: **Choose unit** → **Meeting pattern** → **Preview schedule**.
7. Choose the test unit (`Dual Coding` or `Testing Effect`). **Next**. Leave Mon–Fri selected if already on. **Next**. If preview lists lessons and **Confirm** is enabled, click **Confirm**. If it says there is nothing to schedule, **Cancel** and note that (pass with note).
8. After Confirm, calendar or unit sequence should show scheduled items. No full-page error.

**Pass:** cover dialog is a real modal; homepage editor is not `window.prompt`; schedule wizard completes or cleanly has nothing to schedule.  
**Fail:** Class not found; Change cover missing; Edit page uses a browser prompt; schedule errors.

---

## Step 3 — Learning and layout blocks

Open the test lesson editor.

1. Palette **Layout** → **Columns**. A two-column block should appear.
2. In the **left** column, nested add: **Add nested block type** → **Rich text** → **Add block**. Text: `Left: retrieve from memory first.`
3. Palette **Teaching** → **Question set**. If there is a stem/question field, set it to `Why test before re-reading?` (or the first visible question prompt). If the block has no obvious stem field, note the empty UI and continue.
4. Palette **Learning** → **Flashcards**. A flashcards block appears.
5. Wait for **Saved**.
6. Refresh the lesson URL once. Columns + left text + question set + flashcards still present.

**Pass:** all three block types persist after refresh; nested text is inside the left column, not only at lesson root.  
**Fail:** nested add at root; click no-ops; content lost on refresh.

---

## Step 4 — Clare DèMind (second agent)

1. Open chat (`Open chat` / `]`). Agent picker: select **Clare DèMind** (yellow-ish avatar; tooltip **Clare DèMind**). Active agent ring should move off Ann.
2. Click the question set (or the columns block if question set cannot be selected). Scope chip should change from **Lesson** to **Looking at: …**.
3. Open **Suggestions** if hidden. For a question set, chips should include **Generate questions**. Click **Generate questions** if present; otherwise send exactly:

```
Keep existing blocks. Insert one Callout after the question set.
Title: Retrieval cue
Body must include this exact phrase: retrieval beats re-reading
Do not replace the whole lesson.
```

4. 25-second Thinking rule. Confirm card before canvas change. **Accept**.
5. Canvas still has `Left: retrieve from memory first.` plus either new questions or the Retrieval cue callout / required phrase.
6. Thread must not show `Aborted`.

**Pass:** Clare produced a confirm card; Accept applied; starter/layout kept.  
**Fail:** hang; silent write; Accept no-op; whole lesson replaced.

---

## Step 5 — General Hammond (review, do not mutate)

1. Select **General Hammond** in the agent picker.
2. Send exactly:

```
Do not change any blocks. In two sentences, name the single biggest teaching risk in this lesson. Use review only — no insert, replace, or delete.
```

3. Wait up to 25 seconds.
4. **Pass** if: you get prose (and maybe no confirm card), **or** a confirm card that you **Reject**, and the canvas is unchanged.
5. **Fail** if: the lesson content changes with no card, or Hammond rebuilds the lesson on Accept you did not mean to click. If a mutating card appears, **Reject**.

**Pass:** canvas unchanged; Hammond replied or offered a rejected proposal.  
**Fail:** silent mutation; hang past 25s with no error.

---

## Step 6 — Print, History, template, public link

Stay on the same lesson.

1. **Print** (aria-label **Print**, icon in page chrome). A print preview / print dialog / new print layout should appear. Cancel print. You must remain in the teacher editor afterwards (or can close a print tab and still have the editor).
2. **History** toggle. Panel lists versions. After earlier saves/AI Accept you may see reasons **Save**, **Publish**, **AI accept**, or **Checkpoint**. Opening History must not wipe the canvas.
3. Page menu **⋯** (aria-label **Page menu**): **Export JSON** and **Save as lesson template**. Click **Save as lesson template**. Note success or error copy. Do not trash anything.
4. Public link control (link icon, aria-label **Public link**). If the lesson is still a draft: popover **Publish this lesson to create a student link.** If already published from run 2: **Copy** and **Open** (`/s/lessons/…`), Open in a **new tab**.
5. If still a draft: **Save** then **Publish**. Success includes **Published. Students can now view this lesson at:** Open in a new tab. Student view is read-only (no palette, no chat, no Accept).

**Pass:** print does not destroy the editor; History opens; public link draft copy is correct; publish/open uses a new tab.  
**Fail:** print navigates away with no way back; History errors; student view is the teacher editor; same-tab hijack.

---

## Step 7 — Search commands and Templates design check

1. ⌘/Ctrl+K or rail Search. Type `print`. An action **Print lesson** should appear while you are still on the lesson. Trigger it or note it. Escape to close.
2. Search `new lesson`. Action title **New Lesson**. Triggering it should open the **New lesson** modal (not a blank page). **Cancel**.
3. Rail **Templates**. Title **Templates**. Tabs **Lessons** / **Units**.
4. If you click a use/create control and the browser native `prompt()` appears (`Create lesson in which unit?`), **Cancel** that prompt. Record it as a **design fail** (kit requires a modal, not `window.prompt`). Do not complete template-create into a real class.

**Pass:** search actions resolve; Templates page loads; native prompt (if any) is reported, not followed through.  
**Fail:** search does nothing; Templates 404; template-create silently overwrites a lesson.

---

## Step 8 — Design sweep (class + library + chat)

Fail only what is clearly wrong.

| Check | Expected |
|-------|----------|
| Class calendar | Same button family as the rest of the hub; Week/Month/Timeline not a third party date-picker skin. |
| Cover dialog | Modal / confirm-card style, not a full navigation to a different product. |
| Homepage editor | Kit buttons **Save homepage** / **Cancel**; Cancel is safe. |
| Lessons library | Filters readable; Table view not an unstyled HTML table dump. |
| Agent switch | Clare / Hammond avatars circular; switching agent does not reload the whole site. |
| Templates prompt | Native `prompt()` is a design fail even if the feature works. |
| Focus | Tab from Search: Wave-style ring, not orange High Sea. |

---

## What not to do

- Do not use `teaching-hub-local` on production unless it works.
- Do not Accept Hammond or Clare **replace lesson** cards.
- Do not Remove cover on English Advanced classes.
- Do not Confirm schedule on a class that is not the test class.
- Do not empty Trash or archive school units.
- Do not wait past 25 seconds on **Thinking…**.

---

## Report template

Paste this back when finished.

```
# Teaching Hub usability report (run 3)
Date / time:
Browser:
Signed in: yes/no
Records used: run 2 (Schema) / fallback (Retrieval) / mixed

## Results
| Step | Result (pass/fail) | Notes |
|------|--------------------|-------|
| 0 Sign in |  |  |
| 1 Lessons library + filters |  |  |
| 2 Class cover / homepage / schedule |  |  |
| 3 Columns + question set + flashcards |  |  |
| 4 Clare generate/insert + Accept |  |  |
| 5 Hammond review-only |  |  |
| 6 Print / History / template / public link |  |  |
| 7 Search commands + Templates |  |  |
| 8 Design sweep |  |  |

## Library
Mode filter worked: yes/no
Table view showed Mode column: yes/no

## Class
Cover dialog opened without saving: yes/no
Homepage used window.prompt: yes/no
Schedule: confirmed / nothing to schedule / failed
Class not-found seen: yes/no

## Blocks
Nested column text persisted after refresh: yes/no
Question set usable: yes/no
Flashcards persisted: yes/no

## AI
Clare confirm card: yes/no
Clare Accept applied: yes/no
Required phrase `retrieval beats re-reading`: yes/no
Hammond mutated canvas: yes/no
Thinking >25s hang: yes/no
Stall error shown: yes/no
Aborted text: yes/no

## Share / chrome
Print kept editor usable: yes/no
History opened: yes/no
Draft public-link copy correct: yes/no/already published
Student view new tab + read-only: yes/no
Templates native prompt: yes/no

## Bugs (one block per issue)
Severity: blocker / major / minor
Step:
Expected:
Actual:
URL:
Screenshot:

## Verdict
Ship-ready beyond “create a lesson and chat with Ann”: yes / no
One sentence why:
```
