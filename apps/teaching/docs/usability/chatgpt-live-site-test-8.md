# Teaching Hub — ChatGPT Live forensic AI test (run 8)

Copy everything from **Operator brief** through **Report template** into ChatGPT Live (browser / computer-use). Replace `{{PASSPHRASE}}` first. Do not invent or expose a passphrase.

This is not a normal usability run. It is an end-to-end diagnostic trace of Ann and Hammond. A result such as “AI failed,” “search unavailable,” or “timed out” is invalid unless the report identifies the failed technical boundary and includes the evidence available from Chrome DevTools.

---

## Operator brief

You are testing **Teaching Hub** in a real Chrome browser while collecting technical evidence with Chrome DevTools. Follow the steps in order. Continue safely after failures so one run can expose more than one broken boundary.

**Site:** https://teaching-hub.adam-russell.com  
**Passphrase:** `{{PASSPHRASE}}`  
**Timebox:** up to 25 minutes  
**Goal:** determine whether each AI request succeeds from browser click through durable job creation, polling, proposal rendering, explicit acceptance, lesson persistence, media loading, Hammond review, and refresh.

### Non-negotiable reporting rules

1. Never report only that something “failed.” For every failure, report:
   - the last boundary that definitely succeeded;
   - the first boundary that definitely failed;
   - the exact evidence;
   - the narrowest technical conclusion supported by that evidence;
   - what remains unknown.
2. Do not infer a provider failure from a spinner. For example, `phase: "searching"` proves only that the job last persisted the searching phase; it does not by itself prove Brave caused the stall.
3. Do not infer a frontend failure when the terminal job itself contains `status: "error"`.
4. Capture evidence **before** refreshing, retrying, rejecting, accepting, or navigating away.
5. Continue after a diagnosed failure when safe. Do not retry Ann in this run unless explicitly instructed below.
6. Never expose or paste:
   - the passphrase;
   - cookies;
   - `Cookie`, `Authorization`, or secret request headers;
   - API keys;
   - complete HAR files.
7. You may record non-secret correlation headers such as `x-nf-request-id`, `x-request-id`, `server`, or cache-status headers if present.
8. Use screenshots for visible state, but do not use screenshots as a substitute for request status, response JSON, console text, or timestamps.
9. Do not modify requests, responses, storage, cookies, JavaScript, or application state through DevTools. Observation only.

### Expected architecture

The expected Ann/Hammond request path is:

1. Browser sends `POST /api/ai/jobs`.
2. A successful creation returns HTTP `202` with an envelope resembling:

```json
{
  "ok": true,
  "data": {
    "id": "ai_job_…",
    "status": "working"
  }
}
```

3. Browser polls `GET /api/ai/jobs/{jobId}`.
4. The job normally advances through distinct persisted states:
   - `status: "working", phase: "queued"`
   - `status: "working", phase: "searching"`
   - `status: "working", phase: "writing"`
   - terminal `status: "done"` or `status: "error"`
5. A completed Ann job should contain a mutating `proposal`, normally `kind: "insert_blocks"`.
6. The UI renders a confirm card. The lesson must not mutate before **Accept**.
7. Accept applies the proposal locally, then the browser saves with `PUT /api/lessons/{lessonId}` and records resolution with `PATCH /api/ai/jobs/{jobId}` containing `{"resolution":"accepted"}`.
8. A completed Hammond review should use `proposal.kind: "review_only"` and must not change or save lesson blocks.

The exact JSON may contain additional fields. Record what is actually present.

---

## Step 0 — Sign in and prepare DevTools

1. Open Chrome at https://teaching-hub.adam-russell.com/sign-in.
2. Open Chrome DevTools before signing in:
   - macOS: `Command` + `Option` + `I`;
   - Windows/Linux: `F12` or `Control` + `Shift` + `I`.
3. In **Network**:
   - enable **Preserve log**;
   - enable **Disable cache** while DevTools is open;
   - clear existing requests;
   - ensure recording is active.
