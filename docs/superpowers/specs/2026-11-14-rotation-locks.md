# Station Rotation: real locks

Approved 14 Nov 2026. One PR, phases as commits.

## Problem

A station shows every block at once. "Lock 1…5" are only callout titles. Steps are self-marked flip cards. The one real check (the hinge gate) only blurs what comes after it, and those blocks are in the public snapshot anyway. Finishing a station shows a small "Done" pill, and the evidence board barely changes.

## What we build

### 1. A station is a chain of locks (optional per station)

`Station.locks?: StationLock[]` (max 6). A station with no locks works exactly as today.

```ts
StationLock = {
  id: Id,
  title: string(≤80),                 // "Which poem?"
  check:
    | { kind: 'rush', items: QuizQuestion[] (auto-marked kinds only: multiple_choice, true_false, odd_one_out, quote_technique, short_answer exact), streak: int 3..10 (default 6), seconds: int 30..300 (default 90) }
    | { kind: 'ai', prompt: string(≤500), model_answer: string(≤1000), criteria: string(≤200)[] (1..4) },
  reward: { title: string(≤80), text: string(≤400) }   // a Viva Kit card the student keeps
}
```

Content blocks belong to a lock with `block.settings.rotation_lock = lockId`. Lock 1's blocks show from the start. A lock's blocks show only after the lock before it is passed. Blocks with no `rotation_lock` behave as today (goal, recall and the like stay visible).

Name clash: `LockQuestionSchema` already exists for the finale lock. Use `StationLockSchema` / `StationLock`.

### 2. Locked content stays on the server

At publish (`prepareRotationPublish`), blocks tagged with a lock other than the station's first lock are removed from the student snapshot and stored in the server config (`config.lock_blocks[stationId][lockId]`, already split for students: quiz keys out). Rush items are split too: public question in config, key server side. AI `model_answer` and `criteria` never leave the server. Rewards stay server side until earned.

`buildStatus` returns, per station: `locks: [{ id, title, state: 'open' | 'passed' | 'locked', check: public check (rush: public items + streak + seconds; ai: prompt), reward?: {title,text} (passed only), blocks?: Block[] (open or passed only) }]`.

### 3. Checks (server marked)

- **Rush** (`lock_rush` action, `{station, lock, item_id, response}`): server marks with the stored key. Tracks per lock `{started_at, streak, best, answered}`. The first answer starts the clock. A wrong answer sets streak to 0; the item comes back later (client shows items in a server-chosen order, so the server returns `next_item_id`). Reaching `streak` right in a row within `seconds` of `started_at` passes the lock. Past `seconds` without passing: the round resets (`started_at` cleared, streak 0), reply says so. Answers are never revealed during the round. Rate limit sensible (one answer per 600 ms).
- **AI** (`lock_ai` action, `{station, lock, text}`): reuse the rotation written-check plumbing (`rotation-writing.mjs`: guards, injected checker, spend logging and the class daily cap) with a new lighter prompt: one or two sentences judged against the teacher's model answer and criteria, reply `{ pass: boolean, fix: string (one specific next step, ≤160 chars) }`. Use the fast lane (`claude-haiku-5-5`), effort low, small max_tokens. Same guards: 20 s rate limit, unchanged text refused, text addressed to the marker refused, max 6 checks then a teacher check (flag in the live view like written gates). No key: falls back to the teacher.
- Passing a lock records `work.locks[station][lock] = { passed_at }`.
- `collect` on a station with locks needs every lock passed (plus the existing gate and exit rules).
- Teacher live view: show each student's lock progress per station, and a teacher "open lock" action like `open_gate`.

### 4. Student UI (station-card.ts and friends)

- Locks render in order as a chain. Passed locks fold to a one-line row with their reward card. The open lock shows its blocks then its check. Locked locks show only a closed row with the lock's title and a padlock; nothing else.
- **Rush round:** a compact in-page panel (not the full-screen arcade). Big question, answer buttons or input, a streak meter (e.g. 6 pips), a countdown bar. Feedback is instant (right or wrong, no answer shown). Reuse what you can from `games/kinds/points-rush/stream.ts` (its `driver` seam) or write a small focused component; keep it phone friendly at 390px.
- **AI check:** a textarea, a Check button, the reply as pass or one fix line. Disabled while checking.
- **Unlock moment:** the reward card animates in (flip or slide, 300–500 ms, reduced motion respected), the next lock's blocks appear, and the page scrolls the new lock into view gently (keep scroll otherwise; see `keepScroll` in player.ts).
- **Viva Kit:** rewards collect in a "Your Viva Kit" list on the map aside (under Passport) and on the station card. Full text, not titles.
- **Station complete:** a full-width panel at the end of the station: "Station complete", the reward cards from this station, and a "Back to the map" button. Replace the small collect card for locked stations.
- **Map:** a collected station's node shows a clear collected state (filled, with a large tick and its piece), not a small "Done" pill. Apply to all stations, locked or not.
- **Evidence board:** a newly collected card animates onto the board once (remember what has been shown in sessionStorage, wrapped in try/catch), and each card lists that station's earned Kit lines.

### 5. Teacher editor (rotation/editor.ts station tab)

A "Locks" panel per learning station: add, remove and reorder locks (max 6). Per lock: title, check kind (Rush or AI check), the rush items (reuse `mountQuestionBuilder` with the auto-marked kinds and 1 mark), streak and seconds, or the AI prompt, model answer and criteria, then the reward title and text. A block in the station section can be assigned to a lock (a select on the block's rotation settings, like level). Publish checks (`rotationIssues` and the server's publish problems): rush needs at least `streak` finished items; AI needs prompt, model answer and one criterion; reward title and text required; a lock-tagged block must name an existing lock.

## Rules

- Public repo: invented content only in tests, fixtures and the mock (extend `tests/unit/helpers/rotation-fixture.mjs` and the mock's reef lesson with a station that has 3 locks: rush, AI, rush). The mock AI checker must be deterministic (see `scripts/mock-rotation-writing`).
- Plain words in UI copy: no "Strong", "band", "mini-thesis". Say what to do.
- Tokens only in CSS; work at 390px with no sideways scroll; dark mode via existing tokens.
- Don't run grove or the Tasks suite. Unit tests for the server lock logic (rush streak and timeout, ai pass and caps, collect needs locks, publish strips locked blocks and keys) and for the station card chain rendering. No browser specs needed.
