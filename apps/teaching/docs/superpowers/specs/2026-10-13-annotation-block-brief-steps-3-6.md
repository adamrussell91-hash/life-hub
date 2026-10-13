# Annotation block: build brief (steps 3 to 6)

**Date:** 2026-10-13
**App:** `apps/teaching`
**Status:** Build brief for Cursor. Slices 3a to 6b. Do not start until steps 1 and 2 (slices 1a to 2c of `2026-10-13-annotation-block-brief.md`) have merged.
**Builds on:** `apps/teaching/docs/superpowers/specs/2026-10-13-annotation-block-brief.md` (the "step 1 and 2 brief"). Its data contract, naming, anchor resolution, layer slider state, vendored `literary-elements.json` and the teacher-layer strip in **both** `src/blocks/visibility.ts` and `netlify/functions/_shared/teaching-student.mjs` all stand. This brief only adds to them. Every addition to that schema is listed under "Schema additions" and is optional/additive, so lessons saved at step 2 still parse.
**Concept doc (governs):** `docs/future-build-ideas/annotation-block.md`. Its "Critical review" verdict table and sections B, C and E win over any idea above it.

## What Adam gets

1. **Threads.** One note joins several places in the text, drawn as arcs in the margin. Tap a thread and everything else folds into "⋯ 4 lines" bars; step through it on the projector.
2. **Voice clips that pin themselves.** Adam records himself reading a poem (or a student's draft) and talking. The hub transcribes it, finds the quotes he read, cuts clips, and he checks the pins before students see anything. Students get margin play buttons, transcripts and "Play all".
3. **Anthology.** On the unit, a view of everything Adam tagged, by text, theme, technique and connection, each item linking back to its lesson.
4. **Notes to flashcards.** One tap turns an annotation into a card in the existing `flashcards` block.

**Governing principle (unchanged).** This is Adam's annotation tool, not a student activity block. Nothing collects student input. No accounts, no taps stored, no read tracking, no heatmap, no replies, no progress, no spaced-repetition state.

## Out of scope (do not build, do not stub)

Everything cut in the verdict table: commit-before-reveal, ballots, hint ladder, read tracking, student replies, paragraph builder, ghost words and drafts, scansion/rhyme/performance overlays, zoom levels, Ann's after-lesson loop. Also out: manual cross-lesson thread links, per-word highlight during Play all, in-browser audio trimming, student recording, marks or grades. P4 applies: no "coming soon", no disabled placeholder buttons, no phase wording in any user-visible string.

## Read first

- `CLAUDE.md`, `AGENTS.md`: run `npm run pre-pr-check` from the repo root; exit 0 before opening or updating a PR.
- `docs/CURSOR-UI-FAILURES.md`: run the check for every ID in "Failure modes" below before ticking anything.
- The step 1 and 2 brief, all of it. Reuse: `annotation-anchor.ts`, `annotation-layers.ts` (the state object `{ stop, toggled, openAnnotationId }`), `literary-elements.ts`, `walk-blocks.ts`, `sanitize-blocks.ts`, the single anchor-drawing function (V8), and the kit list builder `packages/design-kit/js/hub-list.js` (I13).
- Backend facts established for this brief (verified in the repo, 2026-10-13):
  - The Teaching backend is **Netlify Functions** in repo-root `netlify/functions/*.mjs`, data in **Netlify Blobs** (`_shared/teaching-blobs.mjs`; keys such as `mediaKey`, `mediaFileKey`, `aiJobKey`). `workers/` holds only `class-site/` (static class pages), not an API.
  - Media: `netlify/functions/media-upload.mjs` (operator-only, 10 MB cap, allow-list has `audio/mpeg` and `audio/wav` only, mirrored in `src/media/upload-rules.ts`) and `media-file.mjs` (`GET /api/media/:id/file`, **public**, `cache-control: public`). Ids come from `newId()`, which uses `Math.random`: fine for media, **not acceptable as a secret**.
  - Public student routes are an allow-list in `_shared/public-student-routes.mjs`. A new public route must be added there and nowhere else is reachable unauthenticated.
  - Cloudflare Workers AI (Whisper) is only reachable from a Worker with an `AI` binding. Netlify has none and no Cloudflare API token (grep finds no `CLOUDFLARE`/`api.cloudflare.com` use). The existing Worker with the binding is `apps/knowledge/worker` (`knowledge-hub-research`, `ai.binding = "AI"`). Netlify already calls it through `_shared/knowledge-kernel.mjs` (`knowledgeKernelFetch`, header `x-research-kernel-secret`, env `RESEARCH_KERNEL_SHARED_SECRET`, 26 s timeout as in `knowledge-capture.mjs`).
  - Whisper in the Knowledge hub: `apps/knowledge/src/capture/live.ts` calls `env.AI.run("@cf/openai/whisper-large-v3-turbo", { audio: <base64>, task: "transcribe", language: "en" })`, and `parseWhisperResult` in `extract.ts` reads **only** `text`. No type or code in the repo uses word or segment timings. **I could not reach the Cloudflare docs from the build sandbox, so timestamps are unverified from here.** The published schema for this model is understood to return `segments[]` (`start`, `end`, `text`) and optionally `words[]` (`word`, `start`, `end`), but slice 4a opens with a spike that settles it on a real recording, and the design below works whether the answer is words, segments only, or neither.
  - Async pattern already in the repo for slow model work: the AI job queue (`ai-jobs.mjs`, `ai-job.mjs`, `ai-jobs-tick-scheduled.mjs`, `aiJobKey`). Anthropic calls go through `_shared/anthropic-client.mjs`.
  - `FlashcardsBlockSchema` caps `cards` at 20 (min 1); `FlashcardItemSchema` is `{ id, front, back, image_url?, image_alt? }`. `CollectionBlockSchema` is `{ source: 'unit_lessons' | 'recent_lessons', title? }`; `resolveCollection` returns `{ lesson_id, title, href }` links only and is used from the class homepage editor (`teacher/sections/homepage-editor.ts`).

## Schema additions (the only changes to the step 1 and 2 contract)

```ts
// 1. Anchor gains an optional id (required when the annotation is a thread).
Anchor = { id?: string, ...existing, note_html?: string }   // note_html: the stop's own caption in thread step-through; sanitizeRichTextHtml

// 2. Threads: an annotation with extra anchors. The existing `anchor` stays the first stop.
Annotation += {
  also_anchors?: Anchor[],                  // max 24; every one has an id. Present and non-empty => this annotation is a thread
  thread?: { kind?: 'motif'|'opposition'|'volta'|'echo'|'argument',
             order: 'text' | 'custom',      // default 'text'
             anchor_order?: string[] },     // anchor ids, primary included; only read when order === 'custom'
  anthology?: AnthologyTag,                 // step 5
}
// A thread belongs to a layer exactly as any annotation does (layer_id, sublayer_id). No new layer kind for threads.

// 3. Voice is a layer kind. Exactly the existing Layer, one more value:
Layer.kind: 'family' | 'free' | 'lens' | 'teacher' | 'voice'

// 4. Block content.
AnnotationBlockContent += {
  voice_tracks?: VoiceTrack[],
  anthology?: { include: boolean; themes: string[]; concepts: string[] },   // whole text goes in the anthology
  settings: { ...existing, thread_context?: 0 | 1 }                          // default ±0 lines
}

AnthologyTag = { include: boolean, themes: string[], concepts: string[] }   // tags: trimmed, max 40 chars, max 8 each

VoiceTrack = {
  id: string,
  layer_id: string,                         // must point at a kind:'voice' layer; never a teacher layer (schema refine)
  kind: 'reading' | 'think_aloud' | 'feedback',
  title: string,
  audio: { media_id?: string; url: string; duration_s: number; mime: string },
  transcript: { words: Array<{ w: string; start: number; end: number }>, timing: 'word'|'segment'|'estimated' },
  taps?: Array<{ t: number; anchor: Anchor }>,   // optional tap-to-anchor while recording
  clips: VoiceClip[],
  status: 'draft' | 'published',
  extras?: Array<{ id: string; kind: 'where_to_next'|'technique_tag'|'class_note'; html: string; approved: boolean }>
}
VoiceClip = {
  id: string, start_s: number, end_s: number,
  word_range: [number, number],             // indexes into transcript.words
  anchor?: Anchor,                          // absent = general comment
  source: 'tap' | 'quote' | 'ai' | 'manual',
  confidence: number,                       // 0..1; tap and manual = 1
  approved: boolean,                        // false for source:'ai' until Adam approves it
  transcript_text: string,                  // what students read under the clip
}

// 5. Flashcards: optional back-reference. Teacher-only metadata.
FlashcardItem += { source?: { block_id: string; annotation_id: string; lesson_id?: string;
                              kind: 'quote_to_technique'|'find_it'|'line_recall';
                              source_hash: string } }
```

**Strip and sanitise obligations these additions create (add to the step 2c fixture, both twins):** `also_anchors[].note_html` and `anchor.note_html` through `sanitizeRichTextHtml`; `voice_tracks` removed unless `status === 'published'`; clips with `approved === false` removed; `extras` with `approved === false` removed; `transcript.words` removed from the student payload (students get `clips[].transcript_text` only); any `voice` layer with no remaining track removed; flashcard `source` removed from the student payload. The sentinel `SECRET-TEACHER-NOTE` must also be planted in a thread stop note, an unapproved clip and a flashcard source, and found in none of the student output.

## Dependencies on steps 1 and 2

| Needs | From | Used by |
|---|---|---|
| Anchor resolution, orphan handling | 1a `annotation-anchor.ts` | 3, 4, 5 |
| One drawing function for anchors | 1a (V8) | 3b arcs, 4e clip highlight, 5 theme view |
| State object outside the repaint | 2a | 3b adds `{ focusThreadId, fold, expandedFolds, stepIndex }`; 4e adds `{ playingClipId }` |
| Layers editor, `voice` kind | 2a | 4b |
| Technique ids and families | 2b | 5 fingerprints, 6 card backs |
| Teacher-layer strip, shared fixture, W2 integration test | 2c | every slice that adds student-visible data |

---

## Step 3. Threads and thread focus

### 3a. Thread schema, pure helpers, strip

**Must**
- Add the schema additions above. `superRefine`: every anchor of a thread has an id; ids unique within the annotation; `anchor_order` is a permutation of those ids when `order === 'custom'`; at most 24 extra anchors.
- New pure module `blocks/annotation-thread.ts` (no DOM): `threadsOf(block)`; `threadStops(annotation, block)` returns the resolved stops in text order or custom order, orphaned anchors reported separately (a thread with an orphaned stop still draws its good stops and lists the orphan in the editor under "Needs re-anchoring"); `lineNumbers(text)` (1-based across the whole text, derived, never stored); `foldRows(text, stopLineIds, { context: 0 | 1, expanded: Set<string> })` returning rows `{ kind: 'line', lineId, number } | { kind: 'fold', id, count, lineIds }` in text order; `arcLanes(spans)` assigning each arc a lane so none overlap.
- Mirror the strip/sanitise obligations in `visibility.ts`, `sanitize-blocks.ts` and `teaching-student.mjs`. A thread on a teacher layer is dropped whole by the existing layer strip.

**Must-not**
- No new anchor model; a thread is a normal annotation with `also_anchors`.
- No stored line numbers or fold state.

**Verify**
- `cd apps/teaching && npx vitest run tests/unit/annotation-thread.test.ts` plus `npm run test:unit` green. Cases: fold with 0 and ±1 context; two stops one line apart merge into no fold between them (no "⋯ 0 lines"); a stop in the first and last lines (no leading/trailing zero-length fold); stops across a stanza break keep the break visible; custom order differs from text order; orphaned stop excluded; 24-stop cap; lane assignment never overlaps.
- Strip test, TS and `.mjs`, shared fixture: thread note sentinel absent from student output at top level, in a section, columns and tabs.

**Files**: `src/schemas/block.ts`, `src/blocks/annotation-thread.ts`, `src/blocks/{visibility,sanitize-blocks}.ts`, `netlify/functions/_shared/teaching-student.mjs`, `tests/unit/{annotation-thread,visibility}.test.ts`, `tests/unit/teaching-student.test.js`, `fixtures/`.

### 3b. Arcs, thread focus, folding, step-through

**Must**
- **Threads strip** under the layer chips: one chip per visible thread (layer colour, short title, stop count). One horizontally scrolling row, inside its own `overflow-x:auto` (R2). A thread whose layer is not revealed does not appear (same visibility rule as its annotations).
- **Arcs** in the margin, drawn by the one layout function from `arcLanes`: a small circle at each stop joined by a curve, in the layer colour, with the stop number. Desktop only. At 390 there is no room for arcs: each stop shows a numbered pip in the margin instead, and the thread is chosen from a bottom sheet. Both forms show the same stops from the same model (R1).
- **Thread focus** (selecting a thread chip or any of its anchors, then "Focus"): non-thread lines fold into one thin bar per run, "⋯ N lines", with line numbers kept and anchored words still highlighted. Tap a bar to expand that run; tap again to fold. A visible "Show whole text" control exits. State: `{ focusThreadId, context, expandedFolds, stepIndex }` lives in the 2a state object, outside the repaint (V7), and the strip, arcs, bars and slider derive from it (V2).
- **Options**, as a small "Thread" menu beside the focus control: `±1 line of context` (toggle, default from `settings.thread_context`); `Step through`; `Thread order` is chosen in the editor (3c) and respected here.
- **Step through (projector):** shows one stop at a time with its `note_html` (or the annotation body on the first stop), "Stop 2 of 5", Previous/Next buttons. Keyboard: Left/Right step the stops, Esc exits focus. While thread focus is active these arrows step the thread, not the layer slider; with the slider itself focused its own arrow keys still apply. One key handler, one mode flag, tested.
- Student and teacher views are identical. **Print:** no arcs and no folding; each thread prints as a numbered footnote "Thread: lines 3, 9, 14" with the body.
- A fold's expand control is a `<button>` with `aria-expanded` and the label "Show 4 hidden lines" (I2).

**Must-not**
- No student state stored, including expanded folds in `localStorage`. Focus resets on load.
- No second renderer for folded text (V8): folding feeds rows to the same line-drawing function; step 5 reuses it.
- No looping or pulsing highlight (M1). One short fade on focus, off under `prefers-reduced-motion`.
- Arcs must not cover text or change the text column width when a thread is selected (L1).

**Verify**
- Unit: `foldRows` already covered; add key-handler mode tests (arrows with and without thread focus, slider focused).
- Browser (`tests/browser/annotation-threads.spec.ts`): focus a 5-stop thread on the poem fixture; bars show the right counts; line numbers unchanged; expand one bar then change layer stop then collapse focus, expanded state survives the stop change (V7); resize 1440 to 390 to 1440 with focus on, same thread, same folds (R1).
- Manual at 1440: arcs do not overlap each other or text; with the longest fixture line `scrollWidth === innerWidth`. At 390: pips visible, thread sheet clears the tab bar (R6), step-through Previous/Next at least 44 px.
- Projector run: keyboard only, from a closed block to the end of a thread and out again.

**Files**: `src/blocks/{render,annotation-layers}.ts`, new `annotation-thread-view.ts` if `render.ts` gets heavy, styles, `tests/unit/annotation-thread-keys.test.ts`, `tests/browser/annotation-threads.spec.ts`.

### 3c. Thread editor

**Must**
- On any annotation: "Add another place". Adam then selects text (word, phrase, line, stanza as in 1b) and each selection becomes a stop. Stops are a **kit list builder** (add, reorder, ··· menu, press-and-hold delete with Undo, I13); reordering sets `order: 'custom'` and `anchor_order`; a "Back to text order" menu item clears it. Each stop has an optional note field (the stop caption).
- Choose thread `kind` with the kit pills (closed choice of 5, I5), which only sets the arc style label and the default chip title.
- The thread editor opens beside the text, in view, at body text size (I11).
- Removing the last extra stop turns the thread back into a plain annotation (no confirmation needed; Undo exists).
- Orphaned stops appear under "Needs re-anchoring".

**Must-not**
- No hand-rolled ↑ ↓ / Remove; no `window.prompt`/`confirm` (I10). Escape in the stop note does not close the panel (I8). A repaint after save keeps selection, panel scroll and page scroll (V7, I12).

**Verify**
- Unit: add three stops, reorder from the menu, delete by `hold()` then Undo; custom order persists and `anchor_order` stays a permutation after a delete.
- Browser: build a 4-stop thread on a real poem, reload, focus it, step through, stop notes show.
- `grep -rn "window.prompt\|window.confirm\|alert(" src/blocks` over changed files returns nothing.

**Files**: editor file(s) from 1b, styles, tests.

---

## Step 4. Voice clips that pin themselves

**Architecture decision (where it runs).**
- **Recording:** in the browser (`MediaRecorder`).
- **Transcription:** Whisper on **Cloudflare Workers AI**, in the existing `knowledge-hub-research` Worker, as one new route `POST /transcribe` behind the existing shared secret. Netlify cannot call the `AI` binding and has no Cloudflare token, and the Worker is already reached by `knowledgeKernelFetch`. A Netlify function (`annotation-voice-transcribe.mjs`, operator-only) accepts the audio, stores it, enqueues an AI job, and the job tick calls the Worker. Transcription is **asynchronous** because sync calls time out at 26 s. If Adam would rather not touch the Knowledge Worker, the alternative is a new `workers/teaching-voice/` Worker with its own `AI` binding; that is one Open question, not a blocker.
- **Quote matching and clip cutting:** pure TypeScript in `apps/teaching/src/blocks/`, run **in Adam's browser** on the review screen. No server twin, so nothing can drift, and every edit Adam makes re-matches instantly.
- **AI pass for paraphrased references:** a Netlify AI job through `_shared/anthropic-client.mjs`, operator-only, only for clips the matcher could not pin.
- Audio storage: Netlify Blobs. Poem readings and think-alouds use the existing public media route (allow-list extended). **Feedback audio never uses it** (see 4f).

### 4a. Spike and transcription service (gate: do this first)

**Must**
- **Spike, recorded in the PR body:** record a 2 minute clip in Chrome desktop (webm/opus) and one on iPhone Safari (mp4/AAC), send each through `env.AI.run("@cf/openai/whisper-large-v3-turbo", …)` from the Worker, and paste the response *shape* (keys only, no student text). Answer: are there `words[]` with times, `segments[]` with times, or neither? Does Whisper accept both containers? What is the largest body Netlify accepts on this route (media-upload advertises 10 MB; synchronous Netlify function payloads are limited to roughly 6 MB, so confirm)? Set the recording cap (suggested 10 minutes and 8 MB) from the answer. Commit the redacted response as `fixtures/whisper-timings-sample.json`.
- `parseWhisperTimings(raw)` in `src/blocks/voice-transcript.ts`, pure, returning `{ words, timing: 'word'|'segment'|'estimated' }`. If only segments exist, `distributeWordTimes(segment)` spreads words across the segment in proportion to character length and marks `timing: 'segment'`. If neither, one segment for the whole file and `'estimated'`; the review screen then says plainly that pins are approximate.
- Worker route `POST /transcribe` (secret-checked, audio in the body, same base64 call as `live.ts`, returns the raw model JSON). Netlify function enqueues and a job tick (`ai-jobs-tick-scheduled.mjs` pattern) writes the result to the job record. `GET` the job to poll.

**Must-not**
- No change to Knowledge behaviour or to `parseWhisperResult`. No retry loop that re-bills a failed 10 minute file more than twice. No transcript text in logs.
- No sync call that waits for Whisper (I9).

**Verify**
- Worker: `cd apps/knowledge && npm test` green with a new route test using a mocked `AI.run`.
- `npx vitest run tests/unit/voice-transcript.test.ts`: fixture with words, fixture with segments only, empty result, non-English garbage, missing `end`.
- W2: one test goes through the real Netlify handler with a mocked kernel fetch to a completed job record.
- Manual: a real 2 minute recording comes back with times on a 390px phone and on desktop.

**Files**: `apps/knowledge/worker/src/index.ts` (+ test), `netlify/functions/annotation-voice-transcribe.mjs`, `_shared/knowledge-kernel.mjs` (only if a new timeout helper is needed), `src/blocks/voice-transcript.ts`, `fixtures/`, tests.

### 4b. Record in the block, store, tap to anchor

**Must**
- Add `voice` layer kind and `voice_tracks`. Teacher editor: "Record" on a `voice` layer opens a recorder bar beside the text (in view, I11): Record, Pause, Stop, elapsed time, and a level indicator that is still when silent. Choice of kind (reading / think-aloud) with kit pills; title via `askTextCard`.
- **Tap to anchor (optional):** while recording, tapping a line, stanza or paragraph (existing anchor gestures) pushes `{ t, anchor }` onto `taps`. A small "pinned" toast with Undo. Tapping is never required.
- Upload through a new operator-only `annotation-voice-upload.mjs` (or the existing media-upload with `audio/webm`, `audio/mp4` and `audio/ogg` added **in both** `upload-rules.ts` and `media-upload.mjs`; the two lists must match, and a test asserts they do). Save the record immediately; transcription starts in the background (I9), status shown as a plain line ("Transcribing, about a minute"), never a spinner that blocks editing.
- Permission denied, no microphone and unsupported browser each show a plain message with what to do (I3).

**Must-not**
- No recording starts without an explicit tap. No student recording. No upload progress that blocks the editor.
- No raw audio bytes in the lesson JSON; only the media reference.

**Verify**
- Unit: tap list ordering, `taps` outside `[0, duration]` rejected; allow-list parity test.
- Browser with a fake media stream (`--use-fake-device-for-media-stream`): record 5 seconds, stop, reload, the track exists with a pending transcript; deny permission shows the message.
- Manual at 1440 and 390 on a real phone: recorder bar fully tappable above the tab bar (R6), controls 44 px, text fields 16 px (R4).

**Files**: `src/schemas/block.ts`, `src/blocks/{voice-recorder,editors}.ts`, `src/media/upload-rules.ts`, `netlify/functions/{media-upload,annotation-voice-upload}.mjs`, styles, tests.

### 4c. Matcher, segmenter, AI pass for the leftovers

**Must**
- `src/blocks/voice-match.ts`, **pure and unit-tested, no DOM, no network**:
  - `normaliseToken(s)`: lowercase, strip punctuation and curly quotes, fold hyphens/dashes, collapse repeats.
  - `matchQuotes({ text, words, taps }) -> { pins, unmatched }`. Local alignment (banded edit distance over tokens, seeded by 3-token matches) so a quote Adam reads can contain misheard words, dropped words and the student's misspellings. Per-token similarity = normalised edit distance, with a cheap phonetic key as a tie-breaker; a stretch needs at least 4 matched tokens (3 on a short verse line) and a score above a named constant. `confidence = matchedTokens / quoteTokens × meanSimilarity`.
  - **Duplicate quotes:** keep a cursor at the end of the previous pin; among candidates for a stretch choose the **first at or after the cursor**. If none exists after the cursor, take the best anywhere, set `confidence × 0.6` and flag `repeat_fallback` so the review screen asks. Adam reads top to bottom; this is the rule.
  - **Taps win:** a clip containing a tap anchors to the tap (`source: 'tap'`, confidence 1). If the quote match inside it points elsewhere, keep the tap and flag `tap_quote_disagree`.
  - Pins carry the matched `Anchor` (word/phrase/line; built with `buildAnchor`), never a guess at a different place (D1). Below a `LOW_CONFIDENCE` constant a pin is returned in `unmatched` instead.
- `segmentClips({ pins, words, duration }) -> VoiceClip[]`: a clip runs from one quote to the start of the next; the intro before the first quote and any tail are general comments (no anchor); two stretches in the same line separated by under 1.5 s merge; boundaries snap to word edges with 150 ms lead-in; clips never overlap and cover `[0, duration]` exactly once.
- Reading tracks (`kind: 'reading'`) use the same matcher with a high-coverage expectation and produce one clip per line.
- `draftUnmatched` (Netlify AI job): input is each unmatched clip's transcript plus a numbered outline of the **paragraphs/stanzas** (first 12 words of each); output `{ clip_id, paragraph_index | null, confidence }`. Results become `source: 'ai'`, **`approved: false`**, anchored at paragraph/stanza granularity only, never to words. The prompt asks for general reference resolution ("your second paragraph", "the bit about the storm"); no wording from any test fixture (P6). The job result is applied only to clips still unpinned and unedited at apply time (W6).
- Extras (`where_to_next`, `technique_tag`, `class_note`) are drafted in the same job as `approved: false`.

**Must-not**
- No AI call for anything the rules matched. No AI-pinned clip is ever shown to a student before Adam approves it. No AI output stored as `approved: true`.
- No threshold tuned on the evaluation fixtures (P6).

**Verify**
- `npx vitest run tests/unit/voice-match.test.ts`, with fixtures built from a **public-domain** poem and a hand-written student paragraph with spelling errors: exact quote; one misheard word; two dropped words; misspelt student word; the same line quoted twice (second pin lands after the first); quote that exists once but Adam reads it out of order (repeat_fallback); paraphrase only (goes to `unmatched`); tap overrides quote; empty transcript; transcript with no quotes; 10 minute fixture runs under 200 ms.
- `segmentClips`: coverage invariants (no gap, no overlap, ordered) hold for random pin sets (property-style test).
- Held-out check (P6): tune constants on fixture set A, report the score on a separate set B in the PR, both numbers.
- AI job: unit test with a mocked client; an already-edited clip is not overwritten.

**Files**: `src/blocks/{voice-match,voice-segment}.ts`, `netlify/functions/annotation-voice-draft.mjs`, `_shared/anthropic-client.mjs` (use, not edit), tests, fixtures.

### 4d. Teacher review screen

**Must**
- A review screen for a track: the text on one side with pins drawn by the **same** anchor drawing function (V8), the clip list on the other (kit list builder: reorder is not meaningful, so use split/merge/delete from the ··· menu; press-and-hold delete with Undo, I13). Each clip shows its transcript, a play button for just that range, a confidence chip (plain words: "Matched", "Check this", "Tap pin", "AI guess") and, for a repeat or tap disagreement, the reason.
- **Fix pins:** drag a pin to another line or select new text to re-pin (also by keyboard: choose the clip, then Select text); Split at the playhead; Merge with next; Set as general comment.
- Clips are sorted worst-confidence first with a "Next to check" action.
- **Publish** is available when no clip is `approved: false`. Each AI-drafted clip and each extra has Approve / Edit / Discard. Nothing AI-made can be published without one of those. Publishing sets `status: 'published'` and runs the strip tests.
- Tell Adam, in words, before publishing: "Students can play the whole recording file, including parts not pinned." (See Open question 4.)
- Changes autosave; edits survive repaint (V7); window scroll unchanged after saves (I12).
- On phone this screen is a bottom sheet pair (text, then clips) with docked 44 px Publish/Cancel (R4).

**Must-not**
- No bulk "Approve all". No auto-publish. No silent pin guess drawn as certain (D1). Review state never reaches the student payload.

**Verify**
- Unit: split, merge and re-pin keep the coverage invariants from 4c; Publish refuses while one `approved:false` clip exists.
- Browser: record fixture, run matcher on a canned transcript, fix one pin by selecting text, approve one AI clip, publish, reload; clips persist.
- Manual at 1440 and 390: every control reachable by keyboard; Esc in the clip transcript field does not close the screen (I8).

**Files**: `src/blocks/voice-review.ts`, editor wiring, styles, tests.

### 4e. Student view and strip

**Must**
- Published `voice` layer shows on the slider like any layer. In the margin beside each pinned span, a play `<button>` (aria-label "Play comment on line 12"); under the span, its `transcript_text` in a collapsed disclosure (also the accessible and skimmable form). General-comment clips appear in a "General comments" list at the bottom of the block.
- **Play all:** plays clips in order (gaps are skipped, only published clip ranges play) and highlights the current clip's span, scrolling it into view only when it is off-screen. One shared `<audio>` element. Pause/resume, previous/next clip, a visible progress bar. Active clip comes from a pure `activeClipAt(clips, t)` (binary search). The progress loop is a rAF loop that **runs only while playing** and clamps elapsed to 0 or more (C7).
- Prefer the element behind `createHubAudioPlayer` if the kit exposes it; if it does not, add a small accessor in the kit rather than forking the player (S1).
- **Strip (both twins):** as in "Strip and sanitise obligations". `status: 'draft'` tracks, unapproved clips/extras and word-level transcripts never reach the student JSON.
- Print: published clips print as numbered footnotes with their transcripts; no audio.

**Must-not**
- No per-student state (position, plays, completion). No autoplay. No highlight loop while paused (M1). No `localStorage`.
- Teacher-only drafts and review data must not appear in `published-lesson.mjs` output.

**Verify**
- Unit: `activeClipAt` boundaries; strip shared-fixture test in TS and `.mjs`; JSON of the student output contains no `"approved":false`, no `transcript.words`, no sentinel.
- W2 integration: publish via `lesson-publish.mjs`, fetch via `published-lesson.mjs`, assert the above. Name the test in the PR ledger.
- Browser: Play all across three clips highlights each span in turn; pause stops the loop (`requestAnimationFrame` count flat after 2 s); play button works by keyboard.
- Manual at 1440 and 390 on iPhone Safari: audio starts from a tap, margin button at least 44 px, transcript sheet above the tab bar.

**Files**: `src/blocks/{render,voice-playback}.ts`, kit accessor if needed, `visibility.ts`, `teaching-student.mjs`, styles, tests.

### 4f. Private feedback on a student draft

**Why this is separate.** A student draft is private work. Lesson snapshots and `/api/media/:id/file` are public, so a draft placed in a lesson block would be published to anyone with the link. Feedback therefore lives **outside lessons**, in its own record, reached only by an unguessable link.

**Must**
- A `feedback_doc` record `{ id, token_hash, title, label?, content: AnnotationBlockContent, audio_blob_key, created_at, expires_at? }` stored under its own Blobs prefix. Teacher UI: Teaching › Feedback › New: paste the draft (prose), then the same record/transcribe/match/review flow (4b to 4d) in the same editor. It is the annotation editor on a different parent, not a second tool.
- **Delivery:** Adam presses "Create private link". The server mints `token = base64url(crypto.randomBytes(32))` (never `newId`, which uses `Math.random`), stores only a hash, and shows the link once with Copy. Adam sends it himself (email, LMS). The hub sends nothing.
- Public routes added to `public-student-routes.mjs`: `GET /api/published/feedback/[^/]+` and `GET /api/published/feedback/[^/]+/audio`. Both return identical `404` for an unknown, revoked or expired token (same body, constant-time hash compare), send `cache-control: private, no-store`, `x-robots-tag: noindex, nofollow` and `referrer-policy: no-referrer`. The page at `/s/feedback/<token>` carries `<meta name="robots" content="noindex">`.
- Feedback audio is served only by the token route, never by `/api/media/:id/file`.
- Revoke link (press-and-hold, Undo within the session) and an optional expiry (kit pills: none / 30 / 90 days). Not listed in any lesson, unit, class, search index, print or sitemap; a test greps the published snapshot builders for the prefix.
- The student view is the 4e view of the same published payload: margin play buttons, transcript, Play all. Nothing is collected and there is no reply box.

**Must-not**
- No read tracking, no "opened" flag, no access log of the token beyond the platform default. No student reply. No student name beyond the optional `label` (initials or a nickname; never required).
- Teacher-only by default: a feedback doc has no link until Adam creates one.
- No listing endpoint for feedback. No token in logs, error messages or analytics.

**Verify**
- Unit/integration: wrong, truncated, expired and revoked tokens all return identical 404 bodies; the correct token returns only published clips; token entropy at least 256 bits; stored record contains the hash, not the token.
- Search: `grep -rn "feedback" netlify/functions/lesson-publish.mjs netlify/functions/published-*.mjs` shows no read of the feedback prefix (W2: name the test).
- Manual: open the link in a private window at 1440 and 390; view-source contains no teacher notes; `curl -I` shows the headers; the link is absent from every other page.

**Files**: `netlify/functions/{annotation-feedback,published-feedback}.mjs`, `_shared/{teaching-blobs,public-student-routes}.mjs`, `src/teacher/` feedback section, `src/student/` route, tests.

---

## Step 5. Anthology

**Decision: a new `anthology` block, not a new `source` on `collection`.**
- `collection` returns `{ lesson_id, title, href }` links only, from lesson metadata, with a one-value enum `source`. An anthology needs annotation payloads (quote, technique, tags, layer) pulled from other lessons' published snapshots, four views with their own state, fingerprints and folding. Adding `unit_annotations` to the enum would give one block two unrelated return types and a renderer full of source branches, and would make `resolveCollection`'s pure link contract lie.
- The new block still **reuses** `collection-resolve.ts`: `lessonCollectionHref`, the `currentUnitId`/`unitLessons` context, and its placement on class homepages and units (`homepage-editor.ts`). The concept doc's `unit_annotations` source is superseded by this decision (note it in the History line).

```ts
AnthologyBlockContent = { title?: string, default_view: 'text'|'theme'|'technique'|'connections' }
// block_type: 'anthology'; add to BlockTypeSchema, leafBlockSchemas, registry, render, create-block, block-meta, search-text.
```

### 5a. Tags and the data feed

**Must**
- `AnthologyTag` on annotations and `anthology` on the block (schema additions). Editor: a "Add to unit anthology" toggle on every annotation and on the block, with theme and concept tag chips (free text with type-ahead over tags already used in this unit; kit list builder, I13) and, for techniques, the existing technique tag from 2b (no second technique vocabulary). A bulk "Include all my notes" menu item sets each annotation's flag explicitly (a visible action, not a hidden rule).
- Pure `normaliseTag` (trim, collapse spaces, case-insensitive match, first spelling wins) and `collectAnthology(snapshots, ctx)` returning items `{ lesson_id, lesson_title, block_id, annotation_id, quote, line_number, layer_name, technique_id?, themes, concepts }` plus `texts` `{ lesson_id, block_id, title, attribution, fingerprint }`. `fingerprint` = count per family from non-teacher technique-tagged annotations.
- **One source of truth for student data:** the unit payload (`published-unit.mjs`) builds `anthology` from the **already-stripped published lesson snapshots**, using a shared `_shared/teaching-anthology.mjs`. The teacher preview builds from drafts by running `filterBlocksForStudent` (TS) first, then a TS twin `blocks/anthology-collect.ts`; a shared fixture drives both (same discipline as 2c). Only **published** lessons contribute.
- Defence in depth: the collector skips any annotation whose layer is `teacher`, missing, or `voice` with an unpublished track.

**Must-not**
- **Teacher-layer annotations never appear in the student anthology.** No client-side hiding; the data is not in the payload.
- No text of an included poem unless the block-level toggle is on (copyright Open question). No student data of any kind.

**Verify**
- Unit TS and JS, one shared fixture: sentinel in a teacher-layer annotation that is also tagged `include: true`; `JSON.stringify(collectAnthology(...))` and the unit payload contain no sentinel, no teacher layer id. Tags normalise ("Memory", " memory ") to one. Unpublished lesson contributes nothing. Fingerprint counts match a hand count.
- W2 integration: publish two lessons through `lesson-publish.mjs`, fetch `published-unit.mjs`, assert items and the absence of the sentinel. Name it in the ledger.
- Grep: `grep -rn "fetch('/" ` over changed files returns nothing (W1).

**Files**: `src/schemas/block.ts`, `src/blocks/{anthology-collect,collection-resolve}.ts`, `netlify/functions/_shared/teaching-anthology.mjs`, `netlify/functions/published-unit.mjs`, editor files, tests, fixtures.

### 5b. The Anthology view

**Must**
- Four views switched by kit pills (`aria-pressed`; one control, one place, V3): **By text** (a card per text: title, attribution, technique fingerprint as a family-coloured strip *plus the same numbers in words*, "Comparative 6, Structural 4", C8; link to the lesson); **By theme** (pick a theme; for each text with items, the text's lines folded to the tagged lines using step 3's `foldRows`, line numbers kept, bars expandable only when the whole text is included, otherwise shown as static "⋯ 4 lines" rows that are not buttons, so there is no dead control); **By technique** (family › technique, each with its quotes and source texts; definitions from the vendored snapshot, lazily imported, W4); **Connections** (any theme, concept or technique used in two or more texts, listing the texts and the quote from each).
- **Every item links back to its lesson** at `lessonCollectionHref(lesson_id) + '#note=' + annotation_id`. The lesson page handles `#note=`: it sets the slider to the annotation's layer, opens the annotation and scrolls it into view (using `history.replaceState`, never `location.hash =`, V3).
- Empty states say what to do ("Tick Add to unit anthology on a note in any lesson of this unit", I3).
- Teacher mode shows the same view from drafts; items from unpublished lessons carry a "Not published" tag so Adam can see why a student view differs.
- Print: By text only, one line per text with its fingerprint words.

**Must-not**
- No student input, no saved selection. No second renderer for folded text (V8). No fabricated "connections" beyond shared tags and techniques (manual cross-text links are out of scope).

**Verify**
- Unit: grouping, ordering key per view (state it in the PR: texts by unit lesson order, items by line number, techniques by family then name), connections need ≥ 2 texts, fold rows for a theme across two texts.
- Browser: seed a 2-poem unit; every view renders; item link opens the right lesson with the annotation open and the correct layer shown; resize 1440 to 390 to 1440 keeps view and theme (R1, V7).
- Manual at 390: fingerprints and chips never wrap mid-label (L6); view pills do not exceed 2 rows (L5); `scrollWidth === innerWidth`.

**Files**: `src/blocks/{render,registry,create-block,block-meta,anthology-view}.ts`, `src/student/` lesson hash handling, styles, tests.

---

## Step 6. Notes to flashcards

### 6a. Make a card from a note

**Must**
- On an annotation, a **Make card** menu (··· menu, kit) with three kinds, composed **deterministically, no AI**:
  - `quote_to_technique`: front = the quote with its line number; back = technique name and effect from the vendored snapshot, plus Adam's note as plain text. Needs a technique tag; without one the item is absent from the menu (not disabled, P4).
  - `find_it`: front = "Where is the {technique} in "{title}"?"; back = the quote with line number. This is a flip card; tap-the-word is not built.
  - `line_recall`: front = the quote with first-letter fading from pure `fadeText(text, level)` (level 1: first letter of each word then underscores; level 2: first word and last word only); level chosen when the card is made; back = the full quote.
- Target picker (`askSelectCard`): an existing `flashcards` block in this lesson (listed via `walk-blocks.ts`, live blocks only) or "New flashcards block". The block cap is 20 cards; a full block is shown as "Full (20)" and a new block is offered, never silently dropped.
- **Linked to its source:** each card gets `source: { block_id, annotation_id, lesson_id, kind, source_hash }` where `source_hash` hashes the quote, technique id and note used. The flashcards editor shows a small "From a note" link that selects the annotation. If the annotation changed, the card shows "Note changed. Refresh card"; refresh is explicit and rewrites only that card. If the annotation was deleted, "Note removed"; the card keeps working.
- Teacher-layer annotations never offer Make card (the menu item is not rendered). Student output strips `source` (see "Strip" above); sentinel test included.
- Cards are plain text, rendered by the existing flashcards renderer.

**Spacing decision: omitted.** Students would need stored progress to be scheduled, and the governing principle forbids storing any. Local-only spacing in `localStorage` is rejected too: it is invisible per-device student state that Adam cannot see and that vanishes in a private window. "Spaced across the term" is delivered the teacher's way instead: Adam places the generated block in later lessons or on the unit page (6b).

**Must-not**
- No progress, scores, streaks or "seen" state. No schema change to existing cards (the `source` field is optional). No raising the 20-card cap.

**Verify**
- Unit: `fadeText` levels on a line with punctuation and a hyphenated word; each kind from a real technique name (Enjambment and one per family, D4: the "Mapping tables" entry); full block offers a new one; source hash changes when the quote is edited; delete source leaves the card intact.
- Strip test (TS and `.mjs`): flashcard `source` absent from student output, sentinel absent.
- Browser: make three cards from three notes into one new block, reload, edit a note, "Note changed" appears, Refresh updates only that card.
- Manual at 1440 and 390: menu opens above the next block (S5); card text and buttons use kit sizes (T1).

**Files**: `src/schemas/block.ts`, `src/blocks/{flashcard-from-annotation,editors,render}.ts`, `visibility.ts`, `teaching-student.mjs`, tests.

### 6b. Revision deck from the anthology (small, optional)

**Must**
- In **teacher** view of the Anthology, "Make cards from this view" for the current theme or technique: composes `quote_to_technique` cards for the items shown into a new `flashcards` block in a lesson Adam chooses (`askSelectCard`), in chunks of 20, telling him how many blocks were made. Each card's `source` points at its lesson and annotation.

**Must-not**: not shown to students; never includes teacher-layer items (reads the stripped collector output).

**Verify**: unit, 45 items make blocks of 20, 20, 5 and no sentinel; browser, make a deck from "memory" and open the lesson.

**Files**: `src/blocks/anthology-view.ts`, `flashcard-from-annotation.ts`, tests.

---

## Recommended build order

1. **4a first, in parallel with everything.** It is a short spike that decides how much of step 4 is exact versus estimated. Also start **4c** (pure matcher) any time; it has no UI dependency.
2. **3a, 3b, 3c.** Smallest step; produces `foldRows`, which step 5 reuses.
3. **4b, 4d (needs 4c), 4e, 4f.** Adam's headline feature. Ship 4e before 4f: poem think-alouds are public-safe, student-draft feedback needs the private route.
4. **6a.** Small and high value once techniques are tagged.
5. **5a, 5b, then 6b.** Needs published lessons with tags to be worth looking at.

One PR per slice, each ticking only when its Verify list passes (P1, P5).

## Failure modes (from `docs/CURSOR-UI-FAILURES.md`)

Run each check before ticking a UI item. The step 1 and 2 checks for L1, L2, L5, L6, R1 to R3, S3, V1, V2, V7, V8, I2, I8, I10 to I13, W1, W2, P1, P4 and P5 still apply to anything these slices touch. New, feature-specific checks:

| ID | Slice | Check for this feature |
|---|---|---|
| **L1** | 3b, 4d | At 1440 the block's right edge matches siblings ±1px with arcs, review panel and clip list open; tracks are `minmax(0, Nfr)`; the poem column does not narrow when a thread is selected. |
| **L2** | 4d, 5b | Clip row at most 56 px collapsed; anthology item row at most 64 px; fingerprint card at most 120 px. Measure and state in the PR. |
| **L5** | 3b, 4d, 5b | At 390 the threads strip, review controls and anthology view pills occupy at most 2 rows. |
| **L6** | 3b, 4d, 5b | Thread chips, confidence chips, theme chips and fingerprint labels: `getClientRects().length === 1` at 390 and 1440; long names truncate with ellipsis and `title`. |
| **L11** | 3b, 4e | Arc end circles, margin pips and play buttons are children of the element CSS positions them against; screenshot one at the end of a wrapped line. |
| **C1** | 3b | A `getBBox` test: no stop-number label overlaps another or leaves the SVG, with 24 stops on the longest fixture. |
| **C7** | 4e | rAF loop clamps `elapsed` to 0 or more; three cold loads and a seek to 0 raise no `pageerror`. |
| **S1** | 4e, 5b | The kit audio element and list builder are reused, not forked; grep their CSS for ID-scoped selectors; screenshot next to the original home. |
| **S3** | 3b, 4d, 5b | The thread sheet, review sheet and technique/theme pickers show no poem text through them. |
| **S5** | 3b, 6a | The Thread menu and Make card menu paint above the next block; `elementFromPoint` on each item returns the item. |
| **V1** | 3b, 4d | Every toggled element with a `display:` rule has `.x[hidden]{display:none}`; folded lines have `offsetHeight === 0`. |
| **V2** | 3b, 4e | Slider, chips, thread strip, folds and the playing clip agree after changes by keyboard, by pointer and by chip; one key-handler mode flag. |
| **V3** | 5b, 3b | One view switcher in the Anthology; the `#note=` handler uses `replaceState`, so a lesson with a hash paints once. |
| **V7** | 3b, 4d, 5b | Focus, expanded folds, selected clip, anthology view and theme survive a save-triggered repaint and a resize. |
| **V8** | 3b, 4d, 4e, 5b | `grep` shows one place that draws anchors and one that draws line rows; arcs, pins, clip highlights and theme folds all go through them. |
| **R1** | 3b, 4e, 5b | Arcs to pips, margin play button to sheet: resize 390 to 1440 to 390 without reload, state kept. |
| **R2** | 3b, 5b | `scrollWidth === innerWidth` at 390 with 8 threads and the longest fixture line. |
| **R3** | all UI | A 390 screenshot of: threads strip, thread sheet, step-through, recorder bar, review sheet, clip sheet, anthology (each view), Make card menu. |
| **R4** | 4b, 4d, 4f, 6a | Hard gate. Every input at least 16 px below 720px; recorder, review and link sheets have docked 44 px actions inside the safe area. |
| **R5** | 3b, 4d | At 390 every thread, every clip and every view is reachable; nothing hidden without a phone form. |
| **R6** | 3b, 4b, 4e | Thread sheet, recorder bar and clip sheet sit above the tab bar: `rect.bottom <= tabBar.top`. |
| **D1** | 4c, 4d | A fixture per precision level: exact, fuzzy, repeat fallback, paraphrase, no match. Each renders its own label; a guess is never drawn as certain; below the threshold the clip is general. |
| **D3** | all | Acceptance screenshots use a real lesson and real recording Adam names; fixtures are public-domain poems and a hand-written draft. |
| **D4** | 5a, 6a | One test per Periodic Table family with real technique names from the snapshot (the "Mapping tables" entry; the register has two D4s). |
| **T1** | all UI | Kit size tokens only; the `font-size[^}]*font:inherit` grep over changed CSS returns nothing. |
| **I3** | 4b, 5b | Empty, denied-microphone, still-transcribing, failed-transcription, no-tags and no-published-lessons states each say what to do; no dead buttons. |
| **I9** | 4a, 4b, 4c | A unit test whose Worker call never resolves: the upload save and the "Saved" state still resolve. |
| **I13** | 3c, 4d, 5a | Stops, clips and tags each: add, menu actions, press-and-hold delete, Undo, covered by a `hold()` test. |
| **W2** | 3a, 4e, 4f, 5a | Real-path integration tests named in the ledger: strip via `lesson-publish.mjs` + `published-lesson.mjs`; unit payload via `published-unit.mjs`; feedback via the real token handler. |
| **W4** | 5b, 4d | Technique JSON and the review screen are separate chunks; entry `index-*.js` stays under 300 kB. |
| **W5** | 4a, 4f | Read-modify-write on job, track and feedback records uses `{ consistency: 'strong' }`; a lagging-store test covers create doc, mint link, save track. |
| **W6** | 4c, 4d | A test writes Adam's re-pin between the AI job starting and applying; the AI result does not overwrite it. |
| **M1** | 3b, 4e | After 3 s idle with audio paused, nothing moves; reduced motion skips fades. |
| **P6** | 4c | The prompt diff is listed beside the gold fixtures with no shared phrases; scores are reported on a held-out set. |

New failures found in review become entries in the register in the same PR.

## Acceptance (end of step 6)

On a lesson Adam names: a poem with a 5-stop motif thread, focus and step-through working on a laptop and a projector; a 3 minute think-aloud pinned to the poem with at least one pin fixed by hand and one AI-drafted clip approved; Play all on a phone. A real student draft with voice feedback delivered through a private link that opens in a private window and appears nowhere else. On the unit, an Anthology with two or more texts in all four views, every item opening its lesson. Three flashcards made from notes, with "Note changed" showing after an edit. A student URL's source and network responses contain no teacher note, no unapproved clip, no word-level transcript and no flashcard source.

## Open questions (for Adam, not blockers for 3a or 4a)

1. **Worker home.** Add `POST /transcribe` to the Knowledge Worker (smallest change, couples two hubs) or give Teaching its own `workers/teaching-voice/` Worker?
2. **School policy.** Student drafts and your voice go to Cloudflare Workers AI for transcription and, for unmatched references, the draft's paragraphs go to an Anthropic model. Is that allowed under the school's policy? If not, matching still works from a transcript Adam pastes, and the AI pass can be dropped.
3. **Feedback label and expiry.** Initials or nickname only, and default expiry none, 30 or 90 days? Should a link be reissuable without changing the audio?
4. **Whole recording is fetchable.** Students can open the audio file for a published track, including any talk that isn't pinned. Accept, or build trimming (re-encode the published ranges) later?
5. **Poem copyright in the anthology.** Whole-text inclusion is needed for expandable folds. Same answer as Open question 1 of the step 1 and 2 brief?
6. **Recording length and device.** 10 minutes and 8 MB suggested; confirm after the spike, and confirm Adam records on iPhone Safari as well as laptop.
7. **Reading tracks.** Line-level highlighting during Play all (drafted) or word-level, which needs reliable word timings and is out of scope until 4a shows they exist?
