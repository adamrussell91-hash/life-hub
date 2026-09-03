# Teaching Hub — ChatGPT live usability test (run 7)

Copy everything from **Operator brief** to the end of **Report template** into ChatGPT (browser / computer-use). Fill `{{PASSPHRASE}}` first. Do not invent a passphrase.

Run 6 proved create / blocks / publish chrome, but **Ann and Hammond stalled** under Netlify’s 60-second synchronous ceiling. That architecture was replaced: every agent now runs as a **durable background job** (same path Clementine already used). Replies no longer stream word-by-word. The chat shows a phase line, then a finished proposal or review. **This run only retests AI** — Ann insert + Accept, grounded media, Hammond review-only.

---

## Operator brief

You are a careful teacher testing **Teaching Hub** AI in a real browser. Follow the steps in order. Use the exact values. Do not invent UI. Do not skip Accept on mutating AI proposals.

**Site:** https://teaching-hub.adam-russell.com  
**Passphrase:** `{{PASSPHRASE}}`  
**Timebox:** about 15 minutes  
**Goal:** prove Ann can finish a multi-block proposal with a confirm card, Accept applies without silent mutation, image/video are grounded, and Hammond reviews without rewriting the lesson.

### How AI works now (read once)

- The chat does **not** stream text token-by-token. Expect a phase line, then a finished result.
- Phase lines (in order, some may be brief): **Thinking…** → **Searching the web…** → **Writing the reply…**
- A phase line that keeps changing means the job is alive. A stuck phase with no card and no error for **3 minutes** is a fail.
- Stall copy like **The AI connection stalled before a reply** is a fail — that old transport path should not appear for Ann or Hammond.
- Mutating AI: the canvas must **not** change until **Accept** (or **Accept selected**).
- One retry only on any AI step (Reject + same prompt once, or Send once more). Then continue.
- If Send says an unresolved job already exists, open the existing confirm card or wait for it — do not invent a new lesson mid-run.
- Do not trash English Advanced / English Standard / existing school classes.
- Do not click **Backup Now** or **Backup to GitHub**.
- Do not Accept **replace lesson** except on the **new** lesson created in this run.

### Recover (prefer) or create

Reuse subject / class / unit when they exist. Always create a **new** lesson so old canvas state cannot mask failures.

| Role | Prefer | Fallback if missing |
|------|--------|---------------------|
| Subject | `Retrieval Practice` | Create subject `Job Check` (title only) |
| Class | `11 Retrieve A` | `11 Job A` (code `11JOB`, 2026, Year 12) |
| Unit | `Testing Effect` | Create unit `Job Unit` (Year 12, same subject) |
| Lesson | Create **new** `Job check starter` → retitle `Job check durable` | — |

If you must create class/unit: they must **not** flash **not found**. Do not edit or rewrite `Retrieval in 20 minutes` or `Nine-block dual coding`.

### Exact values (this run)

| Field | Value |
|-------|--------|
| Create-modal lesson title | `Job check starter` |
| On-page lesson title | `Job check durable` |
| Pedagogical mode | `Seminar` |
| Manual heading | `Do now: name one dual-coding move` |
| Unique phrase AI must include | `durable jobs outlive the request` |

### Required after Ann Accept (minimum)

At least **four** distinct `data-block-type` values, **including** both `image` and `video`, plus the unique phrase.

Must include:

1. `heading` or `rich_text` or `callout` containing `durable jobs outlive the request`
2. `image` (visible `img[src^="https://"]`)
3. `video` (YouTube or Vimeo player)
4. At least one more type from: `callout`, `mind_map`, `question_set`, `flashcards`, `table`, `definition`, `gallery`, `timeline`, `heading`, `rich_text`

If web search is unavailable and Ann says so clearly: omit image/video requirement for that attempt, still require the unique phrase + at least three non-media types, and mark **search unavailable** in the report.

---

## Step 0 — Sign in

1. Hard-refresh https://teaching-hub.adam-russell.com/sign-in (or the dashboard if already signed in).
2. Brand **Teaching Hub**, title **Sign in**, label **Passphrase**, button **Sign in**.
3. Enter `{{PASSPHRASE}}`. Dashboard. Rail brand one line. **Sign out** is a header **icon** (aria-label **Sign out**), not a rail pill.

**Pass:** signed in; chrome present.  
**Fail:** invalid passphrase; stacked rail brand; Sign out on the rail.

---

## Step 1 — Fresh lesson

1. Search Lessons for `job check durable`. If it exists from a prior attempt, open it and skip create — note “reused”.
2. Otherwise **+** → **Lesson**. Modal **New lesson**.
3. Title `Job check starter`. Unit `Testing Effect` (or `Job Unit`). Pedagogical mode **Seminar**. **Save**.
4. Must land on `/lessons/…` with the editor. Must **not** say **Lesson not found**.
5. Change title (aria-label **Lesson title**) to `Job check durable`. Wait for **Saved**. Mode stays **Seminar**.
6. Add one **Heading**: `Do now: name one dual-coding move`. Wait for **Saved**.

**Pass:** editor open; title saved; starter heading present.  
**Fail:** not-found; wrong lesson; title did not stick.

---

## Step 2 — Ann: durable job, confirm card, Accept

1. Open chat (`Open chat` / `]`). Select **Ann O'Tation**.
2. Send **exactly**:

