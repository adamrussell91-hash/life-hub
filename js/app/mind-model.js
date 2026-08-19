import { downsampleWeekly } from '../core/trends.js';
import { extractCrossAgentCoordination } from '../core/constraints.js';
import { parseGovernanceEntries } from '../core/governance-log.js';
import { addCalendarDays, daysBetween, getSydneyWeekStart, isCalendarDate } from '../core/time.js';

export const MIND_RANGES = ['weekly', 'monthly', 'six_month', 'year'];
export const DEFAULT_MIND_RANGE = 'monthly';
export const DEFAULT_MIND_WATCHLIST = ['should', 'just', 'fine', 'unfulfilled', 'flake'];

const RANGE_DAYS = {
  weekly: 7,
  monthly: 30,
  six_month: 182
};

const RANGE_LABELS = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  six_month: '6M',
  year: 'Year'
};

export const MOOD_ORDER = ['great', 'good', 'neutral', 'low', 'bad'];
export const ENERGY_ORDER = ['high', 'medium', 'low'];

export function moodDelta(open, close) {
  const openIndex = MOOD_ORDER.indexOf(open);
  const closeIndex = MOOD_ORDER.indexOf(close);
  if (openIndex < 0 || closeIndex < 0) return null;
  return openIndex - closeIndex;
}

export function rangeWindow(date, range) {
  if (!isCalendarDate(date)) throw new TypeError(`Invalid calendar date: ${date}`);
  if (!MIND_RANGES.includes(range)) throw new TypeError(`Unknown mind range: ${range}`);
  if (range === 'year') {
    const from = `${date.slice(0, 4)}-01-01`;
    return { from, to: date, days: daysBetween(from, date) + 1 };
  }
  const days = RANGE_DAYS[range];
  return { from: addCalendarDays(date, -(days - 1)), to: date, days };
}

