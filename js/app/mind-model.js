import { downsampleWeekly } from '../core/trends.js';
import { extractCrossAgentCoordination } from '../core/constraints.js';
import { parseGovernanceEntries } from '../core/governance-log.js';
import { addCalendarDays, daysBetween, isCalendarDate } from '../core/time.js';

export const MIND_RANGES = ['weekly', 'monthly', 'six_month'];
export const DEFAULT_MIND_RANGE = 'monthly';

const RANGE_DAYS = {
  weekly: 7,
  monthly: 30,
  six_month: 182
};

export const MOOD_ORDER = ['great', 'good', 'neutral', 'low', 'bad'];
export const ENERGY_ORDER = ['high', 'medium', 'low'];

export function rangeWindow(date, range) {
  if (!isCalendarDate(date)) throw new TypeError(`Invalid calendar date: ${date}`);
  if (!MIND_RANGES.includes(range)) throw new TypeError(`Unknown mind range: ${range}`);
  const days = RANGE_DAYS[range];
  return { from: addCalendarDays(date, -(days - 1)), to: date, days };
}

export function diaryEntries(events) {
  return (events ?? [])
    .filter(event => event?.record?.type === 'diary' && isCalendarDate(event.record.date))
    .map(event => ({
      date: event.record.date,
      mood: event.record.mood ?? null,
      mood_score: Number.isFinite(event.record.mood_score) ? event.record.mood_score : null,
      energy: event.record.energy ?? null,
      tags: Array.isArray(event.record.tags) ? event.record.tags.map(String) : [],
      path: event.path
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function sessionEntries(events) {
  return (events ?? [])
    .filter(event => event?.record?.type === 'mind_session' && isCalendarDate(event.record.date))
    .map(event => ({
      date: event.record.date,
      theme: event.record.theme ?? null,
      closingQuestion: event.record.closing_question ?? null,
      insight: event.record.insight ?? null,
      moodAtOpen: event.record.mood_at_open ?? null,
      moodAtClose: event.record.mood_at_close ?? null,
      crossAgentNote: event.record.cross_agent_note ?? null,
      path: event.path
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function entriesByEnergy(entries, bounds) {
  const counts = Object.fromEntries(ENERGY_ORDER.map(level => [level, 0]));
  for (const entry of entries) {
    if (entry.date < bounds.from || entry.date > bounds.to) continue;
    if (entry.energy && Object.hasOwn(counts, entry.energy)) counts[entry.energy] += 1;
  }
  return ENERGY_ORDER.map(level => ({
    key: level,
    label: level[0].toUpperCase() + level.slice(1),
    value: counts[level]
  }));
}

function daysSinceLast(dates, date) {
  if (!isCalendarDate(date)) return null;
  const last = (dates ?? []).filter(isCalendarDate).sort().at(-1);
  if (!last) return null;
  return daysBetween(last, date);
}

export function daysSinceLastDiary(entries, date) {
  return daysSinceLast((entries ?? []).map(entry => entry.date), date);
}

export function daysSinceLastMindSession(sessions, date) {
  return daysSinceLast((sessions ?? []).map(session => session.date), date);
}

export function silenceFlag(diaryGap, sessionGap) {
  return typeof diaryGap === 'number' && typeof sessionGap === 'number'
    && diaryGap >= 7 && sessionGap >= 7;
}

const CROSS_AGENT_MARKERS = ['Vera→', 'Penelope→', '→Vera', '→Penelope'];

export function mindInsights(governanceLogMarkdown, bounds) {
  return parseGovernanceEntries(governanceLogMarkdown ?? '')
    .filter(entry => entry.entryType === 'Mind Insight')
    .filter(entry => entry.dateKey && entry.dateKey >= bounds.from && entry.dateKey <= bounds.to);
}

export function mindCrossAgentLines(centralNodeMarkdown) {
  const section = extractCrossAgentCoordination(centralNodeMarkdown ?? '');
  if (!section) return [];
  return section
    .split('\n')
    .map(line => line.replace(/^\s*[-*]\s+/, '').replace(/^\*\*/, '').replace(/\*\*/g, '').trim())
    .filter(line => line && CROSS_AGENT_MARKERS.some(marker => line.includes(marker)));
}

export function moodScoreSeries(entries, bounds) {
  const inRange = entries.filter(entry => (
    entry.date >= bounds.from
    && entry.date <= bounds.to
    && entry.mood_score != null
  ));
  const points = inRange.map(entry => ({ date: entry.date, value: entry.mood_score }));
  if (bounds.days > 90 && points.length) {
    return downsampleWeekly(points, 'value')
      .filter(point => point.value != null)
      .map(point => ({ date: point.date, value: point.value }));
  }
  return points;
}

export function entriesByMood(entries, bounds) {
  const counts = Object.fromEntries(MOOD_ORDER.map(mood => [mood, 0]));
  for (const entry of entries) {
    if (entry.date < bounds.from || entry.date > bounds.to) continue;
    if (entry.mood && Object.hasOwn(counts, entry.mood)) counts[entry.mood] += 1;
  }
  return MOOD_ORDER.map(mood => ({
    key: mood,
    label: mood[0].toUpperCase() + mood.slice(1),
    value: counts[mood]
  }));
}

export function recurringThemes(entries, bounds, { limit = 8 } = {}) {
  const counts = new Map();
  for (const entry of entries) {
    if (entry.date < bounds.from || entry.date > bounds.to) continue;
    for (const tag of entry.tags) {
      const key = tag.trim().toLowerCase();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, value]) => ({
      key,
      label: key,
      value
    }));
}

export function buildMindModel({ events, date, range = DEFAULT_MIND_RANGE, governanceLogMarkdown, centralNodeMarkdown }) {
  if (!date) throw new RangeError('Mind display date is unavailable');
  const selectedRange = MIND_RANGES.includes(range) ? range : DEFAULT_MIND_RANGE;
  const bounds = rangeWindow(date, selectedRange);
  const entries = diaryEntries(events);
  const moodSeries = moodScoreSeries(entries, bounds);
  const byMood = entriesByMood(entries, bounds);
  const themes = recurringThemes(entries, bounds);
  const allSessions = sessionEntries(events);
  const sessions = allSessions
    .filter(session => session.date >= bounds.from && session.date <= bounds.to)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || String(a.path).localeCompare(String(b.path)));
  const energyByLevel = entriesByEnergy(entries, bounds);
  const insights = mindInsights(governanceLogMarkdown, bounds);
  const crossAgentLines = mindCrossAgentLines(centralNodeMarkdown);
  const diaryGap = daysSinceLastDiary(entries, date);
  const sessionGap = daysSinceLastMindSession(allSessions, date);

  return {
    date,
    range: selectedRange,
    rangeLabel: selectedRange === 'weekly' ? 'Weekly' : selectedRange === 'monthly' ? 'Monthly' : '6M',
    entryCount: entries.filter(entry => entry.date >= bounds.from && entry.date <= bounds.to).length,
    moodSeries,
    byMood,
    themes,
    sessions,
    energyByLevel,
    insights,
    crossAgentLines,
    daysSinceLastDiary: diaryGap,
    daysSinceLastMindSession: sessionGap,
    silence: silenceFlag(diaryGap, sessionGap),
    empty: moodSeries.length === 0 && byMood.every(item => item.value === 0) && themes.length === 0
  };
}
