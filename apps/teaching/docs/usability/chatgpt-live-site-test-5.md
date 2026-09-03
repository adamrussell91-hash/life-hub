# Teaching Hub — ChatGPT live usability test (run 5)

Copy everything from **Operator brief** to the end of **Report template** into ChatGPT (browser / computer-use). Fill `{{PASSPHRASE}}` first. Do not invent a passphrase.

Run 4 (17 Aug 2026) passed flashcards, schedule, scope, library, and the template-save modal. Print was invisible in Codex (no preview). From template used a native `alert()`. Those two were patched: Print is an in-page dialog; From template is a kit modal. **This run does not re-audit the library.** It stress-tests lesson AI: one full lesson, at least nine different block types, including a real image and a real video from web search.

---

## Operator brief

You are a careful teacher testing **Teaching Hub** in a real browser. Follow the steps in order. Use the exact values. Do not invent UI.

**Site:** https://teaching-hub.adam-russell.com  
**Passphrase:** `{{PASSPHRASE}}`  
**Timebox:** about 40 minutes  
**Goal:** prove Ann can build a publishable lesson with ≥9 distinct block types, including a working image and a working YouTube/Vimeo video, all behind a confirm card.

### How to work

- Wait for each page or modal to finish loading.
- Missing control: wait 3 seconds, hard-refresh once, retry. Still missing → **fail** and continue.
- Mutating AI: the canvas must **not** change until **Accept** (or **Accept selected**).
- The chat names its phase: **Thinking…**, then **Searching the web…**, then **Writing the reply…**. A phase line that keeps advancing means the request is alive.
- A full lesson can take up to **60 seconds**. Fail an AI step only when the phase line is stuck on one phase for **60 seconds** with no streamed text, no confirm card, and no error.
- If the agent is **streaming text or using tools**, wait up to **2 minutes** for a confirm card or error. After 2 minutes with neither → fail.
- Do not trash English Advanced / English Standard / existing school classes.
- Do not edit or replace **Retrieval in 20 minutes**. That lesson is already published. Build a **new** lesson.
- On this new lesson only, **you may Accept `Proposal: replace lesson`**. Do not Accept replace-lesson on any other lesson.
- Do not click **Backup Now** or **Backup to GitHub**.

### Recover (prefer) or create

Search **Lessons** for `nine-block dual coding` first. If it exists, open it and skip create.

| Role | Prefer | Fallback if missing |
|------|--------|---------------------|
| Subject | `Retrieval Practice` | Create subject `Dual Coding` (title only) |
| Class | `11 Retrieve A` | `11 Dual A` (code `11DUALA`, 2026, Year 12) |
| Unit | `Testing Effect` | Create unit `Paivio` (Year 12, same subject) |
| Lesson | Create **new** `Dual coding starter` | — |

If you must create class/unit: they must **not** flash **not found**. Do not reuse `Retrieval in 20 minutes`.

### Exact values (this run)

| Field | Value |
|-------|--------|
| Create-modal lesson title | `Dual coding starter` |
| On-page lesson title | `Nine-block dual coding` |
| Pedagogical mode | `Seminar` |
| Unique phrase that must appear | `dual coding pairs words with images` |
| Required image topic | a real photograph or diagram of dual coding / Paivio / working memory (not a broken placeholder) |
| Required video | a real YouTube or Vimeo embed about dual coding or working memory |

### Required block types (count distinct `data-block-type` after Accept)

The canvas must include **at least nine** of these, **and must include both `image` and `video`**:

1. `heading`
2. `rich_text`
3. `callout`
4. `image` **(required)**
5. `video` **(required)**
6. `mind_map`
7. `question_set`
8. `flashcards`
9. `table` **or** `definition` (either counts)
10. Bonus if present: `gallery`, `timeline`, `quote`, `cloze`, `self_check`, `chart`, `equation`

Do **not** require `html`, `html_app`, `collection`, `audio`, or `attachment`.

---

## Step 0 — Sign in

1. https://teaching-hub.adam-russell.com/sign-in
2. Brand **Teaching Hub**, title **Sign in**, label **Passphrase**, button **Sign in**.
3. Enter `{{PASSPHRASE}}`. Dashboard. Rail brand one line. Sign out is a header icon.

**Pass:** signed in. **Fail:** invalid passphrase or missing chrome.

---

## Step 1 — New empty lesson (do not touch Retrieval in 20 minutes)

1. If `Nine-block dual coding` already exists under Lessons search, open it. Skip to Step 2.
2. Otherwise **+** → **Lesson**. Modal **New lesson**.
3. Title `Dual coding starter`. Unit `Testing Effect` (or `Paivio`). Pedagogical mode **Seminar**. **Save**.
4. Must land on `/lessons/…` with the editor. Must **not** say **Lesson not found**.
5. Change the title field (aria-label **Lesson title**) to `Nine-block dual coding`. Wait for **Saved**.
6. Mode must stay **Seminar**.

**Pass:** new editor open, title saved, not the retrieval lesson.  
**Fail:** not-found; landed in `Retrieval in 20 minutes`; title did not stick.

---

## Step 2 — Ann builds a full lesson (this is the test)

1. If there is no chat column, click **Open chat** (or `]`).
2. Empty state may say **Ask an agent to build or edit this lesson.**
3. Select **Ann O'Tation** (default).
4. Send **exactly** this message:

```
Replace this draft with a complete Year 12 psychology lesson on dual coding theory (Paivio). Australian English.

You MUST propose at least nine different Teaching Hub block types in one proposal. Include ALL of the following:
- heading
- rich_text that contains this exact phrase: dual coding pairs words with images
- callout
- image (real https URL from the search pack, with meaningful alt text)
- video (YouTube or Vimeo from the search pack)
- mind_map (at least 5 labelled nodes)
- question_set (at least 2 questions)
- flashcards (every card has non-empty front and back)
- table OR definition

Ground image and video URLs in the search pack. Do not invent URLs. Do not use html, html_app, or collection.
If web search is unavailable, say so clearly, omit image and video, and still build the other blocks.
```

