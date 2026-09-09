import {
  RECENT_ACTIONS_HEADING,
  TODAYS_STATUS_HEADING,
  CROSS_AGENT_HEADING
} from './constraints.js';
import { crossAgentTruncationComment } from './context-integrity.js';
import { formatGrams } from './aggregate.js';
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
    totals.protein_g != null ? `${formatGrams(totals.protein_g)}g P` : null,
    totals.fat_g != null ? `${formatGrams(totals.fat_g)}g F` : null,
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

/** Cap long workout / challenge titles so Status and Recent Actions stay scannable. */
export function compactTitle(title, { max = 48 } = {}) {
  const text = typeof title === 'string' ? title.trim().replace(/\s+/g, ' ') : '';
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

export function buildExerciseStatusLine(record) {
  const rawTitle = record.title ? record.title : (record.day_type ?? 'workout');
  const title = compactTitle(rawTitle) || 'workout';
  const duration = record.duration_min != null ? `${record.duration_min} min` : null;
  const moveCount = Array.isArray(record.exercises) && record.exercises.length > 0
    ? `${record.exercises.length} moves`
    : null;
  const focus = Array.isArray(record.focus)
    ? record.focus.map(item => String(item).trim()).filter(Boolean).slice(0, 4).join('/')
    : null;
  const bits = [title, duration, moveCount, focus || null, record.status].filter(Boolean);
  return `**Exercise:** ${bits.join(' · ')}.`;
}

/** Multi-session Exercise line when more than one finish lands on the same day. */
export function buildMultiExerciseStatusLine(records) {
  const sessions = (Array.isArray(records) ? records : []).filter(Boolean);
  if (sessions.length === 0) return '**Exercise:** none logged.';
  if (sessions.length === 1) return buildExerciseStatusLine(sessions[0]);
  const titles = sessions
    .map(record => compactTitle(record.title || record.day_type || 'session', { max: 28 }))
    .filter(Boolean);
  const totalMin = sessions.reduce((sum, record) => sum + (Number(record.duration_min) || 0), 0);
  const duration = totalMin > 0 ? `${totalMin} min total` : null;
  const bits = [`${sessions.length} sessions`, titles.join('; ') || null, duration].filter(Boolean);
  return `**Exercise:** ${bits.join(' · ')}.`;
}

/** Compact Flags line from workout notes and/or pain_flags (completed sessions). */
export function buildWorkoutFlagsLine(record, notes) {
  const parts = [];
  const noteText = typeof notes === 'string' ? notes.trim().replace(/\s+/g, ' ') : '';
  if (noteText) parts.push(noteText);
  if (Array.isArray(record?.pain_flags)) {
    for (const flag of record.pain_flags) {
      if (!flag || typeof flag !== 'object') continue;
      const site = typeof flag.site === 'string' ? flag.site.trim() : '';
      if (!site) continue;
      const detail = typeof flag.note === 'string' && flag.note.trim()
        ? `${site}: ${flag.note.trim()}`
        : site;
      parts.push(detail);
    }
  }
  if (parts.length === 0) return null;
  const compact = parts.join(' · ');
  const truncated = compact.length > 280 ? `${compact.slice(0, 277)}...` : compact;
  return `**Flags:** ${truncated}`;
}

/** Merge a new Flags line into Status instead of last-writer-wins clobber. */
export function mergeFlagsIntoStatus(body, flagsLine) {
  if (!flagsLine) return body;
  const incoming = String(flagsLine).replace(/^\*\*Flags:\*\*\s*/i, '').trim();
  if (!incoming) return body;
  const match = /\*\*Flags:\*\*\s*(.+)/i.exec(body ?? '');
  if (!match) return upsertStatusField(body, 'Flags', flagsLine);
  const existing = match[1].trim().replace(/\.\.\.$/, '');
  if (existing.includes(incoming.slice(0, Math.min(40, incoming.length)))) return body;
  const merged = `${existing} · ${incoming}`;
  const truncated = merged.length > 280 ? `${merged.slice(0, 277)}...` : merged;
  return upsertStatusField(body, 'Flags', `**Flags:** ${truncated}`);
}

/** One Cross-Agent line per pain flag so Sara sees new session signals. */
export function buildWorkoutPainCrossAgentLines(record) {
  if (!record || record.type !== 'workout' || record.status !== 'completed') return [];
  if (!Array.isArray(record.pain_flags) || record.pain_flags.length === 0) return [];
  const title = typeof record.title === 'string' && record.title.trim()
    ? record.title.trim()
    : 'session';
  const lines = [];
  for (const flag of record.pain_flags) {
    if (!flag || typeof flag !== 'object') continue;
    const site = typeof flag.site === 'string' ? flag.site.trim() : '';
    if (!site) continue;
    const detail = typeof flag.note === 'string' && flag.note.trim()
      ? flag.note.trim().replace(/\s+/g, ' ')
      : 'flagged during session';
    lines.push(`- Chadwick→Sara: ${title} — ${site}: ${detail}`);
  }
  return lines;
}

/**
 * Fingerprint for "one line per action" upserts.
 * Collapses near-duplicates from overwrite/autosave (e.g. planned→completed
 * workout lines that differ only by a leading "30-min " duration prefix,
 * or meal/skincare slot corrections with updated wording).
 */
export function recentActionFingerprint(line) {
  if (typeof line !== 'string') return null;
  const match = /^\s*\*\*(.+?):\*\*\s*(.+?):\s*(.*)$/.exec(line);
  if (!match) return null;
  const dateKey = match[1].trim().toLowerCase();
  const agentKey = match[2].trim().toLowerCase();
  const body = match[3].replace(/\s+/g, ' ').trim();
  if (!dateKey || !agentKey || !body) return null;

  const mealSlot = /\bfor (breakfast|lunch|dinner|snack)\b/i.exec(body);
  if (mealSlot) {
    return `${dateKey}|${agentKey}|meal:${mealSlot[1].toLowerCase()}`;
  }

  const skin = /^Logged (am|pm) skincare\b/i.exec(body);
  if (skin) {
    return `${dateKey}|${agentKey}|skincare:${skin[1].toLowerCase()}`;
  }

  // Workouts: fingerprint by session title so notes/move-count wording can upsert.
  const oldWorkout = /^Logged a (?:\d+-min )?(.+?) session(?: \((.+?)\))?/i.exec(body);
  if (oldWorkout) {
    const fromParens = (oldWorkout[2] ?? '').split(/\s+[—–]\s+/)[0].trim();
    const titleKey = (fromParens || oldWorkout[1]).trim().toLowerCase();
    return `${dateKey}|${agentKey}|workout:${titleKey}`;
  }
  const modernWorkout = /^Logged (.+?)(?:\s*\(|\s+[—–]\s+|\.|$)/i.exec(body);
  if (modernWorkout && /\b(moves?|min|session|workout)\b/i.test(body)) {
    return `${dateKey}|${agentKey}|workout:${modernWorkout[1].trim().toLowerCase()}`;
  }

  return `${dateKey}|${agentKey}|${body.toLowerCase()}`;
}

function splitRecentActionsSection(content) {
  const headingIndex = content.indexOf(RECENT_ACTIONS_HEADING);
  if (headingIndex === -1) return null;
  const sectionStart = headingIndex + RECENT_ACTIONS_HEADING.length;
  const after = content.slice(sectionStart);
  const endRel = after.search(/\n## /);
  const section = endRel === -1 ? after : after.slice(0, endRel);
  const rest = endRel === -1 ? '' : after.slice(endRel);
  return { sectionStart, section, rest };
}

/**
 * Insert under Recent Agent Actions, or replace an existing same-action line.
 * Writing Rules: one line per action — overwrite/autosave must not stack clones.
 */
export function appendRecentAction(content, line) {
  const headingIndex = content.indexOf(RECENT_ACTIONS_HEADING);
  if (headingIndex === -1) return content;
  const bullet = line.replace(/^\n/, '').trim();
  if (!bullet) return content;

  const parts = splitRecentActionsSection(content);
  if (!parts) return content;
  const { sectionStart, section, rest } = parts;
  const fingerprint = recentActionFingerprint(bullet);
  const lines = section.split('\n');

  if (fingerprint) {
    const matchIndexes = lines
      .map((existing, index) => (recentActionFingerprint(existing) === fingerprint ? index : -1))
      .filter(index => index !== -1);
    if (matchIndexes.length > 0) {
      const [first, ...restMatches] = matchIndexes;
      if (lines[first].trim() === bullet && restMatches.length === 0) return content;
      lines[first] = bullet;
      for (const index of restMatches.reverse()) lines.splice(index, 1);
      return `${content.slice(0, sectionStart)}${lines.join('\n')}${rest}`;
    }
  } else if (lines.some(existing => existing.trim() === bullet)) {
    return content;
  }

  const normalized = `\n${bullet}`;
  return `${content.slice(0, sectionStart)}${normalized}${content.slice(sectionStart)}`;
}

/**
 * Collapse stacked same-action bullets (keeps the newest / topmost of each fingerprint).
 * Accepts either a full Central Node document or a bare Recent Actions section body.
 */
export function dedupeRecentActions(content) {
  if (typeof content !== 'string' || !content) return content;
  if (content.includes(RECENT_ACTIONS_HEADING)) {
    const parts = splitRecentActionsSection(content);
    if (!parts) return content;
    const { sectionStart, section, rest } = parts;
    const kept = dedupeRecentActionLines(section.split('\n'));
    if (kept.unchanged) return content;
    return `${content.slice(0, sectionStart)}${kept.lines.join('\n')}${rest}`;
  }
  const kept = dedupeRecentActionLines(content.split('\n'));
  return kept.unchanged ? content : kept.lines.join('\n');
}

function dedupeRecentActionLines(lines) {
  const seen = new Set();
  let changed = false;
  const kept = [];
  for (const line of lines) {
    const fingerprint = recentActionFingerprint(line);
    if (fingerprint) {
      if (seen.has(fingerprint)) {
        changed = true;
        continue;
      }
      seen.add(fingerprint);
    }
    kept.push(line);
  }
  return { lines: kept, unchanged: !changed };
}

export function appendCrossAgentLine(content, line) {
  const headingIndex = content.indexOf(CROSS_AGENT_HEADING);
  if (headingIndex === -1) return content;
  const insertAt = headingIndex + CROSS_AGENT_HEADING.length;
  const normalized = line.startsWith('\n') ? line : `\n${line}`;
  const bullet = /^\n?- /.test(normalized) ? normalized : `\n- ${line.replace(/^\n/, '')}`;
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
export const MAX_CROSS_AGENT_LINES = 24;

const CROSS_AGENT_LINE_RE = /^-\s*([A-Za-z][\w' ]*?)(?:→([A-Za-z][\w' ]*?))?:\s*(.*)$/;

// Coarse (sender, recipient, topic) key for a Cross-Agent bullet. Two lines from
// the same sender→recipient pair whose body opens with the same handful of words
// are treated as the same unresolved thread restated, not two distinct notes.
function crossAgentLineKey(line) {
  const match = CROSS_AGENT_LINE_RE.exec(line.trim());
  if (!match) return null;
  const [, sender, recipient, body] = match;
  // Plain [a-z]+ (no apostrophe) deliberately: real repeated lines vary between
  // quoted ('getting in trouble') and unquoted (getting in trouble) phrasing of
  // the same thread, and an apostrophe in the char class would make "'getting"
  // and "getting" tokenize differently, breaking the exact case this must catch.
  const fingerprint = (body.toLowerCase().match(/[a-z]+/g) ?? []).slice(0, 8).join(' ');
  if (!fingerprint) return null;
  return `${sender.trim().toLowerCase()}|${(recipient ?? '').trim().toLowerCase()}|${fingerprint}`;
}

/**
 * Collapse consecutive near-duplicate directives from the same sender→recipient
 * pair about the same topic, keeping only the newest. Directives insert
 * newest-first, so "newest" is whichever occurrence comes first walking top to
 * bottom. Mechanical dedup only — runs alongside, not instead of, the line-count
 * cap in trimCrossAgentSection. Unparseable bullets are always kept.
 */
export function dedupeCrossAgentSection(content) {
  const headingIndex = content.indexOf(CROSS_AGENT_HEADING);
  if (headingIndex === -1) return content;
  const sectionStart = headingIndex + CROSS_AGENT_HEADING.length;
  const after = content.slice(sectionStart);
  const endRel = after.search(/\n## /);
  const section = endRel === -1 ? after : after.slice(0, endRel);
  const rest = endRel === -1 ? '' : after.slice(endRel);

  const lines = section.split('\n');
  const seenKeys = new Set();
  const kept = lines.filter(line => {
    if (!/^\s*[-*]\s+\S/.test(line)) return true;
    const key = crossAgentLineKey(line);
    if (!key) return true;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
  if (kept.length === lines.length) return content;
  return `${content.slice(0, sectionStart)}${kept.join('\n')}${rest}`;
}

export function trimCrossAgentSection(content, { maxLines = MAX_CROSS_AGENT_LINES } = {}) {
  const headingIndex = content.indexOf(CROSS_AGENT_HEADING);
  if (headingIndex === -1) return content;
  const sectionStart = headingIndex + CROSS_AGENT_HEADING.length;
  const after = content.slice(sectionStart);
  const endRel = after.search(/\n## /);
  const section = endRel === -1 ? after : after.slice(0, endRel);
  const rest = endRel === -1 ? '' : after.slice(endRel);

  // Drop any previous truncation marker so a second trim cannot stack comments.
  const cleanedSection = section
    .split('\n')
    .filter(line => !/<!--\s*life-hub:cross-agent-truncated\b/.test(line))
    .join('\n');

  const lines = cleanedSection.split('\n');
  const directiveIndexes = lines
    .map((line, index) => (/^\s*[-*]\s+\S/.test(line) ? index : -1))
    .filter(index => index !== -1);
  if (directiveIndexes.length <= maxLines) {
    // If we only stripped a stale marker and kept all directives, still rewrite.
    if (cleanedSection === section) return content;
    return `${content.slice(0, sectionStart)}${cleanedSection}${rest}`;
  }

  // Newest directives are inserted at the top, so drop from the tail.
  const omitted = directiveIndexes.length - maxLines;
  const dropFrom = new Set(directiveIndexes.slice(maxLines));
  const kept = lines.filter((_, index) => !dropFrom.has(index));
  // Fail-visible: "12 lines present" must not look like "12 lines was the full set".
  const marker = crossAgentTruncationComment({ kept: maxLines, omitted });
  const body = `${kept.join('\n').replace(/\n+$/u, '')}\n${marker}\n`;
  return `${content.slice(0, sectionStart)}${body}${rest}`;
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

/** Recent Actions / Status Exercise are finish signals — planned autosaves must not touch them. */
export function shouldAppendRecentAction(record) {
  if (!record || typeof record !== 'object') return false;
  if (record.type === 'workout' && record.status !== 'completed' && record.status !== 'skipped') {
    return false;
  }
  return true;
}

export function shouldUpdateWorkoutStatus(record) {
  if (!record || record.type !== 'workout') return false;
  return record.status === 'completed' || record.status === 'skipped';
}

export function applyLogToCentralNode(content, {
  record,
  actionLine,
  nutritionTotals = null,
  flagNotes = null,
  preserveOtherStatusFields = true
}) {
  let next = content;
  if (actionLine && shouldAppendRecentAction(record)) {
    next = appendRecentAction(next, actionLine);
  }
  const existing = extractTodaysStatusBlock(next);
  const sameDay = existing.dateKey === record.date;
  let body = sameDay && preserveOtherStatusFields ? existing.body : '';

  if (record.type === 'meal' && nutritionTotals) {
    body = upsertStatusField(body, 'Nutrition', buildNutritionStatusLine(nutritionTotals));
    const flags = buildMealFlagsLine(flagNotes);
    if (flags) body = mergeFlagsIntoStatus(body, flags);
  } else if (record.type === 'workout') {
    // Protocol: Central Node after finish — planned autosaves leave Status alone.
    if (!shouldUpdateWorkoutStatus(record)) {
      return sanitizeCentralNode(dedupeRecentActions(next), record.date);
    }
    const existingExercise = /\*\*Exercise:\*\*\s*(.+)/i.exec(body)?.[1]?.replace(/\.\s*$/, '').trim();
    const looksLikeFinishedSession = Boolean(existingExercise) && (
      /\b(completed|skipped)\b/i.test(existingExercise)
      || /^\d+\s+sessions\b/i.test(existingExercise)
    );
    if (looksLikeFinishedSession) {
      const incomingTitle = compactTitle(record.title || record.day_type || 'session', { max: 28 });
      if (existingExercise.includes(incomingTitle)) {
        body = upsertStatusField(body, 'Exercise', buildExerciseStatusLine(record));
      } else if (/^\d+\s+sessions\b/i.test(existingExercise)) {
        const countMatch = /^(\d+)\s+sessions\s*·\s*(.+?)(?:\s*·\s*(\d+)\s*min total)?$/i.exec(existingExercise);
        const priorTitles = (countMatch?.[2] ?? existingExercise).split(/\s*;\s*/).map(part => part.trim()).filter(Boolean);
        if (!priorTitles.includes(incomingTitle)) priorTitles.push(incomingTitle);
        const totalMin = (Number(countMatch?.[3]) || 0) + (Number(record.duration_min) || 0);
        const duration = totalMin > 0 ? `${totalMin} min total` : null;
        const bits = [`${priorTitles.length} sessions`, priorTitles.join('; '), duration].filter(Boolean);
        body = upsertStatusField(body, 'Exercise', `**Exercise:** ${bits.join(' · ')}.`);
      } else {
        const priorTitle = compactTitle(existingExercise.split(/\s*·\s*/)[0], { max: 28 });
        const totalMin = (Number(record.duration_min) || 0)
          + (Number(/\b(\d+)\s*min\b/i.exec(existingExercise)?.[1]) || 0);
        const duration = totalMin > 0 ? `${totalMin} min total` : null;
        const bits = ['2 sessions', [priorTitle, incomingTitle].filter(Boolean).join('; '), duration].filter(Boolean);
        body = upsertStatusField(body, 'Exercise', `**Exercise:** ${bits.join(' · ')}.`);
      }
    } else {
      body = upsertStatusField(body, 'Exercise', buildExerciseStatusLine(record));
    }
    const flags = buildWorkoutFlagsLine(record, flagNotes);
    if (flags) body = mergeFlagsIntoStatus(body, flags);
  } else if (record.type === 'diary') {
    const mood = record.mood_score != null ? `${record.mood_score}/10` : (record.mood ?? 'logged');
    body = upsertStatusField(body, 'Mood', `**Mood:** ${mood}.`);
    if (record.energy) body = upsertStatusField(body, 'Energy', `**Energy:** ${record.energy}.`);
  } else if (record.type === 'mind_session') {
    const theme = typeof record.theme === 'string' && record.theme.trim()
      ? record.theme.trim()
      : 'session logged';
    body = upsertStatusField(body, 'Mind', `**Mind:** ${theme}.`);
  } else if (record.type === 'weight' || record.type === 'composition') {
    const weight = record.weight_kg != null ? `${record.weight_kg} kg` : 'logged';
    body = upsertStatusField(body, 'Health', `**Health:** Weight ${weight}.`);
    const flags = buildMealFlagsLine(flagNotes);
    if (flags) body = mergeFlagsIntoStatus(body, flags);
  } else if (record.type === 'measurements') {
    body = upsertStatusField(body, 'Health', '**Health:** Measurements logged.');
    const flags = buildMealFlagsLine(flagNotes);
    if (flags) body = mergeFlagsIntoStatus(body, flags);
  } else if (record.type === 'skincare') {
    const flags = buildMealFlagsLine(flagNotes)
      ?? `**Flags:** Skincare ${record.routine ?? ''} logged.`.replace(/\s+/g, ' ').trim();
    body = mergeFlagsIntoStatus(body, flags);
  } else if (record.type === 'medical') {
    const title = typeof record.title === 'string' && record.title.trim()
      ? record.title.trim()
      : 'Visit logged';
    body = upsertStatusField(body, 'Health', `**Health:** ${title}.`);
    const flags = buildMealFlagsLine(flagNotes);
    if (flags) body = mergeFlagsIntoStatus(body, flags);
  } else {
    return dedupeRecentActions(next);
  }

  next = replaceTodaysStatus(next, { dateKey: record.date, body });
  if (typeof record.cross_agent_note === 'string' && record.cross_agent_note.trim()) {
    next = appendCrossAgentLine(next, `- ${record.cross_agent_note.trim()}`);
  }
  for (const painLine of buildWorkoutPainCrossAgentLines(record)) {
    next = appendCrossAgentLine(next, painLine);
  }
  // Day Type used to be auto-written here as a "Chadwick→Brisket" directive. It was a
  // Notion day-page property that outlived its database: resolveDayType() already derives
  // it from the workout record and getDayTargets() has already applied it to the targets
  // Brisket reads, so the line instructed him to set a value that was computed and used
  // two steps earlier. Removed 2026-08-11; the honest signal is Today's Status Exercise.
  next = dedupeCrossAgentSection(next);
  next = trimCrossAgentSection(next);
  next = sanitizeCentralNode(next, record.date);
  next = dedupeRecentActions(next);
  return next;
}

/**
 * Adam's floor: Central Node is a pattern board, not an archive.
 * Anything dated before August 2026 is noise; unbooked penicillin TBC is noise;
 * day-by-day macro dumps and present-tense Entocort taper copy are noise.
 */
export const CENTRAL_NODE_HISTORY_CUTOFF = '2026-08-01';

const UPCOMING_APPOINTMENTS_HEADING = '### Upcoming Appointments';
const DAY_MACRO_DUMP_RE = /^\s*(?:[-*]\s*)?(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b[^:\n]{0,24}:\s*.*\b(?:kcal|g P|protein)\b/i;
const WEEK_NONE_LOGGED_RE = /^\s*(?:[-*]\s*)?(?:\*\*)?Exercise:\s*none logged\b/i;
const ENTCORT_ACTIVE_RE = /\bEntocort\b.*\b(taper|Day\s+\d+|Week\s+\d+|active|begins|6mg|9mg)\b|\b(taper|active).*\bEntocort\b/i;
const PENICILLIN_CHALLENGE_RE = /penicillin\s+challenge/i;
const CROSS_AGENT_DATE_RE = /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b/i;
const APPT_DATE_RE = /^\s*[-*]\s*\*\*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/;

/**
 * Mechanical Central Node hygiene. Safe to run on every read and every write.
 * Does not invent pattern prose — only removes stale / cancelled / dump noise.
 */
export function sanitizeCentralNode(content, today, {
  historyCutoff = CENTRAL_NODE_HISTORY_CUTOFF
} = {}) {
  if (typeof content !== 'string' || !isCalendarDate(today)) return content;
  let next = content;
  next = rollStaleSections(next, today);
  next = purgeStaleRecentActions(next, today);
  next = purgePastUpcomingAppointments(next, today);
  next = purgePenicillinChallengeLines(next);
  // August floor only engages once we are in/after August — otherwise July fixtures
  // and mid-year writes would wipe the current month's Cross-Agent lines.
  if (today >= historyCutoff) {
    next = purgeCrossAgentBeforeCutoff(next, historyCutoff, today);
  }
  next = stripDayByDayMacroDumps(next);
  next = stripEntocortActiveNoiseOutsideConstraints(next);
  next = dedupeCrossAgentSection(next);
  next = trimCrossAgentSection(next);
  next = dedupeRecentActions(next);
  return next;
}

/** Drop dated Upcoming Appointments that are already past. Keep undated TBC (except penicillin). */
export function purgePastUpcomingAppointments(content, today) {
  if (typeof content !== 'string' || !isCalendarDate(today)) return content;
  const headingIndex = content.indexOf(UPCOMING_APPOINTMENTS_HEADING);
  if (headingIndex === -1) return content;
  const sectionStart = headingIndex + UPCOMING_APPOINTMENTS_HEADING.length;
  const after = content.slice(sectionStart);
  const endRel = after.search(/\n### |\n## /);
  const section = endRel === -1 ? after : after.slice(0, endRel);
  const rest = endRel === -1 ? '' : after.slice(endRel);
  const lines = section.split('\n');
  const kept = lines.filter(line => {
    if (!/^\s*[-*]\s+\S/.test(line)) return true;
    const match = APPT_DATE_RE.exec(line);
    if (!match) return true;
    const day = Number(match[1]);
    const month = MONTH_INDEX[match[2].toLowerCase()];
    const year = Number(match[3]);
    const key = toDateKey(year, month, day);
    if (!key) return true;
    return key >= today;
  });
  if (kept.length === lines.length) return content;
  return `${content.slice(0, sectionStart)}${kept.join('\n')}${rest}`;
}

export function purgePenicillinChallengeLines(content) {
  if (typeof content !== 'string' || !content) return content;
  const lines = content.split('\n');
  const kept = lines.filter(line => !PENICILLIN_CHALLENGE_RE.test(line));
  return kept.length === lines.length ? content : kept.join('\n');
}

export function purgeCrossAgentBeforeCutoff(content, cutoff, today) {
  if (typeof content !== 'string' || !isCalendarDate(cutoff)) return content;
  const headingIndex = content.indexOf(CROSS_AGENT_HEADING);
  if (headingIndex === -1) return content;
  const sectionStart = headingIndex + CROSS_AGENT_HEADING.length;
  const after = content.slice(sectionStart);
  const endRel = after.search(/\n## /);
  const section = endRel === -1 ? after : after.slice(0, endRel);
  const rest = endRel === -1 ? '' : after.slice(endRel);
  const yearHint = isCalendarDate(today) ? today : cutoff;
  const lines = section.split('\n');
  const kept = lines.filter(line => {
    if (!/^\s*[-*]\s+\S/.test(line)) return true;
    const match = CROSS_AGENT_DATE_RE.exec(line);
    if (!match) return true;
    const day = Number(match[1]);
    const month = MONTH_INDEX[match[2].toLowerCase()];
    if (!month || !Number.isFinite(day)) return true;
    let key = toDateKey(Number(yearHint.slice(0, 4)), month, day);
    if (!key) return true;
    if (isCalendarDate(today) && key > today) {
      key = toDateKey(Number(yearHint.slice(0, 4)) - 1, month, day) ?? key;
    }
    return key >= cutoff;
  });
  if (kept.length === lines.length) return content;
  return `${content.slice(0, sectionStart)}${kept.join('\n')}${rest}`;
}

/** Writing Rule 5: This Week is averages and key events — not daily calorie essays. */
export function stripDayByDayMacroDumps(content) {
  if (typeof content !== 'string' || !content) return content;
  let next = content;
  for (const headingRe of [THIS_WEEK_HEADING_RE, THIS_MONTH_HEADING_RE]) {
    const match = headingRe.exec(next);
    if (!match) continue;
    const start = match.index + match[0].length;
    const after = next.slice(start);
    const endRel = NEXT_SECTION_RE.exec(after);
    const section = endRel ? after.slice(0, endRel.index) : after;
    const rest = endRel ? after.slice(endRel.index) : '';
    const cleaned = section
      .split('\n')
      .filter(line => !DAY_MACRO_DUMP_RE.test(line))
      .join('\n');
    if (cleaned !== section) {
      next = `${next.slice(0, start)}${cleaned}${rest}`;
    }
  }
  return next;
}

/**
 * Entocort course is ceased — present-tense taper copy outside Constraints is stale.
 * Constraints keep the medical history; everywhere else drops active-taper framing.
 */
export function stripEntocortActiveNoiseOutsideConstraints(content) {
  if (typeof content !== 'string' || !content) return content;
  const constraintsStart = content.indexOf('## 🔴 Current Constraints & Priorities');
  const constraintsEnd = constraintsStart === -1
    ? -1
    : (() => {
      const after = content.slice(constraintsStart + 1);
      const rel = after.search(/\n## /);
      return rel === -1 ? content.length : constraintsStart + 1 + rel;
    })();

  const lines = content.split('\n');
  let offset = 0;
  const kept = [];
  for (const line of lines) {
    const lineStart = offset;
    offset += line.length + 1;
    const inConstraints = constraintsStart !== -1
      && lineStart >= constraintsStart
      && lineStart < constraintsEnd;
    if (!inConstraints && ENTCORT_ACTIVE_RE.test(line)) continue;
    // Agent Directory one-liner still advertising an active taper protocol.
    if (!inConstraints && /Entocort taper skin protocol/i.test(line)) {
      kept.push(line.replace(/,\s*Entocort taper skin protocol/i, ''));
      continue;
    }
    kept.push(line);
  }
  const next = kept.join('\n');
  return next === content ? content : next;
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
  const purged = kept.length === lines.length
    ? content
    : `${content.slice(0, sectionStart)}${kept.join('\n')}${rest}`;
  // Same mechanical floor: Writing Rules promise one line per action.
  return dedupeRecentActions(purged);
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

/**
 * Build Today's Status fields from live event files for `date`.
 * Returns null when nothing was logged that day — caller keeps markdown.
 */
export function buildLiveStatusProse(events, date) {
  if (!isCalendarDate(date) || !Array.isArray(events)) return null;
  const records = events.map(item => item?.record ?? item).filter(record => record?.date === date);
  if (records.length === 0) return null;

  const lines = [];
  const meals = records.filter(record => record.type === 'meal');
  if (meals.length > 0) {
    const totals = meals.reduce((acc, meal) => ({
      calories: (acc.calories ?? 0) + (Number(meal.calories) || 0),
      protein_g: (acc.protein_g ?? 0) + (Number(meal.protein_g) || 0),
      fat_g: (acc.fat_g ?? 0) + (Number(meal.fat_g) || 0),
      sodium_mg: (acc.sodium_mg ?? 0) + (Number(meal.sodium_mg) || 0),
      calcium_mg: (acc.calcium_mg ?? 0) + (Number(meal.calcium_mg) || 0),
      polyphenol_score: (acc.polyphenol_score ?? 0) + (Number(meal.polyphenol_score) || 0)
    }), {});
    for (const key of Object.keys(totals)) {
      totals[key] = Math.round(totals[key] * 10) / 10;
    }
    lines.push(buildNutritionStatusLine(totals));
  }

  const workouts = records.filter(record =>
    record.type === 'workout' && (record.status === 'completed' || record.status === 'skipped')
  );
  if (workouts.length > 0) lines.push(buildMultiExerciseStatusLine(workouts));

  const diary = records.find(record => record.type === 'diary');
  if (diary) {
    const mood = diary.mood_score != null ? `${diary.mood_score}/10` : (diary.mood ?? 'logged');
    lines.push(`**Mood:** ${mood}.`);
    if (diary.energy) lines.push(`**Energy:** ${diary.energy}.`);
  }

  const mind = records.find(record => record.type === 'mind_session');
  if (mind) {
    const theme = typeof mind.theme === 'string' && mind.theme.trim()
      ? mind.theme.trim()
      : 'session logged';
    lines.push(`**Mind:** ${compactTitle(theme, { max: 72 })}.`);
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

/** Prefer live Nutrition / Exercise / Mood / Energy / Mind; keep other markdown fields (Flags, Health). */
export function mergeLiveStatusOverMarkdown(markdownBody, liveBody) {
  let body = typeof markdownBody === 'string' ? markdownBody : '';
  const live = typeof liveBody === 'string' ? liveBody : '';
  if (!live) return body;
  for (const field of ['Nutrition', 'Exercise', 'Mood', 'Energy', 'Mind']) {
    const match = new RegExp(`^\\*\\*${field}:\\*\\*\\s*.+$`, 'im').exec(live);
    if (match) body = upsertStatusField(body, field, match[0].trim());
  }
  return body;
}

export { TODAYS_STATUS_HEADING, RECENT_ACTIONS_HEADING, CROSS_AGENT_HEADING };
