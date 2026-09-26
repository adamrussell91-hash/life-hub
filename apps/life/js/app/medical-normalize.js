import { daysBetween, isCalendarDate } from '../core/time.js';

export const MEDICAL_RECORD_TYPES = [
  'Appointment', 'Consultation', 'Lab Work', 'Test Result', 'Imaging',
  'Surgery/Hospital', 'Prescription', 'Referral', 'Vaccination', 'Symptom'
];

export const MEDICAL_WEIGHTS = ['major', 'routine', 'minor'];

const MEDICAL_LANES = [
  'hospital', 'lab', 'imaging', 'prescription', 'referral', 'vaccine',
  'dental', 'therapy', 'eye', 'appointment', 'symptom'
];

const MEDICAL_STATUSES = ['planned', 'to_book', 'booked', 'done'];
const DATE_PRECISIONS = ['day', 'month', 'tbd'];
const EPISODE_STATUSES = ['active', 'resolved'];

const RECORD_TYPE_SET = new Set(MEDICAL_RECORD_TYPES);
const LANE_SET = new Set(MEDICAL_LANES);
const WEIGHT_SET = new Set(MEDICAL_WEIGHTS);
const STATUS_SET = new Set(MEDICAL_STATUSES);
const DATE_PRECISION_SET = new Set(DATE_PRECISIONS);

const SYMPTOM_LANGUAGE = /\b(sore|sniffles|cough|headache|cramping|nausea|tired|run down|congested|throat|fever|ache|painful|runny nose|cold symptoms)\b/i;
const VISIT_OR_PROVIDER_LANGUAGE = /\b(dr\.?|doctor|gp|clinic|hospital|appointment|consult|saw |visited |referral|pathology|scan|mri|mrcp|colonoscopy|injection|infusion|stelara|humira)\b/i;

/** Same-title visits more than this many days apart are new timeline entries, not appends. */
const APPEND_DATE_SLOP_DAYS = 3;

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

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

/**
 * Coerce chat/tool date strings into YYYY-MM-DD.
 * Accepts ISO, AU D/M/YYYY, AU D/M (year from `today`), and day-month-name forms.
 */
export function coerceCalendarDate(value, { today } = {}) {
  const cleaned = cleanString(value);
  if (!cleaned) return null;
  if (isCalendarDate(cleaned)) return cleaned;

  const iso = /^(\d{4})-(\d{2})-(\d{2})\b/.exec(cleaned);
  if (iso) {
    const key = `${iso[1]}-${iso[2]}-${iso[3]}`;
    return isCalendarDate(key) ? key : null;
  }

  const dmyY = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(cleaned);
  if (dmyY) {
    const key = `${dmyY[3]}-${String(Number(dmyY[2])).padStart(2, '0')}-${String(Number(dmyY[1])).padStart(2, '0')}`;
    return isCalendarDate(key) ? key : null;
  }

  const dmy = /^(\d{1,2})[/.-](\d{1,2})$/.exec(cleaned);
  if (dmy && typeof today === 'string' && isCalendarDate(today)) {
    const year = today.slice(0, 4);
    const key = `${year}-${String(Number(dmy[2])).padStart(2, '0')}-${String(Number(dmy[1])).padStart(2, '0')}`;
    return isCalendarDate(key) ? key : null;
  }

  const dayFirst = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(cleaned);
  if (dayFirst) {
    const month = MONTHS[dayFirst[2].toLowerCase()];
    if (!month) return null;
    const key = `${dayFirst[3]}-${String(month).padStart(2, '0')}-${String(Number(dayFirst[1])).padStart(2, '0')}`;
    return isCalendarDate(key) ? key : null;
  }

  const monthFirst = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/.exec(cleaned);
  if (monthFirst) {
    const month = MONTHS[monthFirst[1].toLowerCase()];
    if (!month) return null;
    const key = `${monthFirst[3]}-${String(month).padStart(2, '0')}-${String(Number(monthFirst[2])).padStart(2, '0')}`;
    return isCalendarDate(key) ? key : null;
  }

  return null;
}

function parseCalendarDate(value, { today } = {}) {
  return coerceCalendarDate(value, { today });
}

function normalizeEpisode(value) {
  if (value == null || value === '') return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = cleanString(value.id);
  const title = cleanString(value.title);
  if (!id || !title) return null;
  const episode = { id, title };
  const status = cleanString(value.status);
  if (status && EPISODE_STATUSES.includes(status)) episode.status = status;
  const started = parseCalendarDate(value.started);
  if (started) episode.started = started;
  const resolved = parseCalendarDate(value.resolved);
  if (resolved) episode.resolved = resolved;
  return episode;
}