4. In **Console**:
   - enable **Preserve log** if available;
   - clear existing messages;
   - note any errors that appear before AI starts as **baseline errors**.
5. If ChatGPT Live cannot operate the visible DevTools UI, use its browser/CDP network and console inspection tools to collect the equivalent evidence. Do not pretend evidence was collected if the tools cannot access it.
6. Enter `{{PASSPHRASE}}` and select **Sign in**.
7. Confirm the dashboard appears.
8. Record:
   - sign-in request HTTP status;
   - any sign-in response error code/message;
   - any new console error.

**If sign-in fails:** capture the request method, path, status, duration, sanitized response body, and console error. Conclude authentication failure only if the HTTP evidence supports it. Continue only if a valid signed-in session is available.

---

## Step 1 — Create an isolated lesson and verify baseline persistence

Do not use or alter an established teaching lesson.

1. Create a new lesson with title:

```text
AI forensic run 8 — YYYYMMDD-HHMM
```

Replace the suffix with the actual local date and time so the lesson is unique.

2. Use `Testing Effect` or `Job Unit` if available. Use pedagogical mode **Seminar**.
3. Open the new lesson and record its URL and lesson ID.
4. Change the on-page title to the same unique title.
5. Add one Heading block:

```text
Do now: name one dual-coding move
```

6. Wait for **Saved**.
7. In Network, locate the latest `PUT /api/lessons/{lessonId}` and record:
   - status;
   - duration;
   - response error body if non-2xx;
   - non-secret request ID header if present.
8. In Console, run this read-only snapshot and record the returned object:

```js
(() => {
  const canvas = document.querySelector('.teacher-layout__canvas');
  const blocks = [...(canvas?.querySelectorAll('[data-block-type]') ?? [])];
  return {
    blockCount: blocks.length,
    blockTypes: [...new Set(blocks.map((el) => el.getAttribute('data-block-type')))],
    hasStarterHeading: Boolean(canvas?.innerText.includes('Do now: name one dual-coding move')),
    hasUniquePhrase: Boolean(canvas?.innerText.includes('durable jobs outlive the request'))
  };
})()
```

This is the **baseline DOM snapshot**.

**If baseline save fails:** diagnose the lesson persistence request before starting AI. You may continue to trace AI, but mark later persistence conclusions as contaminated by the baseline save defect.

---

## Step 2 — Clear the trace and send the exact Ann request

1. Open chat and select **Ann O'Tation**.
2. In Network, clear requests now. Preserve Log must remain enabled.
3. In Console, add a visible marker:

```js
console.info('RUN8_ANN_SEND', new Date().toISOString())
```

4. Record the exact send time as `T0`.
5. Send exactly:

