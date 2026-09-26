import { matchPerson, normaliseName } from './people.mjs';

const meetingTypes = new Set(['staff', 'staff meeting', 'staff meetings', 'faculty', 'faculty meeting', 'curriculum', 'curriculum meeting']);
const eventTypes = new Set(['pd', 'professional development']);
const channelByLabel = new Map([['in-person', 'in_person'], ['in-person meeting', 'in_person'], ['email', 'email'], ['phone', 'phone'], ['phone call', 'phone'], ['video', 'video'], ['video call', 'video'], ['text', 'message'], ['text message', 'message'], ['chat', 'message'], ['mail', 'other']]);
const normaliseLabel = (value = '') => value.trim().replace(/\s+/g, ' ').toLowerCase();
const recent = (date, today) => date && (Date.parse(`${today}T00:00:00Z`) - Date.parse(date)) <= 60 * 864e5;
const recordKind = (value) => meetingTypes.has(normaliseLabel(value)) ? 'meeting' : eventTypes.has(normaliseLabel(value)) ? 'event' : 'comm';
const promiseStatus = ({ due, date, todayKey }) => due >= todayKey || (!due && recent(date?.start, todayKey)) ? 'open' : 'dismissed';

export function buildImportPlan({ rows, people, importMap = {}, todayKey }) {
  const records = []; const peopleToCreate = []; const threads = []; const promises = []; const ambiguous = [];
  const newPeople = new Map(); const knownThreads = new Set(); const knownPromises = new Set();
  for (const row of rows) {
    if (!row.notionId || importMap.pages?.[row.notionId]) continue;
    if (!row.date?.start) { ambiguous.push({ type: 'missing_date', notionId: row.notionId }); continue; }
    const names = [...new Set([...(row.attendees ?? []).map((person) => person.name), row.studentName].filter(Boolean))];
    const personRefs = [];
    for (const name of names) {
      const result = matchPerson(name, people);
      if (result.match) personRefs.push(result.match.ref);
      else if (result.ambiguous) ambiguous.push({ type: 'person_match', notionId: row.notionId, candidates: result.ambiguous.length });
      else {
        const sourceKey = normaliseName(name); if (!sourceKey) continue;
        if (!newPeople.has(sourceKey)) { const person = { display_name: name, aliases: [], sourceKey }; newPeople.set(sourceKey, person); peopleToCreate.push(person); }
        personRefs.push(`pending:${sourceKey}`);
      }
    }
    const kind = recordKind(row.meetingType);
    records.push({ notionId: row.notionId, kind, title: row.title, subject: row.title, people: personRefs, date: row.date, channel: channelByLabel.get(normaliseLabel(row.communicationMethod)) ?? 'other', direction: /^(email|reply|message)\s+from\b/i.test(row.title) ? 'inbound' : 'outbound', blocks: row.blocks ?? [], summary: row.notes ?? '', location: row.location ?? null, event_type: kind === 'event' ? 'professional_development' : undefined });
    const isCase = /^(case|case management)$/i.test(row.meetingType ?? '');
    for (const [index, personRef] of personRefs.entries()) {
      const name = names[index] ?? row.studentName; const threadKey = `${isCase ? 'case' : 'person'}:${normaliseName(name)}`;
      if (!knownThreads.has(threadKey)) { knownThreads.add(threadKey); threads.push({ key: threadKey, kind: isCase ? 'case' : 'general', title: isCase ? `${name} · case management` : `${name} · communications`, purpose_tag: isCase ? 'case management' : 'communications', recordNotionId: row.notionId }); }
      const addPromise = (suffix, text) => {
        const source_key = `notion-comms:${row.notionId}:${suffix}:${index}`; if (knownPromises.has(source_key)) return;
        knownPromises.add(source_key); promises.push({ commNotionId: row.notionId, personRef, direction: 'you_owe', text, due: row.followUpDate ?? null, status: promiseStatus({ due: row.followUpDate, date: row.date, todayKey }), source_key });
      };
      if (row.followUpRequired) addPromise('follow-up', `Follow up: ${row.title}`);
      for (const [todoIndex, todo] of (row.todos ?? []).entries()) if (!todo.checked && todo.text?.trim()) addPromise(`todo:${todoIndex}`, todo.text.trim());
    }
  }
  return { records, peopleToCreate, threads, promises, report: { rowsRead: rows.length, records: records.length, peopleToCreate: peopleToCreate.length, ambiguous } };
}
