/**
 * Openings: free, high-capacity windows, matched to the things Adam wants before
 * anything else can take them.
 *
 * Pure. The view passes one entry per day (capacity from capacity-model.js, free hours
 * from the calendar) and a list of wants in priority order. Corey comes first in the
 * default wants because About Me says he outranks every tie-break.
 *
 * Day: { date, pct, holiday?, weekday (0 Sun .. 6 Sat), freeEvening, freeDay, walled?, tags?: string[] }
 * Want: { id, title, span, minPct?, minHours?, weekdays?, holidayOnly?, requireTag?, with? }
 *   span:
 *   - 'evening': the Yours band (needs freeEvening >= minHours, default 4)
 *   - 'lunch':   a free weekday middle (freeDay >= 3)
 *   - 'day':     a whole free day (freeDay >= 8)
 *   - 'days2':   two consecutive whole free days
 *   - 'protect': a day to keep empty (whole free day carrying requireTag)
 *
 * Reference: docs/proposals/calendar-reference/almanac/VISUAL-SPEC.md ("Openings").
 */

export const OPENING = Object.freeze({ eveningHours: 4, lunchDayHours: 3, wholeDayHours: 8, defaultMinPct: 60 });

function fits(day, want) {
  if (day.walled && want.span !== 'protect') return false;
  if ((day.pct ?? 0) < (want.minPct ?? OPENING.defaultMinPct)) return false;
  if (want.weekdays && !want.weekdays.includes(day.weekday)) return false;
  if (want.holidayOnly && !day.holiday) return false;
  if (want.requireTag && !(day.tags ?? []).includes(want.requireTag)) return false;
  switch (want.span) {
    case 'evening': return (day.freeEvening ?? 0) >= (want.minHours ?? OPENING.eveningHours);
    case 'lunch': return day.weekday >= 1 && day.weekday <= 5 && (day.freeDay ?? 0) >= OPENING.lunchDayHours;
    case 'day':
    case 'protect': // a whole day includes its evening
      return (day.freeDay ?? 0) >= OPENING.wholeDayHours && (day.freeEvening ?? 0) >= OPENING.eveningHours;
    default: return false;
  }
}

/** Which parts of a day a span uses. A whole-day claim blocks everything on that day. */
function parts(span) {
  if (span === 'evening') return ['evening'];
  if (span === 'lunch') return ['lunch'];
  return ['evening', 'lunch', 'day'];
}

/**
 * One opening per want: the EARLIEST window that clears the want's capacity bar (an
 * opening is held before something else takes it; higher capacity breaks ties), never double-booking a
 * part of a day. Wants that find nothing are returned with `dates: []` so the view can
 * say so honestly.
 */
export function findOpenings(days, wants) {
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
  const claimed = new Map(); // date -> Set(parts)
  const free = (date, span) => {
    const used = claimed.get(date) ?? new Set();
    return parts(span).every(p => !used.has(p) && !used.has('day'));
  };
  const claim = (date, span) => {
    const used = claimed.get(date) ?? new Set();
    parts(span).forEach(p => used.add(p));
    claimed.set(date, used);
  };
  return wants.map(want => {
    const candidates = [];
    if (want.span === 'days2') {
      for (let i = 0; i + 1 < sorted.length; i++) {
        const a = sorted[i];
        const b = sorted[i + 1];
        const oneWant = { ...want, span: 'day' };
        if (fits(a, oneWant) && fits(b, oneWant) && free(a.date, 'day') && free(b.date, 'day')) {
          candidates.push({ dates: [a.date, b.date], pct: Math.min(a.pct, b.pct) });
        }
      }
    } else {
      for (const d of sorted) {
        if (fits(d, want) && free(d.date, want.span)) candidates.push({ dates: [d.date], pct: d.pct });
      }
    }
    candidates.sort((x, y) => (x.dates[0] < y.dates[0] ? -1 : x.dates[0] > y.dates[0] ? 1 : y.pct - x.pct));
    const best = candidates[0];
    if (!best) return { wantId: want.id, title: want.title, span: want.span, with: want.with ?? null, dates: [], pct: null };
    best.dates.forEach(d => claim(d, want.span === 'days2' ? 'day' : want.span));
    return { wantId: want.id, title: want.title, span: want.span, with: want.with ?? null, dates: best.dates, pct: best.pct };
  });
}
