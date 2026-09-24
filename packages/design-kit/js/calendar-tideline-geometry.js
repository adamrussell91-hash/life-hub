import { MOTION } from './hub-motion-engine.js';

/** Ported verbatim from docs/proposals/calendar-reference/src/tideline-ref.ts. */
export const CAL = {
  bandMs: 420, // band expand / fold. One tween of the band heights, EASE.
  acceptMs: 320, // ghost dashed -> solid
  exitMs: MOTION.exit, // dismissed ghost fades out
  enterMs: MOTION.enter, // first mount: columns rise in
  enterStagger: 30, // per column
  enterRise: 8, // px
  toastInMs: 220,
  toastRise: 6,
  toastHoldMs: 5200,
  applyAllStagger: 90, // ms between ghosts on Apply all
  saveLatencyMs: 350, // PROTOTYPE ONLY: stands in for POST /api/calendar-ghosts
  fade: { title: [14, 20], meta: [38, 46], actions: [62, 70] },
  lineBox: 15, // one title line: 12px text x 1.25 line height
  cardAt: 38, // at or above: card padding and a meta line
  twoLinesAt: 56, // at or above: title may take 2 lines (2 x 15 + meta 13 + padding 12 + border 2 = 57)
  popMs: 180, // chip popover in / out
  popRise: 4,
  popWidth: 288,
  popGap: 8
};
