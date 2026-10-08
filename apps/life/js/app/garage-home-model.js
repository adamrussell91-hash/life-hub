/**
 * Garage & Home engine. Pure: no fetch, no DOM.
 *
 * Two stored records (private data repo, never this public code repo):
 *   - GARAGE_HOME_DATA_PATH: places (cars, the home we rent, investments),
 *     manual car visits, odometer readings, inspection prep ticks.
 *   - MAILROOM_DATA_PATH: emails the Mailroom has read, how each was filed,
 *     and sender rules learned from "move".
 *
 * Nothing personal lives in code. A place only catches mail through the
 * match words saved on it (an address fragment, a car name, a sender).
 *
 * Dates are `YYYY-MM-DD`. Money is AUD.
 */

export const GARAGE_HOME_DATA_PATH = 'data/home/garage-home.json';
export const MAILROOM_DATA_PATH = 'data/home/mailroom.json';
export const SCHEMA_VERSION = 1;

export const PLACE_TYPES = ['car', 'home', 'investment'];
export const PLACE_TYPE_LABELS = { car: 'Car', home: 'Home we rent', investment: 'Investment' };

/** Kinds the Mailroom can file, per place type. Order matters: first match wins. */
export const MAIL_KINDS = {
  home: [
    ['rent', /receipt of payment|rent (?:receipt|paid|payment)/],
    ['inspection', /routine inspection|inspection/],
    ['repair', /maintenance|repair/],
    ['lease', /lease|renewal|rent increase|rent review|bond/],
    ['bill', /\bgas\b|electric|energy|water|internet|\bnbn\b|\bbill\b|direct debit|upcoming payment/]
  ],
  investment: [
    ['statement', /statement/],
    ['job', /job request|repair|handyman|maintenance|work order|invoice/],
    ['inspection', /inspection/],
    ['tax', /depreciation|quantity surveyor|council rates|water rates|land tax|insurance|mybmt/]
  ],
  car: [
    ['booking', /booking|appointment|confirmed/],
    ['rego', /registration|\brego\b|green slip|\bctp\b|number plate|myplates/],
    ['insurance', /insurance|policy/],
    ['service', /\bservice\b|tyre|tire|battery|mechanic/],
    ['receipt', /receipt|invoice|paid/]
  ]
};

export const KIND_LABELS = {
  rent: 'Rent receipt',
  inspection: 'Inspection',
  repair: 'Repair',
  lease: 'Lease',
  bill: 'Bill',
  statement: 'Agent statement',
  job: 'Job',
  tax: 'Tax paperwork',
  booking: 'Booking',
  rego: 'Registration',
  insurance: 'Insurance',
  service: 'Service',
  receipt: 'Receipt',
  other: 'Other'
};

/** Kinds that may file themselves when the matching autopilot switch is on. */
export const AUTO_KINDS = ['rent', 'statement', 'bill'];

export const DEFAULT_PREP_CHECKLIST = [
  'Vacuum and tidy the living areas',
  'Floors clear of towels, bags and clutter',
  'Yard and pet areas tidy',
  'Note any repairs to raise with the agent',
  'Plan where the pets will be during the visit'
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const MAX_MAIL_ITEMS = 400;
const DEFAULT_SERVICE_INTERVAL_KM = 10_000;

// ── Small helpers ───────────────────────────────────────────────────────────

const isObj = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const num = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const text = (value, max = 280) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const round2 = value => Math.round(value * 100) / 100;

export function isDateKey(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

const toTime = key => Date.parse(`${key}T00:00:00Z`);
export const daysBetween = (fromKey, toKey) => Math.round((toTime(toKey) - toTime(fromKey)) / DAY_MS);

/** Sydney calendar day for an instant. */
export function sydneyDateKey(instant = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(instant)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Australian financial year containing a date. */
export function financialYear(dateKey) {
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(5, 7));
  const startYear = month >= 7 ? year : year - 1;
  return { label: `${startYear}-${String(startYear + 1).slice(2)}`, start: `${startYear}-07-01`, end: `${startYear + 1}-06-30` };
}

function slug(value) {
  return text(value, 60).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'place';
}

function cleanWords(list, max = 12) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const word = text(raw, 80);
    if (word.length < 3 || seen.has(word.toLowerCase())) continue;
    seen.add(word.toLowerCase());
    out.push(word);
    if (out.length >= max) break;
  }
  return out;
}

