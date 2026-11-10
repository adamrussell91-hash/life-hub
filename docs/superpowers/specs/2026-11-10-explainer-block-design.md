# Explainer block: recorded teacher demonstrations

Date: 10 November 2026
Status: design approved, not built
Hub: Teaching

## Why

A teacher wants to model a skill in front of students, not just show the finished product: talk through an exemplar answer while marking it up, cross out the notes that don't make the cut, and build a plan on a board. A student asked: "How do I get from my masses of notes to a succinct one-minute response?" The answer is best shown live, and students need to replay it.

The hub can record voice (Voice block, lecture narration, annotation think-aloud tracks with word pins) and can mark up text (Annotation block) and draw (Excalidraw board). It cannot record a demonstration that plays back the marks in time with the voice. The Video block only plays external providers.

## Decision

**Live replay, not screen video.** The block records the teacher's audio plus a timed list of actions (highlight these words, drop this note, draw this stroke). Playback redraws the actions in time with the audio.

Chosen over:
- Screen recording to a video file: captures anything, but text becomes pixels, one typo means a full re-record, files are large, and Chrome's recorded format plays badly in Safari.
- Narrated steps on the lecture player: cheapest, but reads as a slideshow, not live thinking.

Trade-off accepted: it records only what happens inside the block.

## Scope

One PR, two phases as commits:

1. **Text phase:** new `explainer` block, text pane, notes tray, recording tools, timeline tidy-up, pause points, student player.
2. **Board phase:** Excalidraw board pane, board recording, "Send to board".

Target device: laptops (Chrome and Safari on Mac). Narrow screens stack the panes but are not tuned.

## What the teacher sees

### Set up
- Add **Explainer** from the lesson's + menu.
- Paste the text to work on (prose or verse, the Annotation block's text format).
- Optional **notes tray**: pre-written notes, dropped onto words during recording so the teacher never types while talking.
- Layout setting: **text only**, **board only**, or **text + board** (fixed side-by-side split).
- Phase 2: optional **starting picture** on the board (e.g. five empty scaffold boxes), drawn before recording.

### Recording
Record → 3-2-1 countdown → talk. Tools:

| Tool | Records |
|---|---|
| Highlighter (palette colours) | words highlighted |
| Fineliner underline | words underlined |
| Box | box round a word |
| Bracket | bracket on a line |
| Note | tray note (or typed note) attached to words |
| Cross out | strike-through on words |
| Pointer | laser dot following the mouse, snapped to words on text |
| Pause point | marker; prompt typed after recording |
| Pause / resume | splits the audio into clips |
| Board tools (phase 2) | pen strokes, shapes, arrows, text boxes, moves, deletes |
| Send to board (phase 2) | selected words fly onto the board as a text box |

Ink uses the Annotation block's renderers (`annotation-ink.ts`).

### Tidy up after Stop
A timeline lists every action at its time. The teacher can:
- drag an action earlier or later;
- edit a note's text;
- delete an action;
- edit pause point prompts;
- **re-record from a point**: audio and actions after that time are replaced; everything before stays.

Captions come from the existing voice transcription (word timing).

## What students see

- Play, pause, scrub, speed 1× / 1.25× / 1.5×, captions on or off.
- Marks appear in time with the voice. Scrubbing jumps to the exact state at that time.
- **Pause points:** playback stops on a prompt card; **Continue** resumes. Pause points show as chapter ticks on the scrubber.
- Phase 2: board shown view-only at the current time; zoom and pan allowed while paused, snapping back on play.
- After the end, the fully marked text (and board) stays as a static study copy.

No student data is stored: no answers, no watch records.

## Data

New block type `explainer` in `apps/teaching/src/schemas/block.ts`.

```ts
content: {
  title?: string;
  layout: 'text' | 'board' | 'both';          // default 'text'
  text?: AnnotationText;                        // reuse AnnotationTextSchema
  tray: { id: string; html: string }[];         // pre-written notes
  board_start?: ExcalidrawSnapshot;             // phase 2
  recording?: {
    status: 'draft' | 'published';
    clips: { media_id?: string; url: string; mime: string; start_s: number; duration_s: number }[];
    duration_s: number;                         // max 600
    transcript?: { words: { w: string; start: number; end: number }[]; timing: 'word' | 'segment' | 'estimated' };
    events: ExplainerEvent[];                   // sorted by t
  };
}
```

`ExplainerEvent` (each has `id` and `t` in seconds on the recording's timeline):

| kind | payload |
|---|---|
| `mark` | `style` (highlight / underline / box / bracket / strike), `colour?`, `anchor` (AnnotationAnchor) |
| `note` | `anchor`, `html`, `tray_id?` |
| `erase` | `target` (event id) |
| `pointer` | `pane`, samples `[t, wordIndex]` on text or `[t, x, y]` on board, throttled to about 15 Hz |
| `pause` | `prompt` |
| `board` (phase 2) | `elements` (changed Excalidraw elements on release) |
| `stroke` (phase 2) | one freedraw element, with per-point timing |
| `send` (phase 2) | `anchor`, board text element |

Rules:
- Text marks are word anchors, never pixels, so they survive rewrapping.
- **State at time t** = fold every event with `event.t <= t` over the starting text and `board_start`. A pure function, used for both playback and scrubbing.
- **Re-record from t:** clips cut at t (the clip spanning t is shortened), new clips appended, events with `t > t0` dropped and replaced by the new take's events. Pause/resume while recording uses the same clip list.
- Audio uploads through the media library (`POST /api/media/upload`, `uploadMediaFile`), private until the lesson is published. Use the audio mime the Voice/annotation recorder already uses.
- Clip playback chains clips; a small audible seam between takes is accepted.

### Publishing
The student filters drop: tray notes never used in an event, and a recording whose status is `draft`. Both publish-strip filters must get the rule (see the hinge question block's two filters).

### Limits
- 10 minutes per explainer.
- Checkpoints cover the block as any other edit.

## Code placement

- New block files in `apps/teaching/src/blocks/explainer/`: schema glue, editor (set-up and tidy-up timeline), recorder (tools and event capture), player (state fold, scrubber, pause cards), board adapter.
- Reuse: `annotation-ink.ts`, annotation text and anchors, `voice-recorder.ts` capture and transcription path, `upload-button.ts` media upload.
- The board **uses** `packages/whiteboard/` without editing it. Board recording and replay live in `apps/teaching/src/blocks/explainer/`. If the shared package must change, stop and ask first, because `packages/` changes trigger the full test suite.

## Testing

Unit tests:
- State fold: playing through to t equals jumping to t.
- Re-record splice: clips and events before t kept, after t replaced.
- Anchors land on the same words at different widths.
- Publish filters strip unused tray notes and draft recordings.
- Phase 2: strokes replay at recorded point timing; `send` creates the board text element at its time.

Dev preview page with a fake server and mic, like the Voice block preview.

Browser walk on a laptop: record with a real mic in Chrome, tidy the timeline, re-record from a point, play back as a student (scrub, speed, captions, pause points), then playback in Safari on Mac.

Gate: `npm run pre-pr-check`. The change should not touch grove, `packages/`, Tasks fixtures or workflows; check the diff before running the gate.

## Not in scope

- Student answers at pause points.
- Tuned phone layout.
- Recording other apps, websites or the whole screen.
- Audio waveform editing, video export, AI voice.

## First use

A support lesson that answers the student question above: the teacher records an exemplar one-minute viva answer, marks up its moves, crosses out the notes that didn't make the cut, and builds the five-box plan on the board.
