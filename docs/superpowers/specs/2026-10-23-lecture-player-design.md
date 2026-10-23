# Lecture player — design

Date: 23 October 2026
Status: approved. The implementation plan (`docs/superpowers/plans/2026-10-23-lecture-player.md`) lists ten changes found while mapping the code. The main ones: quiz questions can't be gates, the hinge question gets a self-paced mode, a side path is a section placed right after its gate, resume is per device, and Finish is saved in progress rather than in the markbook.

## Problem

Every Teaching lesson type renders the same way for students: one scrolling
page. `pedagogical_mode: 'lecture'` exists but the student view ignores it.
A lecture is different. Students work through it alone, at their own pace,
with no teacher or peers. It is image heavy, carries a voiceover, and should
still make them do things — answer, write notes, flag confusion — so it is
never passive listening.

## Goal

Lectures are built with the existing blocks in the existing editor. When a
lesson's mode is Lecture, students get a **player**: one scene at a time,
narrated, with blocks revealed by tap, gates that need an answer, teacher-built
side paths for wrong answers, prompts to write in their books, a hand-up
button and an end recap. The teacher gets a hand-up queue and a small replay
map.

## Decisions (from Adam)

- Approach: a student render mode over existing blocks, not a separate
  lecture editor and not a scrolling page with extras.
- Narration: the teacher records one short clip per scene. No AI voice.
- Notes: always in the student's book. No in-app note pad. No photo upload.
- Side paths: teacher-built, as a hidden "If wrong" area of normal blocks
  with its own narration. No Ann drafting.
- After a side path the student returns to the main lecture. No retry and no
  parallel question. The miss goes to the recap.
- Hand-up: flag plus optional typed question to the teacher's queue. No AI.
- Replay map: must stay small on data, calls and tokens. No AI.
- One PR, phases as commits.

## Out of scope

AI narration, Ann answering hand-ups, an in-app note pad, note photos, timed
cue points inside a clip, live teacher sync, retries on gates.

## 1. Scenes and narration (editor)

