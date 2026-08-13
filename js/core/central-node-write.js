import {
  RECENT_ACTIONS_HEADING,
  TODAYS_STATUS_HEADING,
  CROSS_AGENT_HEADING
} from './constraints.js';
import { addCalendarDays, getSydneyWeekStart, isCalendarDate } from './time.js';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const STATUS_HEADING_RE = /^## ⚡ Today's Status.*$/m;
const THIS_WEEK_HEADING_RE = /^## 📅 This Week \((.+?)\)\s*$/m;
const THIS_MONTH_HEADING_RE = /^## 📊 This Month \((.+?)\)\s*$/m;
const NEXT_SECTION_RE = /\n## /;

export function formatStatusHeadingDate(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 2, 0, 0));
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Australia/Sydney'
  }).format(date);
}

export function formatLogDate(dateKey) {
  const [, month, day] = dateKey.split('-').map(Number);
  return `${day} ${SHORT_MONTHS[month - 1]}`;
}

export function buildNutritionStatusLine(totals) {
  const parts = [
    totals.calories != null ? `${Number(totals.calories).toLocaleString('en-AU')} kcal` : null,
    totals.protein_g != null ? `${totals.protein_g}g P` : null,
    totals.fat_g != null ? `${totals.fat_g}g F` : null,
    totals.sodium_mg != null ? `${Number(totals.sodium_mg).toLocaleString('en-AU')}mg Na` : null,
    totals.calcium_mg != null ? `${Number(totals.calcium_mg).toLocaleString('en-AU')}mg Ca` : null,
    totals.polyphenol_score != null ? `polyphenol ${totals.polyphenol_score}` : null
  ].filter(Boolean);
  return `**Nutrition:** ${parts.length > 0 ? `${parts.join(', ')}.` : 'No meals logged.'}`;
}

export function buildMealFlagsLine(notes) {
  const text = typeof notes === 'string' ? notes.trim().replace(/\s+/g, ' ') : '';
  if (!text) return null;
  const compact = text.length > 140 ? `${text.slice(0, 137)}...` : text;
  return `**Flags:** ${compact}`;
}

export function buildExerciseStatusLine(record) {
  const duration = record.duration_min != null ? `${record.duration_min} min` : null;
  const title = record.title ? record.title : (record.day_type ?? 'workout');
  const bits = [title, duration, record.status].filter(Boolean);
  return `**Exercise:** ${bits.join(' · ')}.`;
}

export function appendRecentAction(content, line) {
  const headingIndex = content.indexOf(RECENT_ACTIONS_HEADING);
  if (headingIndex === -1) return content;
  const insertAt = headingIndex + RECENT_ACTIONS_HEADING.length;
  const normalized = line.startsWith('\n') ? line : `\n${line}`;
  return `${content.slice(0, insertAt)}${normalized}${content.slice(insertAt)}`;
}

export function appendCrossAgentLine(content, line) {
  const headingIndex = content.indexOf(CROSS_AGENT_HEADING);
  if (headingIndex === -1) return content;
  const insertAt = headingIndex + CROSS_AGENT_HEADING.length;
  const normalized = line.startsWith('\n') ? line : `\n${line}`;
  const bullet = normalized.includes('- ') ? normalized : `\n- ${line.replace(/^\n/, '')}`;
  return `${content.slice(0, insertAt)}${bullet}${content.slice(insertAt)}`;
}

export function replaceTodaysStatus(content, { dateKey, body }) {
  const heading = `${TODAYS_STATUS_HEADING} (${formatStatusHeadingDate(dateKey)})`;
  const section = `${heading}\n${body.trim()}\n`;
  const match = STATUS_HEADING_RE.exec(content);
  if (!match) {
    const recentIndex = content.indexOf(RECENT_ACTIONS_HEADING);
    if (recentIndex === -1) return `${content.trimEnd()}\n---\n${section}`;
    return `${content.slice(0, recentIndex)}${section}---\n${content.slice(recentIndex)}`;
  }

  const start = match.index;
  const afterHeading = content.slice(start + match[0].length);
  const endRel = NEXT_SECTION_RE.exec(afterHeading);
  const end = endRel ? start + match[0].length + endRel.index : content.length;
  return `${content.slice(0, start)}${section}${content.slice(end).replace(/^\n?/, '')}`;
}

