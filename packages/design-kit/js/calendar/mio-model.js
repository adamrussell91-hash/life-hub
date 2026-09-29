/**
 * Mio opportunities (Day Sense step 11, §3.4/§3.5). Pure; shared by the server
 * (which areas matter) and the Day dial (what to offer).
 *
 * Mio stays the source of truth. Life Hub only caches candidates a Claude session with
 * the Mio connector wrote to `mio-candidates.json` (see docs/MIO-SYNC.md). An offer needs:
 *   - a journey Adam is already making (a timed commitment somewhere real),
 *   - a real gap next to it (45 min or more, nothing else booked),
 *   - a saved place in the same suburb, open for that gap (unknown hours are labelled,
 *     never assumed open),
 * and it is one tap to say no, which is remembered and never mentioned again.
 */

export const MIO = Object.freeze({
  minGap: 0.75, // hours
  visit: 1, // hours proposed for a visit (cut to the gap)
  walk: 10 / 60, // kept clear between the visit and the commitment (same suburb)
  dayEnd: 21, // no offers after 9 pm
  maxPerDay: 2,
  horizonDays: 14,
  wantedPath: 'mio-wanted.json',
  candidatesPath: 'mio-candidates.json'
});

const ONLINE = /\b(zoom|teams|google meet|meet\.google|webex|online|virtual|phone call)\b|https?:\/\//i;
const SKIP = new Set(['accommodation', 'other']);

/**
 * The suburb of an address or place text, lowercased, or null.
 * "181 Enmore Rd, Enmore NSW 2042, Australia" → "enmore"; "Petersham NSW 2049" → "petersham";
 * "Oxford St, Bondi Junction" → "bondi junction".
 */
export function areaOf(text) {
  const raw = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!raw || ONLINE.test(raw)) return null;
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean).filter((p) => !/^australia$/i.test(p));
  for (const part of parts) {
    const m = /^(.+?)\s+(?:NSW|ACT|VIC|QLD)(?:\s+\d{4})?$/i.exec(part);
    if (m && !/\d/.test(m[1])) return m[1].toLowerCase();
  }
  const last = parts[parts.length - 1];
  if (last && !/\d/.test(last) && last.split(' ').length <= 3 && parts.length > 1) return last.toLowerCase();
  if (parts.length === 1 && !/\d/.test(raw) && raw.split(' ').length <= 3) return raw.toLowerCase();
  return null;
}

/**
 * Areas Adam is going to in the next two weeks, for the Mio sync to fetch hours for.
 * @param {Array<{ date: string, time?: string, all_day?: boolean, location?: string }>} rows iCloud rows
 * @returns {Array<{ area: string, dates: string[] }>}
 */
