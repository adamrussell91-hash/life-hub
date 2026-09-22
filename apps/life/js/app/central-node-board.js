import { aggregateNutrition } from '../core/aggregate.js';
import { collectOpenLoops, isNeedsYouLoop } from '../core/open-loops.js';
import { addCalendarDays, enumerateDateKeys, getSydneyWeekStart, isCalendarDate } from '../core/time.js';
import { diaryEntries } from './mind-model.js';

const MOOD_SCORE = { great: 9, good: 7, neutral: 5, low: 3, bad: 2 };
const ENERGY_SCORE = { high: 8, medium: 5, low: 3 };
const FLARE_MINUTES = 30;
const DEFAULT_FAT_CEILING = 50;
const KNOWLEDGE_TITLE_ALIASES = [
  { name: 'Gifted education', pattern: /gifted|hpge|talent/i },
  { name: 'Classroom culture', pattern: /classroom|culture|belonging|engagement/i },
  { name: 'ADHD / attention', pattern: /adhd|attention|executive/i },
  { name: 'Module B', pattern: /module b|aotfw|textual|floating world/i },
  { name: 'Crohn\'s / health', pattern: /crohn|ibd|flare|stelara|diet/i }
];
const KNOWLEDGE_TOPIC_CAP = 8;

function recordOf(event) {
  return event?.record ?? event;
}

export function parseWeightTarget(constraintsText) {
  const match = String(constraintsText ?? '').match(/(\d{2}(?:\.\d)?)\s*[–-]\s*(\d{2}(?:\.\d)?)\s*kg/i);
  if (!match) return null;
  return { low: Number(match[1]), high: Number(match[2]) };
}

export function buildFatSeries(events, date, { days = 10, fatCeiling = DEFAULT_FAT_CEILING } = {}) {
  if (!isCalendarDate(date)) return { days: [], fatCeiling };
  const keys = enumerateDateKeys(addCalendarDays(date, -(days - 1)), date);
  return {
    fatCeiling,
    days: keys.map(day => {
      const nutrition = aggregateNutrition(events, day);
      return {
        date: day,
        fat_g: nutrition.fat_g,
        logged: nutrition.fat_g > 0 || nutrition.calories > 0,
        over: fatCeiling > 0 && nutrition.fat_g > fatCeiling
      };
    }).filter(day => day.logged || day.fat_g > 0)
  };
}

export function buildWeightPoint(events) {
  const weights = (events ?? [])
    .map(recordOf)
    .filter(record => (record?.type === 'weight' || record?.type === 'composition')
      && isCalendarDate(record.date)
      && Number.isFinite(Number(record.weight_kg)))
    .sort((a, b) => a.date.localeCompare(b.date));
  const last = weights.at(-1);
  if (!last) return null;
  return { date: last.date, weight_kg: Number(last.weight_kg) };
}

export function buildTrainingWeeks(events, date, { weeks = 6 } = {}) {
  if (!isCalendarDate(date)) return [];
  const start = getSydneyWeekStart(addCalendarDays(date, -((weeks - 1) * 7)));
  const rows = [];
  for (let i = 0; i < weeks; i += 1) {
    const weekStart = addCalendarDays(start, i * 7);
    const weekEnd = addCalendarDays(weekStart, 6);
    const keys = new Set(enumerateDateKeys(weekStart, weekEnd > date ? date : weekEnd));
    let minutes = 0;
    for (const event of events ?? []) {
      const record = recordOf(event);
      if (record?.type !== 'workout' || record.status !== 'completed' || !keys.has(record.date)) continue;
      minutes += Number(record.duration_min) || 0;
    }
    rows.push({
      weekStart,
      minutes,
      over: minutes > FLARE_MINUTES,
      cap: FLARE_MINUTES
    });
  }
  return rows;
}

export function buildMoodStrip(events, date, { days = 14 } = {}) {
  if (!isCalendarDate(date)) return [];
  const byDate = new Map();
  for (const entry of diaryEntries(events)) {
    const mood = Number.isFinite(entry.mood_score) ? entry.mood_score : (MOOD_SCORE[entry.mood] ?? 0);
    const energy = ENERGY_SCORE[entry.energy] ?? 0;
    byDate.set(entry.date, { date: entry.date, mood, energy, logged: true });
  }
  return enumerateDateKeys(addCalendarDays(date, -(days - 1)), date).map(day => (
    byDate.get(day) ?? { date: day, mood: 0, energy: 0, logged: false }
  ));
}

export function parseDepositLines(text) {
  return String(text ?? '')
    .split('\n')
    .map(line => line.replace(/^\s*[-*]\s*/, '').trim())
    .filter(line => line && !line.startsWith('<!--'))
    .map(line => {
      const edge = line.match(/^(?:\*\*)?([A-Za-z][A-Za-z .']*?)(?:\*\*)?\s*→\s*(?:\*\*)?([A-Za-z][A-Za-z .']*?)(?:\*\*)?\s*:\s*(.*)$/);
      if (edge) return { from: edge[1].trim(), to: edge[2].trim(), text: edge[3].trim(), raw: line };
      return { from: '', to: '', text: line.replace(/^\*\*?[\d A-Za-z./:-]+\*\*?:?\s*/, ''), raw: line };
    })
    .filter(item => item.text);
}

