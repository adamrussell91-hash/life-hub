# Fleet week — design

Date: 19 November 2026
Status: design agreed in chat with Adam, 19 Nov. Written spec awaiting his review. Nothing built.
Mock: a playable sketch shown in chat (not in the repo). It is the reference for look and motion: an aerial sea with small islands, drawn ships, shells, fire and smoke, a sunrise report and fog on the reveal. All examples here (students, texts, answers) are invented.

## Purpose

A week-long retrieval game for English. Two anonymous teams of two hunt each other's hidden fleet on a grid where **every square is a question**. Firing at a square means answering it from memory, typed. It is an active-recall and spaced-retrieval study tool that runs Monday to Friday beside ordinary lessons, with the reveal on Friday.

It is the fourteenth game kind (`fleet_week`) in the Game lesson type (`docs/superpowers/specs/2026-11-11-game-lessons-design.md`), and the first that is neither live in a room nor solo. It adds a third play mode, **campaign**.

## Adam's calls (19 Nov)

- The grid is the knowledge: rows and columns mean something and each square holds a question about that intersection.
- "Cognitive glitter": a confidence bet, a partner's damage report, missed squares that return, sinking by recall, and calibration at the reveal.
- Everyone is anonymous, partner included, until Friday.
- Daily salvo, resolved overnight. Nobody waits on anyone else's turn.
- The teacher builds the grid. Players place their own ships on Monday.
- The damage report must show the question as well as the partner's answer, or the partner cannot judge it.
- Call signs are scrambled per viewer, so students cannot work out who is who by comparing screens.
- A fast "next turn when everyone has finished" mode, so a whole game fits inside one lesson.
- A visible signal on the student's screen when something needs them: a hit, a new report, their turn.
- Cheat-proofing leans on the quiz writing watch.

## Out of scope

- Runtime AI during play (house rule for all games). Ann may draft grid content in the editor, priced and confirmed first.
- Push notifications, email or SMS. Students have no accounts; signals are in-app only.
- Students writing the questions.
- Islands as playable terrain. They are scenery on grid corners and never block a square.
- Cross-class matches, tournaments, team sizes other than two (three only to absorb an odd class).

---

## 1. Rules

### 1.1 The grid

- 5 × 5. The teacher labels the five columns and five rows (for example characters across, themes down).
- Each square holds **two question variants** with the same tags. A player is given the variant their partner and rivals were not given where possible, so answers cannot be passed around by square name.
- Questions are short-answer `Question` items (§2.3 of the game lessons spec), marked by `markResponse` with keys held server-side.
- Each ship carries a **recall line**: a key quote or term used for the sinking blow (§1.5).

### 1.2 Teams and matches

- The app pairs the class into teams of two and pairs teams into matches, at random or mixed by recent accuracy (the existing auto-balance). An odd class makes one team of three; an odd number of teams makes one three-way match avoided by forming a team of three first, then, if still odd, one team plays a **ghost fleet** (a fleet with no players that only receives fire).
- A team's fleet is four ships covering eight squares: one of three, two of two, one of one. In a team of two, one player places the three and the one, the other places the two twos. The app assigns which.

### 1.3 The week (campaign clock)

| Phase | What happens |
|---|---|
| **Placement** | Each player hides their two ships on their own team's chart. Ships may not overlap or touch a partner's ship's squares. Unplaced ships are placed by the app at the cut-off. |
| **Firing rounds** | Each player has **four shots** per round. A shot: pick a square → choose **Sure** or **Unsure** → only then the question appears → typed answer, 60 seconds, one try. |
| **Report** | After each round closes, every player gets a report of what landed (§1.4). |
| **Reveal** | Fleets, real names, the winner and each player's calibration. |

Two clocks drive the same phases (§3.2):