// ── Garage & Home record ────────────────────────────────────────────────────

export function emptyGarageHomeRecord() {
  return {
    version: SCHEMA_VERSION,
    places: [],
    visits: [],
    prep: { forDate: null, done: [] },
    settings: { autoFile: { rent: true, statement: true, bill: false } }
  };
}

function parseDetails(type, raw) {
  const d = isObj(raw) ? raw : {};
  if (type === 'car') {
    return {
      model: text(d.model, 80),
      purchasedOn: isDateKey(d.purchasedOn) ? d.purchasedOn : null,
      warrantyUntil: isDateKey(d.warrantyUntil) ? d.warrantyUntil : null,
      serviceIntervalKm: num(d.serviceIntervalKm) && d.serviceIntervalKm > 0 ? Math.round(d.serviceIntervalKm) : DEFAULT_SERVICE_INTERVAL_KM,
      retired: d.retired === true
    };
  }
  if (type === 'home') {
    return {
      address: text(d.address, 140),
      agent: text(d.agent, 80),
      weeklyRent: num(d.weeklyRent) && d.weeklyRent > 0 ? round2(d.weeklyRent) : null,
      leaseEnd: isDateKey(d.leaseEnd) ? d.leaseEnd : null,
      bond: num(d.bond) && d.bond > 0 ? round2(d.bond) : null,
      prepChecklist: cleanWords(d.prepChecklist, 12).length ? cleanWords(d.prepChecklist, 12) : [...DEFAULT_PREP_CHECKLIST]
    };
  }
  return {
    address: text(d.address, 140),
    agent: text(d.agent, 80),
    stillNeeded: cleanWords(d.stillNeeded, 16),
    neededDone: cleanWords(d.neededDone, 16)
  };
}

export function normalizePlace(raw, existingIds = new Set()) {
  if (!isObj(raw) || !PLACE_TYPES.includes(raw.type)) return null;
  const name = text(raw.name, 60);
  if (!name) return null;
  let id = typeof raw.id === 'string' && /^[a-z0-9-]{1,60}$/.test(raw.id) ? raw.id : slug(name);
  if (existingIds.has(id) && raw.id !== id) {
    let n = 2;
    while (existingIds.has(`${id}-${n}`)) n += 1;
    id = `${id}-${n}`;
  }
  return { id, type: raw.type, name, match: cleanWords(raw.match), details: parseDetails(raw.type, raw.details) };
}

export function normalizeVisit(raw) {
  if (!isObj(raw) || !isDateKey(raw.date) || typeof raw.placeId !== 'string') return null;
  const title = text(raw.title, 120);
  if (!title) return null;
  const km = num(raw.km);
  const cost = num(raw.cost);
  return {
    id: typeof raw.id === 'string' ? raw.id.slice(0, 40) : '',
    placeId: raw.placeId,
    date: raw.date,
    title,
    provider: text(raw.provider, 80),
    km: km !== null && km >= 0 ? Math.round(km) : null,
    cost: cost !== null && cost >= 0 ? round2(cost) : null,
    note: text(raw.note, 400)
  };
}

