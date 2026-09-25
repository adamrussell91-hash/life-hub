/** Port exactly from docs/proposals/calendar-reference/day-dial/src/dial-ref.ts. */
export const DD = {
  maxSize: 620, // the dial never grows past this, however wide the column
  sidePanel: 340,
  sweepMs: 900, // entrance: the day is revealed clockwise from noon
  handMs: 700, // the now hand swings from noon to now (OVERSHOOT), starting at handDelay
  handDelay: 260,
  gaugeMs: 700,
  daySwitchMs: 480, // choosing another day re-sweeps, faster
  weekStagger: 40,
  toastInMs: 220, toastRise: 6, toastHoldMs: 5200,
  popMs: 180, popRise: 4, popWidth: 300, popGap: 10,
  acceptMs: 320,
  saveLatencyMs: 350, // PROTOTYPE ONLY: stands in for POST /api/calendar-ghosts
  calloutGap: 6,
  miniSize: 68,
  callFont: '600 12px Inter, ui-sans-serif, sans-serif',
  subFont: '400 11px Inter, ui-sans-serif, sans-serif'
};
