# Voice block: viva practice, one-tap oral feedback, shared feedback codes

Date: 21 October 2026
Status: design, not built
Branch: `claude/voice-block`

## What this is

One Teaching block for everything spoken. Today the `audio` block only plays a clip the teacher uploaded. This spec turns it into the **Voice** block with three modes:

| Mode | Who records | What it does |
|---|---|---|
| **Listen** | Teacher (upload) | Today's audio block, unchanged |
| **Respond** | Student | Record a spoken answer to a prompt and submit it |
| **Viva** | Student | Timed oral practice: prep dot points, the timer walks through them while recording, submit the best take |

Adam marks submissions with **one-tap feedback codes** while listening. Each tap lands on the word being spoken. Students read the result in a view that looks and works like annotation and peer feedback.

The same **feedback code library** (composition codes, viva codes, speaking codes) is also available in the annotation block, so written and spoken work use one code system.

No new block type. Respond and Viva are modes of the existing `audio` block, and the picker shows it as "Voice".

## Decisions already made (Adam, 21 Oct 2026)

1. One block with modes, not a family of blocks.
2. **Audio deletes itself 28 days after the student submits it. The transcript, tags and comments are kept for good.** Fully automatic, nothing for Adam to manage.
3. Students practise as often as they like on their own device and **submit only their best take**.
4. Marking must be lightning fast: hit a button at the moment it happens, and the tag appears on that word in the transcript.
5. The student feedback view matches annotation and peer feedback in look and navigation. No new pattern to learn.
6. **No privacy notice in the block.** Recording spoken answers is covered by the school's safe tech use policy.
7. The code library starts from a colleague's composition margin codes (TS, E, T, AR …), plus codes drawn from the viva A/B/C descriptors and speaking-skill codes. In the code and UI they are called **composition codes**. The colleague is never named in this repo.

## Student flow (Viva mode)

### 1. Prep

- The block shows the question and the time limit (set by Adam: 30–300 s; or "student chooses" from 60 / 90 / 120 s).
- The student types their dot points into a scaffold list (2–8 points, 120 characters each). Adam can pre-fill a scaffold ("Concept · Evidence 1 · Evidence 2 · Link back") which students overwrite.
- The plan is kept on the device (same draft storage as peer feedback), so a reload loses nothing.

### 2. Record

- **Start** shows a big 3-2-1 countdown on screen, then recording begins on "Go".
- The time is split across the dot points, evenly by default. Adam can set weights, e.g. a longer slot for the main point.
- The current point is large and highlighted. Upcoming points are dimmed, done points are ticked. A thin progress bar runs under each point and a ring shows total time.
- The point moves on by itself when its slot ends. The student can press **Next** (or Space) to move on early. Each change of point is stamped as a timestamp. This reuses the recorder's existing `taps`, which already stamp media time.
- At the time limit the recording stops by itself. A soft warning shows 10 s before the end. The student can stop early.
- Live captions run where the browser supports them (existing `voice-live-captions.ts`), but only as a comfort, never as the transcript of record.

### 3. Review takes

- Each take stays on the device only (existing `voice-draft-store.ts`, IndexedDB). It never leaves the device until the student submits it.
- The student sees their takes as a list (newest first, last 5 kept): duration, "points reached 4/4", and a play button.
- **Submit this take** on one take. One submission per student per block, and it is final: no resubmitting. If something went wrong, Adam deletes that submission from the inbox, and the student can submit again.

### 4. Submit

- The first submit on a device asks for their **initials** once (2–4 letters, e.g. "JS"). They are remembered on the device for the next Voice block.
- Upload uses the existing chunked part upload, so long or flaky uploads retry part by part. If an upload fails, the take stays on the device with **Try again**, as the annotation recorder does today.
- After submitting, the student sees "Sent to your teacher. Your feedback will appear here."

### 5. Read feedback