/** Parse a stored record. Unknown fields drop, broken rows skip. Null when unusable. */
export function parseGarageHomeRecord(raw) {
  if (!isObj(raw)) return null;
  const base = emptyGarageHomeRecord();
  const ids = new Set();
  for (const p of Array.isArray(raw.places) ? raw.places : []) {
    const place = normalizePlace(p, ids);
    if (!place || ids.has(place.id)) continue;
    ids.add(place.id);
    base.places.push(place);
  }
  for (const v of Array.isArray(raw.visits) ? raw.visits : []) {
    const visit = normalizeVisit(v);
    if (visit && visit.id && ids.has(visit.placeId)) base.visits.push(visit);
  }
  base.visits.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (isObj(raw.prep)) {
    base.prep = {
      forDate: isDateKey(raw.prep.forDate) ? raw.prep.forDate : null,
      done: Array.isArray(raw.prep.done) ? raw.prep.done.filter(item => typeof item === 'string').slice(0, 20) : []
    };
  }
  const auto = raw.settings?.autoFile;
  if (isObj(auto)) {
    for (const key of AUTO_KINDS) if (typeof auto[key] === 'boolean') base.settings.autoFile[key] = auto[key];
  }
  return base;
}

export function savePlace(record, input) {
  const existing = new Set(record.places.map(p => p.id));
  const editing = typeof input?.id === 'string' && existing.has(input.id);
  if (editing) existing.delete(input.id);
  const place = normalizePlace(input, existing);
  if (!place) return { error: 'A place needs a name and a type (car, home or investment).' };
  const places = editing ? record.places.map(p => (p.id === input.id ? place : p)) : [...record.places, place];
  return { record: { ...record, places }, place };
}

export function removePlace(record, id) {
  if (!record.places.some(p => p.id === id)) return { error: 'That place no longer exists.' };
  return { record: { ...record, places: record.places.filter(p => p.id !== id), visits: record.visits.filter(v => v.placeId !== id) } };
}

export function addVisit(record, input, { id }) {
  const visit = normalizeVisit({ ...input, id });
  if (!visit) return { error: 'A visit needs a car, a date and what was done.' };
  const car = record.places.find(p => p.id === visit.placeId);
  if (!car || car.type !== 'car') return { error: 'Pick one of your cars.' };
  const visits = [...record.visits, visit].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { record: { ...record, visits }, visit };
}

export function removeVisit(record, id) {
  if (!record.visits.some(v => v.id === id)) return { error: 'That visit no longer exists.' };
  return { record: { ...record, visits: record.visits.filter(v => v.id !== id) } };
}

export function togglePrep(record, { forDate, item }) {
  if (!isDateKey(forDate) || typeof item !== 'string' || !item) return { error: 'Pick a checklist item.' };
  const done = record.prep.forDate === forDate ? record.prep.done : [];
  const next = done.includes(item) ? done.filter(entry => entry !== item) : [...done, item];
  return { record: { ...record, prep: { forDate, done: next } } };
}

export function toggleNeeded(record, { placeId, item }) {
  const place = record.places.find(p => p.id === placeId && p.type === 'investment');
  if (!place || !place.details.stillNeeded.includes(item)) return { error: 'Pick an item from the list.' };
  const done = place.details.neededDone.includes(item) ? place.details.neededDone.filter(x => x !== item) : [...place.details.neededDone, item];
  return savePlace(record, { ...place, details: { ...place.details, neededDone: done } });
}

export function updateAutoFile(record, patch) {
  if (!isObj(patch)) return { error: 'Nothing to change.' };
  const autoFile = { ...record.settings.autoFile };
  for (const key of AUTO_KINDS) if (typeof patch[key] === 'boolean') autoFile[key] = patch[key];
  return { record: { ...record, settings: { ...record.settings, autoFile } } };
}

/**
 * Merge a setup pack (places + car history) pasted once from an export.
 * Places merge by id; visits dedupe on car + date + title.
 */
