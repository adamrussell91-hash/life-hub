import { sydneyLocalStamp } from '../../js/core/time.js';
import { canonicalMarkerKey } from './bloods-marker-map.mjs';

const BODY_TIME = '12:00';

const LABELS = {
  adjusted_calcium: 'Adjusted calcium',
  alp: 'ALP',
  bilirubin_total: 'Bilirubin',
  crp: 'CRP',
  fasting_glucose: 'Fasting glucose',
  ggt: 'GGT',
  haematocrit: 'Haematocrit',
  hdl: 'HDL',
  ldl: 'LDL',
  rbc: 'RBC',
  triglycerides: 'Triglycerides',
  vitamin_d: 'Vitamin D',
  wcc: 'WCC',
  hba1c_ngsp: 'HbA1c (NGSP)',
  hba1c_ifcc: 'HbA1c (IFCC)'
};

export function parseBloodsCsv(text) {
  const rows = parseCsv(text);
  const byDate = new Map();

  for (const row of rows) {
    const dateKey = parseDateKey(row['Test Date'] ?? row.test_date ?? row.Date ?? row.date);
    const rawName = String(row.Marker ?? row.marker ?? '').trim();
    if (!dateKey || !rawName) continue;

    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, { markers: new Map(), notes: [] });
    }
    const day = byDate.get(dateKey);
    const note = String(row.Notes ?? row.notes ?? '').trim();
    if (note && !day.notes.includes(note)) day.notes.push(note);

    const key = canonicalMarkerKey(rawName);
    const statusRaw = String(row.Status ?? row.status ?? '').trim();
    const marker = {
      key,
      label: LABELS[key] ?? rawName,
      category: String(row.Category ?? row.category ?? '').trim() || 'Other',
      value: num(row.Value ?? row.value),
      unit: String(row.Unit ?? row.unit ?? '').trim() || null,
      ref_low: num(row['Ref Low'] ?? row.ref_low),
      ref_high: num(row['Ref High'] ?? row.ref_high),
      status: statusRaw || null
    };
    // One canonical key per visit: a duplicated row would otherwise create two
    // same-date points and make the marker's latest value ambiguous.
    const seen = day.markers.get(key);
    if (!seen || (seen.value == null && marker.value != null)) day.markers.set(key, marker);
  }

  const events = [];
  for (const [dateKey, day] of [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (!day.markers.size) continue;
    const stamp = sydneyLocalStamp(dateKey, BODY_TIME);
    events.push({
      slug: 'bloods',
      notes: day.notes.join('\n\n'),
      record: {
        schema_version: 1,
        id: `notion-bloods-${dateKey}`,
        type: 'bloods',
        date: dateKey,
        time: BODY_TIME,
        created_at: stamp,
        updated_at: stamp,
        source: 'notion_import',
        markers: [...day.markers.values()]
      }
    });
  }
  return events;
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

function num(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseCsv(text) {
  const lines = text.replace(/^\ufeff/, '').split(/\r?\n/).filter(line => line.length > 0);
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