- **Week mode:** placement is Monday; firing rounds are Tuesday, Wednesday and Thursday, each closing at the teacher's cut-off time (default 8:00 pm); reports are ready the next morning; the reveal is Friday.
- **Lesson mode:** a round closes when every connected player has finished, or when the teacher taps **Next round**, or when a round cap (default 4 minutes) runs out. The report plays at once. Placement is round 0 (cap 2 minutes). The teacher sets the number of firing rounds (default 5). This is for testing and for a single-lesson game.

### 1.4 What a shot does

Resolved when the round closes, never before.

| Answer | Square holds a ship | Result |
|---|---|---|
| Right | Yes | **Hit.** Pending until the partner files a damage report (§1.6). |
| Right | No | **Miss.** Counts as a right answer in the student's results. |
| Wrong | Either | **Dud.** The shot is wasted and the square stays unknown. The square **returns** to that player two rounds later with the other variant. |
| No answer in time | Either | Dud, as above. |

Confidence:

- **Sure and right on a ship:** double damage.
- **Sure and wrong:** the other team gets a **sonar ping**: one row or column of the firing team's chart that contains a ship square is named to them.
- **Unsure:** normal damage, no penalty.

A square a team has already hit or missed cannot be fired at again by either teammate. A dud square can, by either teammate.

### 1.5 Sinking

When every square of a ship is hit, the player who landed the last hit gets the ship's **recall line** prompt at their next visit: type the quote or term from memory, under the writing watch. Right: the ship is sunk for bonus damage. Wrong: the ship is still sunk at the next report (so matches cannot stall) with no bonus.

### 1.6 Damage report

Each hit creates a damage report owed by the firing player's partner. The partner sees:

1. **the question** (the exact variant that was asked),
2. **the answer their partner typed**, and
3. a one-line box: why is that answer right?

The partner does not see the stored model answer. Their line is typed under the writing watch and saved as a short written answer.

- Filed within one round: the hit counts in full.
- Not filed within one round: the hit sticks at half damage.
- The teacher can reject a weak report from the control room; it returns to the partner once.

### 1.7 Scoring and winning

Damage: hit 2, sure hit 4, half-credit hit 1, sink bonus 2, returning-square hit +1. The team that has dealt more damage at the reveal wins; a tie is broken by ships sunk, then by first-try accuracy. A fleet sunk outright ends that match early and both teams keep firing at a practice chart so nobody loses retrieval time.

### 1.8 Anonymity and scrambled call signs

- No real names or initials appear on any student screen until the reveal.
- Each player has a **different call sign in every viewer's eyes**. Kestrel on their own screen may be Captain Pike on their partner's screen and Commander Lark on a rival's. A call sign is fixed for that viewer and subject for the whole game, and unique within one viewer's screen.
- Call sign = rank + name drawn from fixed lists, chosen by `HMAC(match_secret, viewer_owner + subject_owner)`. The match secret never leaves the server; the server sends each player only their own view.
- Reports, telegrams and damage reports always use the viewer's own set of call signs.
- The teacher's control room shows real names. The board reveal shows real names (class list display form, as other boards do).

### 1.9 Cheat-proofing

| Risk | Measure |
|---|---|
| Asking a friend for the answer to a square | Variants per square; nobody knows who their partner or rivals are; call signs differ on every screen |
| Looking it up | The question appears only after the shot is committed; 60-second server-held timer; one try |
| Pasting an answer | `watchWriting` with the check on `block`; every answer keeps its `WritingLog` |
| Watching a rival's result and copying | Nothing resolves until the round closes |
| Telling the other team where ships are | Nobody knows who the other team is |
| Reloading to get a new question or more time | The question and its deadline are fixed server-side at commit; a reload shows the same question and the same clock |

The control room flags paste attempts, time away from the page and answers that arrive in one burst, each with its typing replay. The teacher can void a shot (it becomes a dud that does not return).

## 2. Signals

Students need to know something is waiting without opening the game.