export function importPack(record, pack, { newId }) {
  if (!isObj(pack)) return { error: 'That doesn’t look like a setup pack.' };
  let next = record;
  let placesAdded = 0;
  let visitsAdded = 0;
  for (const raw of Array.isArray(pack.places) ? pack.places : []) {
    const name = typeof raw?.name === 'string' ? raw.name.trim().toLowerCase() : '';
    const existing = next.places.find(p => p.id === raw?.id || (!raw?.id && p.type === raw?.type && p.name.toLowerCase() === name));
    const result = savePlace(next, existing ? { ...raw, id: existing.id } : raw);
    if (result.error) continue;
    next = result.record;
    if (!existing) placesAdded += 1;
  }
  const key = v => `${v.placeId}|${v.date}|${v.title.toLowerCase()}`;
  const seen = new Set(next.visits.map(key));
  for (const raw of Array.isArray(pack.visits) ? pack.visits : []) {
    const visit = normalizeVisit({ ...raw, id: 'tmp' });
    if (!visit || seen.has(key(visit))) continue;
    const result = addVisit(next, raw, { id: newId() });
    if (result.error) continue;
    next = result.record;
    seen.add(key(visit));
    visitsAdded += 1;
  }
  const placesChanged = JSON.stringify(next.places) !== JSON.stringify(record.places);
  if (!placesAdded && !visitsAdded && !placesChanged) return { error: 'Nothing new in that pack.' };
  return { record: next, placesAdded, visitsAdded };
}

// ── Mailroom record ─────────────────────────────────────────────────────────

export function emptyMailroomRecord() {
  return { version: SCHEMA_VERSION, lastScanAt: null, items: [], senderRules: [] };
}

function normalizeItem(raw) {
  if (!isObj(raw) || typeof raw.id !== 'string' || !raw.id || !isDateKey(raw.date)) return null;
  const status = ['waiting', 'filed', 'ignored'].includes(raw.status) ? raw.status : 'waiting';
  const facts = isObj(raw.facts) ? raw.facts : {};
  return {
    id: raw.id.slice(0, 40),
    threadId: typeof raw.threadId === 'string' ? raw.threadId.slice(0, 40) : '',
    from: text(raw.from, 120),
    fromAddress: text(raw.fromAddress, 120).toLowerCase(),
    subject: text(raw.subject, 200),
    snippet: text(raw.snippet, 280),
    date: raw.date,
    placeId: typeof raw.placeId === 'string' ? raw.placeId : null,
    kind: typeof raw.kind === 'string' && KIND_LABELS[raw.kind] ? raw.kind : 'other',
    facts: {
      amount: num(facts.amount),
      eventDate: isDateKey(facts.eventDate) ? facts.eventDate : null,
      ref: text(facts.ref, 40),
      number: num(facts.number)
    },
    status,
    auto: raw.auto === true,
    decidedOn: isDateKey(raw.decidedOn) ? raw.decidedOn : null
  };
}

export function parseMailroomRecord(raw) {
  if (!isObj(raw)) return null;
  const base = emptyMailroomRecord();
  base.lastScanAt = typeof raw.lastScanAt === 'string' ? raw.lastScanAt.slice(0, 40) : null;
  const ids = new Set();
  for (const r of Array.isArray(raw.items) ? raw.items : []) {
    const item = normalizeItem(r);
    if (!item || ids.has(item.id)) continue;
    ids.add(item.id);
    base.items.push(item);
  }
  base.items.sort(byNewest);
  for (const rule of Array.isArray(raw.senderRules) ? raw.senderRules : []) {
    if (isObj(rule) && typeof rule.from === 'string' && rule.from.trim().length >= 3 && typeof rule.placeId === 'string') {
      base.senderRules.push({ from: rule.from.trim().toLowerCase().slice(0, 120), placeId: rule.placeId });
    }
  }
  return base;
}

function byNewest(a, b) {
  return a.date > b.date ? -1 : a.date < b.date ? 1 : 0;
}

// ── Reading an email ────────────────────────────────────────────────────────

/** "Name <a@b.com>" → { name, address }. */
export function parseFrom(value) {
  const raw = text(value, 200);
  const match = raw.match(/^(.*?)<([^>]+)>\s*$/);
  if (match) return { name: match[1].replace(/^"|"$/g, '').trim() || match[2].trim(), address: match[2].trim().toLowerCase() };
  return { name: raw, address: raw.includes('@') ? raw.toLowerCase() : '' };
}

/** First dd/mm/yyyy (or d/m/yy) in the text, as YYYY-MM-DD. */
export function findDate(value) {
  const match = String(value ?? '').match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/);
  if (!match) return null;
  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  const key = `${year}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`;
  return isDateKey(key) ? key : null;
}

