import { normaliseName } from './people.mjs';

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fallbackEnd = (iso) => new Date(Date.parse(iso) + 3_600_000).toISOString();

export async function applyImportPlan(plan, deps) {
  const { identityRepo, communicationRepo, meetingRepo, eventRepo, threadRepo, ledgerRepo, linkRepo, accessContext, setMap, sleep = defaultSleep, log = () => {} } = deps;
  const refs = new Map(); const recordRefs = new Map(plan.existingRecordRefs ?? []); const threadRefs = new Map();
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
      ? await repo.createCommunication({ direction: record.direction, channel: record.channel, occurred_at: start, subject: record.subject, summary: '', ...(record.date.end ? { scheduled_start: start, scheduled_end: record.date.end, time_zone: record.date.timeZone ?? 'Australia/Sydney' } : {}), purpose_tag: record.purpose_tag ?? null, links })
      : record.kind === 'meeting'
        ? await repo.createMeeting({ title: record.title, scheduled_start: start, scheduled_end: end, time_zone: record.date.timeZone ?? 'Australia/Sydney', location_text: record.location ?? '', agenda: '', notes: '', links })
        : await repo.createEvent({ title: record.title, event_type: record.event_type, start, end, time_zone: record.date.timeZone ?? 'Australia/Sydney', all_day: Boolean(record.date.allDay), location_text: record.location ?? '', hours: null, links });
    const entity = created.communication ?? created.meeting ?? created.event;
    const update = record.kind === 'comm' ? repo.updateCommunication : record.kind === 'meeting' ? repo.updateMeeting : repo.updateEvent;
    if ((record.blocks?.length || (record.kind === 'comm' && record.summary)) && update) await update(entity.id, { ...(record.blocks?.length ? { blocks: record.blocks } : {}), ...(record.kind === 'comm' ? { summary: record.summary ?? '' } : {}) });
    recordRefs.set(record.notionId, `${record.kind === 'comm' ? 'professional:communication' : `professional:${record.kind}`}:${entity.id}`);
    await setMap(`imports/notion-comms/pages/${record.notionId}`, { kind: record.kind, id: entity.id }); await sleep(50); log('record');
  }
  for (const thread of plan.threads) {
    if (thread.reuse) { threadRefs.set(thread.key, `professional:thread:${thread.reuse}`); continue; }
    const created = await threadRepo.createThread({ kind: thread.kind, title: thread.title, purpose_tag: thread.purpose_tag, goals: [] }); threadRefs.set(thread.key, `professional:thread:${created.id}`); await setMap(`imports/notion-comms/threads/${thread.key}`, { id: created.id }); await sleep(50); log('thread');
  }
  for (const [notionId, threadKey] of plan.recordThreadKeys ?? []) {
    const source_ref = recordRefs.get(notionId); const target_ref = threadRefs.get(threadKey);
    if (source_ref && target_ref && linkRepo) { await linkRepo.createLink({ source_ref, target_ref, relationship_type: 'in_thread' }, accessContext); await sleep(50); log('thread'); }
  }
  for (const promise of plan.promises) {
    const person_ref = refs.get(promise.personRef) ?? promise.personRef; const comm_ref = recordRefs.get(promise.commNotionId) ?? null; if (!person_ref || person_ref.startsWith('pending:') || !comm_ref) continue;
    const result = await ledgerRepo.createItem({ person_ref, direction: promise.direction, text: promise.text, sources: [{ ref: comm_ref }], comm_ref, due: promise.due, author: 'adam' });
    if (promise.status !== 'open' && result.created && ledgerRepo.patchItem) await ledgerRepo.patchItem(result.item.id, { status: promise.status });
    await sleep(50); log('promise');
  }
  return { createdRecords: plan.records.length, createdPeople: plan.peopleToCreate.length };
}