```text
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

6. Do not click Send twice.
7. Observe the UI and Network together for up to 3 minutes.

---

## Step 3 — Trace Ann job creation

Find the `POST /api/ai/jobs` caused by Step 2.

### If the POST exists

Record:

- request start time relative to `T0`;
- HTTP status;
- duration;
- sanitized response body;
- response `content-type`;
- non-secret request/correlation headers if present;
- request payload fields:
  - `agent`;
  - `lesson_id`;
  - `scope`;
  - `selected_block_id` present/absent;
  - `action` present/absent;
  - `lesson_snapshot_at` present/absent and value;
  - message character count;
  - history turn count.

Do not paste the complete lesson snapshot if it is large. Do not paste request headers.

For HTTP `202`, extract the returned job ID exactly and use it for all later correlation.

### If the POST does not exist within 10 seconds

Capture:

- whether the user bubble appeared;
- whether the Send button was disabled;
- the exact visible UI message;
- every new Console error with level, text, source file, line, and stack if available;
- a screenshot showing chat and Network.

Supported conclusion: the failure occurred before job creation at the browser/UI boundary. Do **not** blame Netlify, Brave, or Anthropic because no request reached the API.

### Classify non-202 creation responses

- `400`: record `error.code`, `error.message`, and validation `details`; this is a request-schema/input failure.
- `401`: record the body; this is a session/authentication rejection.
- `404`: record the body; usually the referenced lesson was not found.
- `409`: record the existing job `id` and `status` from `error.details`; this is an unresolved-job conflict, not a provider timeout.
- `5xx`: record exact status, body, duration, and request ID; this is a server/function boundary failure. Do not claim which downstream service caused it without response evidence.
- network error/no HTTP response: record Chrome’s exact error such as `net::ERR_*`, request timing, and Console message.

If creation did not return a usable job ID, continue to Step 8 using Hammond only if the app permits it safely.

---

## Step 4 — Trace Ann polling and terminal state

Filter Network by the exact job ID. Observe `GET /api/ai/jobs/{jobId}` requests.

Create a phase timeline containing one row for each **distinct** state, plus the final request. For each entry record:

- elapsed seconds since `T0`;
- GET HTTP status;
- request duration;
- `data.status`;
- `data.phase` or absent;
- `data.error` or absent;
- whether `data.response` exists and its character count;
- whether `data.proposal` exists;
- proposal `kind` if present.

Do not list every duplicate poll. Record the first and last occurrence time of repeated states.

### Terminal success requirements for Ann

The terminal body should have:

- HTTP `200`;
- `ok: true`;
- `data.status: "done"`;
- no `data.error`;
- a `data.proposal`;
- a mutating proposal kind, preferably `insert_blocks`;
- proposed content containing the exact unique phrase;
- proposed block types including `image`, `video`, and at least two other distinct types when search succeeded.

Record from the actual proposal:

- proposal kind;
- every proposed block type;
- distinct proposed type count;
- image URL(s);
- image alt text;
- video provider and external ID or URL;
- whether the exact unique phrase appears.

The browser does not receive the private search pack. Therefore:

- a completed persisted proposal indicates the server-side media validator accepted it;
- it does **not** let you directly compare the media URL with the hidden search pack;
- if validation rejected media, report the exact terminal error rather than claiming direct search-pack contents.

### Polling failure attribution

- POST `202`, but no GET appears: polling did not start in the browser. Capture Console evidence.
- GET `401`: session expired during polling.
- GET `404`: the created job cannot be read at its expected ID; record the POST job ID and GET path.
- GET `5xx` or network error: polling transport failed; record exact status/error and whether later polls recover.
- `working/queued` for over 3 minutes: job was created but no later persisted phase was observed. Possible background invocation/execution failure; do not name a provider.
- `working/searching` for over 3 minutes: the last persisted boundary is search. This does not prove Brave is the cause without an error response or server log.
- `working/writing` for over 3 minutes: search completed far enough to persist writing. The stall is after that boundary, but the browser alone may not distinguish Anthropic latency from later proposal processing.
- terminal `status: "error"`: quote `data.error` exactly and identify the phase immediately before error.
- terminal `done` with no proposal: server job contract failure for this mutating Ann request.
- terminal proposal present but missing required block types: model/proposal quality failure, unless the response explicitly says search was unavailable.

Capture the terminal Response panel and the visible AI UI in screenshots.

---

## Step 5 — Compare terminal job with the pre-Accept UI

Before clicking Accept:

1. Record the visible AI reply exactly.
2. Record whether `.confirm-card` exists.
3. Record whether **Accept** or **Accept selected** exists.
4. Re-run the baseline DOM snapshot from Step 1.
5. Compare the result with the baseline.

Classify:

- terminal proposal exists, but no confirm card: client rendering/state-association failure;
- confirm card exists, but proposal content differs from terminal JSON: client proposal transformation/rendering failure;
- canvas changed before Accept: confirmation-boundary defect;
- terminal error and UI shows the same exact error: server-side failure correctly surfaced;
- terminal error but UI hides or replaces the technical error: error-reporting defect; record both strings;
- UI remains on a phase after terminal `done`: client polling/render completion defect.

If no valid Ann confirm card exists, do not invent one and do not click unrelated controls. Continue to Step 8.

---

## Step 6 — Accept Ann and trace application/persistence

Only perform this step if the confirm card belongs to the new forensic lesson and the proposal is safe.

1. Keep all proposal checkboxes selected.
2. Clear Network, keeping Preserve Log enabled.
3. Add a Console marker:

```js
console.info('RUN8_ANN_ACCEPT', new Date().toISOString())
```

4. Record the Accept time as `A0`.
5. Click **Accept** or **Accept selected** once.
6. Observe:
   - immediate DOM change;
   - `PATCH /api/ai/jobs/{jobId}`;
   - `PUT /api/lessons/{lessonId}`;
   - visible save state.
7. Record for the job PATCH:
   - request body resolution;
   - HTTP status and duration;
   - sanitized response body or exact network error.
8. Record for the lesson PUT:
   - HTTP status and duration;
   - sanitized response error body if any;
   - non-secret request ID if present.
9. Wait for **Saved** or an explicit save failure.
10. Run the DOM snapshot again and also run:

```js
(() => {
  const canvas = document.querySelector('.teacher-layout__canvas');
  const image = canvas?.querySelector('img[src^="https://"]');
  const video = canvas?.querySelector(
    'iframe[src*="youtube"], iframe[src*="youtu.be"], iframe[src*="vimeo"]'
  );
  return {
    image: image
      ? {
          src: image.currentSrc || image.getAttribute('src'),
          alt: image.getAttribute('alt'),
          complete: image.complete,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight
        }
      : null,
    video: video
      ? {
          src: video.getAttribute('src'),
          title: video.getAttribute('title')
        }
      : null
  };
})()
```

### Accept failure attribution

- click produces no DOM change, no job PATCH, and no lesson PUT: Accept handler/client interaction failure;
- DOM changes but no lesson PUT follows: save scheduling/client persistence failure;
- lesson PUT is non-2xx: lesson API persistence failure; quote response;
- lesson PUT succeeds but job PATCH fails: content may be saved, but durable job resolution tracking failed;
- job PATCH succeeds but lesson PUT fails: job says accepted while content persistence failed; this is a cross-resource consistency defect;
- both requests succeed but DOM lacks proposal content: proposal application/rendering defect;
- both succeed and DOM is correct: Accept and initial persistence succeeded.

---

## Step 7 — Diagnose image and video separately

### Image

1. Record the accepted image element’s final `currentSrc`, alt text, `complete`, `naturalWidth`, and `naturalHeight`.
2. Find the matching image request in Network.
3. Record status, MIME type, duration, transfer size if visible, and Chrome error if no HTTP response.
4. Classify:
   - no image in terminal proposal: proposal-generation failure;
   - image in proposal but no image DOM element after successful Accept: block application/render failure;
   - image element exists but no request: browser/render/CSP/lazy-load boundary; record Console;
   - request returns 4xx/5xx: remote asset failure;
   - request blocked by CSP/mixed content/client: quote the exact Console message;
   - request succeeds but `naturalWidth === 0`: decode/render failure.

### Video

1. Record the accepted iframe/player source and title.
2. Confirm the host is YouTube/YouTube NoCookie or Vimeo.
3. Find its document/player request in Network and record status/error where Chrome exposes it.
4. Record any player error or **Video unavailable** text.
5. Classify:
   - no video in terminal proposal: proposal-generation failure;
   - video in proposal but no player DOM after Accept: block application/render failure;
   - player request blocked: quote exact Network/Console evidence;
   - provider says unavailable: provider/media availability failure;
   - cross-origin details unavailable: state that limitation; do not fabricate a status.

---

## Step 8 — Trace Hammond independently

Hammond must be tested even if Ann failed, provided the forensic lesson is still safe to use.

1. Select **General Hammond**.
2. Clear Network.
3. Add a Console marker:

```js
console.info('RUN8_HAMMOND_SEND', new Date().toISOString())
```

4. Record `H0`.
5. Send exactly:

```text
Review this lesson for a Year 12 class. Do not change any blocks. Do not replace the lesson.
```

6. Repeat Steps 3 and 4 for Hammond:
   - creation POST;
   - returned job ID;
   - phase timeline;
   - terminal body;
   - UI comparison.
7. Expected terminal result:
   - `status: "done"`;
   - useful `response` text and/or `proposal`;
   - if proposal exists, `proposal.kind: "review_only"`.
8. Record any lesson `PUT` triggered between `H0` and completion.
9. Re-run the DOM snapshot.

Classify:

- Hammond terminal `review_only` and matching prose with no lesson PUT or DOM mutation: correct;
- terminal `review_only` but UI shows no review: client rendering failure;
- mutating proposal kind: agent contract failure;
- lesson PUT or changed block DOM caused by review alone: silent-mutation defect;
- use the same exact HTTP and phase attribution rules as Ann for transport/job errors.

Do not Accept a Hammond rewrite. If a mutating confirm card appears, record it and leave it pending or reject it only after evidence capture.

---

## Step 9 — Hard-refresh persistence trace

1. Ensure the latest visible save state has settled.
2. Record a final pre-refresh DOM snapshot.
3. Clear Network.
4. Hard-refresh the exact lesson URL once.
5. Record:
   - document request status;
   - `GET /api/lessons/{lessonId}` status, duration, and sanitized error body;
   - Console errors;
   - post-refresh DOM snapshot;
   - image and video DOM diagnostics;
   - matching media request failures.
6. Compare pre-refresh and post-refresh content.

Classify:

- successful lesson PUT before refresh, successful GET after refresh, but AI blocks missing: server persistence/read consistency or payload defect; compare PUT and GET bodies if available;
- successful PUT, GET fails: read API/session/network failure;
- GET returns blocks but DOM omits them: client hydration/render failure;
- GET and DOM contain blocks but media fails: media loading/provider failure;
- pre-refresh PUT failed and content disappears: expected consequence of known persistence failure, not a new root cause.

---

## Technical diagnosis rules

Use the narrowest label supported by evidence:

- **Browser event/UI:** expected request never left the browser.
- **Authentication/session:** API returned `401`.
- **Request validation:** API returned `400` with validation details.
- **Lesson lookup:** API returned `404` for the lesson.
- **Unresolved job conflict:** creation returned `409` with an existing job ID.
- **Job creation function:** creation returned `5xx` or malformed success body.
- **Polling transport:** job exists, but GET requests fail.
- **Background execution:** job remains working without terminal state; report last persisted phase without guessing the downstream provider.
- **Search stage:** terminal error explicitly identifies search/Brave, or server evidence does. A searching phase alone is insufficient.
- **Writing/model stage:** terminal error explicitly identifies model/Anthropic, or server evidence does. A writing phase alone is insufficient.
- **Proposal contract/validation:** terminal job completes without a required proposal, has invalid kind/content, or reports proposal/media validation error.
- **Client job rendering:** terminal response contains the expected result but UI does not.
- **Confirmation boundary:** canvas mutates before Accept.
- **Proposal application:** Accept occurs but expected blocks do not appear.
- **Lesson persistence:** lesson PUT fails.
- **Job resolution tracking:** accepted/rejected job PATCH fails.
- **Refresh/read/render:** distinguish successful server GET from failed DOM hydration.
- **Remote media/provider:** proposal and DOM are correct, but the external resource request/player fails.

If evidence only narrows a failure to a stage, say so. Example:

> The POST succeeded and polling reached `working/searching`, but the job stayed there for 181 seconds. The browser proves the background job did not persist a later phase; it cannot determine whether Brave hung, the function stopped, or the phase update after search was never written. Netlify background-function logs for job `ai_job_…` are required next.

That is a useful diagnosis. “Search timed out” without provider evidence is not.

---

## Required evidence package for every failure

Before continuing, collect:

1. UTC or local timestamp with timezone.
2. Lesson URL and lesson ID.
3. Agent and exact job ID, or “no job ID returned.”
4. Failed boundary.
5. Last successful boundary.
6. Request method and path.
7. HTTP status or exact Chrome network error.
8. Request duration.
9. Sanitized response body.
10. Phase timeline.
11. Exact UI text.
12. Exact Console errors with source and line.
13. Relevant proposal kind/block types/media URLs.
14. DOM snapshot before and after the boundary.
15. Screenshot references.
16. Narrow technical conclusion.
17. Remaining uncertainty.
18. Next evidence source required, such as a Netlify function log correlated by job ID/request ID.

---

## Report template

Paste the completed report back. Do not leave diagnosis fields blank when a step failed.

```text
# Teaching Hub forensic AI report (run 8)

