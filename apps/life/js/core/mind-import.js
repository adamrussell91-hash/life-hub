import { sydneyLocalStamp } from './time.js';

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

const MOODS = new Set(['great', 'good', 'neutral', 'low', 'bad']);
const ENERGIES = new Set(['high', 'medium', 'low']);
const SESSION_TYPES = new Set(['check-in', 'deep-dive', 'pattern-review', 'historical']);
const INSIGHT_LIMIT = 2000;
const DEFAULT_TIME = '12:00';

export function parseCsv(text) {
  const lines = String(text ?? '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? '';
    });
    return row;
  });
}

function splitCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

export function parseNotionDate(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dayFirst = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(text);
  if (dayFirst) {
    const month = MONTHS[dayFirst[2].toLowerCase()];
    if (!month) return null;
    return `${dayFirst[3]}-${String(month).padStart(2, '0')}-${String(Number(dayFirst[1])).padStart(2, '0')}`;
  }
  return null;
}

export function parseNotionTime(raw) {
  const match = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(String(raw ?? ''));
  if (!match) return null;
  return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
}

export function slug(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/['’]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'untitled';
}

export function sessionTypeFromNotion(label) {
  const key = String(label ?? '').trim().toLowerCase().replace(/\s+/g, '-');
  if (SESSION_TYPES.has(key)) return key;
  if (key === 'checkin') return 'check-in';
  if (key === 'deepdive') return 'deep-dive';
  return null;
}

function normalizeMood(value) {
  const key = String(value ?? '').trim().toLowerCase();
  return MOODS.has(key) ? key : null;
}

function normalizeEnergy(value) {
  const key = String(value ?? '').trim().toLowerCase();
  return ENERGIES.has(key) ? key : null;
}

function splitList(value) {
  return String(value ?? '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function recordId(title, date) {
  return `notion-mind-${slug(title)}-${date}`;
}

function baseRecord({ id, type, date, time, extra }) {
  const clock = time || DEFAULT_TIME;
  const stamp = date ? sydneyLocalStamp(date, clock) : null;
  return {
    schema_version: 1,
    id,
    type,
    date,
    time: clock,
    created_at: stamp,
    updated_at: stamp,
    source: 'notion_import',
    source_agent: 'import',
    ...extra
  };
}

function firstHeading(text) {
  const match = /^#\s+(.+)$/m.exec(String(text ?? ''));
  return match ? match[1].trim() : '';
}

function extractProps(text) {
  const props = {};
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const match = /^([A-Za-z][A-Za-z0-9 ()/%&+'’.-]*):\s*(.*)$/.exec(line.trim());
    if (!match) continue;
    props[match[1]] = match[2].trim();
  }
  return props;
}

export function markdownBody(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const kept = [];
  let seenHeading = false;
  for (const line of lines) {
    if (!seenHeading && /^#\s+/.test(line)) {
      seenHeading = true;
      continue;
    }
    if (/^[A-Za-z][A-Za-z0-9 ()/%&+'’.-]*:\s*.+$/.test(line.trim()) && kept.every(item => item.trim() === '')) {
      continue;
    }
    kept.push(line);
  }
  return kept.join('\n').trim();
}

export function recordFromSessionRow(row = {}) {
  const title = String(row['Session Title'] ?? row.Title ?? '').trim();
  const dateRaw = row.Date ?? '';
  const date = parseNotionDate(dateRaw);
  const time = parseNotionTime(dateRaw);
  const primary = String(row['Primary Theme'] ?? '').trim();
  const followUps = splitList(row['Follow-up Themes']);
  const themes = uniqueStrings([primary, ...followUps]);
  const extra = {
    title,
    theme: primary || null,
    themes,
    pattern_tags: splitList(row['Pattern Tags']),
    session_type: sessionTypeFromNotion(row['Session Type']),
    framework: String(row['Framework Used'] ?? '').trim() || null,
    mood_at_open: normalizeMood(row['Mood at Opening']),
    mood_at_close: normalizeMood(row['Mood at Close']),
    insight: String(row['Key Insight'] ?? '').trim() || null,
    observation: String(row["Vera's Observation"] ?? '').trim() || null,
    closing_question: String(row['Closing Question'] ?? '').trim() || null
  };
  return baseRecord({
    id: recordId(title || 'session', date),
    type: 'mind_session',
    date,
    time,
    extra
  });
}

export function recordFromDiaryMarkdown(text) {
  const heading = firstHeading(text);
  const props = extractProps(text);
  const date = parseNotionDate(props.Date || heading);
  const time = parseNotionTime(props.Date) || parseNotionTime(heading);
  const moods = uniqueStrings(splitList(props.Mood).map(normalizeMood).filter(Boolean));
  const scoreRaw = props['Mood Score'];
  const score = scoreRaw == null || scoreRaw === '' ? null : Number(scoreRaw);
  const extra = {
    mood: moods[0] ?? normalizeMood(props.Mood),
    moods,
    mood_score: Number.isFinite(score) ? score : null,
    energy: normalizeEnergy(props.Energy),
    tags: splitList(props.Tags),
    dayone_sent: false
  };
  return baseRecord({
    id: recordId(heading || 'diary', date),
    type: 'diary',
    date,
    time,
    extra
  });
}

export function recordFromHistoricalMarkdown(text) {
  const title = firstHeading(text);
  const props = extractProps(text);
  const date = parseNotionDate(props.Date || headingDate(title));
  const time = parseNotionTime(props.Date);
  const body = markdownBody(text);
  const extra = {
    title,
    session_type: 'historical',
    insight: body.slice(0, INSIGHT_LIMIT) || null
  };
  return baseRecord({
    id: recordId(title || 'historical', date),
    type: 'mind_session',
    date,
    time,
    extra
  });
}

function headingDate(title) {
  const match = /(\d{1,2}\s+[A-Za-z]+\s+\d{4}|\d{4}-\d{2}-\d{2})/.exec(String(title ?? ''));
  return match ? match[1] : '';
}

function hasSessionFields(text) {
  return /Session Type\s*:|Mood at Opening\s*:|Key Insight\s*:|Primary Theme\s*:|Vera's Observation\s*:/i.test(String(text ?? ''));
}

export function classifyMindFile(name, text) {
  const base = String(name ?? '').split(/[/\\]/).pop();
  const sample = String(text ?? '').slice(0, 2000);
  if (/Psychological Baseline|Vera Intake/i.test(base) || /Psychological Baseline|Vera Intake/i.test(sample)) {
    return 'skip';
  }
  if (/\.csv$/i.test(base) && /Session Database/i.test(base)) return 'session-csv';
  if (/Daily Diary/i.test(base)) return 'diary';
  if (/^Type:\s*Note\b/m.test(text) && /Mood Score\s*:/i.test(text)) return 'diary';
  if (/^@/.test(base) && hasSessionFields(text)) return 'session-md';
  if (/^Historical/i.test(base) || /Pattern Review/i.test(base)) return 'historical';
  if (/\.md$/i.test(base) && !/Daily Diary/i.test(base) && !/Session Database/i.test(base)) {
    if (hasSessionFields(text)) return 'session-md';
    if (/^#\s+/m.test(text) && !/Mood Score\s*:/i.test(text)) return 'historical';
  }
  return 'skip';
}

export function recordFromSessionMarkdown(text, name = '') {
  const props = extractProps(text);
  const heading = firstHeading(text);
  const fromName = String(name).split(/[/\\]/).pop().replace(/^@/, '').replace(/\.md$/i, '');
  return recordFromSessionRow({
    'Session Title': props['Session Title'] || heading.replace(/^@/, ''),
    Date: props.Date || heading.replace(/^@/, '') || fromName,
    'Session Type': props['Session Type'],
    'Primary Theme': props['Primary Theme'] || props.Theme,
    'Follow-up Themes': props['Follow-up Themes'],
    'Framework Used': props['Framework Used'] || props.Framework,
    'Mood at Opening': props['Mood at Opening'],
    'Mood at Close': props['Mood at Close'],
    'Key Insight': props['Key Insight'] || props.Insight,
    "Vera's Observation": props["Vera's Observation"] || props.Observation,
    'Closing Question': props['Closing Question'],
    'Pattern Tags': props['Pattern Tags']
  });
}

export function planImport(files, { existingIds = new Set() } = {}) {
  const planned = [];
  const insights = [];
  const seen = new Set(existingIds);

  for (const file of files ?? []) {
    const name = file?.name ?? '';
    const text = file?.text ?? '';
    const kind = classifyMindFile(name, text);
    if (kind === 'skip') continue;

    if (kind === 'session-csv') {
      for (const row of parseCsv(text)) {
        const record = recordFromSessionRow(row);
        if (!record.date || seen.has(record.id)) continue;
        seen.add(record.id);
        planned.push({ record, body: record.insight || '', name, kind });
      }
      continue;
    }

    const record = kind === 'diary'
      ? recordFromDiaryMarkdown(text)
      : kind === 'session-md'
        ? recordFromSessionMarkdown(text, name)
        : recordFromHistoricalMarkdown(text);
    if (!record?.date || seen.has(record.id)) continue;
    seen.add(record.id);
    const body = markdownBody(text);
    planned.push({ record, body, name, kind });

    const base = name.split(/[/\\]/).pop();
    if (kind === 'historical' && text.length > 400 && (/^Historical/i.test(base) || /Pattern Review/i.test(base))) {
      insights.push({
        dateKey: record.date,
        title: record.title,
        body,
        entryType: 'Mind Insight'
      });
    }
  }

  return {
    records: planned.map(item => item.record),
    planned,
    insights
  };
}
