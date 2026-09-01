import { sydneyLocalStamp } from '../../apps/life/js/core/time.js';

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

const LINE_RE = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:\s*\(([a-z])\))?\s*:\s*(.+)$/i;

export function parseBodyLogLine(line) {
  const trimmed = String(line || '').trim();
  const match = LINE_RE.exec(trimmed);
  if (!match) return [];
  const month = MONTHS[match[2].toLowerCase()];
  if (!month) return [];
  const dateKey = `${match[3]}-${String(month).padStart(2, '0')}-${String(Number(match[1])).padStart(2, '0')}`;
  const suffix = match[4] ? match[4].toLowerCase() : '';
  const rest = match[5];
  const notes = rest.includes('(') ? rest.slice(rest.indexOf('(')).replace(/^\(|\)$/g, '').trim() : '';

  const weightMatch = /weight\s+([\d.]+)\s*kg/i.exec(rest);
  const fatMatch = /body\s*fat\s+([\d.]+)\s*%/i.exec(rest);
  const weight = weightMatch ? Number(weightMatch[1]) : null;
  const bodyFat = fatMatch ? Number(fatMatch[1]) : null;
  if (weight == null && bodyFat == null) return [];

  const bodyTime = '12:00';
  const bodyStamp = sydneyLocalStamp(dateKey, bodyTime);
  const idSuffix = suffix ? `-${suffix}` : '';

  if (weight != null && bodyFat != null) {
    return [{
      slug: suffix ? `composition-${suffix}` : 'composition',
      notes,
      record: {
        schema_version: 1,
        id: `notion-composition-${dateKey}${idSuffix}`,
        type: 'composition',
        date: dateKey,
        time: bodyTime,
        created_at: bodyStamp,
        updated_at: bodyStamp,
        source: 'notion_import',
        weight_kg: weight,
        body_fat_pct: bodyFat
      }
    }];
  }
  if (weight != null) {
    return [{
      slug: suffix ? `weight-${suffix}` : 'weight',
      notes,
      record: {
        schema_version: 1,
        id: `notion-weight-${dateKey}${idSuffix}`,
        type: 'weight',
        date: dateKey,
        time: bodyTime,
        created_at: bodyStamp,
        updated_at: bodyStamp,
        source: 'notion_import',
        weight_kg: weight
      }
    }];
  }
  return [{
    slug: suffix ? `composition-${suffix}` : 'composition',
    notes,
    record: {
      schema_version: 1,
      id: `notion-composition-${dateKey}${idSuffix}`,
      type: 'composition',
      date: dateKey,
      time: bodyTime,
      created_at: bodyStamp,
      updated_at: bodyStamp,
      source: 'notion_import',
      body_fat_pct: bodyFat
    }
  }];
}

export function parseBodyLogMarkdown(text) {
  const events = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    if (/^##\s+(Tape measurements|AEKE)/i.test(line.trim())) break;
    events.push(...parseBodyLogLine(line));
  }
  return events;
}
