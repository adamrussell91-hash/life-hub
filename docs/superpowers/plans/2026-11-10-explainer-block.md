# Explainer block: build plan

Spec: `docs/superpowers/specs/2026-11-10-explainer-block-design.md`
Branch: `claude/explainer-block`. One PR, two phases as commits.

## Ground rules

- Do not edit `packages/` (it triggers the full suite). Excalidraw is a root dependency (`@excalidraw/excalidraw` 0.18.1), so Teaching imports it directly and lazily. It does not go through `packages/whiteboard`.
- Use `.block-explainer__*` class names. The styles live in `blocks/explainer/explainer.css`, imported by the block (the same way as hinge and voice).
- Use invented sample text only, in the fixtures, preview and tests.
- The block is teacher-made, so students store nothing.

## Phase 1: text

### 1. Schema and registration
`apps/teaching/src/schemas/block.ts`
- Add `'explainer'` to `BlockTypeSchema`.
- Add `ExplainerEventSchema`, a discriminated union on `kind`:
  - `mark`: style `highlight|underline|box|bracket|strike`, `colour?`, `anchor`
  - `note`: `anchor`, `html`, `tray_id?`
  - `erase`: `target`
  - `pointer`: `pane`, `samples`
  - `pause`: `prompt`
  - `board`, `stroke` and `send` are added in phase 2.
  - Every event has an `id` and `t ≥ 0`.
- Add `ExplainerRecordingSchema`: status, clips, `duration_s ≤ 600`, transcript and events.
- Add `ExplainerBlockSchema` (copy `HingeQuestionBlockSchema`): `title?`, `layout` (default `'text'`), `text?` (`AnnotationTextSchema`), `tray` (default `[]`), `board_start?` (phase 2) and `recording?`.
- Add it to `leafBlockSchemas`.
- Add a superRefine rule: events are sorted by `t`, and no event's `t` is after `duration_s`.

Register the type everywhere it is listed:
- `create-block.ts`: add it to `NEW_BLOCK_TYPES`, set the label "Explainer", put it in the Learning group of `BLOCK_GROUPS`, add the child-type lists, and add a `createBlock` case (empty prose text, layout `text`).
- `block-meta.ts`: description and icon.
- `registry.ts`, `render.ts` and `editors.ts`: dispatch cases.
- `search-text.ts`: title, text and note text.
- `publish-block-issues.ts`: label, and "no recording yet" as a warning.
- `sanitize-blocks.ts` and `teaching-student.mjs` `sanitizeBlocksDeep`: sanitise tray and note `html`.
- Test lists: `render-blocks.test.ts`, `learning-activities.test.ts`, `page-block-types.test.ts`, `fixtures/every-block.ts` and the `block-text.json` baseline.
- Rerun `scripts/generate-alchemy-schema.mjs` and `scripts/generate-block-css.mjs`.

### 2. Pure core: `apps/teaching/src/blocks/explainer/`
- `words.ts`: `tokenise(text) → Word[]`, where a Word is `{i, stanza, line, start, end, w}`. Also `anchorFromWords(text, a, b)`, which is built on `buildAnchor`, and `wordsOfAnchor(text, anchor)`, which is built on `resolveAnchor`.
- `fold.ts`: `stateAt(content, t) → {marks, notes, pointer, pauseIds, board}`. It folds every event with `t ≤ time`, and `erase` removes its target. It also exports `nextPauseAfter(events, t)` and `pauseTicks(events)`.
- `clips.ts`: `clipAt(clips, t) → {index, offset}`. `spliceRecording(rec, t0, take)` cuts the clip that spans `t0`, appends the new take's clips shifted to `t0`, keeps events with `t ≤ t0` plus the take's events, and resets `duration_s`. `mergeTranscripts(perClip)` offsets the words by each clip's `start_s`.
- `publish.ts`: `stripExplainerForStudent(block)` drops a recording whose status is `draft` and drops tray notes that no event uses. A plain JS copy goes into `teaching-student.mjs`.

### 3. Text pane and ink
- `text-pane.ts` renders the text as word spans (`data-w=i`) with an SVG overlay. `paint(state)` draws its marks from the word rectangles, using `bandPath`, `underlinePath`, `boxPath` and `bracketPath` from `annotation-ink.ts`, plus a new `strikePath(r)` added to `annotation-ink.ts`.
- Notes are margin cards placed with `stackLabels`.
- The pointer is a dot drawn on its word.
- The pane repaints on resize, because anchors are words, not pixels.