export function upsertStatusField(statusBody, fieldLabel, fieldLine) {
  const pattern = new RegExp(`^\\*\\*${fieldLabel}:\\*\\*.*$`, 'm');
  if (pattern.test(statusBody)) return statusBody.replace(pattern, fieldLine);
  const trimmed = statusBody.trim();
  return trimmed ? `${trimmed}\n${fieldLine}` : fieldLine;
}

export function humanizeDayType(dayType) {
  switch (dayType) {
    case 'workout_30': return '30-min Workout';
    case 'workout_45_60': return '45–60 min Workout';
    case 'movement': return 'Movement day';
    default: return dayType ?? 'Workout';
  }
}

// Cross-Agent Coordination is capped so the section cannot silently grow unbounded.
// Its own header says "purge once actioned" and nothing ever did: by Aug 2026 it held
// ~15 stale auto-generated Day Type directives, all injected into every specialist turn.
// Hammond owns semantic purge (condense op); this is the mechanical floor underneath him.
export const MAX_CROSS_AGENT_LINES = 12;

export function trimCrossAgentSection(content, { maxLines = MAX_CROSS_AGENT_LINES } = {}) {
  const headingIndex = content.indexOf(CROSS_AGENT_HEADING);
  if (headingIndex === -1) return content;
  const sectionStart = headingIndex + CROSS_AGENT_HEADING.length;
  const after = content.slice(sectionStart);
  const endRel = after.search(/\n## /);
  const section = endRel === -1 ? after : after.slice(0, endRel);
  const rest = endRel === -1 ? '' : after.slice(endRel);

  const lines = section.split('\n');
  const directiveIndexes = lines
    .map((line, index) => (/^\s*[-*]\s+\S/.test(line) ? index : -1))
    .filter(index => index !== -1);
  if (directiveIndexes.length <= maxLines) return content;

  // Newest directives are inserted at the top, so drop from the tail.
  const dropFrom = new Set(directiveIndexes.slice(maxLines));
  const kept = lines.filter((_, index) => !dropFrom.has(index));
  return `${content.slice(0, sectionStart)}${kept.join('\n')}${rest}`;
}

export function extractTodaysStatusBlock(content) {
  const match = STATUS_HEADING_RE.exec(content);
  if (!match) return { heading: null, body: '', dateKey: null };
  const afterHeading = content.slice(match.index + match[0].length);
  const endRel = NEXT_SECTION_RE.exec(afterHeading);
  const rawBody = (endRel ? afterHeading.slice(0, endRel.index) : afterHeading).trim();
  const body = rawBody.replace(/\n---\s*$/u, '').trim();
  return { heading: match[0], body, dateKey: parseStatusHeadingDateKey(match[0]) };
}

const MONTH_INDEX = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12
};

