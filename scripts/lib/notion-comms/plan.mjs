import { wallLocalToUtcIso } from '../../../netlify/functions/_shared/wall-time.mjs';
import { matchPerson, normaliseName } from './people.mjs';

const meetingTypes = new Set(['staff', 'staff meeting', 'staff meetings', 'faculty', 'faculty meeting', 'curriculum', 'curriculum meeting']);
const eventTypes = new Set(['pd', 'professional development']);
const channelByLabel = new Map([['in-person', 'in_person'], ['in-person meeting', 'in_person'], ['email', 'email'], ['phone', 'phone'], ['phone call', 'phone'], ['video', 'video'], ['video call', 'video'], ['text', 'message'], ['text message', 'message'], ['chat', 'message'], ['mail', 'other']]);
const normaliseLabel = (value = '') => value.trim().replace(/\s+/g, ' ').toLowerCase();
const recent = (date, today) => date && (Date.parse(`${today}T00:00:00Z`) - Date.parse(date)) <= 60 * 864e5;
const recordKind = (value) => meetingTypes.has(normaliseLabel(value)) ? 'meeting' : eventTypes.has(normaliseLabel(value)) ? 'event' : 'comm';
const promiseStatus = ({ due, date, todayKey }) => due >= todayKey || (!due && recent(date?.start, todayKey)) ? 'open' : 'dismissed';
const actionHeading = /action items|next steps|follow[- ]?up|to ?do|commitments/i;

function effectiveDate(date, kind) {
  if (!date?.allDay) return date;
  const start = wallLocalToUtcIso(`${date.start}T09:00`, 'Australia/Sydney');
  return { ...date, start, end: kind === 'meeting' || kind === 'event' ? wallLocalToUtcIso(`${date.start}T10:00`, 'Australia/Sydney') : null, allDay: false };
}

function threadRoot(row, byId) {
  let root = row; const seen = new Set();
  while (root?.parent?.notionId && !seen.has(root.notionId)) { seen.add(root.notionId); const parent = byId.get(root.parent.notionId); if (!parent) break; root = parent; }
  return root;
}

function promiseOwner(text, people) {
  const first = people.find((person) => text.trim().toLowerCase().startsWith(`${person.name.split(/\s+/)[0].toLowerCase()} `));
  if (first || /^(student to|they\b)/i.test(text.trim())) return { direction: 'they_owe', personRef: first?.ref ?? people[0]?.ref ?? null };
  return { direction: 'you_owe', personRef: people[0]?.ref ?? null };
}

