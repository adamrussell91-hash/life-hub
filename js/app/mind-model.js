import { downsampleWeekly } from '../core/trends.js';
import { addCalendarDays, isCalendarDate } from '../core/time.js';

export const MIND_RANGES = ['weekly', 'monthly', 'six_month'];
export const DEFAULT_MIND_RANGE = 'monthly';

const RANGE_DAYS = {
  weekly: 7,
  monthly: 30,
  six_month: 182
};

export const MOOD_ORDER = ['great', 'good', 'neutral', 'low', 'bad'];

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
      moods: Array.isArray(event.record.moods) ? event.record.moods : null,
      system_note: event.record.system_note ?? null,
      mood_score: Number.isFinite(event.record.mood_score) ? event.record.mood_score : null,
      energy: event.record.energy ?? null,
      tags: Array.isArray(event.record.tags) ? event.record.tags.map(String) : [],
      path: event.path
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
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
    const keys = Array.isArray(entry.moods) && entry.moods.length ? entry.moods : [entry.mood];
    for (const key of keys) {
      if (key && Object.hasOwn(counts, key)) counts[key] += 1;
    }
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

export function buildMindModel({ events, date, range = DEFAULT_MIND_RANGE }) {
  if (!date) throw new RangeError('Mind display date is unavailable');
  const selectedRange = MIND_RANGES.includes(range) ? range : DEFAULT_MIND_RANGE;
  const bounds = rangeWindow(date, selectedRange);
  const entries = diaryEntries(events);
  const moodSeries = moodScoreSeries(entries, bounds);
  const byMood = entriesByMood(entries, bounds);
  const themes = recurringThemes(entries, bounds);

  return {
    date,
    range: selectedRange,
    rangeLabel: selectedRange === 'weekly' ? 'Weekly' : selectedRange === 'monthly' ? 'Monthly' : '6M',
    entryCount: entries.filter(entry => entry.date >= bounds.from && entry.date <= bounds.to).length,
    moodSeries,
    byMood,
    themes,
    empty: moodSeries.length === 0 && byMood.every(item => item.value === 0) && themes.length === 0
  };
}
