const CURRENCIES = new Set([
  'AUD', 'MYR', 'TRY', 'GBP', 'EUR', 'KRW', 'CAD', 'USD', 'JPY', 'NZD', 'SGD'
]);
const SCENES = new Set(['kul', 'ist', 'sco', 'lon', 'rom', 'sel', 'generic']);
const STATUSES = new Set(['planned', 'booked', 'todo', 'idea']);
const HOP_MODES = new Set(['walk', 'train', 'tram', 'bus', 'taxi', 'ferry']);
const GUIDE_ICONS = new Set(['phone', 'transport', 'money', 'weather', 'paperwork']);
const KINDS = new Set(['do', 'food', 'transit', 'med', 'post', 'stay', 'flight', 'train', 'checkin_slot']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const ID_RE = /^[a-z0-9_]{4,64}$/i;

function fail(path, message) {
  const err = new Error(message);
  err.code = 'validation_error';
  err.path = path;
  return err;
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function requireString(obj, key, path, { min = 1 } = {}) {
  const v = obj[key];
  if (typeof v !== 'string' || v.trim().length < min) throw fail(path, `${path} must be a string`);
  return v;
}

function optionalString(obj, key) {
  const v = obj[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') throw fail(key, `${key} must be a string`);
  return v;
}

function requireDate(obj, key, path) {
  const v = requireString(obj, key, path);
  if (!DATE_RE.test(v)) throw fail(path, `${path} must be YYYY-MM-DD`);
  return v;
}

function requireTimeOrNull(obj, key, path) {
  const v = obj[key];
  if (v === null) return null;
  if (typeof v !== 'string' || !TIME_RE.test(v)) throw fail(path, `${path} must be HH:MM or null`);
  return v;
}

function validateMoney(money, path) {
  if (!isObject(money)) throw fail(path, `${path} must be an object`);
  if (typeof money.amount !== 'number' || !Number.isFinite(money.amount)) {
    throw fail(`${path}.amount`, 'amount must be a number');
  }
  if (!CURRENCIES.has(money.currency)) throw fail(`${path}.currency`, 'unknown currency');
  if (money.aud !== undefined && (typeof money.aud !== 'number' || !Number.isFinite(money.aud))) {
    throw fail(`${path}.aud`, 'aud must be a number');
  }
  if (money.rate !== undefined && (typeof money.rate !== 'number' || !Number.isFinite(money.rate))) {
    throw fail(`${path}.rate`, 'rate must be a number');
  }
  if (money.rate_date !== undefined && !DATE_RE.test(money.rate_date)) {
    throw fail(`${path}.rate_date`, 'rate_date must be YYYY-MM-DD');
  }
}

function validatePlace(place, path) {
  if (!isObject(place)) throw fail(path, `${path} must be an object`);
  requireString(place, 'name', `${path}.name`);
  if (typeof place.lat !== 'number' || typeof place.lon !== 'number') {
    throw fail(path, `${path} needs lat and lon`);
  }
}

function validateHop(hop, path) {
  if (!isObject(hop)) throw fail(path, `${path} must be an object`);
  if (!HOP_MODES.has(hop.mode)) throw fail(`${path}.mode`, 'unknown hop mode');
  if (typeof hop.minutes !== 'number' || hop.minutes < 0) {
    throw fail(`${path}.minutes`, 'minutes must be a non-negative number');
  }
  if (hop.cost) validateMoney(hop.cost, `${path}.cost`);
}

export function normalizeItem(draft, { id, now } = {}) {
  if (!isObject(draft)) throw fail('item', 'item must be an object');
  if (!KINDS.has(draft.kind)) throw fail('item.kind', 'unknown kind');
  const item = {
    ...draft,
    id: id || draft.id || makeId('itm'),
    title: String(draft.title || '').trim(),
    note: typeof draft.note === 'string' ? draft.note : '',
    status: STATUSES.has(draft.status) ? draft.status : 'planned',
    created_at: draft.created_at || now || new Date().toISOString(),
    updated_at: now || new Date().toISOString()
  };
  if (item.link != null && item.link !== '') {
    if (typeof item.link !== 'string' || !/^https:\/\//i.test(item.link)) {
      throw fail('item.link', 'link must be https');
    }
  }
  if (item.time != null && item.time !== '' && !TIME_RE.test(item.time)) {
    throw fail('item.time', 'time must be HH:MM or null');
  }
  if (item.time === '') item.time = null;
  if (!DATE_RE.test(item.date)) throw fail('item.date', 'date must be YYYY-MM-DD');
  if (!item.city_id) throw fail('item.city_id', 'city_id required');
  if (!item.title) throw fail('item.title', 'title required');
  if (item.cost) validateMoney(item.cost, 'item.cost');
  if (item.place) validatePlace(item.place, 'item.place');
  if (item.hop) validateHop(item.hop, 'item.hop');
  if (item.kind === 'stay') {
    if (typeof item.nights !== 'number' || item.nights < 1) throw fail('item.nights', 'nights required');
    if (!DATE_RE.test(item.check_out_date)) throw fail('item.check_out_date', 'check_out_date required');
    item.home_base = item.home_base !== false;
  }
  if (item.kind === 'flight' || item.kind === 'train') {
    for (const key of ['carrier', 'from_code', 'to_code', 'depart_time', 'arrive_time', 'arrive_date']) {
      if (!item[key]) throw fail(`item.${key}`, `${key} required for tickets`);
    }
    // Flights need a flight number. Regional trains often have none (empty string).
    if (item.kind === 'flight' && !item.number) {
      throw fail('item.number', 'number required for tickets');
    }
    if (item.number == null) item.number = '';
    else if (typeof item.number !== 'string') throw fail('item.number', 'number must be a string');
    if (!TIME_RE.test(item.depart_time) || !TIME_RE.test(item.arrive_time)) {
      throw fail('item.depart_time', 'ticket times must be HH:MM');
    }
  }
  return item;
}

export function validateItemDraft(draft) {
  return normalizeItem(draft, { id: draft?.id || 'itm_draftvalid01', now: '1970-01-01T00:00:00.000Z' });
}

export function validateTrip(trip) {
  if (!isObject(trip)) throw fail('trip', 'trip must be an object');
  if (trip.schema_version !== 1) throw fail('schema_version', 'schema_version must be 1');
  if (!ID_RE.test(trip.id)) throw fail('id', 'invalid trip id');
  requireString(trip, 'title', 'title');
  requireDate(trip, 'start_date', 'start_date');
  requireDate(trip, 'end_date', 'end_date');
  requireString(trip, 'home_tz', 'home_tz');
  requireString(trip, 'followers_label', 'followers_label');
  // Empty cities allowed so a fresh trip can be created (title + dates) before cities are added.
  if (!Array.isArray(trip.cities)) throw fail('cities', 'cities must be an array');
  if (!Array.isArray(trip.items)) throw fail('items', 'items must be an array');
  if (!Array.isArray(trip.days)) throw fail('days', 'days must be an array');
  if (!Array.isArray(trip.checkins)) throw fail('checkins', 'checkins must be an array');
  if (!isObject(trip.share)) throw fail('share', 'share required');

  const cityIds = new Set();
  trip.cities.forEach((city, i) => {
    const p = `cities[${i}]`;
    if (!isObject(city)) throw fail(p, 'city must be an object');
    requireString(city, 'id', `${p}.id`);
    if (cityIds.has(city.id)) throw fail(`${p}.id`, 'duplicate city id');
    cityIds.add(city.id);
    requireString(city, 'name', `${p}.name`);
    requireString(city, 'country', `${p}.country`);
    requireString(city, 'tz', `${p}.tz`);
    requireDate(city, 'start_date', `${p}.start_date`);
    requireDate(city, 'end_date', `${p}.end_date`);
    requireString(city, 'title', `${p}.title`);
    if (!SCENES.has(city.scene)) throw fail(`${p}.scene`, 'unknown scene');
    if (!isObject(city.accent)) throw fail(`${p}.accent`, 'accent required');
    if (!CURRENCIES.has(city.local_currency)) throw fail(`${p}.local_currency`, 'unknown currency');
    if (!isObject(city.center)) throw fail(`${p}.center`, 'center required');
    if (city.directions_app !== 'google' && city.directions_app !== 'naver') {
      throw fail(`${p}.directions_app`, 'directions_app must be google or naver');
    }
    if (city.arrival_guide) {
      for (const [ri, row] of (city.arrival_guide.rows || []).entries()) {
        if (!GUIDE_ICONS.has(row.icon)) throw fail(`${p}.arrival_guide.rows[${ri}].icon`, 'bad icon');
      }
    }
  });

  trip.items.forEach((item, i) => {
    try {
      normalizeItem(item);
    } catch (err) {
      err.path = `items[${i}].${err.path || 'item'}`.replace(/\.item$/, '');
      throw err;
    }
    if (!cityIds.has(item.city_id)) throw fail(`items[${i}].city_id`, 'unknown city_id');
  });

  return trip;
}

export function makeId(prefix) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let out = '';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `${prefix}_${out}`;
}

export function tripSummary(trip) {
  const countries = [];
  const seen = new Set();
  for (const city of trip.cities || []) {
    const country = typeof city.country === 'string' ? city.country.trim() : '';
    if (!country || seen.has(country)) continue;
    seen.add(country);
    countries.push(country);
  }
  return {
    id: trip.id,
    title: trip.title,
    start_date: trip.start_date,
    end_date: trip.end_date,
    cities: (trip.cities || []).map((c) => c.name),
    countries
  };
}

export { CURRENCIES, DATE_RE, TIME_RE, KINDS, STATUSES };
