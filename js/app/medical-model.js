import { formatDisplayDate } from '../core/time.js';

export const MEDICAL_DENSITIES = ['weeks', 'months', 'years'];
export const DEFAULT_MEDICAL_DENSITY = 'months';

export function mapsUrl(visit) {
  if (!visit || visit.location_kind !== 'place' || !visit.location) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(visit.location)}`;
}

export function buildMedicalSlug(title, time) {
  const stem = String(title ?? '')
    .normalize('NFKD')
    .replace(/['’]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'visit';
  const hhmm = typeof time === 'string' ? time.replace(':', '') : '0000';
  return `medical-${stem}-${hhmm}`;
}

export function buildMedicalPayload(fields, { notes } = {}) {
  const date = fields.date;
  const time = fields.time || undefined;
  return {
    candidate: {
      type: 'medical',
      date,
      time,
      notes: notes ?? fields.notes ?? '',
      fields: {
        title: fields.title,
        record_type: fields.record_type,
        lane: fields.lane,
        date_end: fields.date_end ?? null,
        provider: fields.provider ?? null,
        location: fields.location ?? null,
        location_kind: fields.location_kind ?? (fields.location ? 'place' : 'unknown'),
        follow_up_date: fields.follow_up_date ?? null,
        cost_aud: fields.cost_aud ?? null,
        insurance_status: fields.insurance_status ?? null,
        episode: fields.episode ?? null
      }
    },
    slug: buildMedicalSlug(fields.title, time),
    overwrite: true
  };
}

export function buildMedicalModel({
  events = [],
  query = '',
  recordType = '',
  provider = '',
  density = DEFAULT_MEDICAL_DENSITY,
  selectedId = null,
  today
} = {}) {
  if (!today) throw new RangeError('Medical display date is unavailable');
  const selectedDensity = MEDICAL_DENSITIES.includes(density) ? density : DEFAULT_MEDICAL_DENSITY;
  const bloodsByDate = new Map();
  const records = [];

  for (const event of events) {
    const record = event?.record;
    if (record?.type === 'bloods') bloodsByDate.set(record.date, record);
    if (record?.type === 'medical') records.push({ record, event });
  }

  const medical = records.map(({ record, event }) => decorateVisit(record, event, bloodsByDate.get(record.date)));

  const filtered = medical.filter(visit => matches(visit, query, recordType, provider));
  const future = filtered
    .filter(visit => visit.date > today)
    .sort(compareSoonest);
  const past = filtered
    .filter(visit => visit.date <= today)
    .sort(compareNewest);

  const items = [
    ...toItems(future),
    { kind: 'today', date: today },
    ...toItems(past)
  ];

  const selected = filtered.find(visit => visit.id === selectedId) ?? null;
  const recordTypes = unique(medical.map(visit => visit.record_type).filter(Boolean));
  const providers = unique(medical.map(visit => visit.provider).filter(Boolean));

  return {
    today,
    density: selectedDensity,
    query,
    recordType,
    provider,
    selected,
    items,
    recordTypes,
    providers,
    count: filtered.length
  };
}

function decorateVisit(record, event, bloods) {
  const visit = {
    id: record.id,
    date: record.date,
    dateEnd: record.date_end ?? null,
    time: record.time ?? null,
    title: record.title,
    record_type: record.record_type,
    lane: record.lane || 'appointment',
    provider: record.provider ?? null,
    location: record.location ?? null,
    location_kind: record.location_kind ?? (record.location ? 'place' : 'unknown'),
    notes: record.notes || event?.body || '',
    follow_up_date: record.follow_up_date ?? null,
    cost_aud: record.cost_aud ?? null,
    insurance_status: record.insurance_status ?? null,
    episode: record.episode ?? null,
    displayDate: formatDisplayDate(record.date),
    lab: labSummary(bloods),
    mapsUrl: null
  };
  visit.mapsUrl = mapsUrl(visit);
  return visit;
}

function labSummary(bloods) {
  if (!bloods || !Array.isArray(bloods.markers) || !bloods.markers.length) return null;
  const flagged = bloods.markers.filter(marker => marker.status === 'High' || marker.status === 'Low');
  const withStatus = bloods.markers.filter(marker => marker.status);
  return {
    date: bloods.date,
    inRange: bloods.markers.filter(marker => marker.status === 'Normal').length,
    total: withStatus.length || bloods.markers.length,
    flags: flagged.map(marker => ({
      key: marker.key,
      label: marker.label || marker.key,
      status: marker.status,
      value: marker.value
    }))
  };
}

function matches(visit, query, recordType, provider) {
  if (recordType && visit.record_type !== recordType) return false;
  if (provider && visit.provider !== provider) return false;
  const terms = String(query ?? '').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = [visit.title, visit.notes, visit.provider, visit.location, visit.record_type]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();
  return terms.every(term => hay.includes(term));
}

function compareSoonest(a, b) {
  return a.date.localeCompare(b.date) || String(a.time ?? '').localeCompare(String(b.time ?? '')) || a.title.localeCompare(b.title);
}

function compareNewest(a, b) {
  return b.date.localeCompare(a.date) || String(b.time ?? '').localeCompare(String(a.time ?? '')) || a.title.localeCompare(b.title);
}

function toItems(visits) {
  const items = [];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    if (run.length >= 2 && run[0].episode?.id && run.every(visit => visit.episode?.id === run[0].episode.id)) {
      items.push({ kind: 'band', episode: run[0].episode, visits: run });
    } else {
      for (const visit of run) items.push({ kind: 'visit', visit });
    }
    run = [];
  };

  for (const visit of visits) {
    const id = visit.episode?.id;
    if (!id) {
      flush();
      items.push({ kind: 'visit', visit });
      continue;
    }
    if (run.length && run[0].episode?.id !== id) flush();
    run.push(visit);
  }
  flush();
  return items;
}

function unique(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}
