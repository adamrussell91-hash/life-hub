# Lesson End Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace the three pieces at the end of a student lesson (checklist card, finish tick row, What's next card) with one card, as specified in `docs/superpowers/specs/2026-11-18-lesson-end-card-design.md` and drawn in `docs/mockups/lesson-end-card.html`.

**Architecture:** `lesson-footer.ts` owns the card and its states. `lesson-map.ts` renders only the parts list into a slot the footer exposes and reports progress through a callback. `whats-next.ts` keeps one element with a quiet look and a full look. `lesson-view.ts` wires the three. No server change.

**Tech Stack:** TypeScript, plain DOM (`el`, `button`, `uid` from `@/quiz/dom`), CSS with design-kit tokens, Vitest with happy-dom. All paths below are under `apps/teaching/`.

---

## Interfaces

```ts
// student/lesson-map.ts
export type LessonMapOptions = {
  lessonId: string;
  classId: string;
  blocks: Block[];
  content: HTMLElement;
  /** Where the parts list goes: the slot in the lesson end card. */
  slot: HTMLElement;
  /** What the strip's last row scrolls to. Defaults to the list. */
  end?: HTMLElement;
  /** Told the count on every repaint. Parts a hinge gate holds back are in neither number. */
  onProgress?: (done: number, total: number) => void;
  quiz?: () => LessonQuizHandle | null;
  written?: () => Map<string, Record<string, Record<string, string>>>;
  headerOffset?: () => number;
};

// student/lesson-footer.ts
export type LessonFooterHandle = {
  element: HTMLElement;      // div.lf: the card, then the lesson links
  card: HTMLElement;         // section.lf__card
  partsSlot: HTMLElement;    // div.lf__parts
  setParts(done: number, total: number): void;
  dispose(): void;
};

// student/whats-next.ts
export type WhatsNextOptions = { classId: string; lessonId: string; from: string; open?: boolean; load?: ... };
```

Footer classes: `lf__card` (`is-done`, `has-panel`, `has-parts`, `is-bare`), `lf__head`, `lf__mark`, `lf__kicker`, `lf__name`, `lf__sub`, `lf__show`, `lf__count`, `lf__bar`, `lf__parts`, `lf__foot`, `lf__go`, `lf__finish`, `lf__left`, `lf__panel`, `lf__undo`, `lf__untick`, `lf__status`, `lf__row`, `lf__link--prev`, `lf__link--next`. `lf__tick` goes.

## Task 1: Parts list in a slot (`lesson-map.ts`)

**Files:** Modify `src/student/lesson-map.ts`, `tests/unit/lesson-map.test.ts`, `tests/unit/hinge-gate.test.ts`.

- [x] Rewrite the tests first. `mount()` builds a `div.lf__parts` slot and an `end` element, and records `onProgress` calls. Cases:
  - the list sits in the slot; four rows; `onProgress` last called with `(0, 4)`; no `.lm-check__title`, `.lm-check__count`, `.lm-check__auto`, `.lm-check__start`; no row has `is-next`.
  - help line: "Parts you answer on screen tick themselves. Did one in your book? Tick it here."; with no self-ticking section, "Tick each part off as you go."
  - a row not ticked has `button.lm-check__go` ("Go to part ↑") that scrolls like the name; a ticked row hides it.
  - hand tick reports `(1, 4)` and is kept in `localStorage`; answered work ticks itself and reports the new count.
  - the strip's last row scrolls to `end`.
  - dispose removes the strip and the list.
  - hinge gate: a held-back part is hidden and left out of both numbers.
- [x] Run `npx vitest run tests/unit/lesson-map.test.ts tests/unit/hinge-gate.test.ts`; expect failures on the new cases.
- [x] Implement: drop the head, the count, the per-row labels, `is-next` and the pop-in observer; append the list to `slot`; add the `Go to part ↑` button; count visible parts and call `onProgress`; use `end` for the last row and for "where the student is".
- [x] Run the two files; expect all green. Commit.

## Task 2: Quiet and full "next" (`whats-next.ts`)

**Files:** Modify `src/student/whats-next.ts`, `tests/unit/whats-next.test.ts`.