export function previousRangeWindow(date, range) {
  const current = rangeWindow(date, range);
  if (range === 'year') {
    const year = Number(current.from.slice(0, 4)) - 1;
    const from = `${year}-01-01`;
    let to = `${year}${current.to.slice(4)}`;
    if (!isCalendarDate(to)) {
      const month = Number(current.to.slice(5, 7));
      const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
      to = `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    }
    return { from, to, days: daysBetween(from, to) + 1 };
  }
  const to = addCalendarDays(current.from, -1);
  return { from: addCalendarDays(to, -(current.days - 1)), to, days: current.days };
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
      path: event.path,
      sourceAgent: event.record.source_agent ?? null,
      body: event.body ?? ''
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
      path: event.path,
      title: event.record.title ?? null,
      themes: Array.isArray(event.record.themes) ? event.record.themes : [],
      patternTags: Array.isArray(event.record.pattern_tags) ? event.record.pattern_tags : [],
      sessionType: event.record.session_type ?? null,
      framework: event.record.framework ?? null,
      observation: event.record.observation ?? null,
      sourceAgent: event.record.source_agent ?? null
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function sessionThemes(session) {
  if (Array.isArray(session?.themes) && session.themes.length) return session.themes;
  return session?.theme ? [session.theme] : [];
}

export function entriesForTheme(entries, sessions, theme) {
  const key = normalizeThemeKey(theme ?? '');
  if (!key) return [];
  const rows = [];
  for (const entry of entries ?? []) {
    const tags = uniqueThemeKeys(entry.tags);
    if (!tags.includes(key)) continue;
    rows.push({
      date: entry.date,
      title: entry.title ?? null,
      excerpt: String(entry.body || entry.insight || entry.observation || '').slice(0, 140)
    });
  }
  for (const session of sessions ?? []) {
    const themes = uniqueThemeKeys(sessionThemes(session));
    if (!themes.includes(key)) continue;
    rows.push({
      date: session.date,
      title: session.title ?? null,
      excerpt: String(session.body || session.insight || session.observation || '').slice(0, 140)
    });
  }
  return rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export function entriesForThemePair(entries, sessions, themeA, themeB) {
  const a = normalizeThemeKey(themeA ?? '');
  const b = normalizeThemeKey(themeB ?? '');
  if (!a || !b) return [];
  const rows = [];
  for (const entry of entries ?? []) {
    const tags = uniqueThemeKeys(entry.tags);
    if (!tags.includes(a) || !tags.includes(b)) continue;
    rows.push({
      date: entry.date,
      title: entry.title ?? null,
      excerpt: String(entry.body || entry.insight || entry.observation || '').slice(0, 140)
    });
  }
  for (const session of sessions ?? []) {
    const themes = uniqueThemeKeys(sessionThemes(session));
    if (!themes.includes(a) || !themes.includes(b)) continue;
    rows.push({
      date: session.date,
      title: session.title ?? null,
      excerpt: String(session.body || session.insight || session.observation || '').slice(0, 140)
    });
  }
  return rows.sort((left, right) => String(left.date).localeCompare(String(right.date)));
}

export function entriesForThemeWeek(entries, sessions, theme, weekStart) {
  const from = String(weekStart ?? '');
  if (!from) return [];
  const to = addCalendarDays(from, 6);
  return entriesForTheme(entries, sessions, theme)
    .filter(row => row.date >= from && row.date <= to);
}

function normalizeThemeKey(value) {
  return String(value).trim().toLowerCase();
}

export function displayThemeLabel(value) {
  const words = String(value ?? '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return '';
  return words.map((word, index) => {
    const lower = word.toLowerCase();
    if (index === 0) return lower.charAt(0).toUpperCase() + lower.slice(1);
    return lower;
  }).join(' ');
}

function uniqueThemeKeys(values) {
  const keys = [];
  const seen = new Set();
  for (const value of values ?? []) {
    const key = normalizeThemeKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

export function themeCooccurrence(entries, sessions, bounds) {
  const counts = new Map();

  function addPairs(themes) {
    const keys = uniqueThemeKeys(themes);
    for (let i = 0; i < keys.length; i += 1) {
      for (let j = i + 1; j < keys.length; j += 1) {
        const themeA = keys[i] < keys[j] ? keys[i] : keys[j];
        const themeB = keys[i] < keys[j] ? keys[j] : keys[i];
        const pairKey = `${themeA}\0${themeB}`;
        const pair = counts.get(pairKey) ?? { themeA, themeB, count: 0 };
        pair.count += 1;
        counts.set(pairKey, pair);
      }
    }
  }

  for (const entry of entries ?? []) {
    if (entry.date < bounds.from || entry.date > bounds.to) continue;
    addPairs(entry.tags);
  }
  for (const session of sessions ?? []) {
    if (session.date < bounds.from || session.date > bounds.to) continue;
    addPairs(sessionThemes(session));
  }

  return [...counts.values()];
}

export function themeNodes(entries, sessions, bounds) {
  const counts = new Map();
  const themeDates = new Map();
  const moodByDate = new Map();

  function addThemes(themes, date) {
    for (const key of uniqueThemeKeys(themes)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
      const dates = themeDates.get(key) ?? new Set();
      dates.add(date);
      themeDates.set(key, dates);
    }
  }

  for (const entry of entries ?? []) {
    if (entry.date < bounds.from || entry.date > bounds.to) continue;
    if (entry.mood_score != null) moodByDate.set(entry.date, entry.mood_score);
    addThemes(entry.tags, entry.date);
  }
  for (const session of sessions ?? []) {
    if (session.date < bounds.from || session.date > bounds.to) continue;
    addThemes(sessionThemes(session), session.date);
  }

  return [...counts.entries()].map(([key, count]) => {
    const scores = [...(themeDates.get(key) ?? [])]
      .map(date => moodByDate.get(date))
      .filter(score => score != null);
    return {
      key,
      count,
      meanMood: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null
    };
  });
}

function meanScores(scores) {
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

export function factorEffects(entries, sessions, bounds) {
  const byDate = new Map();

  for (const entry of entries ?? []) {
    if (entry.date < bounds.from || entry.date > bounds.to) continue;
    if (entry.mood_score == null) continue;
    const day = byDate.get(entry.date) ?? { score: entry.mood_score, factors: new Set() };
    day.score = entry.mood_score;
    for (const key of uniqueThemeKeys(entry.tags)) day.factors.add(key);
    byDate.set(entry.date, day);
  }

  for (const session of sessions ?? []) {
    if (session.date < bounds.from || session.date > bounds.to) continue;
    const day = byDate.get(session.date);
    if (!day) continue;
    for (const key of uniqueThemeKeys(sessionThemes(session))) day.factors.add(key);
  }

  const keys = new Set();
  for (const day of byDate.values()) {
    for (const key of day.factors) keys.add(key);
  }

  const effects = [];
  for (const key of keys) {
    const present = [];
    const absent = [];
    for (const day of byDate.values()) {
      if (day.factors.has(key)) present.push(day.score);
      else absent.push(day.score);
    }
    if (present.length < 3 || absent.length < 3) continue;
    const effect = meanScores(present) - meanScores(absent);
    effects.push({
      key,
      effect,
      direction: effect > 0 ? 'positive' : 'negative'
    });
  }
  return effects;
}

export function consistencyRing(entries, sessions, date) {
  const from = addCalendarDays(date, -29);
  const dates = new Set();
  for (const entry of entries ?? []) {
    if (entry.date < from || entry.date > date) continue;
    dates.add(entry.date);
  }
  for (const session of sessions ?? []) {
    if (session.date < from || session.date > date) continue;
    dates.add(session.date);
  }
  let streak = 0;
  let cursor = date;
  while (dates.has(cursor)) {
    streak += 1;
    cursor = addCalendarDays(cursor, -1);
  }
  return { daysWithEntry: dates.size, windowDays: 30, streak };
}

export function cadenceHits(entries, sessions) {
  const diary = [...new Set((entries ?? []).map(entry => entry.date).filter(isCalendarDate))].sort();
  const vera = [...new Set((sessions ?? []).map(session => session.date).filter(isCalendarDate))].sort();
  return { diary, vera, penelope: [...diary] };
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

export function moodRadialSeries(entries, bounds) {
  return entries
    .filter(entry => (
      entry.date >= bounds.from
      && entry.date <= bounds.to
      && entry.mood_score != null
    ))
    .map(entry => ({
      date: entry.date,
      value: entry.mood_score,
      mood: entry.mood ?? null,
      energy: entry.energy ?? null
    }));
}

export function energyOrbitSeries(entries, bounds) {
  return entries
    .filter(entry => (
      entry.date >= bounds.from
      && entry.date <= bounds.to
      && ENERGY_ORDER.includes(entry.energy)
    ))
    .map(entry => ({
      date: entry.date,
      energy: entry.energy,
      mood: entry.mood ?? null,
      body: entry.body ?? ''
    }));
}

export function moodScoreSeries(entries, bounds) {
  const inRange = entries.filter(entry => (
    entry.date >= bounds.from
    && entry.date <= bounds.to
    && entry.mood_score != null
  ));
  const points = inRange.map(entry => ({ date: entry.date, value: entry.mood_score, mood: entry.mood }));
  if (bounds.days > 90 && points.length) {
    return downsampleWeekly(points, 'value')
      .filter(point => point.value != null)
      .map(point => ({ date: point.date, value: point.value, mood: null }));
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
      label: displayThemeLabel(key),
      value
    }));
}

function inBounds(item, bounds) {
  return item.date >= bounds.from && item.date <= bounds.to;
}

function weeksInBounds(bounds) {
  const start = getSydneyWeekStart(bounds.from);
  const end = getSydneyWeekStart(bounds.to);
  const weeks = [];
  for (let week = start; week <= end; week = addCalendarDays(week, 7)) weeks.push(week);
  return weeks;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseInsightExtras(body) {
  const text = String(body ?? '');
  const extras = {};
  const source = /^\*\*Source session:\*\*\s*(.+)$/m.exec(text);
  if (source) extras.sourceSession = source[1].trim();

  const tensionLine = /^\*\*Tension:\*\*\s*(.+?)\s+[—–-]\s+(.+)$/m.exec(text);
  const statedLine = /^\*\*Stated:\*\*\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*$/m.exec(text);
  const revealedLine = /^\*\*Revealed:\*\*\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*$/m.exec(text);
  const stated = statedLine ? Number(statedLine[1]) : NaN;
  const revealed = revealedLine ? Number(revealedLine[1]) : NaN;
  if (tensionLine && Number.isFinite(stated) && Number.isFinite(revealed)) {
    extras.tension = {
      poleA: tensionLine[1].trim(),
      poleB: tensionLine[2].trim(),
      stated,
      revealed
    };
  }
  return extras;
}

export function moodTransitions(entries, bounds) {
  const moods = (entries ?? [])
    .filter(entry => inBounds(entry, bounds) && entry.mood)
    .sort((a, b) => a.date.localeCompare(b.date));
  const counts = new Map();
  for (let i = 1; i < moods.length; i += 1) {
    const from = moods[i - 1].mood;
    const to = moods[i].mood;
    const key = `${from}\0${to}`;
    const flow = counts.get(key) ?? { from, to, count: 0 };
    flow.count += 1;
    counts.set(key, flow);
  }
  return [...counts.values()];
}

export function themeWeekly(entries, sessions, bounds, { limit = 8 } = {}) {
  const weeks = weeksInBounds(bounds);
  const weekIndex = new Map(weeks.map((week, index) => [week, index]));
  const totals = new Map();
  const byThemeWeek = new Map();

  function addTheme(theme, date) {
    const key = normalizeThemeKey(theme);
    if (!key) return;
    const index = weekIndex.get(getSydneyWeekStart(date));
    if (index == null) return;
    totals.set(key, (totals.get(key) ?? 0) + 1);
    let values = byThemeWeek.get(key);
    if (!values) {
      values = weeks.map(() => 0);
      byThemeWeek.set(key, values);
    }
    values[index] += 1;
  }

  for (const entry of entries ?? []) {
    if (!inBounds(entry, bounds)) continue;
    for (const tag of entry.tags ?? []) addTheme(tag, entry.date);
  }
  for (const session of sessions ?? []) {
    if (!inBounds(session, bounds)) continue;
    for (const theme of sessionThemes(session)) addTheme(theme, session.date);
  }

  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = ranked.slice(0, limit).map(([key]) => key);
  const rest = ranked.slice(limit);
  const themes = [...top];
  const series = top.map(key => ({ key, values: byThemeWeek.get(key) }));
  if (rest.length) {
    themes.push('other');
    series.push({
      key: 'other',
      values: weeks.map((_, index) => rest.reduce((sum, [key]) => sum + (byThemeWeek.get(key)?.[index] ?? 0), 0))
    });
  }
  return { weeks, themes, series };
}

export function themeRanks(weekly) {
  const weeks = weekly?.weeks ?? [];
  const themes = weekly?.themes ?? [];
  const valuesByTheme = new Map((weekly?.series ?? []).map(item => [item.key, item.values]));
  return weeks.map((week, index) => {
    const ordered = themes
      .map(theme => ({ theme, count: valuesByTheme.get(theme)?.[index] ?? 0 }))
      .sort((a, b) => b.count - a.count || a.theme.localeCompare(b.theme));
    const rankByTheme = {};
    let rank = 1;
    for (let i = 0; i < ordered.length; i += 1) {
      if (i > 0 && ordered[i].count < ordered[i - 1].count) rank = i + 1;
      rankByTheme[ordered[i].theme] = rank;
    }
    return { week, rankByTheme };
  });
}

function countWatchlistTerm(text, term) {
  if (!text || !term) return 0;
  const matches = String(text).match(new RegExp(`\\b${escapeRegExp(term)}\\b`, 'gi'));
  return matches?.length ?? 0;
}

function sessionWatchText(session) {
  return [session?.insight, session?.observation, session?.closingQuestion, session?.title]
    .filter(Boolean)
    .join('\n');
}

export function lexicalSeries(entries, sessions, bounds, watchlist) {
  const weeks = weeksInBounds(bounds);
  const weekIndex = new Map(weeks.map((week, index) => [week, index]));

  return (watchlist ?? []).map(term => {
    const points = weeks.map(date => ({ date, count: 0 }));
    function addText(text, date) {
      if (date < bounds.from || date > bounds.to) return;
      const index = weekIndex.get(getSydneyWeekStart(date));
      if (index == null) return;
      points[index].count += countWatchlistTerm(text, term);
    }
    for (const entry of entries ?? []) addText(entry.body, entry.date);
    for (const session of sessions ?? []) addText(sessionWatchText(session), session.date);
    return { term, points };
  });
}

export function entriesForWatchlistTerm(entries, sessions, term, bounds) {
  const key = String(term ?? '').trim();
  if (!key || !bounds?.from || !bounds?.to) return [];
  const rows = [];
  for (const entry of entries ?? []) {
    if (entry.date < bounds.from || entry.date > bounds.to) continue;
    if (!countWatchlistTerm(entry.body, key)) continue;
    rows.push({
      date: entry.date,
      title: entry.title ?? null,
      excerpt: String(entry.body || '').slice(0, 140)
    });
  }
  for (const session of sessions ?? []) {
    if (session.date < bounds.from || session.date > bounds.to) continue;
    if (!countWatchlistTerm(sessionWatchText(session), key)) continue;
    rows.push({
      date: session.date,
      title: session.title ?? session.theme ?? null,
      excerpt: String(session.insight || session.observation || '').slice(0, 140)
    });
  }
  return rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export function butterfly(entries, sessions, bounds) {
  const byTheme = new Map();

  function rowFor(theme) {
    const key = normalizeThemeKey(theme);
    if (!key) return null;
    let row = byTheme.get(key);
    if (!row) {
      row = { theme: key, veraCount: 0, penelopeCount: 0, deltas: [] };
      byTheme.set(key, row);
    }
    return row;
  }

  for (const entry of entries ?? []) {
    if (!inBounds(entry, bounds)) continue;
    for (const tag of uniqueThemeKeys(entry.tags)) {
      const row = rowFor(tag);
      if (row) row.penelopeCount += 1;
    }
  }
  for (const session of sessions ?? []) {
    if (!inBounds(session, bounds)) continue;
    const delta = moodDelta(session.moodAtOpen, session.moodAtClose);
    for (const theme of uniqueThemeKeys(sessionThemes(session))) {
      const row = rowFor(theme);
      if (!row) continue;
      row.veraCount += 1;
      if (delta != null) row.deltas.push(delta);
    }
  }

  return [...byTheme.values()].map(({ theme, veraCount, penelopeCount, deltas }) => ({
    theme,
    veraCount,
    penelopeCount,
    veraDelta: deltas.length ? deltas.reduce((sum, value) => sum + value, 0) / deltas.length : null
  }));
}

export function resurfacing(entries, sessions, date) {
  const items = [];
  for (const entry of entries ?? []) {
    if (entry.date > date) continue;
    items.push({ date: entry.date, themes: uniqueThemeKeys(entry.tags), excerpt: entry.body ?? '' });
  }
  for (const session of sessions ?? []) {
    if (session.date > date) continue;
    items.push({
      date: session.date,
      themes: uniqueThemeKeys(sessionThemes(session)),
      excerpt: session.insight || session.observation || ''
    });
  }
  if (!items.length) return null;
  items.sort((a, b) => a.date.localeCompare(b.date));
  const latestDate = items.at(-1).date;
  const latestThemes = uniqueThemeKeys(items.filter(item => item.date === latestDate).flatMap(item => item.themes));

  let card = null;
  for (const theme of latestThemes) {
    const priors = items.filter(item => item.themes.includes(theme) && daysBetween(item.date, latestDate) > 7);
    if (!priors.length) continue;
    const prior = priors.at(-1);
    if (!card || prior.date > card.priorDate) {
      card = { theme, priorDate: prior.date, excerpt: prior.excerpt };
    }
  }
  return card;
}

export function waffleEntries(entries, sessions, bounds) {
  const cells = [];
  for (const entry of entries ?? []) {
    if (!inBounds(entry, bounds)) continue;
    cells.push({ date: entry.date, mood: entry.mood, kind: 'diary' });
  }
  for (const session of sessions ?? []) {
    if (!inBounds(session, bounds)) continue;
    cells.push({ date: session.date, mood: session.moodAtClose ?? session.moodAtOpen ?? null, kind: 'session' });
  }
  return cells.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}

function sessionOutcome(session) {
  const delta = moodDelta(session.moodAtOpen, session.moodAtClose);
  if (delta != null) {
    return delta > 0 ? 'mood lifted' : delta < 0 ? 'mood eased' : 'mood held';
  }
  return session.title || 'logged';
}

export function buildMindModel({
  events,
  date,
  range = DEFAULT_MIND_RANGE,
  governanceLogMarkdown,
  centralNodeMarkdown,
  watchlist = DEFAULT_MIND_WATCHLIST
}) {
  if (!date) throw new RangeError('Mind display date is unavailable');
  const selectedRange = MIND_RANGES.includes(range) ? range : DEFAULT_MIND_RANGE;
  const bounds = rangeWindow(date, selectedRange);
  const entries = diaryEntries(events);
  const inRangeEntries = entries.filter(entry => entry.date >= bounds.from && entry.date <= bounds.to);
  const moodSeries = moodScoreSeries(entries, bounds);
  const moodRadial = moodRadialSeries(entries, bounds);
  const previousBounds = previousRangeWindow(date, selectedRange);
  const energyOrbit = energyOrbitSeries(entries, bounds);
  const previousEnergyOrbit = energyOrbitSeries(entries, previousBounds);
  const byMood = entriesByMood(entries, bounds);
  const allSessions = sessionEntries(events);
  const nodes = themeNodes(entries, allSessions, bounds);
  const meanByKey = new Map(nodes.map(node => [node.key, node.meanMood]));
  const prevCounts = new Map(
    recurringThemes(entries, previousBounds, { limit: 50 })
      .map(theme => [theme.key, theme.value])
  );
  const themes = recurringThemes(entries, bounds).map(theme => ({
    ...theme,
    prevValue: prevCounts.get(theme.key) ?? 0,
    meanMood: meanByKey.get(theme.key) ?? null
  }));
  const sessions = allSessions
    .filter(session => session.date >= bounds.from && session.date <= bounds.to)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || String(a.path).localeCompare(String(b.path)));
  const energyByLevel = entriesByEnergy(entries, bounds);
  const insights = mindInsights(governanceLogMarkdown, bounds).map(entry => {
    const extras = parseInsightExtras(entry.body);
    return { ...entry, ...extras };
  });
  const tensions = insights
    .filter(entry => entry.tension)
    .map(entry => (entry.tension.stated != null ? { ...entry, ...entry.tension } : entry));
  const newestSession = allSessions.at(-1) ?? null;
  const newestDiary = entries.at(-1) ?? null;
  const launchers = {
    vera: newestSession
      ? {
        title: newestSession.title,
        daysAgo: daysBetween(newestSession.date, date),
        outcome: sessionOutcome(newestSession)
      }
      : null,
    penelope: newestDiary
      ? {
        daysAgo: daysBetween(newestDiary.date, date),
        outcome: 'logged'
      }
      : null
  };
  const weekly = themeWeekly(entries, allSessions, bounds);
  const crossAgentLines = mindCrossAgentLines(centralNodeMarkdown);
  const diaryGap = daysSinceLastDiary(entries, date);
  const sessionGap = daysSinceLastMindSession(allSessions, date);
  const trend = moodSeries.length >= 2
    ? (moodSeries.at(-1).value - moodSeries[0].value)
    : null;
  const trendWord = trend == null
    ? null
    : trend > 0.5 ? 'Mood scores ticked up' : trend < -0.5 ? 'Mood scores eased down' : 'Mood scores held';
  const ambient = [
    trendWord,
    diaryGap == null ? 'no diary yet' : `last diary ${diaryGap}d ago`,
    sessionGap == null ? 'no Vera session yet' : `last Vera session ${sessionGap}d ago`
  ].filter(Boolean).join(' · ') + '.';

  return {
    date,
    range: selectedRange,
    rangeLabel: RANGE_LABELS[selectedRange],
    entryCount: inRangeEntries.length,
    bounds,
    moodSeries,
    moodRadial,
    energyOrbit,
    previousEnergyOrbit,
    byMood,
    themes,
    sessions,
    energyByLevel,
    insights,
    crossAgentLines,
    daysSinceLastDiary: diaryGap,
    daysSinceLastMindSession: sessionGap,
    silence: silenceFlag(diaryGap, sessionGap),
    ambient,
    empty: inRangeEntries.length === 0 && sessions.length === 0,
    launchers,
    factorEffects: factorEffects(entries, allSessions, bounds),
    consistency: consistencyRing(entries, allSessions, date),
    themeNodes: nodes,
    themeCooccurrence: themeCooccurrence(entries, allSessions, bounds),
    previousThemeCooccurrence: themeCooccurrence(entries, allSessions, previousBounds),
    themeWeekly: weekly,
    themeRanks: themeRanks(weekly),
    moodTransitions: moodTransitions(entries, bounds),
    lexical: lexicalSeries(entries, allSessions, bounds, watchlist),
    butterfly: butterfly(entries, allSessions, bounds),
    resurfacing: resurfacing(entries, allSessions, date),
    waffle: waffleEntries(entries, allSessions, bounds),
    cadence: cadenceHits(entries, allSessions),
    tensions,
    diary: entries
  };
}