export function wantedAreas(rows, { from, to }) {
  const byArea = new Map();
  for (const row of rows ?? []) {
    if (!row || row.all_day || !row.time || row.date < from || row.date > to) continue;
    const area = areaOf(row.location);
    if (!area) continue;
    byArea.set(area, [...new Set([...(byArea.get(area) ?? []), row.date])].sort());
  }
  return [...byArea.entries()].map(([area, dates]) => ({ area, dates })).sort((a, b) => a.area.localeCompare(b.area));
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function clockToHour(text) {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i.exec(String(text).trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toLowerCase() === 'pm') h += 12;
  return h + (Number(m[2] ?? 0) / 60);
}

/**
 * Mio "Opening hours" lines → { 0..6: [[open, close], ...] } in hours (Sunday = 0).
 * "Monday: 8:30 AM to 10 PM", "Tuesday: Closed", "Friday: 11 AM to 3 PM, 5 to 10 PM".
 * A close after midnight is kept past 24.
 */
export function parseHours(lines) {
  const out = {};
  for (const line of lines ?? []) {
    const m = /^\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s*:\s*(.+)$/i.exec(String(line));
    if (!m) continue;
    const day = DAY_NAMES.indexOf(m[1].toLowerCase());
    const body = m[2].trim();
    if (/closed/i.test(body)) {
      out[day] = [];
      continue;
    }
    if (/open 24 hours/i.test(body)) {
      out[day] = [[0, 24]];
      continue;
    }
    const spans = [];
    for (const piece of body.split(/,|;/)) {
      const [a, b] = piece.split(/\s+(?:to|–|-)\s+/i);
      if (!a || !b) continue;
      const close = clockToHour(b);
      // "5 to 10 PM": the open side borrows the close side's am/pm.
      const open = clockToHour(a) ?? clockToHour(`${a.trim()} ${/pm/i.test(b) ? 'PM' : 'AM'}`);
      if (open == null || close == null) continue;
      spans.push([open, close <= open ? close + 24 : close]);
    }
    if (spans.length) out[day] = spans;
  }
  return Object.keys(out).length ? out : null;
}

/** Hours the place is open within [from, to] on `date`, or null when its hours are unknown. */
export function openWithin(place, date, from, to) {
  if (!place?.hours) return null;
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  const spans = place.hours[dow] ?? place.hours[String(dow)] ?? [];
  let best = null;
  for (const [open, close] of spans) {
    const a = Math.max(from, open);
    const b = Math.min(to, close);
    if (b - a > 0 && (!best || b - a > best.end - best.start)) best = { start: a, end: b, closes: close };
  }
  return best ?? { start: from, end: from, closes: null, closed: true };
}

/**
 * Offers for one day of the calendar model.
 * @param {{ date: string, chips: object[] }} day
 * @param {Array<object>} places cached Mio candidates
 * @returns {Array<{ commitment: { id, title, start, end, area }, place: object, gap: { start, end }, when: 'before'|'after', visit: { start, end }, hours: 'open'|'unknown', closes: number|null }>}
 */
export function opportunities(day, places, { today, nowHour, declined = new Set() } = {}) {
  if (!day || !places?.length) return [];
  const floor = day.date === today ? nowHour : 0;
  // Social and family events are journeys too (a gig, a dinner): only ghosts are not.
  const allBusy = (day.chips ?? []).filter((c) => !c.ghost).sort((a, b) => a.start - b.start);
  const out = [];
  const used = new Set();
  for (const chip of allBusy) {
    const area = areaOf(chip.record?.location);
    if (!area || chip.end <= floor) continue;
    const pool = places.filter((p) => p.area === area && !SKIP.has(p.category) && !declined.has(`${p.id}|${day.date}`) && !used.has(p.id));
    if (!pool.length) continue;
    // A real gap right after (or right before) the commitment, nothing else booked in it.
    const next = allBusy.find((c) => c.id !== chip.id && c.start >= chip.end);
    const prev = [...allBusy].reverse().find((c) => c.id !== chip.id && c.end <= chip.start);
    const gaps = [
      { when: 'after', start: Math.max(chip.end + MIO.walk, floor), end: Math.min(next ? next.start : MIO.dayEnd, MIO.dayEnd) },
      { when: 'before', start: Math.max(prev ? prev.end : 8, floor), end: chip.start - MIO.walk }
    ].filter((g) => g.end - g.start >= MIO.minGap);
    let offer = null;
    for (const gap of gaps) {
      const ranked = pool
        .map((place) => {
          const open = openWithin(place, day.date, gap.start, gap.end);
          if (open?.closed) return null;
          if (open && open.end - open.start < MIO.minGap) return null;
          const span = open ?? { start: gap.start, end: gap.end, closes: null };
          const length = Math.min(MIO.visit, span.end - span.start);
          const visit = gap.when === 'after' ? { start: span.start, end: span.start + length } : { start: span.end - length, end: span.end };
          return { place, visit, hours: open ? 'open' : 'unknown', closes: open?.closes ?? null };
        })
        .filter(Boolean)
        // Known hours first, then rating.
        .sort((a, b) => (a.hours === 'open' ? 0 : 1) - (b.hours === 'open' ? 0 : 1) || (b.place.rating ?? 0) - (a.place.rating ?? 0));
      if (ranked[0]) {
        offer = { ...ranked[0], gap: { start: gap.start, end: gap.end }, when: gap.when };
        break;
      }
    }
    if (!offer) continue;
    used.add(offer.place.id);
    out.push({ commitment: { id: chip.id, title: chip.title, start: chip.start, end: chip.end, area }, ...offer });
    if (out.length >= MIO.maxPerDay) break;
  }
  return out;
}

/** Validate the synced file (written by a Claude session): only known fields survive. */
export function parseCandidates(text) {
  let doc;
  try {
    doc = typeof text === 'string' ? JSON.parse(text) : text;
  } catch {
    return { synced_at: null, places: [] };
  }
  const places = [];
  for (const row of Array.isArray(doc?.places) ? doc.places : []) {
    if (!row || typeof row.id !== 'string' || typeof row.name !== 'string') continue;
    const area = typeof row.area === 'string' && row.area ? row.area.toLowerCase() : areaOf(row.address);
    if (!area) continue;
    places.push({
      id: row.id.slice(0, 64),
      name: row.name.slice(0, 120),
      category: typeof row.category === 'string' ? row.category : 'other',
      area,
      ...(typeof row.address === 'string' ? { address: row.address.slice(0, 200) } : {}),
      ...(Number.isFinite(row.rating) ? { rating: row.rating } : {}),
      ...(typeof row.creator === 'string' ? { creator: row.creator.slice(0, 60) } : {}),
      ...(typeof row.why === 'string' ? { why: row.why.slice(0, 160) } : {}),
      ...(row.hours && typeof row.hours === 'object' ? { hours: row.hours } : {})
    });
  }
  return { synced_at: typeof doc?.synced_at === 'string' ? doc.synced_at : null, places };
}
