import { buildRingTarget } from './chart-kit/ring.js';
import { addCalendarDays, enumerateDateKeys, getSydneyWeekStart, isCalendarDate } from '../core/time.js';

export const CN_STREAM_DOMAINS = ['nutrition', 'fitness', 'diary', 'body', 'skincare'];

export function buildCompletionRing({ complete, total }, options = {}) {
  return buildRingTarget({ value: complete, target: total }, options);
}

export function weekHorizonMetrics(week = []) {
  return [{
    key: 'protein',
    points: (week ?? []).map(day => ({ date: day.date, value: Number(day.protein_g) || 0 }))
  }];
}

const EDGE_RE = /(?:\*\*)?([A-Za-z][A-Za-z .']*?)(?:\*\*)?\s*→\s*(?:\*\*)?([A-Za-z][A-Za-z .']*?)(?:\*\*)?\s*:/;

function cleanAgent(name) {
  return String(name ?? '').replace(/\*+/g, '').trim();
}

function isClementine(name) {
  return cleanAgent(name).toLowerCase() === 'clementine';
}

export function parseCrossAgentEdges(markdown) {
  const tally = new Map();
  const details = new Map();
  for (const raw of String(markdown ?? '').split('\n')) {
    const line = raw.replace(/^\s*[-*]\s*/, '').trim();
    if (!line) continue;
    const match = EDGE_RE.exec(line);
    if (!match) continue;
    const themeA = cleanAgent(match[1]);
    const themeB = cleanAgent(match[2]);
    if (!themeA || !themeB || isClementine(themeA) || isClementine(themeB)) continue;
    const key = `${themeA}\0${themeB}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
    const bucket = details.get(key) ?? { themeA, themeB, lines: [] };
    bucket.lines.push(line.replace(/^\*+|\*+$/g, '').trim());
    details.set(key, bucket);
  }
  const edges = [...tally.entries()].map(([key, count]) => {
    const [themeA, themeB] = key.split('\0');
    return { themeA, themeB, count };
  });
  return { edges, details: [...details.values()] };
}

export function focusCrossAgentEdges(edges = [], { maxNodes = 8 } = {}) {
  const ranked = [...edges].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  const nodes = new Set();
  for (const edge of ranked) {
    if (nodes.size >= maxNodes) break;
    nodes.add(edge.themeA);
    if (nodes.size >= maxNodes) break;
    nodes.add(edge.themeB);
  }
  return ranked.filter(edge => nodes.has(edge.themeA) && nodes.has(edge.themeB));
}

export function recordDomain(type) {
  if (type === 'meal') return 'nutrition';
  if (type === 'workout') return 'fitness';
  if (type === 'diary' || type === 'mind_session') return 'diary';
  if (type === 'weight' || type === 'composition') return 'body';
  if (type === 'skincare') return 'skincare';
  return null;
}

export function buildDomainWeekly(events, date) {
  if (!isCalendarDate(date)) return { weeks: [], series: [] };
  const year = date.slice(0, 4);
  const from = `${year}-01-01`;
  const days = enumerateDateKeys(from, date);
  const weeks = [];
  for (const day of days) {
    const week = getSydneyWeekStart(day);
    if (weeks.at(-1) !== week) weeks.push(week);
  }
  const indexByWeek = new Map(weeks.map((week, index) => [week, index]));
  const valuesByKey = new Map(CN_STREAM_DOMAINS.map(key => [key, weeks.map(() => 0)]));
  for (const item of events ?? []) {
    const record = item?.record ?? item;
    const domain = recordDomain(record?.type);
    if (!domain || !isCalendarDate(record?.date) || record.date < from || record.date > date) continue;
    const index = indexByWeek.get(getSydneyWeekStart(record.date));
    if (index == null) continue;
    valuesByKey.get(domain)[index] += 1;
  }
  return {
    weeks,
    series: CN_STREAM_DOMAINS
      .map(key => ({ key, values: valuesByKey.get(key) }))
      .filter(item => item.values.some(value => value > 0))
  };
}

export function hitMapFromSeries(series, pred) {
  const byDate = {};
  for (const day of series ?? []) {
    if (day?.date && pred(day)) byDate[day.date] = 'hit';
  }
  return byDate;
}

export function buildGovernanceHeatSeries(openEntries, today, { weekCount = 8 } = {}) {
  if (!isCalendarDate(today)) return [];
  const thisWeek = getSydneyWeekStart(today);
  const weeks = [];
  for (let offset = weekCount - 1; offset >= 0; offset -= 1) {
    weeks.push(addCalendarDays(thisWeek, -offset * 7));
  }
  return (openEntries ?? []).map(entry => {
    const term = entry.title || entry.entryType || 'Open item';
    const opened = isCalendarDate(entry.dateKey) ? entry.dateKey : null;
    return {
      term,
      points: weeks.map(week => {
        const weekEnd = addCalendarDays(week, 6);
        const count = opened == null || opened <= weekEnd ? 1 : 0;
        return { date: week, count };
      })
    };
  });
}

export function scanTrendBlocks(markdown, { limit = 3 } = {}) {
  const blocks = [];
  const source = String(markdown ?? '');
  const re = /\*\*([^*]+):\*\*\s*([\s\S]*?)(?=\n\*\*|$)/g;
  let match = re.exec(source);
  while (match) {
    const body = match[2].trim().split('\n').find(line => line.trim()) ?? '';
    blocks.push({
      label: match[1].trim(),
      line: body.replace(/^[-*]\s*/, '').replace(/\s+/g, ' ').trim()
    });
    match = re.exec(source);
  }
  return {
    preview: blocks.slice(0, limit),
    rest: blocks.slice(limit),
    total: blocks.length
  };
}