- When Adam returns the feedback, the same block on the same device shows it. A private **feedback link** also exists, reusing the existing feedback-token system (`teaching-feedback.mjs`, `/api/published/feedback/:token`). Students can open it on another device, and Adam can copy it into Google Classroom if a student lost their device data.
- See "Student feedback view" below.

## Respond mode

The same as Viva without the dot-point scaffold. It shows a prompt and an optional time limit. It shares the record → takes → submit → feedback pipeline.

## Teacher flow

### Setting up the block

The editor has a mode picker shown as pills (house style: pills, not a select): **Listen · Respond · Viva**.

Viva settings:
- question (rich text)
- time limit, or "student chooses"
- optional scaffold template (point labels)
- optional point weights
- code set for marking: which groups show on the strip, e.g. hide SB/SI for non-comparative tasks

### Submissions inbox

In the teacher view of the block on the lesson page:

- a list of submissions: name, duration, submitted time, status (**New · Marked · Returned**), and an "audio deletes in N days" chip
- the transcript appears automatically once Whisper is done. The row shows "Transcribing…" until then
- a filter by status, and **Next unmarked** to go straight through the pile

### Marking screen (the core of this spec)

The layout follows the annotation voice review (`voice-review.ts`): player and transcript on the left, notes on the right.

**The code strip** sits under the player and shows every code in the block's chosen groups.

- **Speaking codes have number keys:** `1` FW · `2` PF · `3` PS · `4` PA · `5` VO · `6` FL · `7` TO · `8` TM.
- **Composition and viva codes are typed** as letters, like writing in a margin: `A` `R` `Space` → AR. Space confirms, which settles prefixes such as T vs TS. Escape cancels.
- **Shift + any code** marks it as a strength (TS+, E+, PA+). Strengths draw in a different style so students can tell praise from correction at a glance.
- Clicking a button on the strip does the same as the key.

**Where a tag lands:**
- the media time at the moment of the press, minus a reaction offset (default 1.0 s, adjustable 0–2 s in the marking screen and remembered)
- snapped to the nearest transcript word using Whisper's per-word times. When the transcript only has segment times, the tag lands on the segment and the student sees that sentence highlighted
- a tag can be dragged to a neighbouring word, or the word span stretched, to fix a near miss

**After a tag:**
- the tag shows at once on the transcript word in that code's colour
- the code's descriptor is attached automatically, so Adam never types it
- `Enter` straight after a tag opens a one-line note on that tag (optional)
- `Z` undoes the last tag

**Playback controls while marking:**
- `K` or the space bar outside the code entry plays and pauses
- `J` / `L` jump back or forward 5 s
- speed: 1×, 1.25×, 1.5×, 2×
- clicking a word in the transcript jumps the audio there

**Fillers pre-marked:**
- after transcription, a word-list pass with no AI tags likely fillers ("um", "uh", "like" as a filler, "you know", "sort of", "basically") as **suggested FW**: grey and dashed
- Adam confirms with `Y` or rejects with `N`, moving through them in order, or ignores them
- only confirmed tags reach the student
- for fillers to show up at all, the Whisper call must keep them (see Transcription)

**Summary**, built automatically and editable before returning:

```
Criterion 1 · Ideas       AR ×2 · PP ×1 · TS+
Criterion 2 · Evidence    E+ ×2 · T ×2 · AC ×1
Criterion 3 · Expression  EX ×1 · L ×1
Speaking                  FW ×6 (mostly "like") · PF in point 2 · PA+ ×2
Time                      84 s of 90 s · all 4 points reached
```

- the most common filler word is named
- tags are also grouped by dot point using the point timestamps, so a student sees "point 2 is where I rushed"
- an optional overall comment box (rich text, same editor as annotation notes)
- no grade or band is calculated. Codes are grouped by criterion so Adam can see the pattern, and he decides the mark

**Return** sends the feedback to the student, and the status becomes Returned. Adam can re-open and edit later; the student then sees the latest version.

## Student feedback view

It is built from the peer annotate "received" view (`peer-annotate.ts`, `receivedView`), so the look and navigation are the same.