### 4. Recorder: `recorder.ts`
- Export `pickMime` from `voice-recorder.ts`.
- `mountExplainerRecorder(host, block, {onDone(take)})`:
  - 3-2-1 countdown, then `MediaRecorder` recording.
  - Pause/resume closes a clip and opens the next one.
  - A clock gives `t` from the summed clip time.
  - Tool bar: highlighter in the palette colours, underline, box, bracket, cross out, note (tray chips, or a typed note), pointer (sampled at about 15 Hz and snapped to words), and pause point.
  - Selecting words with a mark tool records a `mark` event. Clicking an existing mark with an eraser modifier records `erase`.
  - Stop at the 10-minute cap.
- After Stop, each clip goes through `uploadVoiceRecording`, then `pollAiJob` and `parseWhisperTimings`, and the transcripts are merged. If transcription fails, the timing falls back to `estimated`. Clips get `media_id`/`url` from the job's `media`.
- `startAt` (default 0) is used for re-recording from a point: the take is spliced in with `spliceRecording`.

### 5. Editor: `editor.ts`
- Set-up area:
  - title
  - layout select
  - text paste box (`parseAnnotationSource`/`serializeAnnotationSource`, prose/verse switch)
  - tray list (add, edit, delete)
- **Record** opens the recorder. It warns before replacing an existing recording.
- **Timeline** (`timeline.ts`) lists the events as `mm:ss · label · words`:
  - drag the time or nudge it ±0.5 s, then re-sort
  - edit a note's text or a pause prompt
  - delete an event
  - **Re-record from here**
  - a preview player above it, using the same player
- A Draft/Published toggle on the recording, starting as draft.

### 6. Player: `player.ts`
- `mountExplainerPlayer(host, block)` chains the clip `<audio>` elements using `clipAt`.
- Controls: play/pause, a scrubber with pause-point ticks, speed 1×/1.25×/1.5× (sets `playbackRate` on every clip), and a captions toggle. Captions show a line of words around `t`.
- A requestAnimationFrame loop calls `stateAt(t)` → `pane.paint`.
- Pause points stop playback on a prompt card. **Continue** resumes.
- At the end, the full state stays on screen.
- `render.ts` gives students and teacher view the player. A block with no recording renders the plain text.

### 7. Tests and preview (phase 1)
- `tests/unit/explainer-block.test.ts` (copy the hinge test): schema, group, registry, editor, render, and the student filter.
- `explainer-fold.test.ts`: playing through to t equals jumping to t, erase works, and the pause helpers.
- `explainer-clips.test.ts`: splice, `clipAt` and the transcript merge.
- `explainer-words.test.ts`: anchors land on the same words at two widths.
- Root `tests/unit/teaching-student.test.js`: the `.mjs` filter and sanitising.
- Dev preview at `apps/teaching/explainer.html` with `src/dev/explainer-preview.ts`, using a fake fetch and fake mic copied from `voice-block-preview.ts` and a sample recording. `?view=student` switches to the student view.

Commit: "Explainer block: text phase".

## Phase 2: board

### 8. Board runtime: `board-runtime.ts`
- Lazy-load react, react-dom/client, `@excalidraw/excalidraw` and its CSS, following `excalidraw-board.ts`'s loader.
- `mountBoard(host, {elements, editable, onChange})` returns `{api, setElements(els), dispose}`.
- Editable while recording. View-only with `viewModeEnabled` for playback. Zoom and pan are allowed while paused, and the view snaps back to the recorded scroll on play.
- If inline Excalidraw cannot be made to work without editing `packages/`, stop and ask.

### 9. Board events
- Schema: add the `board`, `stroke` and `send` events, plus `board_start` as a `BoardScene`.
- Recorder: on pointer-up, diff the elements by `id`/`version`. Changed elements become a `board` event. A freedraw element in progress is captured as a `stroke` with per-point time offsets.
- The board pointer records `[t, x, y]` samples.
- **Send to board**: selected words become a text element placed in an empty area, recorded as a `send` event.
- `fold.ts` builds a map of elements by id. A `stroke` is partially drawn at time t (points with offset ≤ t − event.t).
- Layout: `both` is a fixed 50/50 split, and the panes stack below 900px.
- Editor: a starting-picture board, editable before any recording.

### 10. Tests (phase 2)
- A stroke replays at its recorded point timing.
- A `send` creates the board text element at its time.
- Board elements fold correctly through move and delete.
- The preview gets a board sample.

Commit: "Explainer block: board phase".

## Finish
1. Browser walk of the preview at `localhost:5173/explainer.html` in Chrome:
   - record with the fake mic
   - tidy the timeline
   - re-record from a point
   - as a student: scrub, change speed, toggle captions, use the pause points
   - board record and replay
   - check 390px stacks
2. Check that the diff has nothing under grove, `packages/`, Tasks fixtures or workflows.
3. Run `npm run pre-pr-check`.
4. Open the PR ready for review and turn on auto-merge.
5. Still open after the PR, for Adam: a real-mic recording in Chrome, and playback in Safari.
