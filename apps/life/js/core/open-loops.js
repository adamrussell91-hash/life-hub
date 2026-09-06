import { extractCrossAgentCoordination } from './constraints.js';
import { openGovernanceEntries } from './governance-log.js';
import { daysBetween, getSydneyWeekStart, isCalendarDate } from './time.js';

export const WEEK_FLAGS_PATH = 'data/remember/week-flags.json';

const TITLE_MAX = 80;
const DATE_IN_TEXT = /(?:since|opened|from|due|until|by|as of)\s+(\d{4}-\d{2}-\d{2})/i;
const EDGE_RE = /(?:\*\*)?([A-Za-z][A-Za-z .']*?)(?:\*\*)?\s*→\s*(?:\*\*)?([A-Za-z][A-Za-z .']*?)(?:\*\*)?\s*:/;

function clipTitle(text) {
  const title = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!title) return '';
  return title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 1).trimEnd()}…` : title;
}

function dateKeyFrom(value) {
  if (isCalendarDate(value)) return value;
  if (typeof value === 'string' && isCalendarDate(value.slice(0, 10))) return value.slice(0, 10);
  return null;
}

function withAge(loop, today) {
  if (!isCalendarDate(today) || !isCalendarDate(loop.dateKey)) return { ...loop };
  return { ...loop, ageDays: daysBetween(loop.dateKey, today) };
}

function sortOpenLoops(items) {
  const now = [];
  const later = [];
  const trash = [];
  for (const item of items) {
    if (item.kind === 'note' && !item.due_date && item.priority === 'low') {
      trash.push(item);
      continue;
    }
    if (item.kind === 'note' || item.priority === 'low') {
      later.push(item);
      continue;
    }
    if (item.kind === 'communication' || item.due_date || item.priority === 'high' || item.priority === 'urgent') {
      now.push(item);
      continue;
    }
    later.push(item);
  }
  return { now, later, trash };
}

function fromGovernance(markdown, today) {
  return openGovernanceEntries(markdown ?? '', today).map(entry => withAge({
    source: 'governance',
    owner: 'Hammond',
    title: clipTitle(entry.title || entry.entryType || 'Open loop'),
    dateKey: isCalendarDate(entry.dateKey) ? entry.dateKey : null
  }, today));
}

function fromCrossAgent(markdown, today) {
  const loops = [];
  for (const raw of String(extractCrossAgentCoordination(markdown ?? '')).split('\n')) {
    const line = raw.replace(/^\s*[-*]\s*/, '').trim().replace(/^\*+|\*+$/g, '').trim();
    if (!line || line.startsWith('<!--') || !EDGE_RE.test(line)) continue;
    const title = clipTitle(line);
    if (!title) continue;
    const match = DATE_IN_TEXT.exec(line);
    const dateKey = match && isCalendarDate(match[1]) ? match[1] : today;
    loops.push(withAge({
      source: 'cross_agent',
      owner: 'Cross-agent',
      title,
      dateKey: isCalendarDate(dateKey) ? dateKey : null
    }, today));
  }
  return loops;
}

function fromClareLater(tasks, today) {
  const open = (Array.isArray(tasks) ? tasks : []).filter(task =>
    task
    && typeof task.title === 'string'
    && task.title.trim()
    && task.status !== 'done'
    && task.status !== 'dead'
    && !task.completed_at
  );
  return sortOpenLoops(open).later.map(task => withAge({
    source: 'clare_later',
    owner: 'Clare',
    title: clipTitle(task.title),
    dateKey: dateKeyFrom(task.created_at) || dateKeyFrom(task.due_date)
  }, today));
}

function fromStaleWeekFlags(weekFlags, today) {
  const weeks = weekFlags?.weeks && typeof weekFlags.weeks === 'object' ? weekFlags.weeks : {};
  const currentWeek = isCalendarDate(today) ? getSydneyWeekStart(today) : null;
  const loops = [];
  for (const [weekId, flags] of Object.entries(weeks)) {
    if (!isCalendarDate(weekId) || !currentWeek || weekId >= currentWeek) continue;
    if (!flags || typeof flags !== 'object' || Array.isArray(flags)) continue;
    for (const [key, value] of Object.entries(flags)) {
      if (value == null || value === false) continue;
      const label = value === true ? key : `${key}: ${value}`;
      loops.push(withAge({
        source: 'stale_flag',
        owner: 'Remember',
        title: clipTitle(label),
        dateKey: weekId
      }, today));
    }
  }
  return loops;
}

function fromStressFlags(flags, today) {
  return (Array.isArray(flags) ? flags : [])
    .filter(flag => flag && typeof flag.pattern_description === 'string' && flag.pattern_description.trim())
    .map(flag => withAge({
      source: 'stress_flag',
      owner: 'Tasks',
      title: clipTitle(flag.pattern_description),
      dateKey: dateKeyFrom(flag.created_at)
    }, today));
}

function fromExpiringBriefs(briefs, today) {
  return (Array.isArray(briefs) ? briefs : [])
    .filter(brief => {
      const expires = dateKeyFrom(brief?.expires_at);
      return expires && expires <= today && typeof brief.title === 'string' && brief.title.trim();
    })
    .map(brief => withAge({
      source: 'research_brief',
      owner: 'Research',
      title: clipTitle(brief.title),
      dateKey: dateKeyFrom(brief.expires_at)
    }, today));
}

export function collectOpenLoops({
  today,
  governanceLogMarkdown = '',
  centralNodeMarkdown = '',
  weekFlags = null,
  tasks = [],
  stressFlags = [],
  researchBriefs = []
} = {}) {
  if (!isCalendarDate(today)) return [];
  return [
    ...fromGovernance(governanceLogMarkdown, today),
    ...fromCrossAgent(centralNodeMarkdown, today),
    ...fromClareLater(tasks, today),
    ...fromStaleWeekFlags(weekFlags, today),
    ...fromStressFlags(stressFlags, today),
    ...fromExpiringBriefs(researchBriefs, today)
  ].filter(loop => loop.title);
}

export function oldestOpenLoop(loops) {
  const list = Array.isArray(loops) ? loops : [];
  if (list.length === 0) return null;
  return [...list].sort((a, b) => {
    const aOk = isCalendarDate(a.dateKey);
    const bOk = isCalendarDate(b.dateKey);
    if (aOk && bOk) return a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0;
    if (aOk) return -1;
    if (bOk) return 1;
    return 0;
  })[0];
}

export function formatOpenLoopLine(loop) {
  if (!loop || typeof loop.owner !== 'string' || typeof loop.title !== 'string') return null;
  const age = typeof loop.ageDays === 'number' ? ` — ${loop.ageDays}d open.` : '.';
  return `${loop.owner}: ${loop.title}${age}`;
}

export function parseWeekFlags(content) {
  if (typeof content !== 'string' || !content.trim()) return { weeks: {} };
  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { weeks: {} };
    const weeks = parsed.weeks && typeof parsed.weeks === 'object' && !Array.isArray(parsed.weeks)
      ? parsed.weeks
      : {};
    return { ...parsed, weeks };
  } catch {
    return { weeks: {} };
  }
}
