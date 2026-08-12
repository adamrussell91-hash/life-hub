import { sydneyLocalStamp } from '../../js/core/time.js';

const BODY_TIME = '12:00';

const CIRCUMFERENCE_REGIONS = {
  waist: 'waist',
  chest: 'chest',
  hips: 'hips',
  neck: 'neck',
  shoulders: 'shoulders'
};

export function parseBodyHistoryCsv(text) {
  const rows = parseCsv(text);
  const byDate = new Map();

  for (const row of rows) {
    const dateKey = parseDateKey(row.date);
    if (!dateKey) continue;
    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, {
        weight: null,
        bodyFat: null,
        muscle: null,
        measurements: {},
        calves: [],
        notes: ''
      });
    }
    applyRow(byDate.get(dateKey), row);
  }

  const events = [];
  for (const [dateKey, day] of [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    events.push(...eventsForDay(dateKey, day));
  }
  return events;
}

function applyRow(day, row) {
  const value = num(row.value);
  if (value == null) return;

  const measurement = String(row.measurement || '').trim();
  const region = String(row.region || '').trim();
  const side = normalizeSide(row.side);
  const note = String(row.quality_note || '').trim();
  if (note && !day.notes.includes(note)) {
    day.notes = day.notes ? `${day.notes}\n${note}` : note;
  }

  if (measurement === 'Body weight') {
    day.weight = value;
    return;
  }
  if (measurement === 'Body fat') {
    day.bodyFat = value;
    return;
  }
  if (measurement === 'Skeletal muscle mass') {
    day.muscle = value;
    return;
  }

  if (measurement === 'Circumference') {
    const field = CIRCUMFERENCE_REGIONS[region.toLowerCase()];
    if (field) day.measurements[field] = value;
    return;
  }

  if (measurement === 'Arm Flexed') {
    setSideMeasurement(day.measurements, side, 'arm_flexed', value);
    return;
  }
  if (measurement === 'Arm Relaxed') {
    setSideMeasurement(day.measurements, side, 'arm_relaxed', value);
    return;
  }
  if (measurement === 'Thigh') {
    setSideMeasurement(day.measurements, side, 'thigh', value);
    return;
  }
  if (measurement === 'Calf') {
    day.calves.push(value);
  }
}

function setSideMeasurement(measurements, side, base, value) {
  if (side === 'right') measurements[`right_${base}`] = value;
  else if (side === 'left') measurements[`left_${base}`] = value;
}

function eventsForDay(dateKey, day) {
  const events = [];
  const bodyStamp = sydneyLocalStamp(dateKey, BODY_TIME);
  const notes = day.notes || '';

  if (day.weight != null && (day.bodyFat != null || day.muscle != null)) {
    events.push({
      slug: 'composition',
      notes,
      record: {
        schema_version: 1,
        id: `notion-composition-${dateKey}`,
        type: 'composition',
        date: dateKey,
        time: BODY_TIME,
        created_at: bodyStamp,
        updated_at: bodyStamp,
        source: 'notion_import',
        weight_kg: day.weight,
        ...(day.bodyFat != null ? { body_fat_pct: day.bodyFat } : {}),
        ...(day.muscle != null ? { skeletal_muscle_kg: day.muscle } : {})
      }
    });
  } else if (day.weight != null) {
    events.push({
      slug: 'weight',
      notes,
      record: {
        schema_version: 1,
        id: `notion-weight-${dateKey}`,
        type: 'weight',
        date: dateKey,
        time: BODY_TIME,
        created_at: bodyStamp,
        updated_at: bodyStamp,
        source: 'notion_import',
        weight_kg: day.weight
      }
    });
  } else if (day.bodyFat != null || day.muscle != null) {
    events.push({
      slug: 'composition',
      notes,
      record: {
        schema_version: 1,
        id: `notion-composition-${dateKey}`,
        type: 'composition',
        date: dateKey,
        time: BODY_TIME,
        created_at: bodyStamp,
        updated_at: bodyStamp,
        source: 'notion_import',
        ...(day.bodyFat != null ? { body_fat_pct: day.bodyFat } : {}),
        ...(day.muscle != null ? { skeletal_muscle_kg: day.muscle } : {})
      }
    });
  }

  const measurements = { ...day.measurements };
  if (day.calves.length > 0) {
    measurements.calves = day.calves.reduce((sum, value) => sum + value, 0) / day.calves.length;
  }
  if (Object.values(measurements).some(value => value != null)) {
    events.push({
      slug: 'measurements',
      notes,
      record: {
        schema_version: 1,
        id: `notion-measurements-${dateKey}`,
        type: 'measurements',
        date: dateKey,
        time: BODY_TIME,
        created_at: bodyStamp,
        updated_at: bodyStamp,
        source: 'notion_import',
        ...measurements
      }
    });
  }

  return events;
}

function normalizeSide(value) {
  const side = String(value || '').trim().toLowerCase();
  if (side === 'right') return 'right';
  if (side === 'left') return 'left';
  return null;
}

function parseDateKey(value) {
  const trimmed = String(value || '').trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) return trimmed;
  return null;
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