**Scene cut** (lecture only, separate from focus view's cut):

- a `section` is a **chapter**;
- a `heading` starts a **scene**; everything up to the next heading or
  section belongs to it, including inside a section;
- blocks before the first heading make an opening scene after the title card;
- a `columns` block is one beat and never splits.

Unlike focus view, a second main block does not start a new scene; reveal
handles long scenes. New pure function `lectureScenes(blocks)` beside
`src/teacher/focus/steps.ts`, reusing its `shortLabel` helper.

**Schema additions** (all optional, ignored outside lectures):

- `heading.content.narration?` and `section.content.narration?`:
  `{ url, duration_s, transcript? }`. A section's narration is the chapter
  intro.
- `heading.content.reveal?: 'all' | 'one'` — default `'one'` in lectures.
- `section.content.takeaway?: { enabled: boolean, prompt?: string }` —
  enabled by default in lectures.

**Editor:** in a lecture, each heading and section shows a **🎙 Record**
pill (record, stop, re-record, play), using the Voice block's recorder and
upload path. The heading shows a **Show all / One at a time** toggle. A
**Play as student** button opens the player at the scene being edited.

## 2. Student player

- **Title card:** cover, title, outcomes, rough running time (sum of clip
  durations), "You'll need your book and a pen", **Start**. Start is the
  user gesture that unlocks audio.
- **Scene:** full-screen content. A lone image fills the stage; text sits in
  a reading column; one column on phones, columns stack.
- **Bottom bar:** ◀ Back · narration play/pause, clip progress, speed
  (1× / 1.25× / 1.5×) · **CC** captions from the transcript · main button.
- **Main button labels:** `Reveal · n of m` → `Next scene →`;
  `Answer to continue` (disabled until submitted) at a gate;
  `Done · I wrote it` at a note cue.
- **Reveal cues:** hidden blocks leave a soft dotted placeholder; the next
  one pulses gently; reveals fade in. If the clip has ended and nothing is
  tapped for ~4 s, a one-time hint: "Tap Reveal for the next part".
  Reveal never stops the narration.
- **Top strip:** chapter name, progress strip with chapter ticks and dots for
  gates and note cues, **✋ Lost me** on the right.
- **Keys:** Space play/pause; → main button.
- **Resume:** reopening returns to the last scene, extending
  `src/student/continue.ts`.
- `src/student/lesson-view.ts` routes `pedagogical_mode === 'lecture'` to the
  player; every other mode is unchanged.

## 3. Note cues, gates, side paths

**`note_cue` block (new):** `{ kind: 'copy' | 'own_words' | 'draw' | 'question', prompt }`.

- Player: its own beat, a warm card with a book icon, "In your book" and the
  prompt. Main button `Done · I wrote it`, enabled after 3 s.
- `question` kind also shows **Raise it with ✋**, opening the hand-up sheet.
- Outside lectures it renders as a plain callout.

**Chapter takeaway:** when a section's takeaway is enabled, the player adds a
note cue at the chapter's end: "In your book: the one idea from
[chapter] you'd tell a friend." Teacher can override the prompt.

**Gates:** `hinge_question`, `quiz_question`, `cloze`, `self_check` get
`gate?: boolean`, default true in lectures. The main button waits for a
submit. Answers save through the existing paths so the markbook still works.

**Side paths:** `hinge_question`, `quiz_question`, `cloze` get
`if_wrong?: { narration?, blocks: Block[] }`, edited with the existing nested
blocks editor as a fold-out "If wrong" area. Wrong = wrong option (hinge,
quiz) or any blank wrong (cloze). Flow on a wrong answer:

1. normal feedback shows;
2. button becomes `Let's look again →`;
3. the side path plays as one scene, tinted as a detour on the strip;
4. `Back to the lecture →` goes to the scene after the gate;
5. the miss is noted for the recap.

No `if_wrong` → feedback, then carry on.

## 4. Hand-ups, recap, replay map

**Hand-up record:** `{ student, lesson_id, scene_id, clip_time_s, text?, created_at, status: 'open' | 'answered', reply? }`.

- Student: ✋ opens a sheet with the scene name and an optional "What lost
  you?" box. One write, no AI.
- Teacher: a **Hand-ups** count on the lecture in the class view; the list
  is grouped by scene with **Play scene**, **Answered** + optional one-line
  reply, and **Add as callout** to drop the answer into that scene.
- Student sees replies on their next open of the lecture.

**End recap:** In your book (checklist of note cues and takeaways ticked),
Look again (missed gates, linking to their scenes), Your hand-ups (status),
**Finish** (marks complete for the markbook).

**Replay record:** one per student per lecture, overwritten in place:
`{ reached: scene_id[], replays: { [scene_id]: n }, last_scene, finished }`.
Gate results are not duplicated (they live in normal answers). Sent at most
every few scenes and on page hide (`sendBeacon`). No extra calls on load
beyond reading it for resume.

**Teacher replay strip:** one row of scenes on the lecture's class view,
shaded by share of students who reached each scene, with ↻ replay, ✋ hand-up
and ✗ gate-miss marks.

Storage follows the existing student-answer storage in
`netlify/functions/_shared/teaching-blobs.mjs`; the plan confirms exact keys.

## Phases (commits in one PR)

1. Scene cut, narration fields + Record pill, reveal toggle, player shell
   with title card, bottom bar, reveal cues, resume, Play as student.
2. `note_cue` block, chapter takeaways, gates, `if_wrong` side paths.
3. Hand-up records + teacher queue, end recap.
4. Replay record + teacher replay strip.

## Testing

- Unit: `lectureScenes` (headings, sections, opening scene, columns kept
  whole, nested headings in sections); reveal beat counting; side-path flow
  state machine; replay record merge.
- Schema: new optional fields parse; old lessons unchanged.
- Browser walk at desktop and 390px: record a clip, play as student, reveal,
  gate wrong → side path → back, note cue lock, hand-up round trip, recap,
  replay strip.
- Safari audio playback check (autoplay after Start).
- Non-lecture lessons render exactly as before.

## Risks

- Safari audio quirks: Start-gesture unlock and per-clip `<audio>` swap;
  test early.
- Long scenes on phones: reveal keeps them manageable; very tall blocks
  scroll inside the stage.
- Blocks with their own audio/video inside a narrated scene: pause narration
  when a block's media plays.
