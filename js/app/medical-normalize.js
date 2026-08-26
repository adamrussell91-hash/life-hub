import { isCalendarDate } from '../core/time.js';

export const MEDICAL_RECORD_TYPES = [
  'Appointment', 'Consultation', 'Lab Work', 'Test Result', 'Imaging',
  'Surgery/Hospital', 'Prescription', 'Referral', 'Vaccination'
];

const MEDICAL_LANES = [
  'hospital', 'lab', 'imaging', 'prescription', 'referral', 'vaccine',
  'dental', 'therapy', 'eye', 'appointment'
];

const RECORD_TYPE_SET = new Set(MEDICAL_RECORD_TYPES);
const LANE_SET = new Set(MEDICAL_LANES);

function blankToNull(value) {
  if (value == null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}

function cleanString(value) {
  const cleaned = blankToNull(value);
  return typeof cleaned === 'string' ? cleaned.trim() : null;
}

function parseFiniteNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(/A\$/gi, '').replace(/[$,]/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCalendarDate(value) {
  const cleaned = cleanString(value);
  if (!cleaned) return null;
  return isCalendarDate(cleaned) ? cleaned : null;
}

function normalizeEpisode(value) {
  if (value == null || value === '') return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = cleanString(value.id);
  const title = cleanString(value.title);
  if (!id || !title) return null;
  return { id, title };
}

export function locationKindFor(title, location) {
  const blob = `${title ?? ''} ${location ?? ''}`;
  if (/telehealth|\bzoom\b|\bvideo\b|\bphone\b/i.test(blob)) return 'telehealth';
  if (!location) return 'unknown';
  return 'place';
}

export function laneFor(recordType, title, provider, location) {
  const blob = `${title ?? ''} ${provider ?? ''} ${location ?? ''}`;
  if (recordType === 'Surgery/Hospital') return 'hospital';
  if (recordType === 'Lab Work' || recordType === 'Test Result') return 'lab';
  if (recordType === 'Imaging') return 'imaging';
  if (recordType === 'Prescription') return 'prescription';
  if (recordType === 'Referral') return 'referral';
  if (recordType === 'Vaccination') return 'vaccine';
  if (/dentist|dentistry|\bdental\b/i.test(blob)) return 'dental';
  if (/therap|psycholog|kate semple/i.test(blob)) return 'therapy';
  if (/\beye\b|optom|eyecare/i.test(blob)) return 'eye';
  return 'appointment';
}

export function inferRecordType(recordType, title, notes) {
  const cleaned = cleanString(recordType);
  if (cleaned && RECORD_TYPE_SET.has(cleaned)) return cleaned;

  const blob = `${title ?? ''} ${notes ?? ''} ${cleaned ?? ''}`.toLowerCase();
  if (/vaccin|immunis|flu shot|covid shot/i.test(blob)) return 'Vaccination';
  if (/referr/i.test(blob)) return 'Referral';
  if (/\bx-?ray\b|\bmri\b|\bct\b|\bultrasound\b|\bimaging\b|\bscan\b/i.test(blob)) return 'Imaging';
  if (/\blab\b|blood test|pathology|calprotectin|ferritin|panel\b/i.test(blob)) return 'Lab Work';
  if (/surgery|hospital|admission|procedure\b/i.test(blob)) return 'Surgery/Hospital';
  if (
    /injection|infusion|stelara|ustekinumab|humira|adalimumab|biologic|prescription|script|medication|dose\b/i.test(blob)
  ) return 'Prescription';
  if (/consult/i.test(blob)) return 'Consultation';
  return 'Appointment';
}

/**
 * Coerce messy chat/tool payloads into a minimal valid medical visit shape.
 * Mirrors the import path: infer missing enums, drop empty placeholders, and
 * only keep optional fields when they are actually valid.
 */
export function normalizeMedicalFields(fields, { notes } = {}) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    return { title: 'Medical visit' };
  }

  const title = cleanString(fields.title) ?? inferTitleFromNotes(notes) ?? 'Medical visit';
  const provider = cleanString(fields.provider);
  const location = cleanString(fields.location);
  const record_type = inferRecordType(fields.record_type, title, notes);
  const lane = LANE_SET.has(fields.lane) ? fields.lane : laneFor(record_type, title, provider, location);
  const location_kind = ['place', 'telehealth', 'unknown'].includes(fields.location_kind)
    ? fields.location_kind
    : locationKindFor(title, location);

  const normalized = {
    title,
    record_type,
    lane,
    location_kind
  };

  const date_end = parseCalendarDate(fields.date_end);
  if (date_end) normalized.date_end = date_end;

  if (provider) normalized.provider = provider;
  if (location) normalized.location = location;

  const follow_up_date = parseCalendarDate(fields.follow_up_date);
  if (follow_up_date) normalized.follow_up_date = follow_up_date;

  const cost_aud = parseFiniteNumber(fields.cost_aud);
  if (cost_aud != null) normalized.cost_aud = cost_aud;

  const insurance_status = cleanString(fields.insurance_status);
  if (insurance_status) normalized.insurance_status = insurance_status;

  const episode = normalizeEpisode(fields.episode);
  if (episode) normalized.episode = episode;

  return normalized;
}

