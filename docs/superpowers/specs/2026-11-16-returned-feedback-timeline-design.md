# Returned work and feedback in time order — design

Date: 16 November 2026
Hub: Teaching
Status: built

## Purpose

A student said the returned work and feedback were too confusing. The content was all there, but nothing was ranked: a returned piece showed up to seven things at once, the tab led with a list and a grid of code abbreviations, and "your next step" appeared in about five places. The page must tell two short stories to a student who will give it very little effort:

1. This piece: how you went, what changed, what to work towards.
2. Over time: where you started, where you are now, and the one thing to work on next.

"How you went" is measured against the student's own last piece (ipsative). No mark, level or score is shown. The teacher does no extra marking: every line is worked out from what is already entered.

## The Returned work and feedback tab

Top to bottom, in time order.

1. **New for you.** One card per piece still to open, or with a redraft asked for: its kind (Written, Spoken, Short answer), title, date, the one line on how it went, and Open. Left out when there is nothing waiting.
2. **All your feedback, oldest to newest.** One timeline.
   - One dot per returned piece or note, sitting above a line, oldest on the left, with the date under each day.
   - Dot colour is the kind: written, spoken or short answer. The key and the preview always give the word, so colour is never the only signal. A ring is one still to open.
   - Pieces returned on the same Sydney day stack in one column.
   - Tapping a dot previews it (kind, title, date, how it went) with an Open button. The newest piece is previewed first.
   - The line scrolls sideways inside its own box when it is wider than the screen, and starts at the newest end.
   - Above the line, "Show where your teacher said:" holds one button per recurring comment, by its plain label with no code abbreviation. At most three things to work on and two done well, the most frequent first, so a large code library never becomes a wall of buttons. Tapping one keeps the dots bright where it was said and gives one sentence: how often, and what to do.
   - This replaces both the list of returned work and the code grid ("What your feedback keeps saying").
3. **How you're going.** Three boxes: Before, Now, Focus on next.
   - Before and Now follow the skill, outcome or concept that has risen furthest since its first placement, with the "I can" line for that rung when it is a skill. Now also carries the most frequent done-well comment and the most frequent to-work-on comment.
   - Focus on next is the one next step, with the lesson where it is practised next.
4. **More detail.** Closed by default: the skill ladders.

## One returned piece

1. Back, title, returned date.
2. The three lines: **How you went** (one sentence), **What changed** (a chip per criterion or skill: up, same, work on this), **Your next step** (one sentence, and on the newest piece the lesson where it is practised next).
3. The student's work. Highlights use two colours only: done well, and to work on. Tapping one explains it, as before.
4. The teacher's comment, always visible.
5. **More detail**, closed by default: skills in this work, knowledge used, and where the piece sits on each criterion.

Redraft asks, the redraft editor and draft pills stay where they were, because they are things to act on.

## One next step

- On a piece: the step the teacher chose on the rubric; otherwise the step worked out from that piece's codes. The separate "What to focus on next" box and the rubric box's own "Your next step" no longer appear beside it.
- On the tab: the same step the writing boxes show in lessons (`writingDirective`), so the page and the lesson never disagree; otherwise the most frequent to-work-on code's action.
- "You practise this next in …" names the first lesson still to do in the To do panel's Do now box, then Do next. It is passive: nothing is written or ticked on the returned piece.

## How the first line is worded

Compared with the student's last piece of the same kind, across the criteria, outcomes, concepts and skills both pieces were placed on.

| Compared with their last piece | The student reads |
|---|---|
| More moved up than down | Better than your last piece. |
| Nothing moved | About the same as your last piece. |
| As many up as down | Some of this moved up from your last piece, and some has more to do. |
| More down than up | Your last piece was stronger. |
| No earlier piece of this kind | Your first piece. This is your starting point. |
| Nothing to compare (codes only) | 2 things done well, 1 thing to work on. |
| No placements and no codes (a note) | No line. |

"Piece" becomes "viva" for spoken work and "short answers" for quizzes and answers. The lines pass the page's wording rule (`BANNED` in `progress/story-text.ts`). A weaker piece now gets words on this one line; the per-criterion "Where this piece sits" box keeps its rule that a drop says nothing.

## The guide

The first time a student opens the tab, a guided tour explains each part: what is new, the buttons, the timeline and its colours, how you're going, and More detail. Done, Skip or Esc shrinks it into the small ? button in the corner, which replays it. It reuses `app/tour.ts` (the Progress share guide). The ? button lives inside the tab, so it shows only there. A teacher looking at a student's page gets no guide.

## Data

No new stores. Additions to what the student's own endpoint already sends:

- Each returned item: `day` (Sydney date), `good` and `work` (code ids), `verdict` (the kind only, or the two counts).
- An opened piece: `verdict` with the names of what moved.
- Progress: `focus` (the writing boxes' step) and each skill row's `first` rung.

`netlify/functions/_shared/feedback-story.mjs` holds the comparison. Nothing here sends a mark, a total, a teacher note or another student's data.

## Non-goals

- My progress is unchanged. Its next-step cards still list the top repeating codes.
- The teacher's Over time tab and its code grid are unchanged.
- No fix-in-place task on a returned piece.
- No fourth dot colour for imported written feedback: notes are Written.

## Failure modes checked (docs/CURSOR-UI-FAILURES.md)

- **I19** guide hides what it points at: every step walked at 390 and 1440; the spotlight clears the sticky Do this now strip (`apps/teaching/tests/browser/returned-feedback.spec.ts`).
- **R** responsive: no sideways page scroll at 390; only the timeline scrolls, inside its own box.
- **D** data shown truthfully: a piece with nothing to compare gets counts or no line, never an invented comparison.
- **S** tokens only in `student/feedback-home.css`.