Date/time and timezone:
Chrome version:
Lesson URL:
Lesson ID:
DevTools Network Preserve log enabled: yes/no
DevTools Disable cache enabled: yes/no
Technical evidence access limitations:

## Baseline

Sign-in HTTP result:
Baseline lesson PUT result:
Baseline console errors:
Baseline DOM snapshot:

## Ann creation

T0:
POST present: yes/no
POST status:
POST duration:
POST request ID header, if present:
Sanitized POST response:
Payload agent:
Payload lesson_id:
Payload scope:
Payload lesson_snapshot_at:
Payload message character count:
Payload history count:
Ann job ID:

## Ann phase timeline

- +0.0s — HTTP/status/phase/error:
- Add one line for each distinct state and the final poll.

Terminal HTTP status:
Terminal job status:
Terminal phase present/absent:
Terminal exact error:
Response present and character count:
Proposal present:
Proposal kind:
Proposed block types:
Proposed distinct type count:
Unique phrase in proposal:
Proposed image URL and alt:
Proposed video provider/ID/URL:

## Ann UI before Accept

Visible AI text:
Confirm card present:
Accept control present:
DOM snapshot:
Canvas mutated before Accept:
Terminal/UI mismatch:

## Ann Accept and save

A0:
Immediate DOM change:
Job PATCH status/duration/body:
Lesson PUT status/duration/body:
Visible save state:
Post-Accept DOM snapshot:

## Media

Image DOM diagnostics:
Image request status/error/MIME:
Image Console error:
Video DOM diagnostics:
Video request status/error:
Video visible error:
Media technical conclusion:

## Hammond

H0:
Creation POST status/duration/body:
Hammond job ID:
Phase timeline:
Terminal status/error:
Response present and character count:
Proposal kind:
Visible review:
Confirm card present:
Lesson PUT triggered:
DOM changed:

## Refresh

Pre-refresh DOM snapshot:
Document request:
Lesson GET status/duration/body on error:
Post-refresh DOM snapshot:
Content survived:
Media survived:
Console errors:

## Failures

### Failure 1

Timestamp:
Agent/job ID:
Last successful boundary:
First failed boundary:
Request method/path:
HTTP status or exact network error:
Duration:
Sanitized response:
Phase timeline:
Exact UI text:
Exact Console evidence:
DOM evidence:
Screenshot:
Technical conclusion supported by evidence:
What remains unknown:
Next evidence needed:

### Failure 2

Repeat the same fields as needed.

## Final boundary verdicts

Browser send -> job POST: pass/fail/not reached
Job creation -> polling: pass/fail/not reached
Polling -> terminal Ann result: pass/fail/not reached
Terminal Ann result -> confirm card: pass/fail/not reached
Confirm card -> explicit application: pass/fail/not reached
Application -> lesson PUT: pass/fail/not reached
Lesson PUT -> refresh persistence: pass/fail/not reached
Proposal -> image load: pass/fail/not reached
Proposal -> video player: pass/fail/not reached
Hammond -> review_only without mutation: pass/fail/not reached

Overall verdict:
Primary proven failure boundary:
Primary technical reason:
Secondary defects:
Required server-side follow-up, including job/request IDs:
```
