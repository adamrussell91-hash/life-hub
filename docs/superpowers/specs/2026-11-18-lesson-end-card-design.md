# Lesson end card — design

Date: 18 November 2026
Hub: Teaching
Status: built
Mockup: `docs/mockups/lesson-end-card.html`

## Purpose

The end of a student lesson has three separate pieces: the "This lesson" checklist, a round finish tick with previous and next beside it, and the "What's next" card. They look unrelated and they talk over each other:

- Two kinds of tick mean different things. Small squares tick parts; the big circle finishes the lesson. The circle has no words on it, and the only explanation is a line of small print.
- Three things are called "next": "Start here" on a checklist row, the "What's next" card, and the "Next →" lesson link. Before the lesson is finished, the loudest button on the page is "Take me there", which leads away from it.
- Every row carries "ticks itself when answered here", and a done row is marked three ways at once (green tick, strikethrough and the word Done).

The end of a lesson becomes one card that reads in order: what you did, finish, where next. One main button is on screen at a time.

## The card

One card, centred, at most 44rem wide, in place of the checklist card and the tick row. Previous and next lesson sit under it as a quiet row of the same width.

### Before finishing

1. **Head.** Kicker "End of lesson", title "Before you finish", the count "2 of 4 parts done" and a thin progress bar.
2. **Parts.** One row per section: a tick box and the section name. A row not yet ticked has "Go to part ↑" on the right, which scrolls to that section (the name does the same, as now). A ticked row has a green box and a muted name, nothing else.
3. **One help line** under the list: "Parts you answer on screen tick themselves. Did one in your book? Tick it here." With no self-ticking part in the lesson it reads "Tick each part off as you go."
4. **Finish.** A button with a tick and the words "Finish lesson". Beside it, "2 parts aren't ticked. You can still finish." (or "1 part isn't ticked. You can still finish." / "All parts ticked.").
5. **Next, quietly.** One line: "Next on your list: Read your feedback on Viva practice". No button. Left out until the list has been read, and when the list is empty.

### Pressing Finish lesson

The finish row is replaced, in the same place, by the hand-in check: "Hand in and finish?", what will be handed in and anything left blank (the existing lines), the initials field on a new device, then **Hand in and finish** and **Keep working**. The quick questions and the "still unclear" box follow in that same place. While any of these is open the "next" line is hidden, so the step has one main button.

The card says "Lesson completed" only once the questions are answered or skipped, as now.

### Finished

1. **Head** turns into a green band: a tick, "Lesson completed", and "2 of 4 parts ticked · Show parts". "Show parts" opens the parts list again in the card (and becomes "Hide parts").
2. **Next on your list** is now the body of the card: the next thing in large type, **Take me there →** as the main button and **My to do list** beside it. With nothing left: "Nothing else on your list right now. Nice work." and the list button. Not signed in to the class on this device: "Your to do list has what to do after this lesson." and the list button.
3. **Undo**, small, at the foot: "Finished by mistake? Untick this lesson". It opens the existing check ("Mark this lesson as not finished?") in the card.

### Previous and next lesson

Labels change from "← Previous" and "Next →" to "← Previous lesson" and "Next lesson →", so they can't be read as the student's next step.

## Other cases

| Case | What shows |
|---|---|
| Fewer than two sections, or a lecture | No parts list, count or bar. Title "End of lesson", the Finish lesson button, the quiet next line. |
| Quiz lesson | Handing the quiz in finishes it, so there is no Finish button and no head. The card is "Next on your list" in its full form, with previous and next lesson under it. |
| Station rotation | Nothing, as now. |
| A part a hinge gate still holds back | Left out of the list, as now, and now out of the count too, so the count matches the rows on screen. |
| Phone (480px and under) | Buttons take the full width. "Go to part ↑" is dropped; tapping the name still goes there. |

## Words that change

| Now | After |
|---|---|
| This lesson | Before you finish |
| 2 of 4 done | 2 of 4 parts done |
| Start here (on a row) | removed |
| ticks itself when answered here (on each row) | one help line under the list |
| Done (on a row) | removed |
| Tick parts off as you go. The big tick below finishes the lesson, even with parts left. | "N parts aren't ticked. You can still finish." beside the button |
| (round tick, no words) | Finish lesson |
| Finish this lesson? | Hand in and finish? |
| What's next | Next on your list |
| ← Previous / Next → | ← Previous lesson / Next lesson → |
| (press the green tick to untick) | Finished by mistake? Untick this lesson |

