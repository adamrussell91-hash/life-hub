/**
 * Minimal iCalendar (RFC 5545) reader for Adam's published iCloud calendars.
 * Pure: text in, Sydney-dated occurrences out. No dependencies.
 *
 * Handles: folded lines, TZID / UTC / floating / all-day times (DST-correct via Intl),
 * DTEND or DURATION, RRULE (DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL, COUNT, UNTIL,
 * BYDAY incl. ordinals, BYMONTHDAY, BYMONTH), EXDATE, RECURRENCE-ID overrides,
 * STATUS:CANCELLED.
 */

export const SYDNEY_TZ = 'Australia/Sydney';
const DAY_MS = 86_400_000;
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const MAX_ITERATIONS = 5000;

/* ---------- lines and properties ---------- */

function unfold(text) {
  return String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

function parseLine(line) {
  // NAME;PARAM=a;PARAM="b:c":VALUE — the first colon outside quotes ends the params.
  let inQuote = false;
  let split = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuote = !inQuote;
    else if (ch === ':' && !inQuote) { split = i; break; }
  }
  if (split < 0) return null;
  const head = line.slice(0, split);
  const value = line.slice(split + 1);
  const [name, ...rawParams] = head.split(';');
  const params = {};
  for (const raw of rawParams) {
    const eq = raw.indexOf('=');
    if (eq < 0) continue;
    params[raw.slice(0, eq).toUpperCase()] = raw.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value };
}

export function unescapeText(value) {
  return String(value ?? '')
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/** VEVENT blocks as { NAME: [ { params, value } ] }. Nested VALARMs are skipped. */
export function parseEvents(text) {
  const events = [];
  let current = null;
  let depth = 0;
  for (const line of unfold(text)) {
    if (!line) continue;
    if (line === 'BEGIN:VEVENT') { current = {}; depth = 0; continue; }
    if (!current) continue;
    if (line.startsWith('BEGIN:')) { depth += 1; continue; }
    if (line.startsWith('END:') && depth > 0) { depth -= 1; continue; }
    if (line === 'END:VEVENT') { events.push(current); current = null; continue; }
    if (depth > 0) continue;
    const prop = parseLine(line);
    if (!prop) continue;
    (current[prop.name] ??= []).push({ params: prop.params, value: prop.value });
  }
  return events;
}

/* ---------- time ---------- */

const formatters = new Map();
function partsIn(ms, tz) {
  let fmt = formatters.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    formatters.set(tz, fmt);
  }
  const out = {};
  for (const part of fmt.formatToParts(new Date(ms))) out[part.type] = part.value;
  return { y: Number(out.year), mo: Number(out.month), d: Number(out.day), h: Number(out.hour) % 24, mi: Number(out.minute), s: Number(out.second) };
}

function safeTz(tz) {
  if (!tz) return SYDNEY_TZ;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return tz;
  } catch {
    return SYDNEY_TZ;
  }
}

/** Wall-clock time in `tz` → UTC ms (two-pass, DST-safe). */
export function wallToUtc({ y, mo, d, h = 0, mi = 0, s = 0 }, tz) {
  const zone = safeTz(tz);
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let utc = guess;
  for (let i = 0; i < 2; i++) {
    const p = partsIn(utc, zone);
    const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
    utc = guess - (asUtc - utc);
  }
  return utc;
}

const pad = (n) => String(n).padStart(2, '0');
const dateKey = ({ y, mo, d }) => `${y}-${pad(mo)}-${pad(d)}`;

/** UTC ms → { date, time } on the Sydney wall clock. */
export function sydneyWall(ms) {
  const p = partsIn(ms, SYDNEY_TZ);
  return { date: dateKey(p), time: `${pad(p.h)}:${pad(p.mi)}` };
}

/**
 * DTSTART-style value → { allDay, date?, wall?, tz, utc? }.
 * All-day: { allDay: true, date }. Timed: wall components in `tz` plus utc.
 */
