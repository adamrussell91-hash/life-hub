/**
 * A compact history of every other trip, for the journal's noticing cards:
 * enough to say "a year ago today you were in Porto" without sending whole
 * journals to the phone. Partner's lines are left out: they are not the
 * owner's own record and are never used as evidence.
 */

const isPhoto = (media) => media && media.lifecycle === 'live' && !String(media.content_type || '').startsWith('audio/');

function daysBetween(start, end) {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? Math.round((b - a) / 86400000) + 1 : 0;
}

export function buildNoticingHistory({ trips = [], journals = [], exceptTripId = '' } = {}) {
  const tripRows = [];
  const dayRows = [];
  const journalByTrip = new Map(journals.map((journal) => [journal.trip_id, journal]));

  for (const trip of trips) {
    if (!trip || trip.id === exceptTripId) continue;
    tripRows.push({
      id: trip.id,
      title: trip.title,
      start_date: trip.start_date,
      end_date: trip.end_date,
      days: daysBetween(trip.start_date, trip.end_date),
      cities: (trip.cities || []).map((city) => ({
        name: city.name,
        country: city.country,
        start_date: city.start_date,
        end_date: city.end_date
      }))
    });

    const journal = journalByTrip.get(trip.id);
    if (!journal || journal.lifecycle === 'deleted') continue;
    const mediaById = new Map((journal.media || []).map((m) => [m.id, m]));
    const cityById = new Map((trip.cities || []).map((c) => [c.id, c]));
    const legById = new Map((journal.legs || []).filter((l) => l.lifecycle === 'live').map((l) => [l.id, l]));
    const byDay = new Map();

    for (const moment of journal.moments || []) {
      if (moment.lifecycle !== 'live' || moment.author === 'partner') continue;
      const leg = legById.get(moment.leg_id);
      if (!leg) continue;
      const key = `${moment.leg_id}|${moment.local_date}`;
      let row = byDay.get(key);
      if (!row) {
        const city = cityById.get(leg.city_id);
        row = {
          trip_id: trip.id,
          date: moment.local_date,
          city: leg.destination,
          country: city?.country || '',
          photos: 0,
          first_time: null,
          last_time: null,
          north: null,
          south: null,
          photo_ids: []
        };
        byDay.set(key, row);
      }
      const photos = (moment.media_ids || []).map((id) => mediaById.get(id)).filter(isPhoto);
      row.photos += photos.length;
      for (const photo of photos) if (row.photo_ids.length < 3) row.photo_ids.push(photo.id);
      if (moment.local_time) {
        if (!row.first_time || moment.local_time < row.first_time) row.first_time = moment.local_time;
        if (!row.last_time || moment.local_time > row.last_time) row.last_time = moment.local_time;
      }
      const lat = moment.coordinates?.lat;
      if (typeof lat === 'number' && Number.isFinite(lat)) {
        const place = moment.place?.name || leg.destination;
        if (!row.north || lat > row.north.lat) row.north = { lat, place };
        if (!row.south || lat < row.south.lat) row.south = { lat, place };
      }
    }
    dayRows.push(...byDay.values());
  }

  tripRows.sort((a, b) => a.start_date.localeCompare(b.start_date));
  dayRows.sort((a, b) => a.date.localeCompare(b.date));
  return { trips: tripRows, days: dayRows };
}
