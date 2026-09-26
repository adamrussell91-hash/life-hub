import { normaliseName } from './people.mjs';

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fallbackEnd = (iso) => new Date(Date.parse(iso) + 3_600_000).toISOString();

export async function applyImportPlan(plan, deps) {
  const { identityRepo, communicationRepo, meetingRepo, eventRepo, threadRepo, ledgerRepo, setMap, sleep = defaultSleep, log = () => {} } = deps;
  const refs = new Map(); const recordRefs = new Map();
  for (const person of plan.peopleToCreate) {
    const created = await identityRepo.createIdentity({ kind: 'person', input: { display_name: person.display_name, aliases: person.aliases ?? [] } });
    const sourceKey = person.sourceKey ?? normaliseName(person.display_name);
    refs.set(`pending:${sourceKey}`, created.ref); await setMap(`imports/notion-comms/people/${sourceKey}`, { ref: created.ref }); await sleep(50); log('person');
  }
  for (const record of plan.records) {
    const people = record.people.map((ref) => refs.get(ref) ?? ref).filter((ref) => !ref.startsWith('pending:'));
    const links = people.map((target_ref) => ({ target_ref, relationship_type: record.kind === 'comm' ? 'recipient' : 'attendee' }));
    const repo = record.kind === 'comm' ? communicationRepo : record.kind === 'meeting' ? meetingRepo : eventRepo;
    const start = record.date.start; const end = record.date.end ?? fallbackEnd(start);
    const created = record.kind === 'comm'
      ? await repo.createCommunication({ direction: record.direction, channel: record.channel, occurred_at: start, subject: record.subject, summary: record.summary ?? '', links })
      : record.kind === 'meeting'
        ? await repo.createMeeting({ title: record.title, scheduled_start: start, scheduled_end: end, time_zone: record.date.timeZone ?? 'Australia/Sydney', location_text: record.location ?? '', agenda: '', notes: record.summary ?? '', links })
        : await repo.createEvent({ title: record.title, event_type: record.event_type, start, end, time_zone: record.date.timeZone ?? 'Australia/Sydney', all_day: Boolean(record.date.allDay), location_text: record.location ?? '', hours: null, links });
    const entity = created.communication ?? created.meeting ?? created.event;
    const update = record.kind === 'comm' ? repo.updateCommunication : record.kind === 'meeting' ? repo.updateMeeting : repo.updateEvent;
    if (record.blocks?.length && update) await update(entity.id, { blocks: record.blocks });
    recordRefs.set(record.notionId, `${record.kind === 'comm' ? 'professional:communication' : `professional:${record.kind}`}:${entity.id}`);
    await setMap(`imports/notion-comms/pages/${record.notionId}`, { kind: record.kind, id: entity.id }); await sleep(50); log('record');
  }
  for (const thread of plan.threads) { const created = await threadRepo.createThread({ kind: thread.kind, title: thread.title, purpose_tag: thread.purpose_tag, goals: [] }); await setMap(`imports/notion-comms/threads/${thread.key}`, { id: created.id }); await sleep(50); log('thread'); }
  for (const promise of plan.promises) {
    const person_ref = refs.get(promise.personRef) ?? promise.personRef; if (!person_ref || person_ref.startsWith('pending:')) continue;
    const result = await ledgerRepo.createItem({ person_ref, direction: promise.direction, text: promise.text, sources: [], comm_ref: recordRefs.get(promise.commNotionId) ?? null, due: promise.due, author: 'adam', source_key: promise.source_key });
    if (promise.status === 'dismissed' && result.created && ledgerRepo.patchItem) await ledgerRepo.patchItem(result.item.id, { status: 'dismissed' });
    await sleep(50); log('promise');
  }
  return { createdRecords: recordRefs.size, createdPeople: refs.size };
}