export function parseTime(prop) {
  if (!prop) return null;
  const value = String(prop.value ?? '').trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (dateOnly || prop.params?.VALUE === 'DATE') {
    const m = dateOnly ?? /^(\d{4})(\d{2})(\d{2})/.exec(value);
    if (!m) return null;
    return { allDay: true, date: `${m[1]}-${m[2]}-${m[3]}` };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(value);
  if (!m) return null;
  const wall = { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]), h: Number(m[4]), mi: Number(m[5]), s: Number(m[6] ?? 0) };
  const tz = m[7] ? 'UTC' : safeTz(prop.params?.TZID);
  return { allDay: false, wall, tz, utc: wallToUtc(wall, tz) };
}

/** ISO 8601 duration (P1DT2H, PT30M, P1W) → ms. */
export function parseDuration(value) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(value ?? '').trim());
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  const ms = (Number(m[2] ?? 0) * 7 + Number(m[3] ?? 0)) * DAY_MS
    + (Number(m[4] ?? 0) * 3600 + Number(m[5] ?? 0) * 60 + Number(m[6] ?? 0)) * 1000;
  return sign * ms;
}

/* ---------- recurrence ---------- */

export function parseRRule(value) {
  const rule = {};
  for (const part of String(value ?? '').split(';')) {
    const [k, v] = part.split('=');
    if (k && v != null) rule[k.toUpperCase()] = v;
  }
  if (!rule.FREQ) return null;
  return {
    freq: rule.FREQ,
    interval: Math.max(1, Number(rule.INTERVAL) || 1),
    count: rule.COUNT ? Number(rule.COUNT) : null,
    until: rule.UNTIL ? parseTime({ value: rule.UNTIL, params: {} }) : null,
    byDay: rule.BYDAY ? rule.BYDAY.split(',').map((token) => {
      const m = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(token.trim());
      return m ? { n: m[1] ? Number(m[1]) : null, wd: WEEKDAYS.indexOf(m[2]) } : null;
    }).filter(Boolean) : null,
    byMonthDay: rule.BYMONTHDAY ? rule.BYMONTHDAY.split(',').map(Number).filter(Number.isFinite) : null,
    byMonth: rule.BYMONTH ? rule.BYMONTH.split(',').map(Number).filter(Number.isFinite) : null,
    wkst: WEEKDAYS.indexOf(rule.WKST ?? 'MO')
  };
}

const utcDay = (y, mo, d) => Date.UTC(y, mo - 1, d);
const fromUtcDay = (ms) => {
  const date = new Date(ms);
  return { y: date.getUTCFullYear(), mo: date.getUTCMonth() + 1, d: date.getUTCDate() };
};
const daysInMonth = (y, mo) => new Date(Date.UTC(y, mo, 0)).getUTCDate();

/** Dates in one month matching BYDAY (with ordinals) or BYMONTHDAY; default = start's day. */
function monthDates(y, mo, rule, startDay) {
  const dim = daysInMonth(y, mo);
  if (rule.byMonthDay?.length) {
    return rule.byMonthDay.map((n) => (n < 0 ? dim + n + 1 : n)).filter((n) => n >= 1 && n <= dim).sort((a, b) => a - b);
  }
  if (rule.byDay?.length) {
    const out = new Set();
    for (const { n, wd } of rule.byDay) {
      const matches = [];
      for (let d = 1; d <= dim; d++) if (new Date(Date.UTC(y, mo - 1, d)).getUTCDay() === wd) matches.push(d);
      if (n == null) matches.forEach((d) => out.add(d));
      else {
        const pick = n > 0 ? matches[n - 1] : matches[matches.length + n];
        if (pick) out.add(pick);
      }
    }
    return [...out].sort((a, b) => a - b);
  }
  return startDay <= dim ? [startDay] : [];
}

/**
 * Occurrence start dates (wall-clock date parts in the event's zone), in order,
 * from DTSTART until `limitDay` (UTC-day ms) or COUNT/UNTIL.
 */