/**
 * Visual importance for the weighted river. Sara may omit weight; infer from type/title.
 * major: surgery/hospital, imaging, referral, specialist consultation, biologic infusion/injection, lab with bloods
 * routine: appointment, prescription (non-biologic), vaccination, therapy
 * minor: Symptom (default)
 */
export function inferWeight(record = {}) {
  const explicit = cleanString(record.weight);
  if (explicit && WEIGHT_SET.has(explicit)) return explicit;

  const recordType = cleanString(record.record_type) || '';
  const blob = `${record.title ?? ''} ${record.notes ?? ''} ${record.provider ?? ''}`.toLowerCase();

  if (recordType === 'Symptom') return 'minor';
  if (
    recordType === 'Surgery/Hospital'
    || recordType === 'Imaging'
    || recordType === 'Referral'
    || (recordType === 'Consultation' && /specialist|gastro|hepat|rheumat|cardio|endocrin|neurolog/i.test(blob))
    || (recordType === 'Lab Work' && (record.lab || /bloods|panel|pathology/i.test(blob)))
    || /infusion|injection|stelara|ustekinumab|humira|adalimumab|biologic/i.test(blob)
  ) {
    return 'major';
  }
  if (
    recordType === 'Appointment'
    || recordType === 'Prescription'
    || recordType === 'Vaccination'
    || recordType === 'Consultation'
    || /therap|psycholog/i.test(blob)
  ) {
    return 'routine';
  }
  return 'routine';
}

export function locationKindFor(title, location) {
  const blob = `${title ?? ''} ${location ?? ''}`;
  if (/telehealth|\bzoom\b|\bvideo\b|\bphone\b/i.test(blob)) return 'telehealth';
  if (!location) return 'unknown';
  return 'place';
}

export function laneFor(recordType, title, provider, location) {
  const blob = `${title ?? ''} ${provider ?? ''} ${location ?? ''}`;
  if (recordType === 'Symptom') return 'symptom';
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

  const blob = `${title ?? ''} ${notes ?? ''} ${cleaned ?? ''}`;
  const lower = blob.toLowerCase();
  if (/vaccin|immunis|flu shot|covid shot/i.test(lower)) return 'Vaccination';
  if (/referr/i.test(lower)) return 'Referral';
  if (/\bx-?ray\b|\bmri\b|\bct\b|\bultrasound\b|\bimaging\b|\bscan\b/i.test(lower)) return 'Imaging';
  if (/\blab\b|blood test|pathology|calprotectin|ferritin|panel\b/i.test(lower)) return 'Lab Work';
  if (/surgery|hospital|admission|procedure\b/i.test(lower)) return 'Surgery/Hospital';
  if (
    /injection|infusion|stelara|ustekinumab|humira|adalimumab|biologic|prescription|script|medication|dose\b/i.test(lower)
  ) return 'Prescription';
  if (/consult/i.test(lower)) return 'Consultation';
  // Symptom when feeling language is present and there are no provider/visit words.
  if (SYMPTOM_LANGUAGE.test(blob) && !VISIT_OR_PROVIDER_LANGUAGE.test(blob)) return 'Symptom';
  return 'Appointment';
}