- **Where:** the student now strip (`apps/teaching/src/student/now-strip.ts`) and the Game lesson's card on the arcade page. Both read one small endpoint (`signals`, §3.3) when a student page loads and on focus.
- **Anchor badge:** an anchor glyph on the now strip and the game card. It glows and carries a count when anything is waiting.
- **Toast, once per event:** slides in on any student page with the label "Fleet week" and one line. Tapping it opens the game at the right screen.

| Event | Toast line | Motion |
|---|---|---|
| A round opens (your turn) | "Four shells ready." | A small ship steams across the top of the page |
| A report is ready | "Dawn report is in." | Anchor glows |
| One of your ships was hit or sunk | "You've been hit." | A short flash and smoke from the anchor |
| You owe a damage report | "Your partner hit something. Confirm it." | Anchor glows |
| The reveal is open | "The fog is lifting." | Anchor glows |

- Each event is shown once per device (`seen` ids kept server-side per owner). Reduced motion: the toast fades in with no ship, flash or smoke.
- In lesson mode the game page itself polls (§3.2), so the same events show inside the game without a page load.

## 3. How it runs

### 3.1 State and storage

Netlify Blobs, store `teaching-hub-content`, beside the existing game data:

```
games/{lesson}/{game_id}/campaigns/{campaign_id}                 config: class, mode, cut-off, rounds, matches, teams, secret
games/{lesson}/{game_id}/campaigns/{campaign_id}/fleet/{owner}   that player's ship placement (create-only)
games/{lesson}/{game_id}/campaigns/{campaign_id}/shots/{round}/{owner}   committed shots for a round (etag append)
games/{lesson}/{game_id}/campaigns/{campaign_id}/resolved/{round}        the resolved round (create-only)
games/{lesson}/{game_id}/campaigns/{campaign_id}/reports/{owner}         damage reports and recall lines
games/{lesson}/{game_id}/campaigns/{campaign_id}/seen/{owner}            signal ids already shown
```

Events fold into the existing `games/…/events/{play_id}/{owner}` shape so Results and evidence read them with no new reader.

### 3.2 Resolving a round

