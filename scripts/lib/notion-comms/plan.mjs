import { matchPerson, normaliseName } from './people.mjs';

const meetingTypes = new Set(['Staff Meetings', 'Faculty Meeting', 'Curriculum Meeting']);
const channel = { 'In-person Meeting': 'in_person', Email: 'email', 'Phone Call': 'phone', 'Video Call': 'video', 'Text Message': 'message', Chat: 'message', Mail: 'other' };
const recent = (date, today) => date && (Date.parse(`${today}T00:00:00Z`) - Date.parse(date)) <= 60 * 864e5;

export function buildImportPlan({ rows, people, importMap, todayKey }) {
  const records = [], peopleToCreate = [], threads = [], promises = [], ambiguous = [], newPeople = new Map();
  for (const row of rows) {
    if (importMap.pages?.[row.notionId]) continue;
    const kind = meetingTypes.has(row.meetingType) ? 'meeting' : row.meetingType === 'Professional Development' ? 'event' : 'comm';
    const names = [...new Set([...(row.attendees ?? []).map((person) => person.name), row.studentName].filter(Boolean))];
    const personRefs = [];
    for (const name of names) { const result = matchPerson(name, people); if (result.match) personRefs.push(result.match.ref); else if (result.ambiguous) ambiguous.push({ name, candidates: result.ambiguous.map((p) => p.display_name) }); else { const key = normaliseName(name); if (!newPeople.has(key)) { const person = { display_name: name, aliases: [] }; newPeople.set(key, person); peopleToCreate.push(person); } personRefs.push(`pending:${key}`); } }
    const record = { notionId: row.notionId, kind, title: row.title, subject: row.title, people: personRefs, date: row.date, channel: channel[row.communicationMethod] ?? 'other', direction: /^(Email|Reply|Message) from/i.test(row.title) ? 'inbound' : 'outbound', blocks: row.blocks ?? [], summary: row.notes ?? null, location: row.location ?? null, event_type: kind === 'event' ? 'professional_development' : undefined };
    records.push(record);
    if (row.meetingType === 'Case Management') { const name = row.studentName || names[0]; if (name) threads.push({ key: `case:${normaliseName(name)}`, kind: 'case', title: `${name} · case management`, purpose_tag: 'case management', recordNotionId: row.notionId }); }
    if (row.followUpRequired && personRefs[0] && (row.followUpDate || recent(row.date?.start, todayKey))) promises.push({ commNotionId: row.notionId, personRef: personRefs[0], direction: 'you_owe', text: `Follow up: ${row.title}`, due: row.followUpDate ?? null, status: row.followUpDate >= todayKey || recent(row.date?.start, todayKey) ? 'open' : 'dismissed', source_key: `notion-comms:${row.notionId}:follow-up` });
  }
  return { records, peopleToCreate, threads: [...new Map(threads.map((thread) => [thread.key, thread])).values()], promises, report: { rowsRead: rows.length, records: records.length, peopleToCreate: peopleToCreate.length, ambiguous } };
}