export function buildImportPlan({ rows, people, importMap = {}, todayKey }) {
  const records = []; const peopleToCreate = []; const promises = []; const ambiguous = []; const candidates = []; const newPeople = new Map();
  const existingRecordRefs = new Map();
  for (const row of rows) {
    if (!row.notionId || !row.date?.start) { if (row.notionId) ambiguous.push({ type: 'missing_date', notionId: row.notionId }); continue; }
    const personEntries = [];
    for (const name of [...new Set([...(row.attendees ?? []).map((person) => person.name), row.studentName].filter(Boolean))]) {
      const mapped = importMap.people?.[normaliseName(name)]?.ref; const result = mapped ? { match: { ref: mapped } } : matchPerson(name, people);
      if (result.match) personEntries.push({ name, ref: result.match.ref });
      else if (result.ambiguous) ambiguous.push({ type: 'person_match', notionId: row.notionId, name, candidates: result.ambiguous.map((person) => person.display_name) });
      else { const sourceKey = normaliseName(name); if (!newPeople.has(sourceKey)) { const person = { display_name: name, aliases: [], sourceKey }; newPeople.set(sourceKey, person); peopleToCreate.push(person); } personEntries.push({ name, ref: `pending:${sourceKey}` }); }
    }
    const kind = recordKind(row.meetingType); const mapped = importMap.pages?.[row.notionId] ?? null;
    candidates.push({ ...row, kind, mapped, people: personEntries, date: effectiveDate(row.date, kind) });
    if (mapped?.id) existingRecordRefs.set(row.notionId, `professional:${mapped.kind === 'comm' ? 'communication' : mapped.kind}:${mapped.id}`);
  }
  const byId = new Map(candidates.map((row) => [row.notionId, row])); const definitions = new Map(); const recordThreadKeys = new Map();
  const define = (key, value) => { if (!definitions.has(key)) definitions.set(key, { key, ...value, reuse: importMap.threads?.[key]?.id ?? null }); };
  for (const row of candidates.filter((item) => /^(case|case management)$/i.test(item.meetingType ?? ''))) { const name = row.studentName || row.people[0]?.name; if (!name) continue; const key = `case:${normaliseName(name)}`; define(key, { kind: 'case', title: `${name} · case management`, purpose_tag: 'case management' }); recordThreadKeys.set(row.notionId, key); }
  for (const row of candidates.filter((item) => item.parent?.notionId)) { const root = threadRoot(row, byId); const name = root.studentName || root.people[0]?.name; const caseKey = name ? `case:${normaliseName(name)}` : null; const key = caseKey && definitions.has(caseKey) ? caseKey : `chain:${root.notionId}`; if (key.startsWith('chain:')) define(key, { kind: 'general', title: root.title, purpose_tag: normaliseLabel(root.meetingType) === 'other' ? null : normaliseLabel(root.meetingType) }); recordThreadKeys.set(root.notionId, key); recordThreadKeys.set(row.notionId, key); }
  const pairs = new Map();
  for (const row of candidates) { if (recordThreadKeys.has(row.notionId) || normaliseLabel(row.meetingType) === 'other' || !row.people[0]) continue; const key = `pair:${normaliseName(row.people[0].name)}:${normaliseLabel(row.meetingType)}`; const group = pairs.get(key) ?? []; group.push(row); pairs.set(key, group); }
  for (const [key, group] of pairs) if (group.length >= 2) { define(key, { kind: 'general', title: `${group[0].people[0].name} · ${normaliseLabel(group[0].meetingType)}`, purpose_tag: normaliseLabel(group[0].meetingType) }); for (const row of group) recordThreadKeys.set(row.notionId, key); }
  for (const row of candidates) {
    const blocks = [...(row.blocks ?? [])];
    if (row.location) blocks.splice(1, 0, { id: `notion_${blocks.length}`, block_type: 'rich_text', variant: 'medium', content: { html: `<p>Location: ${row.location.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>` } });
    if (!row.mapped) records.push({ notionId: row.notionId, kind: row.kind, title: row.title, subject: row.title, people: row.people.map((person) => person.ref), date: row.date, channel: channelByLabel.get(normaliseLabel(row.communicationMethod)) ?? 'other', direction: /^(email|reply|message)\s+from\b/i.test(row.title) ? 'inbound' : 'outbound', blocks, summary: row.notes ?? '', location: row.location ?? null, purpose_tag: normaliseLabel(row.meetingType) === 'other' ? null : normaliseLabel(row.meetingType), event_type: row.kind === 'event' ? 'professional_development' : undefined });
    for (const [index, todo] of (row.todos ?? []).entries()) { if (!actionHeading.test(todo.heading ?? '')) continue; const owner = promiseOwner(todo.text, row.people); if (!owner.personRef) continue; promises.push({ commNotionId: row.notionId, personRef: owner.personRef, direction: owner.direction, text: todo.text.trim(), due: null, status: todo.checked ? 'done' : recent(row.date.start, todayKey) ? 'open' : 'dismissed', source_key: `notion-comms:${row.notionId}:todo:${index}` }); }
    if (row.followUpRequired && row.people[0]?.ref && (row.followUpDate || recent(row.date.start, todayKey))) promises.push({ commNotionId: row.notionId, personRef: row.people[0].ref, direction: 'you_owe', text: `Follow up: ${row.title}`, due: row.followUpDate ?? null, status: promiseStatus({ due: row.followUpDate, date: row.date, todayKey }), source_key: `notion-comms:${row.notionId}:follow-up` });
  }
  return { records, peopleToCreate, threads: [...definitions.values()], recordThreadKeys, existingRecordRefs, promises, report: { rowsRead: rows.length, records: records.length, peopleToCreate: peopleToCreate.length, ambiguous, alreadyImported: existingRecordRefs.size } };
}
