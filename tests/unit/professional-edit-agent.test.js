import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCommunicationProposal,
  buildEventUpdateProposal,
  buildMeetingUpdateProposal,
  createProfessionalEditWriteExecutor,
  runSearchProfessional
} from '../../netlify/functions/_shared/professional-edit-agent.mjs';
import { createProfessionalWriteExecutor } from '../../netlify/functions/_shared/professional-write-executor.mjs';
import { createMeetingRepository } from '../../netlify/functions/_shared/meeting-repository.mjs';
import { createEventRepository } from '../../netlify/functions/_shared/event-repository.mjs';
import { buildPeopleProposal } from '../../netlify/functions/_shared/people-agent.mjs';
import {
  buildAgentTools,
  capabilityIdsForAgent,
  isPathAllowedForAgent,
  resetCapabilityCaches
} from '../../netlify/functions/_shared/capabilities/registry.mjs';
import {
  classifyWriteTarget,
  validateProposeActionInput
} from '../../netlify/functions/_shared/capabilities/propose-action.mjs';

function memoryStore() {
  const map = new Map();
  return {
    async get(key, { type } = {}) {
      if (!map.has(key)) return null;
      const raw = map.get(key);
      return type === 'json' ? structuredClone(raw) : raw;
    },
    async setJSON(key, value) {
      map.set(key, structuredClone(value));
    },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) };
    },
    _map: map
  };
}

function fakeLinks() {
  const created = [];
  return {
    created,
    getUniversalLinkStore: async () => memoryStore(),
    createUniversalLinkRepository: () => ({
      async createLink(input) {
        created.push(input);
        return { link: { id: `link_${created.length}`, ...input } };
      }
    })
  };
}

async function seed(store) {
  const { meeting } = await createMeetingRepository({ store, env: {} }).createMeeting({
    title: 'HSC Meeting — Rohan',
    scheduled_start: '2026-10-02T02:30:00.000Z',
    scheduled_end: '2026-10-02T03:15:00.000Z',
    time_zone: 'Australia/Sydney'
  });
  const { event } = await createEventRepository({ store, env: {} }).createEvent({
    title: 'Mod C PD',
    event_type: 'professional_development',
    start: '2026-10-02T05:00:00.000Z',
    end: '2026-10-02T06:00:00.000Z',
    time_zone: 'Australia/Sydney'
  });
  return { meeting, event };
}

test('Clare, Hammond and Ann get the Professional edit tools and communication paths', () => {
  resetCapabilityCaches();
  for (const slug of ['clare', 'hammond', 'ann']) {
    const ids = capabilityIdsForAgent(slug);
    for (const id of [
      'professional.search',
      'professional.propose-meeting-update',
      'professional.propose-event-update',
      'professional.propose-communication'
    ]) assert.ok(ids.includes(id), `${slug} ${id}`);
    const names = buildAgentTools({ slug }).map(tool => tool.name);
    for (const name of ['search_professional', 'propose_meeting_update', 'propose_event_update', 'propose_communication']) {
      assert.ok(names.includes(name), `${slug} ${name}`);
    }
    assert.equal(isPathAllowedForAgent(slug, 'professional:communication:new-x', { mode: 'write' }), true, slug);
  }
  assert.equal(classifyWriteTarget('professional:communication:new-x').kind, 'communication');
});

test('meeting update proposal passes the Confirm allowlist and fills in, reschedules, closes', async () => {
  const store = memoryStore();
  const { meeting } = await seed(store);
  const built = buildMeetingUpdateProposal({
    summary: 'Fill in Rohan meeting',
    meeting_id: meeting.id,
    agenda: 'Mod C draft feedback',
    notes: 'Rohan to redraft intro',
    add_decisions: ['Resubmit by Friday'],
    add_attendee_refs: ['shared:person:person_rohan']
  });
  assert.equal(built.ok, true);
  assert.equal(validateProposeActionInput(built.proposal, { agentSlug: 'clare' }).ok, true);

  const links = fakeLinks();
  const executor = createProfessionalWriteExecutor({ store, env: {}, resolveEntity: async () => null });
  // The combined executor routes overwrite → edit executor; inject fake links for attendees.
  const edit = createProfessionalEditWriteExecutor({ store, env: {}, resolveEntity: async () => null, ...links });
  const write = built.proposal.writes[0];
  const applied = await edit.apply(write, classifyWriteTarget(write.path));
  assert.equal(applied.ok, true, JSON.stringify(applied));
  const after = await createMeetingRepository({ store, env: {} }).getMeeting(meeting.id);
  assert.equal(after.agenda, 'Mod C draft feedback');
  assert.equal(after.notes, 'Rohan to redraft intro');
  assert.deepEqual(after.decisions.map(d => d.text), ['Resubmit by Friday']);
  assert.deepEqual(links.created, [{
    source_ref: `professional:meeting:${meeting.id}`,
    target_ref: 'shared:person:person_rohan',
    relationship_type: 'attendee'
  }]);

  const moved = buildMeetingUpdateProposal({
    summary: 'Move it',
    meeting_id: meeting.id,
    scheduled_start: '2026-10-03T12:30',
    scheduled_end: '2026-10-03T13:15'
  });
  const movedWrite = moved.proposal.writes[0];
  assert.equal((await executor.apply(movedWrite, classifyWriteTarget(movedWrite.path))).ok, true);
  const closed = buildMeetingUpdateProposal({ summary: 'Done', meeting_id: meeting.id, state: 'completed' });
  const closedWrite = closed.proposal.writes[0];
  assert.equal((await executor.apply(closedWrite, classifyWriteTarget(closedWrite.path))).ok, true);
  const final = await createMeetingRepository({ store, env: {} }).getMeeting(meeting.id);
  assert.equal(final.state, 'completed');
  assert.equal(final.scheduled_start, '2026-10-03T02:30:00.000Z');
  assert.equal(final.decisions.length, 1);
});