- `resolveRound(config, fleets, shots, reports, round) → { board states, reports, pings, events }` is a **pure function** in `apps/teaching/src/games/kinds/fleet-week/rules.ts`, bundled to `_shared/game-rules.mjs` like every kind.
- There is no scheduled job. A round resolves the first time any request arrives after it has closed; the result is written create-only, so two requests racing produce one resolved round.
- **Week mode** closes a round by the clock (cut-off time in the class's time zone).
- **Lesson mode** closes a round when all connected players have spent their shots, on the teacher's **Next round**, or at the cap. Phones poll the campaign every 2 seconds in lesson mode; week mode loads on open and on focus only.

### 3.3 Server

- `netlify/functions/_shared/fleet-week.mjs`: campaign actions over the store.
- Teacher (`/api/lessons/:lesson/game`, operator gate): `campaign_open` (class, mode, cut-off, rounds, balance), `campaign_state` (control room, real names), `campaign_next` (lesson mode), `void_shot`, `reject_report`, `campaign_reveal`, `campaign_close`.
- Student (`/api/published/game/:lesson`, existing `identify()` and initials claim): `fleet_state` (that player's view only, with their call signs), `fleet_place`, `fleet_commit` (square + sure → returns the question and deadline), `fleet_answer` (answer + `WritingLog`), `fleet_report`, `fleet_recall`, `signals`.
- Answer keys, the other team's fleet, the match secret and real names never appear in a student payload before the reveal. The two-step `fleet_commit` → `fleet_answer` is what keeps the question hidden until the shot is committed.

### 3.4 Client

`apps/teaching/src/games/kinds/fleet-week/`: `schema.ts`, `rules.ts` (pure), `editor.ts` (grid editor), `campaign.ts` (phone: place, fire, report, recall), `sea.ts` (the rendered chart: procedural sea and islands seeded per match, ships, particles), `board.ts` (reveal), `control-room.ts` (teacher), `signals.ts` (anchor badge and toast). Registration follows the Answer chain pattern in `kinds/index.ts`.

Visuals follow the chat mock: aerial sea with shallows and surf, small islands on grid corners, drawn ships, shell arcs, fire and smoke on hits, a sunrise header and warming light on the report, fog over both fleets until the reveal. Canvas for the sea and particles; transform and opacity only for DOM motion; a full reduced-motion version.

### 3.5 Edge cases

- **Never places ships:** placed by the app at the cut-off (or cap).
- **Misses a round:** those shots are lost. In lesson mode a disconnected player does not hold up the round.
- **Partner never reports:** hits stick at half damage after one round.
- **Late joiner or new student:** joins the team of two with the lowest damage as a third member from the next round, with no ships to place.
- **A player leaves the class mid-week:** their ships stay; their partner fires alone.
- **Teacher ends early:** the reveal can be opened at any time.
- **No class list:** the game cannot open (teams need identity), as with other team games.

## 4. Learning data

- Every shot is one `GameEvent`: owner, item (square and variant), response, correct, `time_ms`, and `extra`: `sure`, `returning`, `on_ship`, `voided`.
- **Strength:** `self_paced` in week mode; `live_solo` in lesson mode (answered alone, timed, in class).
- A right answer is "right once" for its knowledge piece. Games never count toward mastery.
- A dud on a square whose piece is on an organiser line sends that card to box 1 (existing path).
- Damage reports and recall lines are stored as short written answers with their writing logs.
- **Results panel:** per item and per student as for every game, plus the game's own insight: a heat map of the grid by accuracy, first-try against returning accuracy per square, and **calibration** per student (how often Sure was right), with confident errors listed for the teacher.
- The board reveal shows fleets, names, the winner and the class's hardest squares. It never shows a student's wrong answer.

## 5. Teacher experience

- **Editor:** a 5 × 5 grid. Label rows and columns, fill two variants per square, give each ship a recall line. Build from this unit and Ann drafts work as for other kinds. Publish issues: empty squares, a square with one variant (warning), untagged items (warning), fewer than four recall lines.
- **Open a campaign:** choose the class, week or lesson mode, the cut-off or round cap, and how teams are balanced.
- **Control room:** every match with real names, who has fired this round, who owes a report, writing-watch flags with a typing replay, Void shot, Reject report and, in lesson mode, Next round.
- **Reveal:** run on the board, one match at a time: fog lifts, ships appear, call signs turn into names.

## 6. Failure modes (`docs/CURSOR-UI-FAILURES.md`)

- **R4 (phone inputs):** the answer box, damage report box and recall box are at least 16 px, and every target is at least 44 px. Check at 390 and 320 with no sideways scroll.
- Other entries are cited with a feature-specific check in the implementation plan once the screens are built.

## 7. Build order

1. Repo mockup in `docs/mockups/games/fleet-week.html` from the chat mock, for Adam's sign-off.
2. Schema and pure rules (`resolveRound`, call signs, scoring), with tests.
3. Server actions and storage, lesson mode first so a whole game can be tested in minutes.
4. Phone: place, fire, report, recall. Then signals.
5. Control room, then the board reveal.
6. Week mode clock, Results panel, evidence fold and organiser path.

## 8. Testing

- **Pure (Vitest):** `resolveRound` for every row of §1.4, confidence outcomes, returning squares, half-credit hits, sinking with and without the recall line, tie-breaks, ghost fleet, team of three; call signs (stable per viewer, unique per screen, different across viewers); determinism (same inputs, same output).
- **Server (node:test, in-memory store):** no key, rival fleet, secret or real name in any student payload before the reveal; `fleet_commit` fixes question and deadline across reloads; late answers rejected; resolve is idempotent under two racing requests; lesson-mode round closes on all-done, on Next round and at the cap; signals shown once.
- **Browser (Playwright):** one teacher and four students play a full lesson-mode game; paste is blocked in all three typed boxes; phone at 390 and 320; reduced-motion run.
- **Walk:** a lesson-mode game with a real class before week mode is switched on.
