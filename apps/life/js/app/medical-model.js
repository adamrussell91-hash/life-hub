import { formatDisplayDate, daysBetween, isCalendarDate } from '../core/time.js';
import { inferWeight, normalizeMedicalFields } from './medical-normalize.js';

export const MEDICAL_DENSITIES = ['weeks', 'months', 'years'];
export const DEFAULT_MEDICAL_DENSITY = 'months';

export const MEDICAL_THREAD_COLOURS = {
  IBD: '#2563eb',
  Liver: '#b45309',
  Mind: '#7c3aed',
  Acute: '#94a3b8'
};

const THREAD_RULES = [
  {
    thread: 'IBD',
    test: (visit, bloods) =>
      /gastro|stelara|ustekinumab|calprotectin|crohn|ibd|biologic/i.test(visitBlob(visit))
      || hasMarker(bloods, /calprotectin/i)
  },
  {
    thread: 'Liver',
    test: (visit, bloods) =>
      /\bggt\b|\balt\b|mrcp|liver|psc|bile/i.test(visitBlob(visit))
      || hasMarker(bloods, /\bggt\b|\balt\b/i)
  },
  {
    thread: 'Mind',
    test: visit =>
      visit.lane === 'therapy'
      || /therap|psycholog|adhd|kate semple|vera|mind/i.test(visitBlob(visit))
  },
  {
    thread: 'Acute',
    test: visit => visit.record_type === 'Symptom' || visit.lane === 'symptom'
  }
];

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
  const normalized = normalizeMedicalFields(fields, { notes });
  return {
    candidate: {
      type: 'medical',
      date,
      time,
      notes: notes ?? fields.notes ?? '',
      fields: normalized
    },
    slug: buildMedicalSlug(normalized.title, time),
    overwrite: true
  };
}

export function isPlannedVisit(visit, today) {
  if (!visit) return false;
  if (visit.status === 'planned' || visit.status === 'to_book') return true;
  if (visit.virtual) return true;
  return Boolean(today && visit.date && visit.date > today);
}

export function buildMedicalModel({
  events = [],
  query = '',
  recordType = '',
  provider = '',
  density = DEFAULT_MEDICAL_DENSITY,
  selectedId = null,
  expandedYears = [],
  today,
  showMinor = false
} = {}) {
  if (!today) throw new RangeError('Medical display date is unavailable');
  const selectedDensity = MEDICAL_DENSITIES.includes(density) ? density : DEFAULT_MEDICAL_DENSITY;
  const bloodsByDate = new Map();
  const bloodsList = [];
  const records = [];

  for (const event of events) {
    const record = event?.record;
    if (record?.type === 'bloods') {
      bloodsByDate.set(record.date, record);
      bloodsList.push(record);
    }
    if (record?.type === 'medical') records.push({ record, event });
  }

  let medical = records.map(({ record, event }) =>
    decorateVisit(record, event, bloodsByDate.get(record.date), today)
  );
  medical = medical.concat(deriveVirtualDoses(medical, today));

  const activeEpisode = newestActiveEpisode(medical, today);
  const filtered = medical.filter(visit => {
    if (!matches(visit, query, recordType, provider)) return false;
    if (visit.weight === 'minor' && !showMinor) {
      const inActive = activeEpisode
        && visit.episode?.id
        && visit.episode.id === activeEpisode.id;
      if (!inActive) return false;
    }
    return true;
  });

  const future = filtered
    .filter(visit => isPlannedVisit(visit, today) || visit.date > today)
    .sort(compareUpcoming);
  const past = filtered
    .filter(visit => !isPlannedVisit(visit, today) && visit.date <= today)
    .sort(compareNewest);

  const selected = filtered.find(visit => visit.id === selectedId) ?? null;
  const openYears = new Set(expandedYears ?? []);
  if (selected?.date) openYears.add(selected.date.slice(0, 4));

  const items = [
    ...(future.length ? [{ kind: 'upcoming' }] : []),
    ...pack(future, selectedDensity, openYears),
    { kind: 'today', date: today },
    ...pack(past, selectedDensity, openYears)
  ];

  const recordTypes = unique(medical.map(visit => visit.record_type).filter(Boolean));
  const providers = unique(medical.map(visit => visit.provider).filter(Boolean));
  const nextItems = buildNextItems(medical, today);
  const brief = buildHealthBrief(medical, bloodsList, today);
  const threads = buildThreadModel(medical, bloodsList, today);

  return {
    today,
    density: selectedDensity,
    query,
    recordType,
    provider,
    selected,
    items,
    visits: filtered,
    allVisits: medical,
    recordTypes,
    providers,
    count: filtered.length,
    showMinor,
    activeEpisode,
    nextItems,
    brief,
    threads
  };
}