function slugifyEpisodeId(title) {
  return String(title ?? '')
    .normalize('NFKD')
    .replace(/['’]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'episode';
}

/**
 * Join a Symptom onto the newest active episode started within 7 days,
 * otherwise start a new episode titled from the symptom.
 */
export function joinOrCreateEpisode(fields, { notes, today, activeEpisodes = [] } = {}) {
  if (fields?.episode) return normalizeEpisode(fields.episode);
  const recordType = inferRecordType(fields?.record_type, fields?.title, notes);
  if (recordType !== 'Symptom') return null;

  const entryDate = parseCalendarDate(fields?.date, { today })
    ?? (typeof today === 'string' && isCalendarDate(today) ? today : null);
  const active = [...activeEpisodes]
    .filter(ep => ep && (ep.status === 'active' || !ep.status))
    .sort((a, b) => String(b.started ?? '').localeCompare(String(a.started ?? '')));

  for (const ep of active) {
    const start = ep.started || ep.firstDate;
    if (!start || !entryDate || !isCalendarDate(start) || !isCalendarDate(entryDate)) continue;
    if (Math.abs(daysBetween(start, entryDate)) <= 7) {
      return normalizeEpisode({
        id: ep.id,
        title: ep.title,
        status: ep.status || 'active',
        started: start,
        resolved: ep.resolved
      });
    }
  }

  const title = cleanString(fields?.title)
    ?? inferTitleFromNotes(notes)
    ?? 'Symptom episode';
  const id = `ep-${slugifyEpisodeId(title)}-${(entryDate || today || 'new').replace(/-/g, '')}`;
  return { id, title, status: 'active', ...(entryDate ? { started: entryDate } : {}) };
}

/**
 * Coerce messy chat/tool payloads into a minimal valid medical visit shape.
 * Mirrors the import path: infer missing enums, drop empty placeholders, and
 * only keep optional fields when they are actually valid.
 */
export function normalizeMedicalFields(fields, { notes, today, activeEpisodes } = {}) {
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

  const weight = WEIGHT_SET.has(fields.weight) ? fields.weight : inferWeight({
    ...fields,
    record_type,
    title,
    notes,
    provider
  });
  if (weight) normalized.weight = weight;

  const status = cleanString(fields.status);
  if (status && STATUS_SET.has(status)) normalized.status = status;

  const date_precision = cleanString(fields.date_precision);
  if (date_precision && DATE_PRECISION_SET.has(date_precision)) {
    normalized.date_precision = date_precision;
  }

  const cadence_days = parseFiniteNumber(fields.cadence_days);
  if (cadence_days != null && cadence_days > 0) normalized.cadence_days = Math.round(cadence_days);

  const task_id = cleanString(fields.task_id);
  if (task_id) normalized.task_id = task_id;

  const date_end = parseCalendarDate(fields.date_end, { today });
  if (date_end) normalized.date_end = date_end;

  if (provider) normalized.provider = provider;
  if (location) normalized.location = location;

  const follow_up_date = parseCalendarDate(fields.follow_up_date, { today });
  if (follow_up_date) normalized.follow_up_date = follow_up_date;

  const cost_aud = parseFiniteNumber(fields.cost_aud);
  if (cost_aud != null) normalized.cost_aud = cost_aud;

  const insurance_status = cleanString(fields.insurance_status);
  if (insurance_status) normalized.insurance_status = insurance_status;

  let episode = normalizeEpisode(fields.episode);
  if (!episode && record_type === 'Symptom') {
    episode = joinOrCreateEpisode(
      { ...fields, record_type, title, date: fields.date },
      { notes, today, activeEpisodes }
    );
  }
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

export function mergeMedicalFields(existing, incoming, { notes, existingNotes, today } = {}) {
  const base = normalizeMedicalFields(existing ?? {}, {
    notes: existingNotes ?? existing?.notes ?? notes,
    today
  });
  const next = normalizeMedicalFields(incoming ?? {}, { notes, today });
  const mergedNotes = mergeNotes(existingNotes ?? existing?.notes, notes);
  const mergedRaw = {
    ...base,
    ...next,
    title: scoreMedicalTitleMatch(next.title, base.title) >= 55 ? base.title : (next.title || base.title),
    provider: next.provider ?? base.provider,
    location: next.location ?? base.location,
    record_type: next.record_type ?? base.record_type,
    weight: next.weight ?? base.weight,
    status: next.status ?? base.status,
    date_precision: next.date_precision ?? base.date_precision,
    cadence_days: next.cadence_days ?? base.cadence_days,
    task_id: next.task_id ?? base.task_id,
    date_end: next.date_end ?? base.date_end,
    follow_up_date: next.follow_up_date ?? base.follow_up_date,
    cost_aud: next.cost_aud ?? base.cost_aud,
    insurance_status: next.insurance_status ?? base.insurance_status,
    episode: next.episode ?? base.episode
  };
  return {
    fields: normalizeMedicalFields(mergedRaw, { notes: mergedNotes, today }),
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
 *
 * Same-title visits dated more than APPEND_DATE_SLOP_DAYS apart stay separate
 * timeline entries (e.g. next Stelara dose on 27/10) unless Sara explicitly
 * sets follow_up_date on the prior visit.
 *
 * Symptom / episode updates on a different calendar day become a new dated
 * record in the same episode (MO-05) — never merge onto the old date.
 */
export async function resolveMedicalLogCandidate(client, input, {
  today,
  loadYaml,
  decodeBlob
} = {}) {
  if (!input || input.type !== 'medical' || !client) return input;
  const fields = input.fields ?? {};
  const titleHint = cleanString(fields.title) ?? cleanString(input.notes) ?? '';
  const coercedDate = coerceCalendarDate(input.date, { today }) ?? cleanString(input.date);
  if (!titleHint) {
    return coercedDate && coercedDate !== input.date ? { ...input, date: coercedDate } : input;
  }

  let current;
  try {
    current = await client.resolveTree();
  } catch {
    return coercedDate && coercedDate !== input.date ? { ...input, date: coercedDate } : input;
  }
  const entries = current.tree.filter(entry =>
    entry.type === 'blob' && MEDICAL_PATH.test(entry.path)
  );

  const parsedRecords = [];
  let best = null;
  let bestScore = 0;
  for (const entry of entries) {
    let text;
    try {
      text = decodeBlob(await client.readBlob(entry.sha));
    } catch {
      continue;
    }
    if (!text) continue;
    const parsed = parseMedicalEventTolerant(text, entry.path, loadYaml);
    if (!parsed) continue;
    parsedRecords.push(parsed);
    let score = scoreMedicalTitleMatch(titleHint, parsed.record.title);
    if (coercedDate && parsed.record.date === coercedDate) score += 20;
    if (score > bestScore) {
      best = parsed;
      bestScore = score;
    }
  }

  const activeEpisodes = collectActiveEpisodes(parsedRecords);
  const previewType = inferRecordType(fields.record_type, titleHint, input.notes);
  const normalizedIncoming = normalizeMedicalFields(
    { ...fields, date: coercedDate },
    { notes: input.notes, today, activeEpisodes }
  );

  if (!best || bestScore < 55) {
    const out = {
      ...input,
      ...(coercedDate ? { date: coercedDate } : {}),
      fields: normalizedIncoming
    };
    return out;
  }

  const matchedIsSymptom = best.record.record_type === 'Symptom'
    || best.record.lane === 'symptom';
  const matchedHasEpisode = Boolean(best.record.episode?.id);
  const incomingIsSymptom = previewType === 'Symptom'
    || normalizedIncoming.record_type === 'Symptom';
  const differentDay = Boolean(
    coercedDate
    && isCalendarDate(best.record.date)
    && isCalendarDate(coercedDate)
    && best.record.date !== coercedDate
  );

  // MO-05: Symptom/episode + different date → new dated record in same episode.
  if (differentDay && (matchedIsSymptom || matchedHasEpisode || incomingIsSymptom)) {
    const episode = normalizeEpisode(normalizedIncoming.episode)
      || normalizeEpisode(best.record.episode)
      || joinOrCreateEpisode(
        { ...normalizedIncoming, date: coercedDate },
        { notes: input.notes, today, activeEpisodes }
      );
    return {
      type: 'medical',
      date: coercedDate,
      time: input.time,
      notes: input.notes,
      fields: {
        ...normalizedIncoming,
        ...(episode ? { episode } : {})
      }
    };
  }

  const explicitFollowUp = coerceCalendarDate(fields.follow_up_date, { today });
  if (
    coercedDate
    && isCalendarDate(best.record.date)
    && isCalendarDate(coercedDate)
    && !explicitFollowUp
  ) {
    const delta = daysBetween(best.record.date, coercedDate);
    // Visit slop only for non-Symptom, non-episode visits.
    if (Math.abs(delta) > APPEND_DATE_SLOP_DAYS) {
      return {
        ...input,
        date: coercedDate,
        fields: normalizedIncoming
      };
    }
    if (
      Math.abs(delta) > 0
      && (matchedIsSymptom || matchedHasEpisode || incomingIsSymptom)
    ) {
      // Same-day-only merge for symptoms/episodes (already handled above when differentDay).
      return {
        type: 'medical',
        date: coercedDate,
        time: input.time,
        notes: input.notes,
        fields: {
          ...normalizedIncoming,
          episode: normalizedIncoming.episode || best.record.episode || undefined
        }
      };
    }
  }

  const mergeFields = explicitFollowUp
    ? { ...fields, follow_up_date: explicitFollowUp }
    : fields;

  const merged = mergeMedicalFields(best.record, mergeFields, {
    notes: input.notes,
    existingNotes: best.body,
    today
  });

  return {
    type: 'medical',
    date: best.record.date,
    time: best.record.time ?? input.time,
    notes: merged.notes,
    fields: merged.fields
  };
}

function collectActiveEpisodes(parsedRecords) {
  const byId = new Map();
  for (const parsed of parsedRecords) {
    const ep = parsed?.record?.episode;
    if (!ep?.id || !ep?.title) continue;
    const status = ep.status || 'active';
    if (status === 'resolved') continue;
    const existing = byId.get(ep.id);
    const started = ep.started || parsed.record.date;
    if (!existing || String(started) > String(existing.started || '')) {
      byId.set(ep.id, {
        id: ep.id,
        title: ep.title,
        status: 'active',
        started,
        firstDate: started,
        resolved: ep.resolved
      });
    }
  }
  return [...byId.values()];
}
