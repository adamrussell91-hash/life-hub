# Workout timer Start / Pause / Complete — Design

**Date:** 2026-08-08  
**Status:** Approved for planning  
**Scope:** Fitness logger session timer controls only (no rest timer, no cross-device timer persistence)

## Problem

Confirming a workout or opening a template mounts the Fitness logger and **auto-starts** the session timer. Adam is often not ready to train yet, so elapsed time drifts before the session actually begins.

## Goals

1. Logger opens in an **idle** state — timer shows `0:00` and does not tick.
2. Explicit **Start**, **Pause**, and **Complete** controls under the header timer.
3. **Finish session** remains the save/confirm path (notes, final review) and is separate from Complete.
4. Sets, weights, cable, bench, and notes stay editable in every timer state (including idle).

## Non-goals

- Rest timers, warm-up rows, PR chips
- Persisting timer state across refresh / tab close / devices (can follow later)
- Changing workout schema beyond using elapsed time for `duration_min` on Finish as today

## Behaviour

### State machine

```
idle → running ⇄ paused → completed
                 ↑___________|  (undo Complete, before Finish)
```

| State | Clock | Start control | Pause | Complete | Finish |
| --- | --- | --- | --- | --- | --- |
| `idle` | `0:00`, not ticking | **Start** enabled | disabled | **hidden** | available |
| `running` | ticks each second | disabled / hidden | **Pause** enabled | visible | available |
| `paused` | frozen | **Resume** (Start label or Resume) | disabled | visible | available |
| `completed` | frozen | disabled | disabled | **Undo Complete** | available |

Rules:

- **Mount / template / confirm:** always enter `idle`. Never set `startedAt` on mount.
- **Start / Resume:** enter `running`; begin or continue a running segment.
- **Pause:** end the current running segment; elapsed freezes. Paused wall time does **not** count.
- **Complete:** enter `completed`; stop ticking. Does **not** write the workout. Hidden until the session has been **Started at least once**; after that first Start, Complete stays available while `running` or `paused`.
- **Undo Complete:** return to `paused` (frozen elapsed preserved) so Adam can Resume again. Available until Finish succeeds.
- **Finish session:** existing confirm/save flow. `duration_min` derived from accumulated elapsed (running segments only) at Finish time. Allowed from any state, including idle at `0:00`.

### Elapsed accounting

Keep accumulated milliseconds of completed running segments plus, while `running`, `(now - segmentStartedAt)`.

```
elapsedMs = accumulatedMs + (state === 'running' ? now - segmentStartedAt : 0)
```

Do not use a single wall-clock `startedAt` from first open.

## UI

- Placement: **under the header timer** (title + elapsed remain on the first header row; control row immediately below).
- Control array: Start/Resume, Pause, Complete/Undo Complete — labels follow state table above.
- Existing **Finish session** button stays at the bottom of the logger.
- Visual language: match current `.fitness-logger` controls (compact buttons, fitness accent for active timer); disabled controls use existing muted/disabled opacity patterns.

## Architecture

Primary touch points (existing files):

| File | Change |
| --- | --- |
| `js/app/fitness-logger-controller.js` | Own timer state machine; stop auto-start on `mount`; wire Start/Pause/Complete/Undo; pass state + handlers into render |
| `js/app/render-fitness-logger.js` | Render control row; update chrome for elapsed + button enabled/labels |
| `js/app/fitness-logger-draft.js` | Keep `formatElapsed` / finish payload; map accumulated elapsed → `duration_min` on Finish if not already |
| `css/app.css` | Styles for `.fitness-logger__controls` (or equivalent) |
| `tests/unit/fitness-logger-controller.test.js` (+ render tests as needed) | Idle mount, pause accounting, Complete hidden until Start, undo Complete, Finish still works |

Timer state lives in the controller (in-memory for the mounted session). Remounting the same planned path may keep draft edits via existing draft storage, but **timer state resets to `idle`** (no persistence in this slice).

## Error / edge cases

- Double-click Start while already running: no-op.
- Complete while idle: impossible (hidden).
- Finish while idle: allowed; duration `0` or omit per existing payload rules.
- Unmount / navigate away: stop interval; drop in-memory timer state (same as today after unmount).
- Overlay chat / section switches that remount logger: return to idle clock (accepted limitation without persistence).

## Testing

- Unit: mount leaves state `idle` and does not start interval.
- Unit: Start → tick advances elapsed; Pause freezes; Resume continues from frozen value (not wall-clock gap).
- Unit: Complete hidden before first Start; visible after; Undo returns to paused with same elapsed.
- Unit: Finish still builds completed payload and invokes existing confirm path.
- Manual: open template / confirm planned workout → `0:00` until Start; edit sets while idle; Complete then add notes then Finish.

## Success criteria

- Opening a planned session or template never starts the clock by itself.
- Adam can Start / Pause / Complete (and undo Complete) as specified.
- Finish remains the only write path and still supports notes after Complete.
