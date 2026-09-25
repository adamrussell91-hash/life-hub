/** Port exactly from docs/proposals/calendar-reference/term-river/src/river-ref.ts. */
export const TR = {
  labelW: 196, // label column
  padR: 24,
  axis: { tiers: 30, weekLabel: 50, weekDate: 63, h: 76 },
  lanes: { teacher: 160, corey: 76, scholar: 64, friends: 72, body: 104 },
  load: 104,
  bar: { h: 18, rx: 7, gap: 6 },
  point: 5,
  minWeekLabel: 46, // below this week width, the axis shows months instead of weeks
  zoomMs: 520, // Term <-> Year: one tween of the zoom blend, EASE
  revealMs: 700,
  toastInMs: 220, toastRise: 6, toastHoldMs: 5200,
  popMs: 180, popRise: 4, popWidth: 300, popGap: 10,
  saveLatencyMs: 350, // PROTOTYPE ONLY: stands in for POST /api/calendar-ghosts
  font: '500 11.5px Inter, ui-sans-serif, sans-serif',
  barFont: '600 12px Inter, ui-sans-serif, sans-serif'
};