/** Thread lanes for the Health Threads strip (MO-17). */
export function buildThreadModel(visits = [], bloods = [], today) {
  if (!today) throw new RangeError('Medical display date is unavailable');
  const bloodsByDate = new Map(bloods.map(b => [b.date, b]));
  const lanes = THREAD_RULES.map(rule => {
    const events = [];
    for (const visit of visits) {
      if (!rule.test(visit, bloodsByDate.get(visit.date))) continue;
      events.push({
        id: visit.id,
        date: visit.date,
        title: visit.title,
        planned: isPlannedVisit(visit, today),
        virtual: Boolean(visit.virtual),
        kind: visit.record_type === 'Consultation' || /specialist|gastro|hepat/i.test(visit.title || '')
          ? 'specialist'
          : visit.record_type === 'Symptom'
            ? 'symptom'
            : 'event',
        episode: visit.episode,
        visit
      });
    }
    const markers = collectThreadMarkers(rule.thread, bloods);
    return {
      id: rule.thread,
      label: rule.thread,
      colour: MEDICAL_THREAD_COLOURS[rule.thread],
      events,
      markers
    };
  }).filter(lane => lane.events.length || lane.markers.length);

  return { today, lanes };
}

function collectThreadMarkers(thread, bloods) {
  const keys = thread === 'IBD'
    ? [/calprotectin/i]
    : thread === 'Liver'
      ? [/\bggt\b/i, /\balt\b/i]
      : [];
  if (!keys.length) return [];
  const points = [];
  for (const panel of bloods) {
    for (const marker of panel.markers || []) {
      const label = `${marker.key || ''} ${marker.label || ''}`;
      if (!keys.some(re => re.test(label))) continue;
      points.push({
        date: panel.date,
        key: marker.key,
        label: marker.label || marker.key,
        value: marker.value,
        status: marker.status,
        ref_low: marker.ref_low,
        ref_high: marker.ref_high
      });
    }
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

function decorateVisit(record, event, bloods, today) {
  const weight = record.weight && ['major', 'routine', 'minor'].includes(record.weight)
    ? record.weight
    : inferWeight({ ...record, lab: bloods, notes: record.notes || event?.body });
  const visit = {
    id: record.id,
    date: record.date,
    dateEnd: record.date_end ?? null,
    time: record.time ?? null,
    title: record.title,
    record_type: record.record_type,
    lane: record.lane || 'appointment',
    weight,
    status: record.status ?? null,
    date_precision: record.date_precision ?? null,
    cadence_days: record.cadence_days ?? null,
    task_id: record.task_id ?? null,
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
    bloods,
    mapsUrl: null,
    virtual: false,
    planned: false
  };
  visit.planned = isPlannedVisit(visit, today);
  visit.mapsUrl = mapsUrl(visit);
  return visit;
}

/**
 * Cadence-derived virtual next dose (MO-07). Never written to storage.
 * Last Stelara 27/08 cadence 56 → ~22/10. Real record within ±7 days suppresses it.
 */
export function deriveVirtualDoses(visits, today) {
  const virtuals = [];
  const byMed = new Map();
  for (const visit of visits) {
    if (!visit.cadence_days || visit.cadence_days <= 0) continue;
    if (visit.planned || (today && visit.date > today)) continue;
    const key = medicationKey(visit);
    const existing = byMed.get(key);
    if (!existing || visit.date > existing.date) byMed.set(key, visit);
  }
  for (const [, last] of byMed) {
    const nextDate = addDays(last.date, last.cadence_days);
    if (!nextDate) continue;
    const suppressed = visits.some(visit => {
      if (medicationKey(visit) !== medicationKey(last)) return false;
      if (!isCalendarDate(visit.date) || !isCalendarDate(nextDate)) return false;
      return Math.abs(daysBetween(visit.date, nextDate)) <= 7;
    });
    if (suppressed) continue;
    virtuals.push({
      ...last,
      id: `virtual-${last.id}-${nextDate}`,
      date: nextDate,
      displayDate: formatDisplayDate(nextDate),
      status: 'planned',
      date_precision: 'day',
      planned: true,
      virtual: true,
      title: last.title,
      notes: `~${formatDisplayDate(nextDate)} · auto from cadence ${last.cadence_days}d`,
      lab: null,
      bloods: null,
      task_id: null
    });
  }
  return virtuals;
}

function medicationKey(visit) {
  const blob = `${visit.title || ''} ${visit.notes || ''}`.toLowerCase();
  if (/stelara|ustekinumab/.test(blob)) return 'stelara';
  if (/humira|adalimumab/.test(blob)) return 'humira';
  return (visit.title || visit.id || 'med').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function addDays(dateKey, days) {
  if (!isCalendarDate(dateKey) || !Number.isFinite(days)) return null;
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  const key = `${yy}-${mm}-${dd}`;
  return isCalendarDate(key) ? key : null;
}

function newestActiveEpisode(visits, today) {
  const byId = new Map();
  for (const visit of visits) {
    const ep = visit.episode;
    if (!ep?.id) continue;
    const status = ep.status || 'active';
    const lastDate = visit.date;
    const existing = byId.get(ep.id);
    if (!existing) {
      byId.set(ep.id, {
        id: ep.id,
        title: ep.title,
        status,
        started: ep.started || lastDate,
        resolved: ep.resolved || null,
        lastDate,
        entries: [visit]
      });
    } else {
      existing.entries.push(visit);
      if (lastDate > existing.lastDate) existing.lastDate = lastDate;
      if (ep.started && (!existing.started || ep.started < existing.started)) {
        existing.started = ep.started;
      }
      if (status === 'resolved') {
        existing.status = 'resolved';
        existing.resolved = ep.resolved || lastDate;
      }
    }
  }

  let best = null;
  for (const ep of byId.values()) {
    // Auto-resolve after 7 days with no new entry (soft: resolved?).
    if (ep.status === 'active' && today && ep.lastDate && isCalendarDate(ep.lastDate)) {
      if (daysBetween(ep.lastDate, today) > 7) {
        ep.status = 'resolved?';
        ep.resolved = addDays(ep.lastDate, 7);
      }
    }
    if (ep.status !== 'active') continue;
    if (!best || ep.lastDate > best.lastDate) best = ep;
  }
  if (best) {
    best.dayNumber = best.started && today && isCalendarDate(best.started)
      ? Math.max(1, daysBetween(best.started, today) + 1)
      : 1;
    best.entries.sort(compareNewest);
  }
  return best;
}

function buildNextItems(visits, today) {
  const planned = visits.filter(visit => isPlannedVisit(visit, today));
  const actions = planned.filter(visit =>
    visit.status === 'to_book' || visit.date_precision === 'tbd'
  );
  const dated = planned.filter(visit => !actions.includes(visit));
  const sortDated = (a, b) => {
    const pa = precisionRank(a);
    const pb = precisionRank(b);
    if (pa !== pb) return pa - pb;
    return compareSoonest(a, b);
  };
  return [...actions.sort(compareSoonest), ...dated.sort(sortDated)].slice(0, 8);
}

function precisionRank(visit) {
  if (visit.status === 'to_book' || visit.date_precision === 'tbd') return 0;
  if (visit.date_precision === 'month') return 2;
  return 1;
}

function buildHealthBrief(visits, bloods, today) {
  const stelara = visits
    .filter(visit => /stelara|ustekinumab/i.test(`${visit.title} ${visit.notes}`))
    .filter(visit => !visit.virtual && visit.date <= today)
    .sort(compareNewest)[0];
  let cycle = null;
  if (stelara?.cadence_days) {
    const elapsed = daysBetween(stelara.date, today);
    const week = Math.min(8, Math.max(1, Math.floor(elapsed / 7) + 1));
    cycle = {
      label: 'Stelara',
      week,
      of: Math.round(stelara.cadence_days / 7) || 8,
      lastDate: stelara.date,
      cadence_days: stelara.cadence_days
    };
  }

  const watch = [];
  const latestBloods = [...bloods].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (latestBloods?.markers) {
    for (const marker of latestBloods.markers) {
      if (marker.status !== 'High' && marker.status !== 'Low') continue;
      watch.push({
        key: marker.key,
        label: marker.label || marker.key,
        value: marker.value,
        status: marker.status,
        arrow: marker.status === 'High' ? '↑' : '↓',
        ref_low: marker.ref_low,
        ref_high: marker.ref_high,
        date: latestBloods.date
      });
      if (watch.length >= 2) break;
    }
  }

  const verdictVisit = visits
    .filter(visit => visit.notes && visit.date <= today)
    .sort(compareNewest)[0];
  const verdict = extractVerdict(verdictVisit?.notes) || null;

  return { cycle, watch, verdict };
}

function extractVerdict(notes) {
  const text = String(notes || '').trim();
  if (!text) return null;
  const dash = text.match(/—\s*(.+)$/m) || text.match(/-\s*(.+)$/m);
  if (dash) return dash[1].trim().slice(0, 160);
  return text.split(/\n/)[0].trim().slice(0, 160);
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
    })),
    markers: bloods.markers
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
  return a.date.localeCompare(b.date)
    || String(a.time ?? '').localeCompare(String(b.time ?? ''))
    || a.title.localeCompare(b.title);
}

