# Teaching Hub — ChatGPT live usability test

Copy everything from **Operator brief** to the end of **Report template** into ChatGPT (browser / computer-use). Fill `{{PASSPHRASE}}` first. Do not invent a passphrase.

---

## Operator brief

You are a careful teacher testing **Teaching Hub** in a real browser. Follow the steps in order. Use the exact values. Do not improvise titles, skip Accept on AI proposals, or invent UI that is not on screen.

**Site:** https://teaching-hub.adam-russell.com  
**Passphrase:** `{{PASSPHRASE}}`  
**Timebox:** about 25 minutes  
**Goal:** prove a teacher can create curriculum, build a lesson by hand and with AI, publish it, and open the student view.

### How to work

- Wait for each page or modal to finish loading before the next click.
- If a control is missing, wait 3 seconds, then hard-refresh once and retry that step. If it is still missing, **fail the step** and continue.
- After every AI proposal, look for a **confirm card** with **Accept** / **Reject**. The lesson must not change until you click **Accept**.
- Record every mismatch in the report: what you expected, what you saw, URL, and a screenshot if you can.
- Do not delete existing English Advanced / English Standard content. Create the new records below.

### Exact values (use these, not close variants)

| Field | Value |
|-------|--------|
| Subject title | `Usability Psychology` |
| Class title | `11 Psych A` |
| Class code | `11PSYCHA` |
| Academic year | `2026` |
| Year | `Year 12` (if that option is missing, pick the only year listed and note it) |
| Unit title | `Cognitive Load` |
| Lesson title (create modal) | `Working memory starter` |
| Lesson title (after open) | `Working memory in the classroom` |
| Pedagogical mode | `Workshop` |
| Manual heading | `Starter: what is working memory?` |
| Manual callout title | `Do now` |
| Manual callout body | `Write one thing you remember from last lesson.` |
| AI heading that must appear | `Cognitive load: three kinds` |
| AI callout title that must appear | `Teacher note` |
| Unique phrase AI must include | `intrinsic, extraneous, and germane load` |

---

## Step 0 — Sign in

1. Open https://teaching-hub.adam-russell.com/sign-in
2. Confirm brand **Teaching Hub**, title **Sign in**, field label **Passphrase**, button **Sign in**.
3. Enter `{{PASSPHRASE}}`. Click **Sign in**.
4. You should land on the dashboard. Left rail brand: **Teaching Hub**. Nav includes **Dashboard**, **Classes**, **Scope & Sequences**, **Units**, **Lessons**.

**Pass:** signed in, dashboard visible.  
**Fail:** `Invalid passphrase`, a hang, or no rail.

---

## Step 1 — Create a permanent subject

1. On the dashboard, click the **+** button (aria-label **Create**).
2. Menu must list: **Class**, **Subject**, **Unit**, **Lesson**, **Scope & Sequence**.
3. Click **Subject**.
4. Modal title must be **New subject**. The only field is **Title**. There must be no Year field.
5. Type `Usability Psychology`. Click **Save**.
6. Modal closes. You stay on the dashboard (no subject detail page).

**Pass:** subject created; no year on the form.  
**Fail:** year field present, Save errors, or you are sent to a missing page.

---

## Step 2 — Create a class (year must not hide the new subject)

1. Click **+** → **Class**.
2. Modal title **New class**. Fill:
   - Title: `11 Psych A`
   - Code: `11PSYCHA`
   - Academic year: `2026`
   - Year: `Year 12`
   - Subject: `Usability Psychology`
3. Confirm the Subject list still shows **Usability Psychology** after you pick Year. Subject labels must not look like `Year 12 Usability Psychology`.
4. Click **Save**.
5. You should land on `/classes/…` with title **11 Psych A**. Header includes **View as student**.

**Pass:** class page opens; subject was available after choosing year.  
**Fail:** subject missing from the list, year-prefixed subject label, or Save error.

---

## Step 3 — Create a unit

1. Click **+** (dashboard **+**, or go to **Units** then **+**).
2. Choose **Unit** if a menu appears. Modal title **New unit**.
3. Title `Cognitive Load`. Year `Year 12`. Subject `Usability Psychology`.
4. Click **Save**. Land on the unit page.

**Pass:** unit page titled **Cognitive Load**.  
**Fail:** subject filtered away by year, or navigation to a blank/error page.

---

## Step 4 — Create a lesson and set values

1. Click **+** → **Lesson** (or **Lessons** → **+**).
2. Modal title **New lesson**.
3. Title: `Working memory starter`.
4. Unit: `Cognitive Load`.
5. Pedagogical mode: change from default **Lesson** to **Workshop**.
6. Click **Save**.
7. You should land in the lesson editor at `/lessons/…`.
8. Change the on-page title field (aria-label **Lesson title**) to `Working memory in the classroom`. Wait until the header shows **Saved** (not **Saving…**).
9. Confirm pedagogical mode on the page is still **Workshop**. If it reset, set it to **Workshop** again and wait for **Saved**.

