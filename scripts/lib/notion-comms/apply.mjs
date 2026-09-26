const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function applyImportPlan(plan, deps) {
  const { identityRepo, communicationRepo, meetingRepo, eventRepo, threadRepo, ledgerRepo, setMap, sleep = defaultSleep, log = () => {} } = deps;
  const refs = new Map();
  for (const person of plan.peopleToCreate) { const created = await identityRepo.createIdentity({ kind: 'person', input: person }); refs.set(`pending:${person.display_name.toLowerCase()}`, created.ref); await setMap(`imports/notion-comms/people/${person.display_name.toLowerCase()}`, { ref: created.ref }); await sleep(50); }
  const recordRefs = new Map();
  for (const record of plan.records) {
    const people = record.people.map((ref) => refs.get(ref) ?? ref).filter((ref) => !ref.startsWith('pending:'));
    const links = people.map((target_ref) => ({ target_ref, relationship_type: record.kind === 'comm' ? 'recipient' : 'attendee' }));
    const repo = record.kind === 'comm' ? communicationRepo : record.kind === 'meeting' ? meetingRepo : eventRepo;
    const date = record.date?.start ?? new Date().toISOString();
    const created = record.kind === 'comm' ? await repo.createCommunication({ direction: record.direction, channel: record.channel, occurred_at: date, subject: record.subject, summary: record.summary ?? '', links }) : record.kind === 'meeting' ? await repo.createMeeting({ title: record.title, scheduled_start: date, scheduled_end: record.date?.end ?? new Date(Date.parse(date) + 3600000).toISOString(), time_zone: 'Australia/Sydney', location_text: record.location ?? '', agenda: '', notes: '', links }) : await repo.createEvent({ title: record.title, event_type: record.event_type, start: date, end: record.date?.end ?? new Date(Date.parse(date) + 3600000).toISOString(), time_zone: 'Australia/Sydney', all_day: false, location_text: record.location ?? '', hours: null, links });
    const entity = created.communication ?? created.meeting ?? created.event; const id = entity.id; recordRefs.set(record.notionId, `${record.kind === 'comm' ? 'professional:communication' : `professional:${record.kind}`}:${id}`); await setMap(`imports/notion-comms/pages/${record.notionId}`, { kind: record.kind, id }); await sleep(50); log('record');
  }
  for (const thread of plan.threads) { const created = await threadRepo.createThread({ kind: thread.kind, title: thread.title, purpose_tag: thread.purpose_tag, goals: [] }); await setMap(`imports/notion-comms/threads/${thread.key}`, { id: created.id }); await sleep(50); }
  for (const promise of plan.promises) { const person_ref = refs.get(promise.personRef) ?? promise.personRef; if (!person_ref || person_ref.startsWith('pending:')) continue; await ledgerRepo.createItem({ person_ref, direction: promise.direction, text: promise.text, sources: [], comm_ref: recordRefs.get(promise.commNotionId) ?? null, due: promise.due, author: 'adam', status: promise.status, source_key: promise.source_key }); await sleep(50); }
  return { createdRecords: recordRefs.size, createdPeople: refs.size };
}
