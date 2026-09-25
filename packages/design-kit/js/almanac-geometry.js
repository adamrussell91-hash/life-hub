import { MOTION } from './hub-motion-engine.js';

/** Ported verbatim from docs/proposals/calendar-reference/almanac/src/almanac-ref.ts. */
export const ALM = {
  width: 1198, // chart width in CSS px. Set at mount from the card's real width: the chart is laid out, never scaled.
  minWidth: 720, // below this the phone list layout is used instead
  labelX: 18,
  x0: 222, // first day centre
  rightPad: 30,
  months: { y: 20 },
  tiers: { y: 30, h: 18 },
  world: { rows: [66, 92] },
  anchors: { rows: [122, 142] },
  wave: { base: 262, h: 96, softenPct: 40 },
  lanes: { divider: 284, label: 304, top: 318, rowH: 52 },
  bead: { r: 5.5, nowR: 6.5, haloR: 11, diamond: 6 },
  labelRoom: 240, // a bead label flips to the left of its bead inside this many units of the right edge
  labelGap: 14, // minimum gap between two labels on the same side of a lead line
  beadFont: '500 11.5px Inter, ui-sans-serif, sans-serif',
  enterDrawMs: 520, // lead lines draw back from their anchor
  enterStagger: 60, // per lead line
  beadPopMs: MOTION.enter,
  beadStagger: 40,
  waveRevealMs: 700,
  countMs: 420, // headline numbers count to their new value
  toastInMs: 220, toastRise: 6, toastHoldMs: 5200,
  popMs: 180, popRise: 4, popWidth: 300, popGap: 10,
  saveLatencyMs: 350 // PROTOTYPE ONLY: stands in for POST /api/calendar-ghosts
};
