/**
 * Lead lines: every fixed point in Adam's life casts a line backwards to the last day
 * he can safely start each thing it needs.
 *
 * Pure date math on YYYY-MM-DD keys (UTC days; no time zones). Views draw the result;
 * agents read it to know what's coming. Nothing here reads records or writes anything.
 *
 * Anchor: { id, title, kind, date?, window?: { opens, closes }, tags?: string[] }
 *   - date: a fixed day (trip start, conferral, term start)
 *   - window: a span something must happen inside (a recheck "3-4 months after 19/06")
 *   - no date or window: a dream. Its steps carry absolute `by` dates.
 * Rule: { id, title, leadDays? , by?, appliesTo: { kinds?, tags?, ids? }, when?: (anchor, ctx) => boolean }
 *   - leadDays: last safe day = anchor.date (or window.closes) minus leadDays
 *   - by: an absolute last safe day (dream steps, one-off deadlines)
 *
 * Reference: docs/proposals/calendar-reference/almanac/VISUAL-SPEC.md ("Lead lines").
 */

const DAY_MS = 86_400_000;
const KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Status thresholds in days before a step's last safe day. */
export const LEAD = Object.freeze({ now: 7, soon: 35 });

function ms(key) {
  if (!KEY.test(key ?? '')) throw new TypeError(`Invalid date key: ${key}`);
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
function key(t) {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
export function addDays(dateKey, days) {
  return key(ms(dateKey) + days * DAY_MS);
}
export function daysBetween(fromKey, toKey) {
  return Math.round((ms(toKey) - ms(fromKey)) / DAY_MS);
}
/** Same day next month(s), clamped to the month's last day (19/06 + 3 months = 19/09). */
export function addMonths(dateKey, months) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const index = y * 12 + (m - 1) + months;
  const ny = Math.floor(index / 12);
  const nm = (index % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

function applies(rule, anchor, ctx) {
  const a = rule.appliesTo ?? {};
  if (a.ids && !a.ids.includes(anchor.id)) return false;
  if (a.kinds && !a.kinds.includes(anchor.kind)) return false;
  if (a.tags && !a.tags.some(t => (anchor.tags ?? []).includes(t))) return false;
  if (!a.ids && !a.kinds && !a.tags) return false; // a rule must say what it's for
  return typeof rule.when === 'function' ? Boolean(rule.when(anchor, ctx)) : true;
}

function anchorEnd(anchor) {
  if (anchor.date) return anchor.date;
  if (anchor.window) return anchor.window.closes;
  return null;
}

/**
 * Status of one step.
 * - done: in ctx.done
 * - overdue: last safe day has passed
 * - now: within LEAD.now days, or a window anchor that is open and not done
 * - soon: within LEAD.soon days
 * - later: further out
 */
export function stepStatus(lastSafe, today, { done = false, windowOpen = false } = {}) {
  if (done) return 'done';
  const left = daysBetween(today, lastSafe);
  if (left < 0) return 'overdue';
  if (windowOpen || left <= LEAD.now) return 'now';
  if (left <= LEAD.soon) return 'soon';
  return 'later';
}

/**
 * The lead line for one anchor.
 * ctx: { today, done?: Set<stepId>, terms?: [{ starts_on, ends_on }] }
 * Returns { anchor, end, from, steps[], status } where status is the most urgent step status.
 */
export function leadLine(anchor, rules, ctx) {
  const today = ctx.today;
  const done = ctx.done ?? new Set();
  const end = anchorEnd(anchor);
  const windowOpen = Boolean(anchor.window) && today >= anchor.window.opens && today <= anchor.window.closes;
  const steps = [];
  for (const rule of rules) {
    if (!applies(rule, anchor, ctx)) continue;
    const by = typeof rule.by === 'function' ? rule.by(anchor, ctx) : rule.by ?? null;
    let lastSafe;
    if (by) lastSafe = by;
    else if (end && Number.isFinite(rule.leadDays)) lastSafe = addDays(end, -rule.leadDays);
    else continue;
    if (!KEY.test(lastSafe ?? '')) continue;
    const id = typeof rule.stepId === 'function'
      ? rule.stepId(anchor, ctx)
      : (typeof rule.stepId === 'string' && rule.stepId ? rule.stepId : `${anchor.id}:${rule.id}`);
    if (!id) continue;
    steps.push({
      id,
      ruleId: rule.id,
      title: typeof rule.title === 'function' ? rule.title(anchor, ctx) : rule.title,
      lastSafe,
      daysLeft: daysBetween(today, lastSafe),
      status: stepStatus(lastSafe, today, { done: done.has(id), windowOpen: windowOpen && !done.has(id) }),
      why: typeof rule.why === 'function' ? rule.why(anchor, ctx) : rule.why ?? null
    });
  }
  steps.sort((a, b) => (a.lastSafe < b.lastSafe ? -1 : a.lastSafe > b.lastSafe ? 1 : 0));
  const order = ['overdue', 'now', 'soon', 'later', 'done'];
  const status = steps.length ? steps.map(s => s.status).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] : 'later';
  return { anchor, end, from: steps[0]?.lastSafe ?? end, steps, status, windowOpen };
}

/** Lead lines for every anchor, most urgent first, then by date. Anchors whose end has passed are dropped. */
export function leadLines(anchors, rules, ctx) {
  const order = ['overdue', 'now', 'soon', 'later', 'done'];
  return anchors
    .filter(a => { const e = anchorEnd(a); return !e || e >= ctx.today; })
    .map(a => leadLine(a, rules, ctx))
    .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || String(a.end ?? '9999').localeCompare(String(b.end ?? '9999')));
}

/** True when any day of [from, to] falls inside a school term. */
export function overlapsTerm(from, to, terms = []) {
  return terms.some(t => from <= t.ends_on && to >= t.starts_on);
}

/**
 * The headline numbers.
 * - unbooked: steps due now or overdue (nothing has been done about them)
 * - lastSafeSoon: steps whose last safe day falls in the next `horizonDays`
 */
export function almanacSummary(lines, { horizonDays = 35 } = {}) {
  const steps = lines.flatMap(l => l.steps);
  return {
    unbooked: steps.filter(s => s.status === 'now' || s.status === 'overdue').length,
    lastSafeSoon: steps.filter(s => s.status !== 'done' && s.daysLeft >= 0 && s.daysLeft <= horizonDays).length
  };
}
