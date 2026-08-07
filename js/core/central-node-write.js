import {
  RECENT_ACTIONS_HEADING,
  TODAYS_STATUS_HEADING,
  CROSS_AGENT_HEADING
} from './constraints.js';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STATUS_HEADING_RE = /^## ⚡ Today's Status.*$/m;
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
    totals.calcium_mg != null ? `${Number(totals.calcium_mg).toLocaleString('en-AU')}mg Ca` : null
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

export function buildCrossAgentDayTypeLine(record) {
  const title = record.title?.trim() || 'session';
  return `- Chadwick→Brisket: ${formatLogDate(record.date)} session completed, ${title}. Set Day Type to ${humanizeDayType(record.day_type)}.`;
}

export function appendCrossAgentDayType(content, record) {
  if (record?.type !== 'workout' || record.status !== 'completed') return content;
  const line = buildCrossAgentDayTypeLine(record);
  const headingIndex = content.indexOf(CROSS_AGENT_HEADING);
  if (headingIndex === -1) return content;
  const dateToken = formatLogDate(record.date);
  const sectionStart = headingIndex + CROSS_AGENT_HEADING.length;
  const after = content.slice(sectionStart);
  const endRel = after.search(/\n## /);
  const section = endRel === -1 ? after : after.slice(0, endRel);
  if (section.includes(dateToken) && section.includes('Set Day Type to') && section.includes('Chadwick→Brisket')) {
    return content;
  }
  const insertAt = sectionStart;
  return `${content.slice(0, insertAt)}\n${line}${content.slice(insertAt)}`;
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
  next = appendCrossAgentDayType(next, record);
  return next;
}

export { TODAYS_STATUS_HEADING, RECENT_ACTIONS_HEADING, CROSS_AGENT_HEADING };
