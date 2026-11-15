/**
 * What the noticing cards draw from outside Travel, matched here by exact
 * rules only: the food journal, the diary (never sent to a model) and the
 * bookshelf. Each function returns just the few fields a card shows.
 */

const clip = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** How near a restaurant must be to a city's centre to count as "in" that city. */
const CITY_RADIUS_KM = 25;

/**
 * Rated dishes eaten on this trip, and dishes marked "order again" at places
 * in this trip's cities on earlier visits.
 */
export function foodFacts({ foodJournal, trip }) {
  const prefix = `travel:${trip.id}:`;
  const dishes = [];
  const orderAgain = [];
  for (const visit of foodJournal?.visits || []) {
    const venue = clip(visit.venue?.name || visit.title, 120);
    const ofThisTrip = typeof visit.source_id === 'string' && visit.source_id.startsWith(prefix);
    for (const dish of visit.dishes || []) {
      const title = clip(dish.title, 120);
      if (!title) continue;
      if (ofThisTrip) {
        const rating = Number(dish.rating);
        if (Number.isFinite(rating) && rating > 0) {
          dishes.push({ date: visit.date, title, venue, rating, moment_id: visit.source_id.slice(prefix.length).split(':')[0] });
        }
        continue;
      }
      if (dish.order_again !== true || visit.date >= trip.start_date) continue;
      const at = visit.venue;
      if (typeof at?.lat !== 'number' || typeof at?.lon !== 'number') continue;
      const city = (trip.cities || []).find((c) => c.center && distanceKm(c.center, at) <= CITY_RADIUS_KM);
      if (city) orderAgain.push({ city: city.name, title, venue, date: visit.date });
    }
  }
  orderAgain.sort((a, b) => b.date.localeCompare(a.date));
  return { dishes, order_again: orderAgain.slice(0, 40) };
}

/** The first plain line of a diary entry's highlights. */
function firstLine(highlights) {
  const text = Array.isArray(highlights) ? highlights.find((h) => typeof h === 'string' && h.trim()) : highlights;
  if (typeof text !== 'string') return '';
  const line = text.split(/\r?\n/).map((l) => l.replace(/^[-*•\s]+/, '').trim()).find(Boolean) ?? '';
  return clip(line, 180);
}

/**
 * Diary entries from this date in earlier years: the date, the mood word and
 * one highlight line, exactly as written. Nothing else of the diary is read out.
 */
export function diaryOnThisDay(records, day) {
  return (Array.isArray(records) ? records : [])
    .filter((r) => r && r.type === 'diary' && typeof r.date === 'string' && r.date.slice(5) === day.slice(5) && r.date < day)
    .map((r) => ({
      date: r.date,
      mood: clip(Array.isArray(r.moods) && r.moods.length ? r.moods[0] : r.mood, 40),
      line: firstLine(r.highlights)
    }))
    .filter((r) => r.mood || r.line)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** The YAML block at the top of a diary file, parsed. Null when there is none. */
export function diaryRecord(text, loadYaml) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(text ?? '').trim());
  if (!match) return null;
  try {
    const record = loadYaml(match[1]);
    if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
    // YAML reads a bare date as a Date: put it back as written.
    if (record.date instanceof Date) record.date = record.date.toISOString().slice(0, 10);
    return record;
  } catch {
    return null;
  }
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Books whose title names one of this trip's cities or countries. Titles only: the shelf records no settings. */
export function shelfMatches({ books, trip }) {
  const places = [...new Set((trip.cities || []).flatMap((c) => [c.name, c.country]).map((p) => clip(p, 60)).filter((p) => p.length >= 4))];
  const out = [];
  for (const book of Array.isArray(books) ? books : []) {
    const title = clip(book?.label, 160);
    if (!title) continue;
    const place = places.find((p) => new RegExp(`(^|[^\\p{L}])${escapeRegExp(p)}($|[^\\p{L}])`, 'iu').test(title));
    if (!place) continue;
    out.push({
      title,
      author: clip(book.author, 120),
      completed_on: /^\d{4}-\d{2}-\d{2}$/.test(String(book.completed_on ?? '')) ? book.completed_on : null,
      place
    });
  }
  return out.slice(0, 20);
}
