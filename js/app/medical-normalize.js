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
  return {
    fields: {
      ...base,
      ...next,
      title: next.title || base.title,
      provider: next.provider ?? base.provider ?? undefined,
      location: next.location ?? base.location ?? undefined,
      location_kind: next.location_kind ?? base.location_kind,
      record_type: next.record_type ?? base.record_type,
      lane: next.lane ?? base.lane,
      date_end: next.date_end ?? base.date_end ?? undefined,
      follow_up_date: next.follow_up_date ?? base.follow_up_date ?? undefined,
      cost_aud: next.cost_aud ?? base.cost_aud ?? undefined,
      insurance_status: next.insurance_status ?? base.insurance_status ?? undefined,
      episode: next.episode ?? base.episode ?? undefined
    },
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
