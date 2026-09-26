/**
 * Day brief: the two questions the Day Dial's side panels answer.
 *   Tonight  — how much of the evening is still yours, and what's left in it
 *   Tomorrow — what it needs, and how much you'll have for it
 *
 * Pure. Inputs are the same shapes the Tideline uses: chips ({ id, start, end, kind,
 * title, meta, protected?, isClass?, skipped? } with hours as decimals), ghosts (from
 * GET /api/calendar-ghosts), Life log records, and capacity results from capacity-model.js.
 *
 * Reference: docs/proposals/calendar-reference/day-dial/VISUAL-SPEC.md ("Tonight", "Tomorrow").
 */

export const BRIEF = Object.freeze({
  lightsOut: 22, // profile sleep; a pending or accepted bedtime ghost brings it earlier
  dinnerAt: 19, // where the "Dinner" row sits when nothing is logged
  eveningFrom: 17, // after this, a missing dinner is worth a row
  lunchWindow: [11, 15],
  maxComingUp: 3
});

const toH = hhmm => Number(String(hhmm).slice(0, 2)) + Number(String(hhmm).slice(3, 5)) / 60;

export function formatDuration(minutes) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} m`;
  return r ? `${h} h ${r} m` : `${h} h`;
}

export function clock12(hour) {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  const hh = ((h % 24) + 11) % 12 + 1;
  const suffix = h % 24 >= 12 ? 'pm' : 'am';
  return m ? `${hh}:${String(m).padStart(2, '0')} ${suffix}` : `${hh}:00 ${suffix}`;
}

/** Lights-out hour: the earliest of the profile and a bedtime ghost for that date. */
export function lightsOutFor(date, ghosts, profileSleep = BRIEF.lightsOut) {
  const bed = (ghosts ?? []).find(g => g.kind === 'bedtime' && g.date === date && g.status !== 'dismissed');
  return bed ? Math.min(profileSleep, toH(bed.time)) : profileSleep;
}

/**
 * Tonight, as seen at `now` (hour) on `date`.
 * Returns { timeLeft: { minutes, label, until, by }, rows[] }.
 * Rows are chronological: commitments still ahead, proposals (with ghostId so the view
 * can offer Accept), a Dinner row when nothing's been logged since the afternoon, and
 * lights out.
 */
export function tonight({ date, now, chips = [], ghosts = [], logs = [], profileSleep = BRIEF.lightsOut }) {
  const lightsOut = lightsOutFor(date, ghosts, profileSleep);
  const bedGhost = ghosts.find(g => g.kind === 'bedtime' && g.date === date && g.status !== 'dismissed');
  const minutes = Math.max(0, (lightsOut - now) * 60);
  const rows = [];
  for (const c of chips) {
    if (c.isClass || c.end <= now || c.start >= lightsOut) continue;
    const proposal = ghosts.find(g => g.overItem === c.id && g.status !== 'dismissed' && g.status !== 'accepted');
    rows.push({
      at: c.start,
      time: clock12(c.start),
      title: c.title,
      kind: c.kind,
      note: c.skipped ? 'Skipped' : c.protected ? `Protected · ${formatDuration((c.end - c.start) * 60)} · nothing else can book here` : c.meta ?? '',
      struck: !!c.skipped,
      ghostId: proposal?.id ?? null,
      suggestion: proposal ? `${agentName(proposal.agent)}: ${proposal.label.toLowerCase()}` : null
    });
  }
  // Standalone proposals for tonight (not about an item), e.g. a Sara bedtime.
  for (const g of ghosts) {
    // Pending proposals offer Accept; accepted ones stay as plain rows (they're real now).
    if (g.date !== date || g.overItem || g.status === 'dismissed') continue;
    const at = g.kind === 'bedtime' ? toH(g.time) - 0.25 : g.start ? toH(g.start) : null;
    if (at == null || at < now) continue;
    rows.push({
      at,
      time: clock12(at),
      title: g.kind === 'bedtime' ? `Wind down → lights out ${clock12(toH(g.time))}` : g.label,
      kind: g.kind === 'bedtime' ? 'health' : g.chip?.kind ?? 'task',
      note: g.reason ? `${agentName(g.agent)} · ${g.reason}` : agentName(g.agent),
      struck: false,
      ghostId: g.status === 'accepted' ? null : g.id,
      suggestion: null
    });
  }
  const meals = logs.filter(l => l.type === 'meal' && l.date === date && l.time).map(l => ({ ...l, h: toH(l.time) }));
  const lastMeal = meals.sort((a, b) => a.h - b.h).at(-1);
  const hadLunch = meals.some(m => m.h >= BRIEF.lunchWindow[0] && m.h < BRIEF.lunchWindow[1]);
  if (now >= BRIEF.eveningFrom && !meals.some(m => m.h >= BRIEF.lunchWindow[1])) {
    const since = lastMeal ? `Nothing logged since ${lastMeal.meal ?? 'your last meal'}` : 'Nothing logged today';
    rows.push({ at: Math.max(now, BRIEF.dinnerAt), time: clock12(Math.max(now, BRIEF.dinnerAt)), title: 'Dinner', kind: 'log', note: hadLunch ? since : `${since} (no lunch)`, struck: false, ghostId: null, suggestion: null });
  }
  rows.sort((a, b) => a.at - b.at);
  return {
    timeLeft: {
      minutes,
      label: minutes ? `${formatDuration(minutes)} that's yours` : 'Your evening is done',
      until: clock12(lightsOut),
      by: bedGhost ? agentName(bedGhost.agent) : null
    },
    rows
  };
}