```
Keep the existing starter heading. Insert additional blocks below it for a Year 12 psychology mini-lesson on dual coding. Australian English.

You MUST propose at least four different Teaching Hub block types in one proposal. Include ALL of the following:
- rich_text or callout that contains this exact phrase: durable jobs outlive the request
- image (real https URL from the search pack, with meaningful alt text)
- video (YouTube or Vimeo from the search pack)
- one more distinct type (heading, mind_map, question_set, flashcards, table, definition, gallery, or timeline)

Ground image and video URLs in the search pack. Do not invent URLs. Do not use html, html_app, or collection.
Prefer insert_blocks. Keep the heading "Do now: name one dual-coding move".
If web search is unavailable, say so clearly, omit image and video, and still build the other blocks with the unique phrase.
```

3. Record the phase lines you see, in order. Expected some of: **Thinking…**, **Searching the web…**, **Writing the reply…**. Text may appear after writing, or the confirm card may appear with little prose.
4. Wait up to **3 minutes** for a **confirm card** (`confirm-card`) with **Accept** / **Reject** (or **Accept selected**).
5. Before Accept: canvas must still show only the starter heading (or prior Accept content from a retry on this same lesson — note which). No silent insert.
6. Click **Accept** (leave all checkboxes on if **Accept selected**).
7. If the first proposal lacks image or video and search was available: **Reject**, send the same prompt once, Accept the second card. Note both attempts.
8. If **Media not in search pack** or **search unavailable**: record it. One retry only.

**Pass:** phases advanced; confirm card before mutation; Accept applied; unique phrase present; starter heading kept.  
**Fail:** frozen phase >3 min; stall error; silent write; no card; Accept no-op; phrase missing; whole school lesson wiped.

---

## Step 3 — Count types and inspect media

1. Count distinct `data-block-type` on the canvas (include nested). List every type.
2. **Image:** visible `img[src^="https://"]`. Fail on **Unsafe** / **unavailable** / broken / empty frame (unless Step 2 recorded search unavailable).
3. **Video:** YouTube (`youtube-nocookie.com` or `youtube.com`) or Vimeo player. Fail on **Video unavailable.** or no player (unless search unavailable).
4. Unique phrase `durable jobs outlive the request` visible.

**Pass:** ≥4 types including working image and video (or search-unavailable path); phrase present.  
**Fail:** under 4; image/video missing or broken when search was available; phrase absent.

---

## Step 4 — Hammond review-only

1. Agent picker → **General Hammond**. Switching agents must **not** full-reload the site.
2. Send exactly:

```
Review this lesson for a Year 12 class. Do not change any blocks. Do not replace the lesson.
```

3. Expect phases, then a prose review and/or a confirm card. If a confirm card appears, **Reject** it (do not Accept a rewrite).
4. Canvas must still match Step 3 afterwards — same heading, phrase, image, video.

**Pass:** review without destroying the lesson; no silent rewrite.  
**Fail:** stall; frozen phase >3 min; silent rewrite; Accept you did not mean; canvas wiped.

---

## Step 5 — Smoke: job does not leave the canvas broken

1. Wait for **Saved** if dirty.
2. Hard-refresh the lesson URL once.
3. Starter heading, unique phrase, and media from Step 3 must still be present.
4. Chat may restore a finished job as a pending Accept card — that is OK. Do **not** Accept a second time unless the canvas lost the content (then Accept once and note it).

**Pass:** content survives refresh.  
**Fail:** content gone; lesson not found; infinite working state with no phase and no card for 3 minutes.

---

## What not to do

- Do not use `teaching-hub-local` on production unless it works.
- Do not Accept replace-lesson except on **Job check durable**.
- Do not open AI on **Retrieval in 20 minutes** or rewrite English Advanced content.
- Do not wait past **3 minutes** of a frozen phase with no card / no error.
- Do not expect token-by-token streaming — finished reply after phases is correct.
- Do not treat a brief flash of **Thinking…** only as a fail if **Searching** / **Writing** / a card follows within 3 minutes.
- Do not Backup Now / empty Trash / permanently delete.
- Do not run Steps 6–11 from older scripts (publish / print / schedule) — out of scope for run 7.

---

## Report template

Paste this back when finished.

```
# Teaching Hub usability report (run 7)

Date / time:
Browser:
Signed in: yes/no
Lesson URL:
Records used: Retrieval Practice + Job check durable / fallback Job Check / mixed

## Results
| Step | Result (pass/fail) | Notes |
|------|--------------------|-------|
| 0 Sign in |  |  |
| 1 Fresh lesson |  |  |
| 2 Ann durable job + confirm + Accept |  |  |
| 3 Block types + media |  |  |
| 4 Hammond review-only |  |  |
| 5 Refresh persistence |  |  |

## AI
Confirm card before canvas change: yes/no
Proposal kind(s): insert blocks / replace lesson / other:
Retries: 0/1
Phases seen (list in order):
Token-by-token streaming observed: yes/no (expected: no)
Phase stall (>3 min frozen on one phase): yes/no
Stall error shown ("AI connection stalled"): yes/no
Search unavailable message: yes/no
Media not in search pack error: yes/no
Unique phrase present: yes/no
Starter heading kept: yes/no
Hammond mutated canvas: yes/no
Unresolved-job conflict surfaced: yes/no

## Blocks / media
Distinct data-block-type count:
Types found:
Includes image: yes/no
Includes video: yes/no
Image visible https photo: yes/no
Image broken/unavailable: yes/no
Video YouTube or Vimeo player: yes/no
Video unavailable copy: yes/no
Content survived refresh: yes/no

## Bugs (one block per issue)
Severity: blocker / major / minor
Step:
Expected:
Actual:
URL:
Screenshot:

## Verdict
Ship-ready for durable AI jobs (Ann + Hammond): yes / no
One sentence why:
```
