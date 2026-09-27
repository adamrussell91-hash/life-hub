import { markdownToBlocks } from './markdown-to-blocks.mjs';

const text = (value) => typeof value === 'string' ? value.trim() : '';
const pageId = (value) => String(value ?? '').match(/([a-f0-9]{32})(?:\?|$)/i)?.[1]?.toLowerCase() ?? null;

function relations(value, relationNames) {
  return (Array.isArray(value) ? value : []).map((url) => {
    const notionId = pageId(url);
    return notionId && relationNames[notionId] ? { notionId, name: relationNames[notionId] } : null;
  }).filter(Boolean);
}

export function normaliseLivePage({ id, properties = {}, body = '' }, relationNames = {}) {
  const start = text(properties['date:Date:start']);
  const converted = markdownToBlocks(body);
  return {
    notionId: id,
    title: text(properties['Meeting Title']) || text(properties['Meeting Name']) || 'Untitled communication',
    meetingType: text(properties['Meeting Type']) || 'Other',
    communicationMethod: text(properties['Communication Method']),
    date: start ? { start, end: text(properties['date:Date:end']) || null, allDay: Number(properties['date:Date:is_datetime']) !== 1, timeZone: 'Australia/Sydney' } : null,
    followUpDate: text(properties['date:Follow-up Date:start']).slice(0, 10) || null,
    followUpRequired: properties['Follow-up Required'] === '__YES__' || properties['Follow-up Required'] === true,
    attendees: relations(properties.Attendees, relationNames),
    studentName: text(properties['Student Name']),
    location: text(properties.Location),
    notes: text(properties['Notes and Follow Up']),
    parent: relations(properties['Parent item'], relationNames)[0] ?? null,
    todos: converted.todos,
    blocks: converted.blocks
  };
}