export function buildHubLoad({ date, days = 7, scheduledLessons = [], tasks = [], events = [] } = {}) {
  if (!isCalendarDate(date)) return { days: [], hubs: [] };
  const keys = enumerateDateKeys(date, addCalendarDays(date, days - 1));
  const teaching = Object.fromEntries(keys.map(day => [day, 0]));
  const taskCounts = Object.fromEntries(keys.map(day => [day, 0]));
  const life = Object.fromEntries(keys.map(day => [day, 0]));

  for (const row of scheduledLessons ?? []) {
    if (!row || !keys.includes(row.date)) continue;
    if (row.delivery_status === 'cancelled' || row.delivery_status === 'skipped') continue;
    teaching[row.date] += 1;
  }
  for (const task of tasks ?? []) {
    if (!task || task.status === 'done' || task.status === 'dead' || task.completed_at) continue;
    if (!keys.includes(task.due_date)) continue;
    taskCounts[task.due_date] += 1;
  }
  for (const event of events ?? []) {
    const record = recordOf(event);
    if (record?.type !== 'workout' || !keys.includes(record.date)) continue;
    if (record.status !== 'planned' && record.status !== 'completed') continue;
    life[record.date] += 1;
  }

  const hubs = [
    { name: 'Teaching', vals: keys.map(day => teaching[day]) },
    { name: 'Tasks', vals: keys.map(day => taskCounts[day]) },
    { name: 'Life', vals: keys.map(day => life[day]) }
  ].filter(hub => hub.vals.some(value => value > 0));

  return {
    days: keys,
    hubs,
    stack: keys.map((_, index) => hubs.filter(hub => hub.vals[index] > 0).length)
  };
}

function calendarDay(value) {
  if (isCalendarDate(value)) return value;
  const slice = String(value ?? '').slice(0, 10);
  return isCalendarDate(slice) ? slice : '';
}

function pageStamp(page) {
  return calendarDay(page?.updated_at) || calendarDay(page?.created_at) || calendarDay(page?.date);
}

function originLabels(page, kind) {
  return (Array.isArray(page?.origins) ? page.origins : [])
    .filter(origin => origin && origin.kind === kind && typeof origin.label === 'string' && origin.label.trim())
    .map(origin => origin.label.trim());
}

function knowledgeLabelsForPage(page) {
  const books = originLabels(page, 'book');
  if (books.length) return books;
  const tags = (Array.isArray(page?.tags) ? page.tags : [])
    .map(tag => String(tag ?? '').trim())
    .filter(Boolean);
  if (tags.length) return tags;
  const notebooks = originLabels(page, 'notebook');
  if (notebooks.length) return notebooks;
  const haystack = [page?.title, page?.excerpt].filter(Boolean).join(' ');
  return KNOWLEDGE_TITLE_ALIASES.filter(alias => alias.pattern.test(haystack)).map(alias => alias.name);
}

export function buildKnowledgeTopics(pages, date, { weeks = 6 } = {}) {
  if (!isCalendarDate(date)) return { weeks: [], topics: [] };
  const start = getSydneyWeekStart(addCalendarDays(date, -((weeks - 1) * 7)));
  const weekStarts = Array.from({ length: weeks }, (_, index) => addCalendarDays(start, index * 7));
  const counts = new Map();

  for (const page of pages ?? []) {
    const day = pageStamp(page);
    if (!day) continue;
    const weekIndex = weekStarts.indexOf(getSydneyWeekStart(day));
    if (weekIndex < 0) continue;
    for (const name of knowledgeLabelsForPage(page)) {
      const row = counts.get(name) ?? { name, vals: weekStarts.map(() => 0), books: originLabels(page, 'book').includes(name) };
      row.vals[weekIndex] += 1;
      if (originLabels(page, 'book').includes(name)) row.books = true;
      counts.set(name, row);
    }
  }

  const topics = [...counts.values()]
    .filter(topic => topic.vals.some(value => value > 0))
    .sort((left, right) => {
      if (left.books !== right.books) return left.books ? -1 : 1;
      const rightTotal = right.vals.reduce((sum, value) => sum + value, 0);
      const leftTotal = left.vals.reduce((sum, value) => sum + value, 0);
      return rightTotal - leftTotal || left.name.localeCompare(right.name);
    })
    .slice(0, KNOWLEDGE_TOPIC_CAP)
    .map(({ name, vals }) => ({ name, vals }));

  return { weeks: weekStarts, topics };
}

export function loopId(loop) {
  return [loop?.source, loop?.dateKey ?? '', loop?.title ?? ''].join(':');
}

export function buildBoardLoops({
  today,
  governanceLogMarkdown = '',
  centralNodeMarkdown = '',
  weekFlags = null,
  tasks = [],
  hiddenIds = []
} = {}) {
  const hidden = new Set(hiddenIds ?? []);
  const loops = collectOpenLoops({
    today,
    governanceLogMarkdown,
    centralNodeMarkdown,
    weekFlags,
    tasks
  }).filter(loop => !hidden.has(loopId(loop)));
  const needsYou = loops.filter(isNeedsYouLoop).slice(0, 2);
  return { loops, needsYou };
}
