/**
 * Leave-by (Day Sense step 9, §3.1 "Leave-by wedge"). Pure helpers for the Day dial.
 *
 * Which commitment needs a trip, where Adam leaves from, and the wedge:
 *   ready (start getting ready) → leave (out the door) → board (first vehicle).
 * Times come only from GET /api/transport (TfNSW). No plan, no wedge.
 */

export const TRANSPORT = Object.freeze({
  prepMinutes: 10, // getting ready before leaving
  needMore: 10, // "Need 10 minutes"
  schoolUntil: 17.5, // a school-day commitment before this leaves from school
  wedgeMax: 9, // px, far from leaving (fits between the event ring and the log dots)
  wedgeMin: 3, // px, at leave time
  wedgeNarrowFrom: 120 // minutes before leaving the wedge starts narrowing
});

const TRIP_SOURCES = new Set(['ical_event', 'medical', 'professional_event', 'professional_meeting']);
const ONLINE = /\b(zoom|teams|google meet|meet\.google|webex|online|virtual|phone call)\b|https?:\/\//i;

export const hourOf = (hhmm) => {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm ?? ''));
  return m ? Number(m[1]) + Number(m[2]) / 60 : null;
};

export const toHHMM = (hour) => {
  const total = Math.round(hour * 60);
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/** Where Adam sets off from for a commitment starting at `start` (hours). */
export function originFor(day, start) {
  return day?.school && start < TRANSPORT.schoolUntil ? 'school' : 'home';
}

/**
 * The next commitment on this day that needs a trip: timed, somewhere real (a location,
 * not a video link), not a ghost, still ahead. Today: after now. Other days: the first.
 */
export function leaveByCandidate(day, { today, nowHour }) {
  if (!day) return null;
  const from = day.date === today ? nowHour : -1;
  const chip = (day.chips ?? [])
    .filter((row) => !row.ghost && row.start > from && TRIP_SOURCES.has(row.source ?? row.record?.type))
    .filter((row) => {
      const where = String(row.record?.location ?? '').trim();
      return where.length > 2 && !ONLINE.test(where);
    })
    .sort((a, b) => a.start - b.start)[0];
  if (!chip) return null;
  return {
    id: chip.id,
    title: chip.title,
    location: String(chip.record.location).replace(/\s+/g, ' ').trim(),
    date: day.date,
    start: chip.start,
    origin: originFor(day, chip.start)
  };
}

/** GET /api/transport query for arriving by the start, or leaving after `leaveAt` (hours). */
export function transportPath(candidate, { leaveAt = null } = {}) {
  const params = new URLSearchParams({
    to: candidate.location,
    from: candidate.origin,
    date: candidate.date,
    time: toHHMM(leaveAt ?? candidate.start),
    mode: leaveAt == null ? 'arr' : 'dep'
  });
  return `/api/transport?${params}`;
}

/**
 * The wedge in hours, from a plan. `prep` minutes of getting ready before leaving.
 * @returns {null | { ready: number, leave: number, board: number, arrive: number }}
 */
export function wedgeFor(plan, { prep = TRANSPORT.prepMinutes } = {}) {
  const leave = hourOf(plan?.leave);
  const arrive = hourOf(plan?.arrive);
  if (leave == null || arrive == null) return null;
  const board = hourOf(plan.board) ?? arrive;
  return { ready: Math.max(0, leave - prep / 60), leave, board: Math.max(leave, board), arrive };
}

/** The wedge narrows as leaving nears: full width two hours out, thin at the door. */
export function wedgeWidth(nowHour, leave) {
  const minutes = (leave - nowHour) * 60;
  const t = Math.max(0, Math.min(1, minutes / TRANSPORT.wedgeNarrowFrom));
  return Math.round((TRANSPORT.wedgeMin + (TRANSPORT.wedgeMax - TRANSPORT.wedgeMin) * t) * 10) / 10;
}

const MODE_LABEL = { walk: 'Walk', train: 'Train', metro: 'Metro', light_rail: 'Light rail', bus: 'Bus', coach: 'Coach', ferry: 'Ferry', school_bus: 'School bus', cycle: 'Cycle' };

const clock = (hhmm) => {
  const h = hourOf(hhmm);
  if (h == null) return '';
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'pm' : 'am'}`;
};

/** "Walk 6 min · T4 3:51 pm · arrive 4:18 pm" */
export function legsLine(plan) {
  if (!plan?.legs?.length) return '';
  const parts = plan.legs.map((leg) => (leg.mode === 'walk' || leg.mode === 'cycle'
    ? `${MODE_LABEL[leg.mode]} ${leg.minutes} min`
    : `${leg.line || MODE_LABEL[leg.mode] || 'Transit'} ${clock(leg.depart)}`));
  return [...parts, `arrive ${clock(plan.arrive)}`].join(' · ');
}

/** Late (+) or early (−) minutes against the commitment's start. */
export function minutesLate(plan, start) {
  const arrive = hourOf(plan?.arrive);
  return arrive == null ? null : Math.round((arrive - start) * 60);
}