export function expandDates(start, rule, limitDay) {
  const out = [];
  const first = utcDay(start.y, start.mo, start.d);
  const untilDay = rule.until
    ? (rule.until.allDay ? Date.parse(`${rule.until.date}T00:00:00Z`) : utcDay(...Object.values(fromUtcDay(rule.until.utc))))
    : Infinity;
  const stop = Math.min(limitDay, untilDay);
  let emitted = 0;
  const push = (ms) => {
    if (ms < first || ms > stop) return true;
    if (rule.count != null && emitted >= rule.count) return false;
    out.push(fromUtcDay(ms));
    emitted += 1;
    return true;
  };
  let iterations = 0;
  if (rule.freq === 'DAILY') {
    for (let ms = first; ms <= stop && iterations < MAX_ITERATIONS; ms += rule.interval * DAY_MS, iterations++) {
      const p = fromUtcDay(ms);
      if (rule.byMonth && !rule.byMonth.includes(p.mo)) continue;
      if (rule.byDay && !rule.byDay.some((b) => b.wd === new Date(ms).getUTCDay())) continue;
      if (!push(ms)) break;
    }
  } else if (rule.freq === 'WEEKLY') {
    const days = rule.byDay?.length ? rule.byDay.map((b) => b.wd) : [new Date(first).getUTCDay()];
    const offset = (new Date(first).getUTCDay() - rule.wkst + 7) % 7;
    let weekStart = first - offset * DAY_MS;
    outer: for (; weekStart <= stop && iterations < MAX_ITERATIONS; weekStart += rule.interval * 7 * DAY_MS, iterations++) {
      for (let i = 0; i < 7; i++) {
        const ms = weekStart + i * DAY_MS;
        if (!days.includes(new Date(ms).getUTCDay())) continue;
        if (!push(ms)) break outer;
      }
    }
  } else if (rule.freq === 'MONTHLY') {
    let { y, mo } = start;
    outer: for (; iterations < MAX_ITERATIONS; iterations++) {
      if (utcDay(y, mo, 1) > stop) break;
      if (!rule.byMonth || rule.byMonth.includes(mo)) {
        for (const d of monthDates(y, mo, rule, start.d)) if (!push(utcDay(y, mo, d))) break outer;
      }
      mo += rule.interval;
      while (mo > 12) { mo -= 12; y += 1; }
    }
  } else if (rule.freq === 'YEARLY') {
    let y = start.y;
    outer: for (; iterations < MAX_ITERATIONS; iterations++) {
      if (utcDay(y, 1, 1) > stop) break;
      const months = rule.byMonth?.length ? rule.byMonth : [start.mo];
      for (const mo of months) {
        const dates = rule.byDay?.length || rule.byMonthDay?.length ? monthDates(y, mo, rule, start.d) : [start.d];
        for (const d of dates) if (d <= daysInMonth(y, mo) && !push(utcDay(y, mo, d))) break outer;
      }
      y += rule.interval;
    }
  } else {
    push(first);
  }
  return out;
}

/* ---------- occurrences ---------- */

function text(event, name) {
  return unescapeText(event[name]?.[0]?.value ?? '').trim();
}

function occurrenceKey(time) {
  return time.allDay ? `d:${time.date}` : `t:${time.utc}`;
}

function exdateKeys(event) {
  const keys = new Set();
  for (const prop of event.EXDATE ?? []) {
    for (const value of String(prop.value).split(',')) {
      const time = parseTime({ value, params: prop.params });
      if (time) keys.add(occurrenceKey(time));
    }
  }
  return keys;
}

/**
 * Expand a feed into Sydney-dated rows within [from, to] (YYYY-MM-DD).
 * @returns {Array<{ id, uid, feed, title, date, time?, end_time?, all_day, location?, notes? }>}
 */