export function findAmount(value) {
  const match = String(value ?? '').match(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)/);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(amount) ? amount : null;
}

function findRef(value) {
  const match = String(value ?? '').match(/\bref(?:erence)?\s*(?:#|no\.?|number)?\s*:?\s*([A-Z0-9][A-Z0-9-]{3,})/i);
  return match ? match[1] : '';
}

function findNumber(value) {
  const match = String(value ?? '').match(/#\s?(\d{1,5})\b/);
  return match ? Number(match[1]) : null;
}

function senderMatches(rule, address) {
  if (!address) return false;
  return rule.from.includes('@') ? address === rule.from : address.endsWith(`@${rule.from}`) || address.endsWith(`.${rule.from}`);
}

/** Which of your places this email is about, or null. Sender rules beat match words. */
export function placeForMessage(message, places, senderRules = []) {
  const { address } = parseFrom(message.from);
  for (const rule of senderRules) {
    if (senderMatches(rule, address)) {
      const place = places.find(p => p.id === rule.placeId);
      if (place) return place;
    }
  }
  const haystack = `${message.subject ?? ''} ${message.snippet ?? ''}`.toLowerCase();
  let best = null;
  let bestLength = 0;
  for (const place of places) {
    if (place.type === 'car' && place.details.retired) continue;
    for (const word of place.match) {
      const needle = word.toLowerCase();
      if (needle.length > bestLength && haystack.includes(needle)) {
        best = place;
        bestLength = needle.length;
      }
    }
  }
  return best;
}

export function kindFor(placeType, message) {
  const haystack = `${message.subject ?? ''} ${message.snippet ?? ''}`.toLowerCase();
  for (const [kind, pattern] of MAIL_KINDS[placeType] ?? []) if (pattern.test(haystack)) return kind;
  return 'other';
}

/**
 * Turn one Gmail message (id, threadId, from, subject, snippet, date) into a
 * Mailroom item, or null when it isn't about any of your places.
 */
export function classifyMessage(message, { places, senderRules = [], autoFile = {}, forcePlaceId = null }) {
  if (!isObj(message) || typeof message.id !== 'string' || !isDateKey(message.date)) return null;
  const place = forcePlaceId ? places.find(p => p.id === forcePlaceId) : placeForMessage(message, places, senderRules);
  if (!place) return null;
  const kind = kindFor(place.type, message);
  const body = `${message.subject ?? ''} ${message.snippet ?? ''}`;
  const facts = {
    amount: findAmount(body),
    eventDate: findDate(body),
    ref: findRef(body),
    number: kind === 'statement' ? findNumber(message.subject) : null
  };
  const auto = AUTO_KINDS.includes(kind) && autoFile[kind] === true;
  const from = parseFrom(message.from);
  return normalizeItem({
    id: message.id,
    threadId: message.threadId,
    from: from.name,
    fromAddress: from.address,
    subject: message.subject,
    snippet: message.snippet,
    date: message.date,
    placeId: place.id,
    kind,
    facts,
    status: auto ? 'filed' : 'waiting',
    auto
  });
}

/** Fold freshly fetched messages into the Mailroom. Already-seen ids are left alone. */
export function mergeScan(mailroom, messages, { home, scannedAt }) {
  const seen = new Set(mailroom.items.map(item => item.id));
  const added = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message || seen.has(message.id)) continue;
    const item = classifyMessage(message, { places: home.places, senderRules: mailroom.senderRules, autoFile: home.settings.autoFile });
    if (!item) continue;
    seen.add(item.id);
    added.push(item);
  }
  const items = [...added, ...mailroom.items].sort(byNewest);
  if (items.length > MAX_MAIL_ITEMS) {
    const keep = items.filter(item => item.status === 'waiting');
    for (const item of items) if (item.status !== 'waiting' && keep.length < MAX_MAIL_ITEMS) keep.push(item);
    items.splice(0, items.length, ...keep.sort(byNewest));
  }
  return { mailroom: { ...mailroom, items, lastScanAt: scannedAt ?? mailroom.lastScanAt }, added };
}

/**
 * One decision on one email: approve, ignore, undo, or move to another place
 * (optionally remembering the sender for next time).
 */
export function applyMailAction(mailroom, home, action, { today }) {
  const item = mailroom.items.find(entry => entry.id === action?.id);
  if (!item) return { error: 'That email is no longer in the Mailroom.' };
  let next = item;
  let senderRules = mailroom.senderRules;
  if (action.action === 'approve') {
    if (!item.placeId) return { error: 'Pick a place first.' };
    next = { ...item, status: 'filed', auto: false, decidedOn: today };
  } else if (action.action === 'ignore') {
    next = { ...item, status: 'ignored', auto: false, decidedOn: today };
  } else if (action.action === 'undo') {
    next = { ...item, status: 'waiting', auto: false, decidedOn: null };
  } else if (action.action === 'move') {
    const place = home.places.find(p => p.id === action.placeId);
    if (!place) return { error: 'Pick one of your places.' };
    next = { ...item, placeId: place.id, kind: kindFor(place.type, item), status: 'waiting', auto: false, decidedOn: null };
    if (action.remember === true && item.fromAddress) {
      senderRules = [...mailroom.senderRules.filter(rule => rule.from !== item.fromAddress), { from: item.fromAddress, placeId: place.id }];
    }
  } else {
    return { error: 'Unknown Mailroom action.' };
  }
  return { mailroom: { ...mailroom, senderRules, items: mailroom.items.map(entry => (entry.id === item.id ? next : entry)) }, item: next };
}

export function forgetSender(mailroom, from) {
  return { mailroom: { ...mailroom, senderRules: mailroom.senderRules.filter(rule => rule.from !== from) } };
}

/**
 * Gmail search for everything any place could catch. Match words are
 * quoted phrases; sender rules become from: terms.
 */
export function buildGmailQuery(home, mailroom, { sinceDateKey, days = 21 } = {}) {
  const terms = [];
  for (const place of home.places) {
    if (place.type === 'car' && place.details.retired) continue;
    for (const word of place.match) terms.push(`"${word.replace(/"/g, '')}"`);
  }
  for (const rule of mailroom.senderRules) terms.push(`from:${rule.from}`);
  if (!terms.length) return null;
  const window = isDateKey(sinceDateKey) ? `after:${sinceDateKey.replace(/-/g, '/')}` : `newer_than:${days}d`;
  return `${window} -in:spam -in:trash (${[...new Set(terms)].join(' OR ')})`;
}

// ── The page model ──────────────────────────────────────────────────────────

/** Last known km and a straight-line estimate for today from the car's own history. */
export function odometer(visits, today) {
  const points = visits.filter(v => v.km !== null && v.km > 0).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!points.length) return null;
  const last = points[points.length - 1];
  const first = points[0];
  const span = daysBetween(first.date, last.date);
  const perDay = points.length > 1 && span > 30 ? (last.km - first.km) / span : null;
  const since = daysBetween(last.date, today);
  const estimate = perDay !== null && since > 0 ? Math.round(last.km + perDay * since) : last.km;
  return {
    lastKm: last.km,
    lastDate: last.date,
    perMonth: perDay !== null ? Math.round(perDay * 30.44) : null,
    estimate,
    isEstimate: estimate !== last.km
  };
}

