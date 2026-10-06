/**
 * Day dial watch faces (docs/capacity-forecast-handoff/mockups/dial-complications.html).
 *
 * Pure: which face a day gets, what each complication shows, and the face the viewer
 * chose. Drawing lives in dial-complications.js; the dial wires both in.
 *
 * Faces pick themselves (Auto) from the day:
 *   Grand complication  a big day: a wedding, ceremony or graduation on the calendar, or the anniversary
 *   Pilot GMT           a Travel trip covers the day
 *   Focus               today, while a tracked work session is running
 *   Dress watch         weekends and school holidays
 *   Tool watch          school days (and anything else)
 * Choosing a face by hand sticks (on this device) until Auto is tapped again.
 */

export const FACES = Object.freeze([
  { id: 'tool', title: 'Tool watch', when: 'Auto on school days', comps: ['weather', 'bezel', 'moon'] },
  { id: 'focus', title: 'Focus', when: 'Auto while a work session you started is running', comps: ['retro', 'bezel'] },
  { id: 'pilot', title: 'Pilot GMT', when: 'Auto when a trip is on', comps: ['gmt', 'corey', 'bezel'] },
  { id: 'dress', title: 'Dress watch', when: 'Auto on weekends and holidays', comps: [] },
  { id: 'grand', title: 'Grand complication', when: 'Auto on a big day (wedding, ceremony, graduation, anniversary)', comps: ['bezel', 'moon', 'tourbillon', 'gmt', 'countdown'] }
]);

export const COMPLICATIONS = Object.freeze({
  weather: { name: 'Weather ring', watch: 'the quiet band', text: 'Hour-by-hour readiness, coloured by condition. Solid behind the hand, softer ahead. Today only.' },
  bezel: { name: 'Dive bezel', watch: 'dive watch', text: 'The outer ring. The pip is when you logged the dexy dose; the band is its usual window, solid for time gone, orange for the last 45 minutes.' },
  moon: { name: 'Moon phase', watch: 'moonphase', text: 'Under the number. How full the week is: new moon in a quiet week, full moon when it is all happening at once.' },
  tourbillon: { name: 'Tourbillon', watch: 'haute horlogerie', text: 'Under the number. Spins while Clare or Hammond has a change to your day waiting.' },
  retro: { name: 'Retrograde tally', watch: 'retrograde', text: 'Sweeps one step for each task you close today, and snaps back at midnight.' },
  gmt: { name: 'GMT hand', watch: 'pilot / GMT', text: 'A second 24-hour hand for the other place: where the trip is. The dial itself stays on Sydney time.' },
  corey: { name: 'Corey hand', watch: 'second time zone', text: 'Corey’s evening at home, shaded on the rim, with a C where Corey is now.' },
  countdown: { name: 'Countdown plaque', watch: 'regatta', text: 'Time to the big event, engraved under the dial so the face stays clear.' }
});

export const faceById = id => FACES.find(face => face.id === id) ?? FACES[0];

/** Married 13 July 2026 (central-node.md). The anniversary is a big day. */
export const ANNIVERSARY = '07-13';
const BIG_DAY = /\b(wedding|ceremony|graduation|graduating|anniversary)\b/i;

const hourOf = value => {
  if (Number.isFinite(value)) return value;
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value ?? ''));
  return m ? Number(m[1]) + Number(m[2]) / 60 : null;
};

/** The day's big event, if any: { title, start } (start in hours, may be null). */
export function bigEvent(date, chips = []) {
  const hit = chips.find(chip => !chip.ambient && BIG_DAY.test(String(chip.title ?? '')));
  if (hit) return { title: String(hit.title), start: hourOf(hit.start) };
  if (String(date ?? '').slice(5) === ANNIVERSARY) return { title: 'Anniversary', start: null };
  return null;
}

/** The trip city covering `date`: { trip, city: { name, tz }, homeTz } or null. */
export function tripOn(date, trips = []) {
  for (const trip of trips ?? []) {
    if (!trip?.start_date || !(trip.start_date <= date && date <= trip.end_date)) continue;
    const city = (trip.cities ?? []).find(c => c?.tz && c.start_date <= date && date <= c.end_date)
      ?? (trip.cities ?? []).find(c => c?.tz) ?? null;
    return { trip, city: city ? { name: city.name, tz: city.tz } : null, homeTz: trip.home_tz || 'Australia/Sydney' };
  }
  return null;
}

