import { createHash } from 'node:crypto';

// Notion PD rows in life-hub-data `data/professional/pd-events.json`,
// projected into the Event list the year strip already reads.
// Hours stay null: accreditation only counts hours Adam logged.

const SYDNEY = 'Australia/Sydney';

export function notionPdEventId(notionId) {
  const digest = createHash('sha256').update(`pd-event:${notionId}`).digest('hex').slice(0, 32);
  const grouped = [
    digest.slice(0, 8),
    digest.slice(8, 12),
    digest.slice(12, 16),
    digest.slice(16, 20),
    digest.slice(20, 32)
  ];
  return `event_${grouped.join('-')}`;
}

export function pdPlacementKey(title, start) {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: SYDNEY,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(start));
  const name = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return `${day}|${name}`;
}

export function projectNotionPdEvent(row) {
  if (!row || typeof row !== 'object') return null;
  if (typeof row.notion_id !== 'string' || !row.notion_id) return null;
  if (typeof row.title !== 'string' || !row.title.trim()) return null;
  if (typeof row.start !== 'string' || typeof row.end !== 'string') return null;
  if (!Number.isFinite(Date.parse(row.start)) || !Number.isFinite(Date.parse(row.end))) return null;
  const occurrence = row.occurrence_state === 'completed' ? 'completed' : 'scheduled';
  const notes = Array.isArray(row.notes) ? row.notes : [];
  const talks = [];
  const knowledge_notes = [];
  for (const note of notes) {
    if (!note || typeof note.page_id !== 'string' || typeof note.title !== 'string' || !note.title.trim()) continue;
    const talk_id = `t_${note.page_id}`;
    const title = note.title.trim().slice(0, 300);
    talks.push({ id: talk_id, time: null, title, presenter: null, hours: null });
    knowledge_notes.push({
      talk_id,
      page_id: note.page_id,
      title,
      href: `/knowledge/#page/${encodeURIComponent(note.page_id)}`
    });
    if (talks.length === 40) break;
  }
  return {
    schema_version: 2,
    id: notionPdEventId(row.notion_id),
    title: row.title.trim(),
    event_type: 'professional_development',
    start: new Date(row.start).toISOString(),
    end: new Date(row.end).toISOString(),
    time_zone: typeof row.time_zone === 'string' && row.time_zone ? row.time_zone : SYDNEY,
    all_day: row.all_day === true,
    occurrence_state: occurrence,
    location_text: null,
    accreditation_category: null,
    priority_area: null,
    hours: null,
    attendance_state: row.attendance_state === 'attended' ? 'attended' : null,
    certificate: null,
    created_at: new Date(row.start).toISOString(),
    updated_at: new Date(row.start).toISOString(),
    talks,
    blocks: [],
    source: 'notion',
    notion_id: row.notion_id,
    knowledge_notes
  };
}

export function mergeNotionPdEvents(blobEvents, rows) {
  const taken = new Set(
    (blobEvents || [])
      .filter((event) => event?.title && event?.start)
      .map((event) => pdPlacementKey(event.title, event.start))
  );
  const ids = new Set((blobEvents || []).map(event => event.id));
  const extra = [];
  for (const row of rows || []) {
    const event = projectNotionPdEvent(row);
    if (!event) continue;
    if (ids.has(event.id)) continue;
    const key = pdPlacementKey(event.title, event.start);
    if (taken.has(key)) continue;
    taken.add(key);
    extra.push(event);
  }
  return [...(blobEvents || []), ...extra].sort((a, b) => {
    const delta = Date.parse(a.start) - Date.parse(b.start);
    if (delta) return delta;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function importedPdEventById(rows, id) {
  for (const row of rows || []) {
    const event = projectNotionPdEvent(row);
    if (event?.id === id) return event;
  }
  return null;
}