- the summary is at the top, grouped by criterion
- the transcript shows each tag as a coloured mark on the word with its code label. Strengths are drawn solid with a `+`
- tapping a mark shows the full descriptor and Adam's note beside it. On phone it sits below, the same as peer feedback
- **while the audio still exists**, tapping a mark plays from 2 s before it. After deletion, the play controls are replaced by one quiet line: "Audio removed after 4 weeks. Transcript and feedback kept."
- dot points are shown as section dividers in the transcript at their timestamps

## Feedback code library (shared)

### Model

```ts
type FeedbackCode = {
  id: string;              // stable, e.g. 'comp_ar'
  code: string;            // 'AR' (1–3 uppercase letters)
  label: string;           // 'Analysis – Relevance'
  descriptor: string;      // what the student reads (plain text, ≤ 600 chars)
  group: 'composition' | 'viva' | 'speaking';
  criterion: 1 | 2 | 3 | null;   // rubric criterion for the summary; null for speaking
  key?: '1'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9';  // speaking codes only
  colour: CodeColour;      // reuse peer-annotate palette
  strength_descriptor?: string;  // shown for the Shift (+) form; optional
  hidden?: boolean;
};
```

- stored as one Blob (`feedback_codes/library`). It is operator-only to edit and read by students only as the codes attached to their own feedback
- edited in Teaching settings with the same editor shape as the peer feedback bank (`peer-annotate-bank.ts`): add, reorder, recolour, hide
- the existing peer feedback bank (student-facing, max 12) stays separate. It is a different audience with different rules, but uses the same editor component

### Seed set

The seed ships in the repo with **short paraphrased descriptors**. Adam pastes the full wording from the department sheets into the library in settings, which saves to Blobs, not the public repo.

| Group | Code | Label | Criterion |
|---|---|---|---|
| composition | TS | Topic sentence | 1 |
| composition | AR | Analysis – relevance | 1 |
| composition | AS | Analysis – specific | 1 |
| composition | AD | Analysis – depth | 1 |
| composition | SD | Structure – development | 1 |
| composition | E | Evidence | 2 |
| composition | T | Techniques | 2 |
| composition | AC | Analysis – coherence (plot recount) | 2 |
| composition | SB | Structure – balance | 2 |
| composition | SI | Structure – integration | 2 |
| composition | S | Structure | 3 |
| composition | EX | Expression | 3 |
| composition | L | Length / succinctness | 3 |
| viva | PP | Pre-prepared, not answering this question | 1 |
| viva | X | Accuracy slip | 2 |
| viva | NP | Needed prompting | 3 |
| speaking | FW | Filler word | – |
| speaking | PF | Pace too fast | – |
| speaking | PS | Pace too slow | – |
| speaking | PA | Pause | – |
| speaking | VO | Volume / projection | – |
| speaking | FL | Fluency (lost thread, restart) | – |
| speaking | TO | Tone (monotone or emphasis) | – |
| speaking | TM | Timing (short or over) | – |

Codes must be unique across the library. Typed entry relies on that, and the editor refuses duplicates.

### In the annotation block

- `AnnotationItemSchema` gains an optional `code: { id: string; positive: boolean }`, alongside the existing `technique` ref
- the annotation editor's note popover gets the same typed entry (`A` `R` `Space`) and a small code row. A coded note pre-fills the descriptor, and Adam can add to it
- the summary-by-criterion view is available on any annotation layer that has coded notes
- marking students' written work as a block of its own is **out of scope**. This spec only makes the codes usable wherever annotation already runs

## Data

### Block schema (`AudioBlockSchema`)

`mode` defaults to `'listen'`, so every existing audio block parses unchanged:

```ts
content: z.object({
  url: z.string().optional(),            // listen mode only (was required)
  title: z.string().optional(),
  mode: z.enum(['listen', 'respond', 'viva']).default('listen'),
  prompt_html: z.string().max(8000).optional(),
  time_limit_s: z.number().int().min(30).max(300).optional(),
  student_chooses_time: z.boolean().optional(),
  scaffold: z.array(z.object({ label: z.string().max(80), weight: z.number().min(0.5).max(3).default(1) })).max(8).optional(),
  code_groups: z.array(z.enum(['composition', 'viva', 'speaking'])).optional(),
  hidden_code_ids: z.array(z.string()).optional()
})
```

A refine requires `url` when the mode is `listen`. Run `generate-alchemy-schema.mjs` and `generate-block-css.mjs` after the change.

### Submission record (Blob `voice_submissions/{lessonId}/{blockId}/{submissionId}`)

```ts
{
  id, lesson_id, block_id,
  student_initials,             // 2–4 letters as typed; Blobs only
  device_hash,                  // hash of the device token, as class-symbols does
  submitted_at,
  audio: { media_id, duration_s, mime } | null,   // null once deleted
  audio_delete_after,           // submitted_at + 28 days
  audio_deleted_at?,
  transcript: { words: VoiceWord[], timing: 'word'|'segment'|'estimated' } | null,
  transcribe_job_id?,
  points: Array<{ label: string; t: number }>,     // dot-point stamps
  tags: Array<{ id, code_id, positive, t, word_range: [number, number], note?, source: 'tap'|'suggested', confirmed }>,
  summary_html?, comment_html?,
  status: 'new' | 'marked' | 'returned',
  feedback_doc_id?              // link into teaching-feedback for the private token
}
```

Tags store `code_id`, not a copy of the descriptor. The student view resolves descriptors from the library, so an improved descriptor updates old feedback too. If a code is later deleted, the record keeps `code` and `label` as a fallback for display.

## Storage and retention

- record at **32 kbps Opus** for this mode (the annotation recorder uses 64 kbps; speech does not need it). 90 s ≈ 360 KB
- a class of 24 × 1 submission per block is about 9 MB of audio. Even at 5 viva blocks a week that is about 45 MB a week, held for 4 weeks only, so it peaks around 200 MB
- practice takes never leave the device
- **auto-delete:** the existing daily scheduled tick (`ai-jobs-tick-scheduled.mjs`, cron `17 14 * * *`) gains one step that finds submissions where `audio_delete_after < now` and `audio_deleted_at` is unset. That step:
  - deletes the media file and media record
  - sets `audio: null` and `audio_deleted_at`
  - keeps everything else
  - is idempotent: a failed run simply retries next day
- a small index Blob (`voice_submissions/_audio_index`) lists submission keys with audio still present, so the tick does not list every submission ever made
- the inbox chip shows "audio deletes in N days". There is no button to keep audio longer, by design

## Transcription

- reuses the existing pipeline: chunked parts → `annotation-voice-transcribe` style job → background run → knowledge kernel `/transcribe` (Workers AI `@cf/openai/whisper-large-v3-turbo`)
- **change needed in the kernel:** `whisperRunInput` accepts an optional `initial_prompt`. Voice submissions pass a short prompt with natural fillers ("Um, so, like, I think, uh, the text…") so Whisper keeps disfluencies instead of cleaning them out. Annotation recordings keep the current behaviour
- cost: Workers AI Whisper turbo is a fraction of a cent per audio minute. 24 students × 5 × 90 s = 180 min a week, which is well under US$1 a week. No LLM is involved anywhere in this spec
- the job kind is `voice_submission_transcribe`, with its own status, so failures show in the inbox row with **Retry transcription**

## API