function inferTitleFromNotes(notes) {
  const text = cleanString(notes);
  if (!text) return null;
  const firstLine = text.split(/\n/)[0].trim();
  if (!firstLine) return null;
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
}

export function mergeMedicalFields(existing, incoming, { notes, existingNotes } = {}) {
  const base = normalizeMedicalFields(existing ?? {}, { notes: existingNotes ?? existing?.notes ?? notes });
  const next = normalizeMedicalFields(incoming ?? {}, { notes });
  const mergedNotes = mergeNotes(existingNotes ?? existing?.notes, notes);
  const mergedRaw = {
    ...base,
    ...next,
    title: next.title || base.title,
    provider: next.provider ?? base.provider,
    location: next.location ?? base.location,
    record_type: next.record_type ?? base.record_type,
    date_end: next.date_end ?? base.date_end,
    follow_up_date: next.follow_up_date ?? base.follow_up_date,
    cost_aud: next.cost_aud ?? base.cost_aud,
    insurance_status: next.insurance_status ?? base.insurance_status,
    episode: next.episode ?? base.episode
  };
  return {
    fields: normalizeMedicalFields(mergedRaw, { notes: mergedNotes }),
    notes: mergedNotes
  };
}

function mergeNotes(existingNotes, incomingNotes) {
  const left = cleanString(existingNotes);
  const right = cleanString(incomingNotes);
  if (!left) return right;
  if (!right) return left;
  if (left.includes(right) || right.includes(left)) return left.length >= right.length ? left : right;
  return `${left}\n\n${right}`;
}

const MEDICAL_PATH = /^data\/body\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}-medical-[a-z0-9-]+\.md$/;

function normaliseTitle(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/['’]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const TITLE_KEYWORDS = new Set([
  'stelara', 'ustekinumab', 'infusion', 'injection', 'maintenance', 'biologic'
]);

export function scoreMedicalTitleMatch(candidateTitle, recordTitle) {
  const left = normaliseTitle(candidateTitle);
  const right = normaliseTitle(recordTitle);
  if (!left || !right) return 0;
  if (left === right) return 100;
  if (left.includes(right) || right.includes(left)) return 80;
  const leftTokens = left.split(/\s+/).filter(Boolean);
  const rightTokens = right.split(/\s+/).filter(Boolean);
  const shared = leftTokens.filter(token =>
    token.length > 3 && rightTokens.includes(token)
  );
  if (shared.length >= 2) return 70;
  if (shared.length === 1 && TITLE_KEYWORDS.has(shared[0])) return 55;
  return 0;
}

export function parseMedicalEventTolerant(text, path, loadYaml) {
  if (typeof text !== 'string' || typeof loadYaml !== 'function') return null;
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?([\s\S]*)$/.exec(text.trim());
  if (!match) return null;
  const record = loadYaml(match[1]);
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  if (record.type !== 'medical') return null;
  return { record, body: match[2].trim(), path };
}

/**
 * When Sara appends to an existing visit, match by title (not just exact slug)
 * and merge onto the stored record's date/time before validation.
 */
export async function resolveMedicalLogCandidate(client, input, {
  today,
  loadYaml,
  decodeBlob
} = {}) {
  if (!input || input.type !== 'medical' || !client) return input;
  const fields = input.fields ?? {};
  const titleHint = cleanString(fields.title) ?? cleanString(input.notes) ?? '';
  if (!titleHint) return input;

  const current = await client.resolveTree();
  const entries = current.tree.filter(entry =>
    entry.type === 'blob' && MEDICAL_PATH.test(entry.path)
  );

  let best = null;
  let bestScore = 0;
  for (const entry of entries) {
    const text = decodeBlob(await client.readBlob(entry.sha));
    if (!text) continue;
    const parsed = parseMedicalEventTolerant(text, entry.path, loadYaml);
    if (!parsed) continue;
    let score = scoreMedicalTitleMatch(titleHint, parsed.record.title);
    if (input.date && parsed.record.date === input.date) score += 20;
    if (score > bestScore) {
      best = parsed;
      bestScore = score;
    }
  }

  if (!best || bestScore < 55) return input;

  const merged = mergeMedicalFields(best.record, fields, {
    notes: input.notes,
    existingNotes: best.body
  });

  return {
    type: 'medical',
    date: best.record.date,
    time: best.record.time ?? input.time,
    notes: merged.notes,
    fields: merged.fields
  };
}