5. Wait for a **confirm card**. Expected titles:
   - **Proposal: replace lesson** (allowed on this lesson), or
   - **Proposal: insert blocks**
6. Canvas must still be the old draft until you Accept. Then click **Accept**. If the card says **Accept selected**, leave every checkbox on and click that.
7. If the first proposal is missing image or video, **Reject**, send the same prompt once more, then Accept the second card. Note both attempts.
8. If you see a tool error like **Media not in search pack**, record it. Reject that card. One retry only.

**Pass:** confirm card, then Accept applies a lesson that includes the unique phrase plus image and video blocks.  
**Fail:** silent write; Accept does nothing; hang past the wait rules; `Aborted`; no confirm card; unique phrase missing.

---

## Step 3 — Count block types and inspect media

Stay on the same lesson. Do not refresh yet unless the canvas is blank (then refresh once).

1. Count distinct values of `data-block-type` on the canvas (include nested blocks inside sections/tabs/columns). List every type you find.
2. **Image:** there must be a visible photograph/diagram (`img[src^="https://"]`). **Fail** if you only see **Unsafe**, **unavailable**, a broken icon, or an empty frame.
3. **Video:** there must be a YouTube (`youtube-nocookie.com` or `youtube.com`) or Vimeo iframe/player. **Fail** if copy is **Video unavailable.** or there is no player.
4. **Flashcards:** every card lists a front **and** a back (not **Front (required to publish)**).
5. **Mind map:** at least five labelled nodes visible.
6. **Question set:** at least two questions visible.

**Pass:** ≥9 distinct types, including working `image` and `video`, unique phrase present, flashcards complete.  
**Fail:** fewer than 9 types; image or video missing/broken; empty flashcards; unique phrase absent.

---

## Step 4 — Hammond review-only

1. Switch the agent picker to **General Hammond**.
2. Send **exactly**:

```
Review this lesson for a Year 12 class. Do not change any blocks. Do not replace the lesson.
```

3. Expect a review (no mutating confirm card), **or** a confirm card that you **Reject**.
4. Canvas must match Step 3 after this step.

**Pass:** review without destroying the lesson.  
**Fail:** silent rewrite; Accept you did not mean; lesson wiped.

---

## Step 5 — Save, publish, student view

1. Click **Save**. Wait for **Saved**.
2. Click **Publish**. Must **not** say **Flashcards need front and back text on every card to publish**.
3. **View as student** must open a **new tab** (`/s/lessons/…` or similar student route).
4. Student view is read-only (no Edit page, no chat, no Schedule). Unique phrase, image, and video should still be there (video may be a lazy embed — a player frame is enough).
5. Close the student tab.

**Pass:** published; student tab; media still there.  
**Fail:** publish blocked; same-tab hijack; student missing the phrase or media.

---

## Step 6 — Print preview (run 4 regression)

Stay in the teacher editor for `Nine-block dual coding`.

1. Click **Print** (aria-label **Print**).
2. An in-page Teaching Hub **dialog** titled **Print** must appear, containing the print document / lesson title. Buttons **Close** and **Print**.
3. **Pass** if that dialog (or a native print preview) is visible. Click **Close** (or cancel the native dialog). Editor must remain.
4. **Fail** if nothing visible happens, or you only get `about:blank` plus **Allow pop-ups to print this lesson.**

**Pass:** print document visible in-page or via print UI; editor intact.  
**Fail:** silent no-op; pop-up alert + blank tab; editor destroyed.

---

## What not to do

- Do not open or Accept AI on **Retrieval in 20 minutes**.
- Do not Accept replace-lesson except on **Nine-block dual coding**.
- Do not wait past 60 seconds of a frozen phase line with no stream.
- Do not wait past 2 minutes of streaming with no card and no error.
- Do not Backup Now / empty Trash / archive English Advanced.

---

## Report template

Paste this back when finished.

```
# Teaching Hub usability report (run 5)
Date / time:
Browser:
Signed in: yes/no
Lesson URL:
Records used: Retrieval Practice + new Nine-block dual coding / fallback Dual Coding / mixed

## Results
| Step | Result (pass/fail) | Notes |
|------|--------------------|-------|
| 0 Sign in |  |  |
| 1 New empty lesson |  |  |
| 2 Ann full-lesson proposal + Accept |  |  |
| 3 Block-type count + image/video |  |  |
| 4 Hammond review-only |  |  |
| 5 Publish + student view |  |  |
| 6 Print in-page dialog |  |  |

## AI
Confirm card before canvas change: yes/no
Proposal kind(s): replace lesson / insert blocks / other:
Retries: 0/1
Phase stall (>60s frozen on one phase): yes/no
Phases seen (Thinking / Searching / Writing):
Stream wait (>2 min, no card): yes/no
Search unavailable message: yes/no
Media not in search pack error: yes/no
Unique phrase present: yes/no

## Block types found (list every data-block-type)
:
Distinct count:
Includes image: yes/no
Includes video: yes/no

## Media
Image visible https photo: yes/no
Image broken/unavailable: yes/no
Video YouTube or Vimeo player: yes/no
Video unavailable copy: yes/no
Flashcards all have front and back: yes/no

## Bugs (one block per issue)
Severity: blocker / major / minor
Step:
Expected:
Actual:
URL:
Screenshot:

## Verdict
Ship-ready for AI to build a full multimedia lesson: yes / no
One sentence why:
```
