import { sydneyLocalStamp } from '../../js/core/time.js';

const RECORD_TYPES = new Set([
  'Appointment',
  'Consultation',
  'Lab Work',
  'Test Result',
  'Imaging',
  'Surgery/Hospital',
  'Prescription',
  'Referral',
  'Vaccination'
]);

export function parseMedicalCsv(text) {
  const rows = parseCsv(text);
  const events = [];
  const seen = new Set();
  const slugsByDate = new Map();

  for (const row of rows) {
    const title = cleanTitle(row['Record Name'] ?? row.Name ?? '');
    const recordTypeRaw = String(row['Record Type'] ?? row.record_type ?? '').trim();
    if (/^follow up\s*-/i.test(title) && !recordTypeRaw) continue;

    const dateCell = String(row.Date ?? row.date ?? '').trim();
    const { date, dateEnd, time } = parseVisitDate(dateCell);
    if (!date) continue;

    const provider = String(row['Doctor/Provider'] ?? row.Provider ?? '').trim() || null;
    const dedupeKey = `${date}|${normalise(title)}|${normalise(provider ?? '')}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    let recordType = recordTypeRaw;
    if (!RECORD_TYPES.has(recordType)) {
      if (recordType) console.warn(`Unknown medical record type: ${recordType}`);
      recordType = 'Appointment';
    }

    const location = String(row.Location ?? '').trim() || null;
    const locationKind = locationKindFor(title, location);
    const notes = joinNotes([
      row.Notes,
      row['Meeting Name'],
      row['Notes and Follow Up']
    ]);
    const followUp = parseVisitDate(String(row['Follow-up Date'] ?? '')).date;
    const stamp = sydneyLocalStamp(date, time ?? '12:00');
    const slug = uniqueSlug(date, title, slugsByDate);

    events.push({
      slug,
      notes,
      record: {
        schema_version: 1,
        id: `notion-medical-${date}-${slug.replace(/^medical-/, '')}`,
        type: 'medical',
        date,
        date_end: dateEnd,
        time: time ?? null,
        created_at: stamp,
        updated_at: stamp,
        source: 'notion_import',
        title,
        record_type: recordType,
        lane: laneFor(recordType, title, provider, location),
        provider,
        location,
        location_kind: locationKind,
        notes: notes || null,
        follow_up_date: followUp,
        cost_aud: parseCost(row.Cost),
        insurance_status: String(row['Insurance Claim Status'] ?? '').trim() || null,
        episode: null
      }
    });
  }

  return events;
}

function cleanTitle(raw) {
  return String(raw).replace(/\s*\(https?:\/\/[^)]+\)\s*$/i, '').trim();
}

function joinNotes(parts) {
  const seen = new Set();
  const out = [];
  for (const part of parts) {
    const text = String(part ?? '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out.join('\n\n');
}

function parseCost(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/A\$/gi, '').replace(/[$,]/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function locationKindFor(title, location) {
  const blob = `${title} ${location ?? ''}`;
  if (/telehealth|\bzoom\b|\bvideo\b|\bphone\b/i.test(blob)) return 'telehealth';
  if (!location) return 'unknown';
  return 'place';
}

function laneFor(recordType, title, provider, location) {
  const blob = `${title} ${provider ?? ''} ${location ?? ''}`;
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

function uniqueSlug(date, title, slugsByDate) {
  const base = `medical-${slugify(title) || 'visit'}`;
  const used = slugsByDate.get(date) ?? new Set();
  let slug = base;
  let n = 2;
  while (used.has(slug)) {
    slug = `${base}-${n}`;
    n += 1;
  }
  used.add(slug);
  slugsByDate.set(date, used);
  return slug;
}

function slugify(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/['’]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function normalise(value) {
  return String(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function parseVisitDate(value) {
  if (!value) return { date: null, dateEnd: null, time: null };
  const trimmed = String(value).trim();
  const range = trimmed.split(/\s*(?:→|->|–|—)\s*/);
  const time = parseTime(trimmed);
  if (range.length === 2 && range[0] && range[1]) {
    return {
      date: parseDateKey(range[0]),
      dateEnd: parseDateKey(range[1]),
      time
    };
  }
  return { date: parseDateKey(trimmed), dateEnd: null, time };
}

function parseTime(value) {
  const match = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(value);
  if (!match) return null;
  return `${String(match[1]).padStart(2, '0')}:${match[2]}`;
}

function parseDateKey(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (dmy) {
    return `${dmy[3]}-${String(Number(dmy[2])).padStart(2, '0')}-${String(Number(dmy[1])).padStart(2, '0')}`;
  }
  const months = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
  };
  const dayFirst = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(trimmed);
  if (dayFirst) {
    const month = months[dayFirst[2].toLowerCase()];
    if (!month) return null;
    return `${dayFirst[3]}-${String(month).padStart(2, '0')}-${String(Number(dayFirst[1])).padStart(2, '0')}`;
  }
  const monthFirst = /([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/.exec(trimmed);
  if (!monthFirst) return null;
  const month = months[monthFirst[1].toLowerCase()];
  if (!month) return null;
  return `${monthFirst[3]}-${String(month).padStart(2, '0')}-${String(Number(monthFirst[2])).padStart(2, '0')}`;
}

function parseCsv(text) {
  const lines = String(text).replace(/^\ufeff/, '').split(/\r?\n/).filter(line => line.length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((header, index) => { row[header] = cells[index] ?? ''; });
    return row;
  });
}

function splitCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else current += ch;
  }
  cells.push(current);
  return cells;
}
