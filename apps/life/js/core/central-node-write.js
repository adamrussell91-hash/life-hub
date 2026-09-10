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

export function buildExerciseStatusLine(record) {
  const title = record.title ? record.title : (record.day_type ?? 'workout');
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
      return dedupeRecentActions(next);
    }
    body = upsertStatusField(body, 'Exercise', buildExerciseStatusLine(record));
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
  next = rollStaleSections(next, record.date);
  next = purgeStaleRecentActions(next, record.date);
  next = dedupeRecentActions(next);
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

export { TODAYS_STATUS_HEADING, RECENT_ACTIONS_HEADING, CROSS_AGENT_HEADING };