const AGENTS = { sara: 'Sara', hammond: 'Hammond', clare: 'Clare', chadwick: 'Chadwick' };
function agentName(slug) {
  return AGENTS[slug] ?? slug;
}

/**
 * Tomorrow: { headline, note, rows[] }.
 * - capacity: capacity-model result for tomorrow (usually a forecast)
 * - tag: { text } (e.g. "Last day T3") or null
 * - holidayDaysAfter: count of holiday days starting the day after tomorrow (0 if none)
 */
export function tomorrow({ date, chips = [], due = [], ghosts = [], capacity, tag = null, holidayDaysAfter = 0 }) {
  const rows = chips
    .filter(c => !c.isClass)
    .sort((a, b) => a.start - b.start)
    .map(c => ({ at: c.start, time: clock12(c.start), title: c.title, kind: c.kind, note: c.meta ?? '', ghostId: null, suggestion: null }));
  for (const d of due) {
    const move = ghosts.find(g => g.kind === 'move_task' && g.taskId === d.id && g.status !== 'dismissed' && g.status !== 'accepted');
    rows.push({ at: 99, time: 'Due', title: d.title, kind: 'task', note: 'Tasks · open', ghostId: move?.id ?? null, suggestion: move ? `${agentName(move.agent)}: move to ${move.label.replace(/^→\s*/, '')}` : null });
  }
  const classes = chips.filter(c => c.isClass).length;
  const big = rows.filter(r => r.at !== 99).length;
  const parts = [];
  if (big) parts.push(big === 1 ? 'One big thing' : `${big} commitments`);
  if (classes) parts.push(`${classes} class${classes === 1 ? '' : 'es'}`);
  let note = parts.join(' and ') || 'Nothing booked';
  if (holidayDaysAfter) note += `, then holidays for ${holidayDaysAfter} days`;
  return {
    date,
    headline: capacity ? `${capacity.forecast ? 'Forecast' : 'Capacity'} ${capacity.pct}%` : 'No forecast yet',
    tag: tag?.text ?? null,
    note: `${note}.`,
    rows
  };
}

/** Holiday days from `from` (inclusive) until the next term starts. 0 if `from` is in term. */
export function holidayRun(from, terms) {
  const inTerm = d => terms.some(t => d >= t.starts_on && d <= t.ends_on);
  if (inTerm(from)) return 0;
  const next = terms.map(t => t.starts_on).filter(s => s > from).sort()[0];
  if (!next) return 0;
  const ms = k => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
  return Math.round((ms(next) - ms(from)) / 86_400_000);
}