export function icalOccurrences(textBody, { feed, from, to }) {
  const events = parseEvents(textBody);
  const masters = [];
  const overrides = new Map();
  for (const event of events) {
    if (event['RECURRENCE-ID']) {
      const rid = parseTime(event['RECURRENCE-ID'][0]);
      const uid = text(event, 'UID');
      if (rid && uid) overrides.set(`${uid}|${occurrenceKey(rid)}`, event);
    } else {
      masters.push(event);
    }
  }
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  const rows = [];

  const emit = (event, start, durationMs, uid, recurring = false) => {
    if (text(event, 'STATUS').toUpperCase() === 'CANCELLED') return;
    const base = {
      uid,
      feed,
      // A repeating event names its series, so "I've dropped this" can free every week of it.
      ...(recurring ? { series: `${feed}:${uid}` } : {}),
      title: text(event, 'SUMMARY') || 'Busy',
      location: text(event, 'LOCATION') || undefined,
      notes: text(event, 'DESCRIPTION').slice(0, 500) || undefined
    };
    if (start.allDay) {
      const days = Math.max(1, Math.round(durationMs / DAY_MS));
      for (let i = 0; i < Math.min(days, 31); i++) {
        const date = new Date(Date.parse(`${start.date}T00:00:00Z`) + i * DAY_MS).toISOString().slice(0, 10);
        if (date < from || date > to) continue;
        rows.push({ ...base, id: `${feed}:${uid}:${date}`, date, all_day: true, ...(days > 1 ? { span: `${i + 1}/${days}` } : {}) });
      }
      return;
    }
    const s = sydneyWall(start.utc);
    if (s.date < from || s.date > to) return;
    const end = sydneyWall(start.utc + Math.max(0, durationMs));
    rows.push({
      ...base,
      id: `${feed}:${uid}:${start.utc}`,
      date: s.date,
      time: s.time,
      end_time: durationMs > 0 ? (end.date === s.date ? end.time : '23:59') : undefined,
      all_day: false
    });
  };

  for (const event of masters) {
    const start = parseTime(event.DTSTART?.[0]);
    if (!start) continue;
    const uid = text(event, 'UID') || `${text(event, 'SUMMARY')}:${occurrenceKey(start)}`;
    let durationMs;
    const end = parseTime(event.DTEND?.[0]);
    if (end) {
      durationMs = start.allDay
        ? Date.parse(`${end.date}T00:00:00Z`) - Date.parse(`${start.date}T00:00:00Z`)
        : end.utc - start.utc;
    } else if (event.DURATION) {
      durationMs = parseDuration(event.DURATION[0].value) ?? 0;
    } else {
      durationMs = start.allDay ? DAY_MS : 0;
    }
    const rule = event.RRULE ? parseRRule(event.RRULE[0].value) : null;
    if (!rule) {
      emit(event, start, durationMs, uid);
      continue;
    }
    const excluded = exdateKeys(event);
    const startParts = start.allDay
      ? { y: Number(start.date.slice(0, 4)), mo: Number(start.date.slice(5, 7)), d: Number(start.date.slice(8, 10)) }
      : start.wall;
    // Expand a day past the window so late-evening UTC shifts still land.
    for (const day of expandDates(startParts, rule, toMs + 2 * DAY_MS)) {
      const occurrence = start.allDay
        ? { allDay: true, date: dateKey(day) }
        : { allDay: false, utc: wallToUtc({ ...day, h: start.wall.h, mi: start.wall.mi, s: start.wall.s }, start.tz) };
      const key = occurrenceKey(occurrence);
      if (excluded.has(key)) continue;
      const override = overrides.get(`${uid}|${key}`);
      if (override) {
        const moved = parseTime(override.DTSTART?.[0]) ?? occurrence;
        const movedEnd = parseTime(override.DTEND?.[0]);
        const movedDuration = movedEnd
          ? (moved.allDay ? Date.parse(`${movedEnd.date}T00:00:00Z`) - Date.parse(`${moved.date}T00:00:00Z`) : movedEnd.utc - moved.utc)
          : durationMs;
        emit(override, moved, movedDuration, uid, true);
        overrides.delete(`${uid}|${key}`);
        continue;
      }
      if (!occurrence.allDay && occurrence.utc + Math.max(durationMs, 0) < fromMs - DAY_MS) continue;
      emit(event, occurrence, durationMs, uid, true);
    }
  }
  // Overrides whose original slot fell outside the rule (moved in from elsewhere).
  for (const [key, event] of overrides) {
    const moved = parseTime(event.DTSTART?.[0]);
    if (!moved) continue;
    const movedEnd = parseTime(event.DTEND?.[0]);
    const duration = movedEnd ? (moved.allDay ? Date.parse(`${movedEnd.date}T00:00:00Z`) - Date.parse(`${moved.date}T00:00:00Z`) : movedEnd.utc - moved.utc) : 0;
    emit(event, moved, duration, key.split('|')[0]);
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || String(a.time ?? '').localeCompare(String(b.time ?? '')));
}
