/**
 * Pure redaction for public follow-along links.
 * Never include booking refs, costs, private/med items, notes, or penelope prompts.
 */
export function redactTrip(trip) {
  const cities = (trip.cities || []).map((city) => ({
    id: city.id,
    name: city.name,
    country: city.country,
    tz: city.tz,
    start_date: city.start_date,
    end_date: city.end_date,
    title: city.title,
    scene: city.scene,
    accent: city.accent,
    facts: city.facts,
    center: city.center,
    local_currency: city.local_currency,
    directions_app: city.directions_app,
    arrival_guide: city.arrival_guide
      ? {
          title: city.arrival_guide.title,
          rows: (city.arrival_guide.rows || []).map((r) => ({ icon: r.icon, text: r.text }))
        }
      : undefined
  }));

  const cityName = Object.fromEntries(cities.map((c) => [c.id, c.name]));

  const items = (trip.items || [])
    .filter((item) => !item.private && item.kind !== 'med')
    .map((item) => {
      const base = {
        id: item.id,
        kind: item.kind,
        city_id: item.city_id,
        date: item.date,
        time: item.time,
        title: item.title,
        status: item.status === 'planned' ? 'planned' : item.status,
        hop: item.hop
          ? { mode: item.hop.mode, minutes: item.hop.minutes, note: item.hop.note }
          : undefined,
        off_map_label: item.off_map_label
      };
      if (item.place) {
        base.place = {
          name: item.place.name,
          lat: item.place.lat,
          lon: item.place.lon,
          ...(item.kind === 'stay' && item.place.address ? { address: item.place.address } : {})
        };
      }
      if (item.kind === 'stay') {
        base.nights = item.nights;
        base.check_out_date = item.check_out_date;
        base.home_base = item.home_base;
      }
      if (item.kind === 'flight' || item.kind === 'train') {
        base.carrier = item.carrier;
        base.number = item.number;
        base.from_code = item.from_code;
        base.to_code = item.to_code;
        base.from_name = item.from_name;
        base.to_name = item.to_name;
        base.depart_time = item.depart_time;
        base.arrive_time = item.arrive_time;
        base.arrive_date = item.arrive_date;
        base.arrive_city_id = item.arrive_city_id;
      }
      return base;
    });

  const days = (trip.days || []).map((d) => ({
    city_id: d.city_id,
    date: d.date,
    subtitle: d.subtitle
  }));

  const latest = [...(trip.checkins || [])].sort((a, b) => b.at.localeCompare(a.at))[0];
  const checkin = latest
    ? {
        at: latest.at,
        city_name: cityName[latest.city_id] || latest.city_id,
        label: latest.label
      }
    : null;

  return {
    id: trip.id,
    schema_version: 1,
    title: trip.title,
    start_date: trip.start_date,
    end_date: trip.end_date,
    home_tz: trip.home_tz,
    followers_label: trip.followers_label,
    cities,
    items,
    days,
    last_checkin: checkin
  };
}
