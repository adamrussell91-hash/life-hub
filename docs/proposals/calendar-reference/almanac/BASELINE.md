# Almanac baseline

Recorded 24 Sep 2026 on `main` at `c0b119a8`. These results are the reference, before any Almanac UI is ported. No feature code in this pass.

## Modules

`node --test tests/unit/lead-lines.test.js tests/unit/openings.test.js tests/unit/capacity-model.test.js tests/unit/ghost-writes.test.js` exits 0. **30 passed, 0 failed**.

- `lead-lines.test.js` — 8
- `openings.test.js` — 5
- `capacity-model.test.js` — 8
- `ghost-writes.test.js` — 9

## Reference

`node docs/proposals/calendar-reference/almanac/src/build-ref.mjs` rewrote nothing (`almanac.html` and `fixture.json` unchanged). `node --test docs/proposals/calendar-reference/almanac/almanac-visual.spec.mjs`: **7 passed** against the reference.

`tests/browser/almanac-visual.spec.mjs` is a byte copy of `docs/proposals/calendar-reference/almanac/almanac-visual.spec.mjs`. It is not in `test:browser`.

## Prototype walk

Opened `docs/proposals/calendar-reference/almanac/almanac.html` from the repo (kit CSS loaded). Every motion-contract row was sampled at normal speed and again with Slow motion ×5. All 12 beads were opened, and every opening button was clicked, at both speeds.

Matched the contract:

- Mount: the tide clip grows 0 → 1198, monotonic, full at ~650ms (~3.2s at ×5; 700ms ×5). The four rails (`unsw-conferral`, `term-4`, `solo-travel`, `korea`) start ~60ms apart and only move backwards. Beads leave scale 0.4 about halfway through their row, ~40ms apart, and settle at scale 1. ×5 stretches the same sequence. Vitamin D (window pill) and the dream (dotted line) have no rail; their beads still pop.
- Popover open: opacity 0→1 and y 4→0. At ×5 that stretch is visible (~180ms → ~900ms). Every bead opens below-right of itself, inside the card, with both buttons and the module receipt (last safe day, days left, the rule's why).
- Already done: status is `done` on the click. Scale is placed at 1.25 and springs back to 1 over ~320ms (~1.5s at ×5), with a small overshoot under 1. Unbooked goes 2→1 once during the 420ms count (the digit flips early because 2 and 1 round; ×5 stretches that flip). Toast: "Marked done. The Almanac stops asking about it."
- Hold: the button disables and reads "Saving…" for ~350ms at both speeds (that wait is a timer). Then `--held` runs 0→1 over ~320ms (~1.6s at ×5) and the label becomes "Held for you both" / "Walled" / "Held". Toasts are the protect_block receipts. Newcastle's toast includes both days.
- Draft: Bob and Newcastle show the filled draft and "Draft ready for …. Nothing sent." There is no Send button. Copy reads "Copied" when the clipboard works, and "Selected" (text highlighted) when it is refused.
- Plan it with Hammond: the button stays enabled, nothing is held, toast starts "Nothing written yet."
- Reduced motion: clip width and rail `x1` are final on the first frame. Bead scale is already 1. Only opacity fades (~120ms). Popover `y` snaps to 0 and only opacity fades.

Two rows do not match:

1. **Add as task does not disable its buttons.** Both buttons stay enabled. The popover starts closing immediately and is `hidden` at ~180ms, while the prototype POST stand-in is still waiting. The dashed `is-tasked` halo and the "Written. Hammond → Tasks: …" toast appear together at ~355ms. That 350ms wait is a wall-clock timer, so ×5 does not move it. The halo and the toast do happen.
2. **Popover close at ×5 hides early.** `hidden` flips at ~200ms wall-clock while opacity is still ~0.28 and y is still ~2.9. The hide uses `setTimeout(180)`, which is not on the slowed clock. At normal speed the hide waits until opacity is 0 and y is 4.