## What stays

- How a part ticks itself, hand ticks kept on the device, and the rule that an answered part keeps its tick.
- Everything the finish does: initials on a new device, quiz and written work handed in, the lesson recorded done, the two anonymous questions and the optional box, untick leaving handed-in work alone.
- Which thing is "next" (`oneThing`), and that the list is read only when the card nears the screen or the lesson is finished.
- The section strip on the right edge, its "Checklist and finish" row (it now scrolls to the card), the "What next?" edge tab, and the "Not sure what to do?" line under the title.

## Build

Three modules keep their jobs; the footer becomes the owner of the card.

- `student/lesson-footer.ts` builds the card: head, a slot for the parts, the finish row, the panel for the check and the questions, the "next" block it is handed (`beside`), the undo line, and the lesson links under the card. It gains `partsSlot` (where the map puts its list) and `setParts(done, total)` (for the count, the bar and the "aren't ticked" line). The finish control is a labelled button, not a pressed/unpressed toggle; the done state is the card's `is-done` class.
- `student/lesson-map.ts` renders only the list and the help line into the slot it is given, and reports `onProgress(done, total)` on every repaint. Its own heading, count, "Start here", per-row labels and the pop-in animation go. It takes `end`, the element its "Checklist and finish" row scrolls to.
- `student/whats-next.ts` keeps one element with two looks: a quiet line until the lesson is done, the full block after (`is-ready`), or always the full block when mounted `open` (quiz lessons). It marks itself `has-thing` once it has something to name.
- `student/lesson-view.ts` wires them: the map into the footer's slot, the map's progress into the footer, the organiser end card before the footer.

Styles stay in the three existing files and use tokens only. Buttons inside the card are pills, to match the "next" buttons.

## Non-goals

- No change to what counts as done, to the server, or to the teacher's side.
- No change to the edge tab, the title line, or the right-hand strip beyond where its last row scrolls.
- No new "next lesson" logic: the card names the next thing on the to do list, as now.

## Failure modes checked (docs/CURSOR-UI-FAILURES.md)

- **V1** `[hidden]` doesn't hide: the finish row, the panel, the parts slot and the undo line are shown and hidden with `hidden`; each has a `[hidden] { display: none }` rule. Check: computed `display` is `none` for each in the state that hides it.
- **V3** duplicate controls: before finishing, the card has no "Take me there" button; after, no Finish button. Check: count primary buttons in the card in each state; it is one.
- **V4** parts of the page disagree: the count in the head, the bar, the "aren't ticked" line and the strip on the right come from the same paint. Check: tick a part and read all four.
- **R3 / R2** phone: at 390 the card has no horizontal scroll, every button is at least 44px tall and full width. Check: screenshot at 390 in the before, check, questions and finished states.
- **R5** phone hides a control: "Go to part ↑" is hidden at 480px and under; the name button does the same job. Check: tap a name at 390 and land on the section.
- **I2** fake links: "Go to part", "Show parts" and "Untick this lesson" are buttons; previous, next, "Take me there" and "My to do list" are links. Check: each works from the keyboard.
- **I12** in-place remount jumps the page: ticking a part repaints rows in place. Check: scroll position is unchanged after a tick.
- **I16** a mark students must decode with no words: the finish control carries the words "Finish lesson". Check: no icon-only button in the card.
- **L13** corner control on the first line: none added.
- **W12** class name already in use: new `lf__` and `lm-check__` names are grepped before use.
- **P1** compare to the mockup: every state of the built card is checked against the mockup at 1280 and 390 before the PR.

## Verify

- Unit tests for the three modules cover: the labelled Finish button and its check; the card's done state; the count and line from `setParts`; the quiz case; the list without its old labels; `onProgress`; the quiet and full "next" looks.
- In the running app as a student, on a four-part lesson: arrive, tick a part by hand, answer a part, finish, read the completed card, show parts, untick. Repeat at 390px. Open a quiz lesson and a one-section lesson.