/**
 * Auto: the face this day wears.
 * ctx: { date, today, nowHour, weekday, holiday, chips, trips, working }
 */
export function autoFace(ctx) {
  const { date, today, nowHour = 12, weekday = true, holiday = false, chips = [], trips = [], working = false } = ctx ?? {};
  if (bigEvent(date, chips)) return 'grand';
  if (tripOn(date, trips)) return 'pilot';
  if (date === today && working) return 'focus';
  if (!weekday || holiday) return 'dress';
  return 'tool';
}

/* ======================================================================== Choice (per device) */

const KEY = hub => `hub-calendar:dial-face:${hub || 'life'}`;

/** 'auto' or a face id. Storage can be missing or throw (private mode): Auto then. */
export function readFaceChoice(hub, storage = globalThis.localStorage) {
  try {
    const value = storage?.getItem?.(KEY(hub));
    return value && (value === 'auto' || FACES.some(face => face.id === value)) ? value : 'auto';
  } catch {
    return 'auto';
  }
}

export function writeFaceChoice(hub, choice, storage = globalThis.localStorage) {
  try {
    if (!choice || choice === 'auto') storage?.removeItem?.(KEY(hub));
    else storage?.setItem?.(KEY(hub), choice);
  } catch {
    /* the choice just won't outlive the page */
  }
}

/** { id, auto }: the face to draw. */
export function resolveFace(choice, ctx) {
  if (choice && choice !== 'auto' && FACES.some(face => face.id === choice)) return { id: choice, auto: false };
  return { id: autoFace(ctx), auto: true };
}

/** Next / previous face, wrapping. */
export function stepFace(id, delta) {
  const index = FACES.findIndex(face => face.id === id);
  return FACES[(((index < 0 ? 0 : index) + delta) % FACES.length + FACES.length) % FACES.length].id;
}

/* ======================================================================== Complication data */

/** Moon phase: 0 (new, a quiet week) → 1 (full, everything at once). `hours` = the week's committed hours. */
export function moonFill(hours, full = 30) {
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return Math.max(0, Math.min(1, hours / full));
}

/** Retrograde tally: today's tasks, closed and total. */
export function taskTally(items = []) {
  const tasks = items.filter(item => item && (item.kind === 'task' || item.filterKey === 'tasks'));
  const ids = new Set();
  const unique = tasks.filter(item => (item.id && ids.has(item.id) ? false : (ids.add(item.id), true)));
  const closed = unique.filter(item => item.done || item.status === 'done').length;
  return { closed, total: Math.max(unique.length, closed) };
}

/** Dive bezel: one entry per logged dose with its window and how much is left at `nowHour`. */
export function bezelDoses(med, nowHour, isToday) {
  return (med?.doses ?? [])
    .filter(dose => dose.status === 'taken' && Array.isArray(dose.window))
    .map(dose => {
      const [from, to] = dose.window;
      const end = Math.min(24, to);
      const left = isToday && nowHour > from && nowHour < end ? end - nowHour : null;
      return { slot: dose.slot, time: dose.time, from, to: end, left, gone: isToday ? Math.max(from, Math.min(end, nowHour)) : end };
    });
}

/** Hours on a 24-hour dial for wall time in `tz` at `now`. */
export function hourIn(tz, now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const get = type => Number(parts.find(p => p.type === type)?.value ?? 0);
    return get('hour') + get('minute') / 60;
  } catch {
    return null;
  }
}

/** Tourbillon spins while Clare or Hammond has a pending change on this day. */
export function agentsReworking(ghosts = [], date) {
  return ghosts.some(ghost => ghost?.status === 'pending'
    && ['clare', 'hammond'].includes(String(ghost.agent ?? '').toLowerCase())
    && (ghost.chip?.date ?? ghost.date) === date);
}

/** "1 h 30 m" */
export function duration(hours) {
  const m = Math.max(0, Math.round(hours * 60));
  return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} m` : ''}` : `${m} m`;
}