**Pass:** editor open, title updated, mode **Workshop**, save succeeded.  
**Fail:** default mode cannot be changed, title does not stick, or Save failed.

---

## Step 5 — Add blocks by hand

The blocks palette is on the left. Tab **Blocks**. If it is hidden, press `[` or click to show it.

1. Open family **Basic**. Click **Heading** (do not drag for this step).
2. In the heading field (aria-label **Heading text**), replace the default with `Starter: what is working memory?`
3. Click **Callout**.
4. Callout title: `Do now`. Callout body: `Write one thing you remember from last lesson.`
5. Wait for **Saved**.
6. Confirm both blocks are on the canvas, in that order, with that text.

**Pass:** heading then callout, exact copy, saved.  
**Fail:** click does nothing, block appears at the wrong nesting, or text does not persist after a refresh of this lesson URL.

---

## Step 6 — Add blocks with AI (do not skip Accept)

1. If there is no chat column, click the floating button **Open chat** (or press `]`).
2. Empty state copy: **Ask an agent to build or edit this lesson.**
3. Agent picker: leave **Ann O'Tation** selected (or select it if another agent is active).
4. In the message box (placeholder **Ask the selected agent…**), send **exactly**:

```
Keep the existing starter heading and callout.

After them, insert these blocks:
1. A Heading whose text is exactly: Cognitive load: three kinds
2. A Rich text paragraph that includes this exact phrase: intrinsic, extraneous, and germane load
3. A Callout whose title is exactly: Teacher note
   and whose body is: Do not treat all difficulty as the same thing.

Do not replace the whole lesson. Insert after the existing blocks.
```

5. Wait until a **confirm card** appears. Expected title like **Proposal: insert blocks** (or **replace lesson** if the model ignored the instruction — still proceed, but mark a usability fail).
6. Confirm the canvas has **not** already changed. Then click **Accept**.
7. After Accept, the canvas must contain:
   - `Starter: what is working memory?`
   - `Do now`
   - `Cognitive load: three kinds`
   - `intrinsic, extraneous, and germane load`
   - `Teacher note`
8. Header should return to **Saved**.

If the first proposal is wrong, click **Reject**, send the same prompt once more, then **Accept** the second proposal. Note both attempts.

**Pass:** confirm card appeared; Accept applied the three new blocks without destroying the starter.  
**Fail:** silent write with no confirm card; Accept does nothing; starter blocks deleted; required phrases missing; UI shows the word `Aborted`.

---

## Step 7 — Nested block (section)

1. In **Layout**, click **Section**.
2. Inside the section, use **Add nested block type** → **Rich text** → **Add block** (not only a root-level palette click).
3. Type `This sits inside the section.` in that nested rich text.
4. Wait for **Saved**.

**Pass:** nested rich text is inside the section, not a sibling at root.  
**Fail:** nested add inserts at the root of the lesson, or Add block is missing.

---

## Step 8 — Publish and student view

1. Click **Save**, then **Publish**.
2. Success copy must include: **Published. Students can now view this lesson at:** plus a link.
3. Click that link (or the public-link control **Open**). It must open a **new tab**.
4. Student page must show the published content, including `Working memory in the classroom` and `Cognitive load: three kinds`. Student view is read-only (no teacher editors).
5. Return to the class page for **11 Psych A**. Click **View as student**. That must also open a **new tab** (`/s/classes/…`).

**Pass:** publish succeeded; both student opens use a new tab; published lesson shows the AI heading.  
**Fail:** publish errors, same-tab hijack, or student view missing the new blocks.

---

## Step 9 — Quick regression checks (2 minutes)

1. Open **+** → **Class** again. Pick Year first, then open Subject. **Usability Psychology** must still be listed.
2. Search (rail **Search** or ⌘/Ctrl+K). Type `working memory`. The new lesson should appear. Open it.
3. Chat should restore without the word `Aborted` in the transcript.

**Pass:** subject still global; search finds the lesson; no `Aborted`.  
**Fail:** subject vanished, search miss, or aborted residue.

---

## What not to do

- Do not use the local passphrase `teaching-hub-local` on the live site unless it actually works (it usually will not).
- Do not click **Reject** on the proposal you intend to keep.
- Do not trash English Advanced, English Standard, or existing classes.
- Do not spend time on Templates, Trash, or Resource Library in this run.

---

## Report template

Paste this back when finished.

```
# Teaching Hub usability report
Date / time:
Browser:
Signed in: yes/no

## Results
| Step | Result (pass/fail) | Notes |
|------|--------------------|-------|
| 0 Sign in |  |  |
| 1 Create subject |  |  |
| 2 Create class |  |  |
| 3 Create unit |  |  |
| 4 Lesson values |  |  |
| 5 Manual blocks |  |  |
| 6 AI blocks |  |  |
| 7 Nested section |  |  |
| 8 Publish / student |  |  |
| 9 Search / subject still listed |  |  |

## AI
Agent used:
Confirm card appeared before apply: yes/no
Proposal title:
Starter blocks kept: yes/no
Required phrase present: yes/no
Aborted text seen: yes/no

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