Student routes are added to `PUBLIC_STUDENT_API_ROUTES`:

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/published/voice/:lessonId/:blockId/part` | upload one audio part (device token required) |
| POST | `/api/published/voice/:lessonId/:blockId/submit` | finish upload, create submission, queue transcription |
| POST | `/api/published/voice/:lessonId/:blockId/mine` | this device's submission + returned feedback (POST so the token stays out of the URL) |
| GET | `/api/published/feedback/:token` | existing private feedback link (extended payload) |

Student routes are guarded like the other published routes:
- the lesson must be published and the block must exist in that mode
- size cap: time limit + 15 s at 32 kbps, plus margin
- rate limit per device hash
- a device only ever reads its own submission

Operator routes:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/voice/:lessonId/:blockId/submissions` | inbox |
| GET/PUT | `/api/voice/submissions/:id` | read and save tags, summary, comment |
| POST | `/api/voice/submissions/:id/return` | mark returned, mint or refresh the feedback link |
| POST | `/api/voice/submissions/:id/retranscribe` | retry a failed job |
| DELETE | `/api/voice/submissions/:id` | remove a submission so the student can submit again |
| GET/PUT | `/api/feedback-codes` | the code library |

## Build order (one PR, phases as commits)

1. **Codes:** `FeedbackCode` schema, seed, Blob store, settings editor (reusing the peer bank editor).
2. **Block schema + editor:** modes on `audio`, Viva/Respond settings, picker label "Voice", generated files.
3. **Student recording:** scaffold, timed walkthrough, point stamps, local takes, 32 kbps.
4. **Submit pipeline:** public routes, parts, submission record, transcription job with `initial_prompt` (kernel change), device token.
5. **Inbox + marking screen:** code strip, keys, typed entry, reaction offset, snap-to-word, drag fix, undo, suggested fillers, summary.
6. **Return + student view:** feedback link, received view, playback until deletion.
7. **Retention:** daily delete step, audio index, "audio removed" states.
8. **Annotation codes:** `code` on annotation items, typed entry in the note popover, criterion summary.

Phases 1–7 are the Voice block. Phase 8 can be dropped from this PR if the PR gets too big, because nothing in 1–7 depends on it.

## Failure modes to check (see `docs/CURSOR-UI-FAILURES.md` for house entries)

- **Safari / iOS recording.** Annotation voice notes on Safari are still unverified. Test record → submit on an iPhone with Safari before calling phase 3 done, because MediaRecorder on iOS gives `audio/mp4`.
- **Tab in the background during recording** (student switches apps). The timer must use media time, not `setInterval` counts, and point stamps must stay correct.
- **Phone width (390 px).** The scaffold, current point and timer must fit without scrolling during recording. The code strip on the marking screen wraps to two rows on narrow screens; marking is expected on a laptop.
- **Keys while typing.** Number keys and letters only act as codes when focus is not in a note or comment field.
- **Transcript without word times.** Tags snap to the segment, never fail.
- **Deleted audio.** No broken players anywhere: inbox, marking screen, student view or feedback link.
- **Two devices.** A student who submits on a laptop and checks on a phone has no device token there. The feedback link covers this.
- **Initials clash** (two students "JS"). The inbox shows submitted time and device symbol beside the initials, and Adam can edit the initials on a submission.

## Tests

- schema: old audio blocks parse as listen; viva without question fails; scaffold limits
- code library: unique codes, typed-entry resolution (T vs TS, Escape, unknown code)
- tag placement: offset + snap to word, segment fallback, clamp at 0 and at end
- filler suggestions from a fixture transcript
- summary grouping by criterion and by dot point
- retention tick: deletes only expired, idempotent, index updated, transcript kept
- public routes: unpublished lesson 404, wrong device reads nothing, size cap, rate limit
- point stamping with a paused or backgrounded tab (fake clock)

## Out of scope (later, if wanted)

- an AI first-pass draft of content tags (AR, E, T…). It would be cheap but changes the trust model, so it is left out until Adam asks
- live viva mode where Adam asks follow-up questions in real time (NP code is ready for it)
- grades or bands
- a written-work marking block that uses the same codes
- class-wide trends ("FW is the class's top code this week")

## Settled (21 Oct 2026)

- Students give **initials only** on submit.
- **No resubmitting.** Adam can delete a submission to let a student try again.
- **3-2-1 countdown** before recording starts.
- Reaction offset starts at 1.0 s and is adjustable on the marking screen.
