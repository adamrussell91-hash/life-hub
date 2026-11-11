# Game lessons — design

Date: 11 November 2026
Branch: `claude/game-lessons`
Status: spec for Adam's review. Nothing built. All examples (students, quotes, texts) are invented.

## Purpose

`game` is already a lesson type (`apps/teaching/src/curriculum/pedagogical-mode.ts`), but it is a label only: nothing behaves differently. This build turns it into a real suite of twelve classroom games that:

1. play in class (live, on the board and on every student's phone) or for homework (solo, self-paced);
2. are **polished**: real motion, sound, a board that looks like a game show rather than a form, and phones that feel like controllers;
3. are **actually live** where they claim to be: sub-second updates, not 2.5 s polling;
4. **produce learning data** for every student on every item, tagged like quiz evidence, so games add to Results, the DU monitor, the organiser and (when the teacher chooses) the markbook.

## Adam's calls (11 Nov conversation)

- The twelve games: **crossword, find-a-word, Jeopardy, Wheel of Fortune, team match** (his own Quizlet Live), **points rush** (his own Gimkit/Blooket, without the gimmicks), **short-answer battles** (his own ShortAnswer), **wager, Connections wall, Articulate, Pictionary, Who said it?**
- Rejected as "classroom activities, not games": odd one out, cloze race, timeline/sequencing, link chain, spot the error, Just a Minute, brain dump race.
- Wager: everyone starts with 100 **points** (never money), bets any amount, right answers split the pot of wrong bets, most points wins.
- Find-a-word plays from **clues, not a word list** (definitions and, better, examples), with **decoy words** and a **hidden message**.
- Wheel of Fortune: every student solves **privately** on their phone; the app records **how many letters were showing** when each student got it; letters are **earned by answering**; every solve is followed by a **solve-then-explain** question.
- Every game must produce decent learning data about the students playing it.
- Polished, professional, live when live. "Better than decent. Amazing."

## Out of scope

- Public or cross-school play. Rooms are one class, one teacher.
- Student accounts. Identity stays device token + initials claim.
- Runtime AI during play. Ann can **draft** game content in the editor (priced and confirmed first, per house rule); nothing calls a model while a game runs.
- Voice or video in rooms.
- Sabotage, shops of cosmetic items, avatars bought with points, or anything else whose point is not the content.

---

## 1. Principles

### 1.1 Learning data rules (apply to every game)

| Rule | What it means in code |
|---|---|
| **Per student, per item** | Every answer is one `GameEvent` with a student owner and an item id. Team scores are always derived from individual events, never stored instead of them. |
| **Own device, even in team games** | In Jeopardy, Wheel and team match, the team chooses, but every member answers on their own phone. |
| **Same tags as quizzes** | Game items carry `pieces` (`kp_…`), `outcomes`, `skills` and technique tags with the same shapes as `quiz/core.ts`, so `quiz/evidence.ts` can read them. |
| **Evidence strength is labelled** | `live_solo` (answered alone, live, timed) > `live_team` (team move, e.g. Articulate guessing) > `self_paced` (homework, can look things up). Strength travels with every event. |
| **Low stakes by default** | Games never write marks. The teacher can push a game to the markbook as an explicit act (§4.4). |
| **Misses come back** | A missed item linked to an organiser line sends that card back to box 1 (§4.3). |

### 1.2 Live means live

Live games run in a **game room** that pushes state to every screen over WebSockets (§3). Target: an action on one phone shows on the board in **under 250 ms** on school wifi. Polling stays only as the fallback when a network blocks WebSockets.

### 1.3 Polish bar

Every game ships with:

- a **board view** (Display, 16:9, readable from the back row: body text ≥ 32 px at 1920 wide) and a **phone controller** (390 px, one-thumb, every target ≥ 44 px, inputs ≥ 16 px, R4 in `docs/CURSOR-UI-FAILURES.md`);
- a **motion pass**: entrances, reveals, score changes and the end podium are animated (§5.2), at 60 fps (transform and opacity only), with a full reduced-motion version;
- a **sound pass** on the board only (§5.3), muted on phones by default;
- **reconnect without loss**: refresh a phone or the board mid-game and it rejoins the same seat with the same score;
- an **empty, loading and error state** that looks designed, not default.

Phase 0 (§9) is a clickable mockup of every board and controller for Adam's sign-off **before** any game logic is built.

---

## 2. Structure: games are blocks, the Game lesson is the arcade

### 2.1 One block type, twelve kinds

A new block type `game` with `content.kind` as a discriminated union:

```
crossword | find_a_word | jeopardy | wheel | team_match | points_rush |
battles | wager | connections | articulate | pictionary | who_said_it
```

A game block can sit in **any** lesson (a quick Connections wall at the end of an ordinary lesson). Blocks plug in by the comparative-judgement checklist (commit 17f1af6fc): schema in `schemas/block.ts`, registry, render, editors, palette (`create-block.ts`, a new **Games** group), `block-meta.ts` + icon, `visibility.ts` (student-copy stripping), `publish-block-issues.ts`, `teaching-student.mjs`, `fixtures/every-block.ts`, dev preview, baselines, and regenerated files (`generate-alchemy-schema.mjs`, `generate-block-css.mjs`).

Code lives in `apps/teaching/src/games/`:

```
games/
  core/          schema.ts, items.ts, events.ts, scoring.ts (pure, zod only, bundled to _shared)
  kinds/         one folder per game: schema, rules (pure), editor, board, phone, solo, print
  room/          client.ts (socket + fallback), clock.ts, seat.ts
  shell/         lobby, teams, countdown ring, leaderboard, podium, reveal, results panel
  motion/        motion.ts (WAAPI helpers, springs), confetti.ts (canvas)
  sound/         sfx.ts (WebAudio synth)
  generators/    crossword.ts, wordsearch.ts (pure, seeded, unit-tested)
```

### 2.2 The Game lesson type

When `pedagogical_mode === 'game'`:

- `game` is added to `PublishedLessonSchema.pedagogical_mode` so it reaches the student copy.
- The **student** sees an arcade page: the lesson's games as large cards (title, kind, "Play" or "Waiting for your teacher" for live-only games, best result so far).
- The **teacher's Display** opens on a "Tonight's games" board: the games in order, each with **Play live** / **Set as homework**, and the room code once a room is open.
- Ordinary blocks still render (instructions, a model answer), so a Game lesson can mix games with teaching.

### 2.3 Where game content comes from

Four item shapes, shared by the games. Each carries tags (`pieces`, `outcomes`, `skills`, `tech`) like quiz questions.

| Shape | Fields | Used by |
|---|---|---|
| **Term** | `term`, `clues[]` (each `{ kind: 'definition' \| 'example' \| 'quote', text }`), `banned[]`, `decoys[]`, `draw_prompt?` | crossword, find-a-word, Articulate, Pictionary, Jeopardy (typed), points rush |
| **Question** | a `QuizQuestionDraft` from `quiz/core.ts` (MC, multi-select, true/false, short answer, fill gap, quote technique, spot technique) | Jeopardy, team match, points rush, wager, Wheel (letter questions, explain questions) |
| **Quote** | `text`, `speaker` (a character id or `fake`), `source?`, `why_fake?` | Who said it, Wheel puzzles, Pictionary prompts |
| **Group** | `label`, `tiles[4]`, `difficulty 1–4`, `why` | Connections |

Marking reuses `markResponse` from `quiz/core.ts` for Question items, so answer keys are split and stored server-side exactly as quizzes are (`splitQuestion`). Term and Quote answers are checked by `games/core/items.ts` (normalised, accepts listed variants, no fuzzy matching beyond case, accents, spacing and a/an/the).

**Build from this unit** (editor button): pulls Terms from the unit's organiser Vocabulary and technique lines (keeping `piece_id` as the `kp` tag), Questions from the unit's quizzes, and Quotes from lessons' quote blocks. The teacher ticks what to include. No AI.

**Ann drafts** (editor button, optional): clues, banned words, decoys, fake quotes, Connections groups, Jeopardy categories. Uses the existing job runner; shows "about A$x" from a dry run first; the teacher accepts or edits every item. Fake quotes and decoys follow the no-obvious-answers rule: each must be a plausible misreading, with `why_fake` filled in.

---

## 3. The game room (live transport)

### 3.1 Why a new transport

Today every live feature polls Netlify Functions every 2.5–8 s over Netlify Blobs. That is fine for a quiz round, not for Pictionary strokes, a Wheel spin seen on 30 phones, or a wager pot that fills as bets land. Blobs listings also lag.

### 3.2 Design

A Cloudflare Worker `workers/game-rooms` with one **Durable Object per room** (`GameRoom`), using the hibernatable WebSocket API and the DO's SQLite storage for the event log.

- **Netlify stays the source of truth** for lessons, classes, claims, keys, attempts and evidence. The room only runs the game.
- **The room logic is a pure reducer** `games/core/room-core.ts` → bundled to `_shared/game-room-core.mjs` and imported by the Worker: `(state, action, now) → { state, broadcasts, events }`. The DO is a thin wrapper (sockets, storage, alarms). All game rules are testable in Node without Cloudflare.
- Each kind supplies its rules module (`kinds/*/rules.ts`) to the reducer.

### 3.3 Flow

1. **Teacher opens a room.** `POST /api/lessons/:lesson/game/:block { action: 'open', class_id }` (operator gate). Netlify reads the draft block, builds the **room config** (public items + answer keys + roster with initials), and creates the room by a server-to-server call to the Worker signed with `GAME_ROOM_SECRET` (HMAC, shared env var on both sides). Returns `{ room_id, code (6 digits), teacher_ticket }`.
2. **Student joins.** Phone types the code (or scans the board's QR), then `POST /api/published/game/:lesson/:block { action: 'join', code, class_id, class_token }`. Netlify runs the existing `identify()` / initials claim (`class-claims.mjs`) and returns a **student ticket**: `{ room, owner, student_id, initials, exp }` HMAC-signed. The phone opens `wss://…/rooms/:room?ticket=…`. The DO verifies the ticket; it never sees device tokens.
3. **Play.** Clients send actions; the DO reduces and broadcasts. Answer keys never leave the DO until the reveal for that item.
4. **Fold.** When the teacher ends the game (or the DO's 6 h alarm fires), the DO posts the event log to `POST /api/games/fold` (signed). Netlify writes the plays and evidence (§4) and marks the room folded. Folding is idempotent by `room_id`.

### 3.4 Clock, reconnects, fallback

- **Clock:** every message carries server time; clients keep an offset from a ping exchange on join and every 30 s. All countdowns draw from `ends_at` in server time (same idea as `liveEndsIn`).
- **Seats:** a seat is `owner`. A reconnect with a valid ticket takes the same seat, receives a full state snapshot, then deltas. Two sockets on one seat: the newest wins, the older gets "Playing on another device".
- **Board reconnect:** the teacher ticket can be reused for 6 h; refreshing the board restores everything.
- **Fallback:** if the socket cannot connect within 4 s, or drops 3 times in a minute, the client switches to HTTPS polling of the same DO (`GET /rooms/:room/poll?since=seq`, 1 s) and `POST` for actions. A small "slow connection" chip shows. School networks that block `wss` still play.
- **Late joiners** join mid-game with 0 (or the starting) score; team games put them on the smallest team.
- **Teacher controls:** start, pause, next, skip, reveal now, add 15 s, kick seat, end. On Display and from the teacher's phone (same ticket).

### 3.5 Hosting and cost

- New Worker route: `class.adam-russell.com/g/*` handled by the game-rooms Worker (the class-site Worker already serves students from that host, so school filters already allow it). Alternative: `games.adam-russell.com`.
- Durable Objects with SQLite storage run on the Workers Free plan; a class of 30 for an hour is a few thousand requests and well inside free limits. **To verify on Adam's account before Phase B** (account plan, DO enabled).
- No AI cost at runtime.

### 3.6 Solo play (no room)

Solo games (homework, or "play on your own" in class) don't open a room. The phone runs the same rules module locally and sends events to `POST /api/published/game/:lesson/:block { action: 'solo_event' | 'solo_finish' }` in small batches (every 5 events or 10 s, and on finish). Keys for solo play: Term/Quote answers are checked server-side on each batch, so keys still never ship to the phone; the client gets right/wrong back within the batch round-trip and animates optimistically only for "submitted". Crossword and find-a-word checks are per word on submit (server round-trip, ~150 ms, hidden behind the word-lock animation).

---

## 4. Learning data

### 4.1 Event and storage

```ts
GameEvent {
  seq: number; at: number; game: GameKind; play_id: string
  owner: string; student_id?: string; team?: string
  item: string            // item id within the block
  move: string            // 'answer' | 'solve' | 'guess' | 'bet' | 'hint' | 'judge' | 'describe' | 'draw' | 'decoy' | …
  response?: unknown      // cleaned (cleanResponse) answer
  correct?: boolean | null
  time_ms?: number        // from item shown to move
  extra?: Record<string, number | string | boolean>   // per kind: bet, letters_showing, hints_used, confused_with, …
  strength: 'live_solo' | 'live_team' | 'self_paced'
}
```

Blobs (store `teaching-hub-content`):

```
games/{lesson}/{block}/plays/{play_id}            { kind, mode: 'live'|'solo', class_id, room_id?, started_at, ended_at, folded }
games/{lesson}/{block}/events/{play_id}/{owner}   GameEvent[] for that player in that play   (create-only per fold; solo appends with etag)
games/{lesson}/{block}/summary/{class_id}         cached per-item and per-student summary (rebuilt on fold)
games/{lesson}/{block}/media/{play_id}/{item}     Pictionary drawings (PNG), Battles answers
```

### 4.2 Evidence

`games/core/events.ts` turns events into the same `EvidenceItem { item, tags, share, why }` shape `quiz/evidence.ts` produces, so the class evidence views, the student profile and the DU monitor read games with one added source.

- A right answer in a game counts as **"right once"** for a knowledge piece (half-green circle).
- **Mastery (full green) still needs a non-game check** on a second day (quiz, written work or organiser), because self-paced games can be looked up and team moves are shared. *Open question 2.*
- `strength` shows in every teacher view as a small tag (Live / Team / Homework).

### 4.3 Organiser boxes

New path: on fold, for each missed Term or Question whose `kp` piece is on an organiser line in the student's unit sheet, `organiser_practice/{class}/{owner}` sets that line to box 1, due tomorrow (etag write, same as the `review` action). Right answers never move boxes up (only organiser practice does that).

### 4.4 Markbook

Off by default. The game's Results panel has **Add to markbook**: one column ("Connections: Gothic wall", accuracy %, or points rank for wager) via `addColumnWithMarks`. The teacher chooses which.

### 4.5 What each game shows the teacher

Every game's Results panel (in the block's teacher view and on the class Results page) has three parts: **per item** (accuracy, median time, common wrong answers), **per student** (accuracy, items missed, strength), and the game's own insight:

| Game | Its own insight |
|---|---|
| Crossword | Clues solved without hints vs with hints; hint ladder use per student |
| Find-a-word | **Decoy hits**: which wrong term each student circled for which clue (confusion pairs) |
| Jeopardy | Accuracy by category × value (where each student's ceiling is) |
| Wheel | **Letters needed** per student per quote (quote recognition strength), and explain-question accuracy split by fast vs slow solvers |
| Team match | Holder accuracy, and **false taps** (a non-holder tapped their option believing it right: a misconception) |
| Points rush | First-try vs come-back accuracy (did they fix it the second time?) |
| Battles | The comparative-judgement scale (existing), plus each student's **judging accuracy** (agreement with the final scale) |
| Wager | **Calibration**: per student, confidence (bet ÷ points held) against accuracy; flags confident misconceptions (wrong answers backed by big bets across the class) |
| Connections | **Confusion pairs**: tiles most often grouped together wrongly; groups solved order |
| Articulate | Per describer: terms described successfully, passes, banned-word buzzes; plus the after-round check (§6.10) |
| Pictionary | Guess speed per student per prompt; drawings kept in a gallery |
| Who said it | **Speaker confusion matrix**; fake-quote catch rate and false-alarm rate (real quotes called fake) |

Every insight view has the reduced, anonymous version for Display ("Most mixed up: *simile* and *metaphor*"), never naming students.

---

## 5. The shared shell

### 5.1 Common screens

- **Lobby (board):** game title card animating in; huge room code and QR; joined students arrive as initials chips that fly into place (reusing the live-quiz shape swarm idea, now pushed by socket, no batching delay); team columns for team games with **auto-balance** (random, or mixed by recent accuracy from evidence) and drag to move; Start.
- **Lobby (phone):** code entry with a 6-box numeric field, then initials claim (existing flow), then "You're in" with your team colour and a gentle idle animation.
- **Countdown ring:** server-clock ring that drains, turns warm at 10 s, pulses at 5 s; phones show a thin bar.
- **Reveal:** answer distribution bars grow from zero, the right answer lifts and glows, wrong answers dim; per-phone personal result ("Right · +120") slides up.
- **Leaderboard:** top 5 (or teams) with FLIP reordering, score counters that roll up, and arrows for climbers. Full ranks only on the teacher's view; the board shows top 5 and "everyone else" never named below that. Students see their own rank only.
- **Podium (end):** top three rise in sequence, confetti burst, then the class summary ("Class got 78% · hardest: *zeugma*").
- **Pause:** frosted overlay on board and phones.

### 5.2 Motion system (`games/motion/`)

- WAAPI and CSS only (no animation library, matching the codebase). Spring-like easings via CSS `linear()` easing curves generated in `motion.ts`, with a cubic-bezier fallback for Safari versions without `linear()`.
- Transform and opacity only; `will-change` set during, removed after. Board animations budgeted to 16 ms frames on a school laptop driving a projector.
- `startViewTransition` for screen-to-screen changes on the board where supported.
- Confetti: one `<canvas>`, ≤ 150 particles, 1.8 s, then removed.
- **Reduced motion** (`prefers-reduced-motion` or the board's own "Calm" toggle): every move becomes a 150 ms crossfade, no confetti, no wheel physics (the wheel jumps to the result with a single highlight), counters set instantly.
- Uses `packages/design-kit` tokens. Game colours (team colours, Connections difficulty colours, Wheel segments) are added as **named tokens** in the design kit, not hard-coded hex (the live-quiz shapes' hex colours move to tokens at the same time).

### 5.3 Sound (`games/sound/sfx.ts`)

- WebAudio synthesis, no audio files (extends the existing `classroom-tools/sound.ts` chime): tick (last 5 s), lock-in, right, wrong, reveal swell, wheel clicks (rate follows wheel speed), letter ding, buzzer, fanfare, and a points whoosh.
- **Board only** by default; phones silent unless the student turns sound on. One mute on the board (remembered per device). `primeSound()` on the first teacher tap so browsers allow audio.

### 5.4 Accessibility

- Every board element has text, not colour alone (Connections groups show their label; teams have names and patterns).
- Phone controls are real buttons with labels; keyboard play on laptops (arrow keys in crossword and find-a-word, Enter to submit).
- Text sizes respect the student's zoom; the phone layout never scrolls sideways (`scrollWidth === innerWidth`).

---

## 6. The twelve games

Each entry: **content**, **solo**, **live**, **motion highlights**, **data**, **edge cases**.

### 6.1 Crossword

- **Content:** 6–30 Terms. Each picks which clue to use (definition, example or quote). `generators/crossword.ts` places words (seeded backtracking, maximise crossings, fit 15×15 or smaller, report words that wouldn't fit). Teacher can regenerate (new seed) or lock a layout.
- **Solo:** grid + clue list; tap a clue or cell; type on the phone's keyboard (hidden input) or laptop. **Check word** on submit; **hint ladder** per clue: reveal a letter → reveal the word's first letter in every crossing → reveal the word. Finish screen: time, hints, clues solved clean.
- **Live (race):** everyone solves their own copy; the board shows a race wall: each student's initials and a progress bar of words solved (not which words), with the class's "first to solve each clue" ticker.
- **Motion:** letters drop into cells; a solved word sweeps a highlight along its cells and locks; crossings shimmer when both directions are solved.
- **Data:** per clue: solved, hints used (0–3), time. Strength `self_paced` (solo) or `live_solo` (race).
- **Print:** grid and clues, answer key on a second page for the teacher.
- **Edge:** words with spaces or hyphens are stored without them and shown with the space count in the clue ("(5, 4)").

### 6.2 Find-a-word

- **Content:** 6–20 Terms, each with one clue (example clues preferred: "*The wind whispered through the trees*" → PERSONIFICATION). Optional **decoys** per clue (a plausible wrong term placed in the grid, e.g. METAPHOR beside SIMILE). Optional **hidden message**: a short quote or term spelled by the leftover letters, read left to right, top to bottom, with a final question about it. `generators/wordsearch.ts` places words in 8 directions (directions limited for younger classes), fills with letters weighted so the hidden message is exact and no accidental extra copies of answer words appear.
- **Play:** no word list. Clue list only. Drag (touch or mouse) across letters to select; the selection is checked against the **active clue** (tap a clue first) or against all clues.
  - Right term for the clue: word locks in colour, clue ticks.
  - **Decoy** for that clue: the selection shakes and shows "That's a real word in here, but not this one"; logged as a decoy hit with `confused_with`.
  - Hint ladder: first letter → length → highlight the row/column it's in.
- **Hidden message:** when every word is found, the remaining letters light up in order, assemble into the message, and the final question appears (who said it, or what technique it shows).
- **Live (race):** as crossword.
- **Motion:** selection rubber-bands under the finger; locked words get a hand-drawn-style loop (SVG stroke animation); the leftover letters lift out of the grid and fly into a line for the message.
- **Data:** per clue: found, hints, time, decoy hits with which decoy. Message question answered right/wrong.
- **Print:** yes (clues, no word list), answer key separate.

### 6.3 Jeopardy

- **Content:** 3–6 categories × 3–5 values (100–500). Each tile is a Question (any auto-markable kind) or a Term (typed answer). 1–2 tiles flagged **Double**; one optional **Final** question.
- **Live only.** Teams of 2–6 (auto-balanced). Team whose turn it is picks a tile **on their captain's phone** (captain rotates each turn) or the teacher taps it on the board.
  - The clue zooms full-screen on the board. **Every student on every team** answers on their phone within the timer.
  - Team score = tile value × fraction of that team's members correct (rounded to 10). The picking team gets ×1.5 on their fraction (reward for choosing).
  - **Double:** the picking team's captain wagers up to their score before the clue shows (rules shared with Wager, §6.8).
  - **Final:** every team wagers, everyone answers, reveal team by team.
- **Motion:** the board flips on with tiles cascading in; the chosen tile zooms to full screen; used tiles dim to the team colour that won most of it; score counters roll.
- **Data:** per student per tile, `live_solo` (they answered alone on their phone). Insight: accuracy by category × value.
- **Edge:** a team with nobody answering scores 0; absent students don't drag down the fraction (only connected members count).

### 6.4 Wheel of Fortune

- **Content:** 3–8 **puzzles** (Quotes or short key lines, ≤ 60 letters), each with a category ("Quote: Act 2"), a **letter question bank** (Questions or Terms from the unit) and one **explain question** (what the line shows, which technique, who said it).
- **Live only.** Teams of 2–6 take turns.
  1. **Spin** (team captain's phone flick, or board tap): the wheel spins with real physics, landing on a value (100–1000), **Lose a turn** or **Bankrupt** (round score only).
  2. **Earn the letter:** a letter question goes to **everyone on that team's phones**. If at least half answer right, the captain calls a consonant (phone keyboard of unused letters). Each copy is worth the spin value. Vowels cost 250 and need no question.
  3. **Private solving, any time:** every student in the room, on any team, can open **Solve** on their phone and type the puzzle. A wrong solve locks that student's solve box for 20 s. The first correct solve wins the round's points for their team; other students' later correct solves still count for their data (§ below) until the reveal.
  4. When the puzzle is solved (or all letters shown), **everyone** answers the explain question.
- **Data (the reason this game exists):**
  - **Letters needed:** for every student, the number of letters showing (and % of the puzzle) at their **first correct private solve**, or "not solved". Over a unit this is a per-student, per-quote recognition score shown as a heat strip on the teacher's view.
  - Letter-question answers per student (`live_solo`).
  - Explain-question answers per student, shown split by "solved early" vs "solved late or not".
- **Motion:** the wheel is SVG with segments in token colours, spun by an angular-velocity simulation with friction and a pointer that clicks against pegs (sound rate follows speed); letters turn over on the puzzle board one at a time (3D flip, staggered); the solve moment sweeps light across the whole board.
- **Edge:** puzzles are normalised to A–Z for the board; punctuation and apostrophes show pre-filled. A student who has the quote in front of them solves at 0 letters; this shows as an outlier (time < 3 s and 0 letters) and is excluded from the recognition score.

### 6.5 Team match (own Quizlet Live)

- **Content:** 12–40 items whose answers are short (Term ↔ definition/example, Quote ↔ speaker, Question MC). Needs at least 12 distinct answers.
- **Live only.** Teams of 3–4. Each round, every team gets the **same question on all members' phones**; the team's answer options (12 per team) are **split across members' phones**, so only one member holds the right answer. Talk is the game.
  - The holder taps it: the team advances one step on the board's race track.
  - **Any wrong tap by any member sends that team back to 0** (as in the original genre) — configurable to "back 3" for kinder play.
  - First team to the end (12 by default) wins; play continues for places.
- **Data:** each tap is an individual event: holder right/wrong, and **false taps** by non-holders with what they tapped (they believed their option was the answer: a misconception). All taps are `live_team` (the team talks before anyone taps), so the insight centres on false taps rather than accuracy.
- **Motion:** board race track with team tokens sliding forward on springs, a crash-and-rewind animation on a reset; phones flash green/red for the whole team at once.
- **Edge:** a member disconnects: their options redistribute to the rest of the team within 1 s.

### 6.6 Points rush (own Gimkit, minus the gimmicks)

- **Content:** 10–60 items (Questions, Terms).
- **Live or solo.** Each student gets their own stream of questions on their phone, as fast as they can answer, for a fixed time (5–15 min).
  - Right: + points × multiplier. Wrong: no loss, and that item **comes back** 3–6 questions later (in-game spacing) until answered right.
  - **Upgrades** (between questions, a 2-tap shop, max 3 kinds): *Multiplier* (+1 ×), *Streak bonus* (bigger reward for 3 in a row), *Insurance* (next wrong answer keeps your streak). All three reward answering more and better. No sabotage, no cosmetics, no buying hints.
  - **Class goal:** the board shows a single bar for the whole class's total toward a target the teacher sets, and the top 5 race.
- **Data:** per item: first try right/wrong, number of tries until right, time. Insight: first-try vs come-back accuracy. Strength `live_solo` (live) or `self_paced`.
- **Motion:** points burst from the answer button to the score; the class bar fills in smooth chunks with milestones (25/50/75%) triggering a board fanfare.

### 6.7 Short-answer battles (own ShortAnswer)

Built **on the existing comparative judgement block** (`blocks/comparative-judgement/`, `_shared/cj-maths.mjs`): same pool snapshot, same anonymity rules (D3, D4, D19 of that spec), same Bradley–Terry fit. Battles is a live game skin over it, not a second engine.

- **Content:** one short-answer prompt (or point at an existing question, as CJ does), a criterion, optional chips, optional calibration pair.
- **Live.**
  1. **Write** (timer, 2–8 min) on phones. Word count and timer on the board; the board shows a "writing" pulse per student, never text.
  2. **Battle rounds:** each student's phone shows two anonymous answers (never their own); tap the better one. The board shows the round count and a live "judgements made" counter.
  3. **Spotlight** (teacher button, any time): the board shows the most contested close pair as Answer A vs Answer B for class talk (CJ D17).
  4. **Results:** the board shows the top 3 answers anonymously with the chips that won most; each student's phone shows their **judging score** (agreement with the final scale) and, if CJ's "show third" is on and the scale is reliable, their third.
- **Points:** judging points for agreeing with the final consensus, so the game rewards good judgement, not popularity of one's own answer.
- **Data:** the CJ scale and reliability (existing), written answers to To mark / AI marking (existing paths), plus judging accuracy per student.
- **Edge:** classes without a list can't play (CJ D23). Fewer than 6 answers: the game says "Need at least 6 answers to battle" and offers Spotlight only.

### 6.8 Wager

- **Content:** 5–15 Questions (MC or true/false best; short answer allowed). Distractors must be real misreadings (no-obvious-answers rule).
- **Live only**, individual (team variant later).
- **Rules (defaults, all editable):**
  - Everyone starts with **100 points**.
  - Each question: answer first, then bet (so the bet is confidence in *your* answer). One timer covers both (default 30 s).
  - **Minimum bet 10**; maximum = all your points. No answer = you lose the minimum bet.
  - **Pot** = every point bet on wrong answers (and minimum bets from no-answers).
  - **Right answers win:** their bet back + a **house bonus of half their bet** + a **share of the pot in proportion to their bet**.
  - **Nobody right:** the pot **rolls over** to the next question ("Jackpot: 840"), shown on the board.
  - **Rescue:** anyone under 10 points at the start of a question is topped up to 10 (marked so it doesn't distort calibration).
  - **Final question:** **All in** is optional; the house bonus doubles.
  - Winner: most points at the end; podium.
- **Board:** the question and options; once answers close, the **pot fills** as bets are revealed on a big counter, options show the total points riding on each; reveal: the wrong stacks collapse into the pot, the pot splits and flies to the right side's bettors.
- **Phone:** answer buttons, then a bet slider snapping to 10s with quick chips (Min / ¼ / ½ / All in), current points, and after reveal: "+184 (bet 80, bonus 40, pot share 64)".
- **Data:** per student per question: answer, right/wrong, bet, points held, **confidence = bet ÷ points held**. Insight: per-student calibration plot (confidence bands × accuracy), class flags for **confident misconceptions** (a wrong option that drew ≥ 30% of the points on a question), and individual hypercorrection moments (big bet, wrong) the teacher can revisit.
- **Edge:** rescued players' bets are excluded from calibration until they rebuild above 50 points.

### 6.9 Connections wall

- **Content:** one or more walls; each wall = 4 Groups × 4 tiles, difficulty 1–4 (colour tokens: four distinct game tokens, not copied from any other product), a `why` per group shown on solve. Red herrings are the point: a tile that could fit two groups is encouraged and the editor warns when no tile could plausibly fit elsewhere.
- **Solo:** 16 shuffled tiles; select 4, **Submit**. Right: the row slides to the top in its colour with its label and why. Wrong: shake; "One away" when 3 of 4 belong together. **4 mistakes** allowed (editable). Shuffle and deselect buttons. Out of mistakes: remaining groups reveal one by one.
- **Live (race):** everyone plays their own wall; the board shows each student's initials with four small group slots filling (colour only, never which tiles), mistakes left as dots, and a "first to solve the purple group" ticker. Teacher can switch the board to **Class wall**: the most common wrong guesses shown as tiles linked by lines (anonymous), for discussion afterwards.
- **Motion:** tiles lift on select; a correct group's tiles fly together into a row; wrong guesses shake and drop a mistake dot.
- **Data:** every guess (4 tiles), right/wrong, one-away. **Confusion pairs**: each wrong guess adds 1 to every pair of tiles in it that belong to different groups; the teacher sees the top pairs ("*sibilance* with *assonance*: 14 times"). Groups solved order and mistakes per student.
- **Print:** tile grid to cut up, with group answers on a teacher page.

### 6.10 Articulate

- **Content:** a deck of Terms, each with up to 5 **banned words** (Ann can draft; editor warns if a banned word is the term itself or a substring).
- **Live**, teams take turns. Each turn: one **describer** (rotates through the team in order).
  - Describer's phone: the card (term + banned words), **Got it**, **Pass** (max 2 per turn). 30–60 s per turn; describe as many cards as possible.
  - Board: team, timer, cards got this turn (term shown only after it's got or passed), and a **Buzz** button the teacher (or the other team's captain on their phone) presses when a banned word is said.
  - Team members guess **aloud** (it's a talking game).
- **After the round (optional, default on):** a 3–5 item **quick check** goes to every phone: each term from this round with "pick the right definition" or "which example shows it". This is what turns a talking game into individual data.
- **Motion:** cards slide off the describer's phone up toward the board feel (and a matching card lands on the board); buzz flashes red and stamps the card.
- **Data:** per describer per term: got / passed / buzzed, seconds (`live_team`). Quick check per student per term (`live_solo`).

### 6.11 Pictionary

- **Content:** a deck of prompts: Terms with `draw_prompt` (e.g. *pathetic fallacy*), Quotes, or scene descriptions. Each has accepted answers (term, key words of the quote).
- **Live.** Each turn a drawer (rotating, from a team or the whole class) gets the prompt on their phone and draws on a **phone canvas** for 60–90 s.
  - **Drawing surface:** a purpose-built canvas in `kinds/pictionary/canvas.ts` (pointer events, pressure-free strokes, 4 colours, 2 widths, undo, clear). Not Excalidraw: it is too heavy for a phone controller and has no stroke sync; a lean canvas keeps strokes small.
  - **Strokes stream live:** points are simplified (Ramer–Douglas–Peucker) and sent every 50 ms through the room; the board redraws them smoothly with the same timing, so the class watches the drawing happen.
  - **Everyone else guesses on their phones** (typed). A guess that matches turns that phone green ("Got it! +points") and is hidden from others; the board shows initials ticking in as people get it. Near-misses (one key word right) show "Close!" to the guesser only.
  - Points: guessers by speed; the drawer by how many got it.
- **Gallery:** each drawing is saved as a PNG (`games/…/media/`) with its prompt; the teacher can show "All our drawings of *irony*" afterwards, or add one to a lesson.
- **Data:** per guesser per prompt: got it, seconds, number of guesses (`live_solo`). Drawer: how many got it.
- **Edge:** a drawer who writes the answer in letters: the teacher's **Disqualify drawing** voids the round. Drawers with no phone: the teacher can be drawer from the laptop.

### 6.12 Who said it?

- **Content:** a cast (2–8 characters, each with a name and an optional image or emblem) and 8–30 Quotes, each real (speaker set) or **fake** (`why_fake` required: what makes it wrong for this text: wrong voice, wrong idea, wrong time).
- **Solo:** quote card; choose a speaker from the cast or **Nobody: it's fake**. Instant feedback with the source (act/scene/chapter) or the `why_fake`.
- **Live:** board shows the quote typed on with a typewriter reveal; phones show the cast; timer; reveal shows the class distribution across characters, then the answer. Points for speed and accuracy, double for catching a fake.
- **Motion:** cast portraits fan in as a hand of cards on the phone; on reveal, the right character card flips forward on the board with the quote's source.
- **Data:** per student per quote. **Speaker confusion matrix** (true speaker × chosen speaker). **Fake catch rate** (fakes called fake) and **false-alarm rate** (real quotes called fake), shown together as one "ear for the text" score per student (sensitivity minus false alarms).
- **Print:** quote list with tick boxes for each character and "fake".

---

## 7. Teacher experience

- **Editor:** each kind has a focused editor in the block (items table with inline edit, drag to reorder, tags column, "Build from this unit", "Ann drafts", live preview of the board at 16:9 and the phone at 390). Publish issues list empty clues, groups with fewer than 4 tiles, Wheel puzzles over 60 letters, fakes without `why_fake`, untagged items (warning, not blocking).
- **Run live:** from Display (Game lesson board or the block in any lesson): **Open room** → lobby → Start. Controls are docked bottom-right, auto-hide after 3 s of no mouse movement, return on movement or keypress. Keyboard: Space next/reveal, P pause, + add 15 s, M mute, Esc controls.
- **Set as homework:** opens the game for solo play until a close date (same pattern as quiz `closes_at`), with "best try" and "latest try" both kept.
- **Results:** per §4.5, in the block's teacher view and as a section on the class Results page.

## 8. Edge cases (cross-game)

- **No class list:** solo games still play (device owner, as quizzes do); live games require a list (seats need identity for per-student data and reconnects).
- **Two rooms for the same block:** allowed (two classes at once); each has its own code and play id.
- **Teacher closes the laptop:** the room keeps running for 6 h; the teacher can resume from any device with the operator gate.
- **Room dies unexpectedly (DO restart):** state is restored from DO SQLite on the next connection; events already logged are not lost.
- **Fold fails (Netlify down):** the DO retries with backoff from its alarm for 24 h and the teacher's Results panel shows "Results still arriving".
- **Phones at 320 px:** layouts are built for 390 and checked at 320 (no sideways scroll, actions reachable).
- **Projector at 1024×768:** board layouts degrade to fewer columns without overflow.
- **Privacy:** boards and Display show initials only in lobbies and leaderboard top 5; no full names on any projected screen; game content and examples in the repo use invented people and texts.

## 9. Build phases

One branch per phase group, phases as commits (Adam: minimise PRs). Proposed three PRs:

**PR A: foundations and solo games**
- Phase 0: clickable mockups of all twelve boards and phone controllers (`docs/mockups/games/`), one design language. **Adam signs off before Phase 1.**
- Phase 1: `game` block type and plumbing, item shapes, Build from this unit, Game lesson arcade, events, solo endpoint, evidence fold, organiser box-1 path, Results panel shell.
- Phase 2: motion and sound systems, design tokens for game colours.
- Phase 3: crossword, find-a-word, Connections, Who said it (solo + print).

**PR B: game rooms and live games**
- Phase 4: `workers/game-rooms` (DO, tickets, fold), `room-core` reducer, client with fallback, shell (lobby, teams, countdown, reveal, leaderboard, podium). Live race modes for the PR A games.
- Phase 5: Wager, Jeopardy, team match, points rush.
- Phase 6: Wheel of Fortune.

**PR C: talk, draw, write**
- Phase 7: Articulate (+ quick check), Pictionary (canvas, stroke streaming, gallery), Battles (live skin over comparative judgement).
- Phase 8: Ann drafts for game content (priced, confirmed per run).

## 10. Testing

- **Pure modules (Vitest / node:test):** crossword and word-search generators (seeded; every word placed or reported; no accidental duplicate answers; hidden message exact), every kind's rules module (scoring, wager payout including rollover and rescue, team-match resets, Jeopardy fractions, Wheel letter earning and letters-needed), item answer checking, event → evidence conversion, room-core reducer (join, reconnect, kick, late join, pause, end, fold payload).
- **Server (node:test, in-memory store):** open/join/fold endpoints, ticket signing and expiry, keys never in student payloads (assert on every broadcast type), fold idempotency, organiser box-1 writes, markbook push.
- **Worker:** `room-core` is tested in Node; the DO wrapper gets a small test with Wrangler's local runtime (connect, reconnect, hibernation wake, fallback poll).
- **Browser (Playwright):** one teacher + 4 student contexts per live game playing a full game; solo games played to the end at 390 and 1280; reduced-motion run; R4 checks on every phone form (code entry, solve box, bet slider, guess box).
- **Load:** 35 simulated sockets in one room for 10 minutes; broadcast p95 < 250 ms locally.
- **Walk:** each game walked on the live site at desktop and 390, and on a real phone and a projector-sized board before it's called done. Safari walk listed as a separate check.

## 11. Open questions for Adam

1. **Hosting the rooms:** OK to add a Cloudflare Durable Object Worker on `class.adam-russell.com/g/*` (free plan expected to cover it; checked on your account before Phase 4)?
2. **Mastery from games:** games count as "right once" for a knowledge piece but not for full mastery. Agree?
3. **Team match reset:** back to 0 on any wrong tap (genre default) or back 3 (kinder)? Default proposed: back to 0.
4. **Leaderboards on the board:** top 5 shown, everyone else unnamed. Or teams only, never individuals?
5. **PR split:** three PRs (A, B, C) as above, or one long-running branch?

## 12. Not in this build

- Team Wager, tournament brackets across lessons, cross-class leaderboards.
- Student-made games (students authoring Connections walls for each other): a strong follow-up, built on the peer-built quiz pattern.
- Voice guessing in Articulate (speech recognition).
- Replays of a whole live game.