/** Upcoming river: soonest nearest to TODAY → descending date toward Today. */
function compareUpcoming(a, b) {
  return b.date.localeCompare(a.date)
    || String(b.time ?? '').localeCompare(String(a.time ?? ''))
    || a.title.localeCompare(b.title);
}

function compareNewest(a, b) {
  return b.date.localeCompare(a.date)
    || String(b.time ?? '').localeCompare(String(a.time ?? ''))
    || a.title.localeCompare(b.title);
}

function pack(visits, density, expandedYears) {
  if (density === 'years') return collapseYears(visits, expandedYears);
  return withHeadings(toItems(visits), density);
}

function collapseYears(visits, expandedYears) {
  const groups = [];
  for (const visit of visits) {
    const year = String(visit.date).slice(0, 4);
    const last = groups.at(-1);
    if (!last || last.year !== year) {
      groups.push({ kind: 'year', year, visits: [visit], expanded: expandedYears.has(year) });
    } else {
      last.visits.push(visit);
    }
  }
  return groups.map(group => ({
    ...group,
    count: group.visits.length,
    caption: group.visits.length === 1 ? '1 visit' : `${group.visits.length} visits`,
    items: group.expanded ? withHeadings(toItems(group.visits), 'months') : []
  }));
}

function withHeadings(items, density) {
  const out = [];
  let last = '';
  for (const item of items) {
    const date = item.kind === 'visit'
      ? item.visit.date
      : item.kind === 'band'
        ? item.visits[0]?.date
        : null;
    if (date) {
      const label = headingFor(date, density);
      if (label && label !== last) {
        out.push({ kind: 'heading', label, date });
        last = label;
      }
    }
    out.push(item);
  }
  return out;
}

function headingFor(date, density) {
  const [year, month] = String(date).split('-');
  if (!year) return '';
  if (density === 'weeks') return formatDisplayDate(date);
  const monthIndex = Number(month) - 1;
  const name = MONTHS[monthIndex];
  return name ? `${name} ${year}` : year;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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

function visitBlob(visit) {
  return `${visit.title || ''} ${visit.notes || ''} ${visit.provider || ''} ${visit.lane || ''} ${visit.record_type || ''}`;
}

function hasMarker(bloods, re) {
  if (!bloods?.markers) return false;
  return bloods.markers.some(marker => re.test(`${marker.key || ''} ${marker.label || ''}`));
}