test('meeting update rejects a bad id and an empty edit', () => {
  assert.equal(buildMeetingUpdateProposal({ summary: 'x', meeting_id: 'nope', notes: 'a' }).error, 'invalid_meeting_id');
  assert.equal(
    buildMeetingUpdateProposal({ summary: 'x', meeting_id: 'meeting_00000000-0000-4000-8000-000000000000' }).error,
    'no_changes'
  );
});

test('event update fills in PD hours, attendance and certificate through the real repository', async () => {
  const store = memoryStore();
  const { event } = await seed(store);
  const built = buildEventUpdateProposal({
    summary: 'Log Mod C PD',
    event_id: event.id,
    hours: 1.5,
    attendance_state: 'attended',
    accreditation_category: 'NESA Accredited',
    certificate: { name: 'Mod C certificate', issued_at: '2026-10-02', reference: 'PD-123' },
    state: 'completed'
  });
  assert.equal(built.ok, true);
  assert.equal(validateProposeActionInput(built.proposal, { agentSlug: 'clare' }).ok, true);
  const executor = createProfessionalWriteExecutor({ store, env: {}, resolveEntity: async () => null });
  const write = built.proposal.writes[0];
  const applied = await executor.apply(write, classifyWriteTarget(write.path));
  assert.equal(applied.ok, true, JSON.stringify(applied));
  const after = await createEventRepository({ store, env: {} }).getEvent(event.id);
  assert.equal(after.hours, 1.5);
  assert.equal(after.attendance_state, 'attended');
  assert.equal(after.occurrence_state, 'completed');
  assert.equal(after.certificate.reference, 'PD-123');
});

test('communication create and edit round-trip through Confirm', async () => {
  const store = memoryStore();
  const created = buildCommunicationProposal({
    summary_line: 'Book HSC prep call with George',
    direction: 'outbound',
    channel: 'video',
    scheduled_start: '2026-10-02T17:10',
    scheduled_end: '2026-10-02T17:40',
    subject: 'HSC Prep Call — George Pagidis'
  });
  assert.equal(created.ok, true, JSON.stringify(created));
  assert.equal(validateProposeActionInput(created.proposal, { agentSlug: 'clare' }).ok, true);
  const executor = createProfessionalWriteExecutor({ store, env: {}, resolveEntity: async () => null });
  const write = created.proposal.writes[0];
  const applied = await executor.apply(write, classifyWriteTarget(write.path));
  assert.equal(applied.ok, true, JSON.stringify(applied));

  const found = await runSearchProfessional({ query: 'george', kinds: ['communication'] }, { store, env: {} });
  assert.equal(found.count, 1);
  const id = found.results[0].id;

  const edited = buildCommunicationProposal({ summary_line: 'Notes', communication_id: id, summary: 'Went through Mod C essay plan' });
  const editWrite = edited.proposal.writes[0];
  assert.equal((await executor.apply(editWrite, classifyWriteTarget(editWrite.path))).ok, true);
  const again = await runSearchProfessional({ query: 'george' }, { store, env: {} });
  assert.equal(again.results[0].id, id);
});

test('search_professional finds meetings and events by text and date', async () => {
  const store = memoryStore();
  const { meeting, event } = await seed(store);
  const all = await runSearchProfessional({ from: '2026-10-02', to: '2026-10-02' }, { store, env: {} });
  assert.deepEqual(new Set(all.results.map(r => r.id)), new Set([meeting.id, event.id]));
  const rohan = await runSearchProfessional({ query: 'rohan' }, { store, env: {} });
  assert.deepEqual(rohan.results.map(r => r.id), [meeting.id]);
});

test('propose_people_changes role_to_adam files a new person as a student', async () => {
  const built = await buildPeopleProposal({
    summary: 'Add Cooper Katrib as a student',
    add_people: [{ key: 'cooper', display_name: 'Cooper Katrib', role_to_adam: 'student' }]
  }, { nameForRef: async () => null, selfRef: async () => 'shared:person:person_self' });
  assert.equal(built.ok, true, JSON.stringify(built));
  const [person, link] = built.proposal.writes;
  assert.equal(person.path, 'people:person:new-cooper');
  assert.equal(link.path, 'people:link:new-role-1');
  assert.deepEqual(JSON.parse(link.content), {
    source_ref: 'shared:person:person_self',
    target_ref: 'people:person:new-cooper',
    relationship_type: 'professional_relationship',
    role: 'student'
  });
  assert.equal(validateProposeActionInput(built.proposal, { agentSlug: 'clare' }).ok, true);
});

test('role_to_adam on an existing person needs no other field, and fails clearly without a self person', async () => {
  const nameForRef = async () => 'Cooper Katrib';
  const ref = 'shared:person:person_cooper';
  const ok = await buildPeopleProposal({
    summary: 'Cooper is a student',
    update_people: [{ ref, role_to_adam: 'student' }]
  }, { nameForRef, selfRef: async () => 'shared:person:person_self' });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.deepEqual(ok.proposal.writes.map(w => w.path), ['people:link:new-role-1']);

  const noSelf = await buildPeopleProposal({
    summary: 'Cooper is a student',
    update_people: [{ ref, role_to_adam: 'student' }]
  }, { nameForRef, selfRef: async () => null });
  assert.equal(noSelf.error, 'no_self_person');
});
