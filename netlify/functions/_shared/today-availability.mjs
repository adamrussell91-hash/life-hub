/**
 * People redesign Phase 7 — Adam's availability for the next school day.
 * Own sources only: meetings/events with attendees, lessons, work blocks, free gaps.
 * Never claims another person is free.
 */

const DAY_MS = 86_400_000;

function parseHm(value) {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function minutesOfIso(iso) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function dayKeyOf(isoOrDate, timeZone = 'Australia/Sydney') {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return fmt.format(d);
}

function addDaysKey(dayKey, days) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Next Mon–Fri school day on/after `now` (Sydney calendar). */
export function nextSchoolDayKey(now = new Date(), timeZone = 'Australia/Sydney') {
  let key = dayKeyOf(now, timeZone);
  for (let i = 0; i < 8; i += 1) {
    const [y, m, d] = key.split('-').map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sun
    if (weekday >= 1 && weekday <= 5) {
      // If today is a school day but we're past evening, still use today for strip;
      // caller may pass a forced date.
      return key;
    }
    key = addDaysKey(key, 1);
  }
  return key;
}

function slotSort(a, b) {
  return a.start_minutes - b.start_minutes;
}

/**
 * @returns {{
 *   day_key: string,
 *   slots: Array<{
 *     id: string,
 *     kind: 'meeting'|'event'|'lesson'|'work_block'|'free',
 *     title: string,
 *     start_minutes: number,
 *     end_minutes: number,
 *     start_label: string,
 *     people: Array<{ ref: string|null, display_name: string }>,
 *     suggested?: boolean,
 *     suggestion_note?: string|null
 *   }>,
 *   suggestion: null | { slot_id: string, note: string, person_ref: string }
 * }}
 */
export function assembleTodayStrip(input = {}) {
  const timeZone = input.timeZone ?? 'Australia/Sydney';
  const now = input.now ? new Date(input.now) : new Date();
  const dayKey = input.dayKey ?? nextSchoolDayKey(now, timeZone);
  const slots = [];

  for (const meeting of input.meetings ?? []) {
    const startIso = meeting.scheduled_start ?? meeting.start;
    if (!startIso || dayKeyOf(startIso, timeZone) !== dayKey) continue;
    const start_minutes = minutesOfIso(startIso) ?? 0;
    const endIso = meeting.scheduled_end ?? meeting.end;
    const end_minutes = minutesOfIso(endIso) ?? start_minutes + 60;
    slots.push({
      id: `meeting:${meeting.id}`,
      kind: 'meeting',
      title: meeting.title ?? 'Meeting',
      start_minutes,
      end_minutes,
      start_label: formatMinutes(start_minutes),
      people: (meeting.attendees ?? []).map((a) => ({
        ref: a.ref ?? null,
        display_name: a.display_name ?? a.name ?? 'Someone'
      }))
    });
  }

  for (const event of input.events ?? []) {
    const startIso = event.start;
    if (!startIso || dayKeyOf(startIso, timeZone) !== dayKey) continue;
    const start_minutes = minutesOfIso(startIso) ?? 0;
    const end_minutes = minutesOfIso(event.end) ?? start_minutes + 60;
    slots.push({
      id: `event:${event.id}`,
      kind: 'event',
      title: event.title ?? 'Event',
      start_minutes,
      end_minutes,
      start_label: formatMinutes(start_minutes),
      people: (event.attendees ?? []).map((a) => ({
        ref: a.ref ?? null,
        display_name: a.display_name ?? a.name ?? 'Someone'
      }))
    });
  }

  for (const lesson of input.lessons ?? []) {
    const date = lesson.date ?? lesson.day;
    if (date !== dayKey) continue;
    const start_minutes = parseHm(lesson.start_time ?? lesson.start) ?? 0;
    const end_minutes = parseHm(lesson.end_time ?? lesson.end) ?? start_minutes + 60;
    slots.push({
      id: `lesson:${lesson.id ?? `${dayKey}-${start_minutes}`}`,
      kind: 'lesson',
      title: lesson.title ?? lesson.class_name ?? 'Lesson',
      start_minutes,
      end_minutes,
      start_label: formatMinutes(start_minutes),
      people: []
    });
  }

  for (const block of input.workBlocks ?? []) {
    const date = block.date ?? (block.start ? dayKeyOf(block.start, timeZone) : null);
    if (date !== dayKey) continue;
    const start_minutes =
      parseHm(block.start_time) ?? minutesOfIso(block.start) ?? 0;
    const end_minutes = parseHm(block.end_time) ?? minutesOfIso(block.end) ?? start_minutes + 60;
    slots.push({
      id: `work_block:${block.id ?? `${dayKey}-${start_minutes}`}`,
      kind: 'work_block',
      title: block.title ?? 'Work block',
      start_minutes,
      end_minutes,
      start_label: formatMinutes(start_minutes),
      people: []
    });
  }

  slots.sort(slotSort);

  // Free periods = gaps ≥ 30 min between 8:00 and 16:00 among busy slots.
  const busy = slots.filter((s) => s.kind !== 'free');
  const dayStart = 8 * 60;
  const dayEnd = 16 * 60;
  let cursor = dayStart;
  const free = [];
  for (const s of busy) {
    if (s.start_minutes - cursor >= 30) {
      free.push({
        id: `free:${cursor}`,
        kind: 'free',
        title: 'Free',
        start_minutes: cursor,
        end_minutes: s.start_minutes,
        start_label: formatMinutes(cursor),
        people: []
      });
    }
    cursor = Math.max(cursor, s.end_minutes);
  }
  if (dayEnd - cursor >= 30) {
    free.push({
      id: `free:${cursor}`,
      kind: 'free',
      title: 'Free',
      start_minutes: cursor,
      end_minutes: dayEnd,
      start_label: formatMinutes(cursor),
      people: []
    });
  }

  const all = [...slots, ...free].sort(slotSort);

  let suggestion = null;
  if (input.meetPerson) {
    suggestion = suggestMeetSlot({
      freeSlots: free,
      pastMeetings: input.pastMeetingsWithPerson ?? [],
      person: input.meetPerson,
      openMeetItem: input.openMeetItem ?? null
    });
    if (suggestion) {
      const slot = all.find((s) => s.id === suggestion.slot_id);
      if (slot) {
        slot.suggested = true;
        slot.suggestion_note = suggestion.note;
      }
    }
  }

  return { day_key: dayKey, slots: all, suggestion };
}

function formatMinutes(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, '0')}${ampm}`;
}

/**
 * Histogram of past meetings (weekday + morning/afternoon/after-lunch) → best free slot.
 * Wording: "You usually meet Henry after lunch" — never "Henry is free".
 */
export function suggestMeetSlot({ freeSlots, pastMeetings, person, openMeetItem }) {
  if (!openMeetItem && !(pastMeetings?.length > 0)) {
    return null;
  }
  if (!freeSlots?.length) {
    return {
      slot_id: null,
      note: 'No pattern yet',
      person_ref: person.ref,
      pattern: null
    };
  }
  if (!pastMeetings?.length) {
    return {
      slot_id: freeSlots[0].id,
      note: 'No pattern yet',
      person_ref: person.ref,
      pattern: null
    };
  }

  const buckets = { morning: 0, after_lunch: 0, afternoon: 0 };
  for (const m of pastMeetings) {
    const mins = minutesOfIso(m.scheduled_start ?? m.start) ?? parseHm(m.start_time);
    if (mins == null) continue;
    if (mins < 12 * 60) buckets.morning += 1;
    else if (mins < 14 * 60) buckets.after_lunch += 1;
    else buckets.afternoon += 1;
  }
  const preferred = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0];
  const band = preferred?.[1] > 0 ? preferred[0] : null;
  if (!band) {
    return {
      slot_id: freeSlots[0].id,
      note: 'No pattern yet',
      person_ref: person.ref,
      pattern: null
    };
  }

  const bandRange =
    band === 'morning'
      ? [8 * 60, 12 * 60]
      : band === 'after_lunch'
        ? [12 * 60, 14 * 60]
        : [14 * 60, 16 * 60];

  const match =
    freeSlots.find((s) => s.start_minutes >= bandRange[0] && s.start_minutes < bandRange[1]) ??
    freeSlots[0];

  const firstName = (person.display_name || 'them').split(/\s+/)[0];
  const when =
    band === 'morning' ? 'in the morning' : band === 'after_lunch' ? 'after lunch' : 'in the afternoon';

  return {
    slot_id: match.id,
    note: `You usually meet ${firstName} ${when}`,
    person_ref: person.ref,
    pattern: band
  };
}

export { formatMinutes, dayKeyOf, DAY_MS };