- [x] Tests first: kicker reads "Next on your list"; `has-thing` is set once a thing is named and absent for an empty list; `open: true` adds `is-open`; `setDone` still toggles `is-ready` and reads the list once.
- [x] Run `npx vitest run tests/unit/whats-next.test.ts`; expect the new cases to fail.
- [x] Implement the kicker text, the `aria-label`, `open` and `has-thing`.
- [x] Run; green. Commit.

## Task 3: The card (`lesson-footer.ts`)

**Files:** Modify `src/student/lesson-footer.ts`, `tests/unit/lesson-footer.test.ts`.

- [x] Tests first, replacing the tick helper with `finish(root)` (`.lf__finish`) and `card(root)` (`.lf__card`):
  - previous and next keep `lf__link--prev` / `lf__link--next` and read "← Previous lesson" / "Next lesson →"; the Finish button reads "Finish lesson"; the card is not `is-done`.
  - quiz (`finish: false`): no `.lf__finish`, no profile calls, links present; with `beside` the card is `is-bare` and holds it.
  - full flow: Finish opens "Hand in and finish?" with the existing lines and hides `.lf__go`; hand in, two questions and the box; then the panel is hidden, the card is `is-done`, the title is "Lesson completed", `.lf__status` says "Lesson completed", `.lf__undo` shows. During the questions the card is not `is-done`.
  - skip, no-questions, initials and quiz-failure cases as before, asserting on `is-done`.
  - untick from `.lf__untick`: the check opens with the card still `is-done`, Untick calls `undone`, the card leaves `is-done` and the Finish button is back.
  - `setParts(2, 4)`: count "2 of 4 parts done", bar width 50%, line "2 parts aren’t ticked. You can still finish."; `(3, 4)` gives "1 part isn’t ticked. You can still finish."; `(4, 4)` gives "All parts ticked."; with no parts the title is "End of lesson" and the slot is hidden.
  - finished with parts: slot hidden, sub line "2 of 4 parts ticked · ", `.lf__show` toggles the slot and its own label.
- [x] Run `npx vitest run tests/unit/lesson-footer.test.ts`; expect failures.
- [x] Implement the card as in the spec. `asking` is true from a successful hand-in until the questions close, so the completed look waits for them and the untick check keeps it.
- [x] Run; green. Commit.

## Task 4: Wiring (`lesson-view.ts`)

**Files:** Modify `src/student/lesson-view.ts`, `tests/unit/lesson-view.test.ts`.

- [x] Add a test: a class lesson with two sections puts `.lm-check` inside `.lf__card .lf__parts` and the count in `.lf__count`.
- [x] Mount What's next with `open` on a quiz; mount the map with `slot: footer.partsSlot`, `end: footer.card`, `onProgress: footer.setParts`; put the organiser end card before `footer.element`.
- [x] Run `npx vitest run tests/unit` and `npx tsc --noEmit`; green. Commit.

## Task 5: Styles

**Files:** Modify `src/student/lesson-footer.css`, `src/student/lesson-map.css`, `src/student/whats-next.css`.

- [x] Card, head, bar, band, foot, panel, undo, links: tokens only, `[hidden] { display: none }` for every element toggled with `hidden`, pills for buttons inside the card, full-width buttons at 480px and under.
- [x] List rows without the old labels; `Go to part ↑` hidden at 480px and under; drop the pop-in rules.
- [x] `.wn-card` quiet line and full block; hidden under `.lf__card.has-panel`.
- [x] Commit.

## Task 6: Prove it in the running app

- [x] `npm run dev -- --host 127.0.0.1`, publish the invented four-part lesson into the mock class, and walk it as a student at 1280 and 390: arrive, hand tick, answer, Finish, completed, Show parts, Untick; then a quiz lesson and a one-section lesson.
- [x] Run the spec's failure-mode checks (V1, V3, V4, R2/R3, R5, I2, I12, I16) and compare each state with the mockup.
- [x] Set the spec's status to built. `npm run pre-pr-check` from the repo root; exit 0. Push; open the PR ready for review; enable auto-merge.
