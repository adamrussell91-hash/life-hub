// Hammond's 90-day longitudinal digest: presence-by-date across all five Life Hub
// domains, computed entirely from the repo tree the caller already fetched via a
// single resolveTree() call, plus a small already-parsed array of fitness records
// for a real completed/planned/skipped streak. This module does no blob reading --
// it stays a pure, easily-tested function, the same shape as digest.mjs's
// summarizeRecentHistory.
//
// chat.mjs's existing `manifest`/`dataEntries`/`from` (used by digest.mjs) stay a
// thin today+yesterday window for every agent -- Hammond gets a separate, wider
// path-only scan built specifically for this module, so widening this window never
// costs every other agent an unbounded blob read.

import { addCalendarDays, daysBetween } from '../../../js/core/time.js';
import { calculateWorkoutStreak } from '../../../js/core/aggregate.js';

// Mirrors repo-policy.mjs's EVENT_PATH -- the 5 domains it recognises as real Life
// Hub data paths (data/<domain>/<year>/<month>/<date>-<name>.md). Duplicated here
// rather than imported so this module stays independent of repo-policy's
// manifest/blob-size concerns; a domain outside this list isn't a real Life Hub
// data path and is silently ignored.
export const DOMAIN_PATH = /^data\/(?<domain>nutrition|fitness|body|mind|skincare)\/(?<year>\d{4})\/(?<month>\d{2})\/(?<date>\d{4}-\d{2}-\d{2})-(?<name>[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;

const DOMAINS = ['nutrition', 'fitness', 'body', 'mind', 'skincare'];
// Exported so chat.mjs's hammondFrom (the wider fitness blob-read window) is
// derived from this constant rather than re-deriving its own literal -- a
// change here must not be able to silently diverge the two windows.
export const WINDOW_DAYS = 90;
// Separate 30-day window for reusing buildCentralNodeModel server-side (Move 5).
// Bound deliberately tighter than WINDOW_DAYS — heatmaps need real record content
// across all 5 domains, so every in-window blob is read (unlike the path-only
// digest above). Keep this at 30 to stay the same order of magnitude as existing
// body-state bounded reads.
export const CN_MODEL_WINDOW_DAYS = 30;
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The first date in the window: today minus (WINDOW_DAYS - 1), so the window is
// WINDOW_DAYS calendar days inclusive of both windowStart and today.
export function getWindowStart(today) {
  return addCalendarDays(today, -(WINDOW_DAYS - 1));
}

export function getCnModelWindowStart(today) {
  return addCalendarDays(today, -(CN_MODEL_WINDOW_DAYS - 1));
}

// Fitness needs its own blob reads (for completed/planned/skipped classification),
// unlike the other four domains which are presence-by-path only. Mirrors
// body-state.mjs's selectLatestBodyEntries: a pure scan of the already-fetched
// tree, no blob reads, no `limit` cap -- 90 days of fitness entries is already
// small, the same order of magnitude as the existing bounded reads.
export function selectHammondFitnessEntries(tree, { from, to } = {}) {
  if (!Array.isArray(tree)) return [];
  const entries = [];
  for (const entry of tree) {
    if (!entry || entry.type !== 'blob' || typeof entry.path !== 'string') continue;
    const match = DOMAIN_PATH.exec(entry.path);
    if (!match || match.groups.domain !== 'fitness') continue;
    if (match.groups.date < from || match.groups.date > to) continue;
    entries.push(entry);
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

/** All five domains in a date window — used for the 30-day CN model blob read. */
export function selectHammondEventEntries(tree, { from, to } = {}) {
  if (!Array.isArray(tree)) return [];
  const entries = [];
  for (const entry of tree) {
    if (!entry || entry.type !== 'blob' || typeof entry.path !== 'string') continue;
    const match = DOMAIN_PATH.exec(entry.path);
    if (!match) continue;
    if (match.groups.date < from || match.groups.date > to) continue;
    entries.push(entry);
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Compact text block from buildCentralNodeModel output for Hammond's prompt.
 * Rates use the same 30-day series the CN tab heatmaps render.
 */
export function formatCentralNodeModelForPrompt(model) {
  if (!model || !Array.isArray(model.week)) return '';

  const logging = rateOf(model.loggingMonth, day => day.complete);
  const exercise = rateOf(model.exerciseMonth, day => day.completed);
  const eating = rateOf(model.eatingMonth, day => day.hitEatingTargets);

  return [
    'Central Node computed snapshot (same math as the CN tab — 7-day protein series + 30-day heatmaps):',
    `Protein (7d): ${describeProteinTrend(model.week)}.`,
    `Logging completeness (30d): ${logging.hit}/${logging.total} days (${logging.pct}%).`,
    `Exercise completed (30d): ${exercise.hit}/${exercise.total} days (${exercise.pct}%).`,
    `Eating targets met (30d): ${eating.hit}/${eating.total} days (${eating.pct}%).`
  ].join('\n');
}

function rateOf(series, pred) {
  const list = Array.isArray(series) ? series : [];
  const total = list.length;
  const hit = list.filter(pred).length;
  const pct = total === 0 ? 0 : Math.round((hit / total) * 100);
  return { hit, total, pct };
}

function describeProteinTrend(week) {
  const values = week.map(day => Number(day?.protein_g) || 0);
  if (values.length === 0) return 'no data';
  const mid = Math.floor(values.length / 2);
  const first = average(values.slice(0, mid || 1));
  const second = average(values.slice(mid));
  const delta = second - first;
  if (Math.abs(delta) < 5) return `flat (~${Math.round(second)}g/day)`;
  if (delta > 0) return `rising (${Math.round(first)}g → ${Math.round(second)}g/day)`;
  return `falling (${Math.round(first)}g → ${Math.round(second)}g/day)`;
}

function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function summarizeHammondDigest({ tree, fitnessRecords = [], today }) {
  const windowStart = getWindowStart(today);
  const datesByDomain = collectDatesByDomain(tree, windowStart, today);

  return DOMAINS
    .map(domain => domain === 'fitness'
      ? formatFitnessLine(datesByDomain.fitness, fitnessRecords, windowStart, today)
      : formatDomainLine(domain, datesByDomain[domain], windowStart, today))
    .join('\n');
}

function collectDatesByDomain(tree, windowStart, windowEnd) {
  const byDomain = Object.fromEntries(DOMAINS.map(domain => [domain, new Set()]));
  if (!Array.isArray(tree)) return byDomain;
  for (const entry of tree) {
    if (!entry || entry.type !== 'blob' || typeof entry.path !== 'string') continue;
    const match = DOMAIN_PATH.exec(entry.path);
    if (!match) continue;
    const { domain, date } = match.groups;
    if (date < windowStart || date > windowEnd) continue;
    byDomain[domain].add(date);
  }
  return byDomain;
}

// Longest gap considers every missing stretch inside the window: before the first
// logged date, between two logged dates, and after the last logged date (which is
// also reported separately as "current gap" -- the two numbers may or may not
// match, since longest gap looks at the whole window, not just the trailing edge).
function computeGapStats(datesSet, windowStart, windowEnd) {
  const dates = [...datesSet].sort();
  const daysWithFile = dates.length;

  if (daysWithFile === 0) {
    return {
      daysWithFile: 0,
      currentGap: null,
      longestGap: daysBetween(windowStart, windowEnd) + 1,
      longestGapRange: { start: windowStart, end: windowEnd }
    };
  }

  const lastDate = dates[dates.length - 1];
  const currentGap = daysBetween(lastDate, windowEnd);

  let longestGap = 0;
  let longestGapRange = null;
  const considerGap = (gapDays, start, end) => {
    if (gapDays > longestGap) {
      longestGap = gapDays;
      longestGapRange = { start, end };
    }
  };

  const headGapDays = daysBetween(windowStart, dates[0]);
  if (headGapDays > 0) considerGap(headGapDays, windowStart, addCalendarDays(dates[0], -1));

  for (let i = 1; i < dates.length; i += 1) {
    const gapDays = daysBetween(dates[i - 1], dates[i]) - 1;
    if (gapDays > 0) considerGap(gapDays, addCalendarDays(dates[i - 1], 1), addCalendarDays(dates[i], -1));
  }

  if (currentGap > 0) considerGap(currentGap, addCalendarDays(lastDate, 1), windowEnd);

  return { daysWithFile, currentGap, longestGap, longestGapRange };
}

function formatDomainLine(domain, datesSet, windowStart, windowEnd) {
  const stats = computeGapStats(datesSet, windowStart, windowEnd);
  if (stats.daysWithFile === 0) {
    return `Logging last ${WINDOW_DAYS} days — ${domain}: 0/${WINDOW_DAYS} days, no entries in this window.`;
  }
  const gapRangeText = stats.longestGap > 0 ? formatDateRange(stats.longestGapRange) : '';
  return `Logging last ${WINDOW_DAYS} days — ${domain}: ${stats.daysWithFile}/${WINDOW_DAYS} days, `
    + `current gap ${stats.currentGap}d, longest gap ${stats.longestGap}d${gapRangeText}.`;
}

function formatFitnessLine(datesSet, fitnessRecords, windowStart, windowEnd) {
  const stats = computeGapStats(datesSet, windowStart, windowEnd);
  const inWindowRecords = (Array.isArray(fitnessRecords) ? fitnessRecords : [])
    .filter(record => record && typeof record === 'object'
      && record.type === 'workout'
      && typeof record.date === 'string'
      && record.date >= windowStart && record.date <= windowEnd);
  const streak = calculateWorkoutStreak(inWindowRecords, windowEnd);
  const completedCount = inWindowRecords.filter(record => record.status === 'completed').length;

  if (stats.daysWithFile === 0) {
    return `Logging last ${WINDOW_DAYS} days — fitness: 0/${WINDOW_DAYS} days, no entries in this window, `
      + `current streak ${streak}d, ${completedCount} completed.`;
  }

  const gapRangeText = stats.longestGap > 0 ? formatDateRange(stats.longestGapRange) : '';
  return `Logging last ${WINDOW_DAYS} days — fitness: ${stats.daysWithFile}/${WINDOW_DAYS} days, `
    + `current streak ${streak}d, ${completedCount} completed, `
    + `current gap ${stats.currentGap}d, longest gap ${stats.longestGap}d${gapRangeText}.`;
}

function monthAbbr(dateKey) {
  return MONTH_ABBR[Number(dateKey.slice(5, 7)) - 1] ?? '';
}

function formatDateRange({ start, end }) {
  const startDay = Number(start.slice(8, 10));
  const endDay = Number(end.slice(8, 10));
  if (start === end) return ` (${startDay} ${monthAbbr(start)})`;
  const startMonth = monthAbbr(start);
  const endMonth = monthAbbr(end);
  if (startMonth === endMonth) return ` (${startDay}–${endDay} ${endMonth})`;
  return ` (${startDay} ${startMonth} – ${endDay} ${endMonth})`;
}