function parseStatusHeadingDateKey(heading) {
  const match = /\((?:[A-Za-z]+,\s*)?(?:[A-Za-z]+\s+)?(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\)/.exec(heading);
  if (!match) return null;
  const day = Number(match[1]);
  const month = MONTH_INDEX[match[2].toLowerCase()];
  const year = Number(match[3]);
  if (!month || !Number.isFinite(day) || !Number.isFinite(year)) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function toDateKey(year, month, day) {
  if (!month || !Number.isFinite(day) || !Number.isFinite(year)) return null;
  const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isCalendarDate(key) ? key : null;
}

/** Parse the trailing end-date of a This Week range like `16 – 22 June 2026` or `27 Jul – 2 Aug 2026`. */
export function parseThisWeekEndDateKey(rangeText) {
  if (typeof rangeText !== 'string') return null;
  const text = rangeText.trim();
  const cross = /^(\d{1,2})\s+([A-Za-z]+)\s*[–-]\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(text);
  if (cross) {
    return toDateKey(Number(cross[5]), MONTH_INDEX[cross[4].toLowerCase()], Number(cross[3]));
  }
  const same = /^(\d{1,2})\s*[–-]\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(text);
  if (same) {
    return toDateKey(Number(same[4]), MONTH_INDEX[same[3].toLowerCase()], Number(same[2]));
  }
  return null;
}

/** Parse a This Month label like `April 2026`. */
export function parseThisMonthLabel(label) {
  if (typeof label !== 'string') return null;
  const match = /^([A-Za-z]+)\s+(\d{4})$/.exec(label.trim());
  if (!match) return null;
  const month = MONTH_INDEX[match[1].toLowerCase()];
  const year = Number(match[2]);
  if (!month || !Number.isFinite(year)) return null;
  return { year, month };
}

function formatDayMonthYear(dateKey, { shortMonth = false } = {}) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const monthName = shortMonth ? SHORT_MONTHS[month - 1] : LONG_MONTHS[month - 1];
  return { year, month, day, monthName };
}

export function formatThisWeekHeading(mondayKey) {
  const sundayKey = addCalendarDays(mondayKey, 6);
  const start = formatDayMonthYear(mondayKey, { shortMonth: mondayKey.slice(0, 7) !== sundayKey.slice(0, 7) });
  const end = formatDayMonthYear(sundayKey, { shortMonth: mondayKey.slice(0, 7) !== sundayKey.slice(0, 7) });
  if (start.month === end.month && start.year === end.year) {
    return `## 📅 This Week (${start.day} – ${end.day} ${end.monthName} ${end.year})`;
  }
  return `## 📅 This Week (${start.day} ${start.monthName} – ${end.day} ${end.monthName} ${end.year})`;
}

export function formatThisMonthHeading(dateKey) {
  const { year, monthName } = formatDayMonthYear(dateKey);
  return `## 📊 This Month (${monthName} ${year})`;
}

function replaceHeadingClearBody(content, headingRe, newHeading) {
  const match = headingRe.exec(content);
  if (!match) return content;
  const start = match.index;
  const afterHeading = content.slice(start + match[0].length);
  const endRel = NEXT_SECTION_RE.exec(afterHeading);
  const end = endRel ? start + match[0].length + endRel.index : content.length;
  return `${content.slice(0, start)}${newHeading}\n${content.slice(end).replace(/^\n?/, '')}`;
}

/**
 * Mechanically advance stale This Week / This Month headings and clear their bodies.
 * Malformed or missing headings are left untouched. Not a Hammond-authored patch.
 */
export function rollStaleSections(content, today) {
  if (typeof content !== 'string' || !isCalendarDate(today)) return content;
  let next = content;

  const weekMatch = THIS_WEEK_HEADING_RE.exec(next);
  if (weekMatch) {
    const endKey = parseThisWeekEndDateKey(weekMatch[1]);
    if (endKey && today > endKey) {
      next = replaceHeadingClearBody(next, THIS_WEEK_HEADING_RE, formatThisWeekHeading(getSydneyWeekStart(today)));
    }
  }

  const monthMatch = THIS_MONTH_HEADING_RE.exec(next);
  if (monthMatch) {
    const parsed = parseThisMonthLabel(monthMatch[1]);
    if (parsed) {
      const [year, month] = today.split('-').map(Number);
      if (year > parsed.year || (year === parsed.year && month > parsed.month)) {
        next = replaceHeadingClearBody(next, THIS_MONTH_HEADING_RE, formatThisMonthHeading(today));
      }
    }
  }

  return next;
}

export function applyLogToCentralNode(content, {
  record,
  actionLine,
  nutritionTotals = null,
  flagNotes = null,
  preserveOtherStatusFields = true
}) {
  let next = appendRecentAction(content, actionLine);
  const existing = extractTodaysStatusBlock(next);
  const sameDay = existing.dateKey === record.date;
  let body = sameDay && preserveOtherStatusFields ? existing.body : '';

  if (record.type === 'meal' && nutritionTotals) {
    body = upsertStatusField(body, 'Nutrition', buildNutritionStatusLine(nutritionTotals));
    const flags = buildMealFlagsLine(flagNotes);
    if (flags) body = upsertStatusField(body, 'Flags', flags);
  } else if (record.type === 'workout') {
    body = upsertStatusField(body, 'Exercise', buildExerciseStatusLine(record));
  } else if (record.type === 'diary') {
    const mood = record.mood_score != null ? `${record.mood_score}/10` : (record.mood ?? 'logged');
    body = upsertStatusField(body, 'Mood', `**Mood:** ${mood}.`);
    if (record.energy) body = upsertStatusField(body, 'Energy', `**Energy:** ${record.energy}.`);
  } else if (record.type === 'mind_session') {
    const theme = record.theme ? String(record.theme).trim() : 'session logged';
    body = upsertStatusField(body, 'Mind', `**Mind:** ${theme}.`);
  } else if (record.type === 'weight' || record.type === 'composition') {
    const weight = record.weight_kg != null ? `${record.weight_kg} kg` : 'logged';
    body = upsertStatusField(body, 'Health', `**Health:** Weight ${weight}.`);
    const flags = buildMealFlagsLine(flagNotes);
    if (flags) body = upsertStatusField(body, 'Flags', flags);
  } else if (record.type === 'measurements') {
    body = upsertStatusField(body, 'Health', '**Health:** Measurements logged.');
    const flags = buildMealFlagsLine(flagNotes);
    if (flags) body = upsertStatusField(body, 'Flags', flags);
  } else if (record.type === 'skincare') {
    const flags = buildMealFlagsLine(flagNotes)
      ?? `**Flags:** Skincare ${record.routine ?? ''} logged.`.replace(/\s+/g, ' ').trim();
    body = upsertStatusField(body, 'Flags', flags);
  } else {
    return next;
  }

  next = replaceTodaysStatus(next, { dateKey: record.date, body });
  if (typeof record.cross_agent_note === 'string' && record.cross_agent_note.trim()) {
    next = appendCrossAgentLine(next, `- ${record.cross_agent_note.trim()}`);
  }
  // Day Type used to be auto-written here as a "Chadwick→Brisket" directive. It was a
  // Notion day-page property that outlived its database: resolveDayType() already derives
  // it from the workout record and getDayTargets() has already applied it to the targets
  // Brisket reads, so the line instructed him to set a value that was computed and used
  // two steps earlier. Removed 2026-08-11; the honest signal is Today's Status Exercise.
  next = trimCrossAgentSection(next);
  next = rollStaleSections(next, record.date);
  next = purgeStaleRecentActions(next, record.date);
  return next;
}

/**
 * Purge Recent Agent Actions bullets older than the declared rolling window.
 * Bullets are day-month only (`**30 Jul:** …`); year is inferred from `today`.
 * Unparseable lines are kept (never silently dropped).
 */
export function purgeStaleRecentActions(content, today, { windowHours = 48 } = {}) {
  if (typeof content !== 'string' || !isCalendarDate(today)) return content;
  const headingIndex = content.indexOf(RECENT_ACTIONS_HEADING);
  if (headingIndex === -1) return content;

  const sectionStart = headingIndex + RECENT_ACTIONS_HEADING.length;
  const after = content.slice(sectionStart);
  const endRel = after.search(/\n## /);
  const section = endRel === -1 ? after : after.slice(0, endRel);
  const rest = endRel === -1 ? '' : after.slice(endRel);

  const windowDays = Math.max(1, Math.ceil(windowHours / 24));
  const cutoff = addCalendarDays(today, -(windowDays - 1));
  const lines = section.split('\n');
  const kept = lines.filter(line => {
    const parsed = parseRecentActionDateKey(line, today);
    if (!parsed) return true; // malformed / non-bullet — keep
    return parsed >= cutoff;
  });
  if (kept.length === lines.length) return content;
  return `${content.slice(0, sectionStart)}${kept.join('\n')}${rest}`;
}

/** Parse `**30 Jul:** …` style leading dates into a YYYY-MM-DD near `today`. */
export function parseRecentActionDateKey(line, today) {
  if (typeof line !== 'string' || !isCalendarDate(today)) return null;
  const match = /^\s*\*\*(\d{1,2})\s+([A-Za-z]{3,9}):\*\*/.exec(line);
  if (!match) return null;
  const day = Number(match[1]);
  const month = MONTH_INDEX[match[2].toLowerCase()];
  if (!month || !Number.isFinite(day)) return null;

  const year = Number(today.slice(0, 4));
  let key = toDateKey(year, month, day);
  if (!key) return null;
  // If the stamped day sits in the future relative to today, it was last year.
  if (key > today) {
    key = toDateKey(year - 1, month, day);
  }
  return key;
}

export { TODAYS_STATUS_HEADING, RECENT_ACTIONS_HEADING, CROSS_AGENT_HEADING };
