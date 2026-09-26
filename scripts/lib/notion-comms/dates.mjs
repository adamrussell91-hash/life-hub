import { wallLocalToUtcIso } from '../../../netlify/functions/_shared/wall-time.mjs';

const SYDNEY = 'Australia/Sydney';
const monthPattern = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})\s+(AM|PM))?$/i;
const dayMonthPattern = /^(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?:\s+(AM|PM))?)?$/i;

function pad(value) { return String(value).padStart(2, '0'); }

function parsePart(value, fallbackDate = null) {
  const clean = value.trim();
  const match = clean.match(monthPattern);
  if (match) {
    const month = new Date(`${match[1]} 1, 2000`).getMonth() + 1;
    return { date: `${match[3]}-${pad(month)}-${pad(match[2])}`, hour: match[4], minute: match[5], meridiem: match[6] };
  }
  const dayMonth = clean.match(dayMonthPattern);
  if (dayMonth) {
    const month = new Date(`${dayMonth[2]} 1, 2000`).getMonth() + 1;
    return { date: `${dayMonth[3]}-${pad(month)}-${pad(dayMonth[1])}`, hour: dayMonth[4], minute: dayMonth[5], meridiem: dayMonth[6] };
  }
  const time = clean.match(/^(\d{1,2}):(\d{2})\s+(AM|PM)$/i);
  if (time && fallbackDate) return { date: fallbackDate, hour: time[1], minute: time[2], meridiem: time[3] };
  const twentyFourHourTime = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourHourTime && fallbackDate) return { date: fallbackDate, hour: twentyFourHourTime[1], minute: twentyFourHourTime[2], meridiem: null };
  const au = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  return au ? { date: `${au[3]}-${pad(au[2])}-${pad(au[1])}`, hour: au[4], minute: au[5], meridiem: null } : null;
}

function toIso(part, offset) {
  if (!part?.hour) return null;
  let hour = Number(part.hour);
  if (part.meridiem) { if (hour === 12) hour = 0; if (part.meridiem.toUpperCase() === 'PM') hour += 12; }
  const local = `${part.date}T${pad(hour)}:${part.minute}`;
  if (offset) return new Date(`${local}:00${offset}`).toISOString();
  return wallLocalToUtcIso(local, SYDNEY);
}

export function parseNotionDate(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const offsetMatch = value.match(/\(GMT([+-]\d{1,2})\)/i);
  const offset = offsetMatch ? `${offsetMatch[1].startsWith('-') ? '-' : '+'}${pad(Math.abs(Number(offsetMatch[1])))}:00` : null;
  const clean = value.replace(/\s*\(GMT[+-]\d{1,2}\)\s*/i, ' ').trim();
  const [startText, endText] = clean.split(/\s*→\s*/, 2);
  const start = parsePart(startText);
  if (!start) return null;
  if (!start.hour) return { start: start.date, end: null, allDay: true, timeZone: SYDNEY };
  const end = endText ? parsePart(endText, start.date) : null;
  return { start: toIso(start, offset), end: end ? toIso(end, offset) : null, allDay: false, timeZone: SYDNEY };
}