const CAR_TIMELINE_KINDS = new Set(['booking', 'service', 'receipt', 'rego', 'insurance', 'other']);

function carTimeline(car, record, filed) {
  const manual = record.visits.filter(v => v.placeId === car.id).map(v => ({ ...v, source: 'manual' }));
  const fromMail = filed
    .filter(item => item.placeId === car.id && CAR_TIMELINE_KINDS.has(item.kind))
    .map(item => ({
      id: `mail-${item.id}`,
      placeId: car.id,
      date: item.facts.eventDate ?? item.date,
      title: KIND_LABELS[item.kind] === 'Other' ? item.subject : `${KIND_LABELS[item.kind]} · ${item.from}`,
      provider: item.from,
      km: null,
      cost: item.facts.amount,
      note: item.subject,
      source: 'mail',
      ref: item.facts.ref
    }));
  return [...manual, ...fromMail].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function carModel(car, record, filed, today) {
  const timeline = carTimeline(car, record, filed);
  const odo = odometer(record.visits.filter(v => v.placeId === car.id), today);
  const spend = round2(timeline.filter(v => v.source === 'manual').reduce((sum, v) => sum + (v.cost ?? 0), 0));
  const lastServiceKm = [...record.visits].reverse().find(v => v.placeId === car.id && v.km !== null)?.km ?? null;
  const nextServiceKm = lastServiceKm !== null ? lastServiceKm + car.details.serviceIntervalKm : null;
  const pastBookings = timeline.filter(v => v.source === 'mail' && v.date <= today && v.title.startsWith('Booking'));
  const lastManual = [...timeline].reverse().find(v => v.source === 'manual');
  const unlogged = pastBookings.filter(b => !lastManual || lastManual.date < b.date);
  const warrantyLeftDays = car.details.warrantyUntil ? daysBetween(today, car.details.warrantyUntil) : null;
  return {
    place: car,
    timeline,
    odometer: odo,
    spend,
    visitCount: timeline.length,
    nextServiceKm,
    serviceDue: odo && nextServiceKm !== null ? odo.estimate >= nextServiceKm : false,
    unloggedBooking: unlogged[unlogged.length - 1] ?? null,
    warrantyLeftDays
  };
}

function homeModel(place, record, filed, today) {
  const mine = filed.filter(item => item.placeId === place.id);
  const rent = mine.filter(item => item.kind === 'rent').slice(0, 8);
  const inspections = mine.filter(item => item.kind === 'inspection' && item.facts.eventDate).sort((a, b) => (a.facts.eventDate < b.facts.eventDate ? -1 : 1));
  const nextInspection = inspections.find(item => item.facts.eventDate >= today) ?? null;
  const repairsByThread = new Map();
  for (const item of mine.filter(entry => entry.kind === 'repair')) {
    const key = item.threadId || item.id;
    const list = repairsByThread.get(key) ?? [];
    list.push(item);
    repairsByThread.set(key, list);
  }
  const repairs = [...repairsByThread.values()].map(list => {
    const steps = [...list].sort((a, b) => (a.date < b.date ? -1 : 1));
    return { subject: steps[0].subject.replace(/^(re|fwd?):\s*/i, ''), steps, latest: steps[steps.length - 1] };
  }).sort((a, b) => (a.latest.date > b.latest.date ? -1 : 1));
  const checklist = place.details.prepChecklist ?? DEFAULT_PREP_CHECKLIST;
  const forDate = nextInspection?.facts.eventDate ?? null;
  const done = forDate && record.prep.forDate === forDate ? record.prep.done.filter(item => checklist.includes(item)) : [];
  return {
    place,
    rent,
    nextInspection,
    daysToInspection: nextInspection ? daysBetween(today, nextInspection.facts.eventDate) : null,
    prep: { forDate, items: checklist.map(item => ({ item, done: done.includes(item) })), doneCount: done.length },
    repairs,
    bills: mine.filter(item => item.kind === 'bill').slice(0, 6),
    lease: mine.filter(item => item.kind === 'lease').slice(0, 4),
    leaseLeftDays: place.details.leaseEnd ? daysBetween(today, place.details.leaseEnd) : null
  };
}

function investmentModel(place, filed, today) {
  const fy = financialYear(today);
  const mine = filed.filter(item => item.placeId === place.id);
  const thisYear = mine.filter(item => item.date >= fy.start && item.date <= fy.end);
  const daysIn = daysBetween(fy.start, today) + 1;
  const daysTotal = daysBetween(fy.start, fy.end) + 1;
  return {
    place,
    fy,
    yearProgress: Math.max(0, Math.min(1, daysIn / daysTotal)),
    dayOfYear: daysIn,
    daysInYear: daysTotal,
    pack: {
      statements: thisYear.filter(item => item.kind === 'statement'),
      jobs: thisYear.filter(item => item.kind === 'job'),
      inspections: thisYear.filter(item => item.kind === 'inspection'),
      tax: thisYear.filter(item => item.kind === 'tax'),
      other: thisYear.filter(item => item.kind === 'other')
    },
    packCount: thisYear.length,
    stillNeeded: place.details.stillNeeded.map(item => ({ item, done: place.details.neededDone.includes(item) })),
    latestStatement: mine.find(item => item.kind === 'statement') ?? null
  };
}

/** Everything the Garage & Home page shows. */
export function buildGarageHomeModel(record, mailroom, { today }) {
  const filed = mailroom.items.filter(item => item.status === 'filed');
  const waiting = mailroom.items.filter(item => item.status === 'waiting');
  const cars = record.places.filter(p => p.type === 'car').map(car => carModel(car, record, filed, today));
  const homes = record.places.filter(p => p.type === 'home').map(place => homeModel(place, record, filed, today));
  const investments = record.places.filter(p => p.type === 'investment').map(place => investmentModel(place, filed, today));

  const needsYou = [];
  if (waiting.length) needsYou.push({ kind: 'mail', tone: 'act', title: `${waiting.length} email${waiting.length === 1 ? '' : 's'} waiting for a tap`, detail: 'Approve, move or ignore them in the Mailroom.', target: 'mailroom' });
  for (const home of homes) {
    if (home.nextInspection && home.daysToInspection <= 14) {
      needsYou.push({ kind: 'inspection', tone: 'soon', placeId: home.place.id, title: `Inspection ${home.daysToInspection === 0 ? 'today' : `in ${home.daysToInspection} day${home.daysToInspection === 1 ? '' : 's'}`}`, detail: `${home.place.name}: ${home.prep.doneCount} of ${home.prep.items.length} prep items done.`, target: home.place.id });
    }
    if (home.leaseLeftDays !== null && home.leaseLeftDays >= 0 && home.leaseLeftDays <= 60) {
      needsYou.push({ kind: 'lease', tone: 'soon', placeId: home.place.id, title: `Lease ends in ${home.leaseLeftDays} days`, detail: `${home.place.name}. Renewal mail will land here when it arrives.`, target: home.place.id });
    }
  }
  for (const car of cars) {
    if (car.place.details.retired) continue;
    if (car.unloggedBooking) {
      needsYou.push({ kind: 'log', tone: 'act', placeId: car.place.id, title: `${car.place.name}: log the visit`, detail: `${car.unloggedBooking.provider || 'A booking'} was on ${car.unloggedBooking.date}. Add the kilometres and the cost.`, target: car.place.id });
    } else if (car.serviceDue) {
      needsYou.push({ kind: 'service', tone: 'soon', placeId: car.place.id, title: `${car.place.name} is probably due a service`, detail: `Estimated ${car.odometer.estimate.toLocaleString('en-AU')} km; the next service was due at ${car.nextServiceKm.toLocaleString('en-AU')} km.`, target: car.place.id });
    }
  }
  for (const inv of investments) {
    const open = inv.stillNeeded.filter(entry => !entry.done).length;
    if (open) needsYou.push({ kind: 'tax', tone: 'calm', placeId: inv.place.id, title: `${open} item${open === 1 ? '' : 's'} still needed for tax time`, detail: `${inv.place.name}, FY ${inv.fy.label}.`, target: inv.place.id });
  }

  return {
    today,
    places: record.places,
    cars,
    homes,
    investments,
    mail: {
      waiting,
      filed,
      ignored: mailroom.items.filter(item => item.status === 'ignored'),
      lastScanAt: mailroom.lastScanAt,
      autoFiledRecently: filed.filter(item => item.auto && daysBetween(item.date, today) <= 14).length,
      senderRules: mailroom.senderRules
    },
    needsYou,
    settings: record.settings,
    isEmpty: record.places.length === 0
  };
}
